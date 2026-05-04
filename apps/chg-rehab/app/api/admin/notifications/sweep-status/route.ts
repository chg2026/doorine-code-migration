import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStaleAlertConfig } from "@/lib/notifications/sweep";

/**
 * GET /api/admin/notifications/sweep-status
 *
 * Admin-only. Returns the timestamp of the last successful notification
 * digest sweep for the caller's company so the Admin → Notifications
 * panel can self-heal its "stale sweep" banner without a page reload.
 *
 * Also returns `lastStaleAlertAt` (the last time admins were emailed about
 * a stalled sweep) and the throttle window so the banner can show whether
 * an outage email has fired and when another might fire.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const state = await prisma.notificationState.findUnique({
    where: { companyId: user.companyId },
    select: {
      lastDigestSweepAt: true,
      lastStaleAlertAt: true,
      lastManualSweepAt: true,
      lastManualSweepByUserId: true,
      lastManualSweepByName: true,
    },
  });

  const { thresholdMs, throttleMs } = await getStaleAlertConfig(user.companyId);

  return NextResponse.json({
    lastDigestSweepAt: state?.lastDigestSweepAt
      ? state.lastDigestSweepAt.toISOString()
      : null,
    lastStaleAlertAt: state?.lastStaleAlertAt
      ? state.lastStaleAlertAt.toISOString()
      : null,
    lastManualSweepAt: state?.lastManualSweepAt
      ? state.lastManualSweepAt.toISOString()
      : null,
    lastManualSweepByUserId: state?.lastManualSweepByUserId ?? null,
    lastManualSweepByName: state?.lastManualSweepByName ?? null,
    staleAlertThresholdMs: thresholdMs,
    staleAlertThrottleMs: throttleMs,
  });
}
