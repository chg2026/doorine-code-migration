import { sendEmail as replitSendEmail } from "./replitmail";

export type InviteEmail = {
  to: string;
  inviterName: string;
  companyName: string;
  role: string;
  joinUrl: string;
  expiresAt: Date;
};

export type SendResult = { delivered: boolean; reason?: string; messageId?: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the invite-link email via the Replit Mail blueprint.
 *
 * Replit Mail sends to the *authenticated Replit user's* verified email
 * (i.e. the admin who initiated the invite) — it cannot address arbitrary
 * recipients. The admin receives a copy of the join link and can forward it
 * to the invitee. The admin UI also surfaces the link directly so they can
 * copy/paste without waiting for the email.
 */
export async function sendInviteEmail(msg: InviteEmail): Promise<SendResult> {
  const expires = msg.expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const subject = `Invite link for ${msg.to} — ${msg.companyName}`;
  const text = [
    `${msg.inviterName} invited ${msg.to} to join ${msg.companyName} on CHG Rehab as a ${msg.role}.`,
    ``,
    `Forward this join link to ${msg.to} (expires ${expires}):`,
    msg.joinUrl,
    ``,
    `If you didn't initiate this invite, you can revoke it from the Admin → Users & permissions page.`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111">
      <p><strong>${escapeHtml(msg.inviterName)}</strong> invited
      <strong>${escapeHtml(msg.to)}</strong> to join
      <strong>${escapeHtml(msg.companyName)}</strong> on CHG Rehab as a
      <strong>${escapeHtml(msg.role)}</strong>.</p>
      <p>Forward this join link to ${escapeHtml(msg.to)} (expires ${escapeHtml(expires)}):</p>
      <p><a href="${escapeHtml(msg.joinUrl)}" style="display:inline-block;padding:10px 16px;background:#0F62FE;color:#fff;border-radius:6px;text-decoration:none">Accept invite</a></p>
      <p style="word-break:break-all;color:#555;font-size:12px">${escapeHtml(msg.joinUrl)}</p>
      <p style="color:#666;font-size:12px">If you didn't initiate this invite, you can revoke it from Admin → Users &amp; permissions.</p>
    </div>
  `;

  try {
    const res = await replitSendEmail({ subject, text, html });
    const delivered = (res.accepted?.length ?? 0) > 0;
    return {
      delivered,
      messageId: res.messageId,
      reason: delivered ? undefined : "rejected_by_provider",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { delivered: false, reason: `transport_error: ${message}` };
  }
}
