import crypto from "node:crypto";

/**
 * Signed unsubscribe tokens for outbound contractor / vendor emails.
 *
 * Tokens are HMAC-signed `<contactId>.<sig>` strings — no DB lookup is needed
 * to verify, so the unsubscribe endpoint can flip the opt-out flag in a single
 * round trip and works without an active session (CAN-SPAM and Resend both
 * expect the link to land directly on a confirmation page).
 */

const ALG = "sha256";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Match the dev-only fallback used in lib/session.ts so links generated in
  // dev still verify after a restart. In production SESSION_SECRET is set.
  return "dev-only-insecure-secret-change-me-please-32chars";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(contactId: string): string {
  return b64url(crypto.createHmac(ALG, getSecret()).update(contactId).digest());
}

export function signUnsubscribeToken(contactId: string): string {
  return `${contactId}.${sign(contactId)}`;
}

export function verifyUnsubscribeToken(token: string): { contactId: string } | null {
  if (typeof token !== "string") return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0 || idx >= token.length - 1) return null;
  const contactId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(contactId);
  // Constant-time comparison to avoid token forgery via timing leaks.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return { contactId };
}

/**
 * Resolve the public origin used to build unsubscribe links from the
 * notification dispatcher (which has no incoming request to read forwarded
 * headers from). Falls back through the env vars Replit / Next set in dev and
 * production.
 *
 * Source priority:
 *   1. APP_BASE_URL          — explicit override (preferred in production)
 *   2. NEXT_PUBLIC_APP_URL   — alternate explicit override
 *   3. REPLIT_DOMAINS        — Replit deployment domain(s)
 *   4. REPLIT_DEV_DOMAIN     — Replit dev workspace domain (last-resort)
 */
export type PublicAppOriginSource =
  | "APP_BASE_URL"
  | "NEXT_PUBLIC_APP_URL"
  | "REPLIT_DOMAINS"
  | "REPLIT_DEV_DOMAIN";

export type PublicAppOriginInfo = {
  origin: string | null;
  source: PublicAppOriginSource | null;
};

export function resolvePublicAppOrigin(): PublicAppOriginInfo {
  const appBase = process.env.APP_BASE_URL;
  if (appBase && appBase.trim()) {
    return { origin: appBase.trim().replace(/\/+$/, ""), source: "APP_BASE_URL" };
  }
  const nextPublic = process.env.NEXT_PUBLIC_APP_URL;
  if (nextPublic && nextPublic.trim()) {
    return { origin: nextPublic.trim().replace(/\/+$/, ""), source: "NEXT_PUBLIC_APP_URL" };
  }
  const replit = process.env.REPLIT_DOMAINS;
  if (replit) {
    const first = replit.split(",")[0]?.trim();
    if (first) return { origin: `https://${first}`, source: "REPLIT_DOMAINS" };
  }
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev && dev.trim()) {
    return { origin: `https://${dev.trim()}`, source: "REPLIT_DEV_DOMAIN" };
  }
  return { origin: null, source: null };
}

export function publicAppOrigin(): string | null {
  return resolvePublicAppOrigin().origin;
}

export function buildUnsubscribeUrl(contactId: string): string | null {
  const origin = publicAppOrigin();
  if (!origin) return null;
  return `${origin}/api/contacts/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(contactId))}`;
}

/**
 * Diagnostic snapshot for the admin Notifications panel and for the boot-time
 * sanity log. `sampleUrl` is built against a synthetic contact id so admins
 * can see exactly what an unsubscribe link will look like, without needing a
 * real contact in the system.
 */
export type UnsubscribeLinkDiagnostic = {
  ok: boolean;
  origin: string | null;
  source: PublicAppOriginSource | null;
  sampleUrl: string | null;
  reason: string | null;
};

export function getUnsubscribeLinkDiagnostic(): UnsubscribeLinkDiagnostic {
  const { origin, source } = resolvePublicAppOrigin();
  if (!origin) {
    return {
      ok: false,
      origin: null,
      source: null,
      sampleUrl: null,
      reason:
        "No public base URL is configured. Set APP_BASE_URL in the deployment environment so outbound emails can include a working unsubscribe link.",
    };
  }
  return {
    ok: true,
    origin,
    source,
    sampleUrl: `${origin}/api/contacts/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken("sample-contact-id"))}`,
    reason: null,
  };
}
