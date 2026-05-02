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
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = db.nextId("l");
      const row = { id, createdAt: new Date(), ...data };
      db.leases.set(id, row);
      return { ...row };
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

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockBillingBlocked = vi.mocked(billingBlockedResponse);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://test.example.com/api/leases", {
    method: "POST",
    headers: { "content-type": "application/json", host: "test.example.com" },
    body: JSON.stringify(body),
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

function seedProperty(opts: { id: string; companyId: string }) {
  db.properties.set(opts.id, { id: opts.id, companyId: opts.companyId });
}

describe("POST /api/leases", () => {
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

    const res = await POST(makeRequest({ propertyId: "p-1", tenantName: "Alice" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.leases.size).toBe(0);
  });

  it("rejects non-Admin/PM callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "Viewer" }));

    const res = await POST(makeRequest({ propertyId: "p-1", tenantName: "Alice" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(db.leases.size).toBe(0);
  });

  it("returns the billing-gate response when billing is blocked", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());
    mockBillingBlocked.mockResolvedValue(
      new Response(JSON.stringify({ error: "Billing blocked" }), { status: 402 })
    );

    const res = await POST(makeRequest({ propertyId: "p-1", tenantName: "Alice" }));

    expect(res.status).toBe(402);
    expect(db.leases.size).toBe(0);
  });

  it("rejects missing propertyId with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ tenantName: "Alice" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "propertyId is required" });
    expect(db.leases.size).toBe(0);
  });

  it("rejects missing tenantName with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ propertyId: "p-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "tenantName is required" });
    expect(db.leases.size).toBe(0);
  });

  it("returns 404 when property does not belong to the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedProperty({ id: "p-other", companyId: "co-2" });

    const res = await POST(makeRequest({ propertyId: "p-other", tenantName: "Alice" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
    expect(db.leases.size).toBe(0);
  });

  it("returns 404 when property does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({ propertyId: "nonexistent", tenantName: "Alice" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
    expect(db.leases.size).toBe(0);
  });

  it("creates a lease with default Active status and persists meta fields", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    const res = await POST(
      makeRequest({
        propertyId: "p-1",
        tenantName: "Alice",
        rent: "1500",
        startDate: "2026-01-01",
        endDate: "2027-01-01",
        deposit: "3000",
        leaseDocFileKey: "file-key-abc",
        autoRenew: "yes",
        contactId: "c-123",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lease.tenantName).toBe("Alice");
    expect(body.lease.propertyId).toBe("p-1");
    expect(body.lease.status).toBe("Active");
    expect(body.lease.meta.contactId).toBe("c-123");
    expect(body.lease.meta.deposit).toBe(3000);
    expect(body.lease.meta.leaseDocFileKey).toBe("file-key-abc");
    expect(body.lease.meta.autoRenew).toBe("yes");
  });

  it("uses the provided status instead of defaulting to Active", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    const res = await POST(
      makeRequest({ propertyId: "p-1", tenantName: "Bob", status: "Pending" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lease.status).toBe("Pending");
  });

  it("writes an activity log entry with the correct shape", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-actor", companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    await POST(makeRequest({ propertyId: "p-1", tenantName: "Carol" }));

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-actor");
    expect(entry.action).toBe("lease.create");
    expect(entry.entity).toBe("Lease");
    expect(entry.message).toContain("Carol");
  });

  it("allows ProjectManager role to create leases", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager", companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    const res = await POST(makeRequest({ propertyId: "p-1", tenantName: "Dan" }));

    expect(res.status).toBe(200);
    expect(db.leases.size).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Status field validation
  // ---------------------------------------------------------------------------
  it("rejects an unrecognised status value with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    const res = await POST(
      makeRequest({ propertyId: "p-1", tenantName: "Eve", status: "Ended" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid status/i);
    expect(db.leases.size).toBe(0);
  });

  it.each(["Active", "Expired", "Terminated", "Pending"])(
    "accepts the valid status value '%s'",
    async (status) => {
      mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
      seedProperty({ id: "p-1", companyId: "co-1" });
      db.reset();
      db.properties.set("p-1", { id: "p-1", companyId: "co-1" });

      const res = await POST(
        makeRequest({ propertyId: "p-1", tenantName: "Valid", status })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.lease.status).toBe(status);
    }
  );

  it("defaults to Active when status is omitted from the body", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedProperty({ id: "p-1", companyId: "co-1" });

    const res = await POST(makeRequest({ propertyId: "p-1", tenantName: "Frank" }));

    expect(res.status).toBe(200);
    expect((await res.json()).lease.status).toBe("Active");
  });
});
