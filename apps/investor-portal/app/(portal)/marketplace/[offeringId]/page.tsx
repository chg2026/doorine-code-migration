import Link from "next/link";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import SubscribeButton from "@/components/SubscribeButton";
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

export default async function MarketplaceDealPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;
  const { offeringId } = await params;

  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, companyId: investor.companyId },
    include: {
      subscriptions: {
        where: { investorId: investor.id },
      },
    },
  });
  if (!offering) notFound();
  if (offering.status !== "Active") notFound();

  // Subscribe API only accepts stage=Raise; mirror that here so the UI affordance
  // doesn't promise something the API rejects.
  const isOpen = offering.stage === "Raise";
  const sub = offering.subscriptions[0] || null;
  const target = offering.raiseTarget ? num(offering.raiseTarget) : 0;
  const raised = offering.raisedToHard ? num(offering.raisedToHard) : 0;
  const pct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;
  const lo = offering.targetIrrLow !== null ? num(offering.targetIrrLow) : null;
  const hi = offering.targetIrrHigh !== null ? num(offering.targetIrrHigh) : null;
  const irrRange =
    lo !== null && hi !== null
      ? `${lo.toFixed(1)}–${hi.toFixed(1)}%`
      : lo !== null
      ? `${lo.toFixed(1)}%`
      : hi !== null
      ? `${hi.toFixed(1)}%`
      : "—";
  const subtitle = [
    PROPERTY_TYPE_LABEL[offering.propertyType] || "Other",
    offering.marketCity,
    offering.marketState,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PortalPage title={offering.name} subtitle={subtitle || "Marketplace deal"}>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/marketplace" className="btn btn-sm">← Marketplace</Link>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {sub ? (
            <Link href={`/investments/${offering.id}/funding`} className="btn btn-sm">
              Funding instructions →
            </Link>
          ) : null}
          {isOpen ? (
            <SubscribeButton
              offeringId={offering.id}
              offeringName={offering.name}
              minInvestment={offering.minInvestment ? num(offering.minInvestment) : null}
              wireInstructions={(offering.wireInstructions as Record<string, unknown> | null) ?? null}
              label={sub ? "Adjust commitment" : "+ Subscribe to deal"}
            />
          ) : (
            <button type="button" disabled className="btn btn-sm btn-disabled">
              Closed to new investment
            </button>
          )}
        </div>
      </div>

      {sub ? (
        <div className="card" style={{ background: "var(--teal-light)", borderColor: "var(--teal)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-dark)" }}>
                You hold a {sub.commitmentType.toLowerCase()} commitment of {fmtMoney(num(sub.committedAmount))}.
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                Status: {sub.status} · Funded: {fmtMoney(num(sub.fundedAmount))}
              </div>
            </div>
            <Link href={`/investments/${offering.id}`} className="btn btn-sm">
              Open deal →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="g2">
        <div className="card">
          <div className="card-hd"><div className="card-title">Deal terms</div></div>
          <table className="tbl">
            <tbody>
              <tr><td>Stage</td><td>{offering.stage}</td></tr>
              <tr><td>Property type</td><td>{PROPERTY_TYPE_LABEL[offering.propertyType] || "Other"}</td></tr>
              <tr><td>Market</td><td>{[offering.marketCity, offering.marketState].filter(Boolean).join(", ") || "—"}</td></tr>
              <tr><td>Total raise</td><td>{target > 0 ? fmtMoney(target) : "—"}</td></tr>
              <tr><td>Min investment</td><td>{offering.minInvestment ? fmtMoney(num(offering.minInvestment)) : "—"}</td></tr>
              <tr><td>Target IRR</td><td>{irrRange}</td></tr>
              <tr><td>Pref return</td><td>{offering.prefReturnPct !== null ? fmtPct(num(offering.prefReturnPct)) : "—"}</td></tr>
              <tr><td>Hold period</td><td>{offering.holdMonths !== null ? `${offering.holdMonths} months` : "—"}</td></tr>
              <tr><td>Close date</td><td>{fmtDate(offering.closeDate)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd">
            <div className="card-title">Raise progress</div>
            <span className="card-sub">{fmtPct(pct, 0)} of target</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>
              <span>{fmtMoney(raised)} hard committed</span>
              <span>{target > 0 ? fmtMoney(target) : "—"} target</span>
            </div>
            <div style={{ height: 10, background: "var(--bg-tertiary)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--teal)" }} />
            </div>
          </div>
          {offering.description ? (
            <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.55, marginTop: 16, whiteSpace: "pre-wrap" }}>
              {offering.description}
            </div>
          ) : null}
        </div>
      </div>
    </PortalPage>
  );
}
