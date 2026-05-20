import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, Kanban, FileText, BarChart3, Bell, ChevronRight,
  Menu, X, Zap, Globe, Handshake, UserCheck, Eye, LogOut, ExternalLink, Settings,
  ListChecks, Upload, Calculator, CreditCard, Copy, Check,
} from 'lucide-react';
import { useStore } from '../store.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AppSwitcher from './AppSwitcher.jsx';

const navGroups = [
  { label: null, items: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Deal Analyzer', path: '/deal-analyzer', icon: Calculator },
  ]},
  { label: 'Deals', items: [
    { label: 'Properties', path: '/admin', icon: Building2 },
    { label: 'Pipeline', path: '/pipeline', icon: Kanban },
    { label: 'Offers', path: '/offers', icon: FileText },
    { label: 'Marketplace', path: '/marketplace', icon: Globe },
    { label: 'Import CSV', path: '/admin/import', icon: Upload },
  ]},
  { label: 'Buyers', items: [
    { label: 'Buyers List', path: '/buyers', icon: Users },
    { label: 'Leads', path: '/admin/leads', icon: ListChecks },
    { label: 'JV Deals', path: '/jv-deals', icon: Handshake, enterprise: true },
    { label: 'Buyer Rental', path: '/buyer-rental', icon: UserCheck, enterprise: true },
  ]},
  { label: 'Enterprise', items: [
    { label: 'AI Deal Blast', path: '/deal-blast', icon: Zap, enterprise: true },
    { label: 'God Mode', path: '/god-mode', icon: Eye, enterprise: true },
    { label: 'Artemis Mode', path: '/artemis-mode', icon: Eye, enterprise: true },
    { label: 'Handoff', path: '/handoff', icon: Handshake, enterprise: true },
  ]},
  { label: 'Reports', items: [
    { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  ]},
  { label: 'Account', items: [
    { label: 'Billing', path: '/billing', icon: CreditCard },
  ]},
];

function ShareHandlePill({ handle }) {
  const shareUrl = `https://doorine.com/r/${handle}`;
  const [copied, setCopied] = React.useState(false);

  async function copy(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#6e6e73] font-mono">
      <a
        href={shareUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 hover:text-[#b8860b]"
        title="Open public profile"
      >
        doorine.com/r/{handle} <ExternalLink className="w-3 h-3" />
      </a>
      <button
        type="button"
        onClick={copy}
        className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(0,0,0,0.06)] hover:text-[#b8860b]"
        title={copied ? 'Copied!' : 'Copy public link'}
        aria-label="Copy public link"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

export default function Layout({ children }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const profile = state.profile || {};
  const initials = profile.initials || (profile.name ? profile.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase() : 'A');
  const handle = profile.handle;

  function isActive(path) {
    if (path === '/admin') return loc.pathname === '/admin';
    return loc.pathname === path || loc.pathname.startsWith(path + '/');
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.10)]">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#1d1d1f]" />
          </div>
          <span className="text-[#1d1d1f] font-bold text-lg tracking-tight">REI <span className="text-[#b8860b]">Flywheel</span></span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scrollbar-thin">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-[#86868b] text-[10px] font-semibold uppercase tracking-wider px-3 mb-1">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ label, path, icon: Icon, enterprise }) => {
                const active = isActive(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      active ? 'bg-[rgba(184,134,11,0.10)] text-[#b8860b]' : 'text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {enterprise && !active && (
                      <span className="text-[10px] bg-[rgba(184,134,11,0.10)] text-[#b8860b] px-1.5 py-0.5 rounded font-medium">E</span>
                    )}
                    {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-[rgba(0,0,0,0.10)] space-y-1">
        <Link to="/admin/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.06)]">
          <Settings className="w-4 h-4" /> Profile
        </Link>
        {handle && (
          <a href={`/p/${handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.06)]">
            <ExternalLink className="w-4 h-4" /> Public profile
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f5f5f7] overflow-hidden">
      <aside
        className="hidden md:flex w-56 flex-col flex-shrink-0 border-r border-[rgba(0,0,0,0.12)]"
        style={{ background: 'var(--sidebar-bg)' }}
      >
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside
            className="absolute left-0 top-0 h-full w-56 border-r border-[rgba(0,0,0,0.12)]"
            style={{ background: 'var(--sidebar-bg)' }}
          >
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 bg-white border-b border-[rgba(0,0,0,0.08)] flex items-center px-4 gap-4 flex-shrink-0">
          <button className="md:hidden text-[#6e6e73] hover:text-[#1d1d1f]" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {handle ? <ShareHandlePill handle={handle} /> : <span />}
          <div className="flex-1" />
          <AppSwitcher currentProduct="deallink" enabledProducts={auth.enabledProducts || []} iconColor="#94a3b8" />
          <button className="relative text-[#6e6e73] hover:text-[#1d1d1f]" title="Notifications">
            <Bell className="w-5 h-5" />
            {state.leads?.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#b8860b] rounded-full" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#b8860b] flex items-center justify-center text-white font-bold text-sm">{initials}</div>
            <span className="text-[#1d1d1f] text-sm font-medium hidden sm:block">{profile.name || auth.user?.email || 'Admin'}</span>
          </div>
          <button
            onClick={async () => { await dispatch({ type: 'sign_out' }); nav('/'); }}
            className="text-[#6e6e73] hover:text-[#1d1d1f] text-xs flex items-center gap-1.5"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        <main className="flex-1 overflow-auto bg-[#f5f5f7] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
