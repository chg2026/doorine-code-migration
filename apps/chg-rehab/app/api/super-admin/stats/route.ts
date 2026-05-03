import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const admin = getSupabaseAdminClient();
  const [accountsRes, usersRes] = await Promise.all([
    admin.from("accounts").select("id, status, created_at"),
    admin.from("user_profiles").select("id"),
  ]);

  const allAccounts = accountsRes.data || [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  return NextResponse.json({
    total_accounts: allAccounts.length,
    total_users: (usersRes.data || []).length,
    active_accounts: allAccounts.filter((a) => a.status === "active").length,
    recent_accounts: allAccounts.filter((a) => a.created_at >= thirtyDaysAgo).length,
  });
}
