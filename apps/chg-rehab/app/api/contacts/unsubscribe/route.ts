import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/contactUnsubscribe";

export const dynamic = "force-dynamic";

/**
 * Public unsubscribe endpoint for external contractor / vendor emails.
 *
 *   GET  /api/contacts/unsubscribe?token=<signed>  → confirmation page
 *   POST /api/contacts/unsubscribe                 → RFC 8058 one-click
 *
 * No login is required: the token is HMAC-signed against the contact id
 * (`lib/contactUnsubscribe.ts`) so we can flip the flag in a single round
 * trip without exposing arbitrary contact ids.
 */

function htmlPage(opts: {
  title: string;
  heading: string;
  message: string;
  status?: number;
}): NextResponse {
  const { title, heading, message, status = 200 } = opts;
  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #F8FAFC; color: #111;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
      .card { background: #fff; max-width: 480px; width: 100%; padding: 32px; border-radius: 12px;
              box-shadow: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04); }
      h1 { font-size: 18px; margin: 0 0 12px; }
      p { font-size: 14px; line-height: 1.6; color: #334155; margin: 8px 0; }
      .muted { color: #64748B; font-size: 12px; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      <p class="muted">If this was a mistake, contact whoever sent you the email and they can re-enable notifications for you.</p>
    </div>
  </body>
</html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function applyOptOut(token: string | null): Promise<{
  ok: boolean;
  status: number;
  heading: string;
  message: string;
}> {
  if (!token) {
    return {
      ok: false,
      status: 400,
      heading: "Unsubscribe link missing",
      message: "This unsubscribe link is missing its token. Open the link from your email exactly as it was sent.",
    };
  }
  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return {
      ok: false,
      status: 400,
      heading: "Unsubscribe link invalid",
      message: "We couldn't verify this unsubscribe link. It may have been edited or expired.",
    };
  }
  const contact = await prisma.contact.findUnique({
    where: { id: verified.contactId },
    select: { id: true, name: true, emailOptOut: true },
  });
  if (!contact) {
    // Treat as success from the recipient's POV — there's nothing to email.
    return {
      ok: true,
      status: 200,
      heading: "You're unsubscribed",
      message: "We don't have a record of this contact anymore, so no further emails will be sent.",
    };
  }
  if (!contact.emailOptOut) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { emailOptOut: true, emailOptOutAt: new Date() },
    });
  }
  return {
    ok: true,
    status: 200,
    heading: "You've been unsubscribed",
    message: `${contact.name ? contact.name + ", you" : "You"} won't receive further notification emails from us.`,
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const result = await applyOptOut(token);
  return htmlPage({
    title: result.ok ? "Unsubscribed" : "Unsubscribe failed",
    heading: result.heading,
    message: result.message,
    status: result.status,
  });
}

/**
 * RFC 8058 one-click unsubscribe. The mail provider (Gmail, Apple) POSTs
 * directly to the URL listed in `List-Unsubscribe` with the form body
 * `List-Unsubscribe=One-Click`. We accept either a query-string token or a
 * `token` form field.
 */
export async function POST(req: NextRequest) {
  let token = req.nextUrl.searchParams.get("token");
  if (!token) {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const form = await req.formData();
        const v = form.get("token");
        if (typeof v === "string") token = v;
      } else if (ct.includes("application/json")) {
        const body = (await req.json().catch(() => ({}))) as { token?: string };
        if (typeof body?.token === "string") token = body.token;
      }
    } catch {
      // fall through with whatever we have
    }
  }
  const result = await applyOptOut(token);
  return NextResponse.json(
    { ok: result.ok, message: result.message },
    { status: result.status }
  );
}
