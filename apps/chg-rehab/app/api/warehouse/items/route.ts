import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "warehouse", "edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body?.subcategoryId || !body?.name?.trim())
    return NextResponse.json({ error: "subcategoryId + name required" }, { status: 400 });

  // Confirm subcategory belongs to this company
  const sub = await prisma.warehouseSubcategory.findFirst({
    where: { id: body.subcategoryId, department: { companyId: user.companyId } },
  });
  if (!sub) return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });

  // Confirm project (if any) belongs to this company
  let projectId: string | null = null;
  if (body.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: body.projectId, companyId: user.companyId },
    });
    if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    projectId = proj.id;
  }

  // If a template was selected, validate required fields and persist the
  // user-supplied values alongside the templateId in the item's meta bag.
  let metaPayload: Record<string, unknown> | null = null;
  if (body.templateId) {
    const tpl = await prisma.warehouseTemplate.findFirst({
      where: { id: body.templateId, companyId: user.companyId },
    });
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const fields =
      ((tpl.data as { fields?: { name: string; type: string; required?: boolean }[] })
        ?.fields) ?? [];
    const values = (body.templateValues ?? {}) as Record<string, unknown>;
    for (const f of fields) {
      if (f.required && (values[f.name] == null || values[f.name] === "")) {
        return NextResponse.json(
          { error: `Field '${f.name}' is required` },
          { status: 400 }
        );
      }
    }
    metaPayload = { templateId: tpl.id, templateValues: values };
  }

  const item = await prisma.warehouseItem.create({
    data: {
      subcategoryId: sub.id,
      name: String(body.name).trim(),
      brand: body.brand?.trim() || null,
      model: body.model?.trim() || null,
      vendor: body.vendor?.trim() || null,
      notes: body.notes ?? null,
      unit: body.unit ?? null,
      condition: body.condition ?? "New",
      value: body.value != null ? String(body.value) : null,
      defaultCost: body.value != null ? String(body.value) : null,
      projectId,
      meta: metaPayload ? (metaPayload as object) : undefined,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "wh_item_added",
      entity: "WarehouseItem",
      entityId: item.id,
      meta: { name: item.name, sub: sub.code, projectId },
    },
  });
  return NextResponse.json({ ok: true, id: item.id });
}
