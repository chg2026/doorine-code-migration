import Link from "next/link";
import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import {
  fmtMoney,
  fmtPct,
  fmtDate,
  getInvestorActivities,
  getInvestorSubscriptions,
  num,
  summarizePortfolio,
} from "@/lib/portfolio";
import DashboardToolbar from "./DashboardToolbar";

export const dynamic = "force-dynamic";

const ACTIVITY_DOT: Record<string, string> = {
  Distribution: "#1D9E75",
  Document: "#378ADD",
  Update: "#7F77DD",
  CapitalCall: "#BA7517",
  Other: "#A09E99",
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const sp = await searchParams;
  const dealParam = sp.deal || "all";

  const [allSubs, activities] = await Promise.all([
    getInvestorSubscriptions(investor.id),
    getInvestorActivities(investor.id, 6),
  ]);

  // Toolbar deal filter narrows the KPI strip + tables to a single deal,
  // letting investors slice their portfolio without leaving the dashboard.
  const subs =
    dealParam !== "all"
      ? allSubs.filter((s) => s.offeringId === dealParam)
      : allSubs;
  const dealOptions = allSubs.map((s) => ({ id: s.offeringId, name: s.offering.name }));
  // Dedupe deal options (an investor may have multiple subs on the same deal).
  const seen = new Set<string>();
  const uniqDeals = dealOptions.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  const t = summarizePortfolio(subs);

  const name = investor.firstName || investor.email || "investor";
  const subtitle = `Welcome back, ${name}`;

  return (
    <PortalPage title="Dashboard" subtitle={subtitle}>
      {allSubs.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No investments yet</div>
          You haven&apos;t subscribed to any offerings. Once you commit to a
          deal, your portfolio summary will show here.
        </div>
      ) : (
        <>
          <DashboardToolbar deals={uniqDeals} selectedDeal={dealParam} />
          <div className="g4" style={{ marginBottom: 10 }}>
            <div className="kpi">
              <div className="kpi-l">Total invested</div>
              <div className="kpi-v">{fmtMoney(t.totalFunded)}</div>
              <div className="kpi-s">
                across {t.totalCount} {t.totalCount === 1 ? "deal" : "deals"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Current value</div>
              <div className={`kpi-v ${t.totalGain >= 0 ? "green" : "red"}`}>
                {fmtMoney(t.totalCurrentValue)}
              </div>
              <div className="kpi-s">
                {t.totalGain >= 0 ? "↑" : "↓"} {fmtPct(Math.abs(t.totalGainPct))} total gain
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Total distributions</div>
              <div className="kpi-v green">{fmtMoney(t.totalDistributions)}</div>
              <div className="kpi-s">lifetime, all deals</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Avg cash-on-cash</div>
              <div className="kpi-v">{fmtPct(t.avgCoc)}</div>
              <div className="kpi-s">
                {t.activeCount} active {t.activeCount === 1 ? "deal" : "deals"}
              </div>
            </div>
          </div>

          <div className="g2">
            <div className="card">
              <div className="card-hd">
                <div className="card-title">My investments</div>
                <Link href="/investments" className="btn btn-sm">View all</Link>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Property</th>
                    <th style={{ width: "20%" }}>Invested</th>
                    <th style={{ width: "14%" }}>IRR</th>
                    <th style={{ width: "22%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 6).map((s) => {
                    const irr = s.irrToDate !== null ? num(s.irrToDate) : null;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="row-title">{s.offering.name}</div>
                          <div className="row-sub">
                            {s.offering.propertyType === "MF"
                              ? "Multifamily"
                              : s.offering.propertyType === "SF"
                              ? "Single family"
                              : s.offering.propertyType === "MX"
                              ? "Mixed-use"
                              : "Other"}
                            {s.offering.marketCity ? ` · ${s.offering.marketCity}` : ""}
                            {s.offering.marketState ? ` ${s.offering.marketState}` : ""}
                          </div>
                        </td>
                        <td>{fmtMoney(num(s.fundedAmount))}</td>
                        <td className={irr === null ? "" : irr >= 0 ? "green" : "red"}>
                          {fmtPct(irr)}
                        </td>
                        <td>{statusPill(s.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="card-hd">
                <div className="card-title">Recent activity</div>
                <Link href="/updates" className="btn btn-sm">Updates</Link>
              </div>
              {activities.length === 0 ? (
                <div className="empty-state">No activity yet.</div>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="feed-item">
                    <div
                      className="feed-dot"
                      style={{ background: ACTIVITY_DOT[a.eventType] || "#A09E99" }}
                    />
                    <div className="feed-body">
                      <div className="feed-title">{a.title}</div>
                      {a.description ? (
                        <div className="feed-desc">{a.description}</div>
                      ) : null}
                      <div className="feed-time">{fmtDate(a.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </PortalPage>
  );
}
