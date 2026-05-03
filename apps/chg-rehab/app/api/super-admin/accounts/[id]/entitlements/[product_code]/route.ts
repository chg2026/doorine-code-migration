import { NextResponse } from "next/server";
import {
  requireSuperAdmin,
  isValidPlan,
  getProductByCode,
  logEntitlementActivity,
} from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; product_code: string }> };

export async function PATCH(req: Request, ctx: Params) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const user = gate;
  const { id, product_code } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { plan } = body;
  if (!plan) return NextResponse.json({ error: "plan is required." }, { status: 400 });
  if (!isValidPlan(product_code, plan))
    return NextResponse.json(
      { error: `Invalid plan '${plan}' for product '${product_code}'.` },
      { status: 400 }
    );

  const product = await getProductByCode(product_code);
  if (!product)
    return NextResponse.json({ error: `Unknown product '${product_code}'.` }, { status: 404 });

  const admin = getSupabaseAdminClient();
  const { data: existing, error: existErr } = await admin
    .from("account_products")
    .select("plan, status")
    .eq("account_id", id)
    .eq("product_id", product.id)
    .single();
  if (existErr || !existing)
    return NextResponse.json({ error: "Entitlement not found." }, { status: 404 });

  const { data, error } = await admin
    .from("account_products")
    .update({ plan })
    .eq("account_id", id)
    .eq("product_id", product.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEntitlementActivity({
    actorId: user.id,
    accountId: id,
    action: "entitlement.plan_change",
    metadata: { product_code, prior_plan: existing.plan, new_plan: plan },
  });

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: Params) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const user = gate;
  const { id, product_code } = await ctx.params;

  const product = await getProductByCode(product_code);
  if (!product)
    return NextResponse.json({ error: `Unknown product '${product_code}'.` }, { status: 404 });

  const admin = getSupabaseAdminClient();
  const { data: existing, error: existErr } = await admin
    .from("account_products")
    .select("plan, status")
    .eq("account_id", id)
    .eq("product_id", product.id)
    .single();
  if (existErr || !existing)
    return NextResponse.json({ error: "Entitlement not found." }, { status: 404 });

  // Idempotent: revoking an already-disabled entitlement is a no-op.
  if (existing.status === "disabled") {
    return NextResponse.json({ ok: true, already_disabled: true });
  }

  const { error } = await admin
    .from("account_products")
    .update({
      status: "disabled",
      disabled_at: new Date().toISOString(),
      disabled_by: user.id,
    })
    .eq("account_id", id)
    .eq("product_id", product.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEntitlementActivity({
    actorId: user.id,
    accountId: id,
    action: "entitlement.revoke",
    metadata: { product_code, prior_plan: existing.plan },
  });

  return NextResponse.json({ ok: true });
}
