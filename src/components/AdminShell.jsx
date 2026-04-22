import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Avatar, Hairline } from './UI.jsx';

export default function AdminShell({ children, tab }) {
  const { state, dispatch } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const current = tab || loc.pathname.split('/')[2] || 'deals';

  React.useEffect(() => {
    if (!state.auth.signedIn) {
      nav('/login', { replace: true, state: { from: loc.pathname } });
    }
  }, [state.auth.signedIn]);

  if (!state.auth.signedIn) return null;

  const tabs = [
    { id: 'deals', label: 'Deals', to: '/admin' },
    { id: 'leads', label: 'Leads', to: '/admin/leads' },
    { id: 'profile', label: 'Profile', to: '/admin/profile' },
  ];

  const profileUrl = `/p/${state.profile.handle}`;

  return (
    <div className="admin-shell">
      <div className="admin-nav">
        <Link to="/admin" className="brand">DealLink</Link>
        <Hairline vertical style={{ height: 16 }} />
        <div className="tabs">
          {tabs.map(t => (
            <Link key={t.id} to={t.to} className={`tab${current === t.id ? ' active' : ''}`}>{t.label}</Link>
          ))}
        </div>
        <div className="right">
          <Link to={profileUrl} className="url" target="_blank" rel="noreferrer">deallink.io/{state.profile.handle} ↗</Link>
          <button
            className="btn sm"
            style={{ padding: '6px 10px' }}
            onClick={() => { dispatch({ type: 'sign_out' }); nav('/'); }}
          >Sign out</button>
          <Avatar size={28} initials={state.profile.initials} />
        </div>
      </div>
      {children}
    </div>
  );
}
