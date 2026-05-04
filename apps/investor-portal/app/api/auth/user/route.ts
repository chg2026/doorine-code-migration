import { NextResponse } from "next/server";
import { getCurrentInvestor } from "@/lib/auth";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const investor = await getCurrentInvestor();
  if (investor) {
    return NextResponse.json({ investor });
  }

  // Distinguish "no session at all" (401) from "logged in as the wrong
  // role" (403) so the login client can show a clear error and sign out.
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ investor: null }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_investor")
      .eq("id", user.id)
      .maybeSingle<{ is_investor: boolean | null }>();
    if (!profile?.is_investor) {
      return NextResponse.json(
        { investor: null, error: "wrong_role", message: "This account is not an investor account." },
        { status: 403 }
      );
    }
  } catch (err) {
    console.error("[auth/user] role check failed", err);
  }

  return NextResponse.json({ investor: null }, { status: 401 });
}
