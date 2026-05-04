import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Kicker } from './UI.jsx';

// Rendered when the user is signed in but their account does not have an
// active 'deallink' product entitlement. Mirrors the gate enforced
// server-side by requireProduct('deallink').
export default function AccessDenied() {
  const auth = useAuth();
  return (
    <div className="center-grid">
      <div className="pane left">
        <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>DealLink</Link>
        <div>
          <div className="serif" style={{ fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.05 }}>
            One link for<br />every deal<br />you wholesale.
          </div>
        </div>
        <Kicker>© 2026 · BuildFlow</Kicker>
      </div>
      <div className="pane right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <Kicker>Access denied</Kicker>
          <div className="serif" style={{ fontSize: 26, marginTop: 8 }}>Not in the Deal Link beta.</div>
          <p style={{ marginTop: 14, color: 'var(--mute)', fontSize: 13, lineHeight: 1.6 }}>
            Your Gold Bridge account doesn't have an active Deal Link entitlement.
            Ask your account admin (or your Gold Bridge contact) to enable it from
            the super-admin Entitlements panel, then reload this page.
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn sm" onClick={() => auth.signOut()}>Sign out</button>
            <Link to="/" className="btn sm solid">Back home</Link>
          </div>
          {auth.user?.email && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)', marginTop: 16 }}>
              Signed in as {auth.user.email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
