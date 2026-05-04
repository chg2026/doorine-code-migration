import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

  return res;
}

export const GET = handle;
export const POST = handle;
