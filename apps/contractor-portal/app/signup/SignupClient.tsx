"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const API_BASE = "https://rei-code-dev.replit.app";
const PRODUCT_CODE = "contractor-portal";

type Mode = "email" | "phone";
type PhoneStep = "enter" | "verify";

export default function SignupClient() {
  const [mode, setMode] = useState<Mode>("email");

  // Email + password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  // Phone state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function applySession(tokens: { access_token?: string; refresh_token?: string } | null | undefined) {
    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new Error("Signup succeeded but no session was returned. Please sign in.");
    }
    const supabase = getSupabaseBrowserClient();
    const { error: setErr } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (setErr) throw setErr;
    window.location.href = "/";
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAlreadyRegistered(false);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          product_code: PRODUCT_CODE,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error === "already_registered") {
          setAlreadyRegistered(true);
          setLoading(false);
          return;
        }
        throw new Error(body?.message || body?.error || "Signup failed. Please try again.");
      }
      await applySession(body?.session || body);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.");
      setLoading(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/phone/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || "Could not send code. Check the number and try again.");
      }
      setPhoneStep("verify");
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send code.");
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/phone/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          product_code: PRODUCT_CODE,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || "Invalid or expired code.");
      }
      await applySession(body?.session || body);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
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
            <div className="trust-row"><div className="trust-check">✓</div><span>Free for the basics — no card required</span></div>
          </div>
          <div className="login-foot-left">© 2026 CHG · Privacy · Terms</div>
        </div>

        <div className="login-right">
          <div className="login-title">Create your account</div>
          <div className="login-sub">Join the Gold Bridge platform — it&apos;s free to start.</div>

          <div
            role="tablist"
            aria-label="Signup method"
            style={{
              display: "flex",
              gap: 4,
              padding: 4,
              background: "#f3f4f6",
              borderRadius: 8,
              margin: "12px 0 16px",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "email"}
              onClick={() => { setMode("email"); setError(""); setAlreadyRegistered(false); }}
              disabled={loading}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: 6,
                background: mode === "email" ? "#fff" : "transparent",
                color: "#111827",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: mode === "email" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Email
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "phone"}
              onClick={() => { setMode("phone"); setError(""); setAlreadyRegistered(false); }}
              disabled={loading}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: 6,
                background: mode === "phone" ? "#fff" : "transparent",
                color: "#111827",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: mode === "phone" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Phone
            </button>
          </div>

          {alreadyRegistered ? (
            <div className="login-error" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
              You already have a Gold Bridge account.{" "}
              <a href="/login" style={{ color: "#92400E", textDecoration: "underline", fontWeight: 600 }}>
                Sign in with your existing credentials
              </a>
              .
            </div>
          ) : null}
          {error && !alreadyRegistered ? <div className="login-error">{error}</div> : null}

          {mode === "email" ? (
            <form onSubmit={handleEmailSignup}>
              <div className="field">
                <label htmlFor="full_name">Your name</label>
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="field">
                <label htmlFor="company_name">Company name</label>
                <input
                  id="company_name"
                  type="text"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Smith Drywall LLC"
                />
              </div>
              <div className="field">
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
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  placeholder="At least 8 characters"
                />
              </div>
              <button type="submit" className="login-cta" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          ) : phoneStep === "enter" ? (
            <form onSubmit={handleSendOtp}>
              <div className="field">
                <label htmlFor="phone">Mobile number</label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <button type="submit" className="login-cta" disabled={loading}>
                {loading ? "Sending code…" : "Send verification code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <div className="field">
                <label>Mobile number</label>
                <input type="tel" value={phone} disabled />
              </div>
              <div className="field">
                <label htmlFor="otp">Verification code</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="6-digit code"
                />
              </div>
              <button type="submit" className="login-cta" disabled={loading}>
                {loading ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                type="button"
                onClick={() => { setPhoneStep("enter"); setCode(""); setError(""); }}
                disabled={loading}
                style={{
                  marginTop: 8,
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                  textDecoration: "underline",
                }}
              >
                Use a different number
              </button>
            </form>
          )}

          <div className="login-helper" style={{ marginTop: 16 }}>
            Already have an account?{" "}
            <a href="/login" style={{ color: "#D85A30", fontWeight: 600 }}>
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
