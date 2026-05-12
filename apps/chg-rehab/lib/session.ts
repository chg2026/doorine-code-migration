import type { SessionOptions } from "iron-session";

/**
 * Shape returned by `getCurrentUser()`. Auth identity is sourced from the
 * Supabase session cookie; this is just the chg-rehab projection of the
 * matching Prisma `User` row.
 */
export interface SessionUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role: string;
  companyId: string;
  /**
   * Supabase `user_profiles.profile_score` (0–100). Surfaced on the session
   * so the global ProfileCompletionBanner can render without an extra
   * round-trip on every layout.
   */
  profileScore?: number | null;
  /**
   * Mirrors `user_profiles.is_super_admin`. Drives the conditional "Super
   * Admin" tab in TopNav and gates the `/super-admin` page + every
   * `/api/super-admin/*` route.
   */
  isSuperAdmin?: boolean;
  /**
   * Mirrors `user_profiles.is_investor`. When true, the Investor Portal tile
   * is shown in the app switcher so dual-role users can navigate there
   * without re-authenticating.
   */
  isInvestor?: boolean;
  /**
   * Mirrors `user_profiles.is_contractor`. When true, the Contractor Portal
   * tile is shown in the app switcher for dual-role users.
   */
  isContractor?: boolean;
  /**
   * Active product codes (from `account_products` joined to `products`) for
   * this user's account. Drives App Switcher visibility based on entitlements
   * rather than per-user role flags.
   */
  accountProducts: string[];
}

/**
 * Iron-session payload. After the Supabase auth swap, the only thing we
 * still keep here is `pendingInviteToken` — the bridge cookie that carries
 * an invite token from `/api/invites/accept` through `/login` and gets
 * consumed on the next successful sign-in.
 */
export interface AppSession {
  pendingInviteToken?: string;
}

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.warn("[session] SESSION_SECRET is missing or too short (need 32+ chars).");
}

export const sessionOptions: SessionOptions = {
  cookieName: "chg_session",
  password: secret || "dev-only-insecure-secret-change-me-please-32chars",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};
