import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Mail, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Field } from '../components/ui.jsx';
import PhoneInput, { normalizePhone } from '../components/PhoneInput.jsx';
import { supabase } from '../lib/supabase.js';

const PHONE_API_BASE = 'https://rei-code-dev.replit.app/api/auth/phone';

export default function Login() {
  const auth = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = React.useState('email'); // 'email' | 'phone'

  // Email tab state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Phone tab state
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [phoneStep, setPhoneStep] = React.useState('phone'); // 'phone' | 'code'
  const [phoneSubmitting, setPhoneSubmitting] = React.useState(false);
  const [phoneError, setPhoneError] = React.useState(null);
  const [sentPhone, setSentPhone] = React.useState(''); // E.164 phone we sent the code to
  const [ssoHandling, setSsoHandling] = React.useState(() => {
    const h = window.location.hash;
    return h.includes('access_token=') && !h.includes('type=recovery');
  });

  React.useEffect(() => {
    if (!window.location.hash.includes('access_token=')) return;
    if (window.location.hash.includes('type=recovery')) return;
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!accessToken || !refreshToken) { setSsoHandling(false); return; }
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => { navigate('/dashboard', { replace: true }); })
      .catch(() => { setSsoHandling(false); });
  }, []);

  if (ssoHandling) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <p className="text-[#6e6e73] text-sm">Signing you in…</p>
      </div>
    );
  }

  if (!auth.loading && auth.user) {
    const dest = (loc.state && loc.state.from) || '/dashboard';
    return <Navigate to={dest} replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setSubmitting(true);
    try { await auth.signIn(email.trim(), password); }
    catch (err) { setError(err?.message || 'Sign-in failed.'); }
    finally { setSubmitting(false); }
  }

  async function sendPhoneCode(e) {
    if (e) e.preventDefault();
    setPhoneError(null);
    const formatted = normalizePhone(phone);
    if (formatted.replace(/\D/g, '').length < 11) {
      setPhoneError('Enter a valid 10-digit phone number.');
      return;
    }
    setPhoneSubmitting(true);
    try {
      const res = await fetch(`${PHONE_API_BASE}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to send code (${res.status})`);
      }
      setSentPhone(formatted);
      setPhone(formatted);
      setPhoneStep('code');
    } catch (err) {
      setPhoneError(err?.message || 'Could not send code.');
    } finally {
      setPhoneSubmitting(false);
    }
  }

  async function verifyPhoneCode(e) {
    if (e) e.preventDefault();
    setPhoneError(null);
    const clean = (code || '').replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) { setPhoneError('Enter the 6-digit code.'); return; }
    setPhoneSubmitting(true);
    try {
      const res = await fetch(`${PHONE_API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sentPhone || normalizePhone(phone), code: clean, product_code: 'deallink' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Invalid code (${res.status})`);
      }
      const data = await res.json();
      if (data?.session?.access_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      const dest = (loc.state && loc.state.from) || '/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setPhoneError(err?.message || 'Code did not verify.');
    } finally {
      setPhoneSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#f5f5f7]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-white border-r border-[rgba(0,0,0,0.08)]">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
          <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
        </Link>
        <div>
          <h2 className="text-[#1d1d1f] text-4xl font-bold leading-tight">One link for<br />every deal you<br />wholesale.</h2>
          <p className="text-[#6e6e73] text-sm mt-4 max-w-sm">Share a public profile. Post inventory once. Capture buyers. Track every offer.</p>
        </div>
        <p className="text-[#6e6e73] text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
            <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
          </div>
          <p className="text-[#b8860b] text-xs uppercase tracking-widest font-mono">Sign in</p>
          <h1 className="text-2xl text-[#1d1d1f] font-bold mt-2">Welcome back.</h1>

          {/* Tabs */}
          <div className="mt-6 grid grid-cols-2 gap-2 p-1 rounded-lg bg-white border border-[rgba(0,0,0,0.08)]">
            <button
              type="button"
              onClick={() => { setTab('email'); setError(null); }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'email' ? 'bg-[rgba(0,0,0,0.06)] text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#3a3a3c]'
              }`}
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              type="button"
              onClick={() => { setTab('phone'); setPhoneError(null); }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'phone' ? 'bg-[rgba(0,0,0,0.06)] text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#3a3a3c]'
              }`}
            >
              <Phone className="w-4 h-4" /> Phone
            </button>
          </div>

          {tab === 'email' ? (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="you@email.com" autoFocus disabled={submitting} /></Field>
              <Field label="Password"><Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" disabled={submitting} /></Field>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs text-[#b8860b] hover:underline">Forgot password?</Link>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <ArrowRight className="w-4 h-4" /></>}</Button>
              <p className="text-xs text-[#6e6e73] text-center">New to REI Flywheel? <Link to="/signup" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Sign up here</Link> with your phone number.</p>
            </form>
          ) : phoneStep === 'phone' ? (
            <form onSubmit={sendPhoneCode} className="mt-6 space-y-4">
              <Field label="Phone number">
                <PhoneInput
                  value={phone}
                  onChange={(v) => { setPhone(v); setPhoneError(null); }}
                />
              </Field>
              <p className="text-xs text-[#86868b]">We'll text you a 6-digit code. US numbers only.</p>
              {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
              <Button type="submit" className="w-full" disabled={phoneSubmitting}>
                {phoneSubmitting ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
              </Button>
              <p className="text-xs text-[#6e6e73] text-center">New to REI Flywheel? <Link to="/signup" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Sign up here</Link> with your phone number.</p>
            </form>
          ) : (
            <form onSubmit={verifyPhoneCode} className="mt-6 space-y-4">
              <Field label="6-digit code">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setPhoneError(null); }}
                  placeholder="000000"
                  autoFocus
                  disabled={phoneSubmitting}
                  maxLength={6}
                />
              </Field>
              <p className="text-xs text-[#86868b]">Sent to {sentPhone || phone}. <button type="button" onClick={() => { setPhoneStep('phone'); setCode(''); setPhoneError(null); }} className="text-[#b8860b] hover:underline">Change number</button></p>
              {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
              <Button type="submit" className="w-full" disabled={phoneSubmitting}>
                {phoneSubmitting ? 'Verifying…' : <>Verify <ArrowRight className="w-4 h-4" /></>}
              </Button>
              <button
                type="button"
                onClick={() => sendPhoneCode()}
                disabled={phoneSubmitting}
                className="block w-full text-xs text-[#6e6e73] text-center hover:text-[#b8860b] disabled:opacity-50"
              >
                Resend code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
