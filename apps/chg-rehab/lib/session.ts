import type { SessionOptions } from "iron-session";

export interface SessionUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role: string;
  companyId: string;
}

export interface AppSession {
  user?: SessionUser;
  // Tokens for refresh / logout
  tokens?: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_at?: number; // epoch seconds
  };
  // Transient OIDC flow state
  oidc?: {
    state: string;
    codeVerifier: string;
    nonce?: string;
    redirectAfter?: string;
    callbackUrl: string;
  };
  // Pending invite token to apply after the next successful login
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
