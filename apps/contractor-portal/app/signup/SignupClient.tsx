"use client";

import { useState } from "react";

export default function SignupClient({
  token, email, contactName: initContact, companyName: initCompany, trade: initTrade, inviterName,
}: {
  token: string; email: string; contactName: string; companyName: string; trade: string; inviterName: string;
}) {
  const [contactName, setContactName] = useState(initContact);
  const [companyName, setCompanyName] = useState(initCompany);
  const [trade, setTrade] = useState(initTrade);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password, contactName, companyName, trade, phone }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "Signup failed."); setLoading(false); return; }
    window.location.href = "/dashboard";
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-mark" />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>CHG Contractor Portal</div>
            <div className="login-headline">{inviterName} invited you.</div>
            <div className="login-tag">Set your password to claim your account. You&apos;ll be able to send quotes, submit invoices, and manage docs in one place — free.</div>
            <div className="trust-row"><div className="trust-check">✓</div><span>Free forever for the basics</span></div>
            <div className="trust-row"><div className="trust-check">✓</div><span>Invite your own subs and clients later</span></div>
          </div>
          <div className="login-foot-left">© 2026 CHG · Privacy · Terms</div>
        </div>
        <div className="login-right">
          <div className="login-title">Claim your account</div>
          <div className="login-sub">Signing in as <strong>{email}</strong></div>
          {error ? <div className="login-error">{error}</div> : null}
          <form onSubmit={submit}>
            <div className="field"><label>Your name</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} required disabled={loading} /></div>
            <div className="field"><label>Company name</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required disabled={loading} /></div>
            <div className="field"><label>Trade</label><input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Drywall, HVAC, etc." disabled={loading} /></div>
            <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} /></div>
            <div className="field"><label>Confirm password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={loading} /></div>
            <button type="submit" className="login-cta" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
