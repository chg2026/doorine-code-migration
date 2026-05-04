import { NextRequest, NextResponse } from "next/server";
import {
  evaluateStaleSweepAlerts,
  runNotificationSweepForAllCompanies,
  sendWeeklyOutageRecap,
  sweepBillingRemindersForAllCompanies,
} from "@/lib/notifications/sweep";
import { publicOrigin } from "@/lib/auth";

/**
 * GET/POST /api/cron/notifications-sweep
 *
 * Scheduled trigger that runs the notification sweep (document expiry,
 * contractor lapse, email digest flush) for every company. Designed to be
 * pinged at least every 15 minutes by a Replit Scheduled Deployment, an
 * external cron service, or `scripts/notification-sweep.ts`.
 *
 * Authentication: requires `CRON_SECRET` to be set as an env var, and the
 * caller must present it as either:
 *   - `Authorization: Bearer <CRON_SECRET>`, or
 *   - `x-cron-secret: <CRON_SECRET>` header
 *
 * If `CRON_SECRET` is unset the endpoint refuses to run so an unguarded
 * deploy cannot be abused to fan out unwanted emails.
 */

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ") && auth.slice("Bearer ".length) === secret) {
    return true;
  }
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret && headerSecret === secret) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 }
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run the sweep in its own isolated try/catch so a thrown sweep never
  // short-circuits the watchdog or the weekly recap — those downstream jobs
  // must always run, because a repeated sweep crash is exactly the scenario
  // where admins most need the outage-alert email.
  let summary: Awaited<ReturnType<typeof runNotificationSweepForAllCompanies>> | null = null;
  let sweepError: string | null = null;
  try {
    summary = await runNotificationSweepForAllCompanies();
    const failed = summary.results.filter((r) => r.error).length;
    console.log(
      `[cron:notifications-sweep] companies=${summary.totalCompanies} failed=${failed} durationMs=${summary.durationMs}`
    );
  } catch (err) {
    sweepError = err instanceof Error ? err.message : String(err);
    console.error(`[cron:notifications-sweep] fatal: ${sweepError}`);
  }

  // After running the sweep, scan for companies whose `lastDigestSweepAt`
  // is older than the staleness threshold and email their admins. This is
  // tucked into the same cron trigger so a single Scheduled Deployment
  // covers both jobs. Runs unconditionally so the watchdog fires even when
  // the sweep itself threw — that is exactly the outage scenario it exists
  // to catch. Failures are isolated from the sweep response so a monitor
  // outage never reports as a sweep outage.
  let staleAlerts;
  try {
    staleAlerts = await evaluateStaleSweepAlerts({ baseUrl: publicOrigin(req) });
    if (staleAlerts.alertedCompanies > 0 || staleAlerts.staleCompanies > 0) {
      console.log(
        `[cron:notifications-sweep] stale-monitor stale=${staleAlerts.staleCompanies} alerted=${staleAlerts.alertedCompanies} emails=${staleAlerts.emailsDelivered}/${staleAlerts.emailsAttempted}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:notifications-sweep] stale-monitor failed: ${message}`);
    staleAlerts = { error: message };
  }

  // Weekly outage-alert recap. Per-company throttle (~7 days) lives inside
  // `sendWeeklyOutageRecap`, so calling on every cron tick is safe — the
  // function is a no-op for any company that already got a recap this week
  // or had zero alerts in the window. Runs unconditionally for the same
  // reason as the watchdog above. Failures are isolated so a recap outage
  // cannot mask a successful sweep response.
  let weeklyRecap;
  try {
    weeklyRecap = await sendWeeklyOutageRecap({ baseUrl: publicOrigin(req) });
    if (weeklyRecap.sentCompanies > 0) {
      console.log(
        `[cron:notifications-sweep] weekly-recap sent=${weeklyRecap.sentCompanies} emails=${weeklyRecap.emailsDelivered}/${weeklyRecap.emailsAttempted}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:notifications-sweep] weekly-recap failed: ${message}`);
    weeklyRecap = { error: message };
  }

  // Daily billing reminders: re-alert admins of companies that have been in
  // an unhealthy billing state for 24h+ and haven't fixed it yet. Failures
  // are isolated so a reminder outage cannot mask a successful sweep.
  let billingReminders;
  try {
    billingReminders = await sweepBillingRemindersForAllCompanies();
    if (billingReminders.reminded > 0) {
      console.log(
        `[cron:notifications-sweep] billing-reminders evaluated=${billingReminders.evaluated} reminded=${billingReminders.reminded}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:notifications-sweep] billing-reminders failed: ${message}`);
    billingReminders = { error: message };
  }

  if (sweepError !== null) {
    return NextResponse.json(
      { error: sweepError, staleAlerts, weeklyRecap, billingReminders },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...summary, staleAlerts, weeklyRecap, billingReminders }, { status: 200 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
