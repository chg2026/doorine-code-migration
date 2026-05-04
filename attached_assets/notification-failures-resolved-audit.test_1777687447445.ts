// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
//
// We exercise the real `GET /api/admin/notification-failures?resolved=1`
// handler but stub out anything that touches the database, auth, or the
// notification dispatch helper (POST-only, not exercised here).
// ---------------------------------------------------------------------------

const getCurrentUserMock = vi.fn();
const notificationFindManyMock = vi.fn();
const contactNotificationLogFindManyMock = vi.fn();
const userFindManyMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => notificationFindManyMock(...args),
    },
    contactNotificationLog: {
      findMany: (...args: unknown[]) => contactNotificationLogFindManyMock(...args),
    },
    user: {
      findMany: (...args: unknown[]) => userFindManyMock(...args),
    },
  },
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  resendFailedNotification: vi.fn(),
}));

import { GET } from "@/app/api/admin/notification-failures/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/admin/notification-failures");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

const ADMIN_USER = {
  id: "admin_user_1",
  companyId: "company_acme",
  role: "Admin" as const,
};

const CROSS_TENANT_ADMIN = {
  id: "admin_user_2",
  companyId: "company_other",
  role: "Admin" as const,
};

const NON_ADMIN_USER = {
  id: "regular_user_1",
  companyId: "company_acme",
  role: "Employee" as const,
};

const NOW = new Date("2024-03-15T12:00:00.000Z");
const OLDER = new Date("2024-03-14T10:00:00.000Z");

function makeUserNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif_1",
    event: "tenant_created",
    title: "New tenant added",
    failureReason: "Email address not found",
    failedAt: OLDER,
    createdAt: OLDER,
    resolvedAt: NOW,
    resolvedById: "resolver_1",
    resolvedReason: "admin_dismissed",
    user: {
      id: "recipient_user_1",
      email: "teammate@acme.com",
      firstName: "Alice",
      lastName: "Smith",
    },
    ...overrides,
  };
}

function makeContactNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "clog_1",
    event: "maintenance_scheduled",
    title: "Maintenance notice",
    recipientEmail: "contractor@example.com",
    failureReason: "Bounce: invalid address",
    failedAt: OLDER,
    sentAt: OLDER,
    resolvedAt: NOW,
    resolvedById: null,
    resolvedReason: "auto_later_send_succeeded",
    contact: {
      id: "contact_1",
      name: "Bob Contractor",
      email: "contractor@example.com",
    },
    ...overrides,
  };
}

function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id }), "utf8").toString("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Auth guard tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/notification-failures?resolved=1 — auth guards", () => {
  it("returns 401 when no user is authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await GET(makeRequest({ resolved: "1" }) as never);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 403 when caller is not an Admin", async () => {
    getCurrentUserMock.mockResolvedValue(NON_ADMIN_USER);

    const res = await GET(makeRequest({ resolved: "1" }) as never);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it("isolates a cross-tenant admin to their own company's rows (scoped exclusion, not rejection)", async () => {
    // Contract: a valid admin from a different company (company_other) is
    // allowed to query the endpoint (200) but the companyId scope ensures
    // they ONLY see their own company's rows. Acme's rows are never returned
    // because every Prisma query is gated by companyId = caller's companyId.
    // This is data isolation by DB scope — the endpoint deliberately does not
    // 403 cross-tenant admins; it just returns the right (empty) set for them.
    getCurrentUserMock.mockResolvedValue(CROSS_TENANT_ADMIN);

    // DB returns empty for company_other (they have no resolved rows)
    notificationFindManyMock.mockResolvedValue([]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    const res = await GET(makeRequest({ resolved: "1" }) as never);

    // Intentional 200 + empty — the endpoint does not 403 valid admins
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);

    // Every Prisma call must use company_other's id, never Acme's company_acme
    expect(notificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company_other" }),
      })
    );
    expect(contactNotificationLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company_other" }),
      })
    );
    // Confirm Acme's id is never present anywhere in either call
    const userWhereStr = JSON.stringify(notificationFindManyMock.mock.calls[0][0].where);
    const contactWhereStr = JSON.stringify(contactNotificationLogFindManyMock.mock.calls[0][0].where);
    expect(userWhereStr).not.toContain("company_acme");
    expect(contactWhereStr).not.toContain("company_acme");
  });
});

// ---------------------------------------------------------------------------
// Resolved rows — field population
// ---------------------------------------------------------------------------

describe("GET /api/admin/notification-failures?resolved=1 — field population", () => {
  it("returns resolvedAt, resolvedReason, and resolvedByName for an admin_dismissed user notification", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    const userRow = makeUserNotification({
      resolvedReason: "admin_dismissed",
      resolvedById: "resolver_1",
    });
    notificationFindManyMock.mockResolvedValue([userRow]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([
      { id: "resolver_1", firstName: "Carol", lastName: "Admin", email: "carol@acme.com" },
    ]);

    const res = await GET(makeRequest({ resolved: "1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(item.id).toBe("u:notif_1");
    expect(item.kind).toBe("user");
    expect(item.resolvedAt).toBe(NOW.toISOString());
    expect(item.resolvedReason).toBe("admin_dismissed");
    expect(item.resolvedByName).toBe("Carol Admin");
    expect(item.recipientName).toBe("Alice Smith");
    expect(item.recipientEmail).toBe("teammate@acme.com");
    expect(item.link).toBe("/admin?panel=users");
  });

  it("returns resolvedAt, resolvedReason, and null resolvedByName for an auto_later_send_succeeded contact notification", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    const contactRow = makeContactNotification({
      resolvedReason: "auto_later_send_succeeded",
      resolvedById: null,
    });
    notificationFindManyMock.mockResolvedValue([]);
    contactNotificationLogFindManyMock.mockResolvedValue([contactRow]);
    // No resolver IDs to look up — user.findMany should not be called
    userFindManyMock.mockResolvedValue([]);

    const res = await GET(makeRequest({ resolved: "1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(item.id).toBe("c:clog_1");
    expect(item.kind).toBe("contact");
    expect(item.resolvedAt).toBe(NOW.toISOString());
    expect(item.resolvedReason).toBe("auto_later_send_succeeded");
    expect(item.resolvedByName).toBeNull();
    expect(item.resolvedById).toBeNull();
    expect(item.recipientName).toBe("Bob Contractor");
    expect(item.link).toBe("/contacts/contact_1");

    // No resolver ids to look up — the user query should not fire
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("passes a resolvedAt filter to Prisma so unresolved rows are excluded from audit results", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    notificationFindManyMock.mockResolvedValue([]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    await GET(makeRequest({ resolved: "1" }) as never);

    // Without a cursor, buildPerTableCursorClause returns { resolvedAt: { not: null } }
    // which is placed inside the AND array. This ensures the query only fetches rows
    // that HAVE been resolved, filtering out any unresolved (resolvedAt = null) rows
    // at the database level.
    const userCall = notificationFindManyMock.mock.calls[0][0];
    const contactCall = contactNotificationLogFindManyMock.mock.calls[0][0];
    // AND[0] is the cursor clause returned by buildPerTableCursorClause
    expect(userCall.where.AND[0]).toEqual({ resolvedAt: { not: null } });
    expect(contactCall.where.AND[0]).toEqual({ resolvedAt: { not: null } });
  });

  it("merges user and contact resolved rows and orders them by resolvedAt DESC", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    const early = new Date("2024-03-13T08:00:00.000Z");
    const late = new Date("2024-03-15T14:00:00.000Z");

    const userRow = makeUserNotification({ resolvedAt: early, resolvedById: null });
    const contactRow = makeContactNotification({ resolvedAt: late, resolvedById: null });

    notificationFindManyMock.mockResolvedValue([userRow]);
    contactNotificationLogFindManyMock.mockResolvedValue([contactRow]);
    userFindManyMock.mockResolvedValue([]);

    const res = await GET(makeRequest({ resolved: "1" }) as never);
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    // Contact row resolved later → should appear first
    expect(body.items[0].id).toBe("c:clog_1");
    expect(body.items[1].id).toBe("u:notif_1");
  });

  it("looks up resolver names for both user and contact rows in a single batch query", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    const userRow = makeUserNotification({ resolvedById: "resolver_1" });
    const contactRow = makeContactNotification({ resolvedById: "resolver_2" });

    notificationFindManyMock.mockResolvedValue([userRow]);
    contactNotificationLogFindManyMock.mockResolvedValue([contactRow]);
    userFindManyMock.mockResolvedValue([
      { id: "resolver_1", firstName: "Carol", lastName: "Admin", email: "carol@acme.com" },
      { id: "resolver_2", firstName: "Dave", lastName: "Super", email: "dave@acme.com" },
    ]);

    const res = await GET(makeRequest({ resolved: "1" }) as never);
    const body = await res.json();

    expect(userFindManyMock).toHaveBeenCalledTimes(1);
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: expect.arrayContaining(["resolver_1", "resolver_2"]) },
          companyId: "company_acme",
        }),
      })
    );

    const userItem = body.items.find((i: { id: string }) => i.id === "u:notif_1");
    const contactItem = body.items.find((i: { id: string }) => i.id === "c:clog_1");
    expect(userItem.resolvedByName).toBe("Carol Admin");
    expect(contactItem.resolvedByName).toBe("Dave Super");
  });
});

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

describe("GET /api/admin/notification-failures?resolved=1 — cursor pagination", () => {
  it("respects the ?limit= cap and emits a nextCursor when more rows may exist", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    // Simulate DB returning exactly `limit` rows (signals more may exist)
    const rows = [
      makeUserNotification({ id: "notif_a", resolvedAt: new Date("2024-03-15T12:00:00.000Z") }),
      makeUserNotification({ id: "notif_b", resolvedAt: new Date("2024-03-15T11:00:00.000Z") }),
    ];
    notificationFindManyMock.mockResolvedValue(rows);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([
      { id: "resolver_1", firstName: "Carol", lastName: "Admin", email: "carol@acme.com" },
    ]);

    const res = await GET(makeRequest({ resolved: "1", limit: "2" }) as never);
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    // userResolved.length === limit (2) → moreAvailable is true
    expect(body.nextCursor).not.toBeNull();
    expect(typeof body.nextCursor).toBe("string");

    // The cursor should decode to the last item's resolvedAt and prefixedId
    const decoded = JSON.parse(Buffer.from(body.nextCursor, "base64").toString("utf8"));
    expect(decoded.ts).toBe(body.items[1].resolvedAt);
    expect(decoded.id).toBe(body.items[1].id);
  });

  it("does not emit a nextCursor when fewer than limit rows are returned", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    // Return only 1 row with limit=10 → no more pages
    notificationFindManyMock.mockResolvedValue([
      makeUserNotification({ resolvedById: null }),
    ]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    const res = await GET(makeRequest({ resolved: "1", limit: "10" }) as never);
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("passes a ?before= ISO cursor to the Prisma queries as a strict-lt filter", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    notificationFindManyMock.mockResolvedValue([]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    const cursorTs = "2024-03-14T10:00:00.000Z";
    const res = await GET(makeRequest({ resolved: "1", before: cursorTs }) as never);

    expect(res.status).toBe(200);

    // Both table queries should include a resolvedAt filter derived from the cursor.
    // The cursor clause is placed as the first element of the AND array.
    const userCall = notificationFindManyMock.mock.calls[0][0];
    const contactCall = contactNotificationLogFindManyMock.mock.calls[0][0];
    // Legacy ISO cursor with no prefixedId → strict lt; filter is in AND[0]
    expect(userCall.where.AND[0]).toEqual({ resolvedAt: { lt: new Date(cursorTs) } });
    expect(contactCall.where.AND[0]).toEqual({ resolvedAt: { lt: new Date(cursorTs) } });
  });

  it("pages through a merged result using the base64-JSON cursor across both tables", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    // Page 1: limit=1, both tables return one row each at different timestamps.
    // After merging, the contact row (later resolvedAt) is returned; the user
    // row stays for page 2.
    const ts1 = new Date("2024-03-15T12:00:00.000Z");
    const ts2 = new Date("2024-03-15T11:00:00.000Z");

    const contactRow = makeContactNotification({
      id: "clog_pg1",
      resolvedAt: ts1,
      resolvedById: null,
    });
    const userRow = makeUserNotification({
      id: "notif_pg2",
      resolvedAt: ts2,
      resolvedById: null,
    });

    // Page 1 call: both tables return their row
    notificationFindManyMock.mockResolvedValueOnce([userRow]);
    contactNotificationLogFindManyMock.mockResolvedValueOnce([contactRow]);
    userFindManyMock.mockResolvedValue([]);

    const page1Res = await GET(makeRequest({ resolved: "1", limit: "1" }) as never);
    const page1 = await page1Res.json();

    // Contact row resolvedAt is later → appears first on page 1
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0].id).toBe("c:clog_pg1");
    expect(page1.nextCursor).not.toBeNull();

    // Page 2: limit=5 so 1 returned row is well below the limit, ensuring
    // moreAvailable is false and nextCursor is null at the end of the list.
    notificationFindManyMock.mockResolvedValueOnce([userRow]);
    contactNotificationLogFindManyMock.mockResolvedValueOnce([]);
    userFindManyMock.mockResolvedValue([]);

    const page2Res = await GET(
      makeRequest({ resolved: "1", limit: "5", before: page1.nextCursor }) as never
    );
    const page2 = await page2Res.json();

    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe("u:notif_pg2");
    // 1 row returned with limit=5 → both tables below limit → no further cursor
    expect(page2.nextCursor).toBeNull();
  });

  it("returns 400 for a malformed ?before= cursor", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    const res = await GET(
      makeRequest({ resolved: "1", before: "not-a-valid-cursor-or-iso-date" }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cursor/i);
  });

  it("caps ?limit= at MAX_PAGE_SIZE (100) even when caller passes a higher value", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN_USER);

    notificationFindManyMock.mockResolvedValue([]);
    contactNotificationLogFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    await GET(makeRequest({ resolved: "1", limit: "9999" }) as never);

    const userCall = notificationFindManyMock.mock.calls[0][0];
    expect(userCall.take).toBeLessThanOrEqual(100);
  });
});
