import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Kicker, Field } from '../components/UI.jsx';

export default function Login() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = React.useState(state.profile.email || '');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);

  function submit(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password) { setError('Password is required'); return; }
    dispatch({ type: 'sign_in' });
    const dest = (loc.state && loc.state.from) || '/admin';
    nav(dest, { replace: true });
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
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="you@email.com" autoFocus />
            </Field>
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" />
            </Field>
            {error && <div style={{ fontSize: 12, color: 'var(--err)' }}>{error}</div>}
            <button type="submit" className="btn solid full">Sign in →</button>
            <div style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center', marginTop: 6 }}>
              No account? <Link to="/onboarding" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Claim your @handle</Link>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'center', marginTop: 4, fontFamily: 'var(--mono)' }}>
              Demo: any email + password works
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
