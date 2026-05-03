import { NextResponse } from "next/server";
import { requireSuperAdmin, syncEntitlement } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { name, plan_tier, status, billing_email } = body;
  // plan_tier no longer lives on accounts — it routes to account_products.
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (billing_email !== undefined) updates.billing_email = billing_email;

  const admin = getSupabaseAdminClient();
  let data: any;
  if (Object.keys(updates).length > 0) {
    const r = await admin.from("accounts").update(updates).eq("id", id).select().single();
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    data = r.data;
  } else {
    const r = await admin.from("accounts").select("*").eq("id", id).single();
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    data = r.data;
  }

  if (plan_tier !== undefined) {
    await syncEntitlement(id, "chg", plan_tier);
  }

  // Project plan_tier back onto the response for UI shape stability.
  let responsePlan = plan_tier;
  if (responsePlan === undefined) {
    const { data: ent } = await admin
      .from("account_products")
      .select("plan, status, products:product_id ( code )")
      .eq("account_id", id);
    responsePlan =
      (ent || []).find((e: any) => {
        const p = Array.isArray(e.products) ? e.products[0] : e.products;
        return p?.code === "chg" && e.status === "active";
      })?.plan || null;
  }

  return NextResponse.json({ ...data, plan_tier: responsePlan });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
