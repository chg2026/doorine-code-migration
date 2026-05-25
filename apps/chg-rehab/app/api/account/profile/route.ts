import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  profile_score: number | null;
  accounts:
    | { name: string | null; plan_tier: string | null }
    | { name: string | null; plan_tier: string | null }[]
    | null;
};

function readAccount(profile: ProfileRow): { name: string | null; planTier: string | null } {
  const a = Array.isArray(profile.accounts) ? profile.accounts[0] ?? null : profile.accounts;
  return { name: a?.name ?? null, planTier: a?.plan_tier ?? null };
}

/**
 * Recompute profile_score using the same rubric as apps/crm:
 *   40 pts full_name, 25 pts email, 20 pts company name, 15 pts avatar_url.
 */
function computeScore(opts: {
  fullName: string | null;
  email: string | null;
  accountName: string | null;
  avatarUrl: string | null;
}): number {
  let s = 0;
  if (opts.fullName && opts.fullName.trim()) s += 40;
  if (opts.email && opts.email.trim()) s += 25;
  if (opts.accountName && opts.accountName.trim()) s += 20;
  if (opts.avatarUrl && opts.avatarUrl.trim()) s += 15;
  return Math.min(100, s);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .select("full_name, phone, email, avatar_url, profile_score, accounts ( name, plan_tier )")
    .eq("email", user.email ?? "")
    .maybeSingle<ProfileRow>();
  if (error) {
    console.error("[api/account/profile] GET failed:", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const account = data ? readAccount(data) : { name: null, planTier: null };
  return NextResponse.json({
    fullName: data?.full_name ?? "",
    phone: data?.phone ?? "",
    email: data?.email ?? user.email ?? null,
    avatarUrl: data?.avatar_url ?? null,
    accountName: account.name,
    planTier: account.planTier,
    role: user.role,
    profileScore: data?.profile_score ?? null,
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fullName?: unknown; phone?: unknown };
  try {
    body = (await req.json()) as { fullName?: unknown; phone?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim().slice(0, 200) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 60) : "";

  const admin = getSupabaseAdminClient();

  // Load current row so we can recompute score with all four inputs.
  const { data: current, error: selErr } = await admin
    .from("user_profiles")
    .select("email, avatar_url, accounts ( name )")
    .eq("email", user.email ?? "")
    .maybeSingle<{ email: string | null; avatar_url: string | null; accounts: { name: string | null } | { name: string | null }[] | null }>();
  if (selErr) {
    console.error("[api/account/profile] PUT load failed:", selErr.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const accountRow = Array.isArray(current?.accounts)
    ? current?.accounts?.[0] ?? null
    : current?.accounts ?? null;

  const profileScore = computeScore({
    fullName: fullName || null,
    email: current?.email ?? user.email ?? null,
    accountName: accountRow?.name ?? null,
    avatarUrl: current?.avatar_url ?? null,
  });

  const { error: upErr } = await admin
    .from("user_profiles")
    .update({
      full_name: fullName || null,
      phone: phone || null,
      profile_score: profileScore,
    })
    .eq("email", user.email ?? "");
  if (upErr) {
    console.error("[api/account/profile] PUT update failed:", upErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Shadow-sync into Prisma User.firstName/lastName, same heuristic the auth
  // layer uses on first sign-in.
  const trimmed = fullName.trim();
  const [firstName, ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const lastName = rest.length ? rest.join(" ") : null;
  const initials =
    [(firstName || "")[0], (lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (current?.email || user.email || "U")[0].toUpperCase();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName: firstName || null,
      lastName,
      initials,
    },
  });

  return NextResponse.json({
    ok: true,
    fullName,
    phone,
    profileScore,
  });
}
