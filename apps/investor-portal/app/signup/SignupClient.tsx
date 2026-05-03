"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupClient({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Invite link required</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            This page needs to be opened from the email invite your portal admin
            sent you. If you can&apos;t find it, ask them to resend.
          </p>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Sign-up failed. Please try again.");
      return;
    }
    const d = await res.json();
    if (d.autoLogin) {
      router.push("/dashboard");
      router.refresh();
    } else {
      router.push("/login?info=" + encodeURIComponent("Account created — please log in."));
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Set up your portal</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
          Choose a password to finish creating your investor portal account.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            style={field}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            style={field}
          />
          {error && (
            <div style={{ fontSize: 12, color: "var(--red, #a32d2d)" }}>{error}</div>
          )}
          <button
            type="submit"
            className="btn btn-p"
            disabled={busy}
            style={{ marginTop: 4 }}
          >
            {busy ? "Setting up…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  border: "0.5px solid var(--border-mid)",
  borderRadius: 6,
  fontFamily: "var(--font)",
};
