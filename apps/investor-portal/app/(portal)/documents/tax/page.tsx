import Link from "next/link";
import PortalPage from "@/components/PortalPage";
import TaxCenterClient from "./TaxCenterClient";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TaxCenterPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const docs = await prisma.investorDocument.findMany({
    where: {
      investorId: investor.id,
      docType: "TaxK1",
    },
    include: { offering: { select: { id: true, name: true } } },
    orderBy: [{ taxYear: "desc" }, { uploadedAt: "desc" }],
  });

  const rows = docs.map((d) => ({
    id: d.id,
    name: d.name,
    offeringId: d.offeringId,
    offeringName: d.offering?.name || null,
    taxYear: d.taxYear,
    uploadedAt: d.uploadedAt.toISOString(),
    sizeBytes: d.sizeBytes,
    isNew: d.viewedAt === null,
  }));

  return (
    <PortalPage
      title="K-1 Tax Center"
      subtitle="Your annual K-1s grouped by tax year"
    >
      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <Link href="/documents" className="btn btn-sm">← All documents</Link>
      </div>
      {rows.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No K-1s on file yet</div>
          When the operator publishes your annual K-1s they will appear here,
          grouped by tax year, with a one-click bulk download.
        </div>
      ) : (
        <TaxCenterClient rows={rows} />
      )}
    </PortalPage>
  );
}
