import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadProjectActivity,
  loadProjectByCode,
} from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { parseActivityMeta, parseProjectMeta } from "@/lib/rehab/types";
import OverviewKpis from "@/components/rehab/OverviewKpis";
import { PhaseStatus, DrawStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();

  const meta = parseProjectMeta(project.meta);
  const budget = Number(project.budget ?? 0);
  const draws = project.draws;
  const paidDraws = draws.filter(
    (d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved
  );
  const totalSpent = paidDraws.reduce((acc, d) => acc + Number(d.amount), 0);
  // Projected final: see Budget page for the same rule. Not-started phases
  // contribute their budget; in-flight or completed phases contribute their
  // recorded actual (or budget if actual is still 0).
  const projectedFinal = project.phases.reduce((acc, p) => {
    const budgetN = Number(p.budget ?? 0);
    const actualN = Number(p.actual ?? 0);
    return acc + (p.status === PhaseStatus.NotStarted ? budgetN : actualN || budgetN);
  }, 0);
  const overage = projectedFinal - budget;
  const pendingDraws = draws.filter((d) => d.status === DrawStatus.Pending);

  // Timeline
  const start = project.startDate ?? new Date(project.createdAt);
  const end = project.endDate ?? new Date();
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );
  const elapsedDays = Math.max(0, Math.round((Date.now() - start.getTime()) / 86_400_000));

  // Phase rows
  const code = project.code;
  const phaseRows = project.phases.map((p) => {
    const draw = p.draws[0];
    const drawLabel =
      draw && (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved)
        ? `Draw #${draw.number} paid`
        : draw
        ? `Draw #${draw.number} ${draw.status === DrawStatus.Pending ? "pending" : draw.status.toLowerCase()}`
        : p.drawNote || "—";
    const stClass =
      p.status === PhaseStatus.Complete ? "st-done" : p.status === PhaseStatus.Active ? "st-act" : "st-wait";
    const stLabel =
      p.status === PhaseStatus.Complete ? "Complete" : p.status === PhaseStatus.Active ? "In progress" : "Not started";
    return { p, draw, drawLabel, stClass, stLabel };
  });

  const team = project.assignments;
  const recentDraws = [...draws].sort((a, b) => b.number - a.number);

  // Recent activity (project-scoped, last 6 entries)
  const allActivity = await loadProjectActivity(user.companyId, 200);
  const recentActivity = allActivity
    .filter((e) => {
      const m = parseActivityMeta(e.meta);
      return !m.projectId || m.projectId === project.id;
    })
    .slice(0, 6);

  return (
    <div className="tab-panel active">
      <OverviewKpis
        budget={budget}
        signedAt={formatET(project.startDate, false)}
        totalSpent={totalSpent}
        paidDrawsCount={paidDraws.length}
        projectedFinal={projectedFinal}
        overage={overage}
        timelineDays={totalDays}
        elapsedDays={elapsedDays}
        endLabel={formatET(end, false)}
        addendumDays={
          meta.originalEndDate
            ? Math.max(
                0,
                Math.round((end.getTime() - new Date(meta.originalEndDate).getTime()) / 86_400_000)
              )
            : 0
        }
        penaltyAccrued={meta.penaltyAccrued}
        penaltyStatus={meta.penaltyStatus}
        penaltyPerDiem={meta.penaltyPerDiem}
        pendingDrawsCount={pendingDraws.length}
        pendingBalance={pendingDraws.reduce((a, d) => a + Number(d.amount), 0)}
      />

      <div className="body-split">
        <div className="body-main">
          <div className="sec-hd">
            Phase tracker
            <Link
              href={`/rehab/${code}/schedule`}
              style={{
                float: "right",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--blue)",
                fontSize: 10,
              }}
            >
              View full schedule →
            </Link>
          </div>
          <div className="phase-tbl">
            {phaseRows.map(({ p, drawLabel, stClass, stLabel }) => (
              <Link
                key={p.id}
                href={`/rehab/${code}/checklist?phase=${p.number}`}
                className={`ph-row ph-row-6 ${p.status === PhaseStatus.Active ? "cur" : ""}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div>
                  <div className="ph-name">{p.name}</div>
                  <div className="ph-date">
                    Phase {p.number} · {formatET(p.startDate, false)} – {formatET(p.endDate, false)}
                    {p.status === PhaseStatus.Active ? " — Active" : ""}
                  </div>
                </div>
                <span className={`st-badge ${stClass}`}>{stLabel}</span>
                <div className="ph-amt">{fmt$(Number(p.budget ?? 0))}</div>
                <div className="ph-draw">{drawLabel}</div>
              </Link>
            ))}
          </div>

          <div className="sec-hd">Open items</div>
          {overage > 0 && (
            <div className="oi-item">
              <div className="oi-dot dot-amber"></div>
              <div className="oi-body">
                <div className="oi-text">
                  Projected final {fmt$(projectedFinal)} exceeds approved budget by {fmt$(overage)} —
                  change order required.
                </div>
                <div className="oi-tag">Budget · PM review required</div>
              </div>
            </div>
          )}
          {project.addenda
            .filter((a) => Number(a.delta) !== 0 || a.title.includes("#2"))
            .slice(-1)
            .map((a) => (
              <div className="oi-item" key={a.id}>
                <div className="oi-dot dot-blue"></div>
                <div className="oi-body">
                  <div className="oi-text">{a.reason || a.title}</div>
                  <div className="oi-tag">
                    Schedule · Signed {formatET(a.createdAt, false)} ·{" "}
                    <Link href={`/rehab/${code}/sow`} style={{ color: "var(--blue)" }}>
                      View in SOW →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          {meta.penaltyStatus === "Paused" && (
            <div className="oi-item">
              <div className="oi-dot dot-amber"></div>
              <div className="oi-body">
                <div className="oi-text">
                  HVAC access exception filed. Penalty clock paused pending resolution.
                </div>
                <div className="oi-tag">
                  Exception · Penalty paused ·{" "}
                  <Link href={`/rehab/${code}/activity`} style={{ color: "var(--blue)" }}>
                    View exception →
                  </Link>
                </div>
              </div>
            </div>
          )}
          {pendingDraws.slice(0, 1).map((d) => (
            <div className="oi-item" key={d.id}>
              <div className="oi-dot dot-blue"></div>
              <div className="oi-body">
                <div className="oi-text">
                  Draw #{d.number} ({fmt$(Number(d.amount))}) locked — checklist must be verified first.
                </div>
                <div className="oi-tag">
                  Payment · Awaiting sign-off ·{" "}
                  <Link href={`/rehab/${code}/checklist`} style={{ color: "var(--blue)" }}>
                    View checklist →
                  </Link>
                </div>
              </div>
            </div>
          ))}

          <div className="sec-hd">
            Recent activity
            <Link
              href={`/rehab/${code}/activity`}
              style={{
                float: "right",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--blue)",
                fontSize: 10,
              }}
            >
              View all →
            </Link>
          </div>
          {recentActivity.length === 0 && (
            <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
              No activity yet.
            </div>
          )}
          {recentActivity.map((e) => {
            const m = parseActivityMeta(e.meta);
            const who = e.actor
              ? `${e.actor.firstName ?? ""} ${e.actor.lastName ?? ""}`.trim() || e.actor.email || "User"
              : "System";
            // Promote legacy change-order entries (older meta.type === "task")
            // so the dot + inline link match the new Activity feed treatment.
            const isChangeOrder = e.action === "changeOrder.requested" || m.type === "changeOrder";
            const dotColor = isChangeOrder
              ? "#2A6CD0"
              : m.type === "payment"
              ? "var(--amber)"
              : m.type === "flag"
              ? "var(--red-txt)"
              : m.type === "document"
              ? "#993856"
              : m.type === "task"
              ? "var(--purple-txt)"
              : m.type === "note"
              ? "var(--green)"
              : "var(--blue)";
            const sowHref =
              isChangeOrder && m.phaseNumber
                ? `/rehab/${code}/sow?phase=${m.phaseNumber}#sow-phase-${m.phaseNumber}`
                : null;
            return (
              <div className="oi-item" key={e.id}>
                <div className="oi-dot" style={{ background: dotColor }}></div>
                <div className="oi-body">
                  <div className="oi-text">{e.message ?? ""}</div>
                  <div className="oi-tag">
                    {isChangeOrder && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 5px",
                          marginRight: 6,
                          borderRadius: 3,
                          background: "#E8F0FB",
                          color: "#1F4FA8",
                          fontWeight: 500,
                        }}
                      >
                        Change order
                      </span>
                    )}
                    {who} · {formatET(e.createdAt)}
                    {sowHref && (
                      <>
                        {" · "}
                        <Link href={sowHref} style={{ color: "var(--blue)" }}>
                          {m.phaseNumber ? `View Phase ${m.phaseNumber} in SOW →` : "View in SOW →"}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="body-side">
          <div className="sb-sec">
            <div className="sb-hd">Project team</div>
            {team.map((a) => {
              const u = a.user;
              const initials =
                u.initials ||
                [(u.firstName || "")[0], (u.lastName || "")[0]].filter(Boolean).join("").toUpperCase() ||
                "??";
              const avClass = ["av av-b", "av av-t", "av av-a", "av av-c", "av av-p"][a.role.length % 5];
              return (
                <div key={a.id} className="team-row">
                  <div className={avClass}>{initials}</div>
                  <div>
                    <div className="tm-name">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="tm-role">{a.role}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sb-sec">
            <div className="sb-hd">
              Draw history
              <Link
                href={`/rehab/${code}/budget`}
                className="btn-sm"
                style={{ float: "right", marginTop: -2 }}
              >
                See all
              </Link>
            </div>
            {recentDraws.map((d) => {
              const paid = d.status === DrawStatus.Paid || d.status === DrawStatus.Approved;
              return (
                <div key={d.id} className="dr-row">
                  <div className="dr-info">
                    <div className="dr-num">Draw #{d.number}</div>
                    <div className="dr-ph">{d.title.replace(/^Draw #\d+ — /, "")}</div>
                    <div className="dr-et">{paid ? formatET(d.paidAt ?? d.approvedAt) : "Pending checklist"}</div>
                  </div>
                  <div className="dr-r">
                    <div className="dr-amt">{fmt$(Number(d.amount))}</div>
                    <span className={`dr-st ${paid ? "ds-p" : "ds-n"}`}>{paid ? "Paid" : "Pending"}</span>
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
