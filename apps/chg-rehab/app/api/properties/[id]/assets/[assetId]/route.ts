import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  // Tenant scope: load the parent property first to confirm ownership before touching the asset row.
  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const asset = await prisma.propertyAsset.findFirst({ where: { id: assetId, propertyId: property.id } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const cost = body.cost != null ? Number(body.cost) : null;
  const installed = body.installedDate ? new Date(body.installedDate) : asset.installed;
  const warrantyMonths = body.warrantyMonths != null ? Number(body.warrantyMonths) : null;
  const warrantyEnd = installed && warrantyMonths
    ? new Date(installed.getTime() + warrantyMonths * 30 * 24 * 60 * 60 * 1000)
    : asset.warrantyEnd;
  const notes = cost ? `$${cost.toLocaleString()}` : asset.notes;

  await prisma.propertyAsset.update({
    where: { id: asset.id },
    data: {
      name: String(body.name || asset.name).trim(),
      category: String(body.category || asset.category).trim(),
      installed,
      warrantyEnd,
      notes,
    },
  });

  return NextResponse.json({ ok: true });
}
