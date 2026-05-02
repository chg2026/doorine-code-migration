import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// In-memory tables shared between the prisma mock and test assertions.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => {
  return {
    users: new Map<string, Record<string, any>>(),
    invites: new Map<string, Record<string, any>>(),
    activityLog: [] as Record<string, any>[],
    reset() {
      this.users.clear();
      this.invites.clear();
      this.activityLog.length = 0;
    },
  };
});

let activityIdSeq = vi.hoisted(() => ({ n: 0 }));

vi.mock("@/lib/prisma", () => {
  const userTable = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.users.get(where.id);
      return row ? { ...row } : null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, any>;
    }) => {
      const existing = db.users.get(where.id);
      if (!existing) throw new Error(`user ${where.id} not found`);
      const updated = { ...existing, ...data };
      db.users.set(where.id, updated);
      return { ...updated };
    },
    count: async ({ where }: { where: Record<string, any> }) => {
      let n = 0;
      for (const row of db.users.values()) {
        if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
        if (where.active !== undefined && row.active !== where.active) continue;
        n += 1;
      }
      return n;
    },
  };

  const inviteTable = {
    count: async ({ where }: { where: Record<string, any> }) => {
      let n = 0;
      for (const row of db.invites.values()) {
        if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
        if (where.status !== undefined && row.status !== where.status) continue;
        n += 1;
      }
      return n;
    },
  };

  const activityLogTable = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = `al-${++activityIdSeq.n}`;
      const row = { id, createdAt: new Date(), ...data };
      db.activityLog.push(row);
      return { ...row };
    },
  };

  // The reactivate route uses tx.$executeRaw for the advisory lock — just
  // resolve immediately in tests.
  const tx = {
    $executeRaw: async (_strings: TemplateStringsArray, ..._values: any[]) => 0,
    user: userTable,
    invite: inviteTable,
    activityLogEntry: activityLogTable,
  };

  return {
    prisma: {
      user: userTable,
      invite: inviteTable,
      activityLogEntry: activityLogTable,
      $transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

const syncSeatQuantityMock = vi.hoisted(() => vi.fn(async () => true));
const loadOrCreateSubscriptionMock = vi.hoisted(() =>
  vi.fn(async () => ({ seatLimit: 10, plan: "pro" }))
);
vi.mock("@/lib/stripe", () => ({
  syncSeatQuantity: syncSeatQuantityMock,
  loadOrCreateSubscription: loadOrCreateSubscriptionMock,
}));

const billingBlockedResponseMock = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/billing-gate", () => ({
  billingBlockedResponse: billingBlockedResponseMock,
}));

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://test.example.com/api/admin/users/x/reactivate", {
    method: "POST",
    headers: { "content-type": "application/json", host: "test.example.com" },
    body: JSON.stringify(body),
  });
}

function callPost(id: string, body: Record<string, unknown> = {}) {
  return POST(makeRequest(body), { params: Promise.resolve({ id }) });
}

function adminUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: overrides.id ?? "u-admin",
    companyId: overrides.companyId ?? "co-1",
    role: overrides.role ?? "Admin",
    email: overrides.email ?? "admin@test",
    firstName: "Admin",
    lastName: "User",
  };
}

function seedUser(opts: {
  id: string;
  companyId: string;
  role: string;
  email?: string | null;
  active?: boolean;
  firstName?: string;
  lastName?: string;
  deactivatedAt?: Date | null;
}) {
  db.users.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    role: opts.role,
    email: opts.email !== undefined ? opts.email : `${opts.id}@test`,
    firstName: opts.firstName ?? "First",
    lastName: opts.lastName ?? "Last",
    active: opts.active ?? true,
    deactivatedAt: opts.deactivatedAt ?? null,
  });
}

function seedInvite(opts: { id: string; companyId: string; status: string }) {
  db.invites.set(opts.id, { ...opts });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/admin/users/[id]/reactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    activityIdSeq.n = 0;
    // Default: billing OK, generous seat cap, seat sync succeeds.
    billingBlockedResponseMock.mockResolvedValue(null);
    loadOrCreateSubscriptionMock.mockResolvedValue({ seatLimit: 10, plan: "pro" });
    syncSeatQuantityMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth / role guards
  // -------------------------------------------------------------------------
  it("rejects unauthenticated callers with 401 and never mutates the target", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callPost("u-target");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.users.get("u-target")!.active).toBe(false);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers with 403 and never mutates the target", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-pm", companyId: "co-1", role: "ProjectManager" })
    );

    const res = await callPost("u-target");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(db.users.get("u-target")!.active).toBe(false);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Billing gate
  // -------------------------------------------------------------------------
  it("returns 402 billing_blocked when the company has a billing problem", async () => {
    const { NextResponse } = await import("next/server");
    billingBlockedResponseMock.mockResolvedValue(
      NextResponse.json(
        { error: "billing problem", code: "billing_blocked" },
        { status: 402 }
      )
    );
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await callPost("u-target");

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("billing_blocked");
    expect(db.users.get("u-target")!.active).toBe(false);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Tenancy / existence guards
  // -------------------------------------------------------------------------
  it("returns 404 for a user in another company (no cross-tenant reactivation)", async () => {
    seedUser({ id: "u-other", companyId: "co-2", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await callPost("u-other");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(db.users.get("u-other")!.active).toBe(false);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user id", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await callPost("u-nonexistent");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Already-active no-op
  // -------------------------------------------------------------------------
  it("returns 200 alreadyActive without writing a log when the user is already active", async () => {
    seedUser({ id: "u-active", companyId: "co-1", role: "ProjectManager", active: true });
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await callPost("u-active");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alreadyActive: true });
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it("reactivates an inactive user: sets active=true, clears deactivatedAt, restores role, writes log, syncs seats", async () => {
    seedUser({
      id: "u-target",
      companyId: "co-1",
      role: "ProjectManager",
      active: false,
      email: null,
      firstName: "Jane",
      lastName: "Doe",
      deactivatedAt: new Date("2024-01-01"),
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));

    const res = await callPost("u-target");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toMatchObject({
      id: "u-target",
      role: "ProjectManager",
    });

    const row = db.users.get("u-target")!;
    expect(row.active).toBe(true);
    expect(row.deactivatedAt).toBeNull();
    expect(row.role).toBe("ProjectManager");
    // email must remain null after reactivation (cleared on soft-delete, not restored)
    expect(row.email).toBeNull();
    expect(body.user.email).toBeNull();

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-admin");
    expect(entry.action).toBe("user_reactivated");
    expect(entry.entity).toBe("User");
    expect(entry.entityId).toBe("u-target");
    expect(entry.message).toContain("Jane Doe");
    expect(entry.meta).toMatchObject({
      role: "ProjectManager",
      previousRole: "ProjectManager",
      roleChanged: false,
    });

    expect(syncSeatQuantityMock).toHaveBeenCalledTimes(1);
    expect(syncSeatQuantityMock).toHaveBeenCalledWith("co-1");
  });

  it("allows admin to override the role during reactivation", async () => {
    seedUser({
      id: "u-target",
      companyId: "co-1",
      role: "ProjectManager",
      active: false,
      email: null,
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));

    const res = await callPost("u-target", { role: "Inspector" });

    expect(res.status).toBe(200);
    const row = db.users.get("u-target")!;
    expect(row.role).toBe("Inspector");

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.meta).toMatchObject({
      role: "Inspector",
      previousRole: "ProjectManager",
      roleChanged: true,
    });
  });

  it("returns 400 for an invalid role value in the request body", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await callPost("u-target", { role: "SuperHero" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: /invalid role/i });
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Seat-limit gate
  // -------------------------------------------------------------------------
  it("returns 402 seat_limit_reached when active users + pending invites fill the cap", async () => {
    // Seat cap = 2; one active user + one pending invite = 2 → no room for +1.
    loadOrCreateSubscriptionMock.mockResolvedValue({ seatLimit: 2, plan: "starter" });

    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin", active: true });
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    seedInvite({ id: "inv-1", companyId: "co-1", status: "Pending" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));

    const res = await callPost("u-target");

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("seat_limit_reached");
    expect(body.seatLimit).toBe(2);
    expect(body.plan).toBe("starter");

    expect(db.users.get("u-target")!.active).toBe(false);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("succeeds when active + pending invites exactly equals the cap minus one (edge case)", async () => {
    // Seat cap = 3; one active user + one pending invite = 2 → room for +1.
    loadOrCreateSubscriptionMock.mockResolvedValue({ seatLimit: 3, plan: "pro" });

    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin", active: true });
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    seedInvite({ id: "inv-1", companyId: "co-1", status: "Pending" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));

    const res = await callPost("u-target");

    expect(res.status).toBe(200);
    expect(db.users.get("u-target")!.active).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Best-effort syncSeatQuantity
  // -------------------------------------------------------------------------
  it("does not roll back the reactivation when syncSeatQuantity fails", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager", active: false });
    mockGetCurrentUser.mockResolvedValue(adminUser());
    syncSeatQuantityMock.mockRejectedValueOnce(new Error("stripe down"));

    const res = await callPost("u-target");

    expect(res.status).toBe(200);
    expect(db.users.get("u-target")!.active).toBe(true);
    expect(db.activityLog).toHaveLength(1);
    // Let the rejected void promise settle so it does not bleed noise into
    // other tests.
    await new Promise((r) => setImmediate(r));
  });

  // -------------------------------------------------------------------------
  // Race condition: two concurrent reactivations for the same user
  // -------------------------------------------------------------------------
  it("returns alreadyActive (no-op) when the user is already active at pre-transaction check — simulates one admin winning the race", async () => {
    // When two admins hit reactivate at the same millisecond, one wins the
    // advisory lock first and flips active=true. The other then reads the
    // user as already active and returns the no-op response. We simulate
    // the losing side: the user is already active when our route reads it.
    seedUser({ id: "u-race-win", companyId: "co-1", role: "Admin", active: true });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-racer", companyId: "co-1" }));

    const res = await callPost("u-race-win");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyActive).toBe(true);
    // The loser must not write an activity log entry or sync seats.
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("second admin to reactivate two different users hits the seat cap after the first succeeds", async () => {
    // Seat cap = 2; one active admin + one inactive user A + one inactive user B.
    // Admin 1 reactivates user A → 2 active (at cap). Admin 2 then tries to
    // reactivate user B → seat_limit_reached.
    loadOrCreateSubscriptionMock.mockResolvedValue({ seatLimit: 2, plan: "starter" });

    seedUser({ id: "u-admin-a", companyId: "co-1", role: "Admin", active: true });
    seedUser({ id: "u-user-a", companyId: "co-1", role: "ProjectManager", active: false });
    seedUser({ id: "u-user-b", companyId: "co-1", role: "Inspector", active: false });

    // Admin 1 reactivates user A — succeeds (1 active → 2 active = at cap).
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-a", companyId: "co-1" }));
    const res1 = await callPost("u-user-a");
    expect(res1.status).toBe(200);
    expect(db.users.get("u-user-a")!.active).toBe(true);

    // Admin 2 immediately tries to reactivate user B — seat cap blocks it.
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-a", companyId: "co-1" }));
    const res2 = await callPost("u-user-b");
    expect(res2.status).toBe(402);
    const body2 = await res2.json();
    expect(body2.code).toBe("seat_limit_reached");
    expect(body2.seatLimit).toBe(2);

    // User B must remain inactive.
    expect(db.users.get("u-user-b")!.active).toBe(false);
  });
});
