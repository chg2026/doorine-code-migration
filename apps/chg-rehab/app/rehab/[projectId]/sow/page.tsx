import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { PhaseStatus } from "@prisma/client";
import { can } from "@/lib/permissions";
import { parseProjectMeta } from "@/lib/rehab/types";
import SowPhase from "@/components/rehab/SowPhase";
import SowActions from "@/components/rehab/SowActions";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function SowPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ phase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const canEdit = await can(user, "rehab", "edit");

  const sp = (await searchParams) ?? {};
  const focusPhase = sp.phase ? parseInt(sp.phase, 10) : NaN;

  const totalValue = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);
  const latestAddendum = project.addenda[project.addenda.length - 1];
  const meta = parseProjectMeta(project.meta);

  // Pair phases with sow sections by index (both ordered)
  const sections = project.sowSections;

  return (
    <div className="tab-panel active">
      {latestAddendum && Number(latestAddendum.delta) !== 0 && (
        <div className="amber-bar">
          <span className="ab-badge">{latestAddendum.title} — Active</span>
          <span className="ab-text">{latestAddendum.reason || "Scope change applied."}</span>
          <div className="ab-r">
            {meta.originalEndDate && (
              <>
                <span className="orig-dl">{formatET(new Date(meta.originalEndDate), false)}</span>
                <span style={{ fontSize: 10, color: "var(--amber-txt)" }}>→</span>
              </>
            )}
            <span className="new-dl">{formatET(project.endDate, false)}</span>
          </div>
        </div>
      )}

      <div className="action-bar" style={{ position: "relative" }}>
        <div className="toggle-group">
          <button className="tg-btn active">SOW view</button>
          <button className="tg-btn" disabled title="Use Schedule tab for Gantt">
            Gantt view
          </button>
        </div>
        <button className="btn">Export PDF</button>
        <SowActions
          projectCode={project.code}
          phases={project.phases.map((p) => ({ number: p.number, name: p.name }))}
          canEdit={canEdit}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Status:</span>
          <span className="cell-tag tag-paid" style={{ fontSize: 10 }}>
            Approved
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <div className="sow-hd">
            <span></span>
            <span className="col-label">Phase / Line item</span>
            <span className="col-label" style={{ textAlign: "right" }}>Days</span>
            <span className="col-label">Dates</span>
            <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
            <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
          </div>
          {project.phases.map((p, idx) => {
            const section = sections[idx];
            const days = p.startDate && p.endDate
              ? Math.max(1, Math.round((p.endDate.getTime() - p.startDate.getTime()) / 86_400_000) + 1)
              : 0;
            const stClass =
              p.status === PhaseStatus.Complete ? "st-done" : p.status === PhaseStatus.Active ? "st-act" : "st-wait";
            const stLabel =
              p.status === PhaseStatus.Complete ? "Complete" : p.status === PhaseStatus.Active ? "Active" : "Not started";
            const pnClass =
              p.status === PhaseStatus.Complete ? "pn-g" : p.status === PhaseStatus.Active ? "pn-b" : "pn-gr";
            return (
              <SowPhase
                key={p.id}
                anchorId={`sow-phase-${p.number}`}
                defaultOpen={p.status === PhaseStatus.Active || idx === 0}
                forceOpen={!Number.isNaN(focusPhase) && focusPhase === p.number}
                header={
                  <>
                    <div className={`pnum ${pnClass}`}>{p.number}</div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {section?.lineItems.length || 0} line items · {stLabel}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, textAlign: "right" }}>{days}d</span>
                    <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                      {formatET(p.startDate, false)} – {formatET(p.endDate, false)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, textAlign: "right" }}>
                      {fmt$(Number(p.budget ?? 0))}
                    </span>
                    <span className={`st-badge ${stClass}`} style={{ fontSize: 9 }}>{stLabel}</span>
                  </>
                }
              >
                {section && section.lineItems.length > 0 ? (
                  <>
                    <div className="li-hd">
                      <span className="col-label">Line item</span>
                      <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
                      <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
                      <span className="col-label">Status</span>
                    </div>
                    {section.lineItems.map((li) => {
                      const est = Number(li.totalCost ?? 0);
                      const phaseDone = p.status === PhaseStatus.Complete;
                      const phaseActive = p.status === PhaseStatus.Active;
                      const isCO = /\(CO\)|CO\)/.test(li.description);
                      const actClass = isCO && phaseActive ? "li-act-a" : phaseDone ? "li-act-g" : "li-est";
                      const actVal = phaseDone || isCO ? `$${est.toLocaleString()}` : "—";
                      const tagCls = phaseDone ? "tag-paid" : phaseActive ? "tag-pend" : "";
                      const tagLabel = phaseDone ? "Done" : phaseActive ? "In progress" : "Pending";
                      return (
                        <div className="li-row" key={li.id}>
                          <div>
                            <div className="li-name">{li.description}</div>
                            {li.notes && <div className="li-sub">{li.notes}</div>}
                          </div>
                          <div className="li-est">${est.toLocaleString()}</div>
                          <div className={actClass}>{actVal}</div>
                          <span
                            className={`cell-tag ${tagCls}`}
                            style={!tagCls ? { background: "#F1EFE8", color: "#5F5E5A" } : undefined}
                          >
                            {tagLabel}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
                    No line items recorded.
                  </div>
                )}
              </SowPhase>
            );
          })}
        </div>
        <div className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>SOW metadata</div>
            <div className="ip-row"><span className="ir-lbl">Total value</span><span className="ir-val">{fmt$(totalValue)}</span></div>
            <div className="ip-row"><span className="ir-lbl">Phases</span><span className="ir-val">{project.phases.length}</span></div>
            <div className="ip-row"><span className="ir-lbl">Signed</span><span className="ir-val">{formatET(project.startDate, false)}</span></div>
            <div className="ip-row"><span className="ir-lbl">Addenda</span><span className="ir-val">{project.addenda.length}</span></div>
          </div>
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>Version history</div>
            <div style={{ padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
              <div style={{ fontSize: 10, fontWeight: 500 }}>Original SOW</div>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                {formatET(project.startDate, false)} · v1.0
              </div>
            </div>
            {project.addenda.map((a) => (
              <div key={a.id} style={{ padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
                <div style={{ fontSize: 10, fontWeight: 500 }}>{a.title}</div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  {formatET(a.createdAt, false)}
                  {Number(a.delta) !== 0 ? ` · +$${Number(a.delta).toLocaleString()}` : ""}
                  {a.daysDelta !== 0 ? ` · +${a.daysDelta} day${a.daysDelta === 1 ? "" : "s"}` : ""}
                  {Number(a.delta) === 0 && a.daysDelta === 0 ? " · No change" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
