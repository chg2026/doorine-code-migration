import { InvestorActivityType } from "@prisma/client";
import { prisma } from "../prisma";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";

/**
 * Investor-side notification emitter.
 *
 * Counterpart to ./dispatch.ts (operator users). Investors live in the
 * `Investor` table and have their own activity feed (`InvestorActivity`,
 * surfaced in the portal) and per-event prefs (`InvestorNotificationPreference`,
 * persisted by PUT /api/account/notification-preferences).
 *
 * The portal exposes five toggle-able events:
 *   distribution | document | update | newdeal | captable
 * Each event has independent `email` and `inApp` flags. Defaults (no row in
 * the prefs table) are both `true`.
 *
 * For each notification:
 *  - When `inApp` is true, an `InvestorActivity` row is written. That row is
 *    what the portal feed (`getInvestorActivities` + dashboards) reads, so it
 *    is effectively the in-app channel.
 *  - When `email` is true and outbound email is configured (`RESEND_API_KEY` +
 *    `EMAIL_FROM`), a transactional email is sent directly to the investor's
 *    address via the same `sendOutboundEmail` transport chg-rehab uses.
 *
 * Failures in either channel are isolated — they never throw to the caller so
 * the underlying business action (distribution payment, capital call, etc.)
 * is not blocked by a notification hiccup.
 */

export type InvestorNotifyEvent =
  | "distribution"
  | "document"
  | "update"
  | "newdeal"
  | "captable";

export const INVESTOR_NOTIFY_EVENTS: readonly InvestorNotifyEvent[] = [
  "distribution",
  "document",
  "update",
  "newdeal",
  "captable",
];

const EVENT_TO_ACTIVITY: Record<InvestorNotifyEvent, InvestorActivityType> = {
  distribution: InvestorActivityType.Distribution,
  document: InvestorActivityType.Document,
  update: InvestorActivityType.Update,
  newdeal: InvestorActivityType.Subscription,
  captable: InvestorActivityType.CapitalCall,
};

export type InvestorNotifyInput = {
  investorId: string;
  event: InvestorNotifyEvent;
  title: string;
  description?: string | null;
  relatedSubscriptionId?: string | null;
  relatedDocumentId?: string | null;
  relatedUpdateId?: string | null;
  /** Absolute URL appended to the email body so investors can jump to the portal. */
  link?: string | null;
};

export type InvestorNotifyResult = {
  inAppCreated: boolean;
  emailSent: boolean;
  skipped: boolean;
  reason?: string;
};

const DEFAULT_PREFS = { email: true, inApp: true };

async function loadPrefs(
  investorId: string,
  event: InvestorNotifyEvent
): Promise<{ email: boolean; inApp: boolean }> {
  const row = await prisma.investorNotificationPreference.findUnique({
    where: { investorId_event: { investorId, event } },
    select: { email: true, inApp: true },
  });
  return row ?? DEFAULT_PREFS;
}

function buildEmailBody(
  recipientFirst: string | null | undefined,
  title: string,
  description: string | null | undefined,
  link: string | null | undefined
): { text: string; html: string } {
  const greeting = recipientFirst ? `Hi ${recipientFirst},` : "Hi,";
  const desc = description ? description.trim() : "";
  const linkLine = link ? `\n\nView details: ${link}` : "";
  const text = [greeting, "", title, desc, linkLine.trim()].filter(Boolean).join("\n\n");

  const escape = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const html = `<p>${escape(greeting)}</p>
<p><strong>${escape(title)}</strong></p>${desc ? `\n<p>${escape(desc)}</p>` : ""}${
    link
      ? `\n<p><a href="${escape(link)}">View details</a></p>`
      : ""
  }`;
  return { text, html };
}

/**
 * Dispatch a single notification for one investor. Best-effort: never throws.
 */
export async function dispatchInvestorNotification(
  input: InvestorNotifyInput
): Promise<InvestorNotifyResult> {
  const result: InvestorNotifyResult = {
    inAppCreated: false,
    emailSent: false,
    skipped: false,
  };
  try {
    const prefs = await loadPrefs(input.investorId, input.event);
    if (!prefs.email && !prefs.inApp) {
      result.skipped = true;
      result.reason = "opted_out";
      return result;
    }

    if (prefs.inApp) {
      try {
        await prisma.investorActivity.create({
          data: {
            investorId: input.investorId,
            eventType: EVENT_TO_ACTIVITY[input.event],
            title: input.title,
            description: input.description ?? null,
            relatedSubscriptionId: input.relatedSubscriptionId ?? null,
            relatedDocumentId: input.relatedDocumentId ?? null,
            relatedUpdateId: input.relatedUpdateId ?? null,
          },
        });
        result.inAppCreated = true;
      } catch (err) {
        console.warn("[investor-notify] inApp activity create failed", err);
      }
    }

    if (prefs.email) {
      if (!isOutboundEmailConfigured()) {
        result.reason = result.reason ?? "provider_not_configured";
      } else {
        const investor = await prisma.investor.findUnique({
          where: { id: input.investorId },
          select: { email: true, firstName: true },
        });
        if (!investor?.email) {
          result.reason = "no_recipient_email";
        } else {
          const { text, html } = buildEmailBody(
            investor.firstName,
            input.title,
            input.description ?? null,
            input.link ?? null
          );
          try {
            const send = await sendOutboundEmail({
              to: investor.email,
              subject: input.title,
              text,
              html,
            });
            if (send.delivered) {
              result.emailSent = true;
            } else {
              result.reason = send.reason ?? "send_failed";
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result.reason = `transport_error: ${message}`;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[investor-notify] dispatch failed", err);
  }
  return result;
}

/** Fan-out helper for fan-out events (e.g. all subscribers on a distribution). */
export async function dispatchInvestorNotifications(
  inputs: InvestorNotifyInput[]
): Promise<InvestorNotifyResult[]> {
  const out: InvestorNotifyResult[] = [];
  for (const i of inputs) {
    out.push(await dispatchInvestorNotification(i));
  }
  return out;
}
