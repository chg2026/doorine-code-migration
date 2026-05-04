import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

// In-memory tables shared between the prisma mock and the test assertions.
// Hoisted so the vi.mock factory below (which runs before the test body) can
// reach it.
const db = vi.hoisted(() => {
  return {
    users: new Map<string, Record<string, any>>(),
    projectAssignments: new Map<string, Record<string, any>>(),
    activityLog: [] as Record<string, any>[],
    reset() {
      this.users.clear();
      this.projectAssignments.clear();
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
    update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
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
        if (where.role !== undefined && row.role !== where.role) continue;
        if (where.active !== undefined && row.active !== where.active) continue;
        if (where.id && typeof where.id === "object") {
          if (where.id.not !== undefined && row.id === where.id.not) continue;
        }
        n += 1;
      }
      return n;
    },
  };

  const projectAssignmentTable = {
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      let count = 0;
      for (const [id, row] of db.projectAssignments.entries()) {
        if (row.userId === where.userId) {
          db.projectAssignments.delete(id);
          count += 1;
        }
      }
      return { count };
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

  // Minimal $transaction: invoke the callback with a tx client that exposes
  // the same tables. Errors propagate; this matches Prisma's interactive
  // transaction shape closely enough for the route's needs.
  const tx = {
    user: userTable,
    projectAssignment: projectAssignmentTable,
    activityLogEntry: activityLogTable,
  };

  return {
    prisma: {
      user: userTable,
      projectAssignment: projectAssignmentTable,
      activityLogEntry: activityLogTable,
      $transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

const syncSeatQuantityMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/stripe", () => ({
  syncSeatQuantity: syncSeatQuantityMock,
}));

import { DELETE, PATCH } from "./route";
import { getCurrentUser } from "@/lib/auth";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeRequest(): NextRequest {
  return new NextRequest("http://test.example.com/api/admin/users/x", {
    method: "DELETE",
    headers: { host: "test.example.com" },
  });
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://test.example.com/api/admin/users/x", {
    method: "PATCH",
    headers: { host: "test.example.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callDelete(id: string) {
  return DELETE(makeRequest(), { params: Promise.resolve({ id }) });
}

function callPatch(id: string, body: Record<string, unknown>) {
  return PATCH(makePatchRequest(body), { params: Promise.resolve({ id }) });
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
}) {
  db.users.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    role: opts.role,
    email: opts.email ?? `${opts.id}@test`,
    firstName: opts.firstName ?? "First",
    lastName: opts.lastName ?? "Last",
    active: opts.active ?? true,
    deactivatedAt: null,
  });
}

function seedAssignment(opts: { id: string; projectId: string; userId: string; role: string }) {
  db.projectAssignments.set(opts.id, { ...opts });
}

describe("DELETE /api/admin/users/[id] (remove teammate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    activityIdSeq.n = 0;
    syncSeatQuantityMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401 and never mutates the target", async () => {
    seedUser({ id: "u-victim", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callDelete("u-victim");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    const row = db.users.get("u-victim")!;
    expect(row.active).toBe(true);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin actors with 403 and never mutates the target", async () => {
    seedUser({ id: "u-victim", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-pm", companyId: "co-1", role: "ProjectManager" }),
    );

    const res = await callDelete("u-victim");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    const row = db.users.get("u-victim")!;
    expect(row.active).toBe(true);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("blocks self-removal with 400 even when other admins exist", async () => {
    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-admin-2", companyId: "co-1", role: "Admin" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callDelete("u-admin");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/can't remove yourself/i);
    const row = db.users.get("u-admin")!;
    expect(row.active).toBe(true);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target belongs to another company (no cross-tenant removals)", async () => {
    seedUser({ id: "u-other", companyId: "co-2", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callDelete("u-other");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    const row = db.users.get("u-other")!;
    expect(row.active).toBe(true);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target id does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callDelete("u-nonexistent");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("blocks removing the last active admin with 400 (inactive admin rows do not count)", async () => {
    // Target is the only *active* admin in the company. There is an old
    // removed admin row lying around (active=false) and an admin in a
    // different company — neither should satisfy the "other active admin"
    // guard. The actor is also Admin but their DB row has been flipped
    // inactive (e.g. mid-flight removal by a peer), simulating the exact
    // bug the guard's `active: true` filter exists to catch.
    seedUser({ id: "u-admin-target", companyId: "co-1", role: "Admin" });
    seedUser({
      id: "u-admin-old",
      companyId: "co-1",
      role: "Admin",
      active: false,
      email: null,
    });
    seedUser({ id: "u-admin-other-co", companyId: "co-2", role: "Admin" });
    seedUser({
      id: "u-admin-actor",
      companyId: "co-1",
      role: "Admin",
      active: false,
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-actor", companyId: "co-1" }),
    );

    const res = await callDelete("u-admin-target");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/last admin/i);
    const row = db.users.get("u-admin-target")!;
    expect(row.active).toBe(true);
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("allows removing an admin when at least one other active admin remains", async () => {
    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-admin-2", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-admin-target", companyId: "co-1", role: "Admin" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callDelete("u-admin-target");

    expect(res.status).toBe(200);
    const row = db.users.get("u-admin-target")!;
    expect(row.active).toBe(false);
    expect(row.email).toBeNull();
  });

  it("soft-removes a teammate: flips active, clears email, deletes assignments, writes log, syncs seats", async () => {
    seedUser({
      id: "u-victim",
      companyId: "co-1",
      role: "ProjectManager",
      email: "victim@test",
      firstName: "Vic",
      lastName: "Tim",
    });
    // Same-company project assignments — should be removed.
    seedAssignment({ id: "pa-1", projectId: "p-1", userId: "u-victim", role: "PM" });
    seedAssignment({ id: "pa-2", projectId: "p-2", userId: "u-victim", role: "PM" });
    // Unrelated assignment — must NOT be touched.
    seedAssignment({ id: "pa-other", projectId: "p-1", userId: "u-other", role: "PM" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const before = Date.now();
    const res = await callDelete("u-victim");
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = db.users.get("u-victim")!;
    expect(row.active).toBe(false);
    expect(row.email).toBeNull();
    expect(row.deactivatedAt).toBeInstanceOf(Date);
    expect((row.deactivatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((row.deactivatedAt as Date).getTime()).toBeLessThanOrEqual(after);

    // Victim's project assignments are gone; the unrelated one survives.
    const remainingForVictim = [...db.projectAssignments.values()].filter(
      (a) => a.userId === "u-victim",
    );
    expect(remainingForVictim).toHaveLength(0);
    expect(db.projectAssignments.has("pa-other")).toBe(true);

    // Activity log entry written with the right shape.
    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-admin");
    expect(entry.action).toBe("user_removed");
    expect(entry.entity).toBe("User");
    expect(entry.entityId).toBe("u-victim");
    expect(entry.message).toContain("Vic Tim");
    expect(entry.meta).toMatchObject({
      email: "victim@test",
      role: "ProjectManager",
      previousRole: "ProjectManager",
    });

    // Best-effort seat sync fired with the actor's company id.
    expect(syncSeatQuantityMock).toHaveBeenCalledTimes(1);
    expect(syncSeatQuantityMock).toHaveBeenCalledWith("co-1");
  });

  it("treats a re-removal of an already inactive user as a no-op (200) and does not log again", async () => {
    seedUser({
      id: "u-gone",
      companyId: "co-1",
      role: "ProjectManager",
      active: false,
      email: null,
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callDelete("u-gone");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyInactive: true });
    expect(db.activityLog).toHaveLength(0);
    expect(syncSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("does not roll back the removal when syncSeatQuantity fails (best-effort)", async () => {
    seedUser({ id: "u-victim", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );
    syncSeatQuantityMock.mockRejectedValueOnce(new Error("stripe down"));

    const res = await callDelete("u-victim");

    expect(res.status).toBe(200);
    const row = db.users.get("u-victim")!;
    expect(row.active).toBe(false);
    expect(db.activityLog).toHaveLength(1);
    // Let the rejected promise settle so unhandled-rejection noise doesn't
    // bleed into other tests.
    await new Promise((r) => setImmediate(r));
  });
});

describe("PATCH /api/admin/users/[id] (change teammate role)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    activityIdSeq.n = 0;
    syncSeatQuantityMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 and makes no changes when the caller is unauthenticated", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callPatch("u-target", { role: "Inspector" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.users.get("u-target")!.role).toBe("ProjectManager");
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 403 and makes no changes when the caller is not an Admin", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-pm", companyId: "co-1", role: "ProjectManager" }),
    );

    const res = await callPatch("u-target", { role: "Inspector" });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(db.users.get("u-target")!.role).toBe("ProjectManager");
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 400 when the supplied role is not a recognised assignable role", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", { role: "SuperUser" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid role" });
    expect(db.users.get("u-target")!.role).toBe("ProjectManager");
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 400 when no role field is present in the body", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", {});

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid role" });
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 404 when the target belongs to a different company (cross-tenant block)", async () => {
    seedUser({ id: "u-other", companyId: "co-2", role: "ProjectManager" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-other", { role: "Inspector" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(db.users.get("u-other")!.role).toBe("ProjectManager");
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 404 when the target id does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-nonexistent", { role: "Inspector" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    expect(db.activityLog).toHaveLength(0);
  });

  it("returns 200 with unchanged:true and writes no log when the role is already set", async () => {
    seedUser({ id: "u-target", companyId: "co-1", role: "Inspector" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", { role: "Inspector" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unchanged: true });
    expect(db.users.get("u-target")!.role).toBe("Inspector");
    expect(db.activityLog).toHaveLength(0);
  });

  it("blocks demoting the last active admin (self-demotion) with 400", async () => {
    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-admin", { role: "Inspector" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only admin/i);
    expect(db.users.get("u-admin")!.role).toBe("Admin");
    expect(db.activityLog).toHaveLength(0);
  });

  it("blocks demoting another user who is the last active admin with 400", async () => {
    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-admin-target", companyId: "co-1", role: "Admin" });
    // The actor demotes themselves out of the count first so only one remains,
    // then tries to demote u-admin-target — re-seed actor as inactive to force
    // u-admin-target to be the sole active admin.
    db.users.set("u-admin", { ...db.users.get("u-admin")!, active: false });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-admin-target", { role: "Inspector" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/last admin/i);
    expect(db.users.get("u-admin-target")!.role).toBe("Admin");
    expect(db.activityLog).toHaveLength(0);
  });

  it("inactive admin rows are not counted when evaluating the last-active-admin guard", async () => {
    // u-admin-target is the ONLY active admin.
    // u-admin-old is an inactive (removed) admin — must NOT satisfy the guard.
    seedUser({ id: "u-admin-target", companyId: "co-1", role: "Admin", active: true });
    seedUser({ id: "u-admin-old", companyId: "co-1", role: "Admin", active: false, email: null });
    seedUser({ id: "u-admin-other-co", companyId: "co-2", role: "Admin", active: true });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-actor", companyId: "co-1" }),
    );

    const res = await callPatch("u-admin-target", { role: "ProjectManager" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/last admin/i);
    expect(db.users.get("u-admin-target")!.role).toBe("Admin");
    expect(db.activityLog).toHaveLength(0);
  });

  it("happy path: updates the role, writes a user_role_changed log entry, returns previousRole + role", async () => {
    seedUser({
      id: "u-target",
      companyId: "co-1",
      role: "ProjectManager",
      email: "target@test",
      firstName: "Jane",
      lastName: "Doe",
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", { role: "Inspector" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      previousRole: "ProjectManager",
      role: "Inspector",
    });

    expect(db.users.get("u-target")!.role).toBe("Inspector");

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-admin");
    expect(entry.action).toBe("user_role_changed");
    expect(entry.entity).toBe("User");
    expect(entry.entityId).toBe("u-target");
    expect(entry.message).toContain("Jane Doe");
    expect(entry.meta).toMatchObject({
      from: "ProjectManager",
      to: "Inspector",
      email: "target@test",
    });
  });

  it("allows demoting an admin when at least one other active admin remains", async () => {
    seedUser({ id: "u-admin", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-admin-2", companyId: "co-1", role: "Admin" });
    seedUser({ id: "u-target", companyId: "co-1", role: "Admin" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", { role: "Inspector" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previousRole).toBe("Admin");
    expect(body.role).toBe("Inspector");
    expect(db.users.get("u-target")!.role).toBe("Inspector");
    expect(db.activityLog).toHaveLength(1);
    expect(db.activityLog[0].action).toBe("user_role_changed");
  });

  it("promotes a non-admin to Admin and writes the activity log correctly", async () => {
    seedUser({
      id: "u-target",
      companyId: "co-1",
      role: "Subcontractor",
      email: "sub@test",
      firstName: "Bob",
      lastName: "Builder",
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-target", { role: "Admin" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      previousRole: "Subcontractor",
      role: "Admin",
    });
    expect(db.users.get("u-target")!.role).toBe("Admin");
    expect(db.activityLog[0].meta).toMatchObject({
      from: "Subcontractor",
      to: "Admin",
    });
  });

  // ---------------------------------------------------------------------------
  // Deactivated-user role guard
  // ---------------------------------------------------------------------------
  it("returns 400 when attempting to change the role of a deactivated (soft-removed) teammate", async () => {
    // Soft-deleted users have active=false. Role changes targeting them must
    // be rejected so admins cannot accidentally promote a removed teammate.
    seedUser({
      id: "u-deactivated",
      companyId: "co-1",
      role: "Inspector",
      active: false,
      email: null,
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-deactivated", { role: "Admin" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/deactivated/i);

    // Role and activity log must be unchanged.
    expect(db.users.get("u-deactivated")!.role).toBe("Inspector");
    expect(db.activityLog).toHaveLength(0);
  });

  it("allows role change for an active user (confirms deactivated guard is not too broad)", async () => {
    seedUser({ id: "u-active", companyId: "co-1", role: "Inspector", active: true });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin", companyId: "co-1" }),
    );

    const res = await callPatch("u-active", { role: "Subcontractor" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.users.get("u-active")!.role).toBe("Subcontractor");
  });
});
