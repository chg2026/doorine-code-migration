import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { name, permissions } = body;

  const admin = getSupabaseAdminClient();
  if (name !== undefined) {
    const { error } = await admin.from("roles").update({ name }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(permissions)) {
    await admin.from("role_permissions").delete().eq("role_id", id);
    if (permissions.length > 0) {
      const permRows = permissions.map((p: any) => ({
        role_id: id,
        department: p.department,
        permission_level: p.permission_level || "none",
      }));
      const { error } = await admin.from("role_permissions").insert(permRows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data: users } = await admin.from("user_profiles").select("id").eq("role_id", id);
  if (users && users.length > 0) {
    return NextResponse.json(
      { error: `Cannot delete role — ${users.length} user(s) still assigned. Reassign them first.` },
      { status: 400 }
    );
  }
  const { error } = await admin.from("roles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
