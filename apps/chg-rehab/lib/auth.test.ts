import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Supabase shadow-sync `getCurrentUser()` flow.
 *
 * The auth helper has three branches we care about:
 *   1. No Supabase session → null.
 *   2. Supabase session, deactivated Prisma User → null.
 *   3. Supabase session, fresh user → on-the-fly Company + User upsert.
 */

const db = vi.hoisted(() => ({
  users: new Map<string, Record<string, any>>(),
  companies: new Map<string, Record<string, any>>(),
  invites: new Map<string, Record<string, any>>(),
  reset() {
    this.users.clear();
    this.companies.clear();
    this.invites.clear();
  },
}));

vi.mock("@/lib/prisma", () => {
  const userTable = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      db.users.has(where.id) ? { ...db.users.get(where.id)! } : null,
    create: async ({ data }: { data: Record<string, any> }) => {
      const row = { active: true, ...data };
      db.users.set(row.id, row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const row = { ...db.users.get(where.id)!, ...data };
      db.users.set(where.id, row);
      return { ...row };
    },
  };
  const companyTable = {
    upsert: async ({ where, create }: { where: { id: string }; create: Record<string, any> }) => {
      const row = { id: where.id, name: create.name };
      db.companies.set(row.id, row);
      return { ...row };
    },
  };
  const inviteTable = {
    findUnique: async () => null,
    update: async () => ({}),
  };
  const tx = {
    user: userTable,
    company: companyTable,
    invite: inviteTable,
    activityLogEntry: { create: async () => ({}) },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

const supaState = vi.hoisted(() => ({
  authUser: null as { id: string; email?: string; phone?: string } | null,
  profile: null as Record<string, any> | null,
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: supaState.authUser }, error: null }),
    },
  }),
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: supaState.profile, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("iron-session", () => ({
  getIronSession: async () => ({
    pendingInviteToken: undefined,
    save: async () => undefined,
  }),
}));

vi.mock("next/headers", () => {
  const fakeHeaders = new Headers();
  return {
    cookies: async () => ({ toString: () => "", getAll: () => [] }),
    headers: async () => new Headers(fakeHeaders),
  };
});

import { getCurrentUser } from "@/lib/auth";

beforeEach(() => {
  db.reset();
  supaState.authUser = null;
  supaState.profile = null;
});
afterEach(() => vi.clearAllMocks());

describe("getCurrentUser (Supabase shadow-sync)", () => {
  it("returns null when no Supabase session is present", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when the synced Prisma user has been deactivated", async () => {
    supaState.authUser = { id: "u-removed", email: "removed@test" };
    db.users.set("u-removed", {
      id: "u-removed",
      companyId: "co-1",
      role: "Admin",
      email: "removed@test",
      firstName: "R",
      lastName: "U",
      profileImageUrl: null,
      active: false,
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("creates Company + User from the user_profile on first sign-in", async () => {
    supaState.authUser = { id: "u-new", email: "new@test" };
    supaState.profile = {
      id: "u-new",
      email: "new@test",
      full_name: "New User",
      avatar_url: null,
      phone: null,
      account_id: "acc-1",
      is_super_admin: false,
      is_account_admin: true,
      status: "active",
      accounts: { id: "acc-1", name: "Acme Co" },
    };

    const result = await getCurrentUser();

    expect(result).not.toBeNull();
    expect(result!.id).toBe("u-new");
    expect(result!.companyId).toBe("acc-1");
    expect(result!.role).toBe("Admin"); // is_account_admin → Admin
    expect(result!.email).toBe("new@test");
    expect(db.companies.get("acc-1")?.name).toBe("Acme Co");
  });

  it("returns the existing user without re-upserting on subsequent logins", async () => {
    supaState.authUser = { id: "u-existing", email: "stable@test" };
    supaState.profile = {
      id: "u-existing",
      email: "stable@test",
      full_name: "Stable User",
      avatar_url: null,
      status: "active",
    };
    db.users.set("u-existing", {
      id: "u-existing",
      companyId: "acc-7",
      role: "ProjectManager",
      email: "stable@test",
      firstName: "Stable",
      lastName: "User",
      profileImageUrl: null,
      active: true,
    });

    const result = await getCurrentUser();
    expect(result!.role).toBe("ProjectManager");
    // Role is intentionally not re-derived from is_account_admin on
    // subsequent logins — chg-rehab admins manage roles locally.
    expect(db.companies.size).toBe(0);
  });
});
