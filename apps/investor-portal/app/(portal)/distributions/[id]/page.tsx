import Link from "next/link";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney, fmtDate, num } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CashFlow: "Cash flow",
  ReturnOfCapital: "Return of capital",
  Sale: "Sale proceeds",
};

export default async function DistributionStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;
  const { id } = await params;

  const dist = await prisma.distribution.findUnique({
    where: { id },
    include: {
      offering: true,
      allocations: {
        where: { subscription: { investorId: investor.id } },
        include: { subscription: true },
      },
    },
  });
  if (!dist || dist.offering.companyId !== investor.companyId) notFound();
  const myAlloc = dist.allocations[0];
  if (!myAlloc) notFound();

  const total = num(dist.totalAmount);
  const myAmount = num(myAlloc.amount);
  const sharePct = total > 0 ? (myAmount / total) * 100 : 0;

  return (
    <PortalPage
      title={`Distribution · ${dist.periodLabel}`}
      subtitle={dist.offering.name}
    >
      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <Link href="/distributions" className="btn btn-sm">← All distributions</Link>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          style={{ marginLeft: "auto" }}
        >
          Print statement
        </button>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Statement</div>
          <span className="card-sub">{TYPE_LABEL[dist.distributionType] || dist.distributionType}</span>
        </div>
        <table className="tbl">
          <tbody>
            <tr><td style={{ width: 220, color: "var(--text-secondary)" }}>Deal</td><td>{dist.offering.name}</td></tr>
            <tr><td style={{ color: "var(--text-secondary)" }}>Period</td><td>{dist.periodLabel}</td></tr>
            <tr><td style={{ color: "var(--text-secondary)" }}>Type</td><td>{TYPE_LABEL[dist.distributionType] || dist.distributionType}</td></tr>
            <tr><td style={{ color: "var(--text-secondary)" }}>Distribution paid on</td><td>{fmtDate(dist.paidOn)}</td></tr>
            <tr><td style={{ color: "var(--text-secondary)" }}>Status</td><td>{dist.status}</td></tr>
            <tr><td style={{ color: "var(--text-secondary)" }}>Total distribution</td><td>{fmtMoney(total)}</td></tr>
            <tr>
              <td style={{ color: "var(--text-secondary)" }}>Per-dollar rate</td>
              <td>{dist.perDollarRate ? `$${num(dist.perDollarRate).toFixed(6)} / committed $` : "—"}</td>
            </tr>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <td style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Your allocation</td>
              <td style={{ fontWeight: 600 }}>
                <span className="green" style={{ fontSize: 16 }}>{fmtMoney(myAmount)}</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 8 }}>
                  ({sharePct.toFixed(2)}% share)
                </span>
              </td>
            </tr>
            {myAlloc.wireRef ? (
              <tr><td style={{ color: "var(--text-secondary)" }}>Wire reference</td><td><code>{myAlloc.wireRef}</code></td></tr>
            ) : null}
            <tr><td style={{ color: "var(--text-secondary)" }}>Allocation status</td><td>{myAlloc.status}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
        Vestry Capital · Distribution statement · Generated {new Date().toLocaleDateString()}
      </div>
    </PortalPage>
  );
}
