import * as client from "openid-client";
import memoize from "memoizee";
import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import type { IronSession } from "iron-session";
import { sessionOptions, type AppSession, type SessionUser } from "./session";
import { prisma } from "./prisma";
import type { NextRequest } from "next/server";

if (!process.env.REPL_ID) {
  console.warn("[auth] REPL_ID env var not set — Replit Auth will not work.");
}

const ISSUER_URL = process.env.ISSUER_URL || "https://replit.com/oidc";

export const getOidcConfig = memoize(
  async () => {
    return client.discovery(new URL(ISSUER_URL), process.env.REPL_ID || "");
  },
  { maxAge: 60 * 60 * 1000 }
);

/**
 * Returns the public-facing origin (scheme://host[:port]) for this request.
 * Behind the Replit proxy `req.url` reflects the internal bind address
 * (e.g. https://0.0.0.0:3000), so we must build URLs from the forwarded
 * headers instead.
 *
 * Resolution order:
 *   1. APP_BASE_URL env (explicit override; intended for the production
 *      deployment, where the registered OIDC redirect_uri must match a
 *      stable canonical domain. Leave unset in dev.)
 *   2. x-forwarded-{proto,host} (+ x-forwarded-port when non-default).
 *   3. Replit dev fallback: `https://${REPLIT_DEV_DOMAIN}:${PORT}`. Used
 *      when running in the Replit dev preview, where the edge proxy
 *      strips the external port from x-forwarded-host. REPLIT_DEV_DOMAIN
 *      is auto-provided per repl, so this self-heals across clones.
 *   4. host header (last resort).
 */
export function publicOrigin(req: NextRequest | { headers: Headers }): string {
  const override = process.env.APP_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  const xfHost = req.headers.get("x-forwarded-host");
  const hostHeader = xfHost || req.headers.get("host") || "";
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (hostHeader.includes("localhost") ||
    hostHeader.startsWith("0.") ||
    hostHeader.startsWith("127.")
      ? "http"
      : "https");

  // If the forwarded host already has a :port suffix, trust it.
  if (/:\d+$/.test(hostHeader)) {
    return `${proto}://${hostHeader}`;
  }

  // If x-forwarded-port is present and non-default, append it.
  const xfPort = req.headers.get("x-forwarded-port");
  const xfPortNum = xfPort ? Number(xfPort) : NaN;
  const xfIsDefault =
    (proto === "https" && xfPortNum === 443) ||
    (proto === "http" && xfPortNum === 80);
  if (xfPort && !Number.isNaN(xfPortNum) && !xfIsDefault) {
    return `${proto}://${hostHeader}:${xfPort}`;
  }

  // Replit dev fallback: the edge proxy strips :PORT from x-forwarded-host,
  // so reconstruct from the auto-provided REPLIT_DEV_DOMAIN + this app's
  // bind PORT. Skipped in production so the production canonical host
  // (e.g. an autoscale .replit.app) is used unchanged.
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain && process.env.NODE_ENV !== "production") {
    const port = Number(process.env.PORT) || 3000;
    if (port !== 443 && port !== 80) {
      return `https://${devDomain}:${port}`;
    }
    return `https://${devDomain}`;
  }

  return `${proto}://${hostHeader}`;
}

export function publicUrl(req: NextRequest | { headers: Headers }, path: string): string {
  const origin = publicOrigin(req);
  if (!path.startsWith("/")) path = `/${path}`;
  return `${origin}${path}`;
}

export function buildCallbackUrl(req: NextRequest | { headers: Headers }): string {
  return `${publicOrigin(req)}/api/callback`;
}

export async function getSessionFromCookies(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  // Build a Request-like + Response-like object iron-session understands.
  const fakeReq = { headers: { cookie: cookieStore.toString() } } as any;
  const fakeRes = {
    getHeader: () => undefined,
    setHeader: () => undefined,
    appendHeader: () => undefined,
  } as any;
  return getIronSession<AppSession>(fakeReq, fakeRes, sessionOptions);
}

/**
 * Returns the current user, with role/companyId always read fresh from the
 * DB so role changes (or company moves) take effect immediately — the
 * session cookie is not the source of truth for authorization. If the user
 * was deleted out from under the session we return null and clear the
 * session so subsequent requests behave as logged-out.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSessionFromCookies();
  const sessionUser = session.user;
  if (!sessionUser) return null;

  const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!dbUser || !dbUser.active) {
    // Treat deactivated/removed users the same as deleted ones — clear the
    // session so subsequent requests behave as logged-out and any cached
    // client state is invalidated on next /api/auth/user fetch.
    session.user = undefined;
    await session.save().catch(() => undefined);
    return null;
  }

  const fresh = toSessionUser(dbUser);

  // Keep the session cookie in sync so the client (which reads
  // /api/auth/user) sees up-to-date role + identity without a re-login.
  if (
    sessionUser.role !== fresh.role ||
    sessionUser.companyId !== fresh.companyId ||
    sessionUser.email !== fresh.email ||
    sessionUser.firstName !== fresh.firstName ||
    sessionUser.lastName !== fresh.lastName ||
    sessionUser.profileImageUrl !== fresh.profileImageUrl
  ) {
    session.user = fresh;
    await session.save().catch(() => undefined);
  }

  return fresh;
}

/**
 * Upsert a user into the DB after a successful Replit Auth login.
 * Auto-creates a default company for first-time users (single-tenant per Replit user
 * on first signup; admins can later invite teammates into their company).
 */
export async function upsertUserFromClaims(
  claims: {
    sub: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_image_url?: string;
  },
  options?: { inviteToken?: string }
): Promise<SessionUser> {
  const existing = await prisma.user.findUnique({ where: { id: claims.sub } });

  if (existing) {
    if (!existing.active) {
      // Removed users can't sign back in. Surface a clear error to the
      // OIDC callback so the user lands on /login with a useful message
      // instead of silently bouncing in a redirect loop.
      throw new Error("user_deactivated");
    }
    const updated = await prisma.user.update({
      where: { id: claims.sub },
      data: {
        email: claims.email ?? existing.email,
        firstName: claims.first_name ?? existing.firstName,
        lastName: claims.last_name ?? existing.lastName,
        profileImageUrl: claims.profile_image_url ?? existing.profileImageUrl,
      },
    });
    // Existing users can't be moved between companies via an invite.
    // Leave the invite Pending so the *intended* recipient can still claim
    // it on their first login — if the wrong logged-in person (e.g. the
    // admin clicking their own forwarded copy) follows the link, we just
    // ignore the token rather than silently invalidating the invite.
    return toSessionUser(updated);
  }

  // First login: optionally consume a pending invite that matches the email
  let invite = null as Awaited<ReturnType<typeof prisma.invite.findUnique>> | null;
  if (options?.inviteToken) {
    invite = await prisma.invite.findUnique({ where: { token: options.inviteToken } });
    if (invite) {
      const emailMatches =
        !!claims.email &&
        invite.email.toLowerCase() === claims.email.toLowerCase();
      const usable =
        invite.status === "Pending" && invite.expiresAt.getTime() > Date.now();
      if (!emailMatches || !usable) invite = null;
    }
  }

  const fullName =
    [claims.first_name, claims.last_name].filter(Boolean).join(" ") ||
    claims.email?.split("@")[0] ||
    "New User";

  const initials =
    [(claims.first_name || "")[0], (claims.last_name || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (claims.email || "U")[0].toUpperCase();

  if (invite) {
    const inv = invite;
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          id: claims.sub,
          companyId: inv.companyId,
          email: claims.email,
          firstName: claims.first_name,
          lastName: claims.last_name,
          profileImageUrl: claims.profile_image_url,
          role: inv.role,
          initials,
        },
      });
      await tx.invite.update({
        where: { id: inv.id },
        data: {
          status: "Accepted",
          acceptedAt: new Date(),
          acceptedById: u.id,
        },
      });
      await tx.activityLogEntry.create({
        data: {
          companyId: inv.companyId,
          actorId: u.id,
          action: "user_invite_accepted",
          entity: "User",
          entityId: u.id,
          message: `${fullName} joined the team as ${inv.role}`,
          meta: { email: claims.email, role: inv.role, inviteId: inv.id },
        },
      });
      return u;
    });
    return toSessionUser(created);
  }

  // No invite: create a brand new company with this user as Admin
  const company = await prisma.company.create({
    data: {
      name: `${fullName}'s Company`,
      settings: { create: { strictGate: true, coiThresholdDays: 60 } },
    },
  });

  const created = await prisma.user.create({
    data: {
      id: claims.sub,
      companyId: company.id,
      email: claims.email,
      firstName: claims.first_name,
      lastName: claims.last_name,
      profileImageUrl: claims.profile_image_url,
      role: "Admin",
      initials,
    },
  });
  return toSessionUser(created);
}

function toSessionUser(u: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  companyId: string;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    profileImageUrl: u.profileImageUrl,
    role: u.role,
    companyId: u.companyId,
  };
}

export { client as openidClient };
