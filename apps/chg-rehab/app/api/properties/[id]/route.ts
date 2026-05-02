import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const incomingMeta = (body.meta && typeof body.meta === "object") ? body.meta as Record<string, unknown> : {};
  // Drop nullish keys so callers can clear individual fields explicitly.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incomingMeta)) {
    if (v !== undefined) cleaned[k] = v;
  }
  const merged = { ...((property.meta as Record<string, unknown>) || {}), ...cleaned };

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: { meta: merged as Prisma.InputJsonValue },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "property.updated",
      entity: "Property",
      entityId: property.id,
      message: `Financial inputs updated for ${property.code}`,
    },
  });

  return NextResponse.json({ id: updated.id });
}
