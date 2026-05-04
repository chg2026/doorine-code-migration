import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { getInvestorDocuments } from "@/lib/portfolio";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string; type?: string; doc?: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const sp = await searchParams;
  const docs = await getInvestorDocuments(investor.id);

  const rows = docs.map((d) => ({
    id: d.id,
    name: d.name,
    docType: d.docType,
    offeringId: d.offeringId,
    offeringName: d.offering ? d.offering.name : null,
    uploadedAt: d.uploadedAt.toISOString(),
    sizeBytes: d.sizeBytes,
    taxYear: d.taxYear,
    // `?doc=ID` from a deep-link → flag that single doc as "new" so it
    // visually pops in the table. Otherwise: viewedAt is the source of truth.
    isNew: d.viewedAt === null || d.id === sp.doc,
  }));

  return (
    <PortalPage
      title="Documents"
      subtitle="PPMs, agreements, statements, and K-1s for your deals"
    >
      {rows.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No documents yet</div>
          Documents shared with you by the operator — PPMs, statements, K-1s,
          and more — will appear here.
        </div>
      ) : (
        <DocumentsClient
          docs={rows}
          initialDeal={sp.deal || null}
          initialType={sp.type || null}
          focusDocId={sp.doc || null}
        />
      )}
    </PortalPage>
  );
}
