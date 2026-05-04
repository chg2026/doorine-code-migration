import { createClient } from '@supabase/supabase-js';

// Vite exposes env vars prefixed with VITE_. See `apps/deallink/.env.example`.
// In production (the second autoscale deployment), these come from the Deal
// Link deployment's secrets pane and must point at the SAME Supabase project
// as Gold Bridge — both apps share `auth.users` + `public.user_profiles`.
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !anonKey) {
  // Surface the misconfig early — Login and AuthProvider can't function
  // without these. We log instead of throwing so the public read path
  // (which doesn't need Supabase) keeps working.
  // eslint-disable-next-line no-console
  console.warn('[deallink] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing.');
}

export const supabase = createClient(url, anonKey);
