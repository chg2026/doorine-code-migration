// Resend-backed outbound email for arbitrary recipients.
// Config: RESEND_API_KEY + EMAIL_FROM. Falls back to a logged noop when unset.

export type OutboundEmailAttachment = {
  filename: string;
  /** Base64-encoded file contents. */
  content: string;
  contentType?: string;
};

export type OutboundEmailMessage = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  from?: string;
  /**
   * Extra SMTP headers forwarded to Resend. Used for `List-Unsubscribe`
   * (RFC 2369) and `List-Unsubscribe-Post` (RFC 8058 one-click) on
   * external-contact emails.
   */
  headers?: Record<string, string>;
  /** File attachments forwarded to Resend (per https://resend.com/docs). */
  attachments?: OutboundEmailAttachment[];
};

export type OutboundEmailResult = {
  delivered: boolean;
  messageId?: string;
  reason?: string;
};

export function isOutboundEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function isLikelyValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

// Never throws — failures are reported via `delivered: false` so callers can decide whether to retry.
export async function sendOutboundEmail(
  msg: OutboundEmailMessage
): Promise<OutboundEmailResult> {
  if (!msg.to || !isLikelyValidEmail(msg.to)) {
    return { delivered: false, reason: "invalid_recipient" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = msg.from || process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(
      `[outboundEmail] skipped — provider not configured (to=${msg.to}, subject=${msg.subject})`
    );
    return { delivered: false, reason: "provider_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        reply_to: msg.replyTo && isLikelyValidEmail(msg.replyTo) ? msg.replyTo : undefined,
        headers:
          msg.headers && Object.keys(msg.headers).length > 0 ? msg.headers : undefined,
        attachments:
          msg.attachments && msg.attachments.length > 0
            ? msg.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                content_type: a.contentType,
              }))
            : undefined,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = typeof body?.message === "string" ? body.message : JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      return {
        delivered: false,
        reason: `provider_error_${res.status}${detail ? `: ${detail}` : ""}`,
      };
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, messageId: body?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { delivered: false, reason: `transport_error: ${message}` };
  }
}
