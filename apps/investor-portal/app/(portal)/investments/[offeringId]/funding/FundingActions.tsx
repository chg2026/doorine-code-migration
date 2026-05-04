"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FundingActions({
  subscriptionId,
  offeringName,
}: {
  subscriptionId: string;
  offeringName: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"wire" | "ach">("wire");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/confirm-funding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, reference }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `failed (${res.status})`);
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        className="card"
        style={{
          background: "var(--teal-light)",
          borderColor: "var(--teal)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-dark)", marginBottom: 4 }}>
          Funding initiated
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {"We've notified the operator of your "}{method.toUpperCase()}{" for "}
          <strong>{offeringName}</strong>{". They will mark your subscription as funded once they confirm receipt."}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-hd">
        <div className="card-title">{"I've sent the funds"}</div>
        <span className="card-sub">Notify the operator</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center" }}>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as "wire" | "ach")}
          style={selectStyle}
        >
          <option value="wire">Wire</option>
          <option value="ach">ACH</option>
        </select>
        <input
          type="text"
          placeholder="Optional reference / wire #"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn btn-sm btn-p"
        >
          {busy ? "Sending…" : "Notify operator"}
        </button>
      </div>
      {error ? (
        <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11, marginTop: 8 }}>
          {error}
        </div>
      ) : null}
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
        This logs an activity entry on your account. The operator confirms the
        actual funded amount once the wire clears.
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  border: "0.5px solid var(--border-mid)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, width: "auto" };
