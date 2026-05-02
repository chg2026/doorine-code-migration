import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";

// In-memory DB state shared between the prisma mock and the test assertions.
// Hoisted so the vi.mock factory below (which runs before the test body) can
// reach it via a stable reference captured at import time.
const db = vi.hoisted(() => {
  return {
    notifications: new Map<string, Record<string, unknown>>(),
    contactNotificationLogs: new Map<string, Record<string, unknown>>(),
    users: new Map<string, Record<string, unknown>>(),
    companies: new Map<string, Record<string, unknown>>(),
    contacts: new Map<string, Record<string, unknown>>(),
    reset() {
      this.notifications.clear();
      this.contactNotificationLogs.clear();
      this.users.clear();
      this.companies.clear();
      this.contacts.clear();
    },
  };
});

// Tiny prisma stand-in so resendFailedNotification + sendEmailRow can run
// end-to-end against an in-memory store. Only the table operations actually
// touched by the retry path are implemented.
vi.mock("@/lib/prisma", () => {
  type SelectShape = Record<string, boolean | { select: Record<string, boolean> }>;
  // Top-level select supports either bare booleans (scalar columns) or
  // nested `{ select: {...} }` for relations (user / contact). Relations
  // are resolved by the per-table `relationResolvers` registered below so
  // the GET tests can exercise the same prisma surface as the POST tests.
  const pickFields = (
    row: Record<string, unknown>,
    select: SelectShape | undefined,
    relationResolvers: Record<string, (row: Record<string, unknown>) => Record<string, unknown> | null>,
  ): Record<string, unknown> => {
    if (!select) return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(select)) {
      if (v === true) {
        out[k] = row[k];
      } else if (v && typeof v === "object" && "select" in v) {
        const resolver = relationResolvers[k];
        const related = resolver ? resolver(row) : null;
        out[k] = related ? pickFields(related, v.select as SelectShape, {}) : null;
      }
    }
    return out;
  };
  const findUniqueFor = (table: Map<string, Record<string, unknown>>) =>
    async ({ where, select }: { where: { id: string }; select?: SelectShape }) => {
      const row = table.get(where.id);
      return row ? pickFields(row, select, {}) : null;
    };
  const updateFor = (table: Map<string, Record<string, unknown>>) =>
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = table.get(where.id);
      if (!existing) throw new Error(`row ${where.id} not found`);
      const updated = { ...existing, ...data };
      table.set(where.id, updated);
      return updated;
    };
  // Tiny `updateMany` shim that mirrors the bits of the Prisma surface the
  // bulk-dismiss and bulk-reopen branches use: top-level scalar equality filters
  // plus an `id: { in: [...] }` clause and `{ not: null }` / `{ not: X }`
  // negation. Anything that fails to match is left alone.
  const updateManyFor = (table: Map<string, Record<string, unknown>>) =>
    async ({
      where,
      data,
    }: {
      where: Record<string, unknown> & { id?: { in: string[] } };
      data: Record<string, unknown>;
    }) => {
      const idsIn = where.id && typeof where.id === "object" && "in" in where.id
        ? (where.id as { in: string[] }).in
        : null;
      const scalarFilters = Object.entries(where).filter(([k]) => k !== "id");
      let count = 0;
      for (const [rowId, row] of table) {
        if (idsIn && !idsIn.includes(rowId)) continue;
        let matches = true;
        for (const [k, v] of scalarFilters) {
          // Handle `{ not: X }` negation (e.g. `resolvedAt: { not: null }`)
          if (v !== null && typeof v === "object" && "not" in (v as Record<string, unknown>)) {
            const notVal = (v as { not: unknown }).not;
            if (notVal === null ? (row[k] === null || row[k] === undefined) : row[k] === notVal) {
              matches = false;
              break;
            }
          } else if (v === null) {
            if (row[k] !== null && row[k] !== undefined) { matches = false; break; }
          } else if (row[k] !== v) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        table.set(rowId, { ...row, ...data });
        count++;
      }
      return { count };
    };
  // Minimal `findMany` covering the where shapes the route actually emits:
  // top-level equality on scalar columns, `{ not: null }` / `{ lt }` / `{ lte }`
  // for resolvedAt cursor clauses, top-level `AND` / `OR` arrays, and nested
  // combinations thereof. Filter logic is defined inline inside the async handler
  // to avoid closure-capture issues with vi.mock factories under vitest/oxc.
  // orderBy is an array of single-key `{ field: 'desc' | 'asc' }` objects
  // applied as a stable multi-key sort.
  const findManyFor = (
    table: Map<string, Record<string, unknown>>,
    relationResolvers: Record<string, (row: Record<string, unknown>) => Record<string, unknown> | null>,
  ) =>
    async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where?: Record<string, unknown>;
      orderBy?: Array<Record<string, "asc" | "desc">>;
      take?: number;
      select?: SelectShape;
    }) => {
      // Self-contained filter evaluator — no external closure references needed.
      // Handles the Prisma where-clause shapes emitted by getResolved / buildPerTableCursorClause:
      //   • top-level scalar equality / { not } / { lt } / { lte }
      //   • top-level AND: [...] and OR: [...] arrays (possibly nested)
      function matchField(rowVal: unknown, filter: unknown): boolean {
        if (filter === null) return rowVal === null || rowVal === undefined;
        if (filter instanceof Date) {
          return rowVal instanceof Date && rowVal.getTime() === filter.getTime();
        }
        if (typeof filter === "object" && filter !== null) {
          const f = filter as Record<string, unknown>;
          if (Object.prototype.hasOwnProperty.call(f, "not")) {
            return !matchField(rowVal, f.not);
          }
          if (Object.prototype.hasOwnProperty.call(f, "lt")) {
            if (rowVal == null) return false;
            const rv = rowVal instanceof Date ? rowVal.getTime() : (rowVal as number);
            const fv = (f.lt as Date) instanceof Date ? (f.lt as Date).getTime() : (f.lt as number);
            return rv < fv;
          }
          if (Object.prototype.hasOwnProperty.call(f, "lte")) {
            if (rowVal == null) return false;
            const rv = rowVal instanceof Date ? rowVal.getTime() : (rowVal as number);
            const fv = (f.lte as Date) instanceof Date ? (f.lte as Date).getTime() : (f.lte as number);
            return rv <= fv;
          }
          return true; // unknown scalar-filter shape — pass through
        }
        return rowVal === filter;
      }
      // Recursively evaluate a where-clause object against a row.
      // Handles AND / OR logical operators as well as scalar field filters.
      function rowMatchesWhere(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
        for (const [k, v] of Object.entries(clause)) {
          if (k === "AND") {
            const sub = v as Array<Record<string, unknown>>;
            for (const c of sub) {
              if (!rowMatchesWhere(row, c)) return false;
            }
          } else if (k === "OR") {
            const sub = v as Array<Record<string, unknown>>;
            if (!sub.some((c) => rowMatchesWhere(row, c))) return false;
          } else if (!matchField(row[k], v)) {
            return false;
          }
        }
        return true;
      }
      const rows = Array.from(table.values()).filter((row) =>
        !where ? true : rowMatchesWhere(row, where),
      );
      if (orderBy && orderBy.length > 0) {
        rows.sort((a, b) => {
          for (const clause of orderBy) {
            for (const [field, dir] of Object.entries(clause)) {
              const av = a[field];
              const bv = b[field];
              if (av === bv) continue;
              if (av === null || av === undefined) return 1;
              if (bv === null || bv === undefined) return -1;
              const cmp = av < bv ? -1 : 1;
              return dir === "desc" ? -cmp : cmp;
            }
          }
          return 0;
        });
      }
      const sliced = typeof take === "number" ? rows.slice(0, take) : rows;
      return sliced.map((row) => pickFields(row, select, relationResolvers));
    };
  const userResolver = (row: Record<string, unknown>) => {
    const userId = row.userId as string | undefined;
    if (!userId) return null;
    return db.users.get(userId) ?? null;
  };
  const contactResolver = (row: Record<string, unknown>) => {
    const contactId = row.contactId as string | undefined;
    if (!contactId) return null;
    return db.contacts.get(contactId) ?? null;
  };
  return {
    prisma: {
      notification: {
        findUnique: findUniqueFor(db.notifications),
        update: updateFor(db.notifications),
        updateMany: updateManyFor(db.notifications),
        findMany: findManyFor(db.notifications, { user: userResolver }),
      },
      contactNotificationLog: {
        findUnique: findUniqueFor(db.contactNotificationLogs),
        update: updateFor(db.contactNotificationLogs),
        updateMany: updateManyFor(db.contactNotificationLogs),
        findMany: findManyFor(db.contactNotificationLogs, { contact: contactResolver }),
      },
      user: {
        findUnique: findUniqueFor(db.users),
        findMany: findManyFor(db.users, {}),
      },
      company: { findUnique: findUniqueFor(db.companies) },
      contact: { findUnique: findUniqueFor(db.contacts) },
      activityLogEntry: {
        create: vi.fn().mockResolvedValue({ id: "audit-entry-fake" }),
      },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

// The retry path eventually calls sendOutboundEmail(). Everything else about
// the transport (Resend HTTP call, env var checks) is irrelevant for these
// tests — we want to control delivered/reason directly.
const sendOutboundEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outboundEmail", () => ({
  isOutboundEmailConfigured: () => true,
  sendOutboundEmail: sendOutboundEmailMock,
}));

// Bypass the real CompanySetting cache + DB read: dispatch only consumes
// `meta` (for digest / quiet hours / replyTo) and `timezone`.
vi.mock("@/lib/companySettings", () => ({
  getCompanySettings: async (companyId: string) => ({
    id: `cs-${companyId}`,
    companyId,
    timezone: "America/New_York",
    meta: null,
  }),
}));

vi.mock("@/lib/contactUnsubscribe", () => ({
  buildUnsubscribeUrl: () => null,
}));

import { GET, POST } from "./route";
import { getCurrentUser } from "@/lib/auth";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://test.example.com/api/admin/notification-failures",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "test.example.com",
      },
      body: JSON.stringify(body),
    },
  );
}

function makeGetRequest(query = ""): NextRequest {
  const url = `http://test.example.com/api/admin/notification-failures${query}`;
  return new NextRequest(url, {
    method: "GET",
    headers: { host: "test.example.com" },
  });
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

function seedCompany(id: string) {
  db.companies.set(id, { id, name: `Company ${id}` });
}

function seedUser(opts: { id: string; companyId: string; email: string | null }) {
  db.users.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    email: opts.email,
    firstName: "Tester",
    lastName: "Person",
    emailOptOut: false,
  });
}

function seedFailedNotification(opts: {
  id: string;
  companyId: string;
  userId: string;
  failureReason?: string;
}) {
  db.notifications.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    userId: opts.userId,
    event: "drawApprovals",
    channel: "email",
    title: "Draw approval needed",
    body: "A draw is waiting on your approval.",
    link: "/draws/123",
    meta: null,
    status: "Failed",
    urgent: false,
    scheduledFor: null,
    sentAt: null,
    failedAt: new Date("2026-04-29T10:00:00Z"),
    failureReason: opts.failureReason ?? "smtp_bounce",
    resolvedAt: null,
    resolvedById: null,
    resolvedReason: null,
    readAt: null,
    dedupeKey: `dedupe-${opts.id}`,
    createdAt: new Date("2026-04-28T00:00:00Z"),
  });
}

function seedContact(opts: {
  id: string;
  companyId: string;
  email: string | null;
  emailOptOut?: boolean;
}) {
  db.contacts.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    name: "Contractor McTester",
    email: opts.email,
    emailOptOut: !!opts.emailOptOut,
  });
}

function seedFailedContactLog(opts: {
  id: string;
  companyId: string;
  contactId: string;
  failureReason?: string;
}) {
  db.contactNotificationLogs.set(opts.id, {
    id: opts.id,
    companyId: opts.companyId,
    contactId: opts.contactId,
    event: "missingUpdates",
    dedupeKey: `dedupe-${opts.id}`,
    status: "Failed",
    title: "Update needed",
    link: null,
    recipientEmail: "vendor@test",
    failureReason: opts.failureReason ?? "smtp_bounce",
    failedAt: new Date("2026-04-29T11:00:00Z"),
    resolvedAt: null,
    resolvedById: null,
    resolvedReason: null,
    sentAt: new Date("2026-04-28T00:00:00Z"),
  });
}

describe("POST /api/admin/notification-failures (retry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401 and never invokes the transport", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ id: "u:n1", action: "retry" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers with 403 and never invokes the transport", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await POST(makeRequest({ id: "u:n1", action: "retry" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the targeted row belongs to another tenant", async () => {
    seedUser({ id: "u-other", companyId: "co-2", email: "other@test" });
    seedFailedNotification({ id: "n-cross", companyId: "co-2", userId: "u-other" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-cross", companyId: "co-1" }),
    );

    const res = await POST(makeRequest({ id: "u:n-cross", action: "retry" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "wrong_company" });
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();

    // Cross-tenant attempt must not mutate the victim row.
    const victim = db.notifications.get("n-cross") as Record<string, unknown>;
    expect(victim.status).toBe("Failed");
    expect(victim.failureReason).toBe("smtp_bounce");
  });

  it("flips a Failed Notification row to Sent in place on a successful user retry", async () => {
    seedUser({ id: "u-recipient", companyId: "co-1", email: "recipient@test" });
    seedFailedNotification({ id: "n-success", companyId: "co-1", userId: "u-recipient" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-success", companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: true, messageId: "msg-1" });

    const before = db.notifications.size;
    const res = await POST(makeRequest({ id: "u:n-success", action: "retry" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delivered).toBe(true);
    expect(body.status).toBe("Sent");
    expect(body.failedAt).toBeNull();

    // No new row written — same id, status mutated in place.
    expect(db.notifications.size).toBe(before);
    const row = db.notifications.get("n-success") as Record<string, unknown>;
    expect(row.status).toBe("Sent");
    expect(row.failureReason).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.sentAt).toBeInstanceOf(Date);

    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOutboundEmailMock.mock.calls[0][0].to).toBe("recipient@test");
  });

  it("flips a Failed ContactNotificationLog row to Sent in place on a successful contact retry", async () => {
    seedContact({ id: "c-1", companyId: "co-1", email: "vendor@test" });
    seedFailedContactLog({ id: "cl-success", companyId: "co-1", contactId: "c-1" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-cl", companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: true, messageId: "msg-2" });

    const before = db.contactNotificationLogs.size;
    const res = await POST(makeRequest({ id: "c:cl-success", action: "retry" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delivered).toBe(true);
    expect(body.status).toBe("Sent");
    expect(body.failedAt).toBeNull();

    expect(db.contactNotificationLogs.size).toBe(before);
    const row = db.contactNotificationLogs.get("cl-success") as Record<string, unknown>;
    expect(row.status).toBe("Sent");
    expect(row.failureReason).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.recipientEmail).toBe("vendor@test");

    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
    expect(sendOutboundEmailMock.mock.calls[0][0].to).toBe("vendor@test");
  });

  it("updates failureReason in place — no duplicate row — when a user retry still fails", async () => {
    seedUser({ id: "u-still", companyId: "co-1", email: "still@test" });
    seedFailedNotification({
      id: "n-still",
      companyId: "co-1",
      userId: "u-still",
      failureReason: "old_reason",
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-still", companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: false, reason: "new_smtp_bounce" });

    const before = db.notifications.size;
    const res = await POST(makeRequest({ id: "u:n-still", action: "retry" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delivered).toBe(false);
    expect(body.status).toBe("Failed");
    expect(body.reason).toBe("new_smtp_bounce");

    expect(db.notifications.size).toBe(before);
    const row = db.notifications.get("n-still") as Record<string, unknown>;
    expect(row.status).toBe("Failed");
    expect(row.failureReason).toBe("new_smtp_bounce");
    expect(row.failedAt).toBeInstanceOf(Date);
    // Lease-style sentAt must be cleared so the row doesn't masquerade as
    // delivered after a non-delivered retry.
    expect(row.sentAt).toBeNull();
  });

  it("updates failureReason in place — no duplicate row — when a contact retry still fails", async () => {
    seedContact({ id: "c-still", companyId: "co-1", email: "vendorbad@test" });
    seedFailedContactLog({
      id: "cl-still",
      companyId: "co-1",
      contactId: "c-still",
      failureReason: "old_contact_reason",
    });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-clstill", companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: false, reason: "still_bouncing" });

    const before = db.contactNotificationLogs.size;
    const res = await POST(makeRequest({ id: "c:cl-still", action: "retry" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delivered).toBe(false);
    expect(body.status).toBe("Failed");
    expect(body.reason).toBe("still_bouncing");

    expect(db.contactNotificationLogs.size).toBe(before);
    const row = db.contactNotificationLogs.get("cl-still") as Record<string, unknown>;
    expect(row.status).toBe("Failed");
    expect(row.failureReason).toBe("still_bouncing");
    expect(row.failedAt).toBeInstanceOf(Date);
  });

  it("returns 429 once an admin exceeds the per-admin retry window, even across distinct rows", async () => {
    // The per-admin limit (ADMIN_MAX_RETRIES_PER_WINDOW = 10 / minute) is a
    // separate guard from the per-row cooldown. To isolate it we retry 10
    // *different* row ids — each one passes the per-row check — and assert
    // the 11th attempt (also a fresh row id) is rejected as 429.
    const ADMIN_MAX = 10;
    const ADMIN_WINDOW_MS = 60_000;
    const adminId = "u-admin-window";
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: adminId, companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: true, messageId: "msg-window" });

    const rowIds = Array.from({ length: ADMIN_MAX + 1 }, (_, i) => `n-window-${i}`);
    for (const id of rowIds.slice(0, ADMIN_MAX)) {
      seedUser({ id: `u-${id}`, companyId: "co-1", email: `${id}@test` });
      seedFailedNotification({ id, companyId: "co-1", userId: `u-${id}` });
    }
    const lastId = rowIds[ADMIN_MAX];
    seedUser({ id: `u-${lastId}`, companyId: "co-1", email: `${lastId}@test` });
    seedFailedNotification({ id: lastId, companyId: "co-1", userId: `u-${lastId}` });

    for (let i = 0; i < ADMIN_MAX; i++) {
      const r = await POST(makeRequest({ id: `u:${rowIds[i]}`, action: "retry" }));
      expect(r.status).toBe(200);
    }
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(ADMIN_MAX);

    // 11th retry — fresh row id so the per-row cooldown can't be the cause.
    const overflow = await POST(makeRequest({ id: `u:${lastId}`, action: "retry" }));
    expect(overflow.status).toBe(429);
    expect(overflow.headers.get("Retry-After")).not.toBeNull();
    const body = await overflow.json();
    expect(body.error).toMatch(/wait/i);
    expect(typeof body.retryAfterMs).toBe("number");
    expect(body.retryAfterMs).toBeGreaterThan(0);
    // retryAfterMs is bounded by ADMIN_WINDOW_MS — anything larger would mean
    // the limiter is using the wrong window for the admin branch.
    expect(body.retryAfterMs).toBeLessThanOrEqual(ADMIN_WINDOW_MS);

    // The over-limit retry must not have invoked the transport again.
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(ADMIN_MAX);

    // The 11th row must remain Failed — the limiter ran before the dispatch.
    const lastRow = db.notifications.get(lastId) as Record<string, unknown>;
    expect(lastRow.status).toBe("Failed");
  });

  it("returns 429 with Retry-After when the same row is retried twice in quick succession", async () => {
    seedUser({ id: "u-rl", companyId: "co-1", email: "ratelimited@test" });
    seedFailedNotification({ id: "n-rl", companyId: "co-1", userId: "u-rl" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-rl", companyId: "co-1" }),
    );
    sendOutboundEmailMock.mockResolvedValue({ delivered: false, reason: "smtp_temp" });

    const first = await POST(makeRequest({ id: "u:n-rl", action: "retry" }));
    expect(first.status).toBe(200);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);

    const second = await POST(makeRequest({ id: "u:n-rl", action: "retry" }));
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).not.toBeNull();
    const body = await second.json();
    expect(body.error).toMatch(/wait/i);
    expect(typeof body.retryAfterMs).toBe("number");
    expect(body.retryAfterMs).toBeGreaterThan(0);

    // Crucially: the rate-limited request must NOT touch the outbound
    // transport — the cooldown is the whole point of this branch.
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/notification-failures (bulk dismiss)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401 and never mutates rows", async () => {
    seedUser({ id: "u-recipient", companyId: "co-1", email: "r@test" });
    seedFailedNotification({ id: "n-anon", companyId: "co-1", userId: "u-recipient" });
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ ids: ["u:n-anon"] }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    const row = db.notifications.get("n-anon") as Record<string, unknown>;
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.resolvedReason).toBeNull();
  });

  it("rejects non-admin callers with 403 and never mutates rows", async () => {
    seedUser({ id: "u-recipient", companyId: "co-1", email: "r@test" });
    seedFailedNotification({ id: "n-pm", companyId: "co-1", userId: "u-recipient" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await POST(makeRequest({ ids: ["u:n-pm"] }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    const row = db.notifications.get("n-pm") as Record<string, unknown>;
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.resolvedReason).toBeNull();
  });

  it("returns 400 when `ids` is an empty array", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: [] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing `ids`" });
  });

  it("returns 400 when `ids` is missing AND no retry action is supplied", async () => {
    // No `ids` and no `action: 'retry'` should fall through to the
    // 'Unknown action' branch — there's nothing to do either way.
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when every id in `ids` is a non-string and the array filters down to empty", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: [42, null, true] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing `ids`" });
  });

  it("returns 400 with the `invalid` array when any id is missing the u:/c: prefix", async () => {
    seedUser({ id: "u-recipient", companyId: "co-1", email: "r@test" });
    seedFailedNotification({ id: "n-good", companyId: "co-1", userId: "u-recipient" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(
      makeRequest({ ids: ["u:n-good", "no-prefix", "x:also-bad"] }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid id format/);
    expect(body.invalid).toEqual(["no-prefix", "x:also-bad"]);

    // The otherwise-valid id in the same payload must NOT be touched —
    // a malformed id rejects the whole request.
    const row = db.notifications.get("n-good") as Record<string, unknown>;
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.resolvedReason).toBeNull();
  });

  it("resolves mixed user + contact ids in one call, returning the combined count", async () => {
    seedUser({ id: "u-r1", companyId: "co-1", email: "r1@test" });
    seedUser({ id: "u-r2", companyId: "co-1", email: "r2@test" });
    seedFailedNotification({ id: "n-1", companyId: "co-1", userId: "u-r1" });
    seedFailedNotification({ id: "n-2", companyId: "co-1", userId: "u-r2" });
    seedContact({ id: "c-1", companyId: "co-1", email: "v1@test" });
    seedContact({ id: "c-2", companyId: "co-1", email: "v2@test" });
    seedFailedContactLog({ id: "cl-1", companyId: "co-1", contactId: "c-1" });
    seedFailedContactLog({ id: "cl-2", companyId: "co-1", contactId: "c-2" });

    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-mix", companyId: "co-1" }),
    );

    const res = await POST(
      makeRequest({ ids: ["u:n-1", "u:n-2", "c:cl-1", "c:cl-2"] }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolved: 4 });

    for (const id of ["n-1", "n-2"]) {
      const row = db.notifications.get(id) as Record<string, unknown>;
      expect(row.resolvedAt).toBeInstanceOf(Date);
      expect(row.resolvedById).toBe("u-admin-mix");
      expect(row.resolvedReason).toBe("admin_dismissed");
      // The dismiss path must NOT flip `status` away from Failed — the row
      // stays in the audit log marked Failed-but-resolved.
      expect(row.status).toBe("Failed");
    }
    for (const id of ["cl-1", "cl-2"]) {
      const row = db.contactNotificationLogs.get(id) as Record<string, unknown>;
      expect(row.resolvedAt).toBeInstanceOf(Date);
      expect(row.resolvedById).toBe("u-admin-mix");
      expect(row.resolvedReason).toBe("admin_dismissed");
      expect(row.status).toBe("Failed");
    }
  });

  it("ignores cross-tenant ids — count excludes them and the victim rows stay unresolved", async () => {
    // Caller's own row + two other tenants' rows in the same payload.
    seedUser({ id: "u-mine", companyId: "co-1", email: "mine@test" });
    seedFailedNotification({ id: "n-mine", companyId: "co-1", userId: "u-mine" });

    seedUser({ id: "u-victim", companyId: "co-2", email: "victim@test" });
    seedFailedNotification({ id: "n-victim", companyId: "co-2", userId: "u-victim" });
    seedContact({ id: "c-victim", companyId: "co-2", email: "vv@test" });
    seedFailedContactLog({ id: "cl-victim", companyId: "co-2", contactId: "c-victim" });

    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-cross", companyId: "co-1" }),
    );

    const res = await POST(
      makeRequest({ ids: ["u:n-mine", "u:n-victim", "c:cl-victim"] }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolved: 1 });

    // Caller's own row WAS resolved.
    const mine = db.notifications.get("n-mine") as Record<string, unknown>;
    expect(mine.resolvedAt).toBeInstanceOf(Date);
    expect(mine.resolvedById).toBe("u-admin-cross");
    expect(mine.resolvedReason).toBe("admin_dismissed");

    // Other tenant's rows MUST NOT be touched.
    const victimUser = db.notifications.get("n-victim") as Record<string, unknown>;
    expect(victimUser.resolvedAt).toBeNull();
    expect(victimUser.resolvedById).toBeNull();
    expect(victimUser.resolvedReason).toBeNull();
    const victimContact = db.contactNotificationLogs.get("cl-victim") as Record<string, unknown>;
    expect(victimContact.resolvedAt).toBeNull();
    expect(victimContact.resolvedById).toBeNull();
    expect(victimContact.resolvedReason).toBeNull();
  });

  it("does not double-count rows that are already resolved", async () => {
    seedUser({ id: "u-already", companyId: "co-1", email: "already@test" });
    seedFailedNotification({ id: "n-already", companyId: "co-1", userId: "u-already" });
    seedFailedNotification({ id: "n-fresh", companyId: "co-1", userId: "u-already" });
    seedContact({ id: "c-already", companyId: "co-1", email: "vendor@test" });
    seedFailedContactLog({ id: "cl-already", companyId: "co-1", contactId: "c-already" });
    seedFailedContactLog({ id: "cl-fresh", companyId: "co-1", contactId: "c-already" });

    // Pre-resolve one row in each table so the bulk call has a mix.
    const earlier = new Date("2026-04-29T09:00:00Z");
    const preResolvedNotification = db.notifications.get("n-already") as Record<string, unknown>;
    db.notifications.set("n-already", {
      ...preResolvedNotification,
      resolvedAt: earlier,
      resolvedById: "u-someone-else",
      resolvedReason: "auto_swept",
    });
    const preResolvedContactLog = db.contactNotificationLogs.get("cl-already") as Record<string, unknown>;
    db.contactNotificationLogs.set("cl-already", {
      ...preResolvedContactLog,
      resolvedAt: earlier,
      resolvedById: "u-someone-else",
      resolvedReason: "auto_swept",
    });

    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-dedupe", companyId: "co-1" }),
    );

    const res = await POST(
      makeRequest({
        ids: ["u:n-already", "u:n-fresh", "c:cl-already", "c:cl-fresh"],
      }),
    );

    expect(res.status).toBe(200);
    // Only the two unresolved rows count toward the response.
    expect(await res.json()).toEqual({ resolved: 2 });

    // Pre-resolved rows preserve their original metadata — the new dismiss
    // call must NOT overwrite who/when/why they were originally cleared.
    const stillAlready = db.notifications.get("n-already") as Record<string, unknown>;
    expect(stillAlready.resolvedAt).toBe(earlier);
    expect(stillAlready.resolvedById).toBe("u-someone-else");
    expect(stillAlready.resolvedReason).toBe("auto_swept");
    const stillAlreadyContact = db.contactNotificationLogs.get("cl-already") as Record<string, unknown>;
    expect(stillAlreadyContact.resolvedAt).toBe(earlier);
    expect(stillAlreadyContact.resolvedById).toBe("u-someone-else");
    expect(stillAlreadyContact.resolvedReason).toBe("auto_swept");

    // Freshly-resolved rows now carry the calling admin's stamp.
    const fresh = db.notifications.get("n-fresh") as Record<string, unknown>;
    expect(fresh.resolvedAt).toBeInstanceOf(Date);
    expect(fresh.resolvedById).toBe("u-admin-dedupe");
    expect(fresh.resolvedReason).toBe("admin_dismissed");
    const freshContact = db.contactNotificationLogs.get("cl-fresh") as Record<string, unknown>;
    expect(freshContact.resolvedAt).toBeInstanceOf(Date);
    expect(freshContact.resolvedById).toBe("u-admin-dedupe");
    expect(freshContact.resolvedReason).toBe("admin_dismissed");
  });

  it("never invokes the outbound email transport — dismiss is a DB-only operation", async () => {
    seedUser({ id: "u-noemail", companyId: "co-1", email: "noemail@test" });
    seedFailedNotification({ id: "n-noemail", companyId: "co-1", userId: "u-noemail" });
    seedContact({ id: "c-noemail", companyId: "co-1", email: "v@test" });
    seedFailedContactLog({ id: "cl-noemail", companyId: "co-1", contactId: "c-noemail" });
    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-noemail", companyId: "co-1" }),
    );

    const res = await POST(
      makeRequest({ ids: ["u:n-noemail", "c:cl-noemail"] }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolved: 2 });
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/notification-failures (reopen)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seedResolvedNotification(opts: {
    id: string;
    companyId: string;
    userId: string;
    resolvedById?: string;
  }) {
    db.notifications.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      userId: opts.userId,
      event: "drawApprovals",
      channel: "email",
      title: "Draw approval needed",
      body: "A draw is waiting.",
      link: "/draws/123",
      meta: null,
      status: "Failed",
      urgent: false,
      scheduledFor: null,
      sentAt: null,
      failedAt: new Date("2026-04-29T10:00:00Z"),
      failureReason: "smtp_bounce",
      resolvedAt: new Date("2026-04-30T08:00:00Z"),
      resolvedById: opts.resolvedById ?? "u-other-admin",
      resolvedReason: "admin_dismissed",
      readAt: null,
      dedupeKey: `dedupe-${opts.id}`,
      createdAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  function seedResolvedContactLog(opts: {
    id: string;
    companyId: string;
    contactId: string;
  }) {
    db.contactNotificationLogs.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      contactId: opts.contactId,
      event: "missingUpdates",
      dedupeKey: `dedupe-${opts.id}`,
      status: "Failed",
      title: "Update needed",
      link: null,
      recipientEmail: "vendor@test",
      failureReason: "smtp_bounce",
      failedAt: new Date("2026-04-29T11:00:00Z"),
      resolvedAt: new Date("2026-04-30T09:00:00Z"),
      resolvedById: "u-other-admin",
      resolvedReason: "admin_dismissed",
      sentAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  it("clears resolvedAt / resolvedById / resolvedReason on a user failure row", async () => {
    seedUser({ id: "u-r1", companyId: "co-1", email: "r1@test" });
    seedResolvedNotification({ id: "n-resolved", companyId: "co-1", userId: "u-r1" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-1", companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: ["u:n-resolved"], action: "reopen" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reopened: 1 });

    const row = db.notifications.get("n-resolved") as Record<string, unknown>;
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.resolvedReason).toBeNull();
    // Status must remain Failed — reopen just un-dismisses the row.
    expect(row.status).toBe("Failed");
  });

  it("clears resolvedAt / resolvedById / resolvedReason on a contact log row", async () => {
    seedContact({ id: "c-r1", companyId: "co-1", email: "v@test" });
    seedResolvedContactLog({ id: "cl-resolved", companyId: "co-1", contactId: "c-r1" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-2", companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: ["c:cl-resolved"], action: "reopen" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reopened: 1 });

    const row = db.contactNotificationLogs.get("cl-resolved") as Record<string, unknown>;
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.resolvedReason).toBeNull();
    expect(row.status).toBe("Failed");
  });

  it("reopens mixed user + contact ids in one call, returning the combined count", async () => {
    seedUser({ id: "u-mix1", companyId: "co-1", email: "m1@test" });
    seedUser({ id: "u-mix2", companyId: "co-1", email: "m2@test" });
    seedResolvedNotification({ id: "n-mix1", companyId: "co-1", userId: "u-mix1" });
    seedResolvedNotification({ id: "n-mix2", companyId: "co-1", userId: "u-mix2" });
    seedContact({ id: "c-mix1", companyId: "co-1", email: "v1@test" });
    seedContact({ id: "c-mix2", companyId: "co-1", email: "v2@test" });
    seedResolvedContactLog({ id: "cl-mix1", companyId: "co-1", contactId: "c-mix1" });
    seedResolvedContactLog({ id: "cl-mix2", companyId: "co-1", contactId: "c-mix2" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(
      makeRequest({ ids: ["u:n-mix1", "u:n-mix2", "c:cl-mix1", "c:cl-mix2"], action: "reopen" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reopened: 4 });
  });

  it("ignores cross-tenant ids — count excludes them and the victim rows stay resolved", async () => {
    seedUser({ id: "u-mine", companyId: "co-1", email: "mine@test" });
    seedResolvedNotification({ id: "n-mine", companyId: "co-1", userId: "u-mine" });

    seedUser({ id: "u-victim", companyId: "co-2", email: "victim@test" });
    seedResolvedNotification({ id: "n-victim", companyId: "co-2", userId: "u-victim" });
    seedContact({ id: "c-victim", companyId: "co-2", email: "vv@test" });
    seedResolvedContactLog({ id: "cl-victim", companyId: "co-2", contactId: "c-victim" });

    mockGetCurrentUser.mockResolvedValue(
      adminUser({ id: "u-admin-cross", companyId: "co-1" }),
    );

    const res = await POST(
      makeRequest({ ids: ["u:n-mine", "u:n-victim", "c:cl-victim"], action: "reopen" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reopened: 1 });

    // Caller's own row is cleared.
    const mine = db.notifications.get("n-mine") as Record<string, unknown>;
    expect(mine.resolvedAt).toBeNull();

    // Other tenant's rows MUST remain resolved.
    const victimUser = db.notifications.get("n-victim") as Record<string, unknown>;
    expect(victimUser.resolvedAt).toBeInstanceOf(Date);
    const victimContact = db.contactNotificationLogs.get("cl-victim") as Record<string, unknown>;
    expect(victimContact.resolvedAt).toBeInstanceOf(Date);
  });

  it("returns 400 when ids array is empty", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: [], action: "reopen" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing `ids`/);
  });

  it("returns 400 with the invalid array when any id is missing the u:/c: prefix", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(
      makeRequest({ ids: ["u:valid", "no-prefix"], action: "reopen" }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid id format/);
    expect(body.invalid).toEqual(["no-prefix"]);
  });

  it("returns 429 when the per-admin reopen rate limit is exceeded", async () => {
    vi.useFakeTimers();
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-rate-reopen", companyId: "co-1" }));

    // Seed enough resolved rows to exhaust the limit (30 per minute).
    for (let i = 0; i < 31; i++) {
      seedUser({ id: `u-rr-${i}`, companyId: "co-1", email: `rr${i}@test` });
      seedResolvedNotification({ id: `n-rr-${i}`, companyId: "co-1", userId: `u-rr-${i}` });
    }

    let lastRes: Response | undefined;
    for (let i = 0; i < 31; i++) {
      lastRes = await POST(makeRequest({ ids: [`u:n-rr-${i}`], action: "reopen" }));
    }

    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toBeTruthy();
    const body = await lastRes!.json();
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it("does not invoke outbound email transport — reopen is a DB-only operation", async () => {
    seedUser({ id: "u-ropen-noemail", companyId: "co-1", email: "ropen@test" });
    seedResolvedNotification({ id: "n-ropen-noemail", companyId: "co-1", userId: "u-ropen-noemail" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await POST(makeRequest({ ids: ["u:n-ropen-noemail"], action: "reopen" }));

    expect(res.status).toBe(200);
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();
  });

  it("reopened rows reappear in the live GET endpoint", async () => {
    seedUser({ id: "u-live", companyId: "co-1", email: "live@test" });
    seedResolvedNotification({ id: "n-live", companyId: "co-1", userId: "u-live" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-live", companyId: "co-1" }));

    // Before reopen: row should not appear in the live list (resolvedAt is set).
    const beforeRes = await GET(makeGetRequest());
    expect(beforeRes.status).toBe(200);
    const beforeData = (await beforeRes.json()) as { items: { id: string }[] };
    expect(beforeData.items.find((x) => x.id === "u:n-live")).toBeUndefined();

    // Reopen the row.
    const reopenRes = await POST(makeRequest({ ids: ["u:n-live"], action: "reopen" }));
    expect(reopenRes.status).toBe(200);

    // After reopen: row should appear in the live list.
    const afterRes = await GET(makeGetRequest());
    expect(afterRes.status).toBe(200);
    const afterData = (await afterRes.json()) as { items: { id: string }[] };
    expect(afterData.items.find((x) => x.id === "u:n-live")).toBeDefined();
  });

  it("reopened user row disappears from the resolved audit list and reappears in the live list", async () => {
    seedUser({ id: "u-sync", companyId: "co-1", email: "sync@test" });
    seedResolvedNotification({ id: "n-sync", companyId: "co-1", userId: "u-sync" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-sync", companyId: "co-1" }));

    // Before reopen: row appears in the resolved audit list.
    const resolvedBefore = await GET(makeGetRequest("?resolved=1"));
    expect(resolvedBefore.status).toBe(200);
    const resolvedBeforeData = (await resolvedBefore.json()) as { items: { id: string }[] };
    expect(resolvedBeforeData.items.find((x) => x.id === "u:n-sync")).toBeDefined();

    // Before reopen: row must NOT appear in the live list.
    const liveBefore = await GET(makeGetRequest());
    expect(liveBefore.status).toBe(200);
    const liveBeforeData = (await liveBefore.json()) as { items: { id: string }[] };
    expect(liveBeforeData.items.find((x) => x.id === "u:n-sync")).toBeUndefined();

    // Reopen the row.
    const reopenRes = await POST(makeRequest({ ids: ["u:n-sync"], action: "reopen" }));
    expect(reopenRes.status).toBe(200);
    expect(await reopenRes.json()).toEqual({ reopened: 1 });

    // After reopen: row must NOT appear in the resolved audit list.
    const resolvedAfter = await GET(makeGetRequest("?resolved=1"));
    expect(resolvedAfter.status).toBe(200);
    const resolvedAfterData = (await resolvedAfter.json()) as { items: { id: string }[] };
    expect(resolvedAfterData.items.find((x) => x.id === "u:n-sync")).toBeUndefined();

    // After reopen: row must appear in the live list.
    const liveAfter = await GET(makeGetRequest());
    expect(liveAfter.status).toBe(200);
    const liveAfterData = (await liveAfter.json()) as { items: { id: string }[] };
    expect(liveAfterData.items.find((x) => x.id === "u:n-sync")).toBeDefined();
  });

  it("reopened contact row disappears from the resolved audit list and reappears in the live list", async () => {
    seedContact({ id: "c-sync", companyId: "co-1", email: "vendor-sync@test" });
    seedResolvedContactLog({ id: "cl-sync", companyId: "co-1", contactId: "c-sync" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ id: "u-admin-csync", companyId: "co-1" }));

    // Before reopen: row appears in the resolved audit list.
    const resolvedBefore = await GET(makeGetRequest("?resolved=1"));
    expect(resolvedBefore.status).toBe(200);
    const resolvedBeforeData = (await resolvedBefore.json()) as { items: { id: string }[] };
    expect(resolvedBeforeData.items.find((x) => x.id === "c:cl-sync")).toBeDefined();

    // Before reopen: row must NOT appear in the live list.
    const liveBefore = await GET(makeGetRequest());
    expect(liveBefore.status).toBe(200);
    const liveBeforeData = (await liveBefore.json()) as { items: { id: string }[] };
    expect(liveBeforeData.items.find((x) => x.id === "c:cl-sync")).toBeUndefined();

    // Reopen the row.
    const reopenRes = await POST(makeRequest({ ids: ["c:cl-sync"], action: "reopen" }));
    expect(reopenRes.status).toBe(200);
    expect(await reopenRes.json()).toEqual({ reopened: 1 });

    // After reopen: row must NOT appear in the resolved audit list.
    const resolvedAfter = await GET(makeGetRequest("?resolved=1"));
    expect(resolvedAfter.status).toBe(200);
    const resolvedAfterData = (await resolvedAfter.json()) as { items: { id: string }[] };
    expect(resolvedAfterData.items.find((x) => x.id === "c:cl-sync")).toBeUndefined();

    // After reopen: row must appear in the live list.
    const liveAfter = await GET(makeGetRequest());
    expect(liveAfter.status).toBe(200);
    const liveAfterData = (await liveAfter.json()) as { items: { id: string }[] };
    expect(liveAfterData.items.find((x) => x.id === "c:cl-sync")).toBeDefined();
  });
});

describe("GET /api/admin/notification-failures?resolved=1 (resolved audit list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Seed helpers scoped to this describe block so ids don't collide.

  function seedResolvedN(opts: {
    id: string;
    companyId: string;
    userId: string;
    resolvedAt: Date;
    resolvedById?: string | null;
    resolvedReason?: string;
    failureReason?: string;
  }) {
    db.notifications.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      userId: opts.userId,
      event: "drawApprovals",
      channel: "email",
      title: "Draw approval needed",
      body: "A draw is waiting.",
      link: "/draws/123",
      meta: null,
      status: "Failed",
      urgent: false,
      scheduledFor: null,
      sentAt: null,
      failedAt: new Date("2026-04-29T10:00:00Z"),
      failureReason: opts.failureReason ?? "smtp_bounce",
      resolvedAt: opts.resolvedAt,
      resolvedById: opts.resolvedById !== undefined ? opts.resolvedById : "u-resolver",
      resolvedReason: opts.resolvedReason ?? "admin_dismissed",
      readAt: null,
      dedupeKey: `dedupe-${opts.id}`,
      createdAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  function seedResolvedC(opts: {
    id: string;
    companyId: string;
    contactId: string;
    resolvedAt: Date;
    resolvedById?: string | null;
    resolvedReason?: string;
  }) {
    db.contactNotificationLogs.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      contactId: opts.contactId,
      event: "missingUpdates",
      dedupeKey: `dedupe-${opts.id}`,
      status: "Failed",
      title: "Update needed",
      link: null,
      recipientEmail: "vendor@test",
      failureReason: "smtp_bounce",
      failedAt: new Date("2026-04-29T11:00:00Z"),
      resolvedAt: opts.resolvedAt,
      resolvedById: opts.resolvedById !== undefined ? opts.resolvedById : "u-resolver",
      resolvedReason: opts.resolvedReason ?? "admin_dismissed",
      sentAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  it("rejects unauthenticated callers with 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeGetRequest("?resolved=1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects non-admin callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await GET(makeGetRequest("?resolved=1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("scopes results to the caller's company — cross-tenant resolved rows are excluded", async () => {
    const ts = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-mine-ra", companyId: "co-1", email: "mine@test" });
    seedResolvedN({ id: "n-mine-ra", companyId: "co-1", userId: "u-mine-ra", resolvedAt: ts });

    seedUser({ id: "u-theirs-ra", companyId: "co-2", email: "theirs@test" });
    seedResolvedN({ id: "n-theirs-ra", companyId: "co-2", userId: "u-theirs-ra", resolvedAt: ts });

    seedContact({ id: "c-theirs-ra", companyId: "co-2", email: "v@test" });
    seedResolvedC({ id: "cl-theirs-ra", companyId: "co-2", contactId: "c-theirs-ra", resolvedAt: ts });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("u:n-mine-ra");
    expect(ids).not.toContain("u:n-theirs-ra");
    expect(ids).not.toContain("c:cl-theirs-ra");
  });

  it("excludes unresolved rows — only rows with resolvedAt != null appear", async () => {
    const ts = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-res-ra", companyId: "co-1", email: "res@test" });
    seedResolvedN({ id: "n-res-ra", companyId: "co-1", userId: "u-res-ra", resolvedAt: ts });

    seedUser({ id: "u-live-ra", companyId: "co-1", email: "live@test" });
    seedFailedNotification({ id: "n-live-ra", companyId: "co-1", userId: "u-live-ra" });

    seedContact({ id: "c-live-ra", companyId: "co-1", email: "vlive@test" });
    seedFailedContactLog({ id: "cl-live-ra", companyId: "co-1", contactId: "c-live-ra" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("u:n-res-ra");
    expect(ids).not.toContain("u:n-live-ra");
    expect(ids).not.toContain("c:cl-live-ra");
  });

  it("returns a u: row with resolvedAt, resolvedReason, resolvedById and resolvedByName populated", async () => {
    const ts = new Date("2026-04-30T08:00:00Z");
    seedUser({ id: "u-shape-ra", companyId: "co-1", email: "shape@test" });
    db.users.set("u-resolver-ra", {
      id: "u-resolver-ra",
      companyId: "co-1",
      email: "resolver@test",
      firstName: "Resolver",
      lastName: "Admin",
    });
    seedResolvedN({
      id: "n-shape-ra",
      companyId: "co-1",
      userId: "u-shape-ra",
      resolvedAt: ts,
      resolvedById: "u-resolver-ra",
      resolvedReason: "address_fixed",
      failureReason: "smtp_bounce",
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row.id).toBe("u:n-shape-ra");
    expect(row.kind).toBe("user");
    expect(row.recipientId).toBe("u-shape-ra");
    expect(row.recipientEmail).toBe("shape@test");
    expect(row.reason).toBe("smtp_bounce");
    expect(row.resolvedAt).toBe(ts.toISOString());
    expect(row.resolvedReason).toBe("address_fixed");
    expect(row.resolvedById).toBe("u-resolver-ra");
    expect(row.resolvedByName).toBe("Resolver Admin");
    expect(row.link).toBe("/admin?panel=users");
  });

  it("returns a c: row with resolvedAt, resolvedReason, resolvedById and resolvedByName populated", async () => {
    const ts = new Date("2026-04-30T09:00:00Z");
    seedContact({ id: "c-shape-ra", companyId: "co-1", email: "vendor-shape@test" });
    db.users.set("u-resolver-c", {
      id: "u-resolver-c",
      companyId: "co-1",
      email: "resolver-c@test",
      firstName: "Contact",
      lastName: "Resolver",
    });
    seedResolvedC({
      id: "cl-shape-ra",
      companyId: "co-1",
      contactId: "c-shape-ra",
      resolvedAt: ts,
      resolvedById: "u-resolver-c",
      resolvedReason: "vendor_updated",
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row.id).toBe("c:cl-shape-ra");
    expect(row.kind).toBe("contact");
    expect(row.recipientId).toBe("c-shape-ra");
    expect(row.recipientEmail).toBe("vendor@test");
    expect(row.resolvedAt).toBe(ts.toISOString());
    expect(row.resolvedReason).toBe("vendor_updated");
    expect(row.resolvedById).toBe("u-resolver-c");
    expect(row.resolvedByName).toBe("Contact Resolver");
    expect(row.link).toBe("/contacts/c-shape-ra");
  });

  it("sets resolvedByName: null for auto-cleared rows where resolvedById is null", async () => {
    const ts = new Date("2026-04-30T07:00:00Z");
    seedUser({ id: "u-auto-ra", companyId: "co-1", email: "auto@test" });
    seedResolvedN({
      id: "n-auto-ra",
      companyId: "co-1",
      userId: "u-auto-ra",
      resolvedAt: ts,
      resolvedById: null,
      resolvedReason: "auto_sweep",
    });
    seedContact({ id: "c-auto-ra", companyId: "co-1", email: "v-auto@test" });
    seedResolvedC({
      id: "cl-auto-ra",
      companyId: "co-1",
      contactId: "c-auto-ra",
      resolvedAt: new Date("2026-04-30T06:00:00Z"),
      resolvedById: null,
      resolvedReason: "auto_sweep",
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(2);
    for (const row of body.items) {
      expect(row.resolvedByName).toBeNull();
      expect(row.resolvedById).toBeNull();
    }
  });

  it("sorts the merged result by resolvedAt DESC (newest-first)", async () => {
    seedUser({ id: "u-s1", companyId: "co-1", email: "s1@test" });
    seedUser({ id: "u-s2", companyId: "co-1", email: "s2@test" });
    seedContact({ id: "c-s1", companyId: "co-1", email: "vs1@test" });
    seedResolvedN({ id: "n-s1", companyId: "co-1", userId: "u-s1", resolvedAt: new Date("2026-04-30T08:00:00Z") });
    seedResolvedN({ id: "n-s2", companyId: "co-1", userId: "u-s2", resolvedAt: new Date("2026-04-30T12:00:00Z") });
    seedResolvedC({ id: "cl-s1", companyId: "co-1", contactId: "c-s1", resolvedAt: new Date("2026-04-30T10:00:00Z") });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; resolvedAt: string }> };

    expect(body.items.map((i) => i.id)).toEqual(["u:n-s2", "c:cl-s1", "u:n-s1"]);

    const stamps = body.items.map((i) => i.resolvedAt);
    const sortedDesc = [...stamps].sort().reverse();
    expect(stamps).toEqual(sortedDesc);
  });

  it("returns nextCursor: null when the result fits in one page", async () => {
    const ts = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-one", companyId: "co-1", email: "one@test" });
    seedResolvedN({ id: "n-one", companyId: "co-1", userId: "u-one", resolvedAt: ts });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };

    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("returns a base64-JSON nextCursor when more rows exist, and the cursor round-trips without skips or duplicates", async () => {
    // Create 30 user-resolved rows with strictly decreasing resolvedAt
    // so the sort order is deterministic and the page boundary falls
    // inside a single table. Distinct timestamps eliminate tie-breaking.
    for (let i = 0; i < 30; i++) {
      const uid = `u-page-${i}`;
      const nid = `n-page-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `page${i}@test` });
      seedResolvedN({
        id: nid,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(Date.UTC(2026, 3, 30, 0, 0, 30 - i)),
      });
    }

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res1 = await GET(makeGetRequest("?resolved=1"));
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { items: Array<{ id: string }>; nextCursor: string | null };

    expect(body1.items).toHaveLength(25);
    expect(body1.nextCursor).not.toBeNull();

    // The cursor must decode to valid base64 JSON.
    const decoded = JSON.parse(Buffer.from(body1.nextCursor!, "base64").toString("utf8"));
    expect(decoded.ts).toBeDefined();
    expect(decoded.id).toBeDefined();

    const page1Ids = new Set(body1.items.map((i) => i.id));

    const res2 = await GET(makeGetRequest(`?resolved=1&before=${body1.nextCursor!}`));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { items: Array<{ id: string }>; nextCursor: string | null };

    expect(body2.items).toHaveLength(5);
    expect(body2.nextCursor).toBeNull();

    // No overlap between pages.
    for (const item of body2.items) {
      expect(page1Ids.has(item.id)).toBe(false);
    }

    // Together they cover all 30 rows.
    const allIds = [...body1.items.map((i) => i.id), ...body2.items.map((i) => i.id)];
    expect(new Set(allIds).size).toBe(30);
  });

  it("handles the shared-timestamp boundary correctly — the boundary row is not duplicated or skipped across pages", async () => {
    // Set up 24 rows with distinct timestamps above the boundary, then 2 rows
    // at the boundary timestamp: one u: and one c:. At equal resolvedAt the
    // merged sort is by prefixedId DESC, so "u:*" > "c:*". The 25th item on
    // page 1 will be the u: boundary row; the c: row must appear on page 2.
    const boundaryTs = new Date("2026-04-30T00:00:00Z");

    for (let i = 0; i < 24; i++) {
      const uid = `u-ts-${i}`;
      const nid = `n-ts-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `ts${i}@test` });
      seedResolvedN({
        id: nid,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(boundaryTs.getTime() + (24 - i) * 1000),
      });
    }

    // Boundary rows at the same timestamp.
    seedUser({ id: "u-bnd", companyId: "co-1", email: "bnd@test" });
    seedResolvedN({ id: "n-bnd", companyId: "co-1", userId: "u-bnd", resolvedAt: boundaryTs });
    seedContact({ id: "c-bnd", companyId: "co-1", email: "vbnd@test" });
    seedResolvedC({ id: "cl-bnd", companyId: "co-1", contactId: "c-bnd", resolvedAt: boundaryTs });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res1 = await GET(makeGetRequest("?resolved=1"));
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { items: Array<{ id: string }>; nextCursor: string | null };

    expect(body1.items).toHaveLength(25);
    expect(body1.nextCursor).not.toBeNull();

    // The u: boundary row must be the last item on page 1 (it sorts above c: at same ts).
    expect(body1.items[24].id).toBe("u:n-bnd");

    const res2 = await GET(makeGetRequest(`?resolved=1&before=${body1.nextCursor!}`));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { items: Array<{ id: string }>; nextCursor: string | null };

    expect(body2.items).toHaveLength(1);
    expect(body2.items[0].id).toBe("c:cl-bnd");
    expect(body2.nextCursor).toBeNull();

    // The boundary u: row must NOT be duplicated on page 2.
    expect(body2.items.find((i) => i.id === "u:n-bnd")).toBeUndefined();
  });

  it("accepts a legacy bare-ISO timestamp as the ?before= cursor (no id tie-break)", async () => {
    const isoTs = "2026-04-30T10:00:00.000Z";

    seedUser({ id: "u-before-ra", companyId: "co-1", email: "before@test" });
    seedResolvedN({
      id: "n-before-ra",
      companyId: "co-1",
      userId: "u-before-ra",
      resolvedAt: new Date("2026-04-30T09:00:00Z"),
    });

    seedUser({ id: "u-after-ra", companyId: "co-1", email: "after@test" });
    seedResolvedN({
      id: "n-after-ra",
      companyId: "co-1",
      userId: "u-after-ra",
      resolvedAt: new Date("2026-04-30T11:00:00Z"),
    });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest(`?resolved=1&before=${encodeURIComponent(isoTs)}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("u:n-before-ra");
    expect(ids).not.toContain("u:n-after-ra");
  });

  it("returns 400 for an invalid (garbage) ?before= cursor", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&before=not-a-valid-cursor!!!"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid.*before.*cursor/i);
  });
});

describe("GET /api/admin/notification-failures (live problems list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects non-admin callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("scopes results to the caller's company — cross-tenant rows are excluded", async () => {
    // Same-company row should appear; other-company rows must be hidden
    // even though they're also Failed/email/unresolved.
    seedUser({ id: "u-mine", companyId: "co-1", email: "mine@test" });
    seedFailedNotification({ id: "n-mine", companyId: "co-1", userId: "u-mine" });

    seedUser({ id: "u-theirs", companyId: "co-2", email: "theirs@test" });
    seedFailedNotification({ id: "n-theirs", companyId: "co-2", userId: "u-theirs" });

    seedContact({ id: "c-theirs", companyId: "co-2", email: "vendor-theirs@test" });
    seedFailedContactLog({ id: "cl-theirs", companyId: "co-2", contactId: "c-theirs" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toEqual(["u:n-mine"]);
    expect(ids).not.toContain("u:n-theirs");
    expect(ids).not.toContain("c:cl-theirs");
  });

  it("filters out resolved rows (`resolvedAt != null`) from both tables", async () => {
    seedUser({ id: "u-live", companyId: "co-1", email: "live@test" });
    seedFailedNotification({ id: "n-live", companyId: "co-1", userId: "u-live" });

    // Notification that's already been resolved — must NOT show up.
    seedUser({ id: "u-done", companyId: "co-1", email: "done@test" });
    seedFailedNotification({ id: "n-done", companyId: "co-1", userId: "u-done" });
    const nDone = db.notifications.get("n-done") as Record<string, unknown>;
    nDone.resolvedAt = new Date("2026-04-29T12:00:00Z");
    nDone.resolvedById = "u-admin";
    nDone.resolvedReason = "admin_dismissed";

    seedContact({ id: "c-live", companyId: "co-1", email: "vendor-live@test" });
    seedFailedContactLog({ id: "cl-live", companyId: "co-1", contactId: "c-live" });

    seedContact({ id: "c-done", companyId: "co-1", email: "vendor-done@test" });
    seedFailedContactLog({ id: "cl-done", companyId: "co-1", contactId: "c-done" });
    const clDone = db.contactNotificationLogs.get("cl-done") as Record<string, unknown>;
    clDone.resolvedAt = new Date("2026-04-29T12:00:00Z");
    clDone.resolvedById = "u-admin";
    clDone.resolvedReason = "admin_dismissed";

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id).sort();
    expect(ids).toEqual(["c:cl-live", "u:n-live"]);
  });

  it("returns Notification rows (`u:` prefix) with the expected shape", async () => {
    seedUser({ id: "u-shape", companyId: "co-1", email: "shape@test" });
    seedFailedNotification({
      id: "n-shape",
      companyId: "co-1",
      userId: "u-shape",
      failureReason: "smtp_bounce",
    });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row).toEqual({
      id: "u:n-shape",
      kind: "user",
      recipientId: "u-shape",
      recipientName: "Tester Person",
      recipientEmail: "shape@test",
      event: "drawApprovals",
      title: "Draw approval needed",
      reason: "smtp_bounce",
      at: new Date("2026-04-29T10:00:00Z").toISOString(),
      link: "/admin?panel=users",
    });
  });

  it("returns ContactNotificationLog rows (`c:` prefix) with the expected shape", async () => {
    seedContact({ id: "c-shape", companyId: "co-1", email: "vendor-shape@test" });
    seedFailedContactLog({
      id: "cl-shape",
      companyId: "co-1",
      contactId: "c-shape",
      failureReason: "smtp_bounce",
    });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row).toEqual({
      id: "c:cl-shape",
      kind: "contact",
      recipientId: "c-shape",
      recipientName: "Contractor McTester",
      // recipientEmail uses the row's recipientEmail (snapshot at send-time),
      // which seedFailedContactLog hard-codes to "vendor@test".
      recipientEmail: "vendor@test",
      event: "missingUpdates",
      title: "Update needed",
      reason: "smtp_bounce",
      at: new Date("2026-04-29T11:00:00Z").toISOString(),
      link: "/contacts/c-shape",
    });
  });

  it("merges both tables and sorts the combined result newest-first by `at`", async () => {
    // Interleave failure timestamps across the two tables so the sort has
    // to actually merge them — not just concat.
    seedUser({ id: "u-a", companyId: "co-1", email: "a@test" });
    seedFailedNotification({ id: "n-a", companyId: "co-1", userId: "u-a" });
    (db.notifications.get("n-a") as Record<string, unknown>).failedAt = new Date(
      "2026-04-29T08:00:00Z",
    );

    seedUser({ id: "u-c", companyId: "co-1", email: "c@test" });
    seedFailedNotification({ id: "n-c", companyId: "co-1", userId: "u-c" });
    (db.notifications.get("n-c") as Record<string, unknown>).failedAt = new Date(
      "2026-04-29T12:00:00Z",
    );

    seedContact({ id: "ct-b", companyId: "co-1", email: "b@test" });
    seedFailedContactLog({ id: "cl-b", companyId: "co-1", contactId: "ct-b" });
    (db.contactNotificationLogs.get("cl-b") as Record<string, unknown>).failedAt = new Date(
      "2026-04-29T10:00:00Z",
    );

    seedContact({ id: "ct-d", companyId: "co-1", email: "d@test" });
    seedFailedContactLog({ id: "cl-d", companyId: "co-1", contactId: "ct-d" });
    (db.contactNotificationLogs.get("cl-d") as Record<string, unknown>).failedAt = new Date(
      "2026-04-29T14:00:00Z",
    );

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; at: string }> };

    expect(body.items.map((i) => i.id)).toEqual([
      "c:cl-d", // 14:00
      "u:n-c",  // 12:00
      "c:cl-b", // 10:00
      "u:n-a",  // 08:00
    ]);

    // And the timestamps themselves are monotonically descending.
    const stamps = body.items.map((i) => i.at);
    const sortedDesc = [...stamps].sort().reverse();
    expect(stamps).toEqual(sortedDesc);
  });

  it("caps the merged response at 50 items even when both tables have more", async () => {
    // Seed 40 user failures + 40 contact failures = 80 candidates total.
    // Each table caps at 50 in prisma (so we'll get all 80 back from the
    // two queries combined), then the merge slice caps at 50.
    const TOTAL = 40;
    for (let i = 0; i < TOTAL; i++) {
      const uid = `u-cap-${i}`;
      const nid = `n-cap-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `${uid}@test` });
      seedFailedNotification({ id: nid, companyId: "co-1", userId: uid });
      // Spread failedAt across distinct timestamps so order is deterministic.
      (db.notifications.get(nid) as Record<string, unknown>).failedAt = new Date(
        Date.UTC(2026, 3, 29, 0, 0, i),
      );
    }
    for (let i = 0; i < TOTAL; i++) {
      const cid = `ct-cap-${i}`;
      const lid = `cl-cap-${i}`;
      seedContact({ id: cid, companyId: "co-1", email: `${cid}@test` });
      seedFailedContactLog({ id: lid, companyId: "co-1", contactId: cid });
      (db.contactNotificationLogs.get(lid) as Record<string, unknown>).failedAt = new Date(
        Date.UTC(2026, 3, 29, 1, 0, i),
      );
    }

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; at: string }> };

    expect(body.items).toHaveLength(50);

    // The 50 returned items must be the newest 50 across the merged stream.
    // Contact failures are an hour later than user failures, so all 40
    // contact rows come first, followed by the 10 most-recent user rows.
    const ids = body.items.map((i) => i.id);
    expect(ids.filter((id) => id.startsWith("c:"))).toHaveLength(40);
    expect(ids.filter((id) => id.startsWith("u:"))).toHaveLength(10);

    const stamps = body.items.map((i) => i.at);
    const sortedDesc = [...stamps].sort().reverse();
    expect(stamps).toEqual(sortedDesc);
  });

  it("builds recipientName from firstName + lastName when both are present", async () => {
    seedUser({ id: "u-fullname", companyId: "co-1", email: "fullname@test" });
    // seedUser already sets firstName:"Tester" lastName:"Person" — just verify
    seedFailedNotification({ id: "n-fullname", companyId: "co-1", userId: "u-fullname" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "u:n-fullname");
    expect(row).toBeDefined();
    expect(row!.recipientName).toBe("Tester Person");
  });

  it("falls back to email as recipientName when user has no first or last name", async () => {
    seedUser({ id: "u-noname", companyId: "co-1", email: "noname@test" });
    const userRow = db.users.get("u-noname") as Record<string, unknown>;
    userRow.firstName = null;
    userRow.lastName = null;
    seedFailedNotification({ id: "n-noname", companyId: "co-1", userId: "u-noname" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "u:n-noname");
    expect(row).toBeDefined();
    expect(row!.recipientName).toBe("noname@test");
    expect(row!.recipientEmail).toBe("noname@test");
  });

  it("falls back to 'Teammate' as recipientName when user has no name and no email", async () => {
    seedUser({ id: "u-ghost", companyId: "co-1", email: null });
    const userRow = db.users.get("u-ghost") as Record<string, unknown>;
    userRow.firstName = null;
    userRow.lastName = null;
    seedFailedNotification({ id: "n-ghost", companyId: "co-1", userId: "u-ghost" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "u:n-ghost");
    expect(row).toBeDefined();
    expect(row!.recipientName).toBe("Teammate");
    expect(row!.recipientEmail).toBeNull();
  });

  it("uses contact.name as recipientName when the contact record has a name", async () => {
    seedContact({ id: "c-named", companyId: "co-1", email: "named@test" });
    // seedContact sets name:"Contractor McTester"
    seedFailedContactLog({ id: "cl-named", companyId: "co-1", contactId: "c-named" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "c:cl-named");
    expect(row).toBeDefined();
    expect(row!.recipientName).toBe("Contractor McTester");
  });

  it("falls back to 'Contact' as recipientName when contact has no name", async () => {
    seedContact({ id: "c-unnamed", companyId: "co-1", email: "unnamed@test" });
    const contactRow = db.contacts.get("c-unnamed") as Record<string, unknown>;
    contactRow.name = null;
    seedFailedContactLog({ id: "cl-unnamed", companyId: "co-1", contactId: "c-unnamed" });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "c:cl-unnamed");
    expect(row).toBeDefined();
    expect(row!.recipientName).toBe("Contact");
  });

  it("prefers the row-level recipientEmail over contact.email for contact failures", async () => {
    seedContact({ id: "c-email-pref", companyId: "co-1", email: "contact-record@test" });
    seedFailedContactLog({ id: "cl-email-pref", companyId: "co-1", contactId: "c-email-pref" });
    // seedFailedContactLog hard-codes recipientEmail:"vendor@test", which
    // should win over the contact record's "contact-record@test".
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "c:cl-email-pref");
    expect(row).toBeDefined();
    expect(row!.recipientEmail).toBe("vendor@test");
  });

  it("falls back to contact.email when row-level recipientEmail is absent", async () => {
    seedContact({ id: "c-fallback-email", companyId: "co-1", email: "contact-only@test" });
    seedFailedContactLog({ id: "cl-fallback-email", companyId: "co-1", contactId: "c-fallback-email" });
    const logRow = db.contactNotificationLogs.get("cl-fallback-email") as Record<string, unknown>;
    logRow.recipientEmail = null;
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    const row = body.items.find((i) => i.id === "c:cl-fallback-email");
    expect(row).toBeDefined();
    expect(row!.recipientEmail).toBe("contact-only@test");
  });
});

describe("GET /api/admin/notification-failures (resolved audit list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    sendOutboundEmailMock.mockReset();
    seedCompany("co-1");
    seedCompany("co-2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Seed a resolved Notification (user failure) with full control over
  // resolvedAt and resolvedById so pagination and resolver-name tests can
  // exercise every branch in getResolved / buildPerTableCursorClause.
  function seedResolvedNotification(opts: {
    id: string;
    companyId: string;
    userId: string;
    resolvedAt: Date;
    resolvedById?: string | null;
    resolvedReason?: string;
  }) {
    db.notifications.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      userId: opts.userId,
      event: "drawApprovals",
      channel: "email",
      title: "Draw approval needed",
      body: "A draw is waiting.",
      link: "/draws/123",
      meta: null,
      status: "Failed",
      urgent: false,
      scheduledFor: null,
      sentAt: null,
      failedAt: new Date("2026-04-29T10:00:00Z"),
      failureReason: "smtp_bounce",
      resolvedAt: opts.resolvedAt,
      resolvedById: opts.resolvedById !== undefined ? opts.resolvedById : "u-admin",
      resolvedReason: opts.resolvedReason ?? "admin_dismissed",
      readAt: null,
      dedupeKey: `dedupe-${opts.id}`,
      createdAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  // Seed a resolved ContactNotificationLog with controllable resolvedAt.
  function seedResolvedContactLog(opts: {
    id: string;
    companyId: string;
    contactId: string;
    resolvedAt: Date;
    resolvedById?: string | null;
    resolvedReason?: string;
  }) {
    db.contactNotificationLogs.set(opts.id, {
      id: opts.id,
      companyId: opts.companyId,
      contactId: opts.contactId,
      event: "missingUpdates",
      dedupeKey: `dedupe-${opts.id}`,
      status: "Failed",
      title: "Update needed",
      link: null,
      recipientEmail: "vendor@test",
      failureReason: "smtp_bounce",
      failedAt: new Date("2026-04-29T11:00:00Z"),
      resolvedAt: opts.resolvedAt,
      resolvedById: opts.resolvedById !== undefined ? opts.resolvedById : "u-admin",
      resolvedReason: opts.resolvedReason ?? "admin_dismissed",
      sentAt: new Date("2026-04-28T00:00:00Z"),
    });
  }

  it("rejects unauthenticated callers with 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeGetRequest("?resolved=1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects non-admin callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ role: "ProjectManager" }));

    const res = await GET(makeGetRequest("?resolved=1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("scopes results to the caller's company — cross-tenant resolved rows are excluded", async () => {
    const ts = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-mine", companyId: "co-1", email: "mine@test" });
    seedResolvedNotification({ id: "n-mine", companyId: "co-1", userId: "u-mine", resolvedAt: ts });

    seedUser({ id: "u-theirs", companyId: "co-2", email: "theirs@test" });
    seedResolvedNotification({ id: "n-theirs", companyId: "co-2", userId: "u-theirs", resolvedAt: ts });

    seedContact({ id: "c-theirs", companyId: "co-2", email: "vendor@test" });
    seedResolvedContactLog({ id: "cl-theirs", companyId: "co-2", contactId: "c-theirs", resolvedAt: ts });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("u:n-mine");
    expect(ids).not.toContain("u:n-theirs");
    expect(ids).not.toContain("c:cl-theirs");
  });

  it("returns only resolved rows — unresolved rows (resolvedAt = null) are excluded", async () => {
    const ts = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-resolved", companyId: "co-1", email: "resolved@test" });
    seedResolvedNotification({ id: "n-resolved", companyId: "co-1", userId: "u-resolved", resolvedAt: ts });

    // Unresolved rows must NOT appear in audit mode.
    seedUser({ id: "u-open", companyId: "co-1", email: "open@test" });
    seedFailedNotification({ id: "n-open", companyId: "co-1", userId: "u-open" });

    seedContact({ id: "c-resolved", companyId: "co-1", email: "vendor-r@test" });
    seedResolvedContactLog({ id: "cl-resolved", companyId: "co-1", contactId: "c-resolved", resolvedAt: ts });

    seedContact({ id: "c-open", companyId: "co-1", email: "vendor-o@test" });
    seedFailedContactLog({ id: "cl-open", companyId: "co-1", contactId: "c-open" });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id).sort();
    expect(ids).toEqual(["c:cl-resolved", "u:n-resolved"]);
  });

  it("merges user + contact resolved rows sorted by resolvedAt DESC with prefixedId tie-break", async () => {
    // Three rows resolved at the same millisecond → tie-break on id.
    // Sorted order: "u:n-b" > "u:n-a" > "c:cl-z" lexicographically.
    const same = new Date("2026-04-30T09:00:00Z");
    const earlier = new Date("2026-04-29T08:00:00Z");

    seedUser({ id: "u-a", companyId: "co-1", email: "a@test" });
    seedResolvedNotification({ id: "n-a", companyId: "co-1", userId: "u-a", resolvedAt: same });

    seedUser({ id: "u-b", companyId: "co-1", email: "b@test" });
    seedResolvedNotification({ id: "n-b", companyId: "co-1", userId: "u-b", resolvedAt: same });

    seedContact({ id: "ct-z", companyId: "co-1", email: "z@test" });
    seedResolvedContactLog({ id: "cl-z", companyId: "co-1", contactId: "ct-z", resolvedAt: same });

    // One row resolved earlier so the primary sort has something to differentiate.
    seedUser({ id: "u-old", companyId: "co-1", email: "old@test" });
    seedResolvedNotification({ id: "n-old", companyId: "co-1", userId: "u-old", resolvedAt: earlier });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; resolvedAt: string }> };

    const ids = body.items.map((i) => i.id);
    // Three same-ts rows come first (u: > c:, n-b > n-a), then the older one.
    expect(ids).toEqual(["u:n-b", "u:n-a", "c:cl-z", "u:n-old"]);

    // resolvedAt timestamps must be monotonically non-increasing.
    const stamps = body.items.map((i) => i.resolvedAt);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] <= stamps[i - 1]).toBe(true);
    }
  });

  it("returns the expected row shape for a user resolved notification", async () => {
    const resolvedAt = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-shape", companyId: "co-1", email: "shape@test" });
    seedResolvedNotification({
      id: "n-shape",
      companyId: "co-1",
      userId: "u-shape",
      resolvedAt,
      resolvedById: "u-admin-shape",
      resolvedReason: "admin_dismissed",
    });
    // Seed the resolver so the name lookup succeeds.
    db.users.set("u-admin-shape", {
      id: "u-admin-shape",
      companyId: "co-1",
      email: "admin-shape@test",
      firstName: "Resolver",
      lastName: "Admin",
      emailOptOut: false,
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row).toMatchObject({
      id: "u:n-shape",
      kind: "user",
      recipientId: "u-shape",
      recipientName: "Tester Person",
      recipientEmail: "shape@test",
      event: "drawApprovals",
      title: "Draw approval needed",
      reason: "smtp_bounce",
      resolvedAt: resolvedAt.toISOString(),
      resolvedReason: "admin_dismissed",
      resolvedById: "u-admin-shape",
      resolvedByName: "Resolver Admin",
      link: "/admin?panel=users",
    });
  });

  it("returns the expected row shape for a contact resolved log", async () => {
    const resolvedAt = new Date("2026-04-30T11:00:00Z");
    seedContact({ id: "c-shape", companyId: "co-1", email: "vendor-shape@test" });
    seedResolvedContactLog({
      id: "cl-shape",
      companyId: "co-1",
      contactId: "c-shape",
      resolvedAt,
      resolvedById: "u-admin-shape",
      resolvedReason: "auto_swept",
    });
    db.users.set("u-admin-shape", {
      id: "u-admin-shape",
      companyId: "co-1",
      email: "admin-shape@test",
      firstName: "Sweep",
      lastName: "Bot",
      emailOptOut: false,
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row).toMatchObject({
      id: "c:cl-shape",
      kind: "contact",
      recipientId: "c-shape",
      recipientName: "Contractor McTester",
      recipientEmail: "vendor@test",
      event: "missingUpdates",
      title: "Update needed",
      reason: "smtp_bounce",
      resolvedAt: resolvedAt.toISOString(),
      resolvedReason: "auto_swept",
      resolvedById: "u-admin-shape",
      resolvedByName: "Sweep Bot",
      link: "/contacts/c-shape",
    });
  });

  it("resolvedByName is null for auto-swept rows (resolvedById = null)", async () => {
    const resolvedAt = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-swept", companyId: "co-1", email: "swept@test" });
    seedResolvedNotification({
      id: "n-swept",
      companyId: "co-1",
      userId: "u-swept",
      resolvedAt,
      resolvedById: null,
      resolvedReason: "auto_swept",
    });
    seedContact({ id: "c-swept", companyId: "co-1", email: "vendor-swept@test" });
    seedResolvedContactLog({
      id: "cl-swept",
      companyId: "co-1",
      contactId: "c-swept",
      resolvedAt,
      resolvedById: null,
      resolvedReason: "auto_swept",
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(2);
    for (const row of body.items) {
      expect(row.resolvedById).toBeNull();
      expect(row.resolvedByName).toBeNull();
    }
  });

  it("resolvedByName is null when resolvedById belongs to another company", async () => {
    // The resolver lookup is scoped to companyId, so a foreign-company
    // resolver won't be found and the name falls back to null.
    const resolvedAt = new Date("2026-04-30T10:00:00Z");
    seedUser({ id: "u-r", companyId: "co-1", email: "r@test" });
    seedResolvedNotification({
      id: "n-foreign-resolver",
      companyId: "co-1",
      userId: "u-r",
      resolvedAt,
      resolvedById: "u-admin-co2",
    });
    db.users.set("u-admin-co2", {
      id: "u-admin-co2",
      companyId: "co-2",
      email: "admin-co2@test",
      firstName: "Foreign",
      lastName: "Admin",
      emailOptOut: false,
    });
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    // resolvedById is present but resolvedByName is null because the user
    // belongs to a different company and is excluded from the lookup.
    expect(body.items[0].resolvedById).toBe("u-admin-co2");
    expect(body.items[0].resolvedByName).toBeNull();
  });

  it("returns 400 for an invalid (non-base64, non-ISO) before= cursor", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&before=NOT_VALID!!!"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid `before` cursor" });
  });

  it("returns 400 for a base64 blob that decodes to a JSON object without a ts field", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    const badCursor = Buffer.from(JSON.stringify({ id: "u:n-1" }), "utf8").toString("base64");

    const res = await GET(makeGetRequest(`?resolved=1&before=${badCursor}`));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid `before` cursor" });
  });

  it("returns 400 for a base64 blob that decodes to a JSON object with a non-date ts", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));
    const badCursor = Buffer.from(JSON.stringify({ ts: "not-a-date", id: "u:n-1" }), "utf8").toString("base64");

    const res = await GET(makeGetRequest(`?resolved=1&before=${badCursor}`));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid `before` cursor" });
  });

  it("legacy bare-ISO before= cursor works (strict-less-than fallback)", async () => {
    // Three rows at different timestamps. Passing an ISO timestamp as
    // before= should return only rows resolved before that timestamp.
    const t1 = new Date("2026-04-28T10:00:00Z");
    const t2 = new Date("2026-04-29T10:00:00Z");
    const t3 = new Date("2026-04-30T10:00:00Z");

    seedUser({ id: "u-old", companyId: "co-1", email: "old@test" });
    seedResolvedNotification({ id: "n-old", companyId: "co-1", userId: "u-old", resolvedAt: t1 });

    seedUser({ id: "u-mid", companyId: "co-1", email: "mid@test" });
    seedResolvedNotification({ id: "n-mid", companyId: "co-1", userId: "u-mid", resolvedAt: t2 });

    seedUser({ id: "u-new", companyId: "co-1", email: "new@test" });
    seedResolvedNotification({ id: "n-new", companyId: "co-1", userId: "u-new", resolvedAt: t3 });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    // Pass t2 as a plain ISO string — only t1 is strictly before t2.
    const res = await GET(makeGetRequest(`?resolved=1&before=${t2.toISOString()}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };

    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("u:n-old");
    expect(ids).not.toContain("u:n-mid");
    expect(ids).not.toContain("u:n-new");
  });

  it("base64 cursor from page 1 produces page 2 with no skipped or duplicated rows", async () => {
    // Seed 5 user rows (older timestamps) and 5 contact rows (newer timestamps)
    // so the two tables cleanly split across two pages at limit=5.
    // Page 1: [c:cl-pg-4, c:cl-pg-3, c:cl-pg-2, c:cl-pg-1, c:cl-pg-0]
    // Page 2: [u:n-pg-4, u:n-pg-3, u:n-pg-2, u:n-pg-1, u:n-pg-0]
    const base = new Date("2026-05-01T00:00:00Z");
    for (let i = 0; i < 5; i++) {
      const uid = `u-pg-${i}`;
      const nid = `n-pg-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `pg${i}@test` });
      seedResolvedNotification({
        id: nid,
        companyId: "co-1",
        userId: uid,
        // user rows at base+0..4 min (older)
        resolvedAt: new Date(base.getTime() + i * 60_000),
      });
    }
    for (let i = 0; i < 5; i++) {
      const cid = `ct-pg-${i}`;
      const lid = `cl-pg-${i}`;
      seedContact({ id: cid, companyId: "co-1", email: `cpg${i}@test` });
      seedResolvedContactLog({
        id: lid,
        companyId: "co-1",
        contactId: cid,
        // contact rows at base+5..9 min (newer, so they appear on page 1)
        resolvedAt: new Date(base.getTime() + (i + 5) * 60_000),
      });
    }

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    // Page 1: all 5 contact rows (newest timestamps).
    const page1Res = await GET(makeGetRequest("?resolved=1&limit=5"));
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page1.items).toHaveLength(5);
    expect(page1.items.every((r) => r.id.startsWith("c:"))).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2: all 5 user rows via the cursor from page 1.
    const page2Res = await GET(
      makeGetRequest(`?resolved=1&limit=5&before=${encodeURIComponent(page1.nextCursor!)}`),
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page2.items).toHaveLength(5);
    expect(page2.items.every((r) => r.id.startsWith("u:"))).toBe(true);

    // Together the two pages cover all 10 rows without duplication.
    const allIds = [...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)];
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicates
    expect(allIds).toHaveLength(10);
  });

  it("same-millisecond rows spanning both tables paginate without skipping or duplicating", async () => {
    // All three rows share the same resolvedAt timestamp. Sorted by
    // prefixedId DESC: "u:n-b" > "u:n-a" > "c:cl-z".
    // With limit=2, page 1 returns [u:n-b, u:n-a]; page 2 must return [c:cl-z].
    const ts = new Date("2026-05-01T12:00:00.000Z");

    seedUser({ id: "u-a", companyId: "co-1", email: "a@test" });
    seedResolvedNotification({ id: "n-a", companyId: "co-1", userId: "u-a", resolvedAt: ts });

    seedUser({ id: "u-b", companyId: "co-1", email: "b@test" });
    seedResolvedNotification({ id: "n-b", companyId: "co-1", userId: "u-b", resolvedAt: ts });

    seedContact({ id: "ct-z", companyId: "co-1", email: "z@test" });
    seedResolvedContactLog({ id: "cl-z", companyId: "co-1", contactId: "ct-z", resolvedAt: ts });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const page1Res = await GET(makeGetRequest("?resolved=1&limit=2"));
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page1.items.map((i) => i.id)).toEqual(["u:n-b", "u:n-a"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2Res = await GET(
      makeGetRequest(`?resolved=1&limit=2&before=${encodeURIComponent(page1.nextCursor!)}`),
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page2.items.map((i) => i.id)).toEqual(["c:cl-z"]);

    // No row appears on both pages.
    const p1ids = page1.items.map((i) => i.id);
    const p2ids = page2.items.map((i) => i.id);
    expect(p1ids.filter((id) => p2ids.includes(id))).toHaveLength(0);
  });

  it("honours the limit parameter up to MAX_PAGE_SIZE (100)", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    // Seed 10 rows; asking for limit=5 should return exactly 5.
    for (let i = 0; i < 10; i++) {
      const uid = `u-lim-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `lim${i}@test` });
      seedResolvedNotification({
        id: `n-lim-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&limit=5"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(5);
  });

  it("clamps limit to MAX_PAGE_SIZE (100) when a larger value is supplied", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    // Seed 110 rows, ask for 200 — response must return exactly 100 (the cap),
    // not the default PAGE_SIZE (25) or all 110. This proves the clamp is
    // applied to MAX_PAGE_SIZE rather than silently falling back to PAGE_SIZE.
    for (let i = 0; i < 110; i++) {
      const uid = `u-clamp-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `clamp${i}@test` });
      seedResolvedNotification({
        id: `n-clamp-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&limit=200"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    // Must be exactly 100 — proves it is clamped to MAX_PAGE_SIZE, not PAGE_SIZE.
    expect(body.items).toHaveLength(100);
    // nextCursor must be present because 10 rows remain after the 100 returned.
    expect(body.nextCursor).not.toBeNull();
  });

  it("defaults to PAGE_SIZE (25) when limit is omitted", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    // Seed 30 rows — more than PAGE_SIZE so the default cap is visible.
    for (let i = 0; i < 30; i++) {
      const uid = `u-def-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `def${i}@test` });
      seedResolvedNotification({
        id: `n-def-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(25);
    expect(body.nextCursor).not.toBeNull();
  });

  it("returns nextCursor=null and no cursor when all rows fit on one page", async () => {
    const ts = new Date("2026-05-01T10:00:00Z");
    seedUser({ id: "u-only", companyId: "co-1", email: "only@test" });
    seedResolvedNotification({ id: "n-only", companyId: "co-1", userId: "u-only", resolvedAt: ts });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("?limit=10 returns at most 10 rows from a larger result set", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    for (let i = 0; i < 15; i++) {
      const uid = `u-ten-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `ten${i}@test` });
      seedResolvedNotification({
        id: `n-ten-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&limit=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(10);
  });

  it("?limit=0 falls back to the default PAGE_SIZE (25)", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    for (let i = 0; i < 30; i++) {
      const uid = `u-zero-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `zero${i}@test` });
      seedResolvedNotification({
        id: `n-zero-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&limit=0"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(25);
    expect(body.nextCursor).not.toBeNull();
  });

  it("?limit=-1 falls back to the default PAGE_SIZE (25)", async () => {
    const ts = new Date("2026-05-01T00:00:00Z");
    for (let i = 0; i < 30; i++) {
      const uid = `u-neg-${i}`;
      seedUser({ id: uid, companyId: "co-1", email: `neg${i}@test` });
      seedResolvedNotification({
        id: `n-neg-${i}`,
        companyId: "co-1",
        userId: uid,
        resolvedAt: new Date(ts.getTime() + i * 1000),
      });
    }
    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1&limit=-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(25);
    expect(body.nextCursor).not.toBeNull();
  });

  it("resolver display name is looked up in a single batch across both tables", async () => {
    // Two rows from the same company share the same resolver, one from each
    // table. The resolver's display name should appear on both rows even
    // though the lookup only queries once.
    const resolvedAt = new Date("2026-04-30T10:00:00Z");
    const resolverId = "u-batch-resolver";
    db.users.set(resolverId, {
      id: resolverId,
      companyId: "co-1",
      email: "batch-resolver@test",
      firstName: "Batch",
      lastName: "Resolver",
      emailOptOut: false,
    });

    seedUser({ id: "u-r1", companyId: "co-1", email: "r1@test" });
    seedResolvedNotification({
      id: "n-r1",
      companyId: "co-1",
      userId: "u-r1",
      resolvedAt,
      resolvedById: resolverId,
    });

    seedContact({ id: "c-r1", companyId: "co-1", email: "vr1@test" });
    seedResolvedContactLog({
      id: "cl-r1",
      companyId: "co-1",
      contactId: "c-r1",
      resolvedAt,
      resolvedById: resolverId,
    });

    mockGetCurrentUser.mockResolvedValue(adminUser({ companyId: "co-1" }));

    const res = await GET(makeGetRequest("?resolved=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; resolvedByName: string | null }> };

    expect(body.items).toHaveLength(2);
    for (const row of body.items) {
      expect(row.resolvedByName).toBe("Batch Resolver");
    }
  });
});
