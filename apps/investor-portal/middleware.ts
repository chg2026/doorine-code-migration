import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/user",
  "/api/logout",
  "/api/health",
];

const CHG_REHAB_BASE_URL = process.env.CHG_REHAB_BASE_URL || "";

/**
 * Auth gate for investor-portal. Refreshes Supabase tokens, then verifies
 * the user holds `is_investor = true`. Operators (chg-rehab users) get
 * redirected to chg-rehab's /login — they don't belong here.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

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

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify is_investor server-side via service role.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey) {
    const admin = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_investor")
      .eq("id", user.id)
      .maybeSingle<{ is_investor: boolean | null }>();

    if (!profile?.is_investor) {
      // Operator (or unknown) trying to use the investor portal — kick out.
      await supabase.auth.signOut().catch(() => undefined);
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "wrong_role", message: "This account is not an investor account." },
          { status: 403 }
        );
      }
      // Redirect to chg-rehab login if we know its URL, otherwise back to /login here.
      const target = CHG_REHAB_BASE_URL
        ? `${CHG_REHAB_BASE_URL.replace(/\/+$/, "")}/login?error=${encodeURIComponent("Use the operator portal")}`
        : `/login?error=${encodeURIComponent("This account is not an investor account.")}`;
      return NextResponse.redirect(target);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
