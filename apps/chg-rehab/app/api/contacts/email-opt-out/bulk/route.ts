import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** Maximum number of contact IDs accepted in a single bulk re-enable request. */
const BULK_REENABLE_MAX_IDS = 500;

/**
 * Admin-only bulk re-enable for `Contact.emailOptOut`. Mirrors the per-contact
 * `DELETE /api/contacts/[id]/email-opt-out` endpoint but accepts a list of
 * contact IDs so the Unsubscribed sub-tab on the Contacts page can re-enable
 * many rows in a single click (e.g. after a campaign-wide complaint or an
 * accidental opt-out sweep).
 *
 * Body: `{ ids: string[] }`
 * Response: `{ ok, succeeded, failed, results: [{ id, ok, error? }] }`
 *
 * The endpoint is idempotent: contacts that are already opted-in are reported
 * as a success no-op so callers can safely re-submit.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(rawIds.filter((x): x is string => typeof x === "string" && x.length > 0))
  );
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of contact IDs" },
      { status: 400 }
    );
  }
  if (ids.length > BULK_REENABLE_MAX_IDS) {
    return NextResponse.json(
      {
        error: `Too many IDs: maximum ${BULK_REENABLE_MAX_IDS} contact IDs per request, got ${ids.length}`,
      },
      { status: 400 }
    );
  }

  // Scope strictly to the admin's company; ids referencing other companies
  // are reported as not-found rather than silently ignored so the UI can
  // surface partial failures.
  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true, name: true, emailOptOut: true },
  });
  const found = new Map(contacts.map((c) => [c.id, c]));

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const c = found.get(id);
    if (!c) {
      results.push({ id, ok: false, error: "Contact not found" });
      continue;
    }
    if (!c.emailOptOut) {
      // Already opted in (e.g. someone toggled it in another tab between the
      // page render and this request). Treat as a no-op success.
      results.push({ id, ok: true });
      continue;
    }
    try {
      await prisma.$transaction([
        prisma.contact.update({
          where: { id: c.id },
          data: { emailOptOut: false, emailOptOutAt: null },
        }),
        prisma.activityLogEntry.create({
          data: {
            companyId: user.companyId,
            actorId: user.id,
            action: "contact.email_opt_in",
            entity: "Contact",
            entityId: c.id,
            message: `Re-enabled notification emails for ${c.name}`,
            meta: { contactId: c.id, bulk: true },
          },
        }),
      ]);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({
        id,
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return NextResponse.json({ ok: failed === 0, succeeded, failed, results });
}
