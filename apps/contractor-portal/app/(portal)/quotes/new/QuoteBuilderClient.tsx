"use client";

import { useMemo, useState } from "react";
import { fmtCDec } from "@/lib/format";

type Recipient = { kind: "operator" | "contractor"; id: string; name: string; isExternal: boolean };
type Line = { id: number; desc: string; qty: number; unitType: string; unit: number };

const UNIT_TYPES = ["ea", "hr", "sqft", "lft", "day", "ls"];

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
    { id: 1, desc: "Labor — install", qty: 1, unitType: "hr", unit: 0 },
  ]);
  const [nextId, setNextId] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit, 0), [lines]);
  const blocked = recipientChoice === "external" && quotaMax !== null && quotaUsed >= quotaMax;

  function add() {
    setLines((l) => [...l, { id: nextId, desc: "", qty: 1, unitType: "ea", unit: 0 }]);
    setNextId((n) => n + 1);
  }
  function update(id: number, patch: Partial<Line>) {
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function remove(id: number) { setLines((l) => l.filter((x) => x.id !== id)); }
  function moveUp(index: number) {
    if (index === 0) return;
    setLines((l) => {
      const next = [...l];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  function moveDown(index: number) {
    setLines((l) => {
      if (index === l.length - 1) return l;
      const next = [...l];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

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
    setLines([{ id: 1, desc: "Labor — install", qty: 1, unitType: "hr", unit: 0 }]);
    setJobName("");
  }

  return (
    <div className="g2" style={{ alignItems: "flex-start" }}>
      <div className="card">
        <div className="ctitle" style={{ marginBottom: 12 }}>Quote details</div>
        {blocked && (
          <div className="bg-amber-light text-amber-dark" style={{ padding: 10, borderRadius: 8, fontSize: 11, marginBottom: 12 }}>
            You&apos;ve hit the free-tier limit of {quotaMax} external quotes per month. <a href="/account/upgrade" className="text-coral-dark" style={{ textDecoration: "underline" }}>Upgrade to Pro</a> to send unlimited.
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

        <div className="ctitle" style={{ marginTop: 8, marginBottom: 4 }}>Line items</div>
        <div style={{ display: "grid", gridTemplateColumns: "2.5fr .6fr .7fr 1fr 1fr 52px", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#a09e99", textTransform: "uppercase" }}>Description</span>
          <span style={{ fontSize: 10, color: "#a09e99", textTransform: "uppercase" }}>Qty</span>
          <span style={{ fontSize: 10, color: "#a09e99", textTransform: "uppercase" }}>Unit</span>
          <span style={{ fontSize: 10, color: "#a09e99", textTransform: "uppercase" }}>Unit $</span>
          <span style={{ fontSize: 10, color: "#a09e99", textTransform: "uppercase" }}>Total</span>
          <span />
        </div>
        {lines.map((l, idx) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "2.5fr .6fr .7fr 1fr 1fr 52px", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input value={l.desc} onChange={(e) => update(l.id, { desc: e.target.value })} placeholder="Description" />
            <input type="number" value={l.qty} min={0} onChange={(e) => update(l.id, { qty: Number(e.target.value) || 0 })} />
            <select value={l.unitType} onChange={(e) => update(l.id, { unitType: e.target.value })} style={{ fontSize: 12 }}>
              {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input type="number" value={l.unit} min={0} onChange={(e) => update(l.id, { unit: Number(e.target.value) || 0 })} placeholder="0.00" />
            <div style={{ fontSize: 11, fontWeight: 500, padding: "0 4px" }}>{fmtCDec(l.qty * l.unit)}</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                title="Move up"
                style={{ width: 20, height: 20, border: "1px solid rgba(0,0,0,.15)", borderRadius: 4, background: "#f7f6f3", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, fontSize: 10, lineHeight: 1 }}
              >↑</button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === lines.length - 1}
                title="Move down"
                style={{ width: 20, height: 20, border: "1px solid rgba(0,0,0,.15)", borderRadius: 4, background: "#f7f6f3", cursor: idx === lines.length - 1 ? "default" : "pointer", opacity: idx === lines.length - 1 ? 0.3 : 1, fontSize: 10, lineHeight: 1 }}
              >↓</button>
              <button type="button" onClick={() => remove(l.id)} className="bg-red-light text-red" style={{ width: 20, height: 20, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={add}>+ Add line</button>

        <div className="field" style={{ marginTop: 16 }}><label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        {msg && (
          <div className={msg.startsWith("Quote") ? "bg-teal-light text-teal-dark" : "bg-red-light text-red"} style={{ marginBottom: 8, padding: 8, borderRadius: 8, fontSize: 11 }}>
            {msg}
          </div>
        )}

        <button type="button" className="btn btn-p btn-full btn-lg" disabled={busy || blocked || !jobName} onClick={send}>
          {busy ? "Sending…" : "Send quote"}
        </button>
      </div>

      <div className="card" style={{ background: "#fff" }}>
        <div className="ctitle" style={{ marginBottom: 12 }}>Preview</div>
        <div style={{ borderBottom: "2px solid #1a1916", paddingBottom: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>QUOTE</div>
          <div style={{ fontSize: 11, color: "#6b6a66" }}>To: {recipientChoice === "external" ? externalName || externalEmail || "External recipient" : recipients.find(r => r.id === recipientId)?.name || "—"}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b6a66", textTransform: "uppercase", marginBottom: 4 }}>Project</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{jobName || "—"}</div>
        </div>
        <table className="tbl" style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Unit</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.desc || "—"}</td>
                <td style={{ textAlign: "right" }}>{l.qty}</td>
                <td style={{ textAlign: "right", color: "#6b6a66" }}>{l.unitType}</td>
                <td style={{ textAlign: "right" }}>{fmtCDec(l.unit)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCDec(l.qty * l.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #a09e99", fontSize: 14, fontWeight: 700 }}>
          <span>TOTAL</span><span>{fmtCDec(subtotal)}</span>
        </div>
        {notes && <div style={{ marginTop: 14, fontSize: 11, color: "#6b6a66" }}><strong>Notes:</strong> {notes}</div>}
      </div>
    </div>
  );
}
