import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuoteHistoryPage() {
  const c = (await getCurrentContractor())!;
  const quotes = await prisma.cpQuote.findMany({
    where: { fromAccountId: c.id },
    include: { toCompany: { select: { name: true } }, toAccount: { select: { companyName: true } } },
    orderBy: { sentAt: "desc" },
  });
  return (
    <PortalPage title="My quotes" subtitle="All quotes you've sent" actions={<a className="btn btn-p btn-sm" href="/quotes/new">+ New quote</a>}>
      <div className="g3" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Total sent</div><div className="kv">{quotes.length}</div></div>
        <div className="kpi"><div className="kl">Pending</div><div className="kv amber">{quotes.filter(q => q.status === "pending").length}</div></div>
        <div className="kpi"><div className="kl">Accepted value</div><div className="kv green">{fmtC(quotes.filter(q => q.status === "accepted").reduce((s, q) => s + Number(q.totalAmount), 0))}</div></div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>#</th><th>Job</th><th>Recipient</th><th>Amount</th><th>Sent</th><th>Status</th></tr></thead>
          <tbody>
            {quotes.length === 0 ? <tr><td colSpan={6} className="empty-state">No quotes sent yet.</td></tr> : quotes.map((q) => (
              <tr key={q.id}>
                <td style={{ fontWeight: 600 }}>{q.number}</td>
                <td>{q.jobName}</td>
                <td>{q.toCompany?.name || q.toAccount?.companyName || "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmtC(q.totalAmount)}</td>
                <td className="muted">{fmtDate(q.sentAt)}</td>
                <td><span className={`pill ${q.status === "accepted" ? "p-teal" : q.status === "pending" ? "p-amber" : "p-red"}`}>{q.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
