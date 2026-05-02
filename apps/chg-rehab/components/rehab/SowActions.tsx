"use client";

import { useState, useTransition } from "react";
import { fileException, requestChangeOrder } from "@/lib/rehab/actions";

type Mode = "exception" | "changeOrder" | null;

export default function SowActions({
  projectCode,
  phases,
  canEdit,
}: {
  projectCode: string;
  phases: Array<{ number: number; name: string }>;
  canEdit: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [phaseNumber, setPhaseNumber] = useState<number>(phases[0]?.number ?? 1);
  const [summary, setSummary] = useState("");
  const [estimate, setEstimate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function reset() {
    setMode(null);
    setSummary("");
    setEstimate("");
    setError(null);
  }

  function submit() {
    if (!summary.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "exception") {
          await fileException(projectCode, phaseNumber, summary);
          setOkMessage(`Exception filed for Phase ${phaseNumber}.`);
        } else if (mode === "changeOrder") {
          await requestChangeOrder(projectCode, phaseNumber, summary, estimate);
          setOkMessage(`Change order requested for Phase ${phaseNumber}.`);
        }
        reset();
        setTimeout(() => setOkMessage(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  if (!canEdit) {
    return (
      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
        Read-only · ask a PM to file exceptions or change orders.
      </span>
    );
  }

  if (mode === null) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="btn" onClick={() => setMode("exception")}>
          File exception
        </button>
        <button className="btn" onClick={() => setMode("changeOrder")}>
          Request change order
        </button>
        {okMessage && (
          <span style={{ fontSize: 10, color: "var(--green-txt)" }}>{okMessage}</span>
        )}
      </div>
    );
  }

  const title = mode === "exception" ? "File exception" : "Request change order";
  const submitLabel =
    mode === "exception" ? "File exception" : "Submit change order request";

  return (
    <div className="sow-action-panel">
      <div className="sap-hd">
        <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
        <button className="btn-sm" onClick={reset} disabled={pending}>
          Cancel
        </button>
      </div>
      <div className="sap-body">
        <label className="sap-row">
          <span className="sap-lbl">Phase</span>
          <select
            value={phaseNumber}
            onChange={(e) => setPhaseNumber(parseInt(e.target.value, 10))}
            disabled={pending}
            className="sap-input"
          >
            {phases.map((p) => (
              <option key={p.number} value={p.number}>
                Phase {p.number} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sap-row">
          <span className="sap-lbl">
            {mode === "exception" ? "Why is the penalty clock paused?" : "What scope is changing?"}
          </span>
          <textarea
            className="sap-input"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={pending}
            placeholder={
              mode === "exception"
                ? "e.g. HVAC vendor cannot access roof until access permit clears."
                : "e.g. Add tile backsplash + paint in unit B."
            }
          />
        </label>
        {mode === "changeOrder" && (
          <label className="sap-row">
            <span className="sap-lbl">Estimate (USD)</span>
            <input
              className="sap-input"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value.replace(/[^0-9.]/g, ""))}
              disabled={pending}
              placeholder="0"
              inputMode="decimal"
            />
          </label>
        )}
        {error && (
          <div style={{ fontSize: 10, color: "var(--red-txt)", marginTop: 4 }}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Submitting..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
