import Link from "next/link";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import FundingActions from "./FundingActions";
import CopyableValue from "@/components/CopyableValue";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney, num } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function FundingPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;
  const { offeringId } = await params;

  const sub = await prisma.investorSubscription.findFirst({
    where: { investorId: investor.id, offeringId },
    include: {
      offering: true,
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!sub) notFound();

  const wi = (sub.offering.wireInstructions || null) as
    | {
        bankName?: string;
        routingNumber?: string;
        accountNumber?: string;
        beneficiary?: string;
        swift?: string;
        memo?: string;
      }
    | null;

  return (
    <PortalPage
      title="Funding instructions"
      subtitle={sub.offering.name}
    >
      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <Link href={`/investments/${offeringId}`} className="btn btn-sm">← Deal detail</Link>
      </div>

      <div className="g3" style={{ marginBottom: 10 }}>
        <div className="kpi">
          <div className="kpi-l">Committed</div>
          <div className="kpi-v">{fmtMoney(num(sub.committedAmount))}</div>
          <div className="kpi-s">{sub.commitmentType} commit</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Funded</div>
          <div className="kpi-v">{fmtMoney(num(sub.fundedAmount))}</div>
          <div className="kpi-s">
            {num(sub.fundedAmount) >= num(sub.committedAmount) ? "fully funded" : "partial"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Status</div>
          <div className="kpi-v">{sub.status}</div>
          <div className="kpi-s">
            {sub.signedAt ? `signed ${sub.signedAt.toLocaleDateString()}` : "—"}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Wire / ACH instructions</div>
          <span className="card-sub">For your reference only</span>
        </div>
        {!wi ? (
          <div className="empty-state">
            The operator has not yet published wire instructions for this deal.
            They will be emailed to you separately and will appear here once
            posted.
          </div>
        ) : (
          <table className="tbl">
            <tbody>
              <tr><td style={{ width: 180, color: "var(--text-secondary)" }}>Bank name</td><td><CopyableValue value={wi.bankName || ""} mono={false} /></td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Routing number</td><td><CopyableValue value={wi.routingNumber || ""} /></td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Account number</td><td><CopyableValue value={wi.accountNumber || ""} /></td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Beneficiary</td><td><CopyableValue value={wi.beneficiary || ""} mono={false} /></td></tr>
              {wi.swift ? <tr><td style={{ color: "var(--text-secondary)" }}>SWIFT</td><td><CopyableValue value={wi.swift} /></td></tr> : null}
              <tr>
                <td style={{ color: "var(--text-secondary)" }}>Wire reference</td>
                <td>{wi.memo ? <CopyableValue value={wi.memo} /> : <em>Use your name + &ldquo;{sub.offering.name}&rdquo;</em>}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Always confirm wire details by phone with the operator before sending
          funds. Vestry will never email you new wire instructions out of the blue.
        </div>
      </div>

      <FundingActions subscriptionId={sub.id} offeringName={sub.offering.name} />

      {sub.documents.length > 0 ? (
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Subscription documents</div>
            <span className="card-sub">{sub.documents.length} on file</span>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Kind</th><th>Signed by</th><th>Signed at</th><th></th></tr>
            </thead>
            <tbody>
              {sub.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.kind}</td>
                  <td>{d.signedName || "—"}</td>
                  <td>{d.signedAt ? d.signedAt.toLocaleDateString() : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/documents`} className="btn btn-sm">Open in vault</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PortalPage>
  );
}
