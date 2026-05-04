import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { nextPropertyCode } from "@/lib/pipeline";
import { DealStage, ProjectStatus, Prisma } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

function parseAddress(full: string): { address: string; city: string; state: string; zip: string } {
  // Best-effort parse: "514 Lakewood Ave., Cleveland, OH 44102"
  const parts = full.split(",").map((p) => p.trim());
  const address = parts[0] || full;
  const city = parts[1] || "Cleveland";
  let state = "OH";
  let zip = "";
  if (parts[2]) {
    const m = parts[2].match(/^([A-Z]{2})\s*(\d{5})?/);
    if (m) {
      state = m[1];
      zip = m[2] || "";
    } else {
      state = parts[2];
    }
  }
  return { address, city, state, zip };
}

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
  const purchasePrice: number | null = body.purchasePrice != null ? Number(body.purchasePrice) : null;
  const rehabBudget: number | null = body.rehabBudget != null ? Number(body.rehabBudget) : null;
  const closingDate: string | null = body.closingDate || null;

  const deal = await prisma.pipelineDeal.findFirst({ where: { id, companyId: user.companyId } });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (deal.stage === DealStage.Closed) {
    return NextResponse.json({ error: "Deal already closed" }, { status: 400 });
  }
  if (purchasePrice == null) {
    return NextResponse.json({ error: "Purchase price is required to close" }, { status: 400 });
  }

  const meta = (deal.meta as Record<string, unknown>) || {};
  const arv = (meta.arv as number | undefined) ?? null;
  const rehab = (meta.rehab as number | undefined) ?? rehabBudget ?? null;

  const setting = await prisma.companySetting.findUnique({ where: { companyId: user.companyId } });
  const settingMeta = (setting?.meta as Record<string, unknown> | null) ?? {};
  const defaultMode =
    (settingMeta.defaultProjectMode as string | undefined) ??
    (settingMeta.defaultMode as string | undefined) ??
    "rehab-then-rent";
  const defaultExitStrategy =
    (settingMeta.defaultExitStrategy as string | undefined) ?? "Sell after rehab";

  const parsed = parseAddress(deal.address);
  const propertyCode = await uniquePropertyCode(user.companyId, deal.address);
  const projectCode = propertyCode;

  const closedAt = closingDate ? new Date(closingDate) : new Date();

  // Atomic close: property + project + linked deal + activity entries.
  const result = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        companyId: user.companyId,
        code: propertyCode,
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        status: "Acquired",
        acquired: closedAt,
        baseline: arv != null ? String(arv) : null,
        currentRoi: deal.estimatedRoi,
        meta: {
          ...meta,
          purchasePrice,
          rehabBudget: rehab ?? undefined,
          mode: defaultMode,
          exitStrategy: defaultExitStrategy,
          spec: [meta.type, meta.beds ? `${meta.beds} bed` : null].filter(Boolean).join(" · "),
        },
      },
    });

    const project = await tx.project.create({
      data: {
        companyId: user.companyId,
        propertyId: property.id,
        code: projectCode,
        name: `${parsed.address} — Rehab project`,
        status: ProjectStatus.Planning,
        budget: rehab != null ? String(rehab) : "0",
        currentPhase: 0,
        startDate: null,
        meta: {
          mode: defaultMode,
          exitStrategy: defaultExitStrategy,
          notStarted: true,
        } as Prisma.InputJsonValue,
      },
    });

    const updatedDeal = await tx.pipelineDeal.update({
      where: { id: deal.id },
      data: {
        stage: DealStage.Closed,
        closedAt,
        propertyId: property.id,
        askingPrice: String(purchasePrice),
        meta: {
          ...meta,
          purchase: purchasePrice,
          closingDate: closingDate ?? undefined,
          badge: "✓ Acquired",
          badgeColor: "green",
          daysInStage: 0,
          askingOrPurchase: { kind: "purchase", value: purchasePrice },
        },
      },
    });

    await tx.activityLogEntry.createMany({
      data: [
        {
          companyId: user.companyId,
          actorId: user.id,
          action: "deal.closed",
          entity: "PipelineDeal",
          entityId: deal.id,
          message: `Deal closed: ${deal.address} for $${purchasePrice.toLocaleString()}`,
        },
        {
          companyId: user.companyId,
          actorId: user.id,
          action: "property.created",
          entity: "Property",
          entityId: property.id,
          message: `Property ${propertyCode} created from deal ${deal.code}`,
        },
        {
          companyId: user.companyId,
          actorId: user.id,
          action: "project.created",
          entity: "Project",
          entityId: project.id,
          message: `Rehab project ${projectCode} created (Planning)`,
        },
      ],
    });

    return { propertyId: property.id, projectId: project.id, dealId: updatedDeal.id, propertyCode };
  });

  return NextResponse.json(result);
}

async function uniquePropertyCode(companyId: string, address: string): Promise<string> {
  const base = nextPropertyCode(address);
  let code = base;
  let n = 0;
  while (await prisma.property.findUnique({ where: { companyId_code: { companyId, code } } })) {
    n += 1;
    code = `${base}-${n}`;
  }
  return code;
}
