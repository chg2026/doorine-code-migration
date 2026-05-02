import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "warehouse", "admin")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const dep = await prisma.warehouseDepartment.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!dep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();

  await prisma.warehouseDepartment.update({ where: { id: dep.id }, data });
  return NextResponse.json({ ok: true });
}
