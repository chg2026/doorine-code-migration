import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { computeMao } from "@/lib/pipeline";
import { DealStage } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "pipeline", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.address !== "string" || !body.address.trim()) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  const arv = body.arv != null ? Number(body.arv) : null;
  const rehab = body.rehab != null ? Number(body.rehab) : null;

  const validStages: DealStage[] = [DealStage.Underwriting, DealStage.OfferOut, DealStage.UnderContract];
  const stage = validStages.includes(body.stage as DealStage) ? (body.stage as DealStage) : DealStage.Underwriting;

  const count = await prisma.pipelineDeal.count({ where: { companyId: user.companyId } });
  const code = `D-${String(count + 1).padStart(3, "0")}`;

  const meta = {
    ...(body.meta || {}),
    arv: arv ?? undefined,
    rehab: rehab ?? undefined,
    daysInStage: 0,
    badge: "New",
    badgeColor: "blue",
  };

  const deal = await prisma.pipelineDeal.create({
    data: {
      companyId: user.companyId,
      code,
      address: body.address.trim(),
      askingPrice: body.askingPrice != null ? String(body.askingPrice) : null,
      estimatedRoi: body.estimatedRoi != null ? String(body.estimatedRoi) : null,
      stage,
      meta,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "deal.created",
      entity: "PipelineDeal",
      entityId: deal.id,
      message: `Deal added: ${deal.address}`,
    },
  });

  return NextResponse.json({ id: deal.id, code: deal.code, mao: computeMao(arv, rehab) });
}
