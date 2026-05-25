"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const PHONE_RE = /^\+1[2-9]\d{9}$/;

export default function PhoneAuthClient({ next }: { next: string }) {
  const [stage, setStage] = useState<"ENTER_PHONE" | "ENTER_CODE">("ENTER_PHONE");
  const [phone, setPhone] = useState("+1");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  async function sendOtp(p: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code.");
      setStage("ENTER_CODE");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!PHONE_RE.test(phone)) {
      setError("Enter a valid US number in +1XXXXXXXXXX format.");
      return;
    }
    await sendOtp(phone);
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");

      // Hand the session to the browser supabase client so it persists the
      // cookies in the same place the SSR adapter reads from.
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      const meRes = await fetch("/api/auth/user");
      const me = await meRes.json();
      if (!me?.user) {
        await supabase.auth.signOut();
        setError("Phone sign-in is not supported for CHG accounts. Please sign in with your email instead.");
        setLoading(false);
        return;
      }
      window.location.href = next || "/";
    } catch (e: any) {
      setError(e.message);
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
        <div className="login-sub">Sign in with your phone</div>

        {error ? <div className="login-error">{error}</div> : null}

        {stage === "ENTER_PHONE" ? (
          <form onSubmit={handlePhoneSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="login-label">
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value;
                  setPhone(val.startsWith("+1") ? val : "+1");
                }}
                className="login-input"
                placeholder="+12125551234"
                autoFocus
                disabled={loading}
              />
            </label>
            <div className="login-foot" style={{ marginTop: 0 }}>
              US numbers only · format: +1XXXXXXXXXX
            </div>
            <button type="submit" className="login-cta" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="login-label">
              6-digit code sent to {phone}
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="login-input"
                placeholder="••••••"
                autoComplete="one-time-code"
                disabled={loading}
              />
            </label>
            <button type="submit" className="login-cta" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              className="login-cta login-cta-secondary"
              onClick={() => sendOtp(phone)}
              disabled={loading}
            >
              Resend code
            </button>
          </form>
        )}

        <Link href="/login" className="login-foot" style={{ textAlign: "center" }}>
          ← Back to email sign-in
        </Link>
      </div>
    </div>
  );
}
