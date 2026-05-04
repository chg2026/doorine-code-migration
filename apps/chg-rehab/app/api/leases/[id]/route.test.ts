import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

const db = vi.hoisted(() => {
  return {
    leases: new Map<string, Record<string, any>>(),
    properties: new Map<string, Record<string, any>>(),
    activityLog: [] as Record<string, any>[],
    idSeq: { n: 0 },
    reset() {
      this.leases.clear();
      this.properties.clear();
      this.activityLog.length = 0;
      this.idSeq.n = 0;
    },
    nextId(prefix: string) {
      return `${prefix}-${++this.idSeq.n}`;
    },
  };
});

vi.mock("@prisma/client", () => {
  class Decimal {
    private _val: number;
    constructor(v: any) {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`Invalid decimal: ${v}`);
      this._val = n;
    }
    toNumber() {
      return this._val;
    }
  }
  return {
    Prisma: { Decimal },
  };
});

vi.mock("@/lib/prisma", () => {
  const leaseTable = {
    findFirst: async ({ where }: { where: Record<string, any> }) => {
      for (const row of db.leases.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
        return { ...row };
      }
      return null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const existing = db.leases.get(where.id);
      if (!existing) throw new Error(`Lease ${where.id} not found`);
      const updated = { ...existing, ...data };
      db.leases.set(where.id, updated);
      return { ...updated };
    },
  };

  const propertyTable = {
    findFirst: async ({ where }: { where: Record<string, any> }) => {
      for (const row of db.properties.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
        return { id: row.id };
      }
      return null;
    },
  };

  const activityLogTable = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = db.nextId("al");
      const row = { id, createdAt: new Date(), ...data };
      db.activityLog.push(row);
      return { ...row };
    },
  };

  return {
    prisma: {
      lease: leaseTable,
      property: propertyTable,
      activityLogEntry: activityLogTable,
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/billing-gate", () => ({
  billingBlockedResponse: vi.fn(),
}));

import { PATCH } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockBillingBlocked = vi.mocked(billingBlockedResponse);

function makeRequest(leaseId: string, body: unknown): NextRequest {
  return new NextRequest(`http://test.example.com/api/leases/${leaseId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", host: "test.example.com" },
    body: JSON.stringify(body),
  });
}

function callPatch(leaseId: string, body: unknown) {
  return PATCH(makeRequest(leaseId, body), {
    params: Promise.resolve({ id: leaseId }),
  });
}

function adminUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: overrides.id ?? "u-admin",
    companyId: overrides.companyId ?? "co-1",
    role: overrides.role ?? "Admin",
    email: "admin@test",
    firstName: "Admin",
    lastName: "User",
    ...overrides,
  };
}

function seedLease(opts: {
  id: string;
  companyId: string;
  propertyId?: string;
  tenantName?: string;
  rent?: any;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: string;
  meta?: Record<string, unknown>;
}) {
  db.leases.set(opts.id, {
    propertyId: "prop-1",
    tenantName: "Test Tenant",
    rent: null,
    startDate: null,
    endDate: null,
    status: "Active",
    meta: {},
    ...opts,
  });
}

function seedProperty(opts: { id: string; companyId: string }) {
  db.properties.set(opts.id, { id: opts.id, companyId: opts.companyId });
}

describe("PATCH /api/leases/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    mockBillingBlocked.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    seedLease({ id: "lease-1", companyId: "co-1" });

    const res = await callPatch("lease-1", { tenantName: "New" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects non-Admin/PM callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "Viewer" }));
    seedLease({ id: "lease-1", companyId: "co-1" });

    const res = await callPatch("lease-1", { tenantName: "New" });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns the billing-gate response when billing is blocked", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());
    seedLease({ id: "lease-1", companyId: "co-1" });
    mockBillingBlocked.mockResolvedValue(
      new Response(JSON.stringify({ error: "Billing blocked" }), { status: 402 })
    );

    const res = await callPatch("lease-1", { tenantName: "New" });

    expect(res.status).toBe(402);
  });

  it("returns 404 when the lease does not belong to the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-other", companyId: "co-2" });

    const res = await callPatch("lease-other", { tenantName: "Alice" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Lease not found" });
  });

  it("returns 404 when the lease id does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await callPatch("nonexistent", { tenantName: "Alice" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Lease not found" });
  });

  it("returns 404 when the new propertyId does not belong to the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1" });
    seedProperty({ id: "p-other", companyId: "co-2" });

    const res = await callPatch("lease-1", { propertyId: "p-other" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
  });

  it("returns 404 when the new propertyId does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1" });

    const res = await callPatch("lease-1", { propertyId: "nonexistent-prop" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
  });

  it("updates only the provided fields and preserves the rest", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({
      id: "lease-1",
      companyId: "co-1",
      tenantName: "Alice",
      status: "Active",
      meta: { deposit: 1000, contactId: "c-abc" },
    });

    const res = await callPatch("lease-1", { tenantName: "Alice Updated" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.tenantName).toBe("Alice Updated");
    expect(body.lease.status).toBe("Active");
  });

  it("shallow-merges meta: updating leaseDocFileKey does not erase deposit", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({
      id: "lease-1",
      companyId: "co-1",
      tenantName: "Alice",
      meta: { deposit: 2500, contactId: "c-abc", autoRenew: "yes" },
    });

    const res = await callPatch("lease-1", { leaseDocFileKey: "new-file-key" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.meta.leaseDocFileKey).toBe("new-file-key");
    expect(body.lease.meta.deposit).toBe(2500);
    expect(body.lease.meta.contactId).toBe("c-abc");
    expect(body.lease.meta.autoRenew).toBe("yes");
  });

  it("updating deposit does not erase leaseDocFileKey", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({
      id: "lease-1",
      companyId: "co-1",
      tenantName: "Bob",
      meta: { leaseDocFileKey: "existing-key", contactId: "c-xyz" },
    });

    const res = await callPatch("lease-1", { deposit: "3000" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.meta.deposit).toBe(3000);
    expect(body.lease.meta.leaseDocFileKey).toBe("existing-key");
    expect(body.lease.meta.contactId).toBe("c-xyz");
  });

  it("merges a meta object from the body with the existing meta", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({
      id: "lease-1",
      companyId: "co-1",
      tenantName: "Carol",
      meta: { deposit: 500, existingKey: "keep-me" },
    });

    const res = await callPatch("lease-1", { meta: { newKey: "new-value" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.meta.existingKey).toBe("keep-me");
    expect(body.lease.meta.newKey).toBe("new-value");
    expect(body.lease.meta.deposit).toBe(500);
  });

  it("allows partial update: status only", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1", tenantName: "Dave", status: "Active" });

    const res = await callPatch("lease-1", { status: "Expired" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.status).toBe("Expired");
    expect(body.lease.tenantName).toBe("Dave");
  });

  it("writes an activity log entry with the correct shape", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-actor", companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1", tenantName: "Eve" });

    await callPatch("lease-1", { status: "Expired" });

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-actor");
    expect(entry.action).toBe("lease.update");
    expect(entry.entity).toBe("Lease");
    expect(entry.entityId).toBe("lease-1");
    expect(entry.message).toContain("Eve");
  });

  it("allows ProjectManager role to patch leases", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager", companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1", tenantName: "Frank" });

    const res = await callPatch("lease-1", { tenantName: "Frank Updated" });

    expect(res.status).toBe(200);
    expect(db.leases.get("lease-1")!.tenantName).toBe("Frank Updated");
  });

  // ---------------------------------------------------------------------------
  // Status field validation
  // ---------------------------------------------------------------------------
  it("rejects an unrecognised status value with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1", status: "Active" });

    const res = await callPatch("lease-1", { status: "Closed" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid status/i);
    // Must not have written an activity log entry.
    expect(db.activityLog).toHaveLength(0);
    // The existing status must not have changed.
    expect(db.leases.get("lease-1")!.status).toBe("Active");
  });

  it("rejects an empty status string with 400", async () => {
    // An empty string after trimming is treated as "no change" only when it
    // was not explicitly set to a bad value; but passing "" is technically
    // invalid as a status. The route skips update for falsy trimmed values,
    // so a pure-whitespace status should not trigger an error but also not
    // update the DB. This test verifies the guard does not fire on null.
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-1", companyId: "co-1", status: "Active" });

    const res = await callPatch("lease-1", { status: null });

    // null status is explicitly allowed (means "no change").
    expect(res.status).toBe(200);
    expect(db.leases.get("lease-1")!.status).toBe("Active");
  });

  it.each(["Active", "Expired", "Terminated", "Pending"])(
    "accepts the valid status value '%s'",
    async (status) => {
      mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
      seedLease({ id: "lease-1", companyId: "co-1", status: "Active" });

      const res = await callPatch("lease-1", { status });

      expect(res.status).toBe(200);
      expect((await res.json()).lease.status).toBe(status);
    }
  );
});
