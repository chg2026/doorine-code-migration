"use client";

import { useMemo, useState } from "react";
import { fmtCDec } from "@/lib/format";

type Recipient = { kind: "operator" | "contractor"; id: string; name: string; isExternal: boolean };
type Line = { id: number; desc: string; qty: number; unit: number };

export default function QuoteBuilderClient({
  recipients, quotaUsed, quotaMax,
}: {
  recipients: Recipient[];
  quotaUsed: number;
  quotaMax: number | null;
}) {
  const [jobName, setJobName] = useState("");
  const [recipientChoice, setRecipientChoice] = useState<"in-network" | "external">("in-network");
  const [recipientId, setRecipientId] = useState(recipients[0]?.id || "");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalName, setExternalName] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: 1, desc: "Labor — install", qty: 1, unit: 0 },
  ]);
  const [nextId, setNextId] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit, 0), [lines]);
  const blocked = recipientChoice === "external" && quotaMax !== null && quotaUsed >= quotaMax;

  function add() {
    setLines((l) => [...l, { id: nextId, desc: "", qty: 1, unit: 0 }]);
    setNextId((n) => n + 1);
  }
  function update(id: number, patch: Partial<Line>) {
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function remove(id: number) { setLines((l) => l.filter((x) => x.id !== id)); }

  async function send() {
    setBusy(true); setMsg(null);
    const recipient = recipientChoice === "in-network"
      ? recipients.find((r) => r.id === recipientId)
      : null;
    const body = {
      jobName,
      notes,
      lines,
      recipientType: recipient?.kind || "contractor",
      toCompanyId: recipient?.kind === "operator" ? recipient.id : null,
      toAccountId: recipient?.kind === "contractor" ? recipient.id : null,
      isExternal: recipientChoice === "external",
      externalEmail: recipientChoice === "external" ? externalEmail : null,
      externalName: recipientChoice === "external" ? externalName : null,
    };
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || "Failed to send quote");
      return;
    }
    setMsg(`Quote ${json.number} sent successfully.`);
    setLines([{ id: 1, desc: "Labor — install", qty: 1, unit: 0 }]);
    setJobName("");
  }

  return (
    <div className="g2" style={{ alignItems: "flex-start" }}>
      <div className="card">
        <div className="ctitle" style={{ marginBottom: 12 }}>Quote details</div>
        {blocked && (
          <div style={{ background: "var(--amber-l)", color: "var(--amber-d)", padding: 10, borderRadius: 8, fontSize: 11, marginBottom: 12 }}>
            You&apos;ve hit the free-tier limit of {quotaMax} external quotes per month. <a href="/account/upgrade" style={{ color: "var(--coral-d)", textDecoration: "underline" }}>Upgrade to Pro</a> to send unlimited.
          </div>
        )}
        <div className="field"><label>Job / project name</label><input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="Birchwood Townhomes — Drywall" /></div>

        <div className="field">
          <label>Recipient</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" className={`btn btn-sm ${recipientChoice === "in-network" ? "btn-p" : ""}`} onClick={() => setRecipientChoice("in-network")}>In-network (free)</button>
            <button type="button" className={`btn btn-sm ${recipientChoice === "external" ? "btn-p" : ""}`} onClick={() => setRecipientChoice("external")}>External email{quotaMax !== null ? ` (${quotaUsed}/${quotaMax})` : ""}</button>
          </div>
          {recipientChoice === "in-network" ? (
            <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {recipients.length === 0 ? <option value="">No in-network recipients</option> : recipients.map((r) => (
                <option key={`${r.kind}:${r.id}`} value={r.id}>{r.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Recipient name" style={{ marginBottom: 6 }} />
              <input value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} placeholder="Recipient email" />
            </>
          )}
        </div>

        <div className="ctitle" style={{ marginTop: 8, marginBottom: 8 }}>Line items</div>
        {lines.map((l) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "2.5fr .7fr 1fr 1fr 28px", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input value={l.desc} onChange={(e) => update(l.id, { desc: e.target.value })} placeholder="Description" />
            <input type="number" value={l.qty} onChange={(e) => update(l.id, { qty: Number(e.target.value) || 0 })} />
            <input type="number" value={l.unit} onChange={(e) => update(l.id, { unit: Number(e.target.value) || 0 })} placeholder="Unit $" />
            <div style={{ fontSize: 11, fontWeight: 500, padding: "0 8px" }}>{fmtCDec(l.qty * l.unit)}</div>
            <button type="button" onClick={() => remove(l.id)} style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--red-l)", border: "none", color: "var(--red)", cursor: "pointer" }}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={add}>+ Add line</button>

        <div className="field" style={{ marginTop: 16 }}><label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        {msg && <div style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: msg.startsWith("Quote") ? "var(--teal-l)" : "var(--red-l)", color: msg.startsWith("Quote") ? "var(--teal-d)" : "var(--red)", fontSize: 11 }}>{msg}</div>}

        <button type="button" className="btn btn-p btn-full btn-lg" disabled={busy || blocked || !jobName} onClick={send}>
          {busy ? "Sending…" : "Send quote"}
        </button>
      </div>

      <div className="card" style={{ background: "#fff" }}>
        <div className="ctitle" style={{ marginBottom: 12 }}>Preview</div>
        <div style={{ borderBottom: "2px solid #1a1916", paddingBottom: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>QUOTE</div>
          <div style={{ fontSize: 11, color: "var(--t2)" }}>To: {recipientChoice === "external" ? externalName || externalEmail || "External recipient" : recipients.find(r => r.id === recipientId)?.name || "—"}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--t2)", textTransform: "uppercase", marginBottom: 4 }}>Project</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{jobName || "—"}</div>
        </div>
        <table className="tbl" style={{ marginBottom: 14 }}>
          <thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Unit</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}><td>{l.desc || "—"}</td><td style={{ textAlign: "right" }}>{l.qty}</td><td style={{ textAlign: "right" }}>{fmtCDec(l.unit)}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCDec(l.qty * l.unit)}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--t3)", fontSize: 14, fontWeight: 700 }}>
          <span>TOTAL</span><span>{fmtCDec(subtotal)}</span>
        </div>
        {notes && <div style={{ marginTop: 14, fontSize: 11, color: "var(--t2)" }}><strong>Notes:</strong> {notes}</div>}
      </div>
    </div>
  );
}
