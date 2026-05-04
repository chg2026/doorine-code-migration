"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginClient({ next, initialError }: { next: string; initialError: string }) {
  const [email, setEmail] = useState("mike@torresdrywall.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInErr) throw signInErr;
      const verify = await fetch("/api/auth/user", { credentials: "include" });
      if (verify.status !== 200) {
        await supabase.auth.signOut();
        const body = await verify.json().catch(() => ({}));
        throw new Error(
          body?.error === "wrong_role"
            ? "This account is not a contractor account."
            : body?.message || body?.error || "Sign-in failed. Please try again."
        );
      }
      window.location.href = next || "/dashboard";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-mark" />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>CHG Contractor Portal</div>
            <div className="login-headline">Run your trade business — without the spreadsheets.</div>
            <div className="login-tag">Quotes, invoices, jobs, compliance and payment status — all in one place, free for trades.</div>
            <div className="trust-row"><div className="trust-check">✓</div><span>Send polished quotes in minutes</span></div>
            <div className="trust-row"><div className="trust-check">✓</div><span>Get paid faster with portal invoicing</span></div>
            <div className="trust-row"><div className="trust-check">✓</div><span>Stay compliant — COI &amp; W-9 in one vault</span></div>
          </div>
          <div className="login-foot-left">© 2026 CHG · Privacy · Terms</div>
        </div>
        <div className="login-right">
          <div className="login-title">Welcome back</div>
          <div className="login-sub">Sign in to your contractor portal</div>
          {error ? <div className="login-error">{error}</div> : null}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} placeholder="Password" />
            </div>
            <button type="submit" className="login-cta" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="login-helper">
            Demo: <strong>mike@torresdrywall.com</strong> / <strong>password123</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
