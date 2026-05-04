"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CapitalCallActions({
  callId,
  attested,
  amountDue,
  offeringName,
}: {
  callId: string;
  attested: boolean;
  amountDue: number;
  offeringName: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"wire" | "ach">("wire");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(attested);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/capital-calls/${callId}/confirm-payment`, {
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
      <div className="card" style={{ background: "var(--teal-light)", borderColor: "var(--teal)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-dark)", marginBottom: 4 }}>
          Payment initiated
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {`The operator has been notified that you initiated payment of $${Math.round(amountDue).toLocaleString()} for ${offeringName}. They will confirm receipt and update your funded amount.`}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-hd">
        <div className="card-title">I&apos;ve sent payment</div>
        <span className="card-sub">${Math.round(amountDue).toLocaleString()} due</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center" }}>
        <select value={method} onChange={(e) => setMethod(e.target.value as "wire" | "ach")} style={selectStyle}>
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
        <button type="button" onClick={submit} disabled={busy} className="btn btn-sm btn-p">
          {busy ? "Sending…" : "Notify operator"}
        </button>
      </div>
      {error ? (
        <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11, marginTop: 8 }}>
          {error}
        </div>
      ) : null}
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
