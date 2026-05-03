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
