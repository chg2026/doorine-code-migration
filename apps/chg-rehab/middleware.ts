import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const INVESTOR_PORTAL_BASE_URL = process.env.INVESTOR_PORTAL_BASE_URL || "";

// Short-lived role-flags cache stored in a server-set HttpOnly cookie.
// Avoids the second Supabase round-trip (user_profiles lookup) on every
// request for already-authenticated users. TTL is intentionally short so
// role changes (e.g. granting investor access) take effect within minutes.
const ROLE_CACHE_COOKIE = "_chg_role";
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ProfileFlags = {
  is_investor: boolean | null;
  is_contractor: boolean | null;
  is_super_admin: boolean | null;
  profile_score?: number | null;
};

const PUBLIC_PATHS = [
  "/",
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

  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookieOptions: { domain: cookieDomain },
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

  const { data: { user }, error: getUserError } = await supabase.auth.getUser();

  if (!user) {
    console.log(
      `[auth:diag] middleware | path=${pathname} | session=NONE | reason=${getUserError?.code ?? getUserError?.message ?? "no_session"} | action=redirect_login`
    );
    // API consumers expect JSON 401 (route handlers themselves return 401 in
    // the same shape). Page navigations redirect to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    const redirectRes = NextResponse.redirect(loginUrl);
    // Expire every Supabase auth cookie (sb-*) and the role-cache cookie so
    // stale tokens from an old domain can't shadow the fresh session the user
    // is about to create at /login.
    for (const cookie of req.cookies.getAll()) {
      if (cookie.name.startsWith("sb-") || cookie.name === ROLE_CACHE_COOKIE) {
        redirectRes.cookies.set(cookie.name, "", {
          maxAge: 0,
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        });
        console.log(
          `[auth:diag] middleware | path=${pathname} | clearing_stale_cookie=${cookie.name}`
        );
      }
    }
    return redirectRes;
  }

  console.log(`[auth:diag] middleware | path=${pathname} | session=OK | user=${user.id}`);

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

  // --- Role-flags cache ---------------------------------------------------
  // Try reading the short-lived role cache cookie set on the previous request.
  // On hit we skip the Supabase user_profiles round-trip entirely (~100-150ms
  // saved per request). On miss (first request, cookie expired, user changed)
  // we query Supabase and prime the cookie for subsequent requests.
  let profile: ProfileFlags | null = null;

  const cachedRoleRaw = req.cookies.get(ROLE_CACHE_COOKIE)?.value;
  if (cachedRoleRaw) {
    try {
      const c = JSON.parse(atob(cachedRoleRaw)) as {
        uid: string; inv: boolean; ctr: boolean; sa: boolean;
        ps: number | null; exp: number;
      };
      if (c.uid === user.id && c.exp > Date.now()) {
        profile = {
          is_investor: c.inv,
          is_contractor: c.ctr,
          is_super_admin: c.sa,
          profile_score: c.ps,
        };
        console.log(
          `[auth:diag] middleware | path=${pathname} | user=${user.id} | profile_source=role_cache | is_investor=${c.inv} | is_contractor=${c.ctr} | is_super_admin=${c.sa}`
        );
      }
    } catch {
      // Malformed cookie — treat as cache miss.
    }
  }

  if (!profile) {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error: profileErr } = await admin
      .from("user_profiles")
      .select("is_investor, is_contractor, is_super_admin, profile_score")
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
    console.log(
      `[auth:diag] middleware | path=${pathname} | user=${user.id} | profile_source=supabase_db | profile_row=${data === null ? "MISSING" : "found"} | is_investor=${data?.is_investor ?? null} | is_contractor=${data?.is_contractor ?? null} | is_super_admin=${data?.is_super_admin ?? null}`
    );
    if (data === null) {
      console.log(
        `[auth:diag] middleware | path=${pathname} | user=${user.id} | WARNING: no user_profiles row — this will cause getCurrentUser() to return null and page-level guards to redirect /login`
      );
    }
    profile = data;

    // Prime the cache cookie so the next request skips this lookup.
    const cacheVal = btoa(JSON.stringify({
      uid: user.id,
      inv: !!profile?.is_investor,
      ctr: !!profile?.is_contractor,
      sa: !!profile?.is_super_admin,
      ps: profile?.profile_score ?? null,
      exp: Date.now() + ROLE_CACHE_TTL_MS,
    }));
    res.cookies.set(ROLE_CACHE_COOKIE, cacheVal, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ROLE_CACHE_TTL_MS / 1000,
    });
  }
  // Super-admins are allowed into CHG Rehab regardless of other role flags.
  // This lets admin test accounts that also carry is_investor / is_contractor
  // access the CRM and use the app switcher to reach the other portals.
  if (!profile?.is_super_admin) {
    if (profile?.is_investor) {
      console.log(
        `[auth:diag] middleware | path=${pathname} | user=${user.id} | is_investor=true | action=redirect_investor_portal`
      );
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
      console.log(
        `[auth:diag] middleware | path=${pathname} | user=${user.id} | is_contractor=true | action=redirect_login_wrong_role`
      );
      // Contractor accounts belong on apps/contractor-portal, not chg-rehab.
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "contractor_account" }, { status: 403 });
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "Contractor accounts use the contractor portal.");
      return NextResponse.redirect(loginUrl);
    }
  }

  console.log(
    `[auth:diag] middleware | path=${pathname} | user=${user.id} | action=allowed_through | is_super_admin=${!!profile?.is_super_admin}`
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
