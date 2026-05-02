import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "warehouse", "edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const item = await prisma.warehouseItem.findFirst({
    where: { id, subcategory: { department: { companyId: user.companyId } } },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const previousProjectId = item.projectId;

  let projectId: string | null = null;
  let projectInfo: { id: string; code: string; name: string } | null = null;
  if (body.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: body.projectId, companyId: user.companyId },
      select: { id: true, code: true, name: true },
    });
    if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    projectId = proj.id;
    projectInfo = proj;
  }

  const updateData: { projectId: string | null; unit?: string } = { projectId };
  if (typeof body.quantity === "string" && body.quantity.trim()) {
    updateData.unit = body.quantity.trim();
  }

  await prisma.warehouseItem.update({
    where: { id: item.id },
    data: updateData,
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: projectId ? "wh_item_allocated" : "wh_item_returned_to_stock",
      entity: "WarehouseItem",
      entityId: item.id,
      meta: { name: item.name, projectId, quantity: updateData.unit ?? item.unit },
    },
  });

  if (projectId && projectInfo) {
    await dispatchNotification({
      companyId: user.companyId,
      event: "allocations",
      projectId,
      title: `${item.name} allocated to ${projectInfo.code}`,
      body: `Quantity: ${updateData.unit ?? item.unit ?? "1"}.`,
      link: `/rehab/${projectInfo.code}/budget`,
      meta: {
        itemId: item.id,
        name: item.name,
        projectId,
        quantity: updateData.unit ?? item.unit,
        action: "allocated",
      },
      dedupeKey: `allocations:${item.id}:${projectId}:${Date.now()}`,
    }).catch(() => undefined);
  } else if (previousProjectId) {
    const prev = await prisma.project.findUnique({
      where: { id: previousProjectId },
      select: { code: true, name: true },
    });
    await dispatchNotification({
      companyId: user.companyId,
      event: "allocations",
      projectId: previousProjectId,
      title: `${item.name} returned to warehouse`,
      body: prev?.code ? `Returned from ${prev.code}.` : "Returned to general inventory.",
      link: `/warehouse`,
      meta: {
        itemId: item.id,
        name: item.name,
        previousProjectId,
        action: "returned",
      },
      dedupeKey: `allocations:${item.id}:return:${Date.now()}`,
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
