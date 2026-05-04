// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – stub auth and prisma before the route module is imported.
// ---------------------------------------------------------------------------

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

const contactFindFirstMock = vi.fn();
const contactUpdateMock = vi.fn();
const activityLogEntryCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => contactFindFirstMock(...args),
      update: (...args: unknown[]) => contactUpdateMock(...args),
    },
    activityLogEntry: {
      create: (...args: unknown[]) => activityLogEntryCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { POST, DELETE } from "@/app/api/contacts/[id]/email-opt-out/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(method: "POST" | "DELETE", id: string): Request {
  return new Request(`http://localhost/api/contacts/${id}/email-opt-out`, {
    method,
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
  overrides: Partial<{ name: string; emailOptOut: boolean }> = {}
) {
  return {
    id,
    name: `Contact ${id}`,
    emailOptOut: false,
    ...overrides,
  };
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/contacts/[id]/email-opt-out (opt-out)", () => {
  beforeEach(() => {
    vi.resetAllMocks();

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

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when the authenticated user is not an Admin", async () => {
    getCurrentUserMock.mockResolvedValue({ ...adminUser(), role: "User" });

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Admin only");
  });

  // -------------------------------------------------------------------------
  // Cross-company isolation
  // -------------------------------------------------------------------------

  it("returns 404 when the contact belongs to a different company", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser({ companyId: "company-1" }));
    contactFindFirstMock.mockResolvedValue(null);

    const res = await POST(
      makeRequest("POST", "c-other") as never,
      makeCtx("c-other")
    );

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Contact not found");

    expect(contactFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-1" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Happy path – opt out
  // -------------------------------------------------------------------------

  it("opts the contact out and returns ok:true emailOptOut:true", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.emailOptOut).toBe(true);
  });

  it("sets emailOptOut:true and clears emailOptOutAt with a truthy Date", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );

    await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(contactUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c-1" },
        data: expect.objectContaining({
          emailOptOut: true,
          emailOptOutAt: expect.any(Date),
        }),
      })
    );
  });

  it("writes one contact.email_opt_out ActivityLogEntry", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );

    await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(activityLogEntryCreateMock).toHaveBeenCalledTimes(1);
    const data = (
      activityLogEntryCreateMock.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.action).toBe("contact.email_opt_out");
    expect(data.entity).toBe("Contact");
    expect(data.entityId).toBe("c-1");
  });

  // -------------------------------------------------------------------------
  // Error handling – transaction throws
  // -------------------------------------------------------------------------

  it("returns 500 with a JSON error body when the transaction throws", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );
    transactionMock.mockRejectedValue(new Error("Connection lost"));

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Connection lost");
  });

  it("returns 500 with a generic message when the transaction throws a non-Error", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );
    transactionMock.mockRejectedValue("unknown failure");

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Idempotent no-op – contact already opted out
  // -------------------------------------------------------------------------

  it("is idempotent: no DB writes when the contact is already opted out", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );

    const res = await POST(makeRequest("POST", "c-1") as never, makeCtx("c-1"));

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.emailOptOut).toBe(true);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(contactUpdateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/contacts/[id]/email-opt-out (opt-in)", () => {
  beforeEach(() => {
    vi.resetAllMocks();

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

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when the authenticated user is not an Admin", async () => {
    getCurrentUserMock.mockResolvedValue({ ...adminUser(), role: "User" });

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Admin only");
  });

  // -------------------------------------------------------------------------
  // Cross-company isolation
  // -------------------------------------------------------------------------

  it("returns 404 when the contact belongs to a different company", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser({ companyId: "company-1" }));
    contactFindFirstMock.mockResolvedValue(null);

    const res = await DELETE(
      makeRequest("DELETE", "c-other") as never,
      makeCtx("c-other")
    );

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Contact not found");

    expect(contactFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-1" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Happy path – opt in
  // -------------------------------------------------------------------------

  it("opts the contact back in and returns ok:true emailOptOut:false", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.emailOptOut).toBe(false);
  });

  it("sets emailOptOut:false and nulls emailOptOutAt", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );

    await DELETE(makeRequest("DELETE", "c-1") as never, makeCtx("c-1"));

    expect(contactUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c-1" },
        data: expect.objectContaining({
          emailOptOut: false,
          emailOptOutAt: null,
        }),
      })
    );
  });

  it("writes one contact.email_opt_in ActivityLogEntry", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );

    await DELETE(makeRequest("DELETE", "c-1") as never, makeCtx("c-1"));

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(activityLogEntryCreateMock).toHaveBeenCalledTimes(1);
    const data = (
      activityLogEntryCreateMock.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.action).toBe("contact.email_opt_in");
    expect(data.entity).toBe("Contact");
    expect(data.entityId).toBe("c-1");
  });

  // -------------------------------------------------------------------------
  // Error handling – transaction throws
  // -------------------------------------------------------------------------

  it("returns 500 with a JSON error body when the transaction throws", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );
    transactionMock.mockRejectedValue(new Error("Connection lost"));

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Connection lost");
  });

  it("returns 500 with a generic message when the transaction throws a non-Error", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: true })
    );
    transactionMock.mockRejectedValue("unknown failure");

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Idempotent no-op – contact already opted in
  // -------------------------------------------------------------------------

  it("is idempotent: no DB writes when the contact is already opted in", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser());
    contactFindFirstMock.mockResolvedValue(
      makeContact("c-1", { emailOptOut: false })
    );

    const res = await DELETE(
      makeRequest("DELETE", "c-1") as never,
      makeCtx("c-1")
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.emailOptOut).toBe(false);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(contactUpdateMock).not.toHaveBeenCalled();
  });
});
