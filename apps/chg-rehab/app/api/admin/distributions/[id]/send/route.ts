import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  DistributionAllocationStatus,
  DistributionStatus,
  InvestorActivityType,
  InvestorDocType,
} from "@prisma/client";
import { notifyInvestor } from "@/lib/notifyInvestor";
import { buildDistributionStatementPdf } from "@/lib/distributionStatementPdf";
import { putPrivateObject } from "@/lib/objectStorageWrite";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dist = await prisma.distribution.findUnique({
    where: { id },
    include: {
      offering: { select: { companyId: true, name: true } },
      allocations: {
        include: {
          subscription: { select: { investorId: true, id: true } },
        },
      },
    },
  });
  if (!dist || dist.offering.companyId !== me.companyId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.distribution.update({
      where: { id },
      data: {
        status: DistributionStatus.Sent,
        paidOn: dist.paidOn || new Date(),
      },
    });
    for (const a of dist.allocations) {
      await tx.distributionAllocation.update({
        where: { id: a.id },
        data: { status: DistributionAllocationStatus.Sent },
      });
      await tx.investorSubscription.update({
        where: { id: a.subscription.id },
        data: {
          lifetimeDistributions: {
            increment: Number(a.amount),
          },
        },
      });
    }
  });

  // Per-investor PDF statement: build, persist to object storage, mirror as
  // an InvestorDocument(Statement), and attach to the outbound email. Each
  // step is wrapped so a single bad allocation can't block the rest of the
  // fan-out.
  await Promise.all(
    dist.allocations.map(async (a) => {
      const investor = await prisma.investor.findUnique({
        where: { id: a.subscription.investorId },
        select: { id: true, firstName: true, lastName: true, email: true, companyId: true },
      });
      if (!investor) return;
      const investorName =
        [investor.firstName, investor.lastName].filter(Boolean).join(" ") ||
        investor.email ||
        "Investor";

      let pdfBuf: Uint8Array | null = null;
      let objectPath: string | null = null;
      try {
        pdfBuf = await buildDistributionStatementPdf({
          offeringName: dist.offering.name,
          investorName,
          investorEmail: investor.email,
          periodLabel: dist.periodLabel,
          distributionType: String(dist.distributionType),
          totalAmount: Number(dist.totalAmount),
          allocationAmount: Number(a.amount),
          perDollarRate: dist.perDollarRate ? Number(dist.perDollarRate) : null,
          paidOn: dist.paidOn,
          wireRef: a.wireRef ?? null,
          statementId: a.id,
        });
        objectPath = await putPrivateObject(pdfBuf, {
          subdir: "statements",
          ext: ".pdf",
          contentType: "application/pdf",
        });
      } catch (err) {
        console.error("[distribution:send] PDF build/store failed", a.id, err);
      }

      let mirroredDocId: string | null = null;
      if (objectPath) {
        const safeName = `Distribution ${dist.periodLabel} — ${dist.offering.name}.pdf`
          .replace(/[/\\]/g, "-");
        const mirrored = await prisma.investorDocument
          .create({
            data: {
              companyId: investor.companyId,
              investorId: investor.id,
              offeringId: dist.offeringId,
              name: safeName,
              docType: InvestorDocType.Statement,
              objectPath,
              uploadedById: me.id,
            },
          })
          .catch((err) => {
            console.error("[distribution:send] mirror failed", a.id, err);
            return null;
          });
        mirroredDocId = mirrored?.id ?? null;
      }

      await notifyInvestor({
        investorId: investor.id,
        event: "distribution",
        eventType: InvestorActivityType.Distribution,
        title: `Distribution received — ${dist.offering.name}`,
        description: `${dist.periodLabel}: $${Number(a.amount).toLocaleString()}`,
        link: `/distributions/${dist.id}`,
        relatedSubscriptionId: a.subscription.id,
        relatedDocumentId: mirroredDocId ?? undefined,
        ...(pdfBuf
          ? {
              attachments: [
                {
                  filename: `Distribution-${dist.periodLabel}.pdf`.replace(/\s+/g, "-"),
                  content: pdfBuf,
                  contentType: "application/pdf",
                },
              ],
            }
          : {}),
      });
    })
  );

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "distribution_sent",
      entity: "Distribution",
      entityId: id,
    },
  });
  return NextResponse.json({ ok: true });
}
