"use client";

import { useState } from "react";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type KpiKey = "budget" | "spent" | "projected" | "timeline" | "penalty" | null;

type Props = {
  budget: number;
  signedAt: string;
  totalSpent: number;
  paidDrawsCount: number;
  projectedFinal: number;
  overage: number;
  timelineDays: number;
  elapsedDays: number;
  endLabel: string;
  addendumDays: number;
  penaltyAccrued: number;
  penaltyStatus: "Active" | "Paused" | "Resolved";
  penaltyPerDiem: number;
  pendingDrawsCount: number;
  pendingBalance: number;
};

export default function OverviewKpis(props: Props) {
  const [open, setOpen] = useState<KpiKey>(null);

  return (
    <>
      <div className="kpi-strip">
        <KpiCard onClick={() => setOpen("budget")}>
          <div className="kpi-label">Approved budget</div>
          <div className="kpi-val">{fmt$(props.budget)}</div>
          <div className="kpi-sub">Signed {props.signedAt}</div>
        </KpiCard>
        <KpiCard onClick={() => setOpen("spent")}>
          <div className="kpi-label">Total spent</div>
          <div className="kpi-val">{fmt$(props.totalSpent)}</div>
          <div className="kpi-sub">{props.paidDrawsCount} draws paid</div>
        </KpiCard>
        <KpiCard onClick={() => setOpen("projected")}>
          <div className="kpi-label">Projected final</div>
          <div className={`kpi-val ${props.overage > 0 ? "amber" : ""}`}>
            {fmt$(props.projectedFinal)}
          </div>
          {props.overage !== 0 && (
            <div
              className="kpi-badge"
              style={
                props.overage > 0
                  ? { background: "var(--amber-bg)", color: "var(--amber-txt)" }
                  : { background: "var(--green-bg)", color: "var(--green-txt)" }
              }
            >
              {props.overage > 0
                ? `+${fmt$(props.overage)} over budget`
                : `${fmt$(props.overage)} under budget`}
            </div>
          )}
        </KpiCard>
        <KpiCard onClick={() => setOpen("timeline")}>
          <div className="kpi-label">Timeline</div>
          <div className="kpi-val">{props.timelineDays} days</div>
          <div className="kpi-sub">{props.endLabel}</div>
          {props.addendumDays > 0 && (
            <div
              className="kpi-badge"
              style={{ background: "var(--blue-bg)", color: "var(--blue-txt)" }}
            >
              +{props.addendumDays} day addendum
            </div>
          )}
        </KpiCard>
        <KpiCard onClick={() => setOpen("penalty")}>
          <div className="kpi-label">Penalty accrued</div>
          <div className="kpi-val">${props.penaltyAccrued.toLocaleString()}</div>
          <div
            className="kpi-badge"
            style={
              props.penaltyStatus === "Paused"
                ? { background: "var(--green-bg)", color: "var(--green-txt)" }
                : { background: "var(--amber-bg)", color: "var(--amber-txt)" }
            }
          >
            {props.penaltyStatus === "Paused" ? "Paused — exception" : props.penaltyStatus}
          </div>
        </KpiCard>
      </div>

      {open && <Modal onClose={() => setOpen(null)}>{renderDetail(open, props)}</Modal>}
    </>
  );
}

function KpiCard({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kpi-card"
      style={{
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="kpi-modal-backdrop" onClick={onClose}>
      <div
        className="kpi-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="kpi-modal-close"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function renderDetail(key: NonNullable<KpiKey>, p: Props) {
  switch (key) {
    case "budget":
      return (
        <>
          <h3 className="kpi-modal-h">Approved budget</h3>
          <div className="kpi-modal-big">{fmt$(p.budget)}</div>
          <ul className="kpi-modal-list">
            <li>Signed {p.signedAt}</li>
            <li>Phase budgets sum to projected {fmt$(p.projectedFinal)}.</li>
            <li>
              {p.overage > 0
                ? `Currently ${fmt$(p.overage)} over approved — change order recommended.`
                : `${fmt$(-p.overage)} under approved.`}
            </li>
          </ul>
        </>
      );
    case "spent":
      return (
        <>
          <h3 className="kpi-modal-h">Total spent (released draws)</h3>
          <div className="kpi-modal-big">{fmt$(p.totalSpent)}</div>
          <ul className="kpi-modal-list">
            <li>{p.paidDrawsCount} draw{p.paidDrawsCount === 1 ? "" : "s"} released so far.</li>
            <li>{p.pendingDrawsCount} draw{p.pendingDrawsCount === 1 ? "" : "s"} pending — {fmt$(p.pendingBalance)} held.</li>
            <li>Remaining against approved budget: {fmt$(Math.max(0, p.budget - p.totalSpent))}.</li>
          </ul>
        </>
      );
    case "projected":
      return (
        <>
          <h3 className="kpi-modal-h">Projected final</h3>
          <div className="kpi-modal-big">{fmt$(p.projectedFinal)}</div>
          <ul className="kpi-modal-list">
            <li>Sum of phase actuals (or budget if not started).</li>
            <li>
              Variance vs approved:{" "}
              {p.overage > 0
                ? `+${fmt$(p.overage)} over`
                : p.overage < 0
                ? `${fmt$(-p.overage)} under`
                : "$0"}
            </li>
            <li>Open the Budget tab for per-line detail.</li>
          </ul>
        </>
      );
    case "timeline":
      return (
        <>
          <h3 className="kpi-modal-h">Timeline</h3>
          <div className="kpi-modal-big">{p.timelineDays} days total</div>
          <ul className="kpi-modal-list">
            <li>Day {Math.min(p.elapsedDays, p.timelineDays)} of {p.timelineDays}.</li>
            <li>Target completion {p.endLabel} ET.</li>
            {p.addendumDays > 0 && <li>Addendum extended schedule by {p.addendumDays} day{p.addendumDays === 1 ? "" : "s"}.</li>}
          </ul>
        </>
      );
    case "penalty":
      return (
        <>
          <h3 className="kpi-modal-h">Late-completion penalty</h3>
          <div className="kpi-modal-big">${p.penaltyAccrued.toLocaleString()}</div>
          <ul className="kpi-modal-list">
            <li>Per diem: ${p.penaltyPerDiem.toLocaleString()} / day past target.</li>
            <li>Status: {p.penaltyStatus}.</li>
            {p.penaltyStatus === "Paused" && (
              <li>Clock paused while a filed exception is being resolved.</li>
            )}
          </ul>
        </>
      );
  }
}
