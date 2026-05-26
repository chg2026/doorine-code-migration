import React from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, ArrowRight, Mail, Phone } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { Button, Input, Field } from '../components/ui.jsx';
import PhoneInput, { normalizePhone } from '../components/PhoneInput.jsx';
import { API_BASE } from '../lib/api.js';

function extractTokens(data) {
  const s = data?.session || data;
  const access_token = s?.access_token || s?.accessToken;
  const refresh_token = s?.refresh_token || s?.refreshToken;
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

const PRODUCT_NAMES = {
  chg: 'CHG Rehab',
  deallink: 'REI Flywheel',
  'investor-portal': 'Investor Portal',
  'contractor-portal': 'Contractor Portal',
};

export default function Signup() {
  const auth = useAuth();
  const nav = useNavigate();
  const [method, setMethod] = React.useState('email');

  // Email state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');

  // Phone state
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [phoneStep, setPhoneStep] = React.useState('enter'); // 'enter' | 'verify'

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [alreadyRegistered, setAlreadyRegistered] = React.useState(null);
  const [searchParams] = useSearchParams();

  React.useEffect(() => {
    const prefillEmail = searchParams.get('email');
    if (!prefillEmail) return;
    setEmail(prefillEmail);
    const trimmed = prefillEmail.trim().toLowerCase();
    if (!trimmed.includes('@')) return;
    fetch(`${API_BASE}/auth/check-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error === 'already_registered' || data.exists) {
          setAlreadyRegistered({ products: data.products || [] });
        }
      })
      .catch(() => {});
  }, []);

  if (!auth.loading && auth.user) {
    return <Navigate to="/onboarding" replace />;
  }

  function resetMessages() {
    setError(null);
    setAlreadyRegistered(null);
  }

  async function applySession(tokens) {
    const { error: setErr } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (setErr) throw setErr;
  }

  async function submitEmail(e) {
    e.preventDefault();
    resetMessages();
    if (!email.trim() || !password || !firstName.trim()) {
      setError('Name, email, and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/signup`, {
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        product_code: 'deallink',
      });
      if (data?.error === 'already_registered') {
        setAlreadyRegistered({ products: data.products || [] });
        return;
      }
      const tokens = extractTokens(data);
      if (tokens) {
        await applySession(tokens);
        nav('/onboarding', { replace: true });
        return;
      }
      // Fallback: API returned no tokens — try password sign-in.
      try {
        await auth.signIn(email.trim(), password);
        nav('/onboarding', { replace: true });
      } catch {
        nav('/login', { replace: true });
      }
    } catch (err) {
      const code = err?.response?.data?.error;
      if (code === 'already_registered') {
        setAlreadyRegistered({ products: err?.response?.data?.products || [] });
      } else {
        setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Sign-up failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function sendOtp(e) {
    e.preventDefault();
    resetMessages();
    if (!phone.trim()) { setError('Phone number is required.'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/auth/phone/send-otp`, { phone: normalizePhone(phone) });
      setPhoneStep('verify');
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Could not send code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    resetMessages();
    if (!code.trim()) { setError('Enter the code we sent you.'); return; }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/phone/verify-otp`, {
        phone: normalizePhone(phone),
        code: code.trim(),
        product_code: 'deallink',
      });
      const tokens = extractTokens(data);
      if (!tokens) throw new Error('Verification succeeded but no session was returned.');
      await applySession(tokens);
      nav('/onboarding', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Verification failed.');
    } finally {
      setSubmitting(false);
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
          <h2 className="text-[#1d1d1f] text-4xl font-bold leading-tight">Claim your<br />wholesaler<br />link in seconds.</h2>
          <p className="text-[#6e6e73] text-sm mt-4 max-w-sm">Create a Gold Bridge account, get your REI Flywheel handle, and start sharing inventory with buyers in minutes.</p>
        </div>
        <p className="text-[#6e6e73] text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
            <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
          </div>
          <p className="text-[#b8860b] text-xs uppercase tracking-widest font-mono">Sign up</p>
          <h1 className="text-2xl text-[#1d1d1f] font-bold mt-2">Create your account.</h1>

          {alreadyRegistered !== null ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-[#b8860b]/30 bg-[rgba(184,134,11,0.10)] p-4">
                {alreadyRegistered.products.includes('deallink') ? (
                  <>
                    <p className="text-[#b8860b] text-sm font-medium">You already have REI Flywheel.</p>
                    <p className="text-[#3a3a3c] text-sm mt-2">Sign in with your existing credentials.</p>
                  </>
                ) : alreadyRegistered.products.length > 0 ? (
                  <>
                    <p className="text-[#b8860b] text-sm font-medium">You already have a Doorine account.</p>
                    <p className="text-[#3a3a3c] text-sm mt-2">
                      You're on {alreadyRegistered.products.map(p => PRODUCT_NAMES[p] || p).join(' and ')}. Sign in with your existing credentials to activate REI Flywheel.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[#b8860b] text-sm font-medium">You already have a Doorine account.</p>
                    <p className="text-[#3a3a3c] text-sm mt-2">Sign in with your existing credentials.</p>
                  </>
                )}
              </div>
              <Link to="/login"><Button className="w-full">Go to sign in <ArrowRight className="w-4 h-4" /></Button></Link>
              <button
                type="button"
                onClick={() => { setAlreadyRegistered(null); setError(null); }}
                className="w-full text-xs text-[#6e6e73] hover:text-[#b8860b]"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-white border border-[rgba(0,0,0,0.08)] rounded-lg">
                <button
                  type="button"
                  onClick={() => { setMethod('email'); setPhoneStep('enter'); setCode(''); resetMessages(); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors ${method === 'email' ? 'bg-[#b8860b] text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => { setMethod('phone'); resetMessages(); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors ${method === 'phone' ? 'bg-[#b8860b] text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
                >
                  <Phone className="w-3.5 h-3.5" /> Phone
                </button>
              </div>

              {method === 'email' ? (
                <form onSubmit={submitEmail} className="mt-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1"><Field label="First name"><Input value={firstName} onChange={(e) => { setFirstName(e.target.value); resetMessages(); }} placeholder="Jordan" autoFocus disabled={submitting} required /></Field></div>
                    <div className="flex-1"><Field label="Last name"><Input value={lastName} onChange={(e) => { setLastName(e.target.value); resetMessages(); }} placeholder="Rodriguez" disabled={submitting} /></Field></div>
                  </div>
                  <Field label="Email"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); resetMessages(); }} placeholder="you@email.com" disabled={submitting} /></Field>
                  <Field label="Password"><Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); resetMessages(); }} placeholder="At least 8 characters" disabled={submitting} /></Field>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Creating account…' : <>Create account <ArrowRight className="w-4 h-4" /></>}</Button>
                </form>
              ) : phoneStep === 'enter' ? (
                <form onSubmit={sendOtp} className="mt-6 space-y-4">
                  <Field label="Phone number">
                    <PhoneInput
                      value={phone}
                      onChange={(v) => { setPhone(v); resetMessages(); }}
                    />
                  </Field>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Sending code…' : <>Send code <ArrowRight className="w-4 h-4" /></>}</Button>
                  <p className="text-xs text-[#86868b] text-center">We'll text you a 6-digit verification code.</p>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="mt-6 space-y-4">
                  <p className="text-xs text-[#6e6e73]">Code sent to <span className="text-[#1d1d1f] font-mono">{phone}</span></p>
                  <Field label="Verification code">
                    <Input
                      value={code}
                      onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); resetMessages(); }}
                      placeholder="123456"
                      autoFocus
                      disabled={submitting}
                      inputMode="numeric"
                    />
                  </Field>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Verifying…' : <>Verify & continue <ArrowRight className="w-4 h-4" /></>}</Button>
                  <button
                    type="button"
                    onClick={() => { setPhoneStep('enter'); setCode(''); resetMessages(); }}
                    className="w-full text-xs text-[#6e6e73] hover:text-[#b8860b]"
                  >
                    Use a different number
                  </button>
                </form>
              )}

              <p className="mt-6 text-xs text-[#6e6e73] text-center">Already have an account? <Link to="/login" className="text-[#b8860b] hover:underline">Sign in</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
