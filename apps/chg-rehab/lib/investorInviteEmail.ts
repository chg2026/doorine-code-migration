import {
  isOutboundEmailConfigured,
  sendOutboundEmail,
} from "./outboundEmail";
import { sendEmail as replitSendEmail } from "./replitmail";

export type InvestorInviteEmailInput = {
  to: string;
  inviterName: string;
  companyName: string;
  joinUrl: string;
  expiresAt: Date;
};

export type InvestorInviteResult = {
  delivered: boolean;
  channel: "outbound" | "replitmail" | "none";
  reason?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the investor portal invite. Prefers the configured outbound provider
 * (Resend) so the email lands in the *investor's* inbox; falls back to the
 * Replit Mail blueprint, which only delivers to the operator's own verified
 * Replit address (the operator can then forward).
 *
 * The admin UI also surfaces the join URL directly so onboarding never
 * blocks on email delivery.
 */
export async function sendInvestorInviteEmail(
  msg: InvestorInviteEmailInput
): Promise<InvestorInviteResult> {
  const expires = msg.expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const subject = "You've been invited to view your investments";
  const text = [
    `${msg.inviterName} has invited you to access the ${msg.companyName} investor portal.`,
    ``,
    `Set your password and sign in (link expires ${expires}):`,
    msg.joinUrl,
    ``,
    `If you weren't expecting this, you can safely ignore the email.`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
      <p><strong>${escapeHtml(msg.inviterName)}</strong> has invited you to
      access the <strong>${escapeHtml(msg.companyName)}</strong> investor portal.</p>
      <p>Set your password and sign in (link expires ${escapeHtml(expires)}):</p>
      <p><a href="${escapeHtml(msg.joinUrl)}" style="display:inline-block;padding:10px 16px;background:#0F6E56;color:#fff;border-radius:6px;text-decoration:none">Set up your portal</a></p>
      <p style="word-break:break-all;color:#555;font-size:12px">${escapeHtml(msg.joinUrl)}</p>
      <p style="color:#666;font-size:12px">If you weren't expecting this, you can safely ignore this email.</p>
    </div>
  `;

  if (isOutboundEmailConfigured()) {
    try {
      const res = await sendOutboundEmail({
        to: msg.to,
        subject,
        text,
        html,
      });
      if (res.delivered) {
        return { delivered: true, channel: "outbound" };
      }
      return {
        delivered: false,
        channel: "outbound",
        reason: res.reason || "rejected_by_provider",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Fall through to replit-mail fallback.
      console.warn("[investor-invite] outbound provider failed:", message);
    }
  }

  try {
    const operatorSubject = `Investor invite for ${msg.to} — ${msg.companyName}`;
    const operatorText = [
      `Outbound email is not configured (or delivery failed). Forward this`,
      `link to ${msg.to} so they can finish signing up (expires ${expires}):`,
      msg.joinUrl,
    ].join("\n");
    const res = await replitSendEmail({
      subject: operatorSubject,
      text: operatorText,
      html,
    });
    const delivered = (res.accepted?.length ?? 0) > 0;
    return {
      delivered,
      channel: "replitmail",
      reason: delivered ? undefined : "operator_inbox_rejected",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      delivered: false,
      channel: "none",
      reason: `transport_error: ${message}`,
    };
  }
}
