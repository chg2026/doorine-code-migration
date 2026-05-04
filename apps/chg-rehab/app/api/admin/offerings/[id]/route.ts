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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const offering = await prisma.offering.findFirst({
    where: { id, companyId: me.companyId },
  });
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.marketCity === "string") data.marketCity = body.marketCity;
  if (typeof body.marketState === "string") data.marketState = body.marketState;
  if (
    typeof body.propertyType === "string" &&
    (Object.values(OfferingPropertyType) as string[]).includes(body.propertyType)
  )
    data.propertyType = body.propertyType as OfferingPropertyType;
  if (
    typeof body.stage === "string" &&
    (Object.values(OfferingStage) as string[]).includes(body.stage)
  )
    data.stage = body.stage as OfferingStage;
  if (
    typeof body.status === "string" &&
    (Object.values(OfferingStatus) as string[]).includes(body.status)
  )
    data.status = body.status as OfferingStatus;
  if ("targetIrrLow" in body) data.targetIrrLow = decOrNull(body.targetIrrLow);
  if ("targetIrrHigh" in body) data.targetIrrHigh = decOrNull(body.targetIrrHigh);
  if ("prefReturnPct" in body) data.prefReturnPct = decOrNull(body.prefReturnPct);
  if ("holdMonths" in body)
    data.holdMonths = typeof body.holdMonths === "number" ? body.holdMonths : null;
  if ("minInvestment" in body) data.minInvestment = decOrNull(body.minInvestment);
  if ("raiseTarget" in body) data.raiseTarget = decOrNull(body.raiseTarget);
  if ("closeDate" in body)
    data.closeDate =
      typeof body.closeDate === "string" && body.closeDate
        ? new Date(body.closeDate)
        : null;
  if ("coverImageObjectPath" in body)
    data.coverImageObjectPath =
      typeof body.coverImageObjectPath === "string"
        ? body.coverImageObjectPath
        : null;
  if (Array.isArray(body.documentObjectPaths))
    data.documentObjectPaths = (body.documentObjectPaths as unknown[]).filter(
      (s): s is string => typeof s === "string"
    );
  if ("wireInstructions" in body) {
    const w = body.wireInstructions;
    if (w === null || w === "") {
      data.wireInstructions = null;
    } else if (typeof w === "object" && w !== null) {
      const wi = w as Record<string, unknown>;
      const cleaned = {
        bankName: typeof wi.bankName === "string" ? wi.bankName : "",
        routingNumber: typeof wi.routingNumber === "string" ? wi.routingNumber : "",
        accountNumber: typeof wi.accountNumber === "string" ? wi.accountNumber : "",
        beneficiary: typeof wi.beneficiary === "string" ? wi.beneficiary : "",
        swift: typeof wi.swift === "string" ? wi.swift : "",
        memo: typeof wi.memo === "string" ? wi.memo : "",
      };
      // Treat all-empty as null so we don't store a noise blob.
      const anyVal = Object.values(cleaned).some((v) => v && String(v).trim());
      data.wireInstructions = anyVal ? cleaned : null;
    }
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  await prisma.offering.update({ where: { id }, data });
  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "offering_updated",
      entity: "Offering",
      entityId: id,
      meta: { keys: Object.keys(data) },
    },
  });
  return NextResponse.json({ ok: true });
}
