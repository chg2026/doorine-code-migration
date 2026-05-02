import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getRecentStaleSweepAlertLogs,
  STALE_SWEEP_ALERT_LOG_DISPLAY_LIMIT,
} from "@/lib/notifications/sweep";

/**
 * GET /api/admin/notifications/stale-alerts
 *
 * Admin-only. Returns a page of outage-alert log entries (rows written by
 * `evaluateStaleSweepAlerts` whenever it actually attempts to email admins
 * about a stalled sweep). Powers the "Recent outage alerts" collapsible
 * section in Admin → Notifications.
 *
 * Query params:
 *   page  – zero-based page index (default 0)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pageParam = req.nextUrl.searchParams.get("page");
  const page = Math.max(0, parseInt(pageParam ?? "0", 10) || 0);
  const offset = page * STALE_SWEEP_ALERT_LOG_DISPLAY_LIMIT;

  const { items, hasMore } = await getRecentStaleSweepAlertLogs(
    user.companyId,
    offset
  );
  return NextResponse.json({ items, hasMore });
}
