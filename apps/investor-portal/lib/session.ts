import type { SessionOptions } from "iron-session";

/**
 * Investor identity surfaced to UI/route handlers. Sourced from the Supabase
 * session and the matching Prisma `Investor` row.
 */
export interface SessionInvestor {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  companyId: string;
  status: string;
  accreditedStatus: string;
  /**
   * Product codes this investor's account is entitled to (from
   * `account_products` joined to `products`). Drives the AppSwitcher's
   * visibility gating across CHG, Deal Link, Investor Portal, etc.
   */
  accountProducts: string[];
}

/**
 * Iron-session payload. Reserved for invite-token bridging in Phase 2.
 */
export interface AppSession {
  pendingInviteToken?: string;
}

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.warn("[session] SESSION_SECRET is missing or too short (need 32+ chars).");
}

export const sessionOptions: SessionOptions = {
  cookieName: "investor_session",
  password: secret || "dev-only-insecure-secret-change-me-please-32chars",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};
