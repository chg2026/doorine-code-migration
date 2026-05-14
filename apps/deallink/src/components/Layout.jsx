import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, Kanban, FileText, BarChart3, Bell, ChevronRight,
  Menu, X, Zap, Globe, Handshake, UserCheck, Eye, LogOut, ExternalLink, Settings,
  ListChecks, Upload, Calculator, CreditCard,
} from 'lucide-react';
import { useStore } from '../store.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AppSwitcher from './AppSwitcher.jsx';

const navGroups = [
  { label: null, items: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  ]},
  { label: 'Deals', items: [
    { label: 'Properties', path: '/admin', icon: Building2 },
    { label: 'Pipeline', path: '/pipeline', icon: Kanban },
    { label: 'Offers', path: '/offers', icon: FileText },
    { label: 'Marketplace', path: '/marketplace', icon: Globe },
    { label: 'Import CSV', path: '/admin/import', icon: Upload },
  ]},
  { label: 'Deal Analyzer', items: [
    { label: 'Deal Analyzer', path: '/deal-analyzer', icon: Calculator },
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
      <div className="px-5 py-4 border-b border-slate-700">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-slate-900" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Deal<span className="text-amber-400">Link</span></span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scrollbar-thin">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider px-3 mb-1">{group.label}</p>
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
                      active ? 'bg-amber-400 text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {enterprise && !active && (
                      <span className="text-[10px] bg-amber-400/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">E</span>
                    )}
                    {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-slate-700 space-y-1">
        <Link to="/admin/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800">
          <Settings className="w-4 h-4" /> Profile
        </Link>
        {handle && (
          <a href={`/p/${handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800">
            <ExternalLink className="w-4 h-4" /> Public profile
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <aside className="hidden md:flex w-56 bg-slate-900 flex-col flex-shrink-0 border-r border-slate-700">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-56 bg-slate-900 border-r border-slate-700">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-4 flex-shrink-0">
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {handle ? (
            <a href={`/p/${handle}`} target="_blank" rel="noreferrer" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 font-mono">
              deallink.io/{handle} <ExternalLink className="w-3 h-3" />
            </a>
          ) : <span />}
          <div className="flex-1" />
          <AppSwitcher currentProduct="deallink" enabledProducts={auth.enabledProducts || []} iconColor="#94a3b8" />
          <button className="relative text-slate-400 hover:text-white" title="Notifications">
            <Bell className="w-5 h-5" />
            {state.leads?.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 font-bold text-sm">{initials}</div>
            <span className="text-white text-sm font-medium hidden sm:block">{profile.name || auth.user?.email || 'Admin'}</span>
          </div>
          <button
            onClick={async () => { await dispatch({ type: 'sign_out' }); nav('/'); }}
            className="text-slate-400 hover:text-white text-xs flex items-center gap-1.5"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        <main className="flex-1 overflow-auto bg-slate-950 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
