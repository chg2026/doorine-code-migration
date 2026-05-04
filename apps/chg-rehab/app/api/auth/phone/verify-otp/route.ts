import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const dynamic = "force-dynamic";

/**
 * Public — no auth required. Verifies an SMS OTP via Supabase, sets the
 * server-side session cookies, and returns the session payload so the
 * browser client can hydrate too.
 *
 * On a brand-new phone-only user with no `user_profiles` row, the response
 * still succeeds (the user IS authenticated in Supabase). The chg-rehab
 * `getCurrentUser()` helper will then warn that the profile is missing and
 * report the user as logged-out — that's the expected handoff to the
 * platform team to repair the profile, since CHG Rehab doesn't manage
 * Supabase profile creation in Phase 1 (apps/crm signup still does).
 */
export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const phone = (body.phone || "").trim();
  const code = (body.code || "").trim();
  if (!phone || !code) {
    return NextResponse.json({ error: "Phone and code are required." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options as CookieOptions);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });
  if (error || !data.session) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
  }

  // Replace the body of the response we already wired cookies to. We can't
  // mutate NextResponse bodies in place, so build a fresh one and copy the
  // Set-Cookie headers across.
  const final = NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
  res.cookies.getAll().forEach((c) => {
    final.cookies.set(c.name, c.value, c as CookieOptions);
  });
  return final;
}
