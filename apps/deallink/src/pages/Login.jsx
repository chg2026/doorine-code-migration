import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Kicker, Field } from '../components/UI.jsx';

// Real Supabase email/password sign-in. Replaces the prototype "any email +
// password works" flow. The redirect target is whatever route bounced the
// user here (preserved on location.state.from), defaulting to /admin.
export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  // SSO ingestion: when CHG Rehab's AppSwitcher opens Deal Link, it appends
  // Supabase session tokens as a URL hash fragment:
  //   /login#access_token=...&refresh_token=...&token_type=bearer
  // Supabase's createClient handles this automatically via detectSessionInUrl
  // (default: true) — it parses the hash and fires onAuthStateChange('SIGNED_IN').
  // We only need to clean the tokens from the URL so they don't persist in
  // browser history. Calling setSession() explicitly is WRONG here: it fires
  // a second SIGNED_IN event on top of the one detectSessionInUrl already fired,
  // causing a double fetchMe() and the loading blink.
  React.useEffect(() => {
    if (window.location.hash.includes('access_token=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  React.useEffect(() => {
    if (!auth.loading && auth.user) {
      const dest = (loc.state && loc.state.from) || '/admin';
      nav(dest, { replace: true });
    }
  }, [auth.loading, auth.user, nav, loc.state]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await auth.signIn(email.trim(), password);
      // AuthContext.onAuthStateChange will flip auth.user; the effect
      // above handles the redirect once profile + entitlements are loaded.
    } catch (err) {
      setError(err?.message || 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center-grid">
      <div className="pane left">
        <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>DealLink</Link>
        <div>
          <div className="serif" style={{ fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
            One link for<br />every deal<br />you wholesale.
          </div>
          <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 16, maxWidth: 320, lineHeight: 1.6 }}>
            Share a public profile. Post inventory once. Capture buyers.
          </div>
        </div>
        <Kicker>© 2026 · BuildFlow</Kicker>
      </div>
      <form className="pane right" onSubmit={submit}>
        <div style={{ maxWidth: 360, width: '100%' }}>
          <Kicker>Sign in</Kicker>
          <div className="serif" style={{ fontSize: 26, marginTop: 8 }}>Welcome back.</div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@email.com"
                autoFocus
                autoComplete="email"
                disabled={submitting}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={submitting}
              />
            </Field>
            {error && <div style={{ fontSize: 12, color: 'var(--err)' }}>{error}</div>}
            <button type="submit" className="btn solid full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center', marginTop: 6 }}>
              Need an account? Sign up via <a href="/signup" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Gold Bridge</a> and ask
              your admin to enable Deal Link.
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
