import Link from "next/link";
import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import {
  fmtMoney,
  fmtPct,
  fmtDate,
  getInvestorSubscriptions,
  num,
  summarizePortfolio,
} from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  MF: "Multifamily",
  SF: "Single family",
  MX: "Mixed-use",
  Other: "Other",
};

function statusPill(status: string) {
  switch (status) {
    case "Active":
      return <span className="pill pill-g">Active</span>;
    case "Closed":
      return <span className="pill pill-gray">Closed</span>;
    case "Pending":
      return <span className="pill pill-a">Pending</span>;
    default:
      return <span className="pill pill-gray">{status}</span>;
  }
}

function stagePill(stage: string) {
  switch (stage) {
    case "Raise":
      return <span className="pill pill-b">Raising</span>;
    case "Closing":
      return <span className="pill pill-a">Closing</span>;
    case "Closed":
      return <span className="pill pill-g">Closed</span>;
    case "Diligence":
      return <span className="pill pill-p">Diligence</span>;
    case "Prospecting":
      return <span className="pill pill-gray">Prospecting</span>;
    default:
      return <span className="pill pill-gray">{stage}</span>;
  }
}

export default async function InvestmentsPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const subs = await getInvestorSubscriptions(investor.id);
  const t = summarizePortfolio(subs);

  return (
    <PortalPage title="My investments" subtitle="All deals you have committed to">
      {subs.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No investments yet</div>
          Once you subscribe to an offering, the deal and your committed amount
          will appear here.
        </div>
      ) : (
        <>
          <div className="g3" style={{ marginBottom: 10 }}>
            <div className="kpi">
              <div className="kpi-l">Total committed</div>
              <div className="kpi-v">{fmtMoney(t.totalCommitted)}</div>
              <div className="kpi-s">{fmtMoney(t.totalFunded)} funded</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Active deals</div>
              <div className="kpi-v">{t.activeCount}</div>
              <div className="kpi-s">
                of {t.totalCount} total {t.totalCount === 1 ? "subscription" : "subscriptions"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Total returns</div>
              <div className={`kpi-v ${t.totalGain + t.totalDistributions >= 0 ? "green" : "red"}`}>
                {fmtMoney(t.totalDistributions + t.totalGain)}
              </div>
              <div className="kpi-s">
                distributions + value gain · avg IRR {fmtPct(t.avgIrr)}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">All investments</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="card-sub">
                  {t.totalCount} {t.totalCount === 1 ? "subscription" : "subscriptions"}
                </span>
                <Link href="/marketplace" className="btn btn-sm btn-p">
                  Browse marketplace
                </Link>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Deal</th>
                  <th style={{ width: "13%" }}>Invested</th>
                  <th style={{ width: "13%" }}>Current value</th>
                  <th style={{ width: "10%" }}>IRR</th>
                  <th style={{ width: "10%" }}>CoC</th>
                  <th style={{ width: "12%" }}>Stage</th>
                  <th style={{ width: "12%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const irr = s.irrToDate !== null ? num(s.irrToDate) : null;
                  const coc = s.cocToDate !== null ? num(s.cocToDate) : null;
                  const value =
                    s.currentValue !== null ? num(s.currentValue) : num(s.fundedAmount);
                  const funded = num(s.fundedAmount);
                  const gain = value - funded;
                  return (
                    <tr key={s.id} id={`sub-${s.id}`} className="row-clickable">
                      <td style={{ position: "relative" }}>
                        <Link
                          href={`/investments/${s.offeringId}`}
                          className="row-link row-overlay"
                          aria-label={`Open ${s.offering.name}`}
                        />
                        <div className="row-title">{s.offering.name}</div>
                        <div className="row-sub">
                          {PROPERTY_TYPE_LABEL[s.offering.propertyType] || "Other"}
                          {s.offering.marketCity ? ` · ${s.offering.marketCity}` : ""}
                          {s.offering.marketState ? ` ${s.offering.marketState}` : ""}
                          {s.offering.closeDate
                            ? ` · closed ${fmtDate(s.offering.closeDate)}`
                            : ""}
                        </div>
                      </td>
                      <td>{fmtMoney(funded)}</td>
                      <td className={gain >= 0 ? "green" : "red"}>{fmtMoney(value)}</td>
                      <td className={irr === null ? "" : irr >= 0 ? "green" : "red"}>
                        {fmtPct(irr)}
                      </td>
                      <td>{fmtPct(coc)}</td>
                      <td>{stagePill(s.offering.stage)}</td>
                      <td>{statusPill(s.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PortalPage>
  );
}
