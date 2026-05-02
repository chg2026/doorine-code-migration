import { prisma } from "../prisma";
import { getCompanySettings } from "../companySettings";
import { dispatchNotification, flushPendingEmails } from "./dispatch";
import { effectiveDocStatus } from "../docStatus";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";
import { BILLING_REMINDER_WINDOW_MS, isUnhealthyStatus, notifyAdminsOfBillingReminder } from "./billing";

/**
 * Batch worker that:
 *  - flushes due email notifications
 *  - re-evaluates document expiry windows and emits docExpiry alerts
 *  - re-evaluates contractor update cadence and emits missingUpdates alerts
 *
 * Primary trigger is a scheduled job (see `app/api/cron/notifications-sweep`
 * and `scripts/notification-sweep.ts`) that runs every 15 minutes against
 * every company so delivery is not gated on user traffic.
 *
 * Also called opportunistically from the bell GET endpoint as a backstop
 * when the scheduled job is misconfigured. Both call sites are throttled to
 * at most once per ~5 minutes per company (the scheduled job uses
 * `force: true` so it always runs).
 */

const THROTTLE_MS = 5 * 60 * 1000;

function cadenceToDays(cadence: string | undefined): number | null {
  switch (cadence) {
    case "Daily":
      return 1;
    case "Weekly":
      return 7;
    case "Milestone-only":
    case "None":
    case undefined:
      return null;
    default:
      return null;
  }
}

export async function runNotificationSweep(
  companyId: string,
  opts: { force?: boolean } = {}
): Promise<{ ran: boolean; emailFlush?: Awaited<ReturnType<typeof flushPendingEmails>> }> {
  const now = new Date();
  const state = await prisma.notificationState.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });
  // The bell-GET backstop calls this opportunistically; throttle on the
  // attempt timestamp (not success) so a tight retry loop after a failure
  // doesn't hammer the DB on every notification poll.
  const throttleAnchor = state.lastSweepAttemptAt ?? state.lastDigestSweepAt;
  if (
    !opts.force &&
    throttleAnchor &&
    now.getTime() - throttleAnchor.getTime() < THROTTLE_MS
  ) {
    return { ran: false };
  }

  // Stamp the attempt up-front so concurrent invocations honor the throttle,
  // but DO NOT touch lastDigestSweepAt yet — that field is reserved for
  // successful runs so the stale-sweep watchdog
  // (`evaluateStaleSweepAlerts`) can detect repeatedly-failing companies.
  await prisma.notificationState.update({
    where: { companyId },
    data: { lastSweepAttemptAt: now },
  });

  const emailFlush = await flushPendingEmails(companyId, now);
  await sweepDocExpiry(companyId, now);
  await sweepContractorLapse(companyId, now);

  // All steps completed without throwing — record the successful sweep.
  await prisma.notificationState.update({
    where: { companyId },
    data: { lastDigestSweepAt: now },
  });
  return { ran: true, emailFlush };
}

async function sweepDocExpiry(companyId: string, now: Date): Promise<void> {
  const settings = await getCompanySettings(companyId);
  const threshold = settings.expiryAlertThresholdDays || 60;
  const horizon = new Date(now.getTime() + threshold * 86_400_000);

  const docs = await prisma.document.findMany({
    where: {
      companyId,
      expiresAt: { lte: horizon, not: null },
      status: { notIn: ["Archived"] },
    },
    select: {
      id: true,
      name: true,
      level: true,
      status: true,
      expiresAt: true,
      projectId: true,
      contactId: true,
      project: { select: { code: true } },
    },
  });

  for (const d of docs) {
    if (!d.expiresAt) continue;
    const eff = effectiveDocStatus(d.status, d.expiresAt, threshold, now);
    if (eff !== "expiring" && eff !== "expired") continue;
    const daysOut = Math.ceil((d.expiresAt.getTime() - now.getTime()) / 86_400_000);
    const lapsed = daysOut < 0;
    const title = lapsed
      ? `Document expired: ${d.name}`
      : `Document expiring in ${daysOut} day${daysOut === 1 ? "" : "s"}: ${d.name}`;
    const body = lapsed
      ? `${d.name} expired ${Math.abs(daysOut)} day${Math.abs(daysOut) === 1 ? "" : "s"} ago.`
      : `${d.name} enters the expiry window. Renew before ${d.expiresAt.toISOString().slice(0, 10)}.`;
    await dispatchNotification({
      companyId,
      event: "docExpiry",
      projectId: d.projectId,
      contactIds: d.contactId ? [d.contactId] : undefined,
      title,
      body,
      link: d.project?.code ? `/rehab/${d.project.code}/documents` : `/docs`,
      meta: { documentId: d.id, expiresAt: d.expiresAt.toISOString(), lapsed, daysOut },
      urgent: lapsed,
      dedupeKey: `docExpiry:${d.id}:${lapsed ? "lapsed" : "warning"}`,
    });
  }
}

async function sweepContractorLapse(companyId: string, now: Date): Promise<void> {
  const settings = await getCompanySettings(companyId);
  const meta = (settings.meta || {}) as Record<string, unknown>;
  const cadence = typeof meta.contractorUpdateCadence === "string"
    ? (meta.contractorUpdateCadence as string)
    : undefined;
  const escalation =
    typeof meta.missingUpdateEscalation === "string"
      ? (meta.missingUpdateEscalation as string)
      : "Flag in activity log";

  const days = cadenceToDays(cadence);
  if (!days) return;
  if (escalation === "No action") return;
  if (escalation !== "Notify PM" && escalation !== "Flag + Notify PM") {
    // The "Flag in activity log" path is owned by the activity log writer, not
    // the notification dispatcher. Bail without sending.
    return;
  }

  const cutoff = new Date(now.getTime() - days * 86_400_000);

  const assignments = await prisma.contractorAssignment.findMany({
    where: { companyId, status: "Active" },
    select: {
      id: true,
      contactId: true,
      projectId: true,
      role: true,
      assignedAt: true,
      contact: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });

  for (const a of assignments) {
    // Last activity from this contractor on this project (notes, exceptions,
    // doc uploads, draws). For the prototype we approximate with the most
    // recent ActivityLogEntry whose meta.projectId matches.
    const lastActivity = await prisma.activityLogEntry.findFirst({
      where: {
        companyId,
        OR: [
          { entityId: a.projectId },
          { entity: "Project", entityId: a.projectId },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const last = lastActivity?.createdAt ?? a.assignedAt;
    if (last.getTime() > cutoff.getTime()) continue;

    const daysSince = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
    await dispatchNotification({
      companyId,
      event: "missingUpdates",
      projectId: a.projectId,
      contactIds: [a.contactId],
      title: `${a.contact.name} hasn't posted an update in ${daysSince} day${daysSince === 1 ? "" : "s"}`,
      body: `${a.role} on ${a.project.code} (${a.project.name}). Cadence is ${cadence}.`,
      link: `/rehab/${a.project.code}/activity`,
      meta: {
        contractorAssignmentId: a.id,
        contactId: a.contactId,
        projectId: a.projectId,
        cadence,
        daysSinceLastUpdate: daysSince,
      },
      dedupeKey: `missingUpdates:${a.id}:${cutoff.toISOString().slice(0, 10)}`,
    });
  }
}

export type SweepCompanyResult = {
  companyId: string;
  ran: boolean;
  emailsSent?: number;
  emailsFailed?: number;
  error?: string;
};

/**
 * Subscription statuses that indicate the company still has access to the
 * product. Canceled / inactive / incomplete tenants are skipped by the
 * scheduled sweep so we don't email customers who shouldn't be getting
 * notifications. Companies without a Subscription row at all (the unbilled
 * default) are also considered active.
 */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Run `runNotificationSweep` for every active company in the database.
 * Intended for the scheduled trigger (in-process scheduler in
 * `instrumentation.ts`, Replit Scheduled Deployment via
 * `scripts/notification-sweep.ts`, or external pinger via the
 * `/api/cron/notifications-sweep` route) that fires at least every 15
 * minutes so delivery cadence does not depend on whether anyone has opened
 * the bell. Always passes `force: true` so the per-company throttle (which
 * only exists to keep the bell GET snappy) is bypassed.
 *
 * "Active" means the company has either no Subscription row or a Subscription
 * whose status is one of `active | trialing | past_due`. Canceled, inactive,
 * and incomplete tenants are skipped.
 *
 * Failures for a single company are caught so one bad tenant cannot stall the
 * sweep for the rest. The summary is logged and returned for observability.
 */
export async function runNotificationSweepForAllCompanies(): Promise<{
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalCompanies: number;
  skippedCompanies: number;
  results: SweepCompanyResult[];
}> {
  const startedAt = new Date();
  const companies = await prisma.company.findMany({
    select: { id: true, subscription: { select: { status: true } } },
  });
  const active = companies.filter(
    (c) => !c.subscription || ACTIVE_SUBSCRIPTION_STATUSES.has(c.subscription.status)
  );
  const results: SweepCompanyResult[] = [];

  for (const c of active) {
    try {
      const out = await runNotificationSweep(c.id, { force: true });
      results.push({
        companyId: c.id,
        ran: out.ran,
        emailsSent: out.emailFlush?.sent,
        emailsFailed: out.emailFlush?.failed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[notifications:sweep] company ${c.id} failed: ${message}`);
      results.push({ companyId: c.id, ran: false, error: message });
    }
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totalCompanies: active.length,
    skippedCompanies: companies.length - active.length,
    results,
  };
}

/**
 * Default staleness threshold for the sweep monitor. If a company's
 * `lastDigestSweepAt` is older than this, the monitor considers the sweep
 * stalled and (subject to throttle) emails the admins. Tunable per-company
 * via `CompanySetting.meta.notifyStaleAlertThresholdMs` (validated against
 * `STALE_THRESHOLD_BOUNDS_MS` in the settings PATCH handler) or globally
 * via the `NOTIFICATIONS_SWEEP_STALE_THRESHOLD_MS` env var.
 */
const DEFAULT_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Minimum gap between consecutive stale alerts for the same company. Keeps
 * admins from being spammed during a prolonged outage. Tunable per-company
 * via `CompanySetting.meta.notifyStaleAlertThrottleMs` (validated against
 * `STALE_THROTTLE_BOUNDS_MS` in the settings PATCH handler) or globally via
 * the `NOTIFICATIONS_SWEEP_STALE_THROTTLE_MS` env var.
 */
const DEFAULT_STALE_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Validation bounds for the per-company stale-alert overrides. Exposed so
 * the settings PATCH handler and the admin UI can share the same range.
 */
export const STALE_THRESHOLD_BOUNDS_MS = {
  min: 15 * 60 * 1000, // 15 minutes
  max: 24 * 60 * 60 * 1000, // 24 hours
} as const;

export const STALE_THROTTLE_BOUNDS_MS = {
  min: 60 * 60 * 1000, // 1 hour
  max: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readBoundedMetaNumber(
  meta: Record<string, unknown> | null | undefined,
  key: string,
  bounds: { min: number; max: number }
): number | null {
  if (!meta) return null;
  const raw = meta[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < bounds.min || raw > bounds.max) return null;
  return raw;
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"}`;
}

/**
 * Return the resolved staleness threshold and throttle window (in ms) that
 * `evaluateStaleSweepAlerts` will use for the given company. Layers the
 * per-company `CompanySetting.meta.notifyStaleAlertThresholdMs` /
 * `notifyStaleAlertThrottleMs` overrides on top of the
 * `NOTIFICATIONS_SWEEP_STALE_THRESHOLD_MS` /
 * `NOTIFICATIONS_SWEEP_STALE_THROTTLE_MS` env vars (which themselves fall
 * back to 60 min / 6 h). When `companyId` is omitted, returns the global
 * defaults — used by callers that just need the env-level numbers.
 *
 * Exposed so the Admin → Notifications UI can show admins the same effective
 * threshold/throttle the watchdog will actually apply, and compute the
 * next-allowed alert time, without duplicating the env-parsing or
 * meta-validation logic.
 */
export async function getStaleAlertConfig(
  companyId?: string
): Promise<{ thresholdMs: number; throttleMs: number }> {
  const defaults = {
    thresholdMs: readEnvNumber(
      "NOTIFICATIONS_SWEEP_STALE_THRESHOLD_MS",
      DEFAULT_STALE_THRESHOLD_MS
    ),
    throttleMs: readEnvNumber(
      "NOTIFICATIONS_SWEEP_STALE_THROTTLE_MS",
      DEFAULT_STALE_THROTTLE_MS
    ),
  };
  if (!companyId) return defaults;
  const settings = await getCompanySettings(companyId).catch(() => null);
  const meta =
    settings?.meta && typeof settings.meta === "object"
      ? (settings.meta as Record<string, unknown>)
      : null;
  return {
    thresholdMs:
      readBoundedMetaNumber(meta, "notifyStaleAlertThresholdMs", STALE_THRESHOLD_BOUNDS_MS) ??
      defaults.thresholdMs,
    throttleMs:
      readBoundedMetaNumber(meta, "notifyStaleAlertThrottleMs", STALE_THROTTLE_BOUNDS_MS) ??
      defaults.throttleMs,
  };
}

export type StaleAlertCompanyResult = {
  companyId: string;
  staleForMs: number | null;
  alerted: boolean;
  /** Effective (per-company) staleness threshold actually applied. */
  thresholdMs: number;
  /** Effective (per-company) throttle window actually applied. */
  throttleMs: number;
  reason?:
    | "not_stale"
    | "throttled"
    | "no_admins"
    | "no_admin_emails"
    | "no_state_row"
    | "provider_not_configured"
    | "send_failed";
  recipients?: number;
  delivered?: number;
  failed?: number;
};

export type StaleAlertSummary = {
  /** Global default threshold (env or opts override). */
  thresholdMs: number;
  /** Global default throttle (env or opts override). */
  throttleMs: number;
  evaluated: number;
  staleCompanies: number;
  alertedCompanies: number;
  emailsAttempted: number;
  emailsDelivered: number;
  results: StaleAlertCompanyResult[];
};

/**
 * Inspect every active company's `NotificationState.lastDigestSweepAt` and
 * email each company's Admin users when the last successful sweep is older
 * than the configured staleness threshold (default 60 min). Throttled per
 * company via `lastStaleAlertAt` so admins are not spammed during a multi-
 * hour outage.
 *
 * Companies that have never been swept (no `NotificationState` row yet) are
 * skipped — those are typically brand-new tenants that the next sweep cycle
 * will pick up. Companies whose `NotificationState` exists but has a null
 * `lastDigestSweepAt` are treated as stale and alerted.
 *
 * Designed to be called from the scheduled `/api/cron/notifications-sweep`
 * route immediately after the sweep itself runs — that way the same trigger
 * that drives the sweep also drives the watchdog. If the cron stops being
 * called entirely, no email can fire (an inherent limitation of any in-app
 * watchdog), but per-company sweep failures and DB-update failures will all
 * be caught here.
 */
export async function evaluateStaleSweepAlerts(opts: {
  /** Reference time. Defaults to now. */
  now?: Date;
  /** Public-facing origin used to build the link in the alert email. */
  baseUrl?: string;
  /** Override the default staleness threshold (ms). */
  thresholdMs?: number;
  /** Override the default per-company throttle (ms). */
  throttleMs?: number;
  /**
   * Restrict evaluation to the given set of companies. When omitted, every
   * active company is evaluated (the cron / scheduled-job behavior). When
   * provided, only companies whose ids appear in this list are scanned —
   * used by the admin "Run sweep now" route so a single tenant admin
   * cannot trigger a global stale-alert evaluation across other tenants.
   */
  companyIds?: string[];
} = {}): Promise<StaleAlertSummary> {
  const now = opts.now ?? new Date();
  const defaultThresholdMs =
    opts.thresholdMs ??
    readEnvNumber("NOTIFICATIONS_SWEEP_STALE_THRESHOLD_MS", DEFAULT_STALE_THRESHOLD_MS);
  const defaultThrottleMs =
    opts.throttleMs ??
    readEnvNumber("NOTIFICATIONS_SWEEP_STALE_THROTTLE_MS", DEFAULT_STALE_THROTTLE_MS);

  const idFilter =
    opts.companyIds && opts.companyIds.length > 0
      ? { id: { in: opts.companyIds } }
      : undefined;
  const companies = await prisma.company.findMany({
    where: idFilter,
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscription: { select: { status: true } },
      notificationState: {
        select: { lastDigestSweepAt: true, lastStaleAlertAt: true },
      },
    },
  });
  const active = companies.filter(
    (c) => !c.subscription || ACTIVE_SUBSCRIPTION_STATUSES.has(c.subscription.status)
  );

  const results: StaleAlertCompanyResult[] = [];
  let staleCompanies = 0;
  let alertedCompanies = 0;
  let emailsAttempted = 0;
  let emailsDelivered = 0;

  for (const c of active) {
    // Per-company override of the staleness threshold and throttle, falling
    // back to the global default when unset or out-of-bounds. Loaded up-front
    // so every result row reports the value that was actually applied.
    const settings = await getCompanySettings(c.id).catch(() => null);
    const meta =
      settings?.meta && typeof settings.meta === "object"
        ? (settings.meta as Record<string, unknown>)
        : null;
    const thresholdMs =
      readBoundedMetaNumber(meta, "notifyStaleAlertThresholdMs", STALE_THRESHOLD_BOUNDS_MS) ??
      defaultThresholdMs;
    const throttleMs =
      readBoundedMetaNumber(meta, "notifyStaleAlertThrottleMs", STALE_THROTTLE_BOUNDS_MS) ??
      defaultThrottleMs;

    const state = c.notificationState;
    if (!state) {
      // No NotificationState row yet. For very young companies this just
      // means the next sweep cycle will create the row — skip without
      // alerting. For long-lived companies (older than the staleness
      // threshold) the absence of a row is itself a sign that the sweep
      // never ran for them, so treat them as stale.
      const ageMs = now.getTime() - c.createdAt.getTime();
      if (ageMs <= thresholdMs) {
        results.push({
          companyId: c.id,
          staleForMs: null,
          alerted: false,
          thresholdMs,
          throttleMs,
          reason: "no_state_row",
        });
        continue;
      }
      // Fall through into the stale-handling path with a synthetic state
      // record (no prior alert, no last sweep). We materialize a row so the
      // throttle stamp at the end of the path lands somewhere.
      await prisma.notificationState
        .upsert({
          where: { companyId: c.id },
          update: {},
          create: { companyId: c.id },
        })
        .catch(() => undefined);
    }
    const last = state?.lastDigestSweepAt ?? null;
    const staleForMs = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
    const isStale = staleForMs > thresholdMs;
    if (!isStale) {
      results.push({
        companyId: c.id,
        staleForMs: Number.isFinite(staleForMs) ? staleForMs : null,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "not_stale",
      });
      continue;
    }
    staleCompanies += 1;

    if (
      state?.lastStaleAlertAt &&
      now.getTime() - state.lastStaleAlertAt.getTime() < throttleMs
    ) {
      results.push({
        companyId: c.id,
        staleForMs: Number.isFinite(staleForMs) ? staleForMs : null,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "throttled",
      });
      continue;
    }

    // Operational outage alerts go to every Admin regardless of personal
    // emailOptOut — opt-out is a preference for routine notifications, not
    // critical "things are broken" pages. (Aligns with the billing-failure
    // alert pattern.)
    const admins = await prisma.user.findMany({
      where: { companyId: c.id, role: "Admin", active: true },
      select: { email: true, firstName: true, lastName: true },
    });
    if (admins.length === 0) {
      results.push({
        companyId: c.id,
        staleForMs: Number.isFinite(staleForMs) ? staleForMs : null,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "no_admins",
      });
      continue;
    }
    const recipients = admins.filter((u) => u.email);
    if (recipients.length === 0) {
      results.push({
        companyId: c.id,
        staleForMs: Number.isFinite(staleForMs) ? staleForMs : null,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "no_admin_emails",
      });
      continue;
    }

    if (!isOutboundEmailConfigured()) {
      const durationLabel = Number.isFinite(staleForMs)
        ? `stale for ${formatDuration(staleForMs)}`
        : "has no recorded sweep";
      console.info(
        `[notifications:stale-alert] company ${c.id} ${durationLabel} but outbound email is not configured`
      );
      results.push({
        companyId: c.id,
        staleForMs: Number.isFinite(staleForMs) ? staleForMs : null,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "provider_not_configured",
      });
      continue;
    }

    const replyToRaw = meta?.notifyReplyTo;
    const replyTo =
      typeof replyToRaw === "string" && replyToRaw.trim() ? replyToRaw.trim() : undefined;

    const link = buildAdminNotificationsLink(opts.baseUrl);
    const lastText = last
      ? `${last.toUTCString()} (${formatDuration(staleForMs)} ago)`
      : "never";
    const subject = `[${c.name}] Notification sweep is stalled — alerts may not be sending`;
    const text = [
      `The notification sweep for ${c.name} hasn't completed in ${
        last ? formatDuration(staleForMs) : "any recorded run"
      }.`,
      "",
      `Last successful sweep: ${lastText}`,
      `Staleness threshold:   ${formatDuration(thresholdMs)}`,
      "",
      "While the sweep is stalled, document-expiry warnings and contractor-lapse",
      "alerts will not go out, and queued digest emails will not flush.",
      "",
      link
        ? `Open Admin Settings → Notifications: ${link}`
        : "Open Admin Settings → Notifications in CHG Rehab to review the sweep status banner.",
      "",
      "Common causes:",
      "  • The Replit Scheduled Deployment running scripts/notification-sweep.ts is paused or failing.",
      "  • The external pinger calling /api/cron/notifications-sweep has the wrong CRON_SECRET.",
      "  • The notification-sweep job is throwing — check the deployment logs.",
      "",
      "You will not receive another alert about this company for at least " +
        `${formatDuration(throttleMs)}.`,
    ].join("\n");
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
        <p><strong>The notification sweep for ${escapeHtml(c.name)} is stalled.</strong></p>
        <p>
          Last successful sweep: <strong>${escapeHtml(lastText)}</strong><br/>
          Staleness threshold: <strong>${escapeHtml(formatDuration(thresholdMs))}</strong>
        </p>
        <p>
          While the sweep is stalled, document-expiry warnings and contractor-lapse
          alerts will not go out, and queued digest emails will not flush.
        </p>
        ${
          link
            ? `<p><a href="${escapeHtml(link)}">Open Admin Settings → Notifications</a></p>`
            : `<p>Open <em>Admin Settings → Notifications</em> in CHG Rehab to review the sweep status banner.</p>`
        }
        <p style="color:#444">Common causes:</p>
        <ul style="color:#444">
          <li>The Replit Scheduled Deployment running <code>scripts/notification-sweep.ts</code> is paused or failing.</li>
          <li>The external pinger calling <code>/api/cron/notifications-sweep</code> has the wrong <code>CRON_SECRET</code>.</li>
          <li>The notification-sweep job is throwing — check the deployment logs.</li>
        </ul>
        <p style="color:#666;font-size:12px">
          You will not receive another alert about this company for at least
          ${escapeHtml(formatDuration(throttleMs))}.
        </p>
      </div>
    `;

    let delivered = 0;
    let failed = 0;
    const recipientResults: Array<{
      email: string;
      delivered: boolean;
      reason?: string;
    }> = [];
    for (const u of recipients) {
      emailsAttempted += 1;
      const res = await sendOutboundEmail({
        to: u.email!,
        subject,
        text,
        html,
        replyTo,
      });
      if (res.delivered) {
        delivered += 1;
        emailsDelivered += 1;
        recipientResults.push({ email: u.email!, delivered: true });
      } else {
        failed += 1;
        recipientResults.push({
          email: u.email!,
          delivered: false,
          reason: res.reason ?? "unknown",
        });
        console.warn(
          `[notifications:stale-alert] failed to email ${u.email} for company ${c.id}: ${
            res.reason ?? "unknown"
          }`
        );
      }
    }

    // Persist a row in the per-company outage-alert log so admins can
    // review historical incidents from the Notifications panel — even
    // attempts where every send failed are recorded so admins can see the
    // sweep monitor tried. Pruning of old entries happens below.
    const safeStaleForMs = Number.isFinite(staleForMs) ? staleForMs : null;
    await prisma.staleSweepAlertLog
      .create({
        data: {
          companyId: c.id,
          sentAt: now,
          staleForMs: safeStaleForMs,
          thresholdMs: Math.round(thresholdMs),
          throttleMs: Math.round(throttleMs),
          recipientCount: recipients.length,
          deliveredCount: delivered,
          failedCount: failed,
          recipients: recipientResults,
        },
      })
      .catch((err) => {
        console.warn(
          `[notifications:stale-alert] failed to record alert log for company ${c.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
    await pruneStaleSweepAlertLog(c.id, now).catch(() => undefined);

    if (delivered > 0) {
      // Only stamp the throttle window once at least one admin actually got
      // the email. If every send failed (transient transport error, etc.) we
      // leave `lastStaleAlertAt` alone so the next sweep cycle retries.
      await prisma.notificationState
        .update({
          where: { companyId: c.id },
          data: { lastStaleAlertAt: now },
        })
        .catch(() => undefined);
      alertedCompanies += 1;
      results.push({
        companyId: c.id,
        staleForMs: safeStaleForMs,
        alerted: true,
        thresholdMs,
        throttleMs,
        recipients: recipients.length,
        delivered,
        failed,
      });
    } else {
      results.push({
        companyId: c.id,
        staleForMs: safeStaleForMs,
        alerted: false,
        thresholdMs,
        throttleMs,
        reason: "send_failed",
        recipients: recipients.length,
        delivered,
        failed,
      });
    }
  }

  return {
    thresholdMs: defaultThresholdMs,
    throttleMs: defaultThrottleMs,
    evaluated: active.length,
    staleCompanies,
    alertedCompanies,
    emailsAttempted,
    emailsDelivered,
    results,
  };
}

/**
 * How long to keep individual `StaleSweepAlertLog` rows. Older entries are
 * pruned opportunistically each time `evaluateStaleSweepAlerts` writes a new
 * row for that company. 30 days is plenty for post-incident review without
 * letting the table grow without bound for tenants who have a chronically
 * broken sweep.
 */
export const STALE_SWEEP_ALERT_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Page size used by `getRecentStaleSweepAlertLogs`. Each API call returns at
 * most this many rows; the Admin → Notifications panel fetches additional pages
 * on demand via the "Load more" button so admins can browse the full 30-day
 * retention window without rendering hundreds of rows up front.
 */
export const STALE_SWEEP_ALERT_LOG_DISPLAY_LIMIT = 20;

async function pruneStaleSweepAlertLog(companyId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_SWEEP_ALERT_LOG_RETENTION_MS);
  await prisma.staleSweepAlertLog.deleteMany({
    where: { companyId, sentAt: { lt: cutoff } },
  });
}

export type StaleSweepAlertLogEntry = {
  id: string;
  sentAt: string;
  staleForMs: number | null;
  thresholdMs: number;
  throttleMs: number;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  recipients: Array<{ email: string; delivered: boolean; reason?: string }>;
};

/**
 * Return a page of outage-alert log rows for the given company, newest first.
 * Used by the Admin → Notifications panel and the matching JSON API.
 *
 * `offset` is zero-based; `limit` defaults to `STALE_SWEEP_ALERT_LOG_DISPLAY_LIMIT`
 * (the page size). The caller should pass `limit + 1` rows and strip the last
 * one to cheaply detect whether another page exists — but here we do that
 * internally and return `hasMore` instead.
 */
export async function getRecentStaleSweepAlertLogs(
  companyId: string,
  offset: number = 0,
  limit: number = STALE_SWEEP_ALERT_LOG_DISPLAY_LIMIT
): Promise<{ items: StaleSweepAlertLogEntry[]; hasMore: boolean }> {
  const pageSize = Math.max(1, limit);
  const rows = await prisma.staleSweepAlertLog.findMany({
    where: { companyId },
    orderBy: { sentAt: "desc" },
    skip: Math.max(0, offset),
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((r) => ({
    id: r.id,
    sentAt: r.sentAt.toISOString(),
    staleForMs: r.staleForMs ?? null,
    thresholdMs: r.thresholdMs,
    throttleMs: r.throttleMs,
    recipientCount: r.recipientCount,
    deliveredCount: r.deliveredCount,
    failedCount: r.failedCount,
    recipients: parseRecipients(r.recipients),
  }));
  return { items, hasMore };
}

/**
 * Return every outage-alert log row for the given company that still falls
 * within the on-screen retention window (`STALE_SWEEP_ALERT_LOG_RETENTION_MS`,
 * currently 30 days), newest first. Older rows are pruned opportunistically by
 * `pruneStaleSweepAlertLog`, so the cutoff is enforced explicitly here as a
 * safety net for tenants whose sweep hasn't run recently. Used by the CSV
 * export so admins can pull the full history shown in the Admin →
 * Notifications panel for postmortems / compliance review.
 */
export async function getStaleSweepAlertLogsForExport(
  companyId: string,
  now: Date = new Date()
): Promise<StaleSweepAlertLogEntry[]> {
  const cutoff = new Date(now.getTime() - STALE_SWEEP_ALERT_LOG_RETENTION_MS);
  const rows = await prisma.staleSweepAlertLog.findMany({
    where: { companyId, sentAt: { gte: cutoff } },
    orderBy: { sentAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sentAt: r.sentAt.toISOString(),
    staleForMs: r.staleForMs ?? null,
    thresholdMs: r.thresholdMs,
    throttleMs: r.throttleMs,
    recipientCount: r.recipientCount,
    deliveredCount: r.deliveredCount,
    failedCount: r.failedCount,
    recipients: parseRecipients(r.recipients),
  }));
}

function parseRecipients(
  raw: unknown
): Array<{ email: string; delivered: boolean; reason?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ email: string; delivered: boolean; reason?: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const email = typeof e.email === "string" ? e.email : null;
    if (!email) continue;
    const delivered = e.delivered === true;
    const reason = typeof e.reason === "string" ? e.reason : undefined;
    out.push({ email, delivered, reason });
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * How far back the weekly outage-alert recap looks. Always 7 days — the
 * matching cadence is enforced by `WEEKLY_RECAP_THROTTLE_MS` below so a
 * cron that fires more often than weekly does not double-send.
 */
export const WEEKLY_RECAP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum gap between consecutive weekly recap emails for the same company.
 * Set just under 7 days so cron jitter (the underlying notification-sweep
 * runs every ~15 min) cannot accidentally cause two recaps in one week, but
 * a recap is never delayed more than a few hours past the 7-day mark.
 */
export const WEEKLY_RECAP_THROTTLE_MS = 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000; // 6 days 23 hours

export const VALID_RECAP_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export type RecapWeekday = (typeof VALID_RECAP_WEEKDAYS)[number];

export type WeeklyRecapResult = {
  companyId: string;
  sent: boolean;
  reason?:
    | "opted_out"
    | "no_alerts"
    | "throttled"
    | "wrong_weekday"
    | "no_admins"
    | "no_admin_emails"
    | "provider_not_configured"
    | "send_failed";
  alertCount?: number;
  deliveredAlerts?: number;
  failedAlerts?: number;
  longestStaleForMs?: number | null;
  recipients?: number;
  delivered?: number;
  failed?: number;
};

export type WeeklyRecapSummary = {
  windowMs: number;
  throttleMs: number;
  evaluated: number;
  sentCompanies: number;
  emailsAttempted: number;
  emailsDelivered: number;
  results: WeeklyRecapResult[];
};

/**
 * Email each company's Admin users a weekly digest summarizing the outage
 * alerts (`StaleSweepAlertLog`) emitted in the past 7 days. Companies with
 * zero alerts in the window are skipped (no noise), and admins can opt out
 * per-company via `CompanySetting.meta.notifyWeeklyAlertRecapDisabled`.
 *
 * The matching schedule is the existing `notifications-sweep` cron — this
 * function is invoked on every tick and uses
 * `NotificationState.lastWeeklyAlertRecapAt` + `WEEKLY_RECAP_THROTTLE_MS`
 * as a per-company throttle so the email actually only fires once per
 * ~7 days even though the cron runs every 15 minutes.
 *
 * Failures for a single company are caught so one bad tenant cannot stall
 * the recap for the rest. The summary is returned for observability.
 */
export async function sendWeeklyOutageRecap(opts: {
  /** Reference time. Defaults to now. */
  now?: Date;
  /** Public-facing origin used to build the link in the recap email. */
  baseUrl?: string;
  /** Override the lookback window (ms). Mainly for tests. */
  windowMs?: number;
  /** Override the per-company throttle (ms). Mainly for tests. */
  throttleMs?: number;
  /**
   * Restrict evaluation to the given set of companies. When omitted, every
   * active company is evaluated.
   */
  companyIds?: string[];
} = {}): Promise<WeeklyRecapSummary> {
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? WEEKLY_RECAP_WINDOW_MS;
  const throttleMs = opts.throttleMs ?? WEEKLY_RECAP_THROTTLE_MS;
  const since = new Date(now.getTime() - windowMs);

  const idFilter =
    opts.companyIds && opts.companyIds.length > 0
      ? { id: { in: opts.companyIds } }
      : undefined;
  const companies = await prisma.company.findMany({
    where: idFilter,
    select: {
      id: true,
      name: true,
      subscription: { select: { status: true } },
      notificationState: { select: { lastWeeklyAlertRecapAt: true } },
    },
  });
  const active = companies.filter(
    (c) => !c.subscription || ACTIVE_SUBSCRIPTION_STATUSES.has(c.subscription.status)
  );

  const results: WeeklyRecapResult[] = [];
  let sentCompanies = 0;
  let emailsAttempted = 0;
  let emailsDelivered = 0;

  for (const c of active) {
    // Per-company opt-out — admins can suppress the recap entirely from the
    // Admin → Notifications panel without affecting the realtime outage
    // alerts (which remain "things are broken" pages and ignore opt-outs).
    const settings = await getCompanySettings(c.id).catch(() => null);
    const meta =
      settings?.meta && typeof settings.meta === "object"
        ? (settings.meta as Record<string, unknown>)
        : null;
    if (meta && meta.notifyWeeklyAlertRecapDisabled === true) {
      results.push({ companyId: c.id, sent: false, reason: "opted_out" });
      continue;
    }

    // Throttle on `lastWeeklyAlertRecapAt` so the recap only fires once per
    // ~7 days even though the underlying cron ticks every 15 minutes.
    const lastRecapAt = c.notificationState?.lastWeeklyAlertRecapAt ?? null;
    if (lastRecapAt && now.getTime() - lastRecapAt.getTime() < throttleMs) {
      results.push({ companyId: c.id, sent: false, reason: "throttled" });
      continue;
    }

    // Weekday gate — only send on the configured day of the week (in the
    // company's timezone). When `notifyWeeklyAlertRecapWeekday` is not set,
    // Monday is used so the cadence is predictable out of the box.
    {
      const tz =
        typeof settings?.timezone === "string" && settings.timezone
          ? settings.timezone
          : "America/New_York";
      const rawDay =
        meta && typeof meta.notifyWeeklyAlertRecapWeekday === "string"
          ? meta.notifyWeeklyAlertRecapWeekday
          : null;
      const configuredDay: RecapWeekday =
        rawDay && (VALID_RECAP_WEEKDAYS as readonly string[]).includes(rawDay)
          ? (rawDay as RecapWeekday)
          : "Monday";
      const todayName = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: tz,
      }).format(now);
      if (todayName !== configuredDay) {
        results.push({ companyId: c.id, sent: false, reason: "wrong_weekday" });
        continue;
      }
    }

    const logs = await prisma.staleSweepAlertLog.findMany({
      where: { companyId: c.id, sentAt: { gte: since } },
      orderBy: { sentAt: "desc" },
      select: {
        sentAt: true,
        staleForMs: true,
        deliveredCount: true,
        failedCount: true,
        recipientCount: true,
      },
    });
    if (logs.length === 0) {
      // Companies with zero alerts in the window are skipped — no noise.
      results.push({ companyId: c.id, sent: false, reason: "no_alerts" });
      continue;
    }

    const alertCount = logs.length;
    const deliveredAlerts = logs.reduce((acc, r) => acc + (r.deliveredCount ?? 0), 0);
    const failedAlerts = logs.reduce((acc, r) => acc + (r.failedCount ?? 0), 0);
    const longestStaleForMs = logs.reduce<number | null>((acc, r) => {
      const v = typeof r.staleForMs === "number" && Number.isFinite(r.staleForMs) ? r.staleForMs : null;
      if (v == null) return acc;
      return acc == null || v > acc ? v : acc;
    }, null);

    const admins = await prisma.user.findMany({
      where: { companyId: c.id, role: "Admin", active: true },
      select: { email: true },
    });
    if (admins.length === 0) {
      results.push({
        companyId: c.id,
        sent: false,
        reason: "no_admins",
        alertCount,
        deliveredAlerts,
        failedAlerts,
        longestStaleForMs,
      });
      continue;
    }
    const recipients = admins.filter((u) => u.email);
    if (recipients.length === 0) {
      results.push({
        companyId: c.id,
        sent: false,
        reason: "no_admin_emails",
        alertCount,
        deliveredAlerts,
        failedAlerts,
        longestStaleForMs,
      });
      continue;
    }

    if (!isOutboundEmailConfigured()) {
      console.info(
        `[notifications:weekly-recap] company ${c.id} has ${alertCount} alert(s) in the last 7 days but outbound email is not configured`
      );
      results.push({
        companyId: c.id,
        sent: false,
        reason: "provider_not_configured",
        alertCount,
        deliveredAlerts,
        failedAlerts,
        longestStaleForMs,
      });
      continue;
    }

    const replyToRaw = meta?.notifyReplyTo;
    const replyTo =
      typeof replyToRaw === "string" && replyToRaw.trim() ? replyToRaw.trim() : undefined;

    const link = buildAdminNotificationsLink(opts.baseUrl);
    const longestText =
      longestStaleForMs == null ? "n/a" : formatDuration(longestStaleForMs);
    const subject = `[${c.name}] Weekly outage-alert recap (${alertCount} alert${alertCount === 1 ? "" : "s"})`;
    const text = [
      `Outage-alert summary for ${c.name}, last 7 days:`,
      "",
      `  • Alerts fired:     ${alertCount}`,
      `  • Emails delivered: ${deliveredAlerts}`,
      `  • Emails failed:    ${failedAlerts}`,
      `  • Longest staleness: ${longestText}`,
      "",
      link
        ? `Full 30-day log: ${link}`
        : "Open Admin Settings → Notifications in CHG Rehab to see the full 30-day log.",
      "",
      "If you do not want this weekly recap, an admin can disable it from",
      "Admin → Notifications → Outage alerts → Weekly recap email.",
    ].join("\n");
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
        <p><strong>Outage-alert summary for ${escapeHtml(c.name)}, last 7 days:</strong></p>
        <ul>
          <li>Alerts fired: <strong>${alertCount}</strong></li>
          <li>Emails delivered: <strong>${deliveredAlerts}</strong></li>
          <li>Emails failed: <strong>${failedAlerts}</strong></li>
          <li>Longest staleness: <strong>${escapeHtml(longestText)}</strong></li>
        </ul>
        ${
          link
            ? `<p><a href="${escapeHtml(link)}">Open the full 30-day log</a></p>`
            : `<p>Open <em>Admin Settings → Notifications</em> in CHG Rehab to see the full 30-day log.</p>`
        }
        <p style="color:#666;font-size:12px">
          If you do not want this weekly recap, an admin can disable it from
          Admin → Notifications → Outage alerts → Weekly recap email.
        </p>
      </div>
    `;

    let delivered = 0;
    let failed = 0;
    for (const u of recipients) {
      emailsAttempted += 1;
      const res = await sendOutboundEmail({
        to: u.email!,
        subject,
        text,
        html,
        replyTo,
      });
      if (res.delivered) {
        delivered += 1;
        emailsDelivered += 1;
      } else {
        failed += 1;
        console.warn(
          `[notifications:weekly-recap] failed to email ${u.email} for company ${c.id}: ${
            res.reason ?? "unknown"
          }`
        );
      }
    }

    if (delivered > 0) {
      // Only stamp the throttle window once at least one admin actually got
      // the email. If every send failed we leave `lastWeeklyAlertRecapAt`
      // alone so the next cron tick retries.
      await prisma.notificationState
        .upsert({
          where: { companyId: c.id },
          create: { companyId: c.id, lastWeeklyAlertRecapAt: now },
          update: { lastWeeklyAlertRecapAt: now },
        })
        .catch(() => undefined);
      sentCompanies += 1;
      results.push({
        companyId: c.id,
        sent: true,
        alertCount,
        deliveredAlerts,
        failedAlerts,
        longestStaleForMs,
        recipients: recipients.length,
        delivered,
        failed,
      });
    } else {
      results.push({
        companyId: c.id,
        sent: false,
        reason: "send_failed",
        alertCount,
        deliveredAlerts,
        failedAlerts,
        longestStaleForMs,
        recipients: recipients.length,
        delivered,
        failed,
      });
    }
  }

  return {
    windowMs,
    throttleMs,
    evaluated: active.length,
    sentCompanies,
    emailsAttempted,
    emailsDelivered,
    results,
  };
}

export type WeeklyRecapPreviewResult = {
  sent: boolean;
  reason?: "company_not_found" | "no_alerts" | "provider_not_configured" | "send_failed";
  alertCount?: number;
  deliveredAlerts?: number;
  failedAlerts?: number;
  longestStaleForMs?: number | null;
};

/**
 * Sends a one-off **preview** of the weekly outage-recap email to a single
 * recipient.
 *
 * Unlike `sendWeeklyOutageRecap` this function:
 *   - Skips the opt-out and throttle checks entirely.
 *   - Delivers ONLY to `recipientEmail` (the requesting admin), not all admins.
 *   - Prefixes the subject with "[PREVIEW]" and adds a banner in the body.
 *   - Does NOT update `lastWeeklyAlertRecapAt`.
 */
export async function sendWeeklyOutageRecapPreview(opts: {
  companyId: string;
  recipientEmail: string;
  baseUrl?: string;
}): Promise<WeeklyRecapPreviewResult> {
  const now = new Date();
  const since = new Date(now.getTime() - WEEKLY_RECAP_WINDOW_MS);

  const company = await prisma.company.findUnique({
    where: { id: opts.companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return { sent: false, reason: "company_not_found" };
  }

  const settings = await getCompanySettings(company.id).catch(() => null);
  const settingsMeta =
    settings?.meta && typeof settings.meta === "object"
      ? (settings.meta as Record<string, unknown>)
      : null;
  const replyToRaw = settingsMeta?.notifyReplyTo;
  const replyTo =
    typeof replyToRaw === "string" && replyToRaw.trim() ? replyToRaw.trim() : undefined;

  const logs = await prisma.staleSweepAlertLog.findMany({
    where: { companyId: company.id, sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
    select: {
      sentAt: true,
      staleForMs: true,
      deliveredCount: true,
      failedCount: true,
      recipientCount: true,
    },
  });

  const alertCount = logs.length;
  const deliveredAlerts = logs.reduce((acc, r) => acc + (r.deliveredCount ?? 0), 0);
  const failedAlerts = logs.reduce((acc, r) => acc + (r.failedCount ?? 0), 0);
  const longestStaleForMs = logs.reduce<number | null>((acc, r) => {
    const v = typeof r.staleForMs === "number" && Number.isFinite(r.staleForMs) ? r.staleForMs : null;
    if (v == null) return acc;
    return acc == null || v > acc ? v : acc;
  }, null);

  if (!isOutboundEmailConfigured()) {
    return {
      sent: false,
      reason: "provider_not_configured",
      alertCount,
      deliveredAlerts,
      failedAlerts,
      longestStaleForMs,
    };
  }

  const link = buildAdminNotificationsLink(opts.baseUrl);
  const longestText = longestStaleForMs == null ? "n/a" : formatDuration(longestStaleForMs);

  const previewNote =
    alertCount === 0
      ? "Note: no outage alerts fired in the past 7 days. In a real recap this email would not be sent."
      : "This is a preview of the weekly recap email. It was sent only to you.";

  const subject = `[PREVIEW] [${company.name}] Weekly outage-alert recap (${alertCount} alert${alertCount === 1 ? "" : "s"})`;

  const text = [
    `*** PREVIEW — ${previewNote} ***`,
    "",
    `Outage-alert summary for ${company.name}, last 7 days:`,
    "",
    `  • Alerts fired:     ${alertCount}`,
    `  • Emails delivered: ${deliveredAlerts}`,
    `  • Emails failed:    ${failedAlerts}`,
    `  • Longest staleness: ${longestText}`,
    "",
    link
      ? `Full 30-day log: ${link}`
      : "Open Admin Settings → Notifications in CHG Rehab to see the full 30-day log.",
    "",
    "If you do not want this weekly recap, an admin can disable it from",
    "Admin → Notifications → Outage alerts → Weekly recap email.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
      <div style="background:#FFF8E6;border:0.5px solid #F5C842;border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#7A5800">
        <strong>Preview only</strong> — ${escapeHtml(previewNote)}
      </div>
      <p><strong>Outage-alert summary for ${escapeHtml(company.name)}, last 7 days:</strong></p>
      <ul>
        <li>Alerts fired: <strong>${alertCount}</strong></li>
        <li>Emails delivered: <strong>${deliveredAlerts}</strong></li>
        <li>Emails failed: <strong>${failedAlerts}</strong></li>
        <li>Longest staleness: <strong>${escapeHtml(longestText)}</strong></li>
      </ul>
      ${
        link
          ? `<p><a href="${escapeHtml(link)}">Open the full 30-day log</a></p>`
          : `<p>Open <em>Admin Settings → Notifications</em> in CHG Rehab to see the full 30-day log.</p>`
      }
      <p style="color:#666;font-size:12px">
        If you do not want this weekly recap, an admin can disable it from
        Admin → Notifications → Outage alerts → Weekly recap email.
      </p>
    </div>
  `;

  const res = await sendOutboundEmail({
    to: opts.recipientEmail,
    subject,
    text,
    html,
    replyTo,
  });

  if (res.delivered) {
    return { sent: true, alertCount, deliveredAlerts, failedAlerts, longestStaleForMs };
  }
  return {
    sent: false,
    reason: "send_failed",
    alertCount,
    deliveredAlerts,
    failedAlerts,
    longestStaleForMs,
  };
}

function buildAdminNotificationsLink(baseUrl?: string): string | null {
  const path = "/admin?panel=notifications";
  if (baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, "");
    return `${trimmed}${path}`;
  }
  // Fallback: pick the first Replit-issued domain when running in a Replit
  // deployment. Only used when the caller didn't supply an explicit origin
  // (e.g. the standalone `scripts/notification-sweep.ts` runner).
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}${path}`;
  }
  return null;
}

export type BillingReminderCompanyResult = {
  companyId: string;
  status: string;
  reminded: boolean;
  skippedReason?: string;
  recipients?: number;
  emailsSent?: number;
  emailsFailed?: number;
  error?: string;
};

export type BillingReminderSweepSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  evaluated: number;
  reminded: number;
  results: BillingReminderCompanyResult[];
};

/**
 * Daily follow-up sweep: for every company whose subscription has been in an
 * unhealthy state for at least 24 hours, fire a `notifyAdminsOfBillingReminder`
 * so the issue doesn't go unnoticed after the initial webhook-triggered alert.
 *
 * Eligibility criteria (all must be true):
 *  1. `Subscription.status` is in `UNHEALTHY_STATUSES`.
 *  2. The MOST RECENT billing-issue email (`event="billingIssue"`, `channel="email"`,
 *     `status="Sent"`, dedupeKey starting with `"billing-email:"`) was sent more
 *     than 24 hours ago. Using the most recent alert ensures a fresh webhook
 *     delivery (e.g. a new failed invoice) resets the 24h window and prevents
 *     a stale older record from incorrectly triggering a reminder while a
 *     recent alert exists.
 *
 * Throttle gate: before calling `notifyAdminsOfBillingReminder`, we also check
 * whether a reminder was already sent within the last 24h (most recent
 * `billing-reminder-email:*` notification for the company). This prevents
 * status flapping (e.g. past_due → unpaid) from generating multiple reminders
 * within a single 24h window. The epoch-window dedupe key inside
 * `notifyAdminsOfBillingReminder` provides a second layer of idempotency.
 *
 * Stops automatically: once the subscription returns to a healthy status the
 * query filter (step 1) excludes the company and no further reminders are sent.
 */
export async function sweepBillingRemindersForAllCompanies(opts: {
  /** Override clock for tests. */
  now?: Date;
} = {}): Promise<BillingReminderSweepSummary> {
  const now = opts.now ?? new Date();
  const startedAt = now;
  const cutoff = new Date(now.getTime() - BILLING_REMINDER_WINDOW_MS);

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      subscription: { select: { status: true } },
    },
    where: {
      subscription: {
        status: {
          in: ["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"],
        },
      },
    },
  });

  const results: BillingReminderCompanyResult[] = [];
  let reminded = 0;

  for (const c of companies) {
    const status = c.subscription!.status;
    if (!isUnhealthyStatus(status)) {
      results.push({ companyId: c.id, status, reminded: false, skippedReason: "status_not_unhealthy" });
      continue;
    }

    try {
      // Eligibility: the MOST RECENT initial billing-issue email must be older
      // than 24h, confirming the issue has persisted since the first alert.
      const mostRecentInitialAlert = await prisma.notification.findFirst({
        where: {
          companyId: c.id,
          event: "billingIssue",
          channel: "email",
          status: "Sent",
          dedupeKey: { startsWith: "billing-email:" },
        },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });

      if (!mostRecentInitialAlert || !mostRecentInitialAlert.sentAt) {
        results.push({ companyId: c.id, status, reminded: false, skippedReason: "no_initial_alert" });
        continue;
      }
      if (mostRecentInitialAlert.sentAt > cutoff) {
        results.push({ companyId: c.id, status, reminded: false, skippedReason: "initial_alert_too_recent" });
        continue;
      }

      // Throttle gate: skip if a reminder was already sent within the last 24h.
      // This is status-agnostic so flapping between unhealthy statuses within a
      // 24h window can only produce one reminder.
      const mostRecentReminder = await prisma.notification.findFirst({
        where: {
          companyId: c.id,
          event: "billingIssue",
          channel: "email",
          status: "Sent",
          dedupeKey: { startsWith: "billing-reminder-email:" },
        },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });

      if (mostRecentReminder?.sentAt && mostRecentReminder.sentAt > cutoff) {
        results.push({ companyId: c.id, status, reminded: false, skippedReason: "reminder_sent_within_24h" });
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[billing-reminder] company ${c.id} eligibility check failed: ${message}`);
      results.push({ companyId: c.id, status, reminded: false, error: message });
      continue;
    }

    try {
      const out = await notifyAdminsOfBillingReminder({ companyId: c.id, status, now });
      if (out.skippedReason) {
        results.push({ companyId: c.id, status, reminded: false, skippedReason: out.skippedReason });
      } else {
        reminded += 1;
        results.push({
          companyId: c.id,
          status,
          reminded: true,
          recipients: out.recipients,
          emailsSent: out.emailsSent,
          emailsFailed: out.emailsFailed,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[billing-reminder] company ${c.id} reminder failed: ${message}`);
      results.push({ companyId: c.id, status, reminded: false, error: message });
    }
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    evaluated: companies.length,
    reminded,
    results,
  };
}
