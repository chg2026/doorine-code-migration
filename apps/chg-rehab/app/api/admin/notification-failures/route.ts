import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resendFailedNotification } from "@/lib/notifications/dispatch";

// Cap on how many rows we return per request. Used for both the live
// "Delivery problems" list and the resolved audit list. Kept small so the
// admin panel stays snappy even for tenants with months of history.
const PAGE_SIZE = 25;
// Hard ceiling enforced by the resolved-list pagination so a malicious or
// buggy caller can't page through the entire table in one request.
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/admin/notification-failures
 *
 * Admin-only. Returns email delivery failure rows for the caller's company —
 * both `Notification` rows where channel=email and status=Failed (employee
 * recipients) and `ContactNotificationLog` rows where status=Failed (external
 * contractor / vendor recipients).
 *
 * Default mode (live problems): resolved rows (`resolvedAt != null`) are
 * filtered out so the panel and its badge count reflect only currently-broken
 * recipients.
 *
 * Audit mode (`?resolved=1`): returns only resolved rows, ordered by
 * `resolvedAt desc`, with `resolvedAt`, `resolvedReason` and the resolver's
 * display name attached so admins can audit who dismissed what (and which
 * rows the auto-sweep cleared). Supports cursor pagination via
 * `?before=<iso>` (resolved before that timestamp) and `?limit=<n>` (capped
 * at MAX_PAGE_SIZE).
 *
 * Each row carries enough info for the UI to deep-link to the affected
 * user / contact so an admin can fix the address or re-invite them.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const resolvedMode =
    url.searchParams.get("resolved") === "1" ||
    url.searchParams.get("resolved") === "true";

  if (resolvedMode) {
    return getResolved(user.companyId, url);
  }

  const [userFailures, contactFailures] = await Promise.all([
    prisma.notification.findMany({
      where: {
        companyId: user.companyId,
        channel: "email",
        status: "Failed",
        resolvedAt: null,
      },
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        event: true,
        title: true,
        failureReason: true,
        failedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.contactNotificationLog.findMany({
      where: {
        companyId: user.companyId,
        status: "Failed",
        resolvedAt: null,
      },
      orderBy: [{ failedAt: "desc" }, { sentAt: "desc" }],
      take: 50,
      select: {
        id: true,
        event: true,
        title: true,
        recipientEmail: true,
        failureReason: true,
        failedAt: true,
        sentAt: true,
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const items = [
    ...userFailures.map((n) => {
      const name =
        [n.user?.firstName, n.user?.lastName].filter(Boolean).join(" ") ||
        n.user?.email ||
        "Teammate";
      const ts = n.failedAt ?? n.createdAt;
      return {
        id: `u:${n.id}`,
        kind: "user" as const,
        recipientId: n.user?.id ?? null,
        recipientName: name,
        recipientEmail: n.user?.email ?? null,
        event: n.event,
        title: n.title,
        reason: n.failureReason ?? "unknown",
        at: ts.toISOString(),
        link: "/admin?panel=users",
      };
    }),
    ...contactFailures.map((c) => {
      const ts = c.failedAt ?? c.sentAt;
      return {
        id: `c:${c.id}`,
        kind: "contact" as const,
        recipientId: c.contact?.id ?? null,
        recipientName: c.contact?.name ?? "Contact",
        recipientEmail: c.recipientEmail ?? c.contact?.email ?? null,
        event: c.event,
        title: c.title ?? c.event,
        reason: c.failureReason ?? "unknown",
        at: ts.toISOString(),
        link: c.contact?.id ? `/contacts/${c.contact.id}` : null,
      };
    }),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 50);

  return NextResponse.json({ items });
}

/**
 * Audit-mode handler for resolved delivery problems. Pulls the most recently
 * resolved rows from both notification tables (older than the optional
 * `before` cursor), merges them, and pages from the merged stream.
 *
 * Implementation notes:
 *  - The merged stream is sorted by `(resolvedAt DESC, prefixedId DESC)` so
 *    equal-timestamp rows have a deterministic order. The next-page cursor
 *    is the `(resolvedAt, prefixedId)` of the last returned row, which
 *    eliminates the same-millisecond skip risk you'd get from a pure
 *    `resolvedAt < before` cursor.
 *  - The cursor is sent over the wire as a base64-encoded JSON blob in the
 *    `before` query param (we keep the param name for backwards compat).
 *    Plain ISO timestamps are still accepted for legacy callers.
 *  - `resolvedById` is a bare `String?` (no FK relation in the schema), so we
 *    look up the resolver display names in a single follow-up query rather
 *    than trying to use `include`.
 */
async function getResolved(companyId: string, url: URL) {
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_PAGE_SIZE)
      : PAGE_SIZE;

  const beforeParam = url.searchParams.get("before");
  let cursor: { ts: Date; prefixedId: string | null } | null = null;
  if (beforeParam) {
    const parsed = parseCursor(beforeParam);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid `before` cursor" },
        { status: 400 }
      );
    }
    cursor = parsed;
  }

  // Optional search: ?q= filters by recipient name or email (case-insensitive).
  const q = url.searchParams.get("q")?.trim() || null;

  // Optional reason filter: ?reason=auto → auto_later_send_succeeded,
  // ?reason=admin → admin_dismissed. Anything else is ignored so the
  // endpoint degrades gracefully when the UI sends an unknown value.
  const reasonParam = url.searchParams.get("reason") || null;
  let resolvedReasonFilter: string | null = null;
  if (reasonParam === "auto") resolvedReasonFilter = "auto_later_send_succeeded";
  else if (reasonParam === "admin") resolvedReasonFilter = "admin_dismissed";

  // Per-table where clauses that respect the merged-stream ordering.
  // - userWhere: include the boundary timestamp only when the cursor row
  //   came from the user table (and only ids strictly less than the
  //   cursor id). When the cursor is from the contact table, no user row
  //   at the boundary timestamp can sort after it (since `"u:" > "c:"`
  //   lexicographically), so the boundary timestamp is excluded outright.
  // - contactWhere mirrors that logic for the contact table.
  const userCursorWhere = buildPerTableCursorClause("u", cursor);
  const contactCursorWhere = buildPerTableCursorClause("c", cursor);

  // Collect additional AND clauses for search + reason filters.
  const userAndClauses: object[] = [userCursorWhere];
  const contactAndClauses: object[] = [contactCursorWhere];

  if (q) {
    userAndClauses.push({
      OR: [
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { firstName: { contains: q, mode: "insensitive" } } },
        { user: { lastName: { contains: q, mode: "insensitive" } } },
      ],
    });
    contactAndClauses.push({
      OR: [
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { email: { contains: q, mode: "insensitive" } } },
        { recipientEmail: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (resolvedReasonFilter) {
    userAndClauses.push({ resolvedReason: resolvedReasonFilter });
    contactAndClauses.push({ resolvedReason: resolvedReasonFilter });
  }

  const [userResolved, contactResolved] = await Promise.all([
    prisma.notification.findMany({
      where: {
        companyId,
        channel: "email",
        status: "Failed",
        AND: userAndClauses,
      },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        event: true,
        title: true,
        failureReason: true,
        failedAt: true,
        createdAt: true,
        resolvedAt: true,
        resolvedById: true,
        resolvedReason: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.contactNotificationLog.findMany({
      where: {
        companyId,
        status: "Failed",
        AND: contactAndClauses,
      },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        event: true,
        title: true,
        recipientEmail: true,
        failureReason: true,
        failedAt: true,
        sentAt: true,
        resolvedAt: true,
        resolvedById: true,
        resolvedReason: true,
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  // Look up the display names for every resolver referenced across both
  // tables in a single round-trip. Auto-cleared rows have no resolvedById,
  // so they're filtered out of the lookup set.
  const resolverIds = new Set<string>();
  for (const n of userResolved) {
    if (n.resolvedById) resolverIds.add(n.resolvedById);
  }
  for (const c of contactResolved) {
    if (c.resolvedById) resolverIds.add(c.resolvedById);
  }
  const resolvers =
    resolverIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(resolverIds) }, companyId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
  const resolverNameById = new Map<string, string>();
  for (const r of resolvers) {
    const name =
      [r.firstName, r.lastName].filter(Boolean).join(" ") ||
      r.email ||
      "Unknown";
    resolverNameById.set(r.id, name);
  }

  const merged = [
    ...userResolved.map((n) => {
      const name =
        [n.user?.firstName, n.user?.lastName].filter(Boolean).join(" ") ||
        n.user?.email ||
        "Teammate";
      const failedTs = n.failedAt ?? n.createdAt;
      return {
        id: `u:${n.id}`,
        kind: "user" as const,
        recipientId: n.user?.id ?? null,
        recipientName: name,
        recipientEmail: n.user?.email ?? null,
        event: n.event,
        title: n.title,
        reason: n.failureReason ?? "unknown",
        failedAt: failedTs.toISOString(),
        resolvedAt: (n.resolvedAt as Date).toISOString(),
        resolvedReason: n.resolvedReason ?? "unknown",
        resolvedById: n.resolvedById,
        resolvedByName: n.resolvedById
          ? resolverNameById.get(n.resolvedById) ?? null
          : null,
        link: "/admin?panel=users",
      };
    }),
    ...contactResolved.map((c) => {
      const failedTs = c.failedAt ?? c.sentAt;
      return {
        id: `c:${c.id}`,
        kind: "contact" as const,
        recipientId: c.contact?.id ?? null,
        recipientName: c.contact?.name ?? "Contact",
        recipientEmail: c.recipientEmail ?? c.contact?.email ?? null,
        event: c.event,
        title: c.title ?? c.event,
        reason: c.failureReason ?? "unknown",
        failedAt: failedTs.toISOString(),
        resolvedAt: (c.resolvedAt as Date).toISOString(),
        resolvedReason: c.resolvedReason ?? "unknown",
        resolvedById: c.resolvedById,
        resolvedByName: c.resolvedById
          ? resolverNameById.get(c.resolvedById) ?? null
          : null,
        link: c.contact?.id ? `/contacts/${c.contact.id}` : null,
      };
    }),
  ].sort((a, b) => {
    // Primary: resolvedAt DESC. Secondary: prefixedId DESC. The id-based
    // tie-break must match the per-table orderBy + cursor logic above so
    // boundary rows aren't skipped or duplicated across pages.
    if (a.resolvedAt !== b.resolvedAt) return a.resolvedAt < b.resolvedAt ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? 1 : -1;
    return 0;
  });

  const page = merged.slice(0, limit);
  // `nextCursor` encodes the (resolvedAt, prefixedId) of the last item we
  // returned so the next page can resume after it without skipping rows
  // that share its timestamp. We only advertise a cursor when at least
  // one underlying query came back full — otherwise we know there's
  // nothing left to fetch.
  const moreAvailable =
    userResolved.length === limit ||
    contactResolved.length === limit ||
    merged.length > limit;
  const nextCursor =
    moreAvailable && page.length > 0
      ? encodeCursor(page[page.length - 1].resolvedAt, page[page.length - 1].id)
      : null;

  return NextResponse.json({ items: page, nextCursor });
}

/**
 * Decode a `before=` query param into a `{ ts, prefixedId }` cursor.
 * Accepts both the new base64-JSON cursor we emit ourselves and a bare
 * ISO timestamp for backwards compat with any callers still hitting the
 * older single-key cursor shape.
 */
function parseCursor(raw: string): { ts: Date; prefixedId: string | null } | null {
  // Bare ISO timestamp (legacy callers).
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return { ts: asDate, prefixedId: null };
  }
  // Base64-encoded JSON `{ ts, id }`.
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(decoded) as { ts?: unknown; id?: unknown };
    if (typeof obj.ts !== "string") return null;
    const d = new Date(obj.ts);
    if (Number.isNaN(d.getTime())) return null;
    const prefixedId = typeof obj.id === "string" ? obj.id : null;
    return { ts: d, prefixedId };
  } catch {
    return null;
  }
}

function encodeCursor(ts: string, prefixedId: string): string {
  return Buffer.from(JSON.stringify({ ts, id: prefixedId }), "utf8").toString("base64");
}

/**
 * Build the per-table `where` fragment that selects rows strictly after
 * the cursor in the merged `(resolvedAt DESC, prefixedId DESC)` stream.
 *
 * The lexicographic relation between table prefixes (`"c:" < "u:"`) lets us
 * collapse the boundary case into a few branches:
 *  - No cursor: include any resolved row.
 *  - Cursor's id belongs to THIS table: include `resolvedAt < ts` OR
 *    (`resolvedAt = ts` AND raw `id < cursorRawId`).
 *  - Cursor's id belongs to the OTHER table: the boundary timestamp is
 *    either entirely consumed (this table's prefixedIds all sort after the
 *    cursor) or entirely available (this table's prefixedIds all sort
 *    before the cursor).
 */
function buildPerTableCursorClause(
  table: "u" | "c",
  cursor: { ts: Date; prefixedId: string | null } | null
):
  | { resolvedAt: { not: null } }
  | { resolvedAt: { lt: Date } }
  | { resolvedAt: { lte: Date } }
  | { OR: Array<{ resolvedAt: Date | { lt: Date }; id?: { lt: string } }> } {
  if (!cursor) {
    return { resolvedAt: { not: null } };
  }
  // Legacy/missing prefixedId: degrade to the original strict-less-than
  // behaviour. Only relevant for clients still sending bare ISO cursors.
  if (!cursor.prefixedId) {
    return { resolvedAt: { lt: cursor.ts } };
  }

  const cursorTable = cursor.prefixedId.startsWith("u:") ? "u" : "c";
  const cursorRawId = cursor.prefixedId.slice(2);

  if (cursorTable === table) {
    // Same table: tie-break on raw id within the boundary timestamp.
    return {
      OR: [
        { resolvedAt: { lt: cursor.ts } },
        { resolvedAt: cursor.ts, id: { lt: cursorRawId } },
      ],
    };
  }

  // Other table. Lexicographically `"c:" < "u:"`.
  if (table === "u") {
    // cursor is "c:..." → every "u:..." row at the boundary sorts AFTER
    // the cursor (i.e. was already shown), so exclude the boundary entirely.
    return { resolvedAt: { lt: cursor.ts } };
  }
  // table === "c", cursor is "u:..." → every "c:..." row at the boundary
  // sorts BEFORE the cursor, so include the boundary timestamp in full.
  return { resolvedAt: { lte: cursor.ts } };
}

// Per-row + per-admin rate limit so an impatient admin can't hammer the
// outbound provider on a stuck row. The maps live in-process — that's fine
// because retry is a low-frequency, bursty interactive action; the worst case
// of a multi-process deploy is each process getting its own counter, which
// still keeps the outbound rate well below provider tolerances.
const ROW_COOLDOWN_MS = 15_000;
const ADMIN_WINDOW_MS = 60_000;
const ADMIN_MAX_RETRIES_PER_WINDOW = 10;
const rowLastRetryAt = new Map<string, number>();
const adminRetries = new Map<string, number[]>();

// Separate rate limit for reopen actions: generous enough to handle bulk
// corrections but tight enough to prevent accidental re-open loops.
const REOPEN_ADMIN_WINDOW_MS = 60_000;
const REOPEN_MAX_PER_WINDOW = 30;
const adminReopens = new Map<string, number[]>();

function checkReopenRateLimit(adminId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const windowStart = now - REOPEN_ADMIN_WINDOW_MS;
  const recent = (adminReopens.get(adminId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= REOPEN_MAX_PER_WINDOW) {
    const oldest = recent[0];
    return { ok: false, retryAfterMs: REOPEN_ADMIN_WINDOW_MS - (now - oldest) };
  }
  recent.push(now);
  adminReopens.set(adminId, recent);
  if (adminReopens.size > 500) {
    for (const [k, v] of adminReopens) {
      if (v.every((t) => t <= windowStart)) adminReopens.delete(k);
    }
  }
  return { ok: true };
}

function checkRateLimit(adminId: string, rowId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();

  const last = rowLastRetryAt.get(rowId);
  if (last && now - last < ROW_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: ROW_COOLDOWN_MS - (now - last) };
  }

  const windowStart = now - ADMIN_WINDOW_MS;
  const recent = (adminRetries.get(adminId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= ADMIN_MAX_RETRIES_PER_WINDOW) {
    const oldest = recent[0];
    return { ok: false, retryAfterMs: ADMIN_WINDOW_MS - (now - oldest) };
  }

  rowLastRetryAt.set(rowId, now);
  recent.push(now);
  adminRetries.set(adminId, recent);

  // Best-effort cleanup so the maps don't grow unbounded over the process'
  // lifetime. Cheap because the maps are tiny in practice.
  if (rowLastRetryAt.size > 500) {
    for (const [k, v] of rowLastRetryAt) {
      if (now - v > ROW_COOLDOWN_MS * 4) rowLastRetryAt.delete(k);
    }
  }
  return { ok: true };
}

/**
 * POST /api/admin/notification-failures
 *
 * Admin-only. Three body shapes are accepted:
 *
 * 1. Retry a single failure row (existing behavior):
 *    `{ id: string, action: "retry" }`
 *    Re-runs the original notification through the same dispatch helpers so
 *    the row's status is updated in place — admins get instant feedback
 *    after fixing a bad address instead of waiting for the next sweep.
 *    Rate-limited per row + per admin to avoid hammering the provider.
 *
 * 2. Mark one or more failure rows as resolved (Delivery-problems dismiss):
 *    `{ ids: ["u:<notificationId>" | "c:<contactLogId>", ...] }`
 *    `u:` prefixes target `Notification` rows; `c:` prefixes target
 *    `ContactNotificationLog` rows. Resolved rows are filtered out of the
 *    GET response and the panel badge but remain in the database for audit.
 *    Returns: `{ resolved: number }`.
 *
 * 3. Re-open one or more previously-resolved rows (undo a dismiss):
 *    `{ ids: ["u:<notificationId>" | "c:<contactLogId>", ...], action: "reopen" }`
 *    Clears `resolvedAt`, `resolvedById`, and `resolvedReason` so the rows
 *    reappear in the live "Delivery problems" panel and the badge count.
 *    Rate-limited per admin. Returns: `{ reopened: number }`.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: unknown; ids?: unknown; action?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; ids?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Bulk-reopen mode: `{ ids, action: "reopen" }` clears the resolved
  // fields so the rows reappear in the live panel and badge count. Scoped
  // by companyId, rate-limited, and only touches rows that are currently
  // resolved (resolvedAt != null) to avoid no-op writes.
  if (Array.isArray(body.ids) && body.action === "reopen") {
    const rawIds = (body.ids as unknown[]).filter((v) => typeof v === "string") as string[];
    if (rawIds.length === 0) {
      return NextResponse.json({ error: "Missing `ids`" }, { status: 400 });
    }

    const userIds: string[] = [];
    const contactIds: string[] = [];
    const invalid: string[] = [];
    for (const raw of rawIds) {
      if (raw.startsWith("u:")) userIds.push(raw.slice(2));
      else if (raw.startsWith("c:")) contactIds.push(raw.slice(2));
      else invalid.push(raw);
    }
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Invalid id format; expected `u:<id>` or `c:<id>`", invalid },
        { status: 400 }
      );
    }
    if (userIds.length === 0 && contactIds.length === 0) {
      return NextResponse.json({ error: "Missing `ids`" }, { status: 400 });
    }

    const rate = checkReopenRateLimit(user.id);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "Too many re-open actions — please wait a moment before trying again.",
          retryAfterMs: rate.retryAfterMs,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
      );
    }

    const [userRes, contactRes] = await Promise.all([
      userIds.length > 0
        ? prisma.notification.updateMany({
            where: {
              id: { in: userIds },
              companyId: user.companyId,
              channel: "email",
              status: "Failed",
              resolvedAt: { not: null },
            },
            data: {
              resolvedAt: null,
              resolvedById: null,
              resolvedReason: null,
            },
          })
        : Promise.resolve({ count: 0 }),
      contactIds.length > 0
        ? prisma.contactNotificationLog.updateMany({
            where: {
              id: { in: contactIds },
              companyId: user.companyId,
              status: "Failed",
              resolvedAt: { not: null },
            },
            data: {
              resolvedAt: null,
              resolvedById: null,
              resolvedReason: null,
            },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    const reopened = userRes.count + contactRes.count;

    // Persist an audit trail entry so the reopen action is traceable even
    // after the resolved fields are cleared from the notification rows.
    if (reopened > 0) {
      await prisma.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "notification_failure_reopened",
          entity: "NotificationFailure",
          message: `Re-opened ${reopened} resolved delivery problem${reopened === 1 ? "" : "s"}`,
          meta: { ids: rawIds.slice(0, rawIds.length) },
        },
      });
    }

    return NextResponse.json({ reopened });
  }

  // Bulk-resolve mode: presence of an `ids` array dispatches to the
  // dismiss-rows path. Used by the "Mark fixed" action in the panel.
  if (Array.isArray(body.ids)) {
    const rawIds = (body.ids as unknown[]).filter((v) => typeof v === "string") as string[];
    if (rawIds.length === 0) {
      return NextResponse.json({ error: "Missing `ids`" }, { status: 400 });
    }

    const userIds: string[] = [];
    const contactIds: string[] = [];
    const invalid: string[] = [];
    for (const raw of rawIds) {
      if (raw.startsWith("u:")) userIds.push(raw.slice(2));
      else if (raw.startsWith("c:")) contactIds.push(raw.slice(2));
      else invalid.push(raw);
    }
    // Reject the whole request when any id is malformed so the caller
    // surfaces a real error instead of getting a silent { resolved: 0 }
    // back. Prefixes are part of the contract documented above.
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Invalid id format; expected `u:<id>` or `c:<id>`", invalid },
        { status: 400 }
      );
    }
    if (userIds.length === 0 && contactIds.length === 0) {
      return NextResponse.json({ error: "Missing `ids`" }, { status: 400 });
    }

    const now = new Date();
    // Scope every update by `companyId` so an admin can never resolve
    // another tenant's failure rows even with a forged id.
    const [userRes, contactRes] = await Promise.all([
      userIds.length > 0
        ? prisma.notification.updateMany({
            where: {
              id: { in: userIds },
              companyId: user.companyId,
              channel: "email",
              status: "Failed",
              resolvedAt: null,
            },
            data: {
              resolvedAt: now,
              resolvedById: user.id,
              resolvedReason: "admin_dismissed",
            },
          })
        : Promise.resolve({ count: 0 }),
      contactIds.length > 0
        ? prisma.contactNotificationLog.updateMany({
            where: {
              id: { in: contactIds },
              companyId: user.companyId,
              status: "Failed",
              resolvedAt: null,
            },
            data: {
              resolvedAt: now,
              resolvedById: user.id,
              resolvedReason: "admin_dismissed",
            },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return NextResponse.json({ resolved: userRes.count + contactRes.count });
  }

  // Single-row retry mode: re-runs the original notification through the
  // dispatch helpers and reports the result back to the caller.
  if (body.action !== "retry") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const rate = checkRateLimit(user.id, body.id);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "Too many retries — please wait a moment before trying again.",
        retryAfterMs: rate.retryAfterMs,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
    );
  }

  const result = await resendFailedNotification(body.id, user.companyId);

  if (!result.ok) {
    const status = result.error === "not_found" || result.error === "wrong_company" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    delivered: result.delivered,
    reason: result.reason ?? null,
    status: result.status,
    failedAt: result.failedAt,
    at: result.at,
  });
}
