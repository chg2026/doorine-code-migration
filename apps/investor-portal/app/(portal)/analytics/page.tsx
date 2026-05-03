import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import {
  computeMonthlyDistributions,
  computeYtdDistributionTable,
  fmtMoney,
  fmtPct,
  getInvestorDistributions,
  getInvestorSubscriptions,
  irrByDealVsTarget,
  num,
  summarizePortfolio,
} from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const PROP_COLOR: Record<string, string> = {
  MF: "#185fa5",
  SF: "#1D9E75",
  MX: "#7F77DD",
  Other: "#A09E99",
};
const PROP_LABEL: Record<string, string> = {
  MF: "Multifamily",
  SF: "Single family",
  MX: "Mixed-use",
  Other: "Other",
};

export default async function AnalyticsPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const [subs, allocs] = await Promise.all([
    getInvestorSubscriptions(investor.id),
    getInvestorDistributions(investor.id),
  ]);

  if (subs.length === 0) {
    return (
      <PortalPage title="Analytics" subtitle="Performance breakdown across your portfolio">
        <div className="placeholder-card">
          <div className="placeholder-title">No analytics yet</div>
          Once you have funded subscriptions, IRR vs target, distribution
          history, and asset allocation will appear here.
        </div>
      </PortalPage>
    );
  }

  const totals = summarizePortfolio(subs);
  const monthly = computeMonthlyDistributions(allocs, 12);
  const ytd = computeYtdDistributionTable(subs, allocs);
  const irrRows = irrByDealVsTarget(subs);

  // Property-type allocation by funded $
  const allocByType = new Map<string, number>();
  for (const s of subs) {
    const k = s.offering.propertyType;
    allocByType.set(k, (allocByType.get(k) || 0) + num(s.fundedAmount));
  }
  const allocList = Array.from(allocByType.entries()).map(([k, v]) => ({
    type: k,
    label: PROP_LABEL[k] || k,
    color: PROP_COLOR[k] || "#A09E99",
    amount: v,
    pct: totals.totalFunded > 0 ? (v / totals.totalFunded) * 100 : 0,
  }));

  // Donut math (simple SVG pie via stroke-dasharray)
  const donutR = 56;
  const donutC = 2 * Math.PI * donutR;
  let donutOffset = 0;
  const donutSegments = allocList.map((a) => {
    const len = (a.pct / 100) * donutC;
    const seg = { color: a.color, len, offset: donutOffset, label: a.label, pct: a.pct };
    donutOffset += len;
    return seg;
  });

  const maxBar = Math.max(1, ...monthly.map((p) => p.amount));
  // Fixed 22% IRR axis per Phase-3 spec for visual parity with the
  // prototype. If a deal exceeds 22% (rare), expand just enough to fit.
  const maxIrrAxis = Math.max(
    22,
    ...irrRows.map((r) => Math.max(r.irr || 0, r.targetIrr || 0))
  );

  return (
    <PortalPage title="Analytics" subtitle="Performance breakdown across your portfolio">
      <div className="g4" style={{ marginBottom: 10 }}>
        <div className="kpi">
          <div className="kpi-l">Equity multiple</div>
          <div className="kpi-v">{totals.equityMultiple.toFixed(2)}x</div>
          <div className="kpi-s">distributions + value ÷ funded</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Average IRR</div>
          <div className={`kpi-v ${totals.avgIrr >= 0 ? "green" : "red"}`}>
            {fmtPct(totals.avgIrr)}
          </div>
          <div className="kpi-s">funded-weighted</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Average CoC</div>
          <div className="kpi-v">{fmtPct(totals.avgCoc)}</div>
          <div className="kpi-s">cash-on-cash, weighted</div>
        </div>
        <div className="kpi">
          <div className="kpi-l">Lifetime distributions</div>
          <div className="kpi-v green">{fmtMoney(totals.totalDistributions)}</div>
          <div className="kpi-s">{allocs.length} payouts</div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd">
            <div className="card-title">IRR vs target</div>
            <span className="card-sub">per deal</span>
          </div>
          <svg viewBox={`0 0 360 ${Math.max(120, irrRows.length * 32)}`} width="100%" height={Math.max(120, irrRows.length * 32)}>
            {irrRows.map((r, i) => {
              const y = i * 32 + 8;
              const irrPct = r.irr ?? 0;
              const tgtPct = r.targetIrr ?? 0;
              const irrW = (Math.max(0, irrPct) / maxIrrAxis) * 220;
              const tgtX = 110 + (Math.max(0, tgtPct) / maxIrrAxis) * 220;
              const color = irrPct >= tgtPct ? "#1D9E75" : irrPct >= 0 ? "#BA7517" : "#a32d2d";
              return (
                <g key={r.offeringId}>
                  <text x={0} y={y + 12} fontSize="10" fill="#6b6a66">
                    {r.dealName.length > 18 ? r.dealName.slice(0, 17) + "…" : r.dealName}
                  </text>
                  <rect x={110} y={y + 4} width={Math.max(2, irrW)} height={14} fill={color} rx="2" />
                  {r.targetIrr !== null ? (
                    <line
                      x1={tgtX} x2={tgtX} y1={y} y2={y + 22}
                      stroke="#1a1916" strokeDasharray="3 2" strokeWidth="1"
                    />
                  ) : null}
                  <text x={114 + Math.max(2, irrW)} y={y + 14} fontSize="9" fill="#1a1916">
                    {r.irr !== null ? fmtPct(r.irr) : "—"}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="chart-legend">
            <span><span className="legend-sw" style={{ background: "#1D9E75" }}/>At/above target</span>
            <span><span className="legend-sw" style={{ background: "#BA7517" }}/>Below target</span>
            <span><span style={{ borderTop: "1px dashed #1a1916", display: "inline-block", width: 12, marginRight: 4, verticalAlign: "middle" }}/>Target IRR</span>
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <div className="card-title">Asset allocation</div>
            <span className="card-sub">funded $ by property type</span>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={donutR} fill="none" stroke="#f0ede8" strokeWidth="16" />
              {donutSegments.map((s, i) => (
                <circle
                  key={i}
                  cx="70" cy="70" r={donutR}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeDasharray={`${s.len} ${donutC - s.len}`}
                  strokeDashoffset={-s.offset}
                  transform="rotate(-90 70 70)"
                />
              ))}
              <text x="70" y="68" textAnchor="middle" fontSize="11" fill="#6b6a66">Funded</text>
              <text x="70" y="84" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1a1916">
                {fmtMoney(totals.totalFunded)}
              </text>
            </svg>
            <div style={{ flex: 1, fontSize: 11 }}>
              {allocList.map((a) => (
                <div key={a.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--border-light)" }}>
                  <span><span className="legend-sw" style={{ background: a.color }}/>{a.label}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{fmtMoney(a.amount)} · {a.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Distributions — last 12 months</div>
          <span className="card-sub">total {fmtMoney(monthly.reduce((s, p) => s + p.amount, 0))}</span>
        </div>
        <div className="bar-chart">
          {monthly.map((p, i) => {
            // Highlight the most recent 3 months in brighter teal per spec.
            const isRecent = i >= monthly.length - 3;
            const cls = p.amount === 0
              ? "bar-col muted"
              : isRecent
              ? "bar-col recent"
              : "bar-col";
            return (
              <div
                key={i}
                className={cls}
                style={{ height: `${Math.max(2, (p.amount / maxBar) * 110)}px` }}
                title={`${p.label}: ${fmtMoney(p.amount)}`}
              />
            );
          })}
        </div>
        <div className="chart-axis">
          {monthly.map((p, i) => (<span key={i}>{p.label}</span>))}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Year-to-date distributions by deal</div>
          <span className="card-sub">{new Date().getFullYear()}</span>
        </div>
        {ytd.rows.length === 0 ? (
          <div className="empty-state">No distributions paid this year yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Deal</th>
                <th style={{ textAlign: "right" }}>Q1</th>
                <th style={{ textAlign: "right" }}>Q2</th>
                <th style={{ textAlign: "right" }}>Q3</th>
                <th style={{ textAlign: "right" }}>Q4</th>
                <th style={{ textAlign: "right" }}>YTD total</th>
                <th style={{ textAlign: "right" }}>CoC</th>
              </tr>
            </thead>
            <tbody>
              {ytd.rows.map((r) => (
                <tr key={r.offeringId}>
                  <td><div className="row-title">{r.dealName}</div></td>
                  <td style={{ textAlign: "right" }}>{r.q1 ? fmtMoney(r.q1) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.q2 ? fmtMoney(r.q2) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.q3 ? fmtMoney(r.q3) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.q4 ? fmtMoney(r.q4) : "—"}</td>
                  <td style={{ textAlign: "right" }} className="green">{fmtMoney(r.total)}</td>
                  <td style={{ textAlign: "right" }}>{fmtPct(r.cocPct)}</td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg-secondary)", fontWeight: 600 }}>
                <td>Totals</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(ytd.totals.q1)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(ytd.totals.q2)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(ytd.totals.q3)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(ytd.totals.q4)}</td>
                <td style={{ textAlign: "right" }} className="green">{fmtMoney(ytd.totals.total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  );
}
