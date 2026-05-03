import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
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
    pathname.startsWith("/api/auth/user") ||
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

  // Cross-app role check via service role (bypasses RLS). Always derive
  // is_investor from the canonical user_profiles row, never trust client.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!serviceKey || !supabaseUrl) {
    console.error("[investor-portal middleware] service role key missing — denying");
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "service_unconfigured" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/login?error=service_unconfigured", req.url));
  }

  const admin = createPlainClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_investor")
    .eq("id", user.id)
    .maybeSingle<{ is_investor: boolean | null }>();

  if (!profile?.is_investor) {
    // Not an investor — bounce to chg-rehab login (preferred) or local login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "not_an_investor" }, { status: 403 });
    }
    if (CHG_REHAB_BASE_URL) {
      const url = new URL("/login", CHG_REHAB_BASE_URL);
      url.searchParams.set("error", "Use the operator login at chg-rehab.");
      return NextResponse.redirect(url);
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "This account is not an investor.");
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
