import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, publicOrigin } from "@/lib/auth";
import {
  evaluateStaleSweepAlerts,
  getStaleAlertConfig,
  runNotificationSweep,
} from "@/lib/notifications/sweep";

/**
 * POST /api/admin/notifications/run-sweep
 *
 * Admin-only. Forces an immediate `runNotificationSweep` for the caller's
 * company without waiting for the next cron tick, and re-runs
 * `evaluateStaleSweepAlerts` so the sweep-status banner reflects both the
 * fresh sweep timestamp and any updated outage-alert state.
 *
 * Intended to be wired to the "Run sweep now" button on the sweep-status
 * banner (Admin → Notifications) so an admin who has just fixed a stalled
 * sweep (e.g. corrected `CRON_SECRET`, restarted the deployment) can confirm
 * the fix in-app instead of waiting up to 15 minutes for the scheduled job.
 *
 * Throttled per-company to one manual run every {@link MANUAL_THROTTLE_MS}
 * milliseconds so an admin clicking the button repeatedly cannot hammer the
 * worker (the underlying `runNotificationSweep` is invoked with
 * `force: true`, which bypasses its own attempt-throttle, so we enforce a
 * separate one here).
 */

export const dynamic = "force-dynamic";

const MANUAL_THROTTLE_MS = 10_000;

// Process-local throttle. The sweep-status banner is the only caller and
// only one Admin per company is realistically clicking, so an in-memory
// guard is sufficient — losing it on deploy is fine because the worst case
// is an extra sweep right after a restart.
const lastManualRunAt = new Map<string, number>();

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const last = lastManualRunAt.get(user.companyId) ?? 0;
  const sinceLast = now - last;
  if (sinceLast < MANUAL_THROTTLE_MS) {
    const retryAfterMs = MANUAL_THROTTLE_MS - sinceLast;
    return NextResponse.json(
      {
        error: "Sweep was just run. Please wait a moment before trying again.",
        retryAfterMs,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }
  lastManualRunAt.set(user.companyId, now);

  let sweepError: string | null = null;
  try {
    await runNotificationSweep(user.companyId, { force: true });
  } catch (err) {
    sweepError = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin:run-sweep] sweep failed for company=${user.companyId}: ${sweepError}`
    );
  }

  // Record who triggered this manual run so other admins viewing the
  // banner can see "Last manual run: <name>, <relative time>" and avoid
  // hitting the button redundantly during an outage. Stored on
  // NotificationState (upserted because companies that have never had a
  // sweep won't have a row yet). The display name is denormalized at
  // write time so the banner still shows a sensible label even if the
  // user is later renamed or removed.
  const manualRunAt = new Date(now);
  const triggeredByName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Admin";
  try {
    await prisma.notificationState.upsert({
      where: { companyId: user.companyId },
      create: {
        companyId: user.companyId,
        lastManualSweepAt: manualRunAt,
        lastManualSweepByUserId: user.id,
        lastManualSweepByName: triggeredByName,
      },
      update: {
        lastManualSweepAt: manualRunAt,
        lastManualSweepByUserId: user.id,
        lastManualSweepByName: triggeredByName,
      },
    });
  } catch (err) {
    console.error(
      `[admin:run-sweep] failed to record manual run for company=${user.companyId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Re-run the watchdog so the banner immediately reflects whether the
  // outage-alert email window has cleared. Scoped to the caller's company
  // via `companyIds` so a single tenant admin cannot trigger a global,
  // cross-tenant stale-alert evaluation. Failures here are isolated from
  // the sweep itself so a watchdog hiccup doesn't mask a successful sweep.
  let staleAlertError: string | null = null;
  try {
    await evaluateStaleSweepAlerts({
      baseUrl: publicOrigin(req),
      companyIds: [user.companyId],
    });
  } catch (err) {
    staleAlertError = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin:run-sweep] stale-monitor failed for company=${user.companyId}: ${staleAlertError}`
    );
  }

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

  return NextResponse.json(
    {
      ok: sweepError === null,
      sweepError,
      staleAlertError,
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
      manualThrottleMs: MANUAL_THROTTLE_MS,
    },
    { status: sweepError ? 500 : 200 }
  );
}
