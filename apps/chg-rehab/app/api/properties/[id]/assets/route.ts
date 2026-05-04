import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const category = String(body.category || "Other").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const cost = body.cost != null ? Number(body.cost) : null;
  const installed = body.installedDate ? new Date(body.installedDate) : null;
  const warrantyMonths = body.warrantyMonths != null ? Number(body.warrantyMonths) : null;
  const warrantyEnd = installed && warrantyMonths
    ? new Date(installed.getTime() + warrantyMonths * 30 * 24 * 60 * 60 * 1000)
    : null;
  const notes = cost ? `$${cost.toLocaleString()}` : null;

  const asset = await prisma.propertyAsset.create({
    data: { propertyId: property.id, name, category, installed, warrantyEnd, notes },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "asset.added",
      entity: "PropertyAsset",
      entityId: asset.id,
      message: `Asset added to ${property.code}: ${name}`,
    },
  });

  return NextResponse.json({ id: asset.id });
}
