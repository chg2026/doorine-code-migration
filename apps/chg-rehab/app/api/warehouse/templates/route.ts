import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "warehouse", "admin")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const t = await prisma.warehouseTemplate.create({
    data: {
      companyId: user.companyId,
      name: String(body.name).trim(),
      scope: body.scope || null,
      data: body.data ?? { fields: [] },
      isLocked: false,
      isDefault: false,
    },
  });
  return NextResponse.json({ ok: true, id: t.id });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "warehouse", "admin")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tpl = await prisma.warehouseTemplate.findFirst({
    where: { id: body.id, companyId: user.companyId },
  });
  if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // System / locked templates cannot be renamed, re-scoped, or have their
  // field schema mutated. Toggling isDefault is still allowed so that an org
  // can pick the active template.
  if (tpl.isLocked) {
    const mutatesSchema =
      (typeof body.name === "string" && body.name.trim()) ||
      body.scope !== undefined ||
      body.data !== undefined;
    if (mutatesSchema) {
      return NextResponse.json(
        { error: "Locked templates cannot be modified" },
        { status: 403 }
      );
    }
  }

  // Setting a new default unsets the previous default in same scope
  if (body.isDefault === true) {
    await prisma.$transaction([
      prisma.warehouseTemplate.updateMany({
        where: {
          companyId: user.companyId,
          scope: tpl.scope,
          NOT: { id: tpl.id },
        },
        data: { isDefault: false },
      }),
      prisma.warehouseTemplate.update({
        where: { id: tpl.id },
        data: { isDefault: true },
      }),
    ]);
  } else {
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.scope !== undefined) data.scope = body.scope || null;
    if (body.data !== undefined) data.data = body.data;
    if (typeof body.isDefault === "boolean") data.isDefault = body.isDefault;
    if (Object.keys(data).length) {
      await prisma.warehouseTemplate.update({ where: { id: tpl.id }, data });
    }
  }
  return NextResponse.json({ ok: true });
}
