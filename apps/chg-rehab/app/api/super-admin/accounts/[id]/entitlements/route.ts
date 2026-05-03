import { NextResponse } from "next/server";
import {
  requireSuperAdmin,
  syncEntitlement,
  isValidPlan,
  getProductByCode,
  logEntitlementActivity,
} from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_products")
    .select(
      "account_id, plan, status, started_at, disabled_at, disabled_by, products:product_id ( id, code, name, brand_domain, status )"
    )
    .eq("account_id", id)
    .order("started_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flat = (data || []).map((r: any) => {
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    return {
      account_id: r.account_id,
      product_id: product?.id,
      product_code: product?.code,
      product_name: product?.name,
      product_status: product?.status,
      plan: r.plan,
      status: r.status,
      started_at: r.started_at,
      disabled_at: r.disabled_at,
      disabled_by: r.disabled_by,
    };
  });

  return NextResponse.json(flat);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;
  const user = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { product_code, plan } = body;
  if (!product_code || !plan)
    return NextResponse.json({ error: "product_code and plan are required." }, { status: 400 });
  if (!isValidPlan(product_code, plan))
    return NextResponse.json(
      { error: `Invalid plan '${plan}' for product '${product_code}'.` },
      { status: 400 }
    );

  const admin = getSupabaseAdminClient();
  const { data: account, error: acctError } = await admin
    .from("accounts")
    .select("id")
    .eq("id", id)
    .single();
  if (acctError || !account)
    return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const product = await getProductByCode(product_code);
  if (!product)
    return NextResponse.json({ error: `Unknown product '${product_code}'.` }, { status: 400 });

  const { data: existing } = await admin
    .from("account_products")
    .select("plan, status")
    .eq("account_id", id)
    .eq("product_id", product.id)
    .maybeSingle();

  const result = await syncEntitlement(id, product_code, plan);
  if (result.error)
    return NextResponse.json(
      { error: typeof result.error === "string" ? result.error : result.error.message },
      { status: 500 }
    );

  await logEntitlementActivity({
    actorId: user.id,
    accountId: id,
    action: existing ? "entitlement.regrant" : "entitlement.grant",
    metadata: {
      product_code,
      new_plan: plan,
      prior_plan: existing?.plan || null,
      prior_status: existing?.status || null,
    },
  });

  return NextResponse.json(result.data, { status: 201 });
}
