import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { full_name, role_id, status, is_account_admin } = body;
  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (role_id !== undefined) updates.role_id = role_id || null;
  if (status !== undefined) updates.status = status;
  if (is_account_admin !== undefined) updates.is_account_admin = !!is_account_admin;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const user = gate;
  const { id } = await ctx.params;

  if (id === user.id)
    return NextResponse.json({ error: "You cannot delete your own user." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  await admin.from("user_profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id);
  return NextResponse.json({ ok: true });
}
