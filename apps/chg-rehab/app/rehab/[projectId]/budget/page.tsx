import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import DocUploadButton from "@/components/rehab/DocUploadButton";
import { DrawStatus, PhaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type BudgetView = "phase" | "lineItems" | "invoices";

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const view: BudgetView =
    sp.view === "lineItems" ? "lineItems" : sp.view === "invoices" ? "invoices" : "phase";
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const canUploadDocs = await can(user, "documents", "edit");
  const invoiceDocs = project.documents.filter((d) => (d.category ?? "").toLowerCase() === "invoice");

  const budget = Number(project.budget ?? 0);
  const totalSpent = project.draws
    .filter((d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved)
    .reduce((acc, d) => acc + Number(d.amount), 0);
  // Projected final: not-started phases contribute their budget, in-flight or
  // completed phases contribute their recorded actual (which may exceed budget
  // for cost overruns). Note that `?? p.budget` is not enough because Decimal
  // 0 (e.g. phase 6 actual=0 before any spend) is a valid non-null value, so
  // we explicitly branch on phase status.
  const projected = project.phases.reduce((acc, p) => {
    const budgetN = Number(p.budget ?? 0);
    const actualN = Number(p.actual ?? 0);
    return acc + (p.status === PhaseStatus.NotStarted ? budgetN : actualN || budgetN);
  }, 0);
  const remaining = Math.max(0, budget - totalSpent);
  const overage = projected - budget;
  const pendingBalance = project.draws
    .filter((d) => d.status === DrawStatus.Pending)
    .reduce((acc, d) => acc + Number(d.amount), 0);

  // Materialize line items joined with the phase they belong to. Phase order is
  // already enforced by the query, and SowSection.order matches phase index in
  // the seed; use that to compute per-line budget rows.
  const sectionByIdx = project.sowSections;
  const lineRows = project.phases.flatMap((p, idx) => {
    const section = sectionByIdx[idx];
    if (!section) return [];
    return section.lineItems.map((li) => ({
      phase: p,
      li,
      isCO: /\(CO\)|CO\)/.test(li.description),
    }));
  });
  const lineItemsTotal = lineRows.reduce((acc, r) => acc + Number(r.li.totalCost ?? 0), 0);
  const baseLink = `/rehab/${project.code}/budget`;

  return (
    <div className="tab-panel active">
      <div className="kpi-strip">
        <div className="kpi-card"><div className="kpi-label">Approved budget</div><div className="kpi-val">{fmt$(budget)}</div><div className="kpi-sub">Signed {formatET(project.startDate, false)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total spent</div><div className="kpi-val green">{fmt$(totalSpent)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved).length} draws paid</div></div>
        <div className="kpi-card"><div className="kpi-label">Projected final</div><div className={`kpi-val ${overage > 0 ? "amber" : ""}`}>{fmt$(projected)}</div>{overage !== 0 && <div className="kpi-badge" style={overage > 0 ? { background: "var(--amber-bg)", color: "var(--amber-txt)" } : { background: "var(--green-bg)", color: "var(--green-txt)" }}>{overage > 0 ? `+${fmt$(overage)} over` : `${fmt$(overage)} under`}</div>}</div>
        <div className="kpi-card"><div className="kpi-label">Remaining</div><div className="kpi-val">{fmt$(remaining)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).length} draws pending</div></div>
        <div className="kpi-card"><div className="kpi-label">Contractor balance</div><div className={`kpi-val ${pendingBalance > 0 ? "amber" : ""}`}>{fmt$(pendingBalance)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).map(d => `Draw #${d.number}`).join(" + ") || "—"}</div></div>
      </div>

      <div className="action-bar">
        <div className="toggle-group">
          <Link href={baseLink} scroll={false} className={`tg-btn ${view === "phase" ? "active" : ""}`}>By phase</Link>
          <Link href={`${baseLink}?view=lineItems`} scroll={false} className={`tg-btn ${view === "lineItems" ? "active" : ""}`}>By line item</Link>
          <Link href={`${baseLink}?view=invoices`} scroll={false} className={`tg-btn ${view === "invoices" ? "active" : ""}`}>Invoices</Link>
        </div>
        <button className="btn">Export</button>
        {canUploadDocs && (
          <DocUploadButton
            projectCode={project.code}
            defaultCategory="Invoice"
            fixedCategory
            label="+ Add invoice"
          />
        )}
      </div>

      <div className="body-split">
        <div className="body-main">
          {view === "phase" && (
            <PhaseView project={project} />
          )}

          {view === "lineItems" && (
            <>
              <div
                className="data-hd"
                style={{ gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px" }}
              >
                <span className="col-label">Line item</span>
                <span className="col-label">Phase</span>
                <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
                <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
                <span className="col-label" style={{ textAlign: "right" }}>Variance</span>
                <span className="col-label">Status</span>
              </div>
              {lineRows.map(({ phase: p, li, isCO }) => {
                const est = Number(li.totalCost ?? 0);
                const phaseDone = p.status === PhaseStatus.Complete;
                const phaseActive = p.status === PhaseStatus.Active;
                const actVal = phaseDone || isCO ? est : null;
                const variance = actVal !== null ? actVal - est : 0;
                const tagCls = phaseDone ? "tag-paid" : phaseActive ? "tag-pend" : "";
                const tagLabel = phaseDone ? "Done" : phaseActive ? "In progress" : "Pending";
                return (
                  <div
                    className="data-row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px" }}
                    key={li.id}
                  >
                    <div>
                      <div className="cell-name">
                        {li.description}
                        {isCO && (
                          <span
                            className="mapped-pill"
                            style={{ marginLeft: 6, background: "var(--purple-bg)", color: "var(--purple-txt)" }}
                          >
                            CO
                          </span>
                        )}
                      </div>
                      {li.notes && <div className="cell-meta">{li.notes}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Phase {p.number}</div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>${est.toLocaleString()}</div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>
                      {actVal !== null ? (
                        <span style={{ color: variance > 0 ? "var(--amber)" : "var(--green)" }}>
                          ${actVal.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 10 }}>
                      {actVal !== null ? (
                        <span style={{ color: variance > 0 ? "var(--amber)" : "var(--green)" }}>
                          {variance > 0 ? `+${fmt$(variance)}` : variance < 0 ? fmt$(variance) : "$0"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </div>
                    <span
                      className={`cell-tag ${tagCls}`}
                      style={!tagCls ? { background: "#F1EFE8", color: "#5F5E5A" } : undefined}
                    >
                      {tagLabel}
                    </span>
                  </div>
                );
              })}
              <div
                className="data-row"
                style={{
                  gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px",
                  background: "var(--bg-secondary)",
                  fontWeight: 600,
                }}
              >
                <div className="cell-name">Total ({lineRows.length} line items)</div>
                <div></div>
                <div style={{ textAlign: "right", fontSize: 11 }}>${lineItemsTotal.toLocaleString()}</div>
                <div></div>
                <div></div>
                <div></div>
              </div>
            </>
          )}

          {view === "invoices" && (
            <>
              <div className="data-hd" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }}>
                <span className="col-label">Description</span>
                <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
                <span className="col-label">Phase</span>
                <span className="col-label">Status</span>
                <span></span>
              </div>
              {project.draws.map((d) => {
                const paid = d.status === DrawStatus.Paid || d.status === DrawStatus.Approved;
                const phase = project.phases.find((p) => p.id === d.phaseId);
                return (
                  <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={d.id}>
                    <div>
                      <div className="cell-name">{d.title}</div>
                      <div className="cell-meta">
                        {paid ? `${formatET(d.paidAt ?? d.approvedAt)} · Approved` : "Awaiting checklist sign-off"}
                      </div>
                    </div>
                    <div className="cell-amt">{fmt$(Number(d.amount))}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Phase {phase?.number ?? "—"}</div>
                    <span className={`cell-tag ${paid ? "tag-paid" : "tag-pend"}`}>{paid ? "Paid" : "Pending"}</span>
                    <span className="cell-dl">—</span>
                  </div>
                );
              })}
              {invoiceDocs.length > 0 && (
                <>
                  <div className="sec-hd" style={{ marginTop: 12 }}>Uploaded invoices ({invoiceDocs.length})</div>
                  {invoiceDocs.map((doc) => (
                    <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={doc.id}>
                      <div>
                        <div className="cell-name">{doc.name}</div>
                        <div className="cell-meta">
                          Uploaded {formatET(doc.uploadedAt)}
                          {doc.size ? ` · ${(doc.size / 1024).toFixed(1)} KB` : ""}
                        </div>
                      </div>
                      <div className="cell-amt">—</div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>—</div>
                      <span className="cell-tag tag-system">Doc</span>
                      {doc.fileKey ? (
                        <a className="cell-dl" href={doc.fileKey} target="_blank" rel="noreferrer" aria-label={`Download ${doc.name}`}>↓</a>
                      ) : (
                        <span className="cell-dl">—</span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {view === "phase" && (
            <>
              <div className="sec-hd">Invoice & receipt log</div>
              <div className="data-hd" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }}>
                <span className="col-label">Description</span>
                <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
                <span className="col-label">Phase</span>
                <span className="col-label">Status</span>
                <span></span>
              </div>
              {project.draws.map((d) => {
                const paid = d.status === DrawStatus.Paid || d.status === DrawStatus.Approved;
                const phase = project.phases.find((p) => p.id === d.phaseId);
                return (
                  <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={d.id}>
                    <div>
                      <div className="cell-name">{d.title}</div>
                      <div className="cell-meta">
                        {paid ? `${formatET(d.paidAt ?? d.approvedAt)} · Approved` : "Awaiting checklist sign-off"}
                      </div>
                    </div>
                    <div className="cell-amt">{fmt$(Number(d.amount))}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Phase {phase?.number ?? "—"}</div>
                    <span className={`cell-tag ${paid ? "tag-paid" : "tag-pend"}`}>{paid ? "Paid" : "Pending"}</span>
                    <span className="cell-dl">↓</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>Spend by phase</div>
            {project.phases.map((p) => {
              const a = Number(p.actual ?? 0);
              const pct = totalSpent > 0 ? Math.round((a / Math.max(totalSpent + pendingBalance, 1)) * 100) : 0;
              return (
                <div className="spend-bar-row" key={p.id}>
                  <div className="spend-lbl"><span>{p.name}</span><span>{fmt$(a)}</span></div>
                  <div className="spend-track"><div className="spend-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseView({ project }: { project: Awaited<ReturnType<typeof loadProjectByCode>> }) {
  if (!project) return null;
  return (
    <>
      <div
        className="data-hd"
        style={{ gridTemplateColumns: "minmax(0,1fr) 68px 70px 70px 92px" }}
      >
        <span className="col-label">Phase</span>
        <span className="col-label" style={{ textAlign: "right" }}>Budget</span>
        <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
        <span className="col-label" style={{ textAlign: "right" }}>Variance</span>
        <span className="col-label">Draw status</span>
      </div>
      {project.phases.map((p) => {
        const b = Number(p.budget ?? 0);
        const a = Number(p.actual ?? 0);
        const v = a - b;
        const draw = p.draws[0];
        const tagCls = draw && (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved) ? "tag-paid" : "tag-pend";
        const tagLabel = draw
          ? (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved
              ? `Draw #${draw.number} paid`
              : `Draw #${draw.number} pending`)
          : "—";
        const actCol = p.status === PhaseStatus.NotStarted
          ? <span style={{ color: "var(--text-tertiary)" }}>—</span>
          : <span style={{ fontWeight: 500, color: v > 0 ? "var(--amber)" : "var(--green)" }}>{fmt$(a)}</span>;
        const varCol = p.status === PhaseStatus.NotStarted
          ? <span style={{ color: "var(--text-tertiary)" }}>—</span>
          : <span style={{ color: v > 0 ? "var(--amber)" : "var(--green)" }}>{v > 0 ? `+${fmt$(v)}` : v < 0 ? `${fmt$(v)}` : "$0"}</span>;
        return (
          <div
            className="data-row"
            style={{ gridTemplateColumns: "minmax(0,1fr) 68px 70px 70px 92px" }}
            key={p.id}
          >
            <div>
              <div className="cell-name">{p.name}</div>
              <div className="cell-meta">Phase {p.number}{p.status === PhaseStatus.Active ? " — active" : ""}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11 }}>{fmt$(b)}</div>
            <div style={{ textAlign: "right", fontSize: 11 }}>{actCol}</div>
            <div style={{ textAlign: "right", fontSize: 10 }}>{varCol}</div>
            <span className={`cell-tag ${tagCls}`}>{tagLabel}</span>
          </div>
        );
      })}
    </>
  );
}
