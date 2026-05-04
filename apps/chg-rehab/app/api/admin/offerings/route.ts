import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  OfferingPropertyType,
  OfferingStage,
  OfferingStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

function decOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const offerings = await prisma.offering.findMany({
    where: { companyId: me.companyId },
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: {
        select: {
          id: true,
          committedAmount: true,
          fundedAmount: true,
          commitmentType: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({
    offerings: offerings.map((o) => ({
      id: o.id,
      name: o.name,
      propertyType: o.propertyType,
      marketCity: o.marketCity,
      marketState: o.marketState,
      description: o.description,
      targetIrrLow: o.targetIrrLow ? Number(o.targetIrrLow) : null,
      targetIrrHigh: o.targetIrrHigh ? Number(o.targetIrrHigh) : null,
      prefReturnPct: o.prefReturnPct ? Number(o.prefReturnPct) : null,
      holdMonths: o.holdMonths,
      minInvestment: o.minInvestment ? Number(o.minInvestment) : null,
      raiseTarget: o.raiseTarget ? Number(o.raiseTarget) : null,
      raisedToHard: o.raisedToHard ? Number(o.raisedToHard) : null,
      raisedToSoft: o.raisedToSoft ? Number(o.raisedToSoft) : null,
      stage: o.stage,
      status: o.status,
      closeDate: o.closeDate?.toISOString() ?? null,
      coverImageUrl: o.coverImageUrl,
      coverImageObjectPath: o.coverImageObjectPath,
      documentObjectPaths: o.documentObjectPaths,
      wireInstructions: o.wireInstructions ?? null,
      subscriptions: o.subscriptions.map((s) => ({
        id: s.id,
        committedAmount: Number(s.committedAmount),
        fundedAmount: Number(s.fundedAmount),
        commitmentType: s.commitmentType,
        status: s.status,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name)
    return NextResponse.json({ error: "Name required" }, { status: 400 });

  const propertyType =
    typeof body.propertyType === "string" &&
    (Object.values(OfferingPropertyType) as string[]).includes(body.propertyType)
      ? (body.propertyType as OfferingPropertyType)
      : OfferingPropertyType.Other;
  const stage =
    typeof body.stage === "string" &&
    (Object.values(OfferingStage) as string[]).includes(body.stage)
      ? (body.stage as OfferingStage)
      : OfferingStage.Prospecting;

  const created = await prisma.offering.create({
    data: {
      companyId: me.companyId,
      name,
      propertyType,
      marketCity: typeof body.marketCity === "string" ? body.marketCity : null,
      marketState:
        typeof body.marketState === "string" ? body.marketState : null,
      description:
        typeof body.description === "string" ? body.description : null,
      targetIrrLow: decOrNull(body.targetIrrLow),
      targetIrrHigh: decOrNull(body.targetIrrHigh),
      prefReturnPct: decOrNull(body.prefReturnPct),
      holdMonths:
        typeof body.holdMonths === "number" ? body.holdMonths : null,
      minInvestment: decOrNull(body.minInvestment),
      raiseTarget: decOrNull(body.raiseTarget),
      stage,
      status: OfferingStatus.Active,
      closeDate:
        typeof body.closeDate === "string" && body.closeDate
          ? new Date(body.closeDate)
          : null,
      coverImageObjectPath:
        typeof body.coverImageObjectPath === "string"
          ? body.coverImageObjectPath
          : null,
      documentObjectPaths: Array.isArray(body.documentObjectPaths)
        ? (body.documentObjectPaths as unknown[]).filter(
            (s): s is string => typeof s === "string"
          )
        : [],
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "offering_created",
      entity: "Offering",
      entityId: created.id,
      message: `Created offering ${name}`,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
