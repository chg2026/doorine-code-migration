/**
 * Next.js instrumentation hook. Runs once when the server boots. Used to
 * start the in-process notification sweep scheduler so document-expiry,
 * contractor-lapse, and email-digest delivery does not depend on user
 * traffic.
 *
 * Skips only when explicitly running on the edge runtime (Prisma + the
 * scheduler need Node APIs). For Node.js or any unspecified runtime we
 * start the scheduler so we don't silently no-op if `NEXT_RUNTIME` is
 * undefined for whatever reason.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startNotificationSweepScheduler } = await import("./lib/notifications/scheduler");
  startNotificationSweepScheduler();

  // Boot-time sanity check: confirm we can build outbound unsubscribe links.
  // Without a public base URL the dispatcher silently drops the
  // List-Unsubscribe header, which breaks Gmail/Yahoo bulk-sender rules.
  const { getUnsubscribeLinkDiagnostic } = await import("./lib/contactUnsubscribe");
  const diag = getUnsubscribeLinkDiagnostic();
  if (!diag.ok) {
    console.warn(
      `[boot] Unsubscribe links are NOT being generated — ${diag.reason} ` +
        `Outbound notification emails will be sent without a List-Unsubscribe header, ` +
        `which hurts deliverability.`
    );
  } else {
    console.info(
      `[boot] Unsubscribe links resolved via ${diag.source} (${diag.origin}).`
    );
  }
}
