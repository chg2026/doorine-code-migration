import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { getSupabaseAdminClient } from "./supabaseServer";

/**
 * Resolve the current user and verify they hold `is_super_admin` in
 * Supabase `user_profiles`. The session-bound flag (set in lib/auth.ts) is
 * the fast path; we re-check Supabase here so a freshly-revoked super-admin
 * can't keep using a still-valid Prisma-side cache.
 *
 * Mirrors `server/middleware/auth.js#requireSuperAdmin` from the legacy CRM.
 *
 * Returns either the SessionUser or a NextResponse the route handler should
 * return as-is. Use:
 *
 *   const gate = await requireSuperAdmin();
 *   if (gate instanceof NextResponse) return gate;
 *   const user = gate;
 */
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Fast path: session-bound flag agrees and we don't need a round-trip.
  if (user.isSuperAdmin) return user;

  // Otherwise re-confirm against Supabase. The session might be older than
  // the most recent flag flip in user_profiles.
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .select("is_super_admin")
    .eq("email", user.email ?? "")
    .maybeSingle<{ is_super_admin: boolean | null }>();

  if (error) {
    console.error("[super-admin] gate check failed:", error.message);
    return NextResponse.json({ error: "gate_check_failed" }, { status: 500 });
  }

  if (!data?.is_super_admin) {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  return { ...user, isSuperAdmin: true };
}

/**
 * Plan whitelist per product. Mirrors server/routes/admin.js → PLANS_BY_PRODUCT.
 * Server is authoritative; the client UI keeps its own copy in sync.
 */
export const PLANS_BY_PRODUCT: Record<string, string[]> = {
  chg: ["starter", "professional", "enterprise"],
  deallink: ["free", "personal", "team"],
};

export function isValidPlan(productCode: string, plan: string): boolean {
  const allowed = PLANS_BY_PRODUCT[productCode];
  return Array.isArray(allowed) && allowed.includes(plan);
}

/**
 * Fetch a product row by code, used to translate URL `:product_code` params
 * into the `products.id` FK on `account_products`.
 */
export async function getProductByCode(code: string) {
  if (!code) return null;
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id, code, name")
    .eq("code", code)
    .maybeSingle<{ id: string; code: string; name: string }>();
  if (error || !data?.id) return null;
  return data;
}

/**
 * Upsert an active entitlement at the given plan. Re-granting a previously
 * disabled entitlement clears the audit fields (disabled_at / disabled_by).
 */
export async function syncEntitlement(
  accountId: string,
  productCode: string,
  plan: string
) {
  const product = await getProductByCode(productCode);
  if (!product) return { error: `product '${productCode}' not found` as const };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_products")
    .upsert(
      {
        account_id: accountId,
        product_id: product.id,
        plan,
        status: "active",
        started_at: new Date().toISOString(),
        disabled_at: null,
        disabled_by: null,
      },
      { onConflict: "account_id,product_id" }
    )
    .select("account_id, product_id, plan, status, started_at")
    .single();
  if (error) console.error("[super-admin] entitlement sync error:", error.message);
  return { data, error, product };
}

/**
 * Append-only audit trail. activity_log has SELECT-only RLS; service-role
 * bypasses it. Failures here MUST NOT block the underlying admin write —
 * log + swallow.
 */
export async function logEntitlementActivity(args: {
  actorId: string | null;
  accountId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from("activity_log").insert({
      user_id: args.actorId,
      account_id: args.accountId,
      action: args.action,
      entity_type: "account_product",
      metadata: args.metadata || {},
    });
    if (error) console.warn("[super-admin] activity_log insert failed:", error.message);
  } catch (e) {
    console.warn("[super-admin] activity_log threw:", (e as Error).message);
  }
}
