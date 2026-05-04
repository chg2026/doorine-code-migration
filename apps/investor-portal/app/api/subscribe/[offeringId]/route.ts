import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";
import {
  InvestorActivityType,
  InvestorDocType,
  InvestorSubscriptionStatus,
  SubscriptionCommitmentType,
  SubscriptionDocKind,
} from "@prisma/client";
import { notifyInvestor } from "@/lib/notifyInvestor";
import { buildSubscriptionReceiptPdf } from "@/lib/subscriptionPdf";
import { putPrivateObject } from "@/lib/objectStorageWrite";

export const dynamic = "force-dynamic";

/**
 * Investor-initiated subscribe. Creates a Pending InvestorSubscription
 * (or upserts in-place if one already exists), records a SubscriptionDocument
 * with the e-sign metadata, generates a PDF receipt, and fans out a
 * Subscription notification (activity + email).
 *
 * Body: {
 *   committedAmount: number,
 *   commitmentType?: "Soft" | "Hard",
 *   signedName: string,         // typed-name e-sign
 *   acceptedDisclaimer: true
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  const { offeringId } = await params;
  const me = await getCurrentInvestor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const committed = Number(body.committedAmount);
  const signedName = typeof body.signedName === "string" ? body.signedName.trim() : "";
  const acceptedDisclaimer = body.acceptedDisclaimer === true;

  if (!Number.isFinite(committed) || committed <= 0)
    return NextResponse.json({ error: "committedAmount must be > 0" }, { status: 400 });
  if (!signedName)
    return NextResponse.json({ error: "signedName required" }, { status: 400 });
  if (!acceptedDisclaimer)
    return NextResponse.json({ error: "must accept the disclaimer" }, { status: 400 });

  // Confirm the offering is in the investor's company AND is currently raising.
  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, companyId: me.companyId },
    select: { id: true, name: true, stage: true, status: true, minInvestment: true },
  });
  if (!offering) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (offering.status !== "Active" || offering.stage !== "Raise")
    return NextResponse.json({ error: "offering_not_open" }, { status: 400 });
  if (offering.minInvestment && committed < Number(offering.minInvestment))
    return NextResponse.json(
      { error: `Below minimum investment of $${Number(offering.minInvestment).toLocaleString()}` },
      { status: 400 }
    );

  const now = new Date();
  // Soft → Hard transition: per spec, the subscription is created as a Soft
  // commit and is upgraded to Hard once the investor completes the e-sign
  // step. Because this single endpoint receives both the amount and the
  // signed name, we model the transition explicitly inside one transaction
  // so the audit trail (SubscriptionDocument.signedAt below) lines up with
  // the Hard upgrade.
  const sub = await prisma.$transaction(async (tx) => {
    const created = await tx.investorSubscription.upsert({
      where: { investorId_offeringId: { investorId: me.id, offeringId } },
      create: {
        investorId: me.id,
        offeringId,
        committedAmount: committed,
        commitmentType: SubscriptionCommitmentType.Soft,
        status: InvestorSubscriptionStatus.Pending,
      },
      update: {
        committedAmount: committed,
        commitmentType: SubscriptionCommitmentType.Soft,
      },
    });
    // Apply the e-sign: Soft → Hard, stamp signedAt.
    return tx.investorSubscription.update({
      where: { id: created.id },
      data: {
        commitmentType: SubscriptionCommitmentType.Hard,
        signedAt: now,
      },
    });
  });
  const commitmentType = sub.commitmentType;

  // Recompute aggregate raise totals.
  try {
    const { recomputeOfferingRaised } = await import("@/lib/recompute");
    await recomputeOfferingRaised(offeringId);
  } catch (err) {
    console.error("[subscribe] recompute failed", err);
  }

  // Build the PDF receipt and persist it.
  const investorName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || "Investor";
  let receiptObjectPath: string | null = null;
  try {
    const pdf = await buildSubscriptionReceiptPdf({
      offeringName: offering.name,
      investorName,
      investorEmail: me.email ?? null,
      committedAmount: committed,
      commitmentType: commitmentType as "Soft" | "Hard",
      signedName,
      signedAt: now,
      receiptId: sub.id,
    });
    receiptObjectPath = await putPrivateObject(pdf, {
      subdir: "receipts",
      ext: ".pdf",
      contentType: "application/pdf",
    });
  } catch (err) {
    console.error("[subscribe] receipt build failed", err);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const subDoc = await prisma.subscriptionDocument.create({
    data: {
      subscriptionId: sub.id,
      kind: SubscriptionDocKind.Receipt,
      objectPath: receiptObjectPath,
      signedAt: now,
      signedName,
      signedIp: ip,
    },
  });

  // Mirror into InvestorDocument so it lands in the investor's vault.
  let receiptDocId: string | null = null;
  if (receiptObjectPath) {
    const mirror = await prisma.investorDocument.create({
      data: {
        companyId: me.companyId,
        investorId: me.id,
        offeringId,
        name: `Subscription receipt — ${offering.name}.pdf`,
        docType: InvestorDocType.Agreement,
        objectPath: receiptObjectPath,
        uploadedById: me.id,
      },
    });
    receiptDocId = mirror.id;
  }

  await notifyInvestor({
    investorId: me.id,
    event: "subscription",
    eventType: InvestorActivityType.Subscription,
    title: `Subscription submitted — ${offering.name}`,
    description: `Committed $${Math.round(committed).toLocaleString()} (${commitmentType.toLowerCase()}). Funding instructions are on the deal funding page.`,
    link: `/investments/${offeringId}/funding`,
    relatedSubscriptionId: sub.id,
    relatedDocumentId: receiptDocId ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    subscriptionId: sub.id,
    receiptDocumentId: receiptDocId,
    subscriptionDocumentId: subDoc.id,
  });
}
