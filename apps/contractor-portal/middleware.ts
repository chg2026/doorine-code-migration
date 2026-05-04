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
  "/api/health",
];

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
        getAll() { return req.cookies.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => res.cookies.set(name, value, options as CookieOptions)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey) {
    const admin = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_contractor")
      .eq("id", user.id)
      .maybeSingle<{ is_contractor: boolean | null }>();
    if (!profile?.is_contractor) {
      await supabase.auth.signOut().catch(() => undefined);
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "wrong_role", message: "This account is not a contractor account." },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("This account is not a contractor account.")}`, req.url));
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
