import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/login", "/api/callback", "/api/logout", "/api/health", "/api/dev-login", "/api/invites/accept", "/api/cron/notifications-sweep", "/api/contacts/unsubscribe", "/api/stripe/webhook"];

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
  const session = await getIronSession<AppSession>(req, res, sessionOptions);

  if (!session.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
