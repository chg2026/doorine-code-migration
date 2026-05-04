import Link from "next/link";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import SubscribeButton from "@/components/SubscribeButton";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney, fmtPct, fmtDate, num } from "@/lib/portfolio";

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
    case "Pending":
      return <span className="pill pill-a">Pending</span>;
    case "Closed":
      return <span className="pill pill-gray">Closed</span>;
    default:
      return <span className="pill pill-gray">{status}</span>;
  }
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const { offeringId } = await params;

  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: {
      subscriptions: {
        where: { investorId: investor.id },
        orderBy: { createdAt: "desc" },
      },
      updates: {
        where: { published: true },
        orderBy: { postedAt: "desc" },
        take: 5,
      },
    },
  });

  if (!offering) notFound();

  const sub = offering.subscriptions[0] || null;
  const inMarketplace = offering.stage === "Raise";
  // Visibility: must either own a subscription OR the offering is open.
  if (!sub && !inMarketplace) notFound();

  const [allocs, allDocs] = await Promise.all([
    sub
      ? prisma.distributionAllocation.findMany({
          where: { subscriptionId: sub.id },
          include: { distribution: true },
          orderBy: { distribution: { paidOn: "desc" } },
        })
      : Promise.resolve([]),
    prisma.investorDocument.findMany({
      where: {
        offeringId,
        OR: [{ investorId: null }, { investorId: investor.id }],
      },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  // Dedupe by objectPath (falling back to id) — the same underlying file may
  // be referenced by multiple InvestorDocument rows (e.g., one investor-
  // scoped record + one offering-scoped record pointing to the same blob).
  // Keep the most recent upload for each unique file, then cap at 10.
  const seenPaths = new Set<string>();
  const docs = allDocs
    .filter((d) => {
      const k = d.objectPath || d.id;
      if (seenPaths.has(k)) return false;
      seenPaths.add(k);
      return true;
    })
    .slice(0, 10);

  const targetLow = offering.targetIrrLow !== null ? num(offering.targetIrrLow) : null;
  const targetHigh = offering.targetIrrHigh !== null ? num(offering.targetIrrHigh) : null;
  const targetRange =
    targetLow !== null && targetHigh !== null
      ? `${targetLow.toFixed(1)}–${targetHigh.toFixed(1)}%`
      : targetLow !== null
      ? `${targetLow.toFixed(1)}%`
      : targetHigh !== null
      ? `${targetHigh.toFixed(1)}%`
      : "—";

  const subtitle = [
    PROPERTY_TYPE_LABEL[offering.propertyType] || "Other",
    offering.marketCity,
    offering.marketState,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PortalPage title={offering.name} subtitle={subtitle || "Deal detail"}>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/investments" className="btn btn-sm">← All investments</Link>
        <Link href={`/documents?deal=${offering.id}`} className="btn btn-sm">
          View documents
        </Link>
        <Link href={`/updates?deal=${offering.id}`} className="btn btn-sm">
          View updates
        </Link>
        {sub ? (
          <Link
            href={`/investments/${offering.id}/funding`}
            className="btn btn-sm"
            style={{ marginLeft: "auto" }}
          >
            Funding instructions →
          </Link>
        ) : null}
        {inMarketplace ? (
          <span style={{ marginLeft: sub ? 0 : "auto" }}>
            <SubscribeButton
              offeringId={offering.id}
              offeringName={offering.name}
              minInvestment={offering.minInvestment ? num(offering.minInvestment) : null}
              wireInstructions={(offering.wireInstructions as Record<string, unknown> | null) ?? null}
              label={sub ? "Adjust commitment" : "+ Subscribe to deal"}
            />
          </span>
        ) : null}
      </div>

      {sub ? (
        <div className="g4" style={{ marginBottom: 10 }}>
          <div className="kpi">
            <div className="kpi-l">My invested</div>
            <div className="kpi-v">{fmtMoney(num(sub.fundedAmount))}</div>
            <div className="kpi-s">of {fmtMoney(num(sub.committedAmount))} committed</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Ownership</div>
            <div className="kpi-v">
              {sub.ownershipPct !== null
                ? fmtPct(num(sub.ownershipPct))
                : offering.raiseTarget !== null && num(offering.raiseTarget) > 0
                ? fmtPct((num(sub.committedAmount) / num(offering.raiseTarget)) * 100)
                : "—"}
            </div>
            <div className="kpi-s">of total raise</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Distributions</div>
            <div className="kpi-v green">{fmtMoney(num(sub.lifetimeDistributions))}</div>
            <div className="kpi-s">CoC {fmtPct(sub.cocToDate !== null ? num(sub.cocToDate) : null)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Current IRR</div>
            <div className={`kpi-v ${sub.irrToDate !== null && num(sub.irrToDate) >= 0 ? "green" : "red"}`}>
              {fmtPct(sub.irrToDate !== null ? num(sub.irrToDate) : null)}
            </div>
            <div className="kpi-s">target {targetRange}</div>
          </div>
        </div>
      ) : (
        <div className="placeholder-card" style={{ marginBottom: 10 }}>
          <div className="placeholder-title">Open offering</div>
          You don&apos;t hold a subscription on this deal yet — it&apos;s shown here
          because it&apos;s currently raising. Subscribe via the Marketplace
          (Phase 4) to commit capital.
        </div>
      )}

      <div className="g2">
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Deal terms</div>
            {statusPill(offering.stage)}
          </div>
          <table className="tbl">
            <tbody>
              <tr><td>Stage</td><td>{offering.stage}</td></tr>
              <tr><td>Property type</td><td>{PROPERTY_TYPE_LABEL[offering.propertyType] || "Other"}</td></tr>
              <tr><td>Market</td><td>{[offering.marketCity, offering.marketState].filter(Boolean).join(", ") || "—"}</td></tr>
              <tr><td>Total raise</td><td>{offering.raiseTarget !== null ? fmtMoney(num(offering.raiseTarget)) : "—"}</td></tr>
              <tr><td>Min investment</td><td>{offering.minInvestment !== null ? fmtMoney(num(offering.minInvestment)) : "—"}</td></tr>
              <tr><td>Target IRR</td><td>{targetRange}</td></tr>
              <tr><td>Hold period</td><td>{offering.holdMonths !== null ? `${offering.holdMonths} months` : "—"}</td></tr>
              <tr><td>Pref return</td><td>{offering.prefReturnPct !== null ? fmtPct(num(offering.prefReturnPct)) : "—"}</td></tr>
              <tr><td>Close date</td><td>{fmtDate(offering.closeDate)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd">
            <div className="card-title">Recent updates</div>
            <Link href={`/updates?deal=${offering.id}`} className="btn btn-sm">All updates</Link>
          </div>
          {offering.updates.length === 0 ? (
            <div className="empty-state">No published updates for this deal yet.</div>
          ) : (
            offering.updates.map((u) => (
              <div key={u.id} className="feed-item">
                <div className="feed-dot" style={{ background: "#7F77DD" }}/>
                <div className="feed-body">
                  <div className="feed-title">
                    <Link href={`/updates?id=${u.id}`} style={{ color: "inherit" }}>{u.title}</Link>
                  </div>
                  <div className="feed-time">{fmtDate(u.postedAt)} · {u.updateType}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Distributions</div>
          {sub ? <span className="card-sub">{allocs.length} payouts</span> : null}
        </div>
        {!sub || allocs.length === 0 ? (
          <div className="empty-state">No distributions paid yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Type</th>
                <th>Paid on</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allocs.map((a) => (
                <tr key={a.id}>
                  <td>{a.distribution.periodLabel}</td>
                  <td>{a.distribution.distributionType}</td>
                  <td>{fmtDate(a.distribution.paidOn)}</td>
                  <td style={{ textAlign: "right" }} className="green">{fmtMoney(num(a.amount))}</td>
                  <td>
                    {a.status === "Sent" ? (
                      <span className="pill pill-g">Paid</span>
                    ) : (
                      <span className="pill pill-gray">{a.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Documents</div>
          <Link href={`/documents?deal=${offering.id}`} className="btn btn-sm">All documents</Link>
        </div>
        {docs.length === 0 ? (
          <div className="empty-state">No documents shared on this deal yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Uploaded</th><th></th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td><div className="row-title">{d.name}</div></td>
                  <td>{d.docType}</td>
                  <td>{fmtDate(d.uploadedAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/documents?doc=${d.id}`} className="btn btn-sm">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  );
}
