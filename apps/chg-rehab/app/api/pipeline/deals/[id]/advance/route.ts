import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DealStage } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

const ORDER: DealStage[] = [
  DealStage.Sourced,
  DealStage.Underwriting,
  DealStage.OfferOut,
  DealStage.UnderContract,
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "pipeline", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const requested: DealStage | undefined = body.stage;

  const deal = await prisma.pipelineDeal.findFirst({ where: { id, companyId: user.companyId } });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const idx = ORDER.indexOf(deal.stage);
  if (idx < 0 || idx >= ORDER.length - 1) {
    return NextResponse.json(
      { error: `Cannot advance from stage ${deal.stage}; use the close endpoint when ready.` },
      { status: 400 }
    );
  }
  const expectedNext = ORDER[idx + 1];

  if (requested && requested !== expectedNext) {
    return NextResponse.json(
      {
        error: `Illegal stage transition: ${deal.stage} → ${requested}. Only ${deal.stage} → ${expectedNext} is allowed.`,
      },
      { status: 400 }
    );
  }
  const next: DealStage = expectedNext;

  const updated = await prisma.pipelineDeal.update({
    where: { id: deal.id },
    data: {
      stage: next,
      meta: { ...((deal.meta as Record<string, unknown>) || {}), daysInStage: 0 },
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "deal.advanced",
      entity: "PipelineDeal",
      entityId: deal.id,
      message: `Deal ${deal.address}: ${deal.stage} → ${next}`,
    },
  });

  return NextResponse.json({ id: updated.id, stage: updated.stage });
}
