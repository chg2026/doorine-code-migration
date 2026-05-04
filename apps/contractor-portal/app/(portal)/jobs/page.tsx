import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const c = (await getCurrentContractor())!;
  const jobs = await prisma.cpJob.findMany({ where: { contractorId: c.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const invoiceTotal = await prisma.cpInvoice.aggregate({ where: { fromAccountId: c.id }, _sum: { totalAmount: true } });
  const paidTotal = await prisma.cpInvoice.aggregate({ where: { fromAccountId: c.id, status: "paid" }, _sum: { totalAmount: true } });

  return (
    <PortalPage title="My jobs &amp; CRM" subtitle="All your active, upcoming, and completed work">
      <div className="g4" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Total jobs</div><div className="kv">{jobs.length}</div></div>
        <div className="kpi"><div className="kl">Total contract value</div><div className="kv">{fmtC(jobs.reduce((s, j) => s + Number(j.contractAmount), 0))}</div></div>
        <div className="kpi"><div className="kl">Invoiced</div><div className="kv">{fmtC(Number(invoiceTotal._sum.totalAmount || 0))}</div></div>
        <div className="kpi"><div className="kl">Collected</div><div className="kv green">{fmtC(Number(paidTotal._sum.totalAmount || 0))}</div></div>
      </div>

      <div className="card">
        <div className="chd"><div className="ctitle">All jobs</div></div>
        <table className="tbl">
          <thead><tr><th>Job</th><th>Trade</th><th>Contract</th><th>Invoiced</th><th>Paid</th><th>Progress</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">No jobs yet.</td></tr>
            ) : jobs.map((j) => (
              <tr key={j.id}>
                <td><div style={{ fontSize: 11, fontWeight: 600 }}>{j.name}</div><div style={{ fontSize: 10, color: "var(--t2)" }}>{j.subtitle}</div></td>
                <td>{j.trade}</td>
                <td>{fmtC(j.contractAmount)}</td>
                <td>{fmtC(j.invoicedAmount)}</td>
                <td className={Number(j.paidAmount) > 0 ? "green" : ""}>{fmtC(j.paidAmount)}</td>
                <td>{j.progressPct > 0 ? <><div style={{ fontSize: 10, fontWeight: 600 }}>{j.progressPct}%</div><div className="prog"><div className="prog-f" style={{ width: `${j.progressPct}%`, background: j.progressPct > 60 ? "#1D9E75" : "#BA7517" }} /></div></> : <span style={{ fontSize: 10, color: "var(--t3)" }}>—</span>}</td>
                <td style={{ fontSize: 10, color: "var(--t2)" }}>{j.dueDate || "—"}</td>
                <td><span className={`pill ${j.status === "active" ? "p-blue" : j.status === "upcoming" ? "p-amber" : j.status === "complete" ? "p-teal" : "p-gray"}`}>{j.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
