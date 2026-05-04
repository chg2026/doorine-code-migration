import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OperatorDashboardPage() {
  const c = (await getCurrentContractor())!;
  const invitees = await getInvitees(c.id);
  const subIds = invitees.map((e) => e.contractor.id);

  const [quotesIn, jobsManaged, invoicesIn, complianceDocs, bidInvitations] = await Promise.all([
    prisma.cpQuote.findMany({ where: { toAccountId: c.id }, orderBy: { sentAt: "desc" } }),
    // Graph-scope: only jobs this operator personally awarded
    // (otherwise we'd expose subs' work for other upstream operators).
    prisma.cpJob.findMany({ where: { awardedByAccountId: c.id } }),
    prisma.cpInvoice.findMany({ where: { toAccountId: c.id } }),
    prisma.cpComplianceDoc.findMany({ where: { accountId: { in: subIds.length ? subIds : ["__none"] } } }),
    prisma.cpBidInvitation.findMany({ where: { fromAccountId: c.id } }),
  ]);

  const pendingQuotes = quotesIn.filter((q) => q.status === "pending");
  const pendingInvoices = invoicesIn.filter((i) => i.status === "pending");
  const expiringDocs = complianceDocs.filter((d) => d.status === "expiring" || d.status === "expired");
  const activeJobs = jobsManaged.filter((j) => j.status === "active").length;

  return (
    <PortalPage title="Operator dashboard" subtitle={`Manage ${invitees.length} subs and vendors in your network`}>
      <div className="g4" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Quotes pending review</div><div className="kv amber">{pendingQuotes.length}</div><div className="ks">{fmtC(pendingQuotes.reduce((s, q) => s + Number(q.totalAmount), 0))}</div></div>
        <div className="kpi"><div className="kl">Active jobs</div><div className="kv">{activeJobs}</div><div className="ks">{jobsManaged.length} total</div></div>
        <div className="kpi"><div className="kl">Invoices to pay</div><div className="kv amber">{fmtC(pendingInvoices.reduce((s, i) => s + Number(i.totalAmount), 0))}</div><div className="ks">{pendingInvoices.length} pending</div></div>
        <div className="kpi"><div className="kl">Compliance flags</div><div className={`kv ${expiringDocs.length > 0 ? "red" : ""}`}>{expiringDocs.length}</div><div className="ks">across your subs</div></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="chd"><div className="ctitle">Pending quotes</div><a className="btn btn-sm" href="/operator/quotes">View all</a></div>
          {pendingQuotes.slice(0, 5).map((q) => (
            <div key={q.id} className="fi">
              <div style={{ flex: 1 }}><div className="fi-title">{q.number} — {q.jobName}</div><div className="fi-sub">{fmtC(q.totalAmount)}</div></div>
              <span className="pill p-amber">pending</span>
            </div>
          ))}
          {pendingQuotes.length === 0 && <div className="empty-state">No pending quotes.</div>}
        </div>
        <div className="card">
          <div className="chd"><div className="ctitle">Open bid invitations</div><a className="btn btn-sm" href="/operator/bids">Manage</a></div>
          {bidInvitations.filter(b => b.status === "open").slice(0, 5).map((b) => (
            <div key={b.id} className="fi">
              <div style={{ flex: 1 }}><div className="fi-title">{b.jobName}</div><div className="fi-sub">{b.trade} · Due {b.bidDueAt?.toLocaleDateString() || "—"}</div></div>
              <span className="pill p-blue">open</span>
            </div>
          ))}
          {bidInvitations.filter(b => b.status === "open").length === 0 && <div className="empty-state">No open bids.</div>}
        </div>
      </div>
    </PortalPage>
  );
}
