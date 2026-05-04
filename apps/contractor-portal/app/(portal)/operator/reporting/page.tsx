import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtC } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Operator-lens Reporting: rolled-up KPIs across the operator's
 * invited subs — quotes received, jobs awarded, invoices owed,
 * compliance status, plus a per-sub breakdown table.
 */
export default async function OperatorReportingPage() {
  const c = (await getCurrentContractor())!;
  const invitees = await getInvitees(c.id);
  const subIds = invitees.map((e) => e.contractor.id);

  // Graph-scope: jobs/quotes/invoices must be tied to the current
  // operator (toAccountId / awardedByAccountId), not just to "any of
  // my invited subs" — a sub may also work for other upstream
  // operators, and that activity is NOT visible to us.
  const [quotes, jobs, invoices, docs] = await Promise.all([
    prisma.cpQuote.findMany({ where: { toAccountId: c.id } }),
    prisma.cpJob.findMany({ where: { awardedByAccountId: c.id } }),
    prisma.cpInvoice.findMany({ where: { toAccountId: c.id } }),
    prisma.cpComplianceDoc.findMany({ where: { accountId: { in: subIds.length ? subIds : ["__none"] } } }),
  ]);

  const acceptedQuotes = quotes.filter((q) => q.status === "accepted");
  const totalAwarded = acceptedQuotes.reduce((s, q) => s + Number(q.totalAmount), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalOutstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
  const expiring = docs.filter((d) => d.status === "expiring" || d.status === "expired").length;

  // Per-sub breakdown
  const perSub = invitees.map((e) => {
    const sub = e.contractor;
    const sQuotes = quotes.filter((q) => q.fromAccountId === sub.id);
    const sJobs = jobs.filter((j) => j.contractorId === sub.id);
    const sInv = invoices.filter((i) => i.fromAccountId === sub.id);
    const sDocs = docs.filter((d) => d.accountId === sub.id);
    return {
      id: sub.id,
      name: sub.companyName,
      trade: sub.trade,
      quotes: sQuotes.length,
      jobs: sJobs.length,
      activeJobs: sJobs.filter((j) => j.status === "active").length,
      paid: sInv.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0),
      outstanding: sInv.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.totalAmount), 0),
      complianceFlags: sDocs.filter((d) => d.status !== "current").length,
    };
  });

  return (
    <PortalPage title="Operator reporting" subtitle="Rolled-up performance across your invited subs">
      <div className="g4" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Subs in network</div><div className="kv">{invitees.length}</div><div className="ks">L3 accounts you invited</div></div>
        <div className="kpi"><div className="kl">Total awarded</div><div className="kv">{fmtC(totalAwarded)}</div><div className="ks">{acceptedQuotes.length} accepted quotes</div></div>
        <div className="kpi"><div className="kl">Outstanding to pay</div><div className="kv amber">{fmtC(totalOutstanding)}</div><div className="ks">{fmtC(totalPaid)} paid YTD</div></div>
        <div className="kpi"><div className="kl">Compliance flags</div><div className={`kv ${expiring ? "red" : "green"}`}>{expiring}</div><div className="ks">expiring or expired</div></div>
      </div>

      <div className="card">
        <div className="chd"><div className="ctitle">Per-sub breakdown</div></div>
        <table className="tbl">
          <thead>
            <tr><th>Sub</th><th>Trade</th><th>Quotes</th><th>Active jobs</th><th>Paid</th><th>Outstanding</th><th>Flags</th></tr>
          </thead>
          <tbody>
            {perSub.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">No subs invited yet.</td></tr>
            ) : perSub.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="muted">{r.trade || "—"}</td>
                <td>{r.quotes}</td>
                <td>{r.activeJobs} <span className="muted">/ {r.jobs}</span></td>
                <td>{fmtC(r.paid)}</td>
                <td className={r.outstanding > 0 ? "amber" : ""}>{fmtC(r.outstanding)}</td>
                <td className={r.complianceFlags > 0 ? "red" : ""}>{r.complianceFlags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
