import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const probe = await sb.from('user_profiles').select('id, is_investor').limit(1);
console.log('probe is_investor:', JSON.stringify(probe));
const rpc1 = await sb.rpc('exec_sql', { sql: 'SELECT 1' });
console.log('rpc exec_sql:', JSON.stringify(rpc1));
const rpc2 = await sb.rpc('execute_sql', { query: 'SELECT 1' });
console.log('rpc execute_sql:', JSON.stringify(rpc2));
