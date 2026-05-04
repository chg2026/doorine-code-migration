import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { newPassword?: unknown };
  try {
    body = (await req.json()) as { newPassword?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "password_too_short", message: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (newPassword.length > 256) {
    return NextResponse.json({ error: "password_too_long" }, { status: 400 });
  }

  // Use the *user-scoped* Supabase client so updateUser acts as the logged-in
  // user (not the service role, which would 403 on auth.updateUser without a
  // matching admin endpoint).
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error("[api/account/password] update failed:", error.message);
    return NextResponse.json(
      { error: "update_failed", message: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
