"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginClient({
  next,
  initialError,
}: {
  next: string;
  initialError: string;
}) {
  const LEGACY_API = (process.env.NEXT_PUBLIC_LEGACY_API_BASE_URL || "https://rei-code-dev.replit.app").replace(/\/$/, "");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [ssoHandling, setSsoHandling] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return false;
    const params = new URLSearchParams(h);
    return Boolean(params.get("access_token") && params.get("refresh_token"));
  });

  useEffect(() => {
    if (!ssoHandling) return;
    let cancelled = false;
    (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token") || "";
      const refresh_token = params.get("refresh_token") || "";
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch { /* noop */ }
      if (!access_token || !refresh_token) {
        if (!cancelled) setSsoHandling(false);
        return;
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) throw setErr;
        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email || "";
        const res = await fetch(`${LEGACY_API}/api/auth/check-credential`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail }),
        });
        const credData = await res.json();
        if (credData.products?.includes("chg")) {
          window.location.href = next || "/";
        } else {
          window.location.href = `/signup${userEmail ? `?email=${encodeURIComponent(userEmail)}` : ""}`;
        }
      } catch {
        if (!cancelled) setSsoHandling(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      // Purge any stale session/cookies before attempting a fresh sign-in.
      // This prevents tokens left over from an old domain from shadowing the
      // new session and causing an immediate redirect back to /login.
      await supabase.auth.signOut().catch((err) => {
        console.warn("[auth:diag] LoginClient | pre-signin signOut failed (non-fatal):", err?.message ?? err);
      });
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      console.log(
        `[auth:diag] LoginClient | email=${email.trim()} | error_code=${signInErr?.code ?? signInErr?.status ?? "none"} | error_msg=${signInErr?.message ?? "none"} | session=${signInData?.session ? "present" : "absent"} | user_id=${signInData?.user?.id ?? "none"} | next=${next}`
      );
      if (signInErr) throw signInErr;

      // Hard navigation: server components (RootLayout, every page) must
      // re-run with the freshly-set Supabase cookies, otherwise the user
      // would land on a cached "logged-out" render.
      console.log(`[auth:diag] LoginClient | sign_in=OK | user=${signInData?.user?.id} | navigating_to=${next || "/"}`);
      window.location.href = next || "/";
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">CHG</div>
          <div className="login-title">
            CHG <span>Rehab</span>
          </div>
        </div>
        <div className="login-sub">
          {ssoHandling ? "Signing you in…" : "Operations platform — sign in to continue"}
        </div>

        {error ? <div className="login-error">{error}</div> : null}

        {!ssoHandling && (
        <>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="login-label">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              required
              disabled={loading}
            />
          </label>
          <label className="login-label">
            Password
            <div className="login-pw-wrap">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </label>
          <button type="submit" className="login-cta" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <Link href="/forgot-password" className="login-forgot">
          Forgot password?
        </Link>

        <div className="login-divider">or</div>

        <Link
          href={`/phone-auth?next=${encodeURIComponent(next)}`}
          className="login-cta login-cta-secondary"
        >
          Sign in with phone number
        </Link>
        </>
        )}

        <div className="login-foot">Cleveland Holding Group · Operations Platform</div>
        <div className="login-foot" style={{ marginTop: 12 }}>
          New to CHG?{" "}
          <a href="/signup" style={{ color: "#C9952A", textDecoration: "none", fontWeight: 600 }}>
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}
