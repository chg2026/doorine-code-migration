import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, publicOrigin } from "@/lib/auth";
import { sendWeeklyOutageRecapPreview } from "@/lib/notifications/sweep";

/**
 * POST /api/admin/notifications/weekly-recap-preview
 *
 * Admin-only. Renders the weekly outage-recap email for the caller's company
 * and delivers it ONLY to the requesting admin's own email address.
 *
 * Differences from the real weekly recap:
 *   - Subject is prefixed with "[PREVIEW]".
 *   - Body includes a yellow preview banner.
 *   - `lastWeeklyAlertRecapAt` is never updated (no throttle stamp).
 *   - Opt-out and throttle checks are bypassed.
 *   - Works even when no alerts fired in the past 7 days (preview banner
 *     notes that the real email would not have been sent).
 *
 * Rate-limited to one preview per minute per company (in-memory) so the
 * button cannot be abused.
 */

export const dynamic = "force-dynamic";

const PREVIEW_THROTTLE_MS = 60_000;

const lastPreviewAt = new Map<string, number>();

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!user.email)
    return NextResponse.json(
      { error: "Your account has no email address — cannot send preview." },
      { status: 422 }
    );

  const now = Date.now();
  const last = lastPreviewAt.get(user.companyId) ?? 0;
  const sinceLast = now - last;
  if (sinceLast < PREVIEW_THROTTLE_MS) {
    const retryAfterMs = PREVIEW_THROTTLE_MS - sinceLast;
    return NextResponse.json(
      {
        error: "A preview was just sent. Please wait a moment before sending another.",
        retryAfterMs,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }
  lastPreviewAt.set(user.companyId, now);

  const result = await sendWeeklyOutageRecapPreview({
    companyId: user.companyId,
    recipientEmail: user.email,
    baseUrl: publicOrigin(req),
  });

  if (!result.sent && result.reason === "provider_not_configured") {
    return NextResponse.json(
      { error: "Outbound email is not configured — cannot send preview." },
      { status: 503 }
    );
  }
  if (!result.sent && result.reason === "company_not_found") {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  if (!result.sent && result.reason === "send_failed") {
    return NextResponse.json(
      { error: "Preview email failed to deliver. Check server logs for details." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    alertCount: result.alertCount ?? 0,
    throttleMs: PREVIEW_THROTTLE_MS,
  });
}
