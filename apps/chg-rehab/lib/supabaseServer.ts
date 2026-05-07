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
 * Server-side Supabase client bound to Next.js cookies. Reads/writes the
 * `sb-*-auth-token` cookies that @supabase/ssr uses for session storage, so
 * server components, route handlers, and middleware all share one session.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { domain: cookieDomain },
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
          // Server Components can't mutate cookies — that's fine, the
          // matching middleware refresh will persist the rotated tokens.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client. Used only on the server to read/write
 * `user_profiles`, `accounts`, etc. with RLS bypassed. Never expose this to
 * the client. Throws if the service role key is missing — every caller
 * relies on it.
 */
let _service: SupabaseClient | null = null;
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
