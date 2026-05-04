import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { proxyLegacyAdmin } from "@/lib/legacyAdminProxy";

export const dynamic = "force-dynamic";

/**
 * Catch-all proxy for the chg-rehab Super Admin UI. Every request under
 * `/api/super-admin/*` is gated by `requireSuperAdmin()` and then
 * forwarded to the shared Express `/api/admin/*` backend with the
 * caller's Supabase access token as a Bearer credential. This keeps
 * chg-rehab and apps/crm using a single source of truth for admin
 * business logic — no backend rewrite.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const { path } = await ctx.params;
  const subpath = "/" + (path || []).map((seg) => encodeURIComponent(seg)).join("/");
  return proxyLegacyAdmin(req, subpath);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
