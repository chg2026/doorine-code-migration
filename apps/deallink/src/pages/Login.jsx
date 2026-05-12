import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Field } from '../components/ui.jsx';

export default function Login() {
  const auth = useAuth();
  const loc = useLocation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (window.location.hash.includes('access_token=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

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

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-950">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
          <span className="text-white font-bold text-lg">Deal<span className="text-amber-400">Link</span></span>
        </Link>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight">One link for<br />every deal you<br />wholesale.</h2>
          <p className="text-slate-400 text-sm mt-4 max-w-sm">Share a public profile. Post inventory once. Capture buyers. Track every offer.</p>
        </div>
        <p className="text-slate-600 text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
            <span className="text-white font-bold text-lg">Deal<span className="text-amber-400">Link</span></span>
          </div>
          <p className="text-amber-400 text-xs uppercase tracking-widest font-mono">Sign in</p>
          <h1 className="text-2xl text-white font-bold mt-2">Welcome back.</h1>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="you@email.com" autoFocus disabled={submitting} /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" disabled={submitting} /></Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <ArrowRight className="w-4 h-4" /></>}</Button>
            <p className="text-xs text-slate-400 text-center">Need an account? Sign up via <a href="https://goldbridgerei.com" className="text-amber-400 hover:underline">Gold Bridge</a> and ask your admin to enable Deal Link.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
