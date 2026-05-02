// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const BULK_REENABLE_MAX_IDS = 500;

// ---------------------------------------------------------------------------
// Mocks – stub auth and prisma before the route module is imported.
// ---------------------------------------------------------------------------

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

const contactFindManyMock = vi.fn();
const contactUpdateMock = vi.fn();
const activityLogEntryCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findMany: (...args: unknown[]) => contactFindManyMock(...args),
      update: (...args: unknown[]) => contactUpdateMock(...args),
    },
    activityLogEntry: {
      create: (...args: unknown[]) => activityLogEntryCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { POST } from "@/app/api/contacts/email-opt-out/bulk/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/contacts/email-opt-out/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminUser(overrides: Partial<{ id: string; companyId: string }> = {}) {
  return {
    id: "admin-1",
    companyId: "company-1",
    role: "Admin",
    ...overrides,
  };
}

function makeContact(
  id: string,
  overrides: Partial<{ name: string; emailOptOut: boolean; companyId: string }> = {}
) {
  return {
    id,
    name: `Contact ${id}`,
    emailOptOut: true,
    ...overrides,
  };
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/contacts/email-opt-out/bulk", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: $transaction executes the array of promises in-order and
    // returns the resolved values (mirrors Prisma's interactive transaction
    // API when passed an array of promises).
    transactionMock.mockImplementation(async (ops: Promise<unknown>[]) => {
      const results = [];
      for (const op of ops) {
        results.push(await op);
      }
      return results;
    });

    contactUpdateMock.mockResolvedValue({});
    activityLogEntryCreateMock.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // Auth guards
  // -------------------------------------------------------------------------

  it("returns 401 when there is no authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ ids: ["c-1"] }) as never);

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when the authenticated user is not an Admin", async () => {
    getCurrentUserMock.mockResolvedValue({ ...adminUser(), role: "User" });

    const res = await POST(makeRequest({ ids: ["c-1"] }) as never);

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Admin only");
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns 400 for an invalid (non-JSON) body", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const req = new Request("http://localhost/api/contacts/email-opt-out/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when ids is missing", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({}) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/ids/i);
  });

  it("returns 400 when ids is an empty array", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ ids: [] }) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/ids/i);
  });

  it("returns 400 when ids contains only empty strings", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ ids: ["", ""] }) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/ids/i);
  });

  it("returns 400 when ids is not an array (a string instead)", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ ids: "c-1" }) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/ids/i);
  });

  it(`returns 400 when ids exceeds the ${BULK_REENABLE_MAX_IDS}-item cap`, async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());

    const oversizedIds = Array.from({ length: BULK_REENABLE_MAX_IDS + 1 }, (_, i) => `c-${i}`);
    const res = await POST(makeRequest({ ids: oversizedIds }) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/too many/i);
    expect(body.error).toContain(String(BULK_REENABLE_MAX_IDS));
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("re-enables a single opted-out contact and returns succeeded=1 failed=0", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([makeContact("c-1", { emailOptOut: true })]);

    const res = await POST(makeRequest({ ids: ["c-1"] }) as never);

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);
    expect(Array.isArray(body.results)).toBe(true);
    const results = body.results as { id: string; ok: boolean }[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "c-1", ok: true });
  });

  it("writes one contact.email_opt_in ActivityLogEntry with meta.bulk = true per re-enabled contact", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([
      makeContact("c-1", { emailOptOut: true }),
      makeContact("c-2", { emailOptOut: true }),
    ]);

    await POST(makeRequest({ ids: ["c-1", "c-2"] }) as never);

    // $transaction is called once per re-enabled contact.
    expect(transactionMock).toHaveBeenCalledTimes(2);

    // activityLogEntry.create is called with the right action and meta.
    expect(activityLogEntryCreateMock).toHaveBeenCalledTimes(2);
    for (const call of activityLogEntryCreateMock.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.action).toBe("contact.email_opt_in");
      expect((data.meta as { bulk: boolean }).bulk).toBe(true);
    }
  });

  it("clears emailOptOut and emailOptOutAt when re-enabling a contact", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([makeContact("c-1", { emailOptOut: true })]);

    await POST(makeRequest({ ids: ["c-1"] }) as never);

    expect(contactUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c-1" },
        data: { emailOptOut: false, emailOptOutAt: null },
      })
    );
  });

  // -------------------------------------------------------------------------
  // No-op for already opted-in contacts
  // -------------------------------------------------------------------------

  it("reports ok:true (no-op) for contacts that are already opted in", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([
      makeContact("c-1", { emailOptOut: false }),
    ]);

    const res = await POST(makeRequest({ ids: ["c-1"] }) as never);

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);

    // No DB writes should have happened.
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cross-company isolation
  // -------------------------------------------------------------------------

  it("reports ok:false / 'Contact not found' for ids belonging to another company", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser({ companyId: "company-1" }));
    // findMany is scoped to company-1 — it returns nothing for other-company ids.
    contactFindManyMock.mockResolvedValue([]);

    const res = await POST(makeRequest({ ids: ["c-other-company"] }) as never);

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
    const results = body.results as { id: string; ok: boolean; error?: string }[];
    expect(results[0]).toMatchObject({ id: "c-other-company", ok: false, error: "Contact not found" });

    // findMany must have been called with the admin's companyId.
    expect(contactFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-1" }),
      })
    );
  });

  it("scopes the DB query to the admin's companyId so cross-company ids are silently excluded", async () => {
    const user = adminUser({ companyId: "company-A" });
    getCurrentUserMock.mockResolvedValue(user);
    // Only the contact belonging to company-A is returned.
    contactFindManyMock.mockResolvedValue([makeContact("c-A", { emailOptOut: true })]);

    await POST(makeRequest({ ids: ["c-A", "c-B-different-company"] }) as never);

    // findMany WHERE clause must include the admin's companyId.
    const [firstCall] = contactFindManyMock.mock.calls;
    const where = (firstCall[0] as { where: Record<string, unknown> }).where;
    expect(where.companyId).toBe("company-A");
  });

  // -------------------------------------------------------------------------
  // Partial failure
  // -------------------------------------------------------------------------

  it("returns the correct succeeded/failed counts on partial failure", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([
      makeContact("c-ok", { emailOptOut: true }),
      makeContact("c-fail", { emailOptOut: true }),
    ]);

    // Make the transaction fail for c-fail only.
    let callCount = 0;
    transactionMock.mockImplementation(async (ops: Promise<unknown>[]) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("DB error");
      }
      for (const op of ops) await op;
    });

    const res = await POST(makeRequest({ ids: ["c-ok", "c-fail"] }) as never);

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
    const results = body.results as { id: string; ok: boolean; error?: string }[];
    const okResult = results.find((r) => r.id === "c-ok");
    const failResult = results.find((r) => r.id === "c-fail");
    expect(okResult?.ok).toBe(true);
    expect(failResult?.ok).toBe(false);
    expect(typeof failResult?.error).toBe("string");
  });

  it("returns the right results[] shape: id, ok, and optional error field", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([
      makeContact("c-1", { emailOptOut: true }),
    ]);

    const res = await POST(makeRequest({ ids: ["c-1", "c-missing"] }) as never);

    const body = await json(res);
    const results = body.results as { id: string; ok: boolean; error?: string }[];
    expect(results).toHaveLength(2);

    const c1 = results.find((r) => r.id === "c-1")!;
    expect(c1).toHaveProperty("id");
    expect(c1).toHaveProperty("ok");

    const missing = results.find((r) => r.id === "c-missing")!;
    expect(missing.ok).toBe(false);
    expect(typeof missing.error).toBe("string");
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  it("deduplicates ids so each contact is processed only once", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindManyMock.mockResolvedValue([makeContact("c-1", { emailOptOut: true })]);

    const res = await POST(makeRequest({ ids: ["c-1", "c-1", "c-1"] }) as never);

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.succeeded).toBe(1);
    // Only one transaction should have been opened.
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Pagination / size cap
  // -------------------------------------------------------------------------

  it(`returns 400 when the ids array exceeds the ${BULK_REENABLE_MAX_IDS}-ID per-request cap`, async () => {
    // The cap exists to prevent a single request from locking thousands of
    // rows in the DB at once. Callers must paginate large re-enables.
    getCurrentUserMock.mockResolvedValue(adminUser());
    const oversizedIds = Array.from({ length: BULK_REENABLE_MAX_IDS + 1 }, (_, i) => `c-${i}`);

    const res = await POST(makeRequest({ ids: oversizedIds }) as never);

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/too many ids/i);
    // No DB calls should have been made.
    expect(contactFindManyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it(`accepts exactly ${BULK_REENABLE_MAX_IDS} ids (boundary — must not trigger the cap)`, async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    const ids = Array.from({ length: BULK_REENABLE_MAX_IDS }, (_, i) => `c-${i}`);
    // Return empty so the rest of the handler short-circuits cleanly.
    contactFindManyMock.mockResolvedValue([]);

    const res = await POST(makeRequest({ ids }) as never);

    // 200 with 0 succeeded is the correct response when all contacts are
    // already opted-in (findMany returns nothing to update).
    expect(res.status).toBe(200);
    expect(contactFindManyMock).toHaveBeenCalledTimes(1);
  });
});
