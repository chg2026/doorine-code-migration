import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .select("*, roles(name), accounts(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map((u: any) => {
    const roles = Array.isArray(u.roles) ? u.roles[0] : u.roles;
    const accounts = Array.isArray(u.accounts) ? u.accounts[0] : u.accounts;
    return {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      status: u.status,
      is_super_admin: u.is_super_admin,
      is_account_admin: u.is_account_admin,
      last_login: u.last_login,
      role_name: roles?.name || null,
      account_name: accounts?.name || null,
      account_id: u.account_id,
      role_id: u.role_id,
      created_at: u.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const { email, password, full_name, account_id, role_id, is_account_admin } = body;
  if (!email || !password || !account_id) {
    return NextResponse.json(
      { error: "Email, password, and account_id are required." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, account_id, role_id },
  });
  if (authError || !authUser?.user)
    return NextResponse.json({ error: authError?.message || "createUser failed" }, { status: 500 });

  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: authUser.user.id,
    email,
    full_name: full_name || "",
    account_id,
    role_id: role_id || null,
    is_account_admin: !!is_account_admin,
  });
  if (profileError) {
    // Best-effort cleanup so we don't leak an auth user without a profile.
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => undefined);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ id: authUser.user.id, email }, { status: 201 });
}
