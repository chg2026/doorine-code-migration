"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Mode = "email" | "phone";
type PhoneStep = "request" | "verify";

export default function ForgotPasswordClient() {
  const [mode, setMode] = useState<Mode>("email");

  // ── Email tab state ───────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // ── Phone tab state ───────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("request");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneDone, setPhoneDone] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      setEmailError(err?.message || "Could not send reset link. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePhoneRequest(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");
    setPhoneLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setPhoneStep("verify");
    } catch (err: any) {
      setPhoneError(err?.message || "Could not send code. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handlePhoneVerify(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");
    if (newPassword.length < 8) {
      setPhoneError("Password must be at least 8 characters.");
      return;
    }
    setPhoneLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "sms",
      });
      if (verifyErr) throw verifyErr;
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      setPhoneDone(true);
    } catch (err: any) {
      setPhoneError(err?.message || "Could not verify code. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setEmailError("");
    setPhoneError("");
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
        <div className="login-sub">Reset your password</div>

        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "email"}
            className={`login-tab ${mode === "email" ? "active" : ""}`}
            onClick={() => switchMode("email")}
          >
            Via Email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "phone"}
            className={`login-tab ${mode === "phone" ? "active" : ""}`}
            onClick={() => switchMode("phone")}
          >
            Via Phone
          </button>
        </div>

        {mode === "email" ? (
          emailSent ? (
            <div className="login-success">
              Check your email — we sent a reset link to <strong>{email.trim()}</strong>.
            </div>
          ) : (
            <>
              {emailError ? <div className="login-error">{emailError}</div> : null}
              <form
                onSubmit={handleEmailSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <label className="login-label">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="login-input"
                    required
                    disabled={emailLoading}
                  />
                </label>
                <button type="submit" className="login-cta" disabled={emailLoading}>
                  {emailLoading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )
        ) : phoneDone ? (
          <div className="login-success">
            Password updated. You can now sign in with your new password.
          </div>
        ) : phoneStep === "request" ? (
          <>
            {phoneError ? <div className="login-error">{phoneError}</div> : null}
            <form
              onSubmit={handlePhoneRequest}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label className="login-label">
                Phone number
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+15551234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="login-input"
                  required
                  disabled={phoneLoading}
                />
              </label>
              <button type="submit" className="login-cta" disabled={phoneLoading}>
                {phoneLoading ? "Sending code…" : "Send code"}
              </button>
            </form>
          </>
        ) : (
          <>
            {phoneError ? <div className="login-error">{phoneError}</div> : null}
            <form
              onSubmit={handlePhoneVerify}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label className="login-label">
                Verification code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="login-input"
                  required
                  disabled={phoneLoading}
                />
              </label>
              <label className="login-label">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="login-input"
                  required
                  minLength={8}
                  disabled={phoneLoading}
                />
              </label>
              <button type="submit" className="login-cta" disabled={phoneLoading}>
                {phoneLoading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}

        <div className="login-divider">or</div>

        <Link href="/login" className="login-cta login-cta-secondary">
          Back to sign in
        </Link>

        <div className="login-foot">Cleveland Holding Group · Operations Platform</div>
      </div>
    </div>
  );
}
