import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

const db = vi.hoisted(() => {
  return {
    contacts: new Map<string, Record<string, any>>(),
    leases: new Map<string, Record<string, any>>(),
    properties: new Map<string, Record<string, any>>(),
    activityLog: [] as Record<string, any>[],
    idSeq: { n: 0 },
    reset() {
      this.contacts.clear();
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
    ContactType: { Tenant: "Tenant" },
    Prisma: { Decimal, InputJsonValue: undefined },
  };
});

vi.mock("@/lib/prisma", () => {
  const txClient = {
    get contact() { return contactTable; },
    get lease() { return leaseTable; },
    get activityLogEntry() { return activityLogTable; },
  };

  const contactTable = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = db.nextId("c");
      const row = { id, createdAt: new Date(), ...data };
      db.contacts.set(id, row);
      return { ...row };
    },
  };

  const leaseTable = {
    findFirst: async ({ where }: { where: Record<string, any> }) => {
      for (const row of db.leases.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.companyId !== undefined && row.companyId !== where.companyId) continue;
        return { ...row };
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = db.nextId("l");
      const row = { id, createdAt: new Date(), ...data };
      db.leases.set(id, row);
      return { ...row };
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
      contact: contactTable,
      lease: leaseTable,
      property: propertyTable,
      activityLogEntry: activityLogTable,
      $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
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
  return new NextRequest("http://test.example.com/api/contacts", {
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

function seedLease(opts: {
  id: string;
  companyId: string;
  propertyId?: string;
  tenantName?: string;
  meta?: Record<string, unknown>;
  rent?: any;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: string;
}) {
  db.leases.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    propertyId: opts.propertyId ?? "prop-1",
    tenantName: opts.tenantName ?? "Old Tenant",
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

describe("POST /api/contacts", () => {
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

    const res = await POST(makeRequest({ name: "Alice", type: "Tenant" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.contacts.size).toBe(0);
    expect(db.activityLog).toHaveLength(0);
  });

  it("rejects non-Admin/PM callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "Viewer" }));

    const res = await POST(makeRequest({ name: "Alice", type: "Tenant" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(db.contacts.size).toBe(0);
  });

  it("returns the billing-gate response when billing is blocked", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());
    const blockedRes = new Response(JSON.stringify({ error: "Billing blocked" }), {
      status: 402,
    });
    mockBillingBlocked.mockResolvedValue(blockedRes);

    const res = await POST(makeRequest({ name: "Alice", type: "Tenant" }));

    expect(res.status).toBe(402);
    expect(db.contacts.size).toBe(0);
  });

  it("rejects non-Tenant contact types with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ name: "Vendor", type: "Vendor" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Tenant/);
    expect(db.contacts.size).toBe(0);
  });

  it("rejects missing name with 400", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ type: "Tenant" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Name is required" });
    expect(db.contacts.size).toBe(0);
  });

  it("creates a tenant contact with no lease when lease field is omitted", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));

    const res = await POST(makeRequest({ name: "Alice", type: "Tenant", email: "alice@example.com" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.contact.name).toBe("Alice");
    expect(body.contact.email).toBe("alice@example.com");
    expect(body.lease).toBeNull();
    expect(db.contacts.size).toBe(1);
    expect(db.leases.size).toBe(0);
    expect(db.activityLog).toHaveLength(1);
    expect(db.activityLog[0].action).toBe("contact.create");
    expect(db.activityLog[0].message).toContain("Alice");
    expect(db.activityLog[0].message).not.toContain("lease");
  });

  it("also accepts ProjectManager role", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await POST(makeRequest({ name: "Bob", type: "Tenant" }));

    expect(res.status).toBe(200);
    expect(db.contacts.size).toBe(1);
  });

  it("links an existing lease (leaseId mode): updates tenantName and sets meta.contactId", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));
    seedLease({
      id: "lease-existing",
      companyId: "co-1",
      tenantName: "Old Tenant",
      meta: { deposit: 500 },
      rent: null,
      status: "Active",
    });

    const res = await POST(
      makeRequest({
        name: "Alice",
        type: "Tenant",
        lease: {
          leaseId: "lease-existing",
          leaseDocFileKey: "file-key-abc",
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.contact.name).toBe("Alice");
    expect(body.lease).not.toBeNull();

    const updatedLease = db.leases.get("lease-existing")!;
    expect(updatedLease.tenantName).toBe("Alice");
    expect(updatedLease.meta.contactId).toBe(body.contact.id);
    expect(updatedLease.meta.leaseDocFileKey).toBe("file-key-abc");
    expect(updatedLease.meta.deposit).toBe(500);
    expect(db.activityLog[0].message).toContain("linked");
  });

  it("returns 404 when leaseId does not belong to the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedLease({ id: "lease-other", companyId: "co-2" });

    const res = await POST(
      makeRequest({
        name: "Alice",
        type: "Tenant",
        lease: { leaseId: "lease-other" },
      })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Lease not found" });
    expect(db.contacts.size).toBe(0);
  });

  it("returns 404 when leaseId does not exist at all", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(
      makeRequest({
        name: "Alice",
        type: "Tenant",
        lease: { leaseId: "nonexistent" },
      })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Lease not found" });
    expect(db.contacts.size).toBe(0);
  });

  it("creates a new lease (propertyId mode): links meta.contactId to new contact", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin", companyId: "co-1" }));
    seedProperty({ id: "prop-1", companyId: "co-1" });

    const res = await POST(
      makeRequest({
        name: "Carol",
        type: "Tenant",
        lease: {
          propertyId: "prop-1",
          rent: "1200",
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          status: "Active",
          deposit: "2400",
          leaseDocFileKey: "file-key-xyz",
          autoRenew: "yes",
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lease).not.toBeNull();
    expect(body.lease.propertyId).toBe("prop-1");
    expect(body.lease.tenantName).toBe("Carol");
    expect(body.lease.meta.contactId).toBe(body.contact.id);
    expect(body.lease.meta.deposit).toBe(2400);
    expect(body.lease.meta.leaseDocFileKey).toBe("file-key-xyz");
    expect(body.lease.meta.autoRenew).toBe("yes");
    expect(db.activityLog[0].message).toContain("created");
  });

  it("returns 404 when propertyId does not belong to the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    seedProperty({ id: "prop-other", companyId: "co-2" });

    const res = await POST(
      makeRequest({
        name: "Dave",
        type: "Tenant",
        lease: { propertyId: "prop-other" },
      })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
    expect(db.contacts.size).toBe(0);
  });

  it("returns 404 when propertyId does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(
      makeRequest({
        name: "Eve",
        type: "Tenant",
        lease: { propertyId: "nonexistent-prop" },
      })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Property not found" });
    expect(db.contacts.size).toBe(0);
  });

  it("writes an activity log entry with the correct actor and entity", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-actor", companyId: "co-1" }));

    await POST(makeRequest({ name: "Frank", type: "Tenant" }));

    expect(db.activityLog).toHaveLength(1);
    const entry = db.activityLog[0];
    expect(entry.companyId).toBe("co-1");
    expect(entry.actorId).toBe("u-actor");
    expect(entry.action).toBe("contact.create");
    expect(entry.entity).toBe("Contact");
    expect(entry.message).toContain("Frank");
  });
});
