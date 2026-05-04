"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginClient({
  next,
  initialError,
}: {
  next: string;
  initialError: string;
}) {
  const [email, setEmail] = useState("james.wilson@vestry-demo.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) throw signInErr;

      // Verify the user is actually an investor before bouncing into the
      // app. The middleware will reject non-investors regardless, but we
      // surface a friendlier error here on the wrong account.
      const verify = await fetch("/api/auth/user", { credentials: "include" });
      if (verify.status !== 200) {
        // Sign out the just-set Supabase cookie so the user doesn't sit in
        // a half-authed state on a different tab.
        await supabase.auth.signOut();
        const body = await verify.json().catch(() => ({}));
        throw new Error(
          body?.error === "not_an_investor" || body?.error === "wrong_role"
            ? "This account is not an investor account."
            : body?.message || body?.error || "Sign-in failed. Please try again."
        );
      }
      window.location.href = next || "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-brand">
              <div className="login-mark" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Vestry Capital</span>
            </div>
            <div className="login-headline">
              Your investments,
              <br />
              all in one place.
            </div>
            <div className="login-tag">
              Track performance, review documents, and stay connected to every
              deal — securely from anywhere.
            </div>
            <div className="trust-row">
              <div className="trust-check">✓</div>
              <span>Real-time portfolio performance</span>
            </div>
            <div className="trust-row">
              <div className="trust-check">✓</div>
              <span>Secure document vault</span>
            </div>
            <div className="trust-row">
              <div className="trust-check">✓</div>
              <span>Distribution history &amp; statements</span>
            </div>
          </div>
          <div className="login-foot-left">© 2026 Vestry Capital · Privacy · Terms</div>
        </div>

        <div className="login-right">
          <div className="login-title">Welcome back</div>
          <div className="login-sub">Sign in to your investor portal</div>

          {error ? <div className="login-error">{error}</div> : null}

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="you@example.com"
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="Password"
              />
            </div>
            <button type="submit" className="login-cta" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="login-helper">
            Demo: <strong>james.wilson@vestry-demo.com</strong> / <strong>password123</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
