/**
 * In-process notification sweep scheduler.
 *
 * Registered from `instrumentation.ts` so it starts whenever the Next.js
 * server boots and runs `runNotificationSweepForAllCompanies()` every
 * SCHEDULER_INTERVAL_MS without needing user traffic. The first sweep is
 * fired ~30 seconds after boot to let the app finish initializing.
 *
 * For Replit autoscale deployments that scale to zero between requests,
 * this should be paired with a Replit Scheduled Deployment running
 * `scripts/notification-sweep.ts` (or an external pinger hitting
 * `/api/cron/notifications-sweep`) so delivery still happens when the
 * container is cold. See `replit.md` for setup.
 */

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000; // 1 minute floor
const INITIAL_DELAY_MS = 30 * 1000;

function readIntervalMs(): number {
  const raw = process.env.NOTIFICATIONS_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[notifications:scheduler] NOTIFICATIONS_SWEEP_INTERVAL_MS=${raw} is invalid; falling back to ${DEFAULT_INTERVAL_MS}ms`
    );
    return DEFAULT_INTERVAL_MS;
  }
  if (parsed < MIN_INTERVAL_MS) {
    console.warn(
      `[notifications:scheduler] NOTIFICATIONS_SWEEP_INTERVAL_MS=${parsed} is below the ${MIN_INTERVAL_MS}ms floor; clamping`
    );
    return MIN_INTERVAL_MS;
  }
  return parsed;
}

declare global {
  var __chgNotificationSweepStarted: boolean | undefined;
}

export function startNotificationSweepScheduler(): void {
  // Guard against multiple starts (Next.js dev hot-reload, multiple workers
  // sharing a process, etc.). Per-company DB throttle would catch duplicates
  // anyway but no point spinning extra timers.
  if (globalThis.__chgNotificationSweepStarted) return;
  globalThis.__chgNotificationSweepStarted = true;

  if (process.env.NOTIFICATIONS_SWEEP_DISABLED === "1") {
    console.log("[notifications:scheduler] disabled via NOTIFICATIONS_SWEEP_DISABLED=1");
    return;
  }

  const tick = async () => {
    try {
      // Lazy-import so this module can be loaded in environments where Prisma
      // isn't available (e.g. edge runtime).
      const { runNotificationSweepForAllCompanies } = await import("./sweep");
      const summary = await runNotificationSweepForAllCompanies();
      const failed = summary.results.filter((r) => r.error).length;
      console.log(
        `[notifications:scheduler] swept companies=${summary.totalCompanies} skipped=${summary.skippedCompanies} failed=${failed} durationMs=${summary.durationMs}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[notifications:scheduler] tick failed: ${message}`);
    }
  };

  const intervalMs = readIntervalMs();
  console.log(
    `[notifications:scheduler] starting (intervalMs=${intervalMs}, initialDelayMs=${INITIAL_DELAY_MS})`
  );
  setTimeout(() => {
    void tick();
    setInterval(tick, intervalMs).unref();
  }, INITIAL_DELAY_MS).unref();
}
