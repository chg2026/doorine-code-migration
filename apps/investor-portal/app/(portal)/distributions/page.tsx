import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import {
  fmtMoney,
  fmtDate,
  getInvestorDistributions,
  num,
} from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CashFlow: "Cash flow",
  Refinance: "Refinance",
  Sale: "Sale",
  ReturnOfCapital: "Return of capital",
};

function statusPill(status: string) {
  switch (status) {
    case "Sent":
    case "Paid":
      return <span className="pill pill-g">Paid</span>;
    case "Pending":
      return <span className="pill pill-a">Pending</span>;
    case "Failed":
      return <span className="pill pill-r">Failed</span>;
    default:
      return <span className="pill pill-gray">{status}</span>;
  }
}

export default async function DistributionsPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const allocs = await getInvestorDistributions(investor.id);

  const totalPaid = allocs
    .filter((a) => a.status === "Sent")
    .reduce((sum, a) => sum + num(a.amount), 0);
  const ytdPaid = (() => {
    const yr = new Date().getFullYear();
    return allocs
      .filter(
        (a) =>
          a.status === "Sent" &&
          a.distribution.paidOn &&
          a.distribution.paidOn.getFullYear() === yr
      )
      .reduce((sum, a) => sum + num(a.amount), 0);
  })();
  const lastPaidOn = allocs.find((a) => a.distribution.paidOn)?.distribution.paidOn ?? null;

  return (
    <PortalPage
      title="Distributions"
      subtitle="History of all distributions paid across your subscriptions"
    >
      {allocs.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No distributions yet</div>
          Distributions paid by your active deals will appear here as soon as
          the operator records them.
        </div>
      ) : (
        <>
          <div className="g3" style={{ marginBottom: 10 }}>
            <div className="kpi">
              <div className="kpi-l">Lifetime received</div>
              <div className="kpi-v green">{fmtMoney(totalPaid)}</div>
              <div className="kpi-s">across {allocs.length} payouts</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Year-to-date</div>
              <div className="kpi-v">{fmtMoney(ytdPaid)}</div>
              <div className="kpi-s">{new Date().getFullYear()}</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Last distribution</div>
              <div className="kpi-v">{fmtDate(lastPaidOn)}</div>
              <div className="kpi-s">most recent payout</div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">Distribution history</div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Deal</th>
                  <th style={{ width: "14%" }}>Period</th>
                  <th style={{ width: "16%" }}>Type</th>
                  <th style={{ width: "14%" }}>Paid on</th>
                  <th style={{ width: "16%" }}>Allocation</th>
                  <th style={{ width: "14%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {allocs.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="row-title">{a.distribution.offering.name}</div>
                      {a.wireRef ? (
                        <div className="row-sub">Wire {a.wireRef}</div>
                      ) : null}
                    </td>
                    <td>{a.distribution.periodLabel}</td>
                    <td>
                      {TYPE_LABEL[a.distribution.distributionType] ||
                        a.distribution.distributionType}
                    </td>
                    <td>{fmtDate(a.distribution.paidOn)}</td>
                    <td className="green">{fmtMoney(num(a.amount))}</td>
                    <td>{statusPill(a.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PortalPage>
  );
}
