import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpQuotesPage() {
  const c = (await getCurrentContractor())!;
  const quotes = await prisma.cpQuote.findMany({
    where: { toAccountId: c.id },
    include: { fromAccount: { select: { contactName: true, companyName: true, trade: true } } },
    orderBy: { sentAt: "desc" },
  });
  return (
    <PortalPage title="Quotes received" subtitle="Bids and proposals sent to you">
      <div className="card">
        <table className="tbl">
          <thead><tr><th>#</th><th>Job</th><th>From</th><th>Trade</th><th>Amount</th><th>Sent</th><th>Status</th><th /></tr></thead>
          <tbody>
            {quotes.length === 0 ? <tr><td colSpan={8} className="empty-state">No quotes received.</td></tr> : quotes.map((q) => (
              <tr key={q.id}>
                <td style={{ fontWeight: 600 }}>{q.number}</td>
                <td>{q.jobName}</td>
                <td>{q.fromAccount.companyName}</td>
                <td>{q.fromAccount.trade || "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmtC(q.totalAmount)}</td>
                <td className="muted">{fmtDate(q.sentAt)}</td>
                <td><span className={`pill ${q.status === "accepted" ? "p-teal" : q.status === "pending" ? "p-amber" : "p-red"}`}>{q.status}</span></td>
                <td>{q.status === "pending" && <button className="btn btn-sm">Review</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
