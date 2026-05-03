import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_ANON_KEY missing — auth will not work.");
}

/**
 * Server-side Supabase client bound to Next.js cookies. Uses the same cookie
 * jar (`sb-*-auth-token`) the browser client writes to, so server components,
 * route handlers, and middleware all share one session.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
          });
        } catch {
          // Server Components can't mutate cookies — middleware refresh
          // persists rotated tokens.
        }
      },
    },
  });
}

let _service: SupabaseClient | null = null;
/**
 * Service-role Supabase client. Bypasses RLS — never expose to the browser.
 * Used to read `user_profiles.is_investor` and to bootstrap the Prisma
 * `Investor` row on first sign-in.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[supabase] SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  if (!_service) {
    _service = createPlainClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _service;
}
