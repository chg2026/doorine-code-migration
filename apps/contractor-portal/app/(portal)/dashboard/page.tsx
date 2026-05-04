import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const c = (await getCurrentContractor())!;
  const [jobs, invoices, quotes, docs] = await Promise.all([
    prisma.cpJob.findMany({ where: { contractorId: c.id }, orderBy: { createdAt: "desc" } }),
    prisma.cpInvoice.findMany({ where: { fromAccountId: c.id }, orderBy: { submittedAt: "desc" } }),
    prisma.cpQuote.findMany({ where: { fromAccountId: c.id }, orderBy: { sentAt: "desc" }, take: 4 }),
    prisma.cpComplianceDoc.findMany({ where: { accountId: c.id, docType: "compliance" } }),
  ]);
  const active = jobs.filter((j) => j.status === "active").length;
  const pendingInv = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.totalAmount), 0);
  const paidThisMonth = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
  const expiring = docs.filter((d) => d.status === "expiring" || d.status === "expired").length;

  return (
    <PortalPage title={`Welcome back, ${c.contactName.split(" ")[0]}`} subtitle={`${c.companyName} · ${c.trade || "Contractor"}`}>
      <div className="g4" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kl">Active jobs</div><div className="kv">{active}</div><div className="ks">{jobs.filter(j=>j.status==="upcoming").length} upcoming</div></div>
        <div className="kpi"><div className="kl">Pending invoices</div><div className="kv amber">{fmtC(pendingInv)}</div><div className="ks">{invoices.filter(i=>i.status==="pending").length} awaiting approval</div></div>
        <div className="kpi"><div className="kl">Paid recently</div><div className="kv green">{fmtC(paidThisMonth)}</div><div className="ks">{invoices.filter(i=>i.status==="paid").length} payments</div></div>
        <div className="kpi"><div className="kl">Docs expiring</div><div className={`kv ${expiring > 0 ? "red" : ""}`}>{expiring}</div><div className="ks">compliance items</div></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="chd"><div className="ctitle">Active &amp; upcoming jobs</div><a className="btn btn-sm" href="/jobs">View all</a></div>
          {jobs.filter(j=>j.status==="active"||j.status==="upcoming").length === 0 ? <div className="empty-state">No active jobs yet.</div> : jobs.filter(j=>j.status==="active"||j.status==="upcoming").map((j) => (
            <div key={j.id} className="fi">
              <div style={{ flex: 1 }}>
                <div className="fi-title">{j.name}</div>
                <div className="fi-sub">{j.subtitle || ""}{j.dueDate ? ` · Due ${j.dueDate}` : ""}</div>
                {j.progressPct > 0 && (
                  <div className="prog" style={{ marginTop: 4 }}>
                    <div className="prog-f" style={{ width: `${j.progressPct}%`, background: j.progressPct > 60 ? "#1D9E75" : j.progressPct > 30 ? "#BA7517" : "#E24B4A" }} />
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: j.progressPct > 60 ? "var(--teal)" : "var(--amber)" }}>{j.progressPct || "—"}%</div>
                <span className={`pill ${j.status === "active" ? "p-blue" : "p-amber"}`}>{j.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="chd"><div className="ctitle">Recent quotes</div><a className="btn btn-sm" href="/quotes">View all</a></div>
          {quotes.length === 0 ? <div className="empty-state">No quotes yet.</div> : quotes.map((q) => (
            <div key={q.id} className="fi">
              <div style={{ flex: 1 }}>
                <div className="fi-title">{q.number} — {q.jobName}</div>
                <div className="fi-sub">{fmtC(q.totalAmount)} · {q.sentAt.toLocaleDateString()}</div>
              </div>
              <span className={`pill ${q.status === "accepted" ? "p-teal" : q.status === "pending" ? "p-amber" : "p-red"}`}>{q.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="chd"><div className="ctitle">Compliance status</div><a className="btn btn-sm" href="/docs">Manage docs</a></div>
        {docs.length === 0 ? <div className="empty-state">No compliance docs uploaded yet.</div> : docs.map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "var(--bl)" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500 }}>{d.name}</div>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>Expires: {d.expiresAt ? d.expiresAt.toLocaleDateString() : "N/A"}</div>
            </div>
            <span className={`pill ${d.status === "current" ? "p-teal" : d.status === "expiring" ? "p-amber" : "p-red"}`}>
              {d.status === "current" ? "Current" : d.status === "expiring" ? "Expiring soon" : "Expired"}
            </span>
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
