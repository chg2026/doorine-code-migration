import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Mail, Phone } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { Button, Input, Field } from '../components/ui.jsx';
import { API_BASE } from '../lib/api.js';

function extractTokens(data) {
  const s = data?.session || data;
  const access_token = s?.access_token || s?.accessToken;
  const refresh_token = s?.refresh_token || s?.refreshToken;
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

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
  const [alreadyRegistered, setAlreadyRegistered] = React.useState(false);

  if (!auth.loading && auth.user) {
    return <Navigate to="/onboarding" replace />;
  }

  function resetMessages() {
    setError(null);
    setAlreadyRegistered(false);
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
        setAlreadyRegistered(true);
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
        setAlreadyRegistered(true);
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
      await axios.post(`${API_BASE}/auth/phone/send-otp`, { phone: phone.trim() });
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
        phone: phone.trim(),
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
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-950">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
          <span className="text-white font-bold text-lg">REI <span className="text-amber-400">Flywheel</span></span>
        </Link>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight">Claim your<br />wholesaler<br />link in seconds.</h2>
          <p className="text-slate-400 text-sm mt-4 max-w-sm">Create a Gold Bridge account, get your REI Flywheel handle, and start sharing inventory with buyers in minutes.</p>
        </div>
        <p className="text-slate-600 text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
            <span className="text-white font-bold text-lg">REI <span className="text-amber-400">Flywheel</span></span>
          </div>
          <p className="text-amber-400 text-xs uppercase tracking-widest font-mono">Sign up</p>
          <h1 className="text-2xl text-white font-bold mt-2">Create your account.</h1>

          {alreadyRegistered ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-amber-300 text-sm font-medium">You already have a Gold Bridge account.</p>
                <p className="text-slate-300 text-sm mt-2">Sign in with your existing credentials.</p>
              </div>
              <Link to="/login"><Button className="w-full">Go to sign in <ArrowRight className="w-4 h-4" /></Button></Link>
              <button
                type="button"
                onClick={() => { setAlreadyRegistered(false); setError(null); }}
                className="w-full text-xs text-slate-400 hover:text-amber-400"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => { setMethod('email'); setPhoneStep('enter'); setCode(''); resetMessages(); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors ${method === 'email' ? 'bg-amber-400 text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => { setMethod('phone'); resetMessages(); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors ${method === 'phone' ? 'bg-amber-400 text-slate-900' : 'text-slate-400 hover:text-white'}`}
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
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); resetMessages(); }}
                      placeholder="+1 555 123 4567"
                      autoFocus
                      disabled={submitting}
                    />
                  </Field>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Sending code…' : <>Send code <ArrowRight className="w-4 h-4" /></>}</Button>
                  <p className="text-xs text-slate-500 text-center">We'll text you a 6-digit verification code.</p>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="mt-6 space-y-4">
                  <p className="text-xs text-slate-400">Code sent to <span className="text-white font-mono">{phone}</span></p>
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
                    className="w-full text-xs text-slate-400 hover:text-amber-400"
                  >
                    Use a different number
                  </button>
                </form>
              )}

              <p className="mt-6 text-xs text-slate-400 text-center">Already have an account? <Link to="/login" className="text-amber-400 hover:underline">Sign in</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
