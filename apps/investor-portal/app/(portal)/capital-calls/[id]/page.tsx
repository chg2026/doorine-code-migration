import Link from "next/link";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import CapitalCallActions from "./CapitalCallActions";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney, fmtDate, num } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function CapitalCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;
  const { id } = await params;

  const call = await prisma.capitalCall.findUnique({
    where: { id },
    include: {
      offering: true,
      allocations: {
        include: { subscription: { select: { investorId: true, id: true } } },
      },
    },
  });
  if (!call || call.offering.companyId !== investor.companyId) notFound();

  const myAlloc = call.allocations.find(
    (a) => a.subscription.investorId === investor.id
  );
  if (!myAlloc) notFound();

  const wi = (call.offering.wireInstructions || null) as
    | { bankName?: string; routingNumber?: string; accountNumber?: string; beneficiary?: string; swift?: string; memo?: string }
    | null;

  const due = num(myAlloc.amountDue);
  const received = num(myAlloc.amountReceived);
  const remaining = Math.max(0, due - received);
  const isPaidByOperator = received >= due && due > 0;
  const isInvestorAttested = !!myAlloc.receivedAt;

  return (
    <PortalPage
      title={`Capital call · Notice ${call.noticeNumber}`}
      subtitle={call.offering.name}
    >
      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <Link href={`/investments/${call.offeringId}`} className="btn btn-sm">← Deal detail</Link>
        <Link href="/activity" className="btn btn-sm">Activity feed</Link>
      </div>

      <div className="g4" style={{ marginBottom: 10 }}>
        <div className="kpi">
          <div className="kpi-l">Your share due</div>
          <div className="kpi-v">{fmtMoney(due)}</div>
          <div className="kpi-s">of ${call.totalAmount.toString()} total call</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Received</div>
          <div className="kpi-v green">{fmtMoney(received)}</div>
          <div className="kpi-s">{isPaidByOperator ? "complete" : "pending"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Remaining</div>
          <div className={`kpi-v ${remaining > 0 ? "amber" : ""}`}>{fmtMoney(remaining)}</div>
          <div className="kpi-s">{call.dueDate ? `due ${fmtDate(call.dueDate)}` : "no due date"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Status</div>
          <div className="kpi-v">{call.status}</div>
          <div className="kpi-s">{call.issuedAt ? `issued ${fmtDate(call.issuedAt)}` : "—"}</div>
        </div>
      </div>

      {call.memo ? (
        <div className="card">
          <div className="card-hd"><div className="card-title">Notice memo</div></div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {call.memo}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Wire / ACH instructions</div>
        </div>
        {!wi ? (
          <div className="empty-state">
            Wire instructions for this deal have not been published yet.
            The operator will email them with the formal call notice.
          </div>
        ) : (
          <table className="tbl">
            <tbody>
              <tr><td style={{ width: 180, color: "var(--text-secondary)" }}>Bank name</td><td>{wi.bankName || "—"}</td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Routing number</td><td><code>{wi.routingNumber || "—"}</code></td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Account number</td><td><code>{wi.accountNumber || "—"}</code></td></tr>
              <tr><td style={{ color: "var(--text-secondary)" }}>Beneficiary</td><td>{wi.beneficiary || "—"}</td></tr>
              <tr>
                <td style={{ color: "var(--text-secondary)" }}>Reference</td>
                <td><code>{`${call.noticeNumber} — ${call.offering.name}`}</code></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <CapitalCallActions
        callId={call.id}
        attested={isInvestorAttested}
        amountDue={due}
        offeringName={call.offering.name}
      />
    </PortalPage>
  );
}
