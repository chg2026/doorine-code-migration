"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Persists session in cookies via
 * `@supabase/ssr` so the server-side client (which reads the same cookies
 * via Next.js `cookies()`) stays in sync without a manual setSession step.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    _client = createBrowserClient(url, key);
  }
  return _client;
}
