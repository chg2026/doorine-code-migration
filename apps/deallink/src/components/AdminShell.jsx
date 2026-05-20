import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store.jsx';
import Layout from './Layout.jsx';

// Backwards-compat shim. The original AdminShell rendered its own nav; we
// now route everything through the shared sidebar Layout. Pages that still
// use <AdminShell> just inherit Layout's chrome.
export default function AdminShell({ children }) {
  const { state } = useStore();
  const loc = useLocation();
  const nav = useNavigate();

  React.useEffect(() => {
    if (state.loaded && !state.profile?.handle && loc.pathname !== '/onboarding') {
      nav('/onboarding', { replace: true });
    }
  }, [state.loaded, state.profile?.handle, loc.pathname, nav]);

  if (!state.loaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32 text-[#6e6e73] font-mono text-xs tracking-wide">Loading…</div>
      </Layout>
    );
  }
  if (!state.profile?.handle) return null;

  return <Layout>{children}</Layout>;
}
