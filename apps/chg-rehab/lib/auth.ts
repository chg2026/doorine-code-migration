import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import type { IronSession } from "iron-session";
import { sessionOptions, type AppSession, type SessionUser } from "./session";
import { prisma } from "./prisma";
import { getSupabaseServerClient, getSupabaseAdminClient } from "./supabaseServer";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";

/**
 * Returns the public-facing origin (scheme://host[:port]) for this request.
 * Behind the Replit proxy `req.url` reflects the internal bind address
 * (e.g. https://0.0.0.0:3000), so we must build URLs from the forwarded
 * headers instead.
 *
 * Resolution order:
 *   1. APP_BASE_URL env (explicit override; intended for the production
 *      deployment, where the canonical domain is stable. Leave unset in dev.)
 *   2. x-forwarded-{proto,host} (+ x-forwarded-port when non-default).
 *   3. Replit dev fallback: `https://${REPLIT_DEV_DOMAIN}:${PORT}`.
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

  if (/:\d+$/.test(hostHeader)) {
    return `${proto}://${hostHeader}`;
  }

  const xfPort = req.headers.get("x-forwarded-port");
  const xfPortNum = xfPort ? Number(xfPort) : NaN;
  const xfIsDefault =
    (proto === "https" && xfPortNum === 443) ||
    (proto === "http" && xfPortNum === 80);
  if (xfPort && !Number.isNaN(xfPortNum) && !xfIsDefault) {
    return `${proto}://${hostHeader}:${xfPort}`;
  }

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

/**
 * Iron-session is kept around solely for the `pendingInviteToken` bridge
 * (invites/accept → /login → first-time Supabase sign-in). User identity
 * lives in the Supabase session cookie, not here.
 */
export async function getSessionFromCookies(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  // iron-session ships an Edge-runtime overload that takes a CookieStore
  // (the same shape next/headers' cookies() returns). Use that instead of
  // the Node req/res overload so we stay type-safe.
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}

/**
 * Map a Prisma User row into the SessionUser shape the rest of the app
 * (TopNav, /api/auth/user, all `getCurrentUser()` callers) consumes.
 */
function toSessionUser(u: User): SessionUser {
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

/**
 * Return the current user. Resolves the Supabase session, then ensures a
 * matching Prisma `User` row exists (shadow-syncing from `user_profiles` on
 * first sign-in). Returns null for logged-out / deactivated users so callers
 * keep their existing 401-or-redirect logic.
 *
 * Per-request memoization avoids the duplicate Prisma round-trip when both
 * `app/layout.tsx` and a child page/route call `getCurrentUser()` on the
 * same render.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Use the Headers identity as a per-request cache key (Next.js gives us
  // the same Headers instance throughout one request).
  const h = await headers();
  const cached = userCache.get(h);
  if (cached !== undefined) return cached;

  const result = await resolveCurrentUser();
  userCache.set(h, result);
  return result;
}

const userCache = new WeakMap<Headers, SessionUser | null>();

async function resolveCurrentUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user: supaUser } } = await supabase.auth.getUser();
  if (!supaUser) return null;

  const synced = await syncSupabaseUser(supaUser.id, supaUser.email ?? null, supaUser.phone ?? null);
  return synced;
}

/**
 * Ensure a Prisma User row exists for this Supabase user. On first sign-in
 * we read the matching `user_profiles` row (with the `accounts` join) via
 * the service role, then upsert a Prisma Company (id = account_id) and User
 * (id = auth.uid()). Subsequent calls just refresh role/email drift.
 *
 * Returns null when the user has been deactivated locally — callers treat
 * this the same as "no session" (the OIDC version did the same).
 */
async function syncSupabaseUser(
  authUserId: string,
  authEmail: string | null,
  authPhone: string | null
): Promise<SessionUser | null> {
  const existing = await prisma.user.findUnique({ where: { id: authUserId } });
  if (existing) {
    if (!existing.active) return null;
    return refreshFromSupabase(existing, authEmail);
  }

  // First Supabase sign-in for this user — pull profile + account from Supabase.
  const admin = getSupabaseAdminClient();
  type UserProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    account_id: string | null;
    is_super_admin: boolean | null;
    is_account_admin: boolean | null;
    status: string | null;
    // Supabase-js types embedded relationships as either an object or an
    // array depending on whether it inferred a 1-1 vs 1-N FK; we coerce
    // to the union here and normalise below.
    accounts: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  };
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("id, email, full_name, phone, avatar_url, account_id, is_super_admin, is_account_admin, status, accounts ( id, name )")
    .eq("id", authUserId)
    .maybeSingle<UserProfileRow>();
  if (error) {
    console.error("[auth] failed to load user_profile for", authUserId, error.message);
    return null;
  }
  if (!profile) {
    // Auth user exists but has no profile row. We can't safely create a
    // CHG-Rehab tenant from that; surface as "logged out" so middleware
    // bounces the user to /login (the Supabase profile must be repaired
    // on the platform side).
    console.warn("[auth] no user_profile row for auth user", authUserId);
    return null;
  }
  if (profile.status === "suspended") {
    return null;
  }

  const accountId: string | null = profile.account_id ?? null;
  if (!accountId) {
    console.warn("[auth] user_profile has no account_id", authUserId);
    return null;
  }

  // Derive the Prisma `UserRole`. The chg-rehab authorization layer only
  // really differentiates Admin vs everything-else (admin pages, billing
  // gates, invite/seat APIs all check `role === "Admin"`). Mirror Supabase's
  // `is_super_admin` / `is_account_admin` flags onto that.
  const isAdmin = !!(profile.is_super_admin || profile.is_account_admin);

  const fullName = (profile.full_name || "").trim();
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
  const lastName = rest.length ? rest.join(" ") : null;
  const initials =
    [(firstName || "")[0], (lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    (profile.email || authEmail || "U")[0].toUpperCase();

  const accountRow = Array.isArray(profile.accounts)
    ? profile.accounts[0] ?? null
    : profile.accounts;
  const accountName: string =
    accountRow?.name || fullName || profile.email || "CHG";

  // Apply pending invite if the email matches and the token is still valid.
  // The OIDC version did this in the callback handler; we do it here, on
  // the first synced login, instead.
  let inviteApplied: { invite: any } | null = null;
  const session = await getSessionFromCookies();
  const pendingToken = session.pendingInviteToken;
  if (pendingToken) {
    const invite = await prisma.invite.findUnique({ where: { token: pendingToken } });
    const targetEmail = (profile.email || authEmail || "").toLowerCase();
    if (
      invite &&
      invite.status === "Pending" &&
      invite.expiresAt.getTime() > Date.now() &&
      invite.email.toLowerCase() === targetEmail
    ) {
      inviteApplied = { invite };
    }
    // Either consumed or not applicable — clear the bridge cookie.
    session.pendingInviteToken = undefined;
    await session.save().catch(() => undefined);
  }

  const created = await prisma.$transaction(async (tx) => {
    if (inviteApplied) {
      // Invite path: join the inviting Company instead of creating one.
      const inv = inviteApplied.invite;
      const u = await tx.user.create({
        data: {
          id: authUserId,
          companyId: inv.companyId,
          email: profile.email ?? authEmail,
          firstName: firstName || null,
          lastName,
          profileImageUrl: profile.avatar_url ?? null,
          role: inv.role,
          initials,
        },
      });
      await tx.invite.update({
        where: { id: inv.id },
        data: { status: "Accepted", acceptedAt: new Date(), acceptedById: u.id },
      });
      await tx.activityLogEntry.create({
        data: {
          companyId: inv.companyId,
          actorId: u.id,
          action: "user_invite_accepted",
          entity: "User",
          entityId: u.id,
          message: `${fullName || u.email || "Teammate"} joined the team as ${inv.role}`,
          meta: { email: profile.email ?? authEmail, role: inv.role, inviteId: inv.id },
        },
      });
      return u;
    }

    // No invite — first user from this Supabase account. Make the Company
    // (using the Supabase account_id as the Prisma id, so the same Supabase
    // account always maps to the same Prisma Company) and the User as
    // Admin/PM based on the Supabase admin flags.
    await tx.company.upsert({
      where: { id: accountId },
      update: { name: accountName },
      create: {
        id: accountId,
        name: accountName,
        settings: { create: { strictGate: true, coiThresholdDays: 60 } },
      },
    });

    return tx.user.create({
      data: {
        id: authUserId,
        companyId: accountId,
        email: profile.email ?? authEmail,
        firstName: firstName || null,
        lastName,
        profileImageUrl: profile.avatar_url ?? null,
        role: isAdmin ? "Admin" : "ProjectManager",
        initials,
      },
    });
  });

  return toSessionUser(created);
}

/**
 * Sync trivial drift (email, name, profile image) from Supabase into the
 * Prisma row on every login so the chg-rehab UI stays in sync without
 * requiring a re-sync flow. Role is intentionally NOT auto-overwritten on
 * subsequent logins: chg-rehab admins can change a Prisma user's role from
 * `/admin/users` and we don't want Supabase's `is_account_admin` flag to
 * stomp that.
 */
async function refreshFromSupabase(existing: User, authEmail: string | null): Promise<SessionUser | null> {
  if (!existing.active) return null;

  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("email, full_name, avatar_url, status")
    .eq("id", existing.id)
    .maybeSingle();

  if (profile?.status === "suspended") return null;

  const fullName = (profile?.full_name || "").trim();
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
  const lastName = rest.length ? rest.join(" ") : null;

  const nextEmail = profile?.email ?? authEmail ?? existing.email;
  const nextFirst = firstName || existing.firstName;
  const nextLast = lastName ?? existing.lastName;
  const nextImg = profile?.avatar_url ?? existing.profileImageUrl;

  if (
    nextEmail !== existing.email ||
    nextFirst !== existing.firstName ||
    nextLast !== existing.lastName ||
    nextImg !== existing.profileImageUrl
  ) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: nextEmail,
        firstName: nextFirst,
        lastName: nextLast,
        profileImageUrl: nextImg,
      },
    });
    return toSessionUser(updated);
  }

  return toSessionUser(existing);
}
