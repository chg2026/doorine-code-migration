import Link from "next/link";
import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney, fmtDate, fmtPct, num } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  MF: "Multifamily",
  SF: "Single family",
  MX: "Mixed-use",
  Other: "Other",
};

export default async function MarketplacePage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  // Marketplace = open-for-raise deals the investor has NOT subscribed to yet.
  // Existing subscriptions live on /investments; the marketplace surface is
  // intentionally a "discovery" feed of new opportunities only.
  const offerings = await prisma.offering.findMany({
    where: {
      companyId: investor.companyId,
      status: "Active",
      stage: "Raise",
      subscriptions: { none: { investorId: investor.id } },
    },
    orderBy: [{ closeDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <PortalPage
      title="Marketplace"
      subtitle="Open offerings — browse and submit a soft or hard commitment"
    >
      {offerings.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No open offerings right now</div>
          When the operator opens a new deal for raise, it will appear here.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {offerings.map((o) => {
            const target = o.raiseTarget ? num(o.raiseTarget) : 0;
            const raised = (o.raisedToHard ? num(o.raisedToHard) : 0);
            const pct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;
            const lo = o.targetIrrLow !== null ? num(o.targetIrrLow) : null;
            const hi = o.targetIrrHigh !== null ? num(o.targetIrrHigh) : null;
            const irrRange =
              lo !== null && hi !== null
                ? `${lo.toFixed(1)}–${hi.toFixed(1)}%`
                : lo !== null
                ? `${lo.toFixed(1)}%`
                : hi !== null
                ? `${hi.toFixed(1)}%`
                : "—";
            return (
              <Link
                key={o.id}
                href={`/marketplace/${o.id}`}
                className="card"
                style={{ display: "block", color: "inherit", textDecoration: "none" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="pill pill-b">Raising</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  {o.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
                  {PROPERTY_TYPE_LABEL[o.propertyType] || "Other"}
                  {o.marketCity ? ` · ${o.marketCity}` : ""}
                  {o.marketState ? ` ${o.marketState}` : ""}
                </div>

                <div className="g2" style={{ gap: 6 }}>
                  <div className="kpi" style={{ padding: "8px 10px" }}>
                    <div className="kpi-l">Target IRR</div>
                    <div className="kpi-v" style={{ fontSize: 15 }}>{irrRange}</div>
                  </div>
                  <div className="kpi" style={{ padding: "8px 10px" }}>
                    <div className="kpi-l">Min investment</div>
                    <div className="kpi-v" style={{ fontSize: 15 }}>
                      {o.minInvestment ? fmtMoney(num(o.minInvestment)) : "—"}
                    </div>
                  </div>
                </div>

                {target > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <span>{fmtMoney(raised)} hard committed</span>
                      <span>{fmtPct(pct, 0)} of {fmtMoney(target)}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--teal)" }} />
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10, color: "var(--text-tertiary)" }}>
                  <span>Pref {o.prefReturnPct !== null ? fmtPct(num(o.prefReturnPct)) : "—"}</span>
                  <span>{o.holdMonths ? `${o.holdMonths} mo hold` : ""}</span>
                  <span>{o.closeDate ? `Closes ${fmtDate(o.closeDate)}` : ""}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PortalPage>
  );
}
