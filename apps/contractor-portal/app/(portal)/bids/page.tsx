import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BidsPage() {
  const c = (await getCurrentContractor())!;
  const invitations = await prisma.cpBidInvitation.findMany({
    where: { invitedAccountId: c.id },
    include: { fromCompany: { select: { name: true } }, proposals: { where: { fromAccountId: c.id } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PortalPage title="Bid board" subtitle="Open invitations to bid">
      <div className="g3" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Open invitations</div><div className="kv">{invitations.filter(i => i.status === "open").length}</div></div>
        <div className="kpi"><div className="kl">Submitted</div><div className="kv">{invitations.filter(i => i.proposals.length > 0).length}</div></div>
        <div className="kpi"><div className="kl">Awarded</div><div className="kv green">{invitations.filter(i => i.status === "awarded" && i.proposals.some(p => p.status === "awarded")).length}</div></div>
      </div>
      <div className="card">
        <div className="chd"><div className="ctitle">Bid invitations</div></div>
        {invitations.length === 0 ? <div className="empty-state">No bid invitations yet.</div> : (
          <table className="tbl">
            <thead><tr><th>Job</th><th>Trade</th><th>Range</th><th>Due</th><th>From</th><th>Your bid</th><th>Status</th></tr></thead>
            <tbody>
              {invitations.map((b) => {
                const myBid = b.proposals[0];
                return (
                  <tr key={b.id}>
                    <td><div style={{ fontSize: 11, fontWeight: 600 }}>{b.jobName}</div><div style={{ fontSize: 10, color: "var(--t2)" }}>{b.jobLocation}</div></td>
                    <td>{b.trade}</td>
                    <td>{b.scopeRangeLow ? fmtC(b.scopeRangeLow) : "—"} – {b.scopeRangeHigh ? fmtC(b.scopeRangeHigh) : "—"}</td>
                    <td style={{ color: "var(--amber)" }}>{fmtDate(b.bidDueAt)}</td>
                    <td>{b.fromCompany?.name || "—"}</td>
                    <td>{myBid ? fmtC(myBid.amount) : <span style={{ fontSize: 10, color: "var(--t3)" }}>—</span>}</td>
                    <td><span className={`pill ${b.status === "open" ? "p-amber" : b.status === "awarded" ? "p-teal" : "p-gray"}`}>{b.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  );
}
