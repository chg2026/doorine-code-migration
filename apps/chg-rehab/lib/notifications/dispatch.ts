import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getCompanySettings } from "../companySettings";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";
import { buildUnsubscribeUrl } from "../contactUnsubscribe";

function asJson(meta: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!meta) return Prisma.JsonNull;
  return meta as Prisma.InputJsonValue;
}

/**
 * Notification delivery for the events admins toggle on/off in Admin Settings →
 * Notifications. Each event is mapped to two channels (`email` + `inApp`) and
 * only fires through channels enabled in
 * `CompanySetting.meta.notifyEvents.<event>.{email,inApp}`. Email also honors
 * `meta.notifyDigestFrequency` and `meta.notifyQuietStart` / `notifyQuietEnd`.
 *
 * In-app rows are persisted on the `Notification` table and surfaced through
 * the bell UI in the top nav. Email rows for non-realtime digest frequencies
 * (or those filed during quiet hours) are queued with `status="Pending"` and
 * flushed when `runNotificationSweep` is invoked.
 */

// Event identifiers / channel types are defined in `./events` so that client
// components and lightweight API routes can import them without pulling the
// rest of dispatch's Node-only dependency tree.
import {
  NOTIFY_EVENT_KEYS,
  type NotifyEvent,
  type EventChannels,
  type EventsMeta,
} from "./events";
export { NOTIFY_EVENT_KEYS };
export type { NotifyEvent, EventChannels, EventsMeta };

const DEFAULT_CHANNELS: EventChannels = { email: true, inApp: true };

function readEventChannels(meta: unknown, event: NotifyEvent): EventChannels {
  const root = (meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const events = root.notifyEvents as Record<string, unknown> | undefined;
  const node =
    events && typeof events === "object"
      ? (events[event] as Record<string, unknown> | undefined)
      : undefined;
  // Legacy fallback: standalone `notify<Event>` boolean controlled both channels.
  const legacyKey = "notify" + event[0].toUpperCase() + event.slice(1);
  const legacy = root[legacyKey];
  const def = typeof legacy === "boolean" ? legacy : DEFAULT_CHANNELS.email;
  return {
    email: typeof node?.email === "boolean" ? (node.email as boolean) : def,
    inApp: typeof node?.inApp === "boolean" ? (node.inApp as boolean) : def,
  };
}

type DigestFrequency = "Realtime" | "Hourly" | "Daily" | "Weekly";

function readDigestFrequency(meta: unknown): DigestFrequency {
  const v = ((meta as Record<string, unknown>) || {}).notifyDigestFrequency;
  if (v === "Realtime" || v === "Hourly" || v === "Daily" || v === "Weekly") return v;
  return "Daily";
}

function readQuietHours(meta: unknown): { start: string; end: string } {
  const m = (meta as Record<string, unknown>) || {};
  const start = typeof m.notifyQuietStart === "string" ? m.notifyQuietStart : "20:00";
  const end = typeof m.notifyQuietEnd === "string" ? m.notifyQuietEnd : "07:00";
  return { start, end };
}

/** Parse "HH:MM" → minutes since midnight; returns null on bad input. */
function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** Returns the current minute-of-day in the company's configured timezone. */
function nowMinutesInTz(timezone: string, now: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/**
 * Quiet hours are inclusive of the start minute and exclusive of the end
 * minute. Windows that wrap past midnight (start > end) are handled.
 */
export function isInQuietHours(
  start: string,
  end: string,
  timezone: string,
  now: Date = new Date()
): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null || s === e) return false;
  const cur = nowMinutesInTz(timezone, now);
  if (s < e) return cur >= s && cur < e;
  // wraps midnight (e.g., 20:00 → 07:00)
  return cur >= s || cur < e;
}

/**
 * Next time the digest sweep should send a queued email row. For Realtime this
 * is "as soon as quiet hours end"; for Hourly/Daily/Weekly the next bucket is
 * scheduled relative to `now`.
 */
function nextScheduledFor(freq: DigestFrequency, now: Date = new Date()): Date {
  const d = new Date(now);
  if (freq === "Realtime") {
    // pick up at the next minute — sweep will recompute against quiet hours
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    return d;
  }
  if (freq === "Hourly") {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }
  if (freq === "Weekly") {
    d.setUTCHours(13, 0, 0, 0); // 13:00 UTC ≈ 9am ET Monday digest
    const day = d.getUTCDay();
    const daysUntilMon = (8 - day) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMon);
    return d;
  }
  // Daily
  d.setUTCHours(13, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export type DispatchInput = {
  companyId: string;
  event: NotifyEvent;
  /** If supplied, project assignees are added to the recipient set. */
  projectId?: string | null;
  /** Override recipient list (skip auto-resolve). */
  userIds?: string[];
  /** Contact ids — emailed directly via the outbound transport. No inApp / queue. */
  contactIds?: string[];
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
  /**
   * Urgent emails bypass quiet hours and digest queueing — used for hard
   * payment / compliance failures that need eyes immediately.
   */
  urgent?: boolean;
  /**
   * If supplied, dedupes per (user, channel, dedupeKey) — re-running the same
   * event won't create duplicate rows for the same recipient.
   */
  dedupeKey?: string;
};

export type DispatchResult = {
  recipients: number;
  inAppCreated: number;
  emailsQueued: number;
  emailsSent: number;
  contactsAttempted: number;
  contactsDelivered: number;
  skipped: { event: boolean; recipients: boolean };
};

/**
 * Resolve the recipient set for an event: every Admin in the company, plus any
 * users assigned to the relevant project. PMs always get warehouse/draw/exception
 * notifications for projects they're on.
 */
async function resolveRecipients(
  companyId: string,
  projectId?: string | null,
  override?: string[]
): Promise<string[]> {
  if (override && override.length) return Array.from(new Set(override));
  const set = new Set<string>();
  const admins = await prisma.user.findMany({
    where: { companyId, role: "Admin", active: true },
    select: { id: true },
  });
  for (const a of admins) set.add(a.id);
  if (projectId) {
    const assigns = await prisma.projectAssignment.findMany({
      where: { projectId, project: { companyId } },
      select: { userId: true },
    });
    for (const a of assigns) set.add(a.userId);
  }
  return Array.from(set);
}

/**
 * Per-user overrides on top of the company-wide event channel defaults. If a
 * user has a row in `UserNotificationPreference` for this event, those flags
 * win; otherwise the company defaults apply unchanged.
 */
async function loadUserChannelOverrides(
  userIds: string[],
  event: NotifyEvent
): Promise<Map<string, EventChannels>> {
  const map = new Map<string, EventChannels>();
  if (userIds.length === 0) return map;
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId: { in: userIds }, event },
    select: { userId: true, email: true, inApp: true },
  });
  for (const r of rows) map.set(r.userId, { email: r.email, inApp: r.inApp });
  return map;
}

/**
 * Per-user quiet-hour overrides. When `notifyQuietOverride` is true the user's
 * own start/end window is used; otherwise we fall through to the company
 * window.
 */
type UserQuietOverride = {
  override: boolean;
  start: string | null;
  end: string | null;
};

async function loadUserQuietOverrides(
  userIds: string[]
): Promise<Map<string, UserQuietOverride>> {
  const map = new Map<string, UserQuietOverride>();
  if (userIds.length === 0) return map;
  const rows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      notifyQuietOverride: true,
      notifyQuietStart: true,
      notifyQuietEnd: true,
    },
  });
  for (const r of rows) {
    map.set(r.id, {
      override: r.notifyQuietOverride,
      start: r.notifyQuietStart,
      end: r.notifyQuietEnd,
    });
  }
  return map;
}

/** Resolve effective channels for one user given company defaults + overrides. */
function effectiveChannels(
  company: EventChannels,
  override: EventChannels | undefined
): EventChannels {
  if (!override) return company;
  return {
    email: company.email && override.email,
    inApp: company.inApp && override.inApp,
  };
}

/** Resolve effective quiet hours for one user given company + override. */
function effectiveQuiet(
  companyQuiet: { start: string; end: string },
  userOverride: UserQuietOverride | undefined
): { start: string; end: string } {
  if (
    userOverride &&
    userOverride.override &&
    typeof userOverride.start === "string" &&
    typeof userOverride.end === "string"
  ) {
    return { start: userOverride.start, end: userOverride.end };
  }
  return companyQuiet;
}

/**
 * Fire-and-forget wrapper. Dispatch failures are isolated from the caller —
 * an admin event hook should never block the underlying business action just
 * because the notification layer is misbehaving.
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = {
    recipients: 0,
    inAppCreated: 0,
    emailsQueued: 0,
    emailsSent: 0,
    contactsAttempted: 0,
    contactsDelivered: 0,
    skipped: { event: false, recipients: false },
  };

  try {
    const settings = await getCompanySettings(input.companyId);
    const channels = readEventChannels(settings.meta, input.event);
    if (!channels.email && !channels.inApp) {
      result.skipped.event = true;
      return result;
    }

    const recipients = await resolveRecipients(
      input.companyId,
      input.projectId ?? undefined,
      input.userIds
    );
    const contactIds = Array.from(new Set(input.contactIds ?? []));
    if (recipients.length === 0 && contactIds.length === 0) {
      result.skipped.recipients = true;
      return result;
    }
    result.recipients = recipients.length;

    const freq = readDigestFrequency(settings.meta);
    const quiet = readQuietHours(settings.meta);
    const tz = settings.timezone || "America/New_York";
    const now = new Date();
    const [userOverrides, userQuiet] = await Promise.all([
      loadUserChannelOverrides(recipients, input.event),
      loadUserQuietOverrides(recipients),
    ]);

    for (const userId of recipients) {
      const userChannels = effectiveChannels(channels, userOverrides.get(userId));
      const userQuietWindow = effectiveQuiet(quiet, userQuiet.get(userId));
      const userInQuiet = isInQuietHours(
        userQuietWindow.start,
        userQuietWindow.end,
        tz,
        now
      );
      const sendNow = !!input.urgent || (freq === "Realtime" && !userInQuiet);

      if (userChannels.inApp) {
        try {
          await prisma.notification.upsert({
            where: input.dedupeKey
              ? { userId_channel_dedupeKey: { userId, channel: "inApp", dedupeKey: input.dedupeKey } }
              : { userId_channel_dedupeKey: { userId, channel: "inApp", dedupeKey: `${input.event}:${Date.now()}:${Math.random()}` } },
            update: {
              title: input.title,
              body: input.body,
              link: input.link,
              meta: asJson(input.meta),
              status: "Sent",
              sentAt: now,
              readAt: null,
            },
            create: {
              companyId: input.companyId,
              userId,
              event: input.event,
              channel: "inApp",
              title: input.title,
              body: input.body,
              link: input.link,
              meta: asJson(input.meta),
              urgent: !!input.urgent,
              status: "Sent",
              sentAt: now,
              dedupeKey:
                input.dedupeKey ?? `${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
            },
          });
          result.inAppCreated += 1;
        } catch {
          // ignore per-recipient inApp failures
        }
      }

      if (userChannels.email) {
        try {
          if (sendNow) {
            const sendResult = await sendEmailRow({
              companyId: input.companyId,
              userId,
              event: input.event,
              title: input.title,
              body: input.body,
              link: input.link,
              meta: input.meta,
              urgent: !!input.urgent,
              dedupeKey: input.dedupeKey,
            });
            if (sendResult.delivered) {
              result.emailsSent += 1;
              await autoResolveUserEmailFailures({
                companyId: input.companyId,
                userId,
                event: input.event,
                now,
              });
            } else if (
              sendResult.reason &&
              sendResult.reason !== "provider_not_configured" &&
              sendResult.reason !== "user_opted_out"
            ) {
              // Persist a Failed Notification row so admins can see the bounce
              // / rejection in the Delivery problems panel. We skip recording
              // `provider_not_configured` (config gap surfaced via the panel
              // banner) and `user_opted_out` (an intentional preference, not a
              // failure to fix).
              await persistFailedEmailRow({
                companyId: input.companyId,
                userId,
                event: input.event,
                title: input.title,
                body: input.body,
                link: input.link,
                meta: input.meta,
                urgent: !!input.urgent,
                reason: sendResult.reason,
                dedupeKey: input.dedupeKey,
                now,
              });
            }
          } else {
            const scheduledFor = nextScheduledFor(freq, now);
            await prisma.notification.upsert({
              where: input.dedupeKey
                ? { userId_channel_dedupeKey: { userId, channel: "email", dedupeKey: input.dedupeKey } }
                : { userId_channel_dedupeKey: { userId, channel: "email", dedupeKey: `${input.event}:${Date.now()}:${Math.random()}` } },
              update: {
                title: input.title,
                body: input.body,
                link: input.link,
                meta: asJson(input.meta),
                status: "Pending",
                scheduledFor,
              },
              create: {
                companyId: input.companyId,
                userId,
                event: input.event,
                channel: "email",
                title: input.title,
                body: input.body,
                link: input.link,
                meta: asJson(input.meta),
                urgent: !!input.urgent,
                status: "Pending",
                scheduledFor,
                dedupeKey:
                  input.dedupeKey ??
                  `${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
              },
            });
            result.emailsQueued += 1;
          }
        } catch {
          // ignore per-recipient email failures
        }
      }
    }

    if (channels.email && contactIds.length > 0 && isOutboundEmailConfigured()) {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, companyId: input.companyId },
        select: { id: true, name: true, email: true, emailOptOut: true },
      });
      for (const c of contacts) {
        if (!c.email) {
          // Track contacts with no email on file as a failure so admins can
          // fix the bad address right from the Delivery problems list.
          await prisma.contactNotificationLog
            .create({
              data: {
                companyId: input.companyId,
                contactId: c.id,
                event: input.event,
                dedupeKey: `fail:${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
                status: "Failed",
                title: input.title,
                link: input.link,
                recipientEmail: null,
                failureReason: "no_recipient_email",
                failedAt: now,
                sentAt: now,
              },
            })
            .catch(() => undefined);
          continue;
        }
        // Honor the per-contact opt-out flipped by the unsubscribe link.
        if (c.emailOptOut) continue;
        // Durable dedupe so periodic sweeps don't re-email the same contractor
        // every cycle. When `dedupeKey` is omitted we mint a unique one so
        // explicit one-off events always send.
        const dedupeKey =
          input.dedupeKey ?? `${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`;
        if (input.dedupeKey) {
          const existing = await prisma.contactNotificationLog.findUnique({
            where: {
              contactId_event_dedupeKey: {
                contactId: c.id,
                event: input.event,
                dedupeKey,
              },
            },
            select: { id: true, status: true },
          });
          // Skip if we've already successfully sent this notification. Failed
          // attempts don't poison the dedupe slot — operators can retry once
          // they fix the address / config.
          if (existing && existing.status === "Sent") continue;
        }
        result.contactsAttempted += 1;
        try {
          const sendResult = await sendContactEmail({
            companyId: input.companyId,
            contactId: c.id,
            recipientName: c.name,
            recipientEmail: c.email,
            title: input.title,
            body: input.body,
            link: input.link,
          });
          if (sendResult.delivered) {
            result.contactsDelivered += 1;
            // Only mark the dedupe slot once the provider accepted the message,
            // so transient failures don't permanently suppress this event.
            await prisma.contactNotificationLog
              .create({
                data: {
                  companyId: input.companyId,
                  contactId: c.id,
                  event: input.event,
                  dedupeKey,
                  status: "Sent",
                  title: input.title,
                  link: input.link,
                  recipientEmail: c.email,
                  sentAt: now,
                },
              })
              .catch(() => undefined);
            await autoResolveContactEmailFailures({
              companyId: input.companyId,
              contactId: c.id,
              event: input.event,
              now,
            });
          } else if (sendResult.reason && sendResult.reason !== "provider_not_configured") {
            // Log the failure under a unique dedupeKey so each retry shows up
            // independently in the Delivery problems list.
            await prisma.contactNotificationLog
              .create({
                data: {
                  companyId: input.companyId,
                  contactId: c.id,
                  event: input.event,
                  dedupeKey: `fail:${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
                  status: "Failed",
                  title: input.title,
                  link: input.link,
                  recipientEmail: c.email,
                  failureReason: sendResult.reason,
                  failedAt: now,
                  sentAt: now,
                },
              })
              .catch(() => undefined);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await prisma.contactNotificationLog
            .create({
              data: {
                companyId: input.companyId,
                contactId: c.id,
                event: input.event,
                dedupeKey: `fail:${input.event}:${now.getTime()}:${Math.random().toString(36).slice(2)}`,
                status: "Failed",
                title: input.title,
                link: input.link,
                recipientEmail: c.email,
                failureReason: `transport_error: ${message}`,
                failedAt: now,
                sentAt: now,
              },
            })
            .catch(() => undefined);
        }
      }
    }
  } catch (err) {
    console.warn("[notifications] dispatch failed", err);
  }
  return result;
}

type EmailRow = {
  companyId: string;
  userId: string;
  event: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown> | null;
  urgent?: boolean;
  dedupeKey?: string | null;
};

/**
 * Persist a `Failed` email Notification row when realtime delivery fails. We
 * use upsert so explicit `dedupeKey` callers don't violate the unique index
 * and so retries overwrite the previous failure with the freshest reason.
 */
async function persistFailedEmailRow(opts: {
  companyId: string;
  userId: string;
  event: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meta?: Record<string, unknown> | null;
  urgent: boolean;
  reason: string;
  dedupeKey?: string | null;
  now: Date;
}): Promise<void> {
  const dedupeKey =
    opts.dedupeKey ??
    `fail:${opts.event}:${opts.now.getTime()}:${Math.random().toString(36).slice(2)}`;
  await prisma.notification
    .upsert({
      where: {
        userId_channel_dedupeKey: {
          userId: opts.userId,
          channel: "email",
          dedupeKey,
        },
      },
      update: {
        title: opts.title,
        body: opts.body ?? null,
        link: opts.link ?? null,
        meta: asJson(opts.meta ?? null),
        status: "Failed",
        failedAt: opts.now,
        failureReason: opts.reason,
        // A previously resolved row that fails again must reappear in the
        // Delivery problems list. Clear resolution fields on every Failed
        // transition so the new failure is visible to admins.
        resolvedAt: null,
        resolvedById: null,
        resolvedReason: null,
      },
      create: {
        companyId: opts.companyId,
        userId: opts.userId,
        event: opts.event,
        channel: "email",
        title: opts.title,
        body: opts.body ?? null,
        link: opts.link ?? null,
        meta: asJson(opts.meta ?? null),
        urgent: opts.urgent,
        status: "Failed",
        failedAt: opts.now,
        failureReason: opts.reason,
        dedupeKey,
      },
    })
    .catch(() => undefined);
}

/**
 * Auto-resolve any prior unresolved Failed email Notification rows for the
 * same user + event once a later send succeeds. Keeps the Delivery problems
 * panel focused on still-broken recipients without losing audit history.
 */
async function autoResolveUserEmailFailures(opts: {
  companyId: string;
  userId: string;
  event: string;
  now: Date;
  excludeId?: string;
}): Promise<void> {
  await prisma.notification
    .updateMany({
      where: {
        companyId: opts.companyId,
        userId: opts.userId,
        event: opts.event,
        channel: "email",
        status: "Failed",
        resolvedAt: null,
        ...(opts.excludeId ? { NOT: { id: opts.excludeId } } : {}),
      },
      data: {
        resolvedAt: opts.now,
        resolvedReason: "auto_later_send_succeeded",
      },
    })
    .catch(() => undefined);
}

/**
 * Auto-resolve any prior unresolved Failed contact-email rows for the same
 * contact + event once a later send to that contact succeeds.
 */
async function autoResolveContactEmailFailures(opts: {
  companyId: string;
  contactId: string;
  event: string;
  now: Date;
}): Promise<void> {
  await prisma.contactNotificationLog
    .updateMany({
      where: {
        companyId: opts.companyId,
        contactId: opts.contactId,
        event: opts.event,
        status: "Failed",
        resolvedAt: null,
      },
      data: {
        resolvedAt: opts.now,
        resolvedReason: "auto_later_send_succeeded",
      },
    })
    .catch(() => undefined);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readReplyTo(meta: unknown): string | undefined {
  const m = (meta as Record<string, unknown>) || {};
  const v = m.notifyReplyTo;
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function buildEmailBody(opts: {
  companyName: string;
  recipientName: string;
  title: string;
  body?: string | null;
  link?: string | null;
  footer: string;
  unsubscribeUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const subject = `[${opts.companyName}] ${opts.title}`;
  const unsubLineText = opts.unsubscribeUrl
    ? `\nUnsubscribe from these emails: ${opts.unsubscribeUrl}`
    : "";
  const text = [
    `Hi ${opts.recipientName},`,
    "",
    opts.title,
    opts.body ?? "",
    opts.link ? `\nOpen: ${opts.link}` : "",
    "",
    `— ${opts.companyName}`,
    unsubLineText,
  ]
    .filter(Boolean)
    .join("\n");
  const unsubLineHtml = opts.unsubscribeUrl
    ? `<p style="color:#666;font-size:12px;margin-top:12px">
         Don't want these emails?
         <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#0C447C">Unsubscribe with one click</a>.
       </p>`
    : "";
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
      <p>Hi ${escapeHtml(opts.recipientName)},</p>
      <p><strong>${escapeHtml(opts.title)}</strong></p>
      ${opts.body ? `<p>${escapeHtml(opts.body)}</p>` : ""}
      ${opts.link ? `<p><a href="${escapeHtml(opts.link)}">Open in CHG Rehab</a></p>` : ""}
      <p style="color:#666;font-size:12px">${escapeHtml(opts.footer)}</p>
      ${unsubLineHtml}
    </div>
  `;
  return { subject, text, html };
}

async function sendEmailRow(row: EmailRow): Promise<{ delivered: boolean; reason?: string }> {
  const [user, company, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: row.userId },
      select: { email: true, firstName: true, lastName: true, emailOptOut: true },
    }),
    prisma.company.findUnique({
      where: { id: row.companyId },
      select: { name: true },
    }),
    getCompanySettings(row.companyId),
  ]);
  if (!user) return { delivered: false, reason: "user_missing" };
  if (user.emailOptOut) return { delivered: false, reason: "user_opted_out" };
  if (!user.email) return { delivered: false, reason: "no_recipient_email" };

  const recipientName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const companyName = company?.name ?? "CHG Rehab";
  const replyTo = readReplyTo(settings.meta);
  const { subject, text, html } = buildEmailBody({
    companyName,
    recipientName,
    title: row.title,
    body: row.body,
    link: row.link,
    footer:
      "You're receiving this because notifications for this event are enabled in Admin Settings. " +
      "Manage your delivery preferences in your account profile.",
  });

  if (!isOutboundEmailConfigured()) {
    console.info(
      `[notifications] outbound transport not configured — would have emailed ${user.email} (${row.event})`
    );
    return { delivered: false, reason: "provider_not_configured" };
  }

  const res = await sendOutboundEmail({
    to: user.email,
    subject,
    text,
    html,
    replyTo,
  });
  if (!res.delivered) {
    console.warn(
      `[notifications] outbound delivery rejected for ${user.email}: ${res.reason ?? "unknown"}`
    );
  }
  return res;
}

async function sendContactEmail(opts: {
  companyId: string;
  contactId: string;
  recipientName: string;
  recipientEmail: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const [company, settings] = await Promise.all([
    prisma.company.findUnique({
      where: { id: opts.companyId },
      select: { name: true },
    }),
    getCompanySettings(opts.companyId),
  ]);
  const companyName = company?.name ?? "CHG Rehab";
  const replyTo = readReplyTo(settings.meta);
  const unsubscribeUrl = buildUnsubscribeUrl(opts.contactId);
  const { subject, text, html } = buildEmailBody({
    companyName,
    recipientName: opts.recipientName,
    title: opts.title,
    body: opts.body,
    link: opts.link,
    footer: unsubscribeUrl
      ? `You're receiving this because ${companyName} listed you as a contact for this work.`
      : `You're receiving this because ${companyName} listed you as a contact for this work. ` +
        `Reply to this email if you'd like to be removed from these notifications.`,
    unsubscribeUrl,
  });

  if (!isOutboundEmailConfigured()) {
    console.info(
      `[notifications] outbound transport not configured — would have emailed contact ${opts.recipientEmail}`
    );
    return { delivered: false, reason: "provider_not_configured" };
  }

  // RFC 2369 + RFC 8058: providing both a List-Unsubscribe URL/mailto AND
  // List-Unsubscribe-Post lets Gmail/Apple Mail render a one-click unsubscribe
  // affordance directly in the inbox, satisfying CAN-SPAM and bulk-sender
  // requirements.
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    const mailto = replyTo ? `, <mailto:${replyTo}?subject=unsubscribe>` : "";
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  } else if (replyTo) {
    headers["List-Unsubscribe"] = `<mailto:${replyTo}?subject=unsubscribe>`;
  }

  return sendOutboundEmail({
    to: opts.recipientEmail,
    subject,
    text,
    html,
    replyTo,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

/**
 * Send any email rows whose `scheduledFor` has elapsed and whose company is
 * outside its quiet-hours window. Returns counts for observability. Safe to
 * call from any request handler — the sweep is throttled per company by the
 * caller (see `lib/notifications/sweep.ts`).
 */
type ClaimedEmailRow = {
  id: string;
  companyId: string;
  userId: string;
  event: string;
  title: string;
  body: string | null;
  link: string | null;
  meta: unknown;
  urgent: boolean;
  dedupeKey: string | null;
};

// How long a "Sending" claim is honored before another worker may steal it.
// If a process dies after claiming but before marking Sent/Failed, the row
// would otherwise be stuck forever. 10 minutes is well above any realistic
// SMTP latency.
const CLAIM_LEASE_MS = 10 * 60 * 1000;

/**
 * Reset rows that were claimed but never finished (process died mid-flush).
 * `sentAt` doubles as the claim timestamp on rows in status="Sending"; a row
 * stuck longer than the lease window is returned to "Pending" so the next
 * sweep can pick it back up.
 */
async function recoverStaleClaims(companyId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  await prisma.notification.updateMany({
    where: {
      companyId,
      channel: "email",
      status: "Sending",
      OR: [{ sentAt: null }, { sentAt: { lt: cutoff } }],
    },
    data: { status: "Pending" },
  });
}

/**
 * Atomically claim up to 100 due email rows for this worker by flipping
 * Pending → Sending in a single `UPDATE ... RETURNING` over a row-locked
 * subquery (`FOR UPDATE SKIP LOCKED`). Concurrent sweeps from other workers,
 * the cron route, the standalone script, or the bell backstop will see those
 * rows as "Sending" and skip them, so no email is ever sent twice. Sets
 * `sentAt = now` so it can also serve as the claim timestamp for stale-claim
 * recovery; on successful send `sentAt` is overwritten with the real send
 * time.
 */
async function claimDueEmailRows(companyId: string, now: Date): Promise<ClaimedEmailRow[]> {
  const rows = await prisma.$queryRaw<ClaimedEmailRow[]>`
    UPDATE "Notification" AS n
       SET status = 'Sending', "sentAt" = ${now}
      FROM (
        SELECT id
          FROM "Notification"
         WHERE "companyId" = ${companyId}
           AND channel = 'email'
           AND status = 'Pending'
           AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
         ORDER BY "createdAt" ASC
         LIMIT 100
         FOR UPDATE SKIP LOCKED
      ) AS picked
     WHERE n.id = picked.id
    RETURNING n.id, n."companyId" AS "companyId", n."userId" AS "userId",
              n.event, n.title, n.body, n.link, n.meta, n.urgent,
              n."dedupeKey" AS "dedupeKey"
  `;
  return rows;
}

export type ResendResult =
  | {
      ok: true;
      delivered: boolean;
      reason?: string;
      status: "Sent" | "Failed";
      failedAt: string | null;
      at: string;
    }
  | { ok: false; error: "not_found" | "not_failed" | "wrong_company" | "bad_id" | "no_recipient_email" | "user_opted_out" | "contact_opted_out" | "provider_not_configured" };

/**
 * Re-send a previously failed notification for an admin "Retry" action. The
 * supplied id is the prefixed identifier returned by the
 * `/api/admin/notification-failures` GET endpoint (`u:<notificationId>` for
 * employee email rows, `c:<contactNotificationLogId>` for external contact
 * rows). Reuses the same internal helpers that the live dispatch path goes
 * through so the retry follows the exact same address/transport rules and
 * the row is updated in place rather than duplicated.
 */
export async function resendFailedNotification(
  prefixedId: string,
  companyId: string
): Promise<ResendResult> {
  const colon = prefixedId.indexOf(":");
  if (colon <= 0) return { ok: false, error: "bad_id" };
  const kind = prefixedId.slice(0, colon);
  const id = prefixedId.slice(colon + 1);
  if (!id) return { ok: false, error: "bad_id" };
  const now = new Date();

  if (kind === "u") {
    const row = await prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        userId: true,
        event: true,
        title: true,
        body: true,
        link: true,
        meta: true,
        urgent: true,
        dedupeKey: true,
        channel: true,
        status: true,
      },
    });
    if (!row) return { ok: false, error: "not_found" };
    if (row.companyId !== companyId) return { ok: false, error: "wrong_company" };
    if (row.channel !== "email" || row.status !== "Failed")
      return { ok: false, error: "not_failed" };

    let result: { delivered: boolean; reason?: string };
    try {
      result = await sendEmailRow({
        companyId: row.companyId,
        userId: row.userId,
        event: row.event,
        title: row.title,
        body: row.body,
        link: row.link,
        meta: (row.meta as Record<string, unknown> | null) ?? null,
        urgent: row.urgent,
        dedupeKey: row.dedupeKey,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { delivered: false, reason: `transport_error: ${message}` };
    }

    if (result.delivered) {
      await prisma.notification
        .update({
          where: { id: row.id },
          data: { status: "Sent", sentAt: now, failedAt: null, failureReason: null },
        })
        .catch(() => undefined);
      return { ok: true, delivered: true, status: "Sent", failedAt: null, at: now.toISOString() };
    }

    if (result.reason === "provider_not_configured") {
      return { ok: false, error: "provider_not_configured" };
    }
    if (result.reason === "user_opted_out") {
      return { ok: false, error: "user_opted_out" };
    }

    await prisma.notification
      .update({
        where: { id: row.id },
        data: {
          status: "Failed",
          sentAt: null,
          failedAt: now,
          failureReason: result.reason ?? "unknown",
        },
      })
      .catch(() => undefined);
    return {
      ok: true,
      delivered: false,
      reason: result.reason ?? "unknown",
      status: "Failed",
      failedAt: now.toISOString(),
      at: now.toISOString(),
    };
  }

  if (kind === "c") {
    const row = await prisma.contactNotificationLog.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        event: true,
        title: true,
        link: true,
        status: true,
      },
    });
    if (!row) return { ok: false, error: "not_found" };
    if (row.companyId !== companyId) return { ok: false, error: "wrong_company" };
    if (row.status !== "Failed") return { ok: false, error: "not_failed" };

    const contact = await prisma.contact.findUnique({
      where: { id: row.contactId },
      select: { id: true, name: true, email: true, emailOptOut: true, companyId: true },
    });
    if (!contact || contact.companyId !== companyId)
      return { ok: false, error: "not_found" };
    if (!contact.email) return { ok: false, error: "no_recipient_email" };
    if (contact.emailOptOut) return { ok: false, error: "contact_opted_out" };

    let result: { delivered: boolean; reason?: string };
    try {
      result = await sendContactEmail({
        companyId: row.companyId,
        contactId: contact.id,
        recipientName: contact.name,
        recipientEmail: contact.email,
        title: row.title ?? row.event,
        link: row.link ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { delivered: false, reason: `transport_error: ${message}` };
    }

    if (result.delivered) {
      await prisma.contactNotificationLog
        .update({
          where: { id: row.id },
          data: {
            status: "Sent",
            recipientEmail: contact.email,
            failureReason: null,
            failedAt: null,
            sentAt: now,
          },
        })
        .catch(() => undefined);
      return { ok: true, delivered: true, status: "Sent", failedAt: null, at: now.toISOString() };
    }

    if (result.reason === "provider_not_configured") {
      return { ok: false, error: "provider_not_configured" };
    }

    await prisma.contactNotificationLog
      .update({
        where: { id: row.id },
        data: {
          status: "Failed",
          recipientEmail: contact.email,
          failureReason: result.reason ?? "unknown",
          failedAt: now,
        },
      })
      .catch(() => undefined);
    return {
      ok: true,
      delivered: false,
      reason: result.reason ?? "unknown",
      status: "Failed",
      failedAt: now.toISOString(),
      at: now.toISOString(),
    };
  }

  return { ok: false, error: "bad_id" };
}

export async function flushPendingEmails(companyId: string, now: Date = new Date()): Promise<{
  attempted: number;
  sent: number;
  failed: number;
}> {
  const settings = await getCompanySettings(companyId);
  const quiet = readQuietHours(settings.meta);
  const tz = settings.timezone || "America/New_York";

  await recoverStaleClaims(companyId, now);
  const claimed = await claimDueEmailRows(companyId, now);

  // Pre-load per-user quiet-hour overrides for everyone in this batch so we
  // can decide row-by-row whether each recipient is currently in their own
  // quiet window (which may differ from the company default).
  const claimedUserIds = Array.from(new Set(claimed.map((c) => c.userId)));
  const userQuiet = await loadUserQuietOverrides(claimedUserIds);

  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const n of claimed) {
    const userQuietWindow = effectiveQuiet(quiet, userQuiet.get(n.userId));
    const inQuiet = isInQuietHours(
      userQuietWindow.start,
      userQuietWindow.end,
      tz,
      now
    );
    if (inQuiet && !n.urgent) {
      // Release the claim so the next non-quiet sweep can pick it back up.
      // Clear the lease-only `sentAt` so it doesn't masquerade as a real send.
      await prisma.notification
        .update({ where: { id: n.id }, data: { status: "Pending", sentAt: null } })
        .catch(() => undefined);
      deferred += 1;
      continue;
    }
    try {
      const res = await sendEmailRow({
        companyId: n.companyId,
        userId: n.userId,
        event: n.event,
        title: n.title,
        body: n.body,
        link: n.link,
        meta: (n.meta as Record<string, unknown> | null) ?? null,
        urgent: n.urgent,
        dedupeKey: n.dedupeKey,
      });
      if (res.delivered) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: "Sent", sentAt: now, failedAt: null, failureReason: null },
        });
        await autoResolveUserEmailFailures({
          companyId: n.companyId,
          userId: n.userId,
          event: n.event,
          now,
          excludeId: n.id,
        });
        sent += 1;
      } else if (res.reason === "provider_not_configured") {
        // Recoverable config gap — leave Pending so the row is retried after
        // the operator wires RESEND_API_KEY / EMAIL_FROM.
      } else if (res.reason === "user_opted_out") {
        // Intentional user preference — drop the queued row silently so it
        // doesn't pile up in the failures list.
        await prisma.notification
          .delete({ where: { id: n.id } })
          .catch(() => undefined);
      } else {
        failed += 1;
        // Clear the lease-only `sentAt` (set when the row was claimed) so
        // it doesn't read as a successful send timestamp. Also clear any
        // stale resolution fields so a row that was previously resolved
        // resurfaces in the Delivery problems list when it fails again.
        await prisma.notification
          .update({
            where: { id: n.id },
            data: {
              status: "Failed",
              sentAt: null,
              failedAt: now,
              failureReason: res.reason ?? "unknown",
              resolvedAt: null,
              resolvedById: null,
              resolvedReason: null,
            },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      failed += 1;
      // Clear the lease-only `sentAt` on failure so it doesn't read as a
      // successful send timestamp, and record the underlying transport
      // error so admins see a useful reason in the Delivery problems list.
      // Reset resolution fields so a previously resolved row resurfaces.
      const message = err instanceof Error ? err.message : String(err);
      await prisma.notification
        .update({
          where: { id: n.id },
          data: {
            status: "Failed",
            sentAt: null,
            failedAt: now,
            failureReason: `transport_error: ${message}`,
            resolvedAt: null,
            resolvedById: null,
            resolvedReason: null,
          },
        })
        .catch(() => undefined);
    }
  }
  return { attempted: claimed.length - deferred, sent, failed };
}
