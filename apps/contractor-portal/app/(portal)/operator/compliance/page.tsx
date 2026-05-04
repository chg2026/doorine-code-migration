import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpCompliancePage() {
  const c = (await getCurrentContractor())!;
  const invitees = await getInvitees(c.id);
  const subIds = invitees.map((e) => e.contractor.id);
  const docs = await prisma.cpComplianceDoc.findMany({
    where: { accountId: { in: subIds.length ? subIds : ["__none"] } },
    include: { account: { select: { companyName: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return (
    <PortalPage title="Compliance" subtitle={`Compliance status for ${invitees.length} subs`}>
      <div className="g3" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Current</div><div className="kv green">{docs.filter(d => d.status === "current").length}</div></div>
        <div className="kpi"><div className="kl">Expiring</div><div className="kv amber">{docs.filter(d => d.status === "expiring").length}</div></div>
        <div className="kpi"><div className="kl">Expired / missing</div><div className="kv red">{docs.filter(d => d.status === "expired" || d.status === "missing").length}</div></div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Sub</th><th>Document</th><th>Type</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>
            {docs.length === 0 ? <tr><td colSpan={5} className="empty-state">No compliance docs tracked.</td></tr> : docs.map((d) => (
              <tr key={d.id}>
                <td>{d.account.companyName}</td>
                <td>{d.name}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{d.docType}</td>
                <td className="muted">{fmtDate(d.expiresAt)}</td>
                <td><span className={`pill ${d.status === "current" ? "p-teal" : d.status === "expiring" ? "p-amber" : "p-red"}`}>{d.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
