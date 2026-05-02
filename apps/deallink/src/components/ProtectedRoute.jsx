import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AccessDenied from './AccessDenied.jsx';

// Wraps any admin-only route. Three states:
//   1. Auth still resolving → minimal centered spinner placeholder.
//   2. Authed + entitled    → render children.
//   3. Authed but no entitlement → AccessDenied.
//   4. Not authed           → redirect to /login, preserving `from` for post-login redirect.
export default function ProtectedRoute({ children }) {
  const auth = useAuth();
  const loc = useLocation();

  if (auth.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1 }}>
        Loading…
      </div>
    );
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  if (!auth.hasProductAccess('deallink')) {
    return <AccessDenied />;
  }

  return children;
}
