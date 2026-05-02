/**
 * Notification sweep entry point for use as a Replit Scheduled Deployment
 * (or any other cron-style runner). Runs the document-expiry, contractor-
 * lapse, and email-digest sweeps for every company exactly once and exits.
 *
 * Schedule this every 15 minutes via:
 *   replit deployment type: Scheduled
 *   build: npm run build (or skip if no compiled artifacts are needed)
 *   run:   npx tsx scripts/notification-sweep.ts
 *
 * Alternatively, ping the HTTP endpoint
 *   GET /api/cron/notifications-sweep
 *   Authorization: Bearer ${CRON_SECRET}
 * from any external scheduler.
 */
import {
  evaluateStaleSweepAlerts,
  runNotificationSweepForAllCompanies,
  sendWeeklyOutageRecap,
  sweepBillingRemindersForAllCompanies,
} from "../lib/notifications/sweep";
import { prisma } from "../lib/prisma";

async function main() {
  const summary = await runNotificationSweepForAllCompanies();
  const failed = summary.results.filter((r) => r.error).length;
  const emailsSent = summary.results.reduce((acc, r) => acc + (r.emailsSent ?? 0), 0);
  const emailsFailed = summary.results.reduce((acc, r) => acc + (r.emailsFailed ?? 0), 0);

  // Watchdog: alert admins of any company whose last successful sweep is
  // older than the configured threshold. Errors are caught so a monitor
  // outage cannot fail the sweep job itself.
  let staleAlerts: Awaited<ReturnType<typeof evaluateStaleSweepAlerts>> | { error: string } | null = null;
  try {
    staleAlerts = await evaluateStaleSweepAlerts();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scripts/notification-sweep] stale-monitor failed:", message);
    staleAlerts = { error: message };
  }

  // Weekly recap: email each company's admins a 7-day summary of outage
  // alerts. Per-company throttle inside `sendWeeklyOutageRecap` makes this
  // safe to call on every cron tick — only companies whose last recap was
  // ~7+ days ago and that have alerts in the window will actually receive
  // an email.
  let weeklyRecap: Awaited<ReturnType<typeof sendWeeklyOutageRecap>> | { error: string } | null = null;
  try {
    weeklyRecap = await sendWeeklyOutageRecap();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scripts/notification-sweep] weekly-recap failed:", message);
    weeklyRecap = { error: message };
  }

  // Daily billing reminders: re-alert admins of companies that have been in
  // an unhealthy billing state for 24h+ and haven't fixed it yet.
  let billingReminders: Awaited<ReturnType<typeof sweepBillingRemindersForAllCompanies>> | { error: string } | null = null;
  try {
    billingReminders = await sweepBillingRemindersForAllCompanies();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scripts/notification-sweep] billing-reminders failed:", message);
    billingReminders = { error: message };
  }

  console.log(
    JSON.stringify({
      job: "notifications-sweep",
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      durationMs: summary.durationMs,
      totalCompanies: summary.totalCompanies,
      failedCompanies: failed,
      emailsSent,
      emailsFailed,
      staleAlerts,
      weeklyRecap,
      billingReminders,
    })
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[scripts/notification-sweep] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
