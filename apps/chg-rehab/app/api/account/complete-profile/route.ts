import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Recompute and persist the caller's profile_score using the apps/crm rubric.
 * Returns the freshly computed score. Useful for clients that want to drive
 * the global completion banner forward without doing a full PUT to /profile.
 *
 * Note: this endpoint intentionally ignores any request body and recomputes
 * the score from persisted user_profiles + accounts state. Clients that need
 * to mutate fields should call PUT /api/account/profile first, which itself
 * recomputes and returns the new score.
 */
export async function PATCH() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .select("full_name, email, avatar_url, accounts ( name )")
    .eq("id", user.id)
    .maybeSingle<{
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
      accounts:
        | { name: string | null }
        | { name: string | null }[]
        | null;
    }>();
  if (error) {
    console.error("[api/account/complete-profile] load failed:", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const accountRow = Array.isArray(data?.accounts)
    ? data?.accounts?.[0] ?? null
    : data?.accounts ?? null;

  let score = 0;
  if (data?.full_name?.trim()) score += 40;
  if (data?.email?.trim()) score += 25;
  if (accountRow?.name?.trim()) score += 20;
  if (data?.avatar_url?.trim()) score += 15;
  score = Math.min(100, score);

  const { error: upErr } = await admin
    .from("user_profiles")
    .update({ profile_score: score })
    .eq("id", user.id);
  if (upErr) {
    console.error("[api/account/complete-profile] update failed:", upErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ profile_score: score });
}
