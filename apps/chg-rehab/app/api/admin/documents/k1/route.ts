import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { InvestorActivityType, InvestorDocType } from "@prisma/client";
import { notifyInvestor } from "@/lib/notifyInvestor";

export const dynamic = "force-dynamic";

/**
 * Bulk-create K-1 InvestorDocument rows for one offering + tax year. The
 * client uploads each PDF via the standard `getUploadUrl` flow and then
 * POSTs the resulting `objectPath` along with the target investorId here,
 * one row per investor in the offering. Each successful row triggers a
 * notifyInvestor("document") fan-out so the K-1 immediately surfaces in
 * the investor's activity feed and (if opted-in) email.
 *
 * Body: {
 *   offeringId: string,
 *   taxYear: number,
 *   files: [{ investorId: string, objectPath: string, name?: string, sizeBytes?: number }]
 * }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const offeringId = typeof body.offeringId === "string" ? body.offeringId : "";
  const taxYear = Number(body.taxYear);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!offeringId || !Number.isFinite(taxYear) || taxYear < 1900 || taxYear > 2100)
    return NextResponse.json({ error: "offeringId + valid taxYear required" }, { status: 400 });
  if (files.length === 0)
    return NextResponse.json({ error: "no files" }, { status: 400 });

  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, companyId: me.companyId },
    select: { id: true, name: true, companyId: true },
  });
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const created: { id: string; investorId: string }[] = [];
  for (const raw of files) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const investorId = typeof f.investorId === "string" ? f.investorId : "";
    const objectPath = typeof f.objectPath === "string" ? f.objectPath : "";
    if (!investorId || !objectPath) continue;
    const name =
      typeof f.name === "string" && f.name
        ? f.name
        : `K-1 ${taxYear} — ${offering.name}.pdf`;
    const sizeBytes =
      typeof f.sizeBytes === "number" && Number.isFinite(f.sizeBytes)
        ? Math.floor(f.sizeBytes)
        : null;

    // Validate investor belongs to this company.
    const inv = await prisma.investor.findFirst({
      where: { id: investorId, companyId: me.companyId },
      select: { id: true },
    });
    if (!inv) continue;

    const doc = await prisma.investorDocument.create({
      data: {
        companyId: me.companyId,
        investorId,
        offeringId,
        name,
        docType: InvestorDocType.TaxK1,
        objectPath,
        sizeBytes,
        uploadedById: me.id,
        taxYear,
      },
    });
    created.push({ id: doc.id, investorId });
  }

  // Notify investors after the writes so a flaky mailer can't undo uploads.
  await Promise.all(
    created.map((c) =>
      notifyInvestor({
        investorId: c.investorId,
        event: "document",
        eventType: InvestorActivityType.Document,
        title: `K-1 available — ${offering.name}`,
        description: `Your ${taxYear} K-1 has been uploaded to your Tax Center.`,
        link: `/documents/tax`,
        relatedDocumentId: c.id,
      })
    )
  );

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "k1_bulk_upload",
      entity: "InvestorDocument",
      meta: { offeringId, taxYear, count: created.length },
    },
  });

  return NextResponse.json({ ok: true, count: created.length });
}
