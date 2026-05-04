import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const c = (await getCurrentContractor())!;
  const invoices = await prisma.cpInvoice.findMany({
    where: { fromAccountId: c.id },
    include: { toCompany: { select: { name: true } }, toAccount: { select: { companyName: true } } },
    orderBy: { submittedAt: "desc" },
  });
  const pending = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.totalAmount), 0);
  const approved = invoices.filter((i) => i.status === "approved").reduce((s, i) => s + Number(i.totalAmount), 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);

  return (
    <PortalPage title="Invoices" subtitle="Track invoiced and collected revenue" actions={<button className="btn btn-p btn-sm">+ New invoice</button>}>
      <div className="g4" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Pending</div><div className="kv amber">{fmtC(pending)}</div></div>
        <div className="kpi"><div className="kl">Approved</div><div className="kv">{fmtC(approved)}</div></div>
        <div className="kpi"><div className="kl">Paid</div><div className="kv green">{fmtC(paid)}</div></div>
        <div className="kpi"><div className="kl">Total invoices</div><div className="kv">{invoices.length}</div></div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Invoice #</th><th>Job</th><th>Recipient</th><th>Amount</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>
            {invoices.length === 0 ? <tr><td colSpan={6} className="empty-state">No invoices yet.</td></tr> : invoices.map((i) => (
              <tr key={i.id}>
                <td style={{ fontWeight: 600 }}>{i.number}</td>
                <td>{i.jobName}</td>
                <td>{i.toCompany?.name || i.toAccount?.companyName || "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmtC(i.totalAmount)}</td>
                <td className="muted">{fmtDate(i.submittedAt)}</td>
                <td><span className={`pill ${i.status === "paid" ? "p-teal" : i.status === "approved" ? "p-blue" : i.status === "pending" ? "p-amber" : "p-red"}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
