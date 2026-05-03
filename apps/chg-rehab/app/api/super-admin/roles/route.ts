import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const admin = getSupabaseAdminClient();
  const { data: roles, error: rolesErr } = await admin
    .from("roles")
    .select("*, accounts(name)")
    .order("created_at", { ascending: false });
  if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 });

  const { data: perms } = await admin.from("role_permissions").select("*");
  const permsByRole: Record<string, any[]> = {};
  for (const p of perms || []) {
    if (!permsByRole[p.role_id]) permsByRole[p.role_id] = [];
    permsByRole[p.role_id].push(p);
  }

  const result = (roles || []).map((r: any) => {
    const account = Array.isArray(r.accounts) ? r.accounts[0] : r.accounts;
    return {
      ...r,
      account_name: account?.name || null,
      permissions: permsByRole[r.id] || [],
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const user = gate;

  const body = await req.json().catch(() => ({}));
  const { name, account_id, permissions = [] } = body;
  if (!name) return NextResponse.json({ error: "Role name is required." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data: role, error } = await admin
    .from("roles")
    .insert({ name, account_id: account_id || null, created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(permissions) && permissions.length > 0) {
    const permRows = permissions.map((p: any) => ({
      role_id: role.id,
      department: p.department,
      permission_level: p.permission_level || "none",
    }));
    await admin.from("role_permissions").insert(permRows);
  }

  return NextResponse.json(role, { status: 201 });
}
