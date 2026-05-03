import { headers } from "next/headers";
import { prisma } from "./prisma";
import { getSupabaseServerClient, getSupabaseAdminClient } from "./supabaseServer";
import type { SessionInvestor } from "./session";
import type { Investor } from "@prisma/client";

/**
 * Resolve the current investor from the Supabase session cookie, ensuring a
 * matching Prisma `Investor` row exists (shadow-syncing from `user_profiles`
 * on first sign-in). Returns null for logged-out users OR users whose
 * `user_profiles.is_investor` flag is not true — callers should treat that
 * as "not an investor session" and redirect to login.
 *
 * Memoised per-request via the `headers()` identity (same trick as
 * chg-rehab's `getCurrentUser`).
 */
const investorCache = new WeakMap<Headers, SessionInvestor | null>();

export async function getCurrentInvestor(): Promise<SessionInvestor | null> {
  const h = await headers();
  const cached = investorCache.get(h);
  if (cached !== undefined) return cached;

  const result = await resolveCurrentInvestor();
  investorCache.set(h, result);
  return result;
}

async function resolveCurrentInvestor(): Promise<SessionInvestor | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user: supaUser } } = await supabase.auth.getUser();
  if (!supaUser) return null;

  // Always re-derive `is_investor` from the canonical Supabase row (never
  // trust query params or session-bound caches). This is the cross-app
  // security boundary.
  const admin = getSupabaseAdminClient();
  type UserProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    account_id: string | null;
    is_investor: boolean | null;
    status: string | null;
  };
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("id, email, full_name, phone, account_id, is_investor, status")
    .eq("id", supaUser.id)
    .maybeSingle<UserProfileRow>();
  if (error) {
    console.error("[investor-auth] failed to load user_profile for", supaUser.id, error.message);
    return null;
  }
  if (!profile || !profile.is_investor) return null;
  if (profile.status === "suspended") return null;

  const accountId = profile.account_id;
  if (!accountId) {
    console.warn("[investor-auth] investor has no account_id", supaUser.id);
    return null;
  }

  const existing = await prisma.investor.findUnique({ where: { id: supaUser.id } });
  if (existing) {
    // Refresh trivial drift (email/name/phone) and bump portalLastLoginAt.
    const fullName = (profile.full_name || "").trim();
    const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
    const lastName = rest.length ? rest.join(" ") : null;
    const nextEmail = profile.email ?? supaUser.email ?? existing.email;
    const updated = await prisma.investor.update({
      where: { id: existing.id },
      data: {
        email: nextEmail,
        firstName: firstName || existing.firstName,
        lastName: lastName ?? existing.lastName,
        phone: profile.phone ?? existing.phone,
        portalLastLoginAt: new Date(),
      },
    });
    return toSessionInvestor(updated);
  }

  // First sign-in: bootstrap the Investor row from user_profiles.
  const fullName = (profile.full_name || "").trim();
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
  const lastName = rest.length ? rest.join(" ") : null;

  const created = await prisma.investor.create({
    data: {
      id: supaUser.id,
      companyId: accountId,
      email: profile.email ?? supaUser.email ?? null,
      firstName: firstName || null,
      lastName,
      phone: profile.phone ?? null,
      portalLastLoginAt: new Date(),
    },
  });
  return toSessionInvestor(created);
}

function toSessionInvestor(i: Investor): SessionInvestor {
  return {
    id: i.id,
    email: i.email,
    firstName: i.firstName,
    lastName: i.lastName,
    companyId: i.companyId,
    status: i.status,
    accreditedStatus: i.accreditedStatus,
  };
}
