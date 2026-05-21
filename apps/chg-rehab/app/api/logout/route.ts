import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { publicUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Clear the Supabase session (and any iron-session bridge cookie), then
 * redirect to /login. Accept GET for the existing TopNav `<a href="/api/logout">`
 * link, plus POST for non-navigational sign-out callers.
 */
async function handle(req: NextRequest) {
  const res = NextResponse.redirect(publicUrl(req, "/login"));

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
  await supabase.auth.signOut().catch((err) => {
    console.error("[logout] signOut failed", err);
  });

  // Clear the iron-session bridge cookie too so a stale invite token can't
  // leak across logins.
  const ironSession = await getIronSession<AppSession>(req, res, sessionOptions);
  ironSession.destroy();
  res.cookies.delete("_chg_role");

  return res;
}

export const GET = handle;
export const POST = handle;
