import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const PHONE_RE = /^\+1[2-9]\d{9}$/;

/**
 * Public — no auth required. Triggers Supabase to send an SMS OTP.
 *
 * Mirrors apps/crm's `/api/auth/phone/send-otp` but skips the Postgres
 * `signup_attempts` rate-limiter (that table lives in the Supabase project,
 * is shared across products, and the apps/crm endpoint already enforces it
 * for the same phone numbers; double-counting from CHG Rehab would just
 * make the limit appear stricter than intended).
 */
export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const phone = (body.phone || "").trim();
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json(
      { error: "Valid US phone number required (+1XXXXXXXXXX)." },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return NextResponse.json({ error: "Auth not configured on server." }, { status: 503 });
  }

  // Use the admin client to issue the OTP — it carries the service role,
  // which Supabase accepts for `signInWithOtp` the same way the anon key
  // does, and it avoids spinning up a second client.
  const { error } = await admin.auth.signInWithOtp({ phone });
  if (error) {
    console.error("[auth/phone/send-otp]", error.message);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
