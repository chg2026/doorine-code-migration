import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Updates global product settings — currently just `brand_domain`, the host
 * the AppSwitcher uses to build the production link for each product tile.
 * Stored as a bare host (no protocol, no path); the AppSwitcher prepends
 * `https://`.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const { code: rawCode } = await ctx.params;
  const code = String(rawCode || "").toLowerCase();

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if ("brand_domain" in body) {
    const raw = body.brand_domain;
    if (raw === null || raw === "") {
      update.brand_domain = null;
    } else if (typeof raw !== "string") {
      return NextResponse.json({ error: "brand_domain must be a string or null" }, { status: 400 });
    } else {
      const host = raw
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
        return NextResponse.json(
          { error: "brand_domain must be a bare host like 'app.example.com'" },
          { status: 400 }
        );
      }
      update.brand_domain = host;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .update(update)
    .eq("code", code)
    .select("id, code, name, brand_domain, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
