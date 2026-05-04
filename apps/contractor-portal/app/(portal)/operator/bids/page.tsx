import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpBidsPage() {
  const c = (await getCurrentContractor())!;
  const bids = await prisma.cpBidInvitation.findMany({
    where: { fromAccountId: c.id },
    include: { invitedAccount: { select: { companyName: true } }, proposals: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <PortalPage title="Bid management" subtitle="Bids you've invited and received" actions={<button className="btn btn-p btn-sm">+ Invite bids</button>}>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Job</th><th>Invited</th><th>Range</th><th>Due</th><th>Proposals</th><th>Status</th></tr></thead>
          <tbody>
            {bids.length === 0 ? <tr><td colSpan={6} className="empty-state">No bid invitations yet.</td></tr> : bids.map((b) => (
              <tr key={b.id}>
                <td><div style={{ fontSize: 11, fontWeight: 600 }}>{b.jobName}</div><div style={{ fontSize: 10, color: "var(--t2)" }}>{b.trade}</div></td>
                <td>{b.invitedAccount.companyName}</td>
                <td>{b.scopeRangeLow ? fmtC(b.scopeRangeLow) : "—"} – {b.scopeRangeHigh ? fmtC(b.scopeRangeHigh) : "—"}</td>
                <td className="muted">{fmtDate(b.bidDueAt)}</td>
                <td>{b.proposals.length}</td>
                <td><span className={`pill ${b.status === "open" ? "p-blue" : b.status === "awarded" ? "p-teal" : "p-gray"}`}>{b.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
