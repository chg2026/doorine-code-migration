import { NextResponse } from "next/server";
import { getCurrentContractor } from "@/lib/auth";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const contractor = await getCurrentContractor();
  if (contractor) return NextResponse.json({ contractor });

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ contractor: null }, { status: 401 });
  try {
    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_contractor")
      .eq("id", user.id)
      .maybeSingle<{ is_contractor: boolean | null }>();
    if (!profile?.is_contractor) {
      return NextResponse.json({ contractor: null, error: "wrong_role", message: "This account is not a contractor account." }, { status: 403 });
    }
  } catch (err) {
    console.error("[auth/user] role check failed", err);
  }
  return NextResponse.json({ contractor: null }, { status: 401 });
}
