import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { InvestorDocType } from "@prisma/client";
import { dispatchInvestorNotifications } from "@/lib/notifications/investor";

export const dynamic = "force-dynamic";

/**
 * Upload an investor-portal document. Two flavors:
 *   - investor-scoped (investorId set, offeringId optional)  → personal doc
 *   - offering-shared (offeringId set, investorId omitted)   → shared doc
 *
 * Either way, every recipient gets a `document` notification through the
 * channels (email + in-app) they opted into in their portal preferences.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const investorId =
    typeof body.investorId === "string" && body.investorId ? body.investorId : null;
  const offeringId =
    typeof body.offeringId === "string" && body.offeringId ? body.offeringId : null;
  if (!investorId && !offeringId)
    return NextResponse.json(
      { error: "investorId or offeringId required" },
      { status: 400 }
    );

  const docType =
    typeof body.docType === "string" &&
    (Object.values(InvestorDocType) as string[]).includes(body.docType)
      ? (body.docType as InvestorDocType)
      : InvestorDocType.Other;
  const objectPath =
    typeof body.objectPath === "string" ? body.objectPath : null;
  const sizeBytes =
    typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
      ? Math.trunc(body.sizeBytes)
      : null;
  const taxYear =
    typeof body.taxYear === "number" && Number.isFinite(body.taxYear)
      ? Math.trunc(body.taxYear)
      : null;

  // Cross-tenant guards: investor and offering must belong to this admin's
  // company before we accept the document.
  if (investorId) {
    const ok = await prisma.investor.findFirst({
      where: { id: investorId, companyId: me.companyId },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }
  let offeringName: string | null = null;
  if (offeringId) {
    const off = await prisma.offering.findFirst({
      where: { id: offeringId, companyId: me.companyId },
      select: { id: true, name: true },
    });
    if (!off)
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    offeringName = off.name;
  }

  const doc = await prisma.investorDocument.create({
    data: {
      companyId: me.companyId,
      investorId,
      offeringId,
      name,
      docType,
      objectPath,
      sizeBytes,
      taxYear,
      uploadedById: me.id,
    },
  });

  // Resolve which investors should be notified.
  let recipientIds: string[] = [];
  if (investorId) {
    recipientIds = [investorId];
  } else if (offeringId) {
    const subs = await prisma.investorSubscription.findMany({
      where: { offeringId, status: { in: ["Pending", "Active", "Closed"] } },
      select: { investorId: true },
    });
    recipientIds = Array.from(new Set(subs.map((s) => s.investorId)));
  }

  if (recipientIds.length > 0) {
    const title = offeringName
      ? `New document available — ${offeringName}`
      : `New document available — ${name}`;
    await dispatchInvestorNotifications(
      recipientIds.map((id) => ({
        investorId: id,
        event: "document" as const,
        title,
        description: name,
        relatedDocumentId: doc.id,
      }))
    );
  }

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "investor_document_uploaded",
      entity: "InvestorDocument",
      entityId: doc.id,
      meta: { investorId, offeringId, docType },
    },
  });

  return NextResponse.json({ ok: true, id: doc.id });
}
