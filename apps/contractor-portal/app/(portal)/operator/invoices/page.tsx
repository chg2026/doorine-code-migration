import PortalPage from "@/components/PortalPage";
import EmptyState from "@/components/EmptyState";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpInvoicesPage() {
  const c = (await getCurrentContractor())!;
  const invoices = await prisma.cpInvoice.findMany({
    where: { toAccountId: c.id },
    include: { fromAccount: { select: { companyName: true } } },
    orderBy: { submittedAt: "desc" },
  });
  return (
    <PortalPage title="Invoices to pay" subtitle="Approve and pay sub invoices">
      <div className="card">
        {invoices.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No invoices received"
            description="Your subs haven't submitted any invoices yet. Invoices they send will appear here for review."
          />
        ) : (
          <table className="tbl">
            <thead><tr><th>Invoice</th><th>From</th><th>Job</th><th>Amount</th><th>Submitted</th><th>Status</th><th /></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.number}</td>
                  <td>{i.fromAccount.companyName}</td>
                  <td>{i.jobName}</td>
                  <td style={{ fontWeight: 600 }}>{fmtC(i.totalAmount)}</td>
                  <td className="muted">{fmtDate(i.submittedAt)}</td>
                  <td><span className={`pill ${i.status === "paid" ? "p-teal" : i.status === "approved" ? "p-blue" : i.status === "pending" ? "p-amber" : "p-red"}`}>{i.status}</span></td>
                  <td>{i.status === "pending" && <><button className="btn btn-sm btn-p">Approve</button> <button className="btn btn-sm">Reject</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  );
}
