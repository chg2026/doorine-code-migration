"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginClient({
  next,
  initialError,
}: {
  next: string;
  initialError: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      // Hard navigation: server components (RootLayout, every page) must
      // re-run with the freshly-set Supabase cookies, otherwise the user
      // would land on a cached "logged-out" render.
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
        <div className="login-sub">Operations platform — sign in to continue</div>

        {error ? <div className="login-error">{error}</div> : null}

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
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
              disabled={loading}
            />
          </label>
          <button type="submit" className="login-cta" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-divider">or</div>

        <Link
          href={`/phone-auth?next=${encodeURIComponent(next)}`}
          className="login-cta login-cta-secondary"
        >
          Sign in with phone number
        </Link>

        <div className="login-foot">Cleveland Holding Group · Operations Platform</div>
      </div>
    </div>
  );
}
