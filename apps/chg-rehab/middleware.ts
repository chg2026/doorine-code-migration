import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const INVESTOR_PORTAL_BASE_URL = process.env.INVESTOR_PORTAL_BASE_URL || "";

const PUBLIC_PATHS = [
  "/login",
  "/phone-auth",
  "/api/auth/login",
  "/api/auth/phone/send-otp",
  "/api/auth/phone/verify-otp",
  "/api/logout",
  "/api/health",
  "/api/invites/accept",
  "/api/cron/notifications-sweep",
  "/api/contacts/unsubscribe",
  "/api/stripe/webhook",
];

/**
 * Auth gate. Refreshes Supabase tokens (so the session cookie doesn't
 * expire mid-session) and forwards logged-out users to `/login`.
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
    // API consumers expect JSON 401 (route handlers themselves return 401 in
    // the same shape). Page navigations redirect to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cross-app role check (Investor Portal). Always derive `is_investor`
  // server-side from `user_profiles` — never trust client state. Investors
  // belong on apps/investor-portal; bounce them out of chg-rehab.
  // Fail closed: if service-role config is missing, treat as a hard
  // misconfiguration rather than letting investors slip through.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!serviceKey || !supabaseUrl) {
    console.error(
      "[middleware] SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL missing — " +
        "cannot enforce investor cross-app boundary; refusing request"
    );
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "service_unavailable" },
        { status: 503 }
      );
    }
    return new NextResponse(
      "Service temporarily unavailable. Please contact support.",
      { status: 503 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  type ProfileFlags = {
    is_investor: boolean | null;
    is_contractor: boolean | null;
    is_super_admin: boolean | null;
  };
  const { data: profile, error: profileErr } = await admin
    .from("user_profiles")
    .select("is_investor, is_contractor, is_super_admin")
    .eq("id", user.id)
    .maybeSingle<ProfileFlags>();
  if (profileErr) {
    // Fail closed on lookup error — better to 503 than to leak cross-app.
    // If the error mentions "is_contractor", the migration at
    // supabase/migrations/20260301000000_user_profiles_is_contractor.sql
    // has not been applied yet. Run the SQL in the Supabase Dashboard.
    console.error(
      "[middleware] user_profiles lookup failed:",
      profileErr.message
    );
    if (profileErr.message.includes("is_contractor")) {
      console.error(
        "[middleware] MIGRATION REQUIRED: ALTER TABLE public.user_profiles " +
          "ADD COLUMN IF NOT EXISTS is_contractor boolean NOT NULL DEFAULT false; " +
          "— run this in the Supabase Dashboard > SQL Editor"
      );
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "service_unavailable" },
        { status: 503 }
      );
    }
    return new NextResponse(
      "Service temporarily unavailable. Please contact support.",
      { status: 503 }
    );
  }
  // Super-admins are allowed into CHG Rehab regardless of other role flags.
  // This lets admin test accounts that also carry is_investor / is_contractor
  // access the CRM and use the app switcher to reach the other portals.
  if (!profile?.is_super_admin) {
    if (profile?.is_investor) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "investor_account" }, { status: 403 });
      }
      const target = INVESTOR_PORTAL_BASE_URL
        ? new URL("/login", INVESTOR_PORTAL_BASE_URL)
        : new URL("/login?error=investor_account", req.url);
      target.searchParams.set(
        "error",
        "Investor accounts use the investor portal."
      );
      return NextResponse.redirect(target);
    }
    if (profile?.is_contractor) {
      // Contractor accounts belong on apps/contractor-portal, not chg-rehab.
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "contractor_account" }, { status: 403 });
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "Contractor accounts use the contractor portal.");
      return NextResponse.redirect(loginUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
