"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginClient({ next, initialError }: { next: string; initialError: string }) {
  const [email, setEmail] = useState("mike@torresdrywall.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  // True while we're consuming an SSO hash handed off by the App Switcher
  // (e.g. /login#access_token=…&refresh_token=…). We hide the form during
  // that exchange so the user doesn't see a flash of the password UI.
  const [ssoExchanging, setSsoExchanging] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return false;
    const params = new URLSearchParams(h);
    return Boolean(params.get("access_token") && params.get("refresh_token"));
  });

  useEffect(() => {
    if (!ssoExchanging) return;
    let cancelled = false;
    (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token") || "";
      const refresh_token = params.get("refresh_token") || "";
      // Strip the tokens from the URL immediately so they don't end up in
      // history, referrers, or copy-pasted links.
      try {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, "", cleanUrl);
      } catch {
        /* noop */
      }
      if (!access_token || !refresh_token) {
        if (!cancelled) setSsoExchanging(false);
        return;
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) throw setErr;
        // Confirm the session belongs to a contractor account before bouncing
        // into the app — middleware enforces this too, but we want a clean
        // error here rather than a redirect loop.
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
        window.location.href = next || "/";
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Single sign-on failed. Please sign in below.");
        setSsoExchanging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ssoExchanging, next]);

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
            <div className="login-mark">CP</div>
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
          <div className="login-sub">
            {ssoExchanging ? "Signing you in…" : "Sign in to your contractor portal"}
          </div>
          {error ? <div className="login-error">{error}</div> : null}
          {ssoExchanging ? null : (
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
          )}
          {ssoExchanging ? null : (
          <div className="login-helper">
            Demo: <strong>mike@torresdrywall.com</strong> / <strong>password123</strong>
          </div>
          )}
          {ssoExchanging ? null : (
          <div className="login-helper" style={{ marginTop: 12 }}>
            Don&apos;t have an account?{" "}
            <a href="/signup" style={{ color: "#D85A30", fontWeight: 600 }}>
              Sign up
            </a>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
