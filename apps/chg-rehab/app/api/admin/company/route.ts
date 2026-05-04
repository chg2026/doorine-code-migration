import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  if (!body.name || typeof body.name !== "string" || !body.name.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });

  await prisma.company.update({
    where: { id: user.companyId },
    data: { name: body.name.trim() },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "company_renamed",
      entity: "Company",
      entityId: user.companyId,
      meta: { name: body.name.trim() },
    },
  });

  return NextResponse.json({ ok: true });
}
