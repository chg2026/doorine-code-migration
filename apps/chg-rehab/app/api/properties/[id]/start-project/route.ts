import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Prisma, ProjectStatus } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.project.findFirst({
    where: { companyId: user.companyId, propertyId: property.id, status: { not: ProjectStatus.Complete } },
  });
  if (existing) {
    return NextResponse.json({ error: "Property already has an active project" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim() || `${property.address} — Rehab project`;
  const budget = body.budget != null ? Number(body.budget) : null;

  const setting = await prisma.companySetting.findUnique({ where: { companyId: user.companyId } });
  const settingMeta = (setting?.meta as Record<string, unknown> | null) ?? {};
  const mode =
    (body.mode as string | undefined) ||
    (settingMeta.defaultProjectMode as string | undefined) ||
    "rehab-then-rent";

  let code = property.code;
  let suffix = 1;
  while (await prisma.project.findFirst({ where: { companyId: user.companyId, code } })) {
    suffix += 1;
    code = `${property.code}-P${suffix}`;
  }

  const project = await prisma.project.create({
    data: {
      companyId: user.companyId,
      propertyId: property.id,
      code,
      name,
      status: ProjectStatus.Planning,
      budget: budget != null ? String(budget) : "0",
      currentPhase: 0,
      meta: { mode, notStarted: true } as Prisma.InputJsonValue,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "project.created",
      entity: "Project",
      entityId: project.id,
      message: `Rehab project ${code} started for ${property.code}`,
    },
  });

  return NextResponse.json({ id: project.id, code });
}
