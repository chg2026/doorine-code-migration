/**
 * Shared notification fan-out used by both apps. For a given (investor,
 * event) pair this:
 *   1. Always writes an `InvestorActivity` row (in-app feed).
 *   2. Reads `InvestorNotificationPreference` and, if `email !== false`
 *      and the investor has an email on file, sends a transactional email
 *      via the Replit mailer.
 *
 * The helper is best-effort: the activity row is created in a try/catch
 * around the mail send so a flaky outbound mailer can never break the
 * primary write that the operator just performed.
 *
 * `event` strings match the keys used in the prefs UI:
 *   distribution | document | update | newdeal | captable | capitalcall | subscription
 *
 * `eventType` is the InvestorActivity enum value persisted on the row.
 */
import { prisma } from "./prisma";
import { sendOutboundEmail, isOutboundEmailConfigured } from "./outboundEmail";
import { InvestorActivityType } from "@prisma/client";

export type NotifyEvent =
  | "distribution"
  | "document"
  | "update"
  | "newdeal"
  | "captable"
  | "capitalcall"
  | "subscription";

export interface NotifyAttachment {
  filename: string;
  /** Raw bytes — will be base64-encoded for the mailer transport. */
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface NotifyInvestorInput {
  investorId: string;
  event: NotifyEvent;
  eventType: InvestorActivityType;
  title: string;
  description?: string;
  /** Public portal link the investor should land on (e.g. /distributions). */
  link?: string;
  relatedSubscriptionId?: string;
  relatedDocumentId?: string;
  relatedUpdateId?: string;
  /** Override the resolved portal base URL (useful for testing). */
  portalBaseUrl?: string;
  /** Optional file attachments forwarded to the email transport. */
  attachments?: NotifyAttachment[];
}

function portalBaseUrl(override?: string): string {
  if (override) return override.replace(/\/+$/, "");
  const fromEnv =
    process.env.INVESTOR_PORTAL_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev}:3002`;
  return "http://localhost:3002";
}

export async function notifyInvestor(input: NotifyInvestorInput): Promise<void> {
  // 1. Activity row — never throw, always best-effort.
  try {
    await prisma.investorActivity.create({
      data: {
        investorId: input.investorId,
        eventType: input.eventType,
        title: input.title,
        description: input.description ?? null,
        relatedSubscriptionId: input.relatedSubscriptionId ?? null,
        relatedDocumentId: input.relatedDocumentId ?? null,
        relatedUpdateId: input.relatedUpdateId ?? null,
      },
    });
  } catch (err) {
    console.error("[notifyInvestor] activity write failed", input.investorId, err);
  }

  // 2. Email fan-out (best-effort).
  try {
    const [investor, pref] = await Promise.all([
      prisma.investor.findUnique({
        where: { id: input.investorId },
        select: { email: true, firstName: true },
      }),
      prisma.investorNotificationPreference.findUnique({
        where: {
          investorId_event: { investorId: input.investorId, event: input.event },
        },
      }),
    ]);
    if (!investor || !investor.email) return;
    if (pref && pref.email === false) return;

    const link = input.link ? `${portalBaseUrl(input.portalBaseUrl)}${input.link}` : portalBaseUrl(input.portalBaseUrl);
    const greeting = investor.firstName ? `Hi ${investor.firstName},` : "Hi,";
    const desc = input.description ? `<p>${escapeHtml(input.description)}</p>` : "";
    const html = `
      <p>${greeting}</p>
      <p><strong>${escapeHtml(input.title)}</strong></p>
      ${desc}
      <p><a href="${link}" style="background:#1D9E75;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;display:inline-block;">View in portal</a></p>
      <p style="color:#999;font-size:11px;">You can adjust your notification preferences from the portal at any time.</p>
    `;
    const text = `${input.title}\n${input.description || ""}\n\n${link}`;

    const attachments =
      input.attachments && input.attachments.length > 0
        ? input.attachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType || "application/octet-stream",
            content: Buffer.isBuffer(a.content)
              ? a.content.toString("base64")
              : Buffer.from(a.content).toString("base64"),
          }))
        : undefined;

    // Outbound (Resend) is the only path that can deliver to an arbitrary
    // investor address; the Replit mailer is operator-only and would
    // misdirect investor emails. If RESEND_API_KEY/EMAIL_FROM aren't set,
    // we log and stop — the in-app activity row above already landed.
    if (!isOutboundEmailConfigured()) {
      console.info(
        `[notifyInvestor] outbound email skipped (provider not configured) — investor=${input.investorId} title=${input.title}`
      );
      return;
    }

    const res = await sendOutboundEmail({
      to: investor.email,
      subject: input.title,
      text,
      html,
      ...(attachments ? { attachments } : {}),
    });
    if (!res.delivered) {
      console.warn(
        `[notifyInvestor] outbound delivery failed to ${investor.email}: ${res.reason ?? "unknown"}`
      );
    }
  } catch (err) {
    console.error("[notifyInvestor] email send failed", input.investorId, err);
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
