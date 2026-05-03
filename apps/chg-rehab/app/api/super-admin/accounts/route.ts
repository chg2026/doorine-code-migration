import { NextResponse } from "next/server";
import { requireSuperAdmin, syncEntitlement } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const admin = getSupabaseAdminClient();

  const { data: accounts } = await admin
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: userCounts } = await admin.from("user_profiles").select("account_id");

  const { data: allEntitlements } = await admin
    .from("account_products")
    .select("account_id, plan, status, started_at, disabled_at, products:product_id ( code, name )");

  const chgPlanByAccount: Record<string, string> = {};
  const entitlementsByAccount: Record<string, any[]> = {};
  for (const row of allEntitlements || []) {
    const productRel = (row as any).products;
    const product = Array.isArray(productRel) ? productRel[0] : productRel;
    const code = product?.code;
    if (!code) continue;
    const flat = {
      product_code: code,
      product_name: product?.name || code,
      plan: row.plan,
      status: row.status,
      started_at: row.started_at,
      disabled_at: row.disabled_at,
    };
    if (!entitlementsByAccount[row.account_id]) entitlementsByAccount[row.account_id] = [];
    entitlementsByAccount[row.account_id].push(flat);
    if (code === "chg" && row.status === "active") {
      chgPlanByAccount[row.account_id] = row.plan;
    }
  }

  const countMap: Record<string, number> = {};
  for (const u of userCounts || []) {
    if (u.account_id) countMap[u.account_id] = (countMap[u.account_id] || 0) + 1;
  }

  const result = (accounts || []).map((a) => ({
    ...a,
    plan_tier: chgPlanByAccount[a.id] || null,
    user_count: countMap[a.id] || 0,
    entitlements: entitlementsByAccount[a.id] || [],
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const { name, plan_tier = "starter", status = "active", billing_email } = body;
  if (!name) return NextResponse.json({ error: "Account name is required." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .insert({ name, status, billing_email: billing_email || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncEntitlement(data.id, "chg", plan_tier);

  return NextResponse.json({ ...data, plan_tier }, { status: 201 });
}
