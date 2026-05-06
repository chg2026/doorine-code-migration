import PortalPage from "@/components/PortalPage";
import EmptyState from "@/components/EmptyState";
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
        {quotes.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No quotes received"
            description="Quotes and bids submitted by your subs will appear here once you invite them to bid."
          />
        ) : (
          <table className="tbl">
            <thead><tr><th>#</th><th>Job</th><th>From</th><th>Trade</th><th>Amount</th><th>Sent</th><th>Status</th><th /></tr></thead>
            <tbody>
              {quotes.map((q) => (
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
        )}
      </div>
    </PortalPage>
  );
}
