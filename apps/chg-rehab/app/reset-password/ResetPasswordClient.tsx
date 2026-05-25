"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function ResetPasswordClient() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setDone(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setError(
        err?.message ||
          "Could not update password. The reset link may have expired — request a new one.",
      );
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

        {done ? (
          <>
            <div className="login-success-icon" aria-hidden>
              ✓
            </div>
            <div className="login-success" style={{ textAlign: "center" }}>
              Password updated — redirecting to sign in…
            </div>
          </>
        ) : (
          <>
            <div className="login-sub">Set new password</div>
            {error ? <div className="login-error">{error}</div> : null}
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label className="login-label">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  required
                  minLength={8}
                  disabled={loading}
                />
              </label>
              <label className="login-label">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="login-input"
                  required
                  minLength={8}
                  disabled={loading}
                />
              </label>
              <button type="submit" className="login-cta" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>

            <div className="login-divider">or</div>

            <Link href="/login" className="login-cta login-cta-secondary">
              Back to sign in
            </Link>
          </>
        )}

        <div className="login-foot">Cleveland Holding Group · Operations Platform</div>
      </div>
    </div>
  );
}
