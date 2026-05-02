import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory user table shared between the prisma mock and assertions.
const db = vi.hoisted(() => {
  return {
    users: new Map<string, Record<string, any>>(),
    companies: new Map<string, Record<string, any>>(),
    invites: new Map<string, Record<string, any>>(),
    activityLog: [] as Record<string, any>[],
    reset() {
      this.users.clear();
      this.companies.clear();
      this.invites.clear();
      this.activityLog.length = 0;
    },
  };
});

const idSeq = vi.hoisted(() => ({ company: 0, activity: 0 }));

vi.mock("@/lib/prisma", () => {
  const userTable = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.users.get(where.id);
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Record<string, any> }) => {
      const row: Record<string, any> = {
        active: true,
        deactivatedAt: null,
        firstName: null,
        lastName: null,
        email: null,
        profileImageUrl: null,
        ...data,
      };
      db.users.set(row.id, row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const existing = db.users.get(where.id);
      if (!existing) throw new Error(`user ${where.id} not found`);
      const updated = { ...existing, ...data };
      db.users.set(where.id, updated);
      return { ...updated };
    },
  };
  const companyTable = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = `co-${++idSeq.company}`;
      const row = { id, name: data.name };
      db.companies.set(id, row);
      return { ...row };
    },
  };
  const inviteTable = {
    findUnique: async ({ where }: { where: { token?: string; id?: string } }) => {
      for (const row of db.invites.values()) {
        if (where.token && row.token === where.token) return { ...row };
        if (where.id && row.id === where.id) return { ...row };
      }
      return null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const existing = db.invites.get(where.id);
      if (!existing) throw new Error(`invite ${where.id} not found`);
      const updated = { ...existing, ...data };
      db.invites.set(where.id, updated);
      return { ...updated };
    },
  };
  const activityLogTable = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = `al-${++idSeq.activity}`;
      const row = { id, createdAt: new Date(), ...data };
      db.activityLog.push(row);
      return { ...row };
    },
  };
  const tx = {
    user: userTable,
    company: companyTable,
    invite: inviteTable,
    activityLogEntry: activityLogTable,
  };
  return {
    prisma: {
      user: userTable,
      company: companyTable,
      invite: inviteTable,
      activityLogEntry: activityLogTable,
      $transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

// Stub iron-session: getCurrentUser reads the session via getIronSession,
// so we hand back a controllable in-memory session object.
const sessionState = vi.hoisted(() => ({
  user: undefined as Record<string, any> | undefined,
  saveCalls: 0,
}));
vi.mock("iron-session", () => ({
  getIronSession: async () => ({
    get user() {
      return sessionState.user;
    },
    set user(v: Record<string, any> | undefined) {
      sessionState.user = v;
    },
    save: async () => {
      sessionState.saveCalls += 1;
    },
  }),
}));

// next/headers is a server-only module; in jsdom we just need cookies() to
// return something that has toString().
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "" }),
}));

// openid-client makes network calls during discovery on import — never let
// it actually run. The auth functions under test (getCurrentUser,
// upsertUserFromClaims) don't touch the OIDC client directly.
vi.mock("openid-client", () => ({
  discovery: async () => ({}),
}));

import { getCurrentUser, upsertUserFromClaims } from "@/lib/auth";

beforeEach(() => {
  db.reset();
  idSeq.company = 0;
  idSeq.activity = 0;
  sessionState.user = undefined;
  sessionState.saveCalls = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null and clears the session when the cookie has no user", async () => {
    sessionState.user = undefined;

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(sessionState.saveCalls).toBe(0);
  });

  it("returns null when the session points at a user that no longer exists", async () => {
    sessionState.user = {
      id: "u-missing",
      companyId: "co-1",
      role: "Admin",
      email: "ghost@test",
    };

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(sessionState.user).toBeUndefined();
    expect(sessionState.saveCalls).toBe(1);
  });

  it("returns null and wipes the session when the user has been deactivated", async () => {
    db.users.set("u-removed", {
      id: "u-removed",
      companyId: "co-1",
      role: "Admin",
      email: null,
      firstName: "Removed",
      lastName: "User",
      profileImageUrl: null,
      active: false,
      deactivatedAt: new Date("2026-04-01T00:00:00Z"),
    });
    sessionState.user = {
      id: "u-removed",
      companyId: "co-1",
      role: "Admin",
      email: "removed@test",
      firstName: "Removed",
      lastName: "User",
      profileImageUrl: null,
    };

    const result = await getCurrentUser();

    expect(result).toBeNull();
    // Session must be cleared so the next request behaves as logged-out and
    // no cached client state survives.
    expect(sessionState.user).toBeUndefined();
    expect(sessionState.saveCalls).toBe(1);
  });

  it("returns the fresh user (and refreshes the session) when role drift is detected", async () => {
    db.users.set("u-active", {
      id: "u-active",
      companyId: "co-1",
      role: "Admin",
      email: "admin@test",
      firstName: "Adam",
      lastName: "Min",
      profileImageUrl: null,
      active: true,
      deactivatedAt: null,
    });
    sessionState.user = {
      id: "u-active",
      companyId: "co-1",
      role: "ProjectManager", // stale role in the cookie
      email: "admin@test",
      firstName: "Adam",
      lastName: "Min",
      profileImageUrl: null,
    };

    const result = await getCurrentUser();

    expect(result).not.toBeNull();
    expect(result!.role).toBe("Admin");
    // Session was updated to match the DB, not just returned.
    expect(sessionState.user?.role).toBe("Admin");
    expect(sessionState.saveCalls).toBe(1);
  });
});

describe("upsertUserFromClaims", () => {
  it("throws 'user_deactivated' when an inactive user tries to log back in", async () => {
    db.users.set("u-removed", {
      id: "u-removed",
      companyId: "co-1",
      role: "Admin",
      email: null,
      firstName: "Removed",
      lastName: "User",
      profileImageUrl: null,
      active: false,
      deactivatedAt: new Date("2026-04-01T00:00:00Z"),
    });

    await expect(
      upsertUserFromClaims({
        sub: "u-removed",
        email: "removed@test",
        first_name: "Removed",
        last_name: "User",
      }),
    ).rejects.toThrow("user_deactivated");

    // The row must NOT have been silently reactivated by a re-login attempt.
    const row = db.users.get("u-removed")!;
    expect(row.active).toBe(false);
    expect(row.email).toBeNull();
  });

  it("updates an existing active user's claim-driven fields and returns a SessionUser", async () => {
    db.users.set("u-active", {
      id: "u-active",
      companyId: "co-1",
      role: "Admin",
      email: "old@test",
      firstName: "Old",
      lastName: "Name",
      profileImageUrl: null,
      active: true,
      deactivatedAt: null,
    });

    const result = await upsertUserFromClaims({
      sub: "u-active",
      email: "new@test",
      first_name: "New",
      last_name: "Name",
      profile_image_url: "https://img/avatar.png",
    });

    expect(result.id).toBe("u-active");
    expect(result.email).toBe("new@test");
    expect(result.firstName).toBe("New");
    expect(result.profileImageUrl).toBe("https://img/avatar.png");
    expect(result.role).toBe("Admin");
    // companyId is preserved (existing users can't be moved between companies).
    expect(result.companyId).toBe("co-1");
  });
});
