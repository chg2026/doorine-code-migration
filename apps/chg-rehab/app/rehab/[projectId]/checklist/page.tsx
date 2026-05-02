import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode, loadCompanySettings } from "@/lib/rehab/queries";
import { computeGate } from "@/lib/paymentGate";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import ChecklistPhase from "@/components/rehab/ChecklistPhase";
import Link from "next/link";
import { ChecklistStatus, DrawStatus, PhaseStatus } from "@prisma/client";
import { parseChecklistItemMeta } from "@/lib/rehab/types";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const settings = await loadCompanySettings(user.companyId);
  const strictGate = settings?.strictGate ?? true;

  const [canEditChecklist, canApproveDraw] = await Promise.all([
    can(user, "checklist", "edit"),
    can(user, "draws", "approve"),
  ]);

  const focusPhase = sp.phase ? parseInt(sp.phase, 10) : null;

  const totalItems = project.phases.reduce((acc, p) => acc + p.checklistItems.length, 0);
  const totalDone = project.phases.reduce(
    (acc, p) => acc + p.checklistItems.filter((i) => i.status === ChecklistStatus.Done).length,
    0
  );
  const totalReleased = project.draws
    .filter((d) => d.status === DrawStatus.Approved || d.status === DrawStatus.Paid)
    .reduce((acc, d) => acc + Number(d.amount), 0);
  const budget = Number(project.budget ?? 0);

  return (
    <div className="tab-panel active">
      <div className="body-split">
        <div className="body-main" style={{ overflowY: "auto" }}>
          <div id="cl-phases">
            {project.phases.map((p) => {
              const gate = computeGate(p, p.checklistItems, p.draws[0] ?? null);
              const isActive = p.status === PhaseStatus.Active;
              const isFocused = focusPhase === p.number;
              const defaultOpen = isFocused || (focusPhase == null && (isActive || p.status === PhaseStatus.Complete && p.number === 4));
              const draw = p.draws[0] ?? null;
              return (
                <ChecklistPhase
                  key={p.id}
                  phase={{
                    id: p.id,
                    number: p.number,
                    name: p.name,
                    startLabel: formatET(p.startDate, false),
                    endLabel: formatET(p.endDate, false),
                    status: p.status,
                  }}
                  initialItems={p.checklistItems.map((it) => ({
                    id: it.id,
                    label: it.label,
                    status: it.status,
                    requirement: parseChecklistItemMeta(it.meta).requirement,
                  }))}
                  initialGate={gate}
                  initialDraw={
                    draw
                      ? {
                          id: draw.id,
                          number: draw.number,
                          amount: Number(draw.amount),
                          status: draw.status,
                          releasedAt: draw.paidAt ? formatET(draw.paidAt) : draw.approvedAt ? formatET(draw.approvedAt) : null,
                          releasedBy: draw.approvedById ? "Roey G." : null,
                        }
                      : null
                  }
                  defaultOpen={defaultOpen}
                  canEditChecklist={canEditChecklist}
                  canApproveDraw={canApproveDraw}
                  strictGate={strictGate}
                />
              );
            })}
          </div>
        </div>

        <div className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 8px" }}>Overall progress</div>
            <div className="prog-bar-wrap">
              <div className="prog-lbl">
                <span>Checklist items</span>
                <span>{totalDone} / {totalItems} complete</span>
              </div>
              <div className="prog-track">
                <div
                  className="prog-fill"
                  style={{ width: `${totalItems ? Math.round((totalDone / totalItems) * 100) : 0}%`, background: "var(--green)" }}
                />
              </div>
            </div>
            <div className="prog-bar-wrap">
              <div className="prog-lbl">
                <span>Payments released</span>
                <span>{fmt$(totalReleased)} / {fmt$(budget)}</span>
              </div>
              <div className="prog-track">
                <div
                  className="prog-fill"
                  style={{ width: `${budget ? Math.round((totalReleased / budget) * 100) : 0}%`, background: "var(--blue)" }}
                />
              </div>
            </div>
          </div>
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 8px" }}>Payment gate setting</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {strictGate ? (
                <>
                  <strong>Strict mode</strong> — releases are blocked until every checklist item for a phase is verified.
                </>
              ) : (
                <>
                  <strong>Advisory mode</strong> — releases are allowed before checklist completion, but each override is logged in the activity feed.
                </>
              )}
            </div>
            <div style={{ marginTop: 6 }}>
              <Link href="/admin/company-settings" style={{ fontSize: 10, color: "var(--blue)" }}>
                Change in Admin Settings →
              </Link>
            </div>
          </div>
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 8px" }}>Payment approval log</div>
            {project.draws
              .filter((d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved)
              .sort((a, b) => b.number - a.number)
              .map((d) => {
                const phase = project.phases.find((p) => p.id === d.phaseId);
                return (
                  <div className="alog-row" key={d.id}>
                    <div className="al-av">RG</div>
                    <div className="al-body">
                      <div className="al-action">Draw #{d.number} approved — {fmt$(Number(d.amount))}</div>
                      <div className="al-meta">
                        {phase?.name} · {formatET(d.paidAt ?? d.approvedAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
