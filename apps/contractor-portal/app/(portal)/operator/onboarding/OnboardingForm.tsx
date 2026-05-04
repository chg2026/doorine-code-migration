"use client";

import { useState } from "react";

export default function OnboardingForm() {
  const [email, setEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trade, setTrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, contactName, companyName, trade }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: json.error || "Failed to send invite." }); return; }
    setMsg({ ok: true, text: `Invite sent to ${email}.`, link: json.link });
    setEmail(""); setContactName(""); setCompanyName(""); setTrade("");
  }

  return (
    <div className="card">
      <div className="ctitle" style={{ marginBottom: 12 }}>Invite a contractor</div>
      <form onSubmit={send}>
        <div className="field"><label>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></div>
        <div className="field"><label>Contact name</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={busy} /></div>
        <div className="field"><label>Company</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={busy} /></div>
        <div className="field"><label>Trade</label><input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Drywall, HVAC, …" disabled={busy} /></div>
        <button className="btn btn-p btn-full" disabled={busy || !email}>{busy ? "Sending…" : "Send magic-link invite"}</button>
      </form>
      {msg && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: msg.ok ? "var(--teal-l)" : "var(--red-l)", color: msg.ok ? "var(--teal-d)" : "var(--red)", fontSize: 11 }}>
          {msg.text}
          {msg.link && <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>{msg.link}</div>}
        </div>
      )}
    </div>
  );
}
