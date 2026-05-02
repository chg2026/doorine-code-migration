"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem, releaseDraw } from "@/lib/rehab/actions";
import type { PhaseGateState } from "@/lib/paymentGate";
import { formatET } from "@/lib/datetime";
import {
  BILLING_BLOCKED_CODE,
  BILLING_BLOCKED_MESSAGE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

type ChecklistItemStatus = "Pending" | "Done" | "NA" | "Flagged";
type PhaseStatusLabel = "NotStarted" | "Active" | "Complete" | "OnHold";
type DrawStatusLabel = "Pending" | "Approved" | "Paid" | "Rejected";

type Item = {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  requirement?: string | null;
};

type Phase = {
  id: string;
  number: number;
  name: string;
  startLabel: string;
  endLabel: string;
  status: PhaseStatusLabel;
};

type Draw = {
  id: string;
  number: number;
  amount: number;
  status: DrawStatusLabel;
  releasedAt?: string | null;
  releasedBy?: string | null;
} | null;

function isDrawStatusLabel(v: string): v is DrawStatusLabel {
  return v === "Pending" || v === "Approved" || v === "Paid" || v === "Rejected";
}

export default function ChecklistPhase({
  phase,
  initialItems,
  initialGate,
  initialDraw,
  defaultOpen,
  canEditChecklist,
  canApproveDraw,
  strictGate,
}: {
  phase: Phase;
  initialItems: Item[];
  initialGate: PhaseGateState;
  initialDraw: Draw;
  defaultOpen: boolean;
  canEditChecklist: boolean;
  canApproveDraw: boolean;
  strictGate: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState(initialItems);
  const [gate, setGate] = useState(initialGate);
  const [draw, setDraw] = useState(initialDraw);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [advisoryConfirm, setAdvisoryConfirm] = useState(false);

  const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const isReleased = !!draw && (draw.status === "Approved" || draw.status === "Paid");
  const phStCls = phase.status === "Complete" ? "st-done" : phase.status === "Active" ? "st-act" : "st-wait";
  const phStLabel = phase.status === "Complete" ? "Complete" : phase.status === "Active" ? "In progress" : "Not started";
  const pnCls = phase.status === "Complete" ? "pn-g" : phase.status === "Active" ? "pn-b" : "pn-gr";

  const drawChipBg = isReleased
    ? { background: "var(--green-bg)", color: "var(--green-txt)" }
    : draw
    ? { background: "var(--amber-bg)", color: "var(--amber-txt)" }
    : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" };

  function onToggle(itemId: string) {
    if (!canEditChecklist || pending || isReleased) return;
    setError(null);
    // Optimistic flip
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: it.status === "Done" ? "Pending" : "Done" } : it))
    );
    startTransition(async () => {
      try {
        const fresh = await toggleChecklistItem(itemId);
        setGate(fresh);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to toggle");
        // rollback
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, status: it.status === "Done" ? "Pending" : "Done" } : it))
        );
      }
    });
  }

  function onRelease() {
    if (!canApproveDraw || pending || !draw || isReleased) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await releaseDraw(phase.id, { advisoryAck: !gate.isOpen && !strictGate });
        if ("ok" in result && result.ok) {
          setGate(result.gate);
          const fresh = result.gate.draw;
          if (fresh) {
            const status: DrawStatusLabel = isDrawStatusLabel(fresh.status) ? fresh.status : "Pending";
            const stamp = fresh.paidAt ?? fresh.approvedAt ?? null;
            setDraw({
              id: fresh.id,
              number: fresh.number,
              amount: Number(fresh.amount),
              status,
              releasedAt: stamp ? formatET(stamp) : null,
              releasedBy: "You",
            });
          }
          setAdvisoryConfirm(false);
        } else if ("reason" in result) {
          if (result.reason === BILLING_BLOCKED_CODE) {
            notifyBillingBlocked();
          }
          setError(result.reason);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to release");
      }
    });
  }

  const releaseBtn = (() => {
    if (!draw) return <button className="gate-btn gate-locked" disabled>No draw</button>;
    if (isReleased) {
      return (
        <button className="gate-btn gate-released" disabled>
          Released ✓
        </button>
      );
    }
    // Users without draws.approve permission do not see release controls at
    // all (per UX spec: GC verifies items, PM/Admin releases). They still see
    // the gate state via the chip and item list.
    if (!canApproveDraw) {
      return (
        <span className="gate-readonly" aria-label="Release requires approver permission">
          {gate.isOpen ? "Awaiting approver" : strictGate ? "Locked" : "Awaiting approver"}
        </span>
      );
    }
    if (gate.isOpen) {
      return (
        <button className="gate-btn" onClick={onRelease} disabled={pending}>
          {pending ? "Releasing..." : `Release ${fmt$(Number(draw.amount))}`}
        </button>
      );
    }
    // gate closed
    if (!strictGate) {
      // advisory mode
      if (!advisoryConfirm) {
        return (
          <button
            className="gate-btn"
            style={{ background: "var(--amber)", borderColor: "var(--amber)" }}
            onClick={() => setAdvisoryConfirm(true)}
            disabled={pending}
          >
            Override (advisory)
          </button>
        );
      }
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-sm" onClick={() => setAdvisoryConfirm(false)}>Cancel</button>
          <button className="gate-btn" style={{ background: "var(--amber)", borderColor: "var(--amber)" }} onClick={onRelease} disabled={pending}>
            {pending ? "Releasing..." : `Confirm release ${fmt$(Number(draw.amount))}`}
          </button>
        </div>
      );
    }
    return <button className="gate-btn gate-locked" disabled>Locked</button>;
  })();

  const drawChipText = isReleased
    ? `${fmt$(Number(draw!.amount))} paid`
    : draw
    ? `${fmt$(Number(draw.amount))} pending`
    : "—";

  return (
    <div style={{ borderBottom: "0.5px solid var(--border-lo)" }}>
      <div
        className="cl-ph-hdr"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={phase.status === "Active" ? { background: "#fff" } : undefined}
      >
        <div className={`pnum ${pnCls}`}>{phase.number}</div>
        <div className="ph-name-wrap">
          <div style={{ fontSize: 11, fontWeight: 500 }}>{phase.name}</div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
            Phase {phase.number} · {phase.startLabel} – {phase.endLabel}
            {phase.status === "Active" ? " — In progress" : ""}
          </div>
        </div>
        <span className={`st-badge ${phStCls}`} style={{ fontSize: 9, flexShrink: 0 }}>{phStLabel}</span>
        {draw && (
          <div className="draw-chip" style={{ ...drawChipBg, flexShrink: 0 }}>
            <span style={{ display: "block" }}>Draw #{draw.number}</span>
            <span style={{ display: "block" }}>{drawChipText}</span>
          </div>
        )}
      </div>
      {open && (
        <div className="cl-ph-body open">
          {items.map((it) => {
            const cls =
              it.status === "Done" ? "cl-check checked" : it.status === "NA" ? "cl-check partial" : "cl-check";
            const mark = it.status === "Done" || it.status === "NA" ? "✓" : "";
            return (
              <div className="cl-item-row" key={it.id}>
                <div
                  className={cls}
                  onClick={() => onToggle(it.id)}
                  role="button"
                  aria-pressed={it.status === "Done"}
                  aria-disabled={!canEditChecklist || isReleased}
                  style={
                    !canEditChecklist || isReleased
                      ? { cursor: "not-allowed", opacity: 0.6 }
                      : { cursor: "pointer" }
                  }
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle(it.id);
                    }
                  }}
                >
                  {mark}
                </div>
                <div>
                  <div className="cl-txt">{it.label}</div>
                  {it.requirement && <div className="cl-req">{it.requirement}</div>}
                </div>
              </div>
            );
          })}
          <div className="gate-box">
            <div className="gate-info">
              <div className="gate-lbl">
                {draw ? `Draw #${draw.number} — Payment gate` : "Payment gate"}
                {draw &&
                  (isReleased ? (
                    <span style={{ background: "var(--green-bg)", color: "var(--green-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>
                      Released
                    </span>
                  ) : gate.isOpen ? (
                    <span style={{ background: "var(--blue-bg)", color: "var(--blue-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>
                      Open
                    </span>
                  ) : (
                    <span
                      style={
                        strictGate
                          ? { background: "var(--red-bg)", color: "var(--red-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }
                          : { background: "var(--amber-bg)", color: "var(--amber-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }
                      }
                    >
                      {strictGate ? "Locked" : "Advisory"}
                    </span>
                  ))}
              </div>
              <div className="gate-sub">
                {gate.doneItems} of {gate.totalItems} items verified
                {isReleased && draw?.releasedAt
                  ? ` · Released ${draw.releasedAt}${draw.releasedBy ? ` · by ${draw.releasedBy}` : ""}`
                  : gate.isOpen
                  ? " · Ready to release"
                  : strictGate
                  ? " · All items must pass to release payment"
                  : " · Strict gate disabled — release allowed with advisory"}
              </div>
              {error && (
                <div style={{ marginTop: 6, fontSize: 10, color: error === BILLING_BLOCKED_CODE ? "var(--amber-txt)" : "var(--red-txt)" }}>
                  {error === BILLING_BLOCKED_CODE
                    ? BILLING_BLOCKED_MESSAGE
                    : error === "checklist-incomplete"
                    ? "Checklist incomplete — gate is closed."
                    : error === "no-draw"
                    ? "No draw exists for this phase."
                    : error === "already-released"
                    ? "This draw has already been released."
                    : error}
                </div>
              )}
            </div>
            <div className="gate-r">
              {draw && <div className="gate-amt">{fmt$(Number(draw.amount))}</div>}
              {releaseBtn}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
