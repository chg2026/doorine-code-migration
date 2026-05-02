import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";
import { publicAppOrigin } from "../contactUnsubscribe";

/**
 * Critical-billing notifications: when Stripe transitions a subscription into
 * a non-healthy state (past_due, unpaid, incomplete, incomplete_expired,
 * canceled), every Admin in the company gets an urgent in-app notification
 * AND a transactional email pointing them at /admin?panel=billing.
 *
 * Unlike the toggleable events handled by `dispatchNotification`, billing
 * alerts always create the in-app row for every admin. Email delivery
 * respects `User.emailOptOut` — opted-out admins still see the bell icon
 * alert but will not receive the email. A missing transport
 * (RESEND_API_KEY / EMAIL_FROM) is best-effort and just logs a warning.
 *
 * Dedupe: each admin gets one row per (status, billing-period) — repeated
 * webhook deliveries for the same status don't re-email. Recovery emails use
 * a separate dedupe namespace so they fire once per recovery.
 */

export const UNHEALTHY_STATUSES = new Set([
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "canceled",
]);

export const HEALTHY_STATUSES = new Set(["active", "trialing"]);

export function isUnhealthyStatus(status: string | null | undefined): boolean {
  return Boolean(status) && UNHEALTHY_STATUSES.has(status as string);
}

export function isHealthyStatus(status: string | null | undefined): boolean {
  return Boolean(status) && HEALTHY_STATUSES.has(status as string);
}

type StatusCopy = {
  label: string;
  detail: string;
  emailLead: string;
};

function describeIssue(status: string, declineMessage?: string | null): StatusCopy {
  switch (status) {
    case "past_due":
      return {
        label: "Payment past due",
        detail:
          declineMessage?.trim() ||
          "Your last payment didn't go through. Update your card to keep your team's seats active.",
        emailLead: "Your last payment failed",
      };
    case "unpaid":
      return {
        label: "Subscription unpaid",
        detail:
          "Stripe couldn't collect payment after multiple attempts. Update billing to restore access.",
        emailLead: "Stripe couldn't collect payment after multiple attempts",
      };
    case "incomplete":
    case "incomplete_expired":
      return {
        label: "Subscription incomplete",
        detail:
          "Your subscription needs a working payment method to activate. Finish setup in billing.",
        emailLead: "Your subscription is incomplete and needs a working payment method",
      };
    case "canceled":
      return {
        label: "Subscription canceled",
        detail:
          "Your subscription is canceled. Reactivate a plan to keep inviting and managing users.",
        emailLead: "Your subscription was canceled",
      };
    default:
      return {
        label: `Billing issue (${status})`,
        detail: "Open the billing panel to resolve this issue.",
        emailLead: "There's a problem with your billing",
      };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function billingPanelUrl(): string {
  const origin = publicAppOrigin();
  if (!origin) return "/admin?panel=billing";
  return `${origin}/admin?panel=billing`;
}

function asJson(meta: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!meta) return Prisma.JsonNull;
  return meta as Prisma.InputJsonValue;
}

type AdminRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  emailOptOut: boolean;
};

async function loadCompanyAdmins(companyId: string): Promise<{
  admins: AdminRow[];
  companyName: string;
}> {
  const [admins, company] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, role: "Admin" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailOptOut: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    }),
  ]);
  return { admins, companyName: company?.name ?? "CHG Rehab" };
}

function recipientName(admin: AdminRow): string {
  return (
    [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
    admin.email ||
    "Admin"
  );
}

function buildIssueEmail(opts: {
  companyName: string;
  recipientName: string;
  copy: StatusCopy;
  link: string;
  declineMessage?: string | null;
}): { subject: string; text: string; html: string } {
  const subject = `[${opts.companyName}] ${opts.copy.emailLead} — action required`;
  const reasonLine = opts.declineMessage?.trim()
    ? `\nReason from your bank: ${opts.declineMessage.trim()}`
    : "";
  const text = [
    `Hi ${opts.recipientName},`,
    "",
    `${opts.copy.emailLead}.`,
    opts.copy.detail,
    reasonLine,
    "",
    `Open the billing panel to fix this:`,
    opts.link,
    "",
    `— ${opts.companyName}`,
    "",
    `You're receiving this because you're an admin on ${opts.companyName}. ` +
      `Billing alerts can't be turned off — they're sent so the team doesn't lose access.`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px">
      <p>Hi ${escapeHtml(opts.recipientName)},</p>
      <p style="font-size:16px"><strong>${escapeHtml(opts.copy.emailLead)}.</strong></p>
      <p>${escapeHtml(opts.copy.detail)}</p>
      ${
        opts.declineMessage?.trim()
          ? `<p style="background:#fff4f4;border:1px solid #f1c2c2;color:#7a1f1f;padding:8px 12px;border-radius:4px;font-size:13px">
              <strong>Reason from your bank:</strong> ${escapeHtml(opts.declineMessage.trim())}
            </p>`
          : ""
      }
      <p style="margin:20px 0">
        <a href="${escapeHtml(opts.link)}"
           style="background:#a51b1b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Open billing panel
        </a>
      </p>
      <p style="word-break:break-all;color:#555;font-size:12px">${escapeHtml(opts.link)}</p>
      <p style="color:#666;font-size:12px;margin-top:24px">
        — ${escapeHtml(opts.companyName)}<br/>
        You're receiving this because you're an admin on ${escapeHtml(opts.companyName)}.
        Billing alerts can't be turned off — they're sent so your team doesn't lose access.
      </p>
    </div>
  `;
  return { subject, text, html };
}

function buildRecoveryEmail(opts: {
  companyName: string;
  recipientName: string;
  status: string;
  link: string;
}): { subject: string; text: string; html: string } {
  const subject = `[${opts.companyName}] Billing is back in good standing`;
  const text = [
    `Hi ${opts.recipientName},`,
    "",
    `Good news — your subscription is now ${opts.status}. The previous billing problem is resolved and your team has full access again.`,
    "",
    `View your billing settings:`,
    opts.link,
    "",
    `— ${opts.companyName}`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px">
      <p>Hi ${escapeHtml(opts.recipientName)},</p>
      <p><strong>Good news — your subscription is now ${escapeHtml(opts.status)}.</strong></p>
      <p>The previous billing problem is resolved and your team has full access again.</p>
      <p style="margin:16px 0">
        <a href="${escapeHtml(opts.link)}"
           style="background:#0F62FE;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block">
          View billing
        </a>
      </p>
      <p style="color:#666;font-size:12px">— ${escapeHtml(opts.companyName)}</p>
    </div>
  `;
  return { subject, text, html };
}

export type BillingAlertResult = {
  recipients: number;
  inAppCreated: number;
  emailsSent: number;
  emailsFailed: number;
  skippedReason?: string;
};

/**
 * Fan out a "billing problem" alert to every admin: create a `Notification`
 * row for the bell + send a Resend email pointing at the billing panel.
 *
 * `dedupeBucket` is appended to the dedupeKey so re-deliveries of the same
 * webhook for the same status don't double-notify. Pass the subscription's
 * `currentPeriodEnd` ISO string (or invoice id) so a recurrence in the next
 * billing cycle creates a fresh row.
 */
export async function notifyAdminsOfBillingIssue(opts: {
  companyId: string;
  status: string;
  declineCode?: string | null;
  declineMessage?: string | null;
  /** Stable per-incident value: invoice id, period end, etc. */
  dedupeBucket?: string | null;
  /** Override clock for tests. */
  now?: Date;
}): Promise<BillingAlertResult> {
  const now = opts.now ?? new Date();
  const result: BillingAlertResult = {
    recipients: 0,
    inAppCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  if (!isUnhealthyStatus(opts.status)) {
    result.skippedReason = "status_not_unhealthy";
    return result;
  }

  let admins: AdminRow[];
  let companyName: string;
  try {
    const loaded = await loadCompanyAdmins(opts.companyId);
    admins = loaded.admins;
    companyName = loaded.companyName;
  } catch (err) {
    console.warn("[billing-alert] failed to load admins", err);
    result.skippedReason = "load_failed";
    return result;
  }

  if (admins.length === 0) {
    result.skippedReason = "no_admins";
    return result;
  }
  result.recipients = admins.length;

  const copy = describeIssue(opts.status, opts.declineMessage);
  const link = billingPanelUrl();
  const bucket = opts.dedupeBucket ?? "current";
  const inAppDedupe = `billing:${opts.status}:${bucket}`;
  const emailDedupe = `billing-email:${opts.status}:${bucket}`;

  for (const admin of admins) {
    try {
      await prisma.notification.upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "inApp",
            dedupeKey: inAppDedupe,
          },
        },
        update: {
          title: copy.label,
          body: copy.detail,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_issue",
            status: opts.status,
            declineCode: opts.declineCode ?? null,
            declineMessage: opts.declineMessage ?? null,
          }),
          status: "Sent",
          urgent: true,
          sentAt: now,
          readAt: null,
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "inApp",
          title: copy.label,
          body: copy.detail,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_issue",
            status: opts.status,
            declineCode: opts.declineCode ?? null,
            declineMessage: opts.declineMessage ?? null,
          }),
          urgent: true,
          status: "Sent",
          sentAt: now,
          dedupeKey: inAppDedupe,
        },
      });
      result.inAppCreated += 1;
    } catch (err) {
      console.warn("[billing-alert] inApp upsert failed", err);
    }

    if (!admin.email) continue;
    if (admin.emailOptOut) continue;

    // Skip the email send if we've already delivered this exact alert to this
    // admin (idempotent webhook re-delivery). The unique index lets us probe
    // cheaply.
    const existingEmail = await prisma.notification
      .findUnique({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        select: { status: true },
      })
      .catch(() => null);
    if (existingEmail?.status === "Sent") continue;

    if (!isOutboundEmailConfigured()) {
      console.info(
        `[billing-alert] outbound transport not configured — would have emailed ${admin.email} (${opts.status})`
      );
      continue;
    }

    const { subject, text, html } = buildIssueEmail({
      companyName,
      recipientName: recipientName(admin),
      copy,
      link,
      declineMessage: opts.declineMessage,
    });

    let delivered = false;
    let reason: string | undefined;
    try {
      const res = await sendOutboundEmail({ to: admin.email, subject, text, html });
      delivered = res.delivered;
      reason = res.reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }

    if (delivered) result.emailsSent += 1;
    else result.emailsFailed += 1;

    await prisma.notification
      .upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        update: {
          title: copy.label,
          body: copy.detail,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_issue",
            status: opts.status,
            declineCode: opts.declineCode ?? null,
            declineMessage: opts.declineMessage ?? null,
          }),
          status: delivered ? "Sent" : "Failed",
          urgent: true,
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "email",
          title: copy.label,
          body: copy.detail,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_issue",
            status: opts.status,
            declineCode: opts.declineCode ?? null,
            declineMessage: opts.declineMessage ?? null,
          }),
          urgent: true,
          status: delivered ? "Sent" : "Failed",
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
          dedupeKey: emailDedupe,
        },
      })
      .catch(() => undefined);
  }

  return result;
}

function buildReminderEmail(opts: {
  companyName: string;
  recipientName: string;
  copy: StatusCopy;
  link: string;
}): { subject: string; text: string; html: string } {
  const subject = `[${opts.companyName}] Your billing problem is still unresolved — action required`;
  const text = [
    `Hi ${opts.recipientName},`,
    "",
    `This is a follow-up: your billing problem is still unresolved.`,
    opts.copy.detail,
    "",
    `Open the billing panel to fix this:`,
    opts.link,
    "",
    `— ${opts.companyName}`,
    "",
    `You're receiving this daily reminder because you're an admin on ${opts.companyName} and billing hasn't been fixed yet. ` +
      `These reminders stop automatically once your subscription is restored.`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px">
      <p>Hi ${escapeHtml(opts.recipientName)},</p>
      <p style="font-size:16px"><strong>Your billing problem is still unresolved.</strong></p>
      <p>${escapeHtml(opts.copy.detail)}</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(opts.link)}"
           style="background:#a51b1b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Open billing panel
        </a>
      </p>
      <p style="word-break:break-all;color:#555;font-size:12px">${escapeHtml(opts.link)}</p>
      <p style="color:#666;font-size:12px;margin-top:24px">
        — ${escapeHtml(opts.companyName)}<br/>
        You're receiving this daily reminder because you're an admin on ${escapeHtml(opts.companyName)}
        and billing hasn't been fixed yet. These reminders stop automatically once your subscription is restored.
      </p>
    </div>
  `;
  return { subject, text, html };
}

/** 24 hours in milliseconds — used to compute the rolling 24h window ID. */
export const BILLING_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Fan out a daily "billing still unresolved" reminder to every admin of a
 * company that has been in an unhealthy billing state for 24h+.
 *
 * Dedupe uses a **rolling 24h epoch window** — `Math.floor(sentAt / 24h)` —
 * rather than a calendar date, so reminders cannot be sent just before and
 * just after midnight. The key is also **status-agnostic** so a status flip
 * (e.g. past_due → unpaid) within the same window does not generate a second
 * reminder for the same company.
 *
 * Uses the `billing-reminder*` namespace so it never collides with the
 * initial `billing*` alert or the recovery `billing-recovery*` alert.
 *
 * The caller is responsible for verifying the status is still unhealthy and
 * that 24h have elapsed since the most recent billing alert/reminder.
 */
export async function notifyAdminsOfBillingReminder(opts: {
  companyId: string;
  status: string;
  /** Override clock for tests. */
  now?: Date;
}): Promise<BillingAlertResult> {
  const now = opts.now ?? new Date();
  const result: BillingAlertResult = {
    recipients: 0,
    inAppCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  if (!isUnhealthyStatus(opts.status)) {
    result.skippedReason = "status_not_unhealthy";
    return result;
  }

  let admins: AdminRow[];
  let companyName: string;
  try {
    const loaded = await loadCompanyAdmins(opts.companyId);
    admins = loaded.admins;
    companyName = loaded.companyName;
  } catch (err) {
    console.warn("[billing-reminder] failed to load admins", err);
    result.skippedReason = "load_failed";
    return result;
  }

  if (admins.length === 0) {
    result.skippedReason = "no_admins";
    return result;
  }
  result.recipients = admins.length;

  const copy = describeIssue(opts.status);
  const link = billingPanelUrl();
  // Rolling 24h window ID: advances every 24h from Unix epoch, independent of
  // calendar midnight so a single 24h period is never split across two keys.
  const windowId = Math.floor(now.getTime() / BILLING_REMINDER_WINDOW_MS);
  const inAppDedupe = `billing-reminder:${windowId}`;
  const emailDedupe = `billing-reminder-email:${windowId}`;
  const title = "Billing problem still unresolved";
  const body = `Your billing problem is still unresolved. ${copy.detail}`;

  for (const admin of admins) {
    try {
      await prisma.notification.upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "inApp",
            dedupeKey: inAppDedupe,
          },
        },
        update: {
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_reminder",
            status: opts.status,
            windowId,
          }),
          status: "Sent",
          urgent: true,
          sentAt: now,
          readAt: null,
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "inApp",
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_reminder",
            status: opts.status,
            windowId,
          }),
          urgent: true,
          status: "Sent",
          sentAt: now,
          dedupeKey: inAppDedupe,
        },
      });
      result.inAppCreated += 1;
    } catch (err) {
      console.warn("[billing-reminder] inApp upsert failed", err);
    }

    if (!admin.email) continue;

    const existingEmail = await prisma.notification
      .findUnique({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        select: { status: true },
      })
      .catch(() => null);
    if (existingEmail?.status === "Sent") continue;

    if (!isOutboundEmailConfigured()) {
      console.info(
        `[billing-reminder] outbound transport not configured — would have emailed ${admin.email} (${opts.status})`
      );
      continue;
    }

    const { subject, text, html } = buildReminderEmail({
      companyName,
      recipientName: recipientName(admin),
      copy,
      link,
    });

    let delivered = false;
    let reason: string | undefined;
    try {
      const res = await sendOutboundEmail({ to: admin.email, subject, text, html });
      delivered = res.delivered;
      reason = res.reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }

    if (delivered) result.emailsSent += 1;
    else result.emailsFailed += 1;

    await prisma.notification
      .upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        update: {
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_reminder",
            status: opts.status,
            windowId,
          }),
          status: delivered ? "Sent" : "Failed",
          urgent: true,
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "email",
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({
            kind: "billing_reminder",
            status: opts.status,
            windowId,
          }),
          urgent: true,
          status: delivered ? "Sent" : "Failed",
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
          dedupeKey: emailDedupe,
        },
      })
      .catch(() => undefined);
  }

  return result;
}

/**
 * Send a one-time "billing recovered" notice when the subscription transitions
 * from an unhealthy status back to active/trialing. Same fan-out as
 * `notifyAdminsOfBillingIssue` but lighter copy and a separate dedupe slot so
 * the prior issue alert isn't overwritten.
 */
export async function notifyAdminsOfBillingRecovery(opts: {
  companyId: string;
  status: string;
  /** Stable per-recovery identifier: subscription period end, invoice id, etc. */
  dedupeBucket?: string | null;
  now?: Date;
}): Promise<BillingAlertResult> {
  const now = opts.now ?? new Date();
  const result: BillingAlertResult = {
    recipients: 0,
    inAppCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  if (!isHealthyStatus(opts.status)) {
    result.skippedReason = "status_not_healthy";
    return result;
  }

  let admins: AdminRow[];
  let companyName: string;
  try {
    const loaded = await loadCompanyAdmins(opts.companyId);
    admins = loaded.admins;
    companyName = loaded.companyName;
  } catch (err) {
    console.warn("[billing-alert] failed to load admins", err);
    result.skippedReason = "load_failed";
    return result;
  }

  if (admins.length === 0) {
    result.skippedReason = "no_admins";
    return result;
  }
  result.recipients = admins.length;

  const link = billingPanelUrl();
  const bucket = opts.dedupeBucket ?? "current";
  const inAppDedupe = `billing-recovery:${opts.status}:${bucket}`;
  const emailDedupe = `billing-recovery-email:${opts.status}:${bucket}`;
  const title = "Billing is back in good standing";
  const body = `Your subscription is now ${opts.status}. The previous billing problem is resolved.`;

  for (const admin of admins) {
    try {
      await prisma.notification.upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "inApp",
            dedupeKey: inAppDedupe,
          },
        },
        update: {
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({ kind: "billing_recovery", status: opts.status }),
          status: "Sent",
          urgent: false,
          sentAt: now,
          readAt: null,
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "inApp",
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({ kind: "billing_recovery", status: opts.status }),
          urgent: false,
          status: "Sent",
          sentAt: now,
          dedupeKey: inAppDedupe,
        },
      });
      result.inAppCreated += 1;
    } catch (err) {
      console.warn("[billing-alert] inApp recovery upsert failed", err);
    }

    if (!admin.email) continue;
    if (admin.emailOptOut) continue;

    const existingEmail = await prisma.notification
      .findUnique({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        select: { status: true },
      })
      .catch(() => null);
    if (existingEmail?.status === "Sent") continue;

    if (!isOutboundEmailConfigured()) {
      console.info(
        `[billing-alert] outbound transport not configured — would have emailed recovery to ${admin.email}`
      );
      continue;
    }

    const { subject, text, html } = buildRecoveryEmail({
      companyName,
      recipientName: recipientName(admin),
      status: opts.status,
      link,
    });

    let delivered = false;
    let reason: string | undefined;
    try {
      const res = await sendOutboundEmail({ to: admin.email, subject, text, html });
      delivered = res.delivered;
      reason = res.reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }

    if (delivered) result.emailsSent += 1;
    else result.emailsFailed += 1;

    await prisma.notification
      .upsert({
        where: {
          userId_channel_dedupeKey: {
            userId: admin.id,
            channel: "email",
            dedupeKey: emailDedupe,
          },
        },
        update: {
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({ kind: "billing_recovery", status: opts.status }),
          status: delivered ? "Sent" : "Failed",
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
        },
        create: {
          companyId: opts.companyId,
          userId: admin.id,
          event: "billingIssue",
          channel: "email",
          title,
          body,
          link: "/admin?panel=billing",
          meta: asJson({ kind: "billing_recovery", status: opts.status }),
          urgent: false,
          status: delivered ? "Sent" : "Failed",
          sentAt: delivered ? now : null,
          failedAt: delivered ? null : now,
          failureReason: delivered ? null : reason ?? "unknown",
          dedupeKey: emailDedupe,
        },
      })
      .catch(() => undefined);
  }

  return result;
}
