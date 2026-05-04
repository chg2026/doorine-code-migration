import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => res.cookies.set(name, value, options as CookieOptions)); },
      },
    }
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  try {
    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_contractor")
      .eq("id", data.user.id)
      .maybeSingle<{ is_contractor: boolean | null }>();
    if (!profile?.is_contractor) {
      await supabase.auth.signOut().catch(() => undefined);
      return NextResponse.json({ error: "wrong_role", message: "This account is not a contractor account." }, { status: 403 });
    }
  } catch (err) {
    console.error("[auth/login] role check failed", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
  return res;
}
