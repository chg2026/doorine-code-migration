import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, Kanban, FileText, BarChart3, Bell, ChevronRight,
  Menu, X, Zap, Globe, Handshake, UserCheck, Eye, LogOut, ExternalLink, Settings,
  ListChecks, Upload, Calculator, CreditCard, Copy, Check, User, BookOpen,
} from 'lucide-react';
import OnboardingProgressBar from './OnboardingProgressBar.jsx';
import { resetTour } from './OnboardingCard.jsx';
import { useStore } from '../store.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AppSwitcher from './AppSwitcher.jsx';
import api from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

const navGroups = [
  { label: null, items: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  ]},
  { label: 'Analysis', items: [
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
    { label: 'Power', path: '/god-mode', icon: Eye, enterprise: true },
    { label: 'Quest Search', path: '/artemis-mode', icon: Eye, enterprise: true },
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

function UserMenu({ initials, onEditProfile, onSignOut }) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [hoverItem, setHoverItem] = React.useState(null);
  const [tourHidden, setTourHidden] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('rei_flywheel_tour_hidden') === '1';
  });
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleTour = () => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('rei_flywheel_tour_hidden') === '1') {
      window.localStorage.removeItem('rei_flywheel_tour_hidden');
      resetTour();
      setTourHidden(false);
    } else {
      window.localStorage.setItem('rei_flywheel_tour_hidden', '1');
      window.dispatchEvent(new Event('rei_tour_update'));
      setTourHidden(true);
    }
    setOpen(false);
  };

  const itemStyle = (key, danger) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    color: danger ? '#c81e1e' : '#1d1d1f',
    background: hoverItem === key ? 'rgba(0,0,0,0.04)' : 'transparent',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
  });

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Account menu"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#b8860b',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          boxShadow: hover || open ? '0 0 0 2px rgba(184,134,11,0.4)' : 'none',
          transition: 'box-shadow 160ms ease',
          padding: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 200,
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            padding: 6,
            zIndex: 1001,
            fontFamily: 'var(--sans, system-ui, sans-serif)',
          }}
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onEditProfile(); }}
            onMouseEnter={() => setHoverItem('profile')}
            onMouseLeave={() => setHoverItem(null)}
            style={itemStyle('profile', false)}
          >
            <User size={15} /> Edit profile
          </button>
          <button
            type="button"
            onClick={toggleTour}
            onMouseEnter={() => setHoverItem('tour')}
            onMouseLeave={() => setHoverItem(null)}
            style={itemStyle('tour', false)}
          >
            <BookOpen size={15} /> {tourHidden ? 'Show onboarding' : 'Hide onboarding'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onSignOut(); }}
            onMouseEnter={() => setHoverItem('signout')}
            onMouseLeave={() => setHoverItem(null)}
            style={itemStyle('signout', true)}
          >
            <LogOut size={15} color="#c81e1e" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function relTime(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString();
}

function NotificationBell({ userId }) {
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [hoverMark, setHoverMark] = React.useState(false);
  const wrapRef = React.useRef(null);

  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const { data } = await api.get('/deallink/notifications/unread-count');
      const c = data?.count ?? data?.unread ?? data?.unreadCount ?? 0;
      setCount(Number(c) || 0);
    } catch {
      /* ignore — leave badge as-is */
    }
  }, []);

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/deallink/notifications');
      const list = Array.isArray(data) ? data : (data?.notifications || data?.items || []);
      setItems(list.slice(0, 10));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial unread count on mount.
  React.useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);

  // Supabase real-time: increment badge when a new row arrives for this user.
  React.useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`deallink_notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deallink_notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setCount((c) => c + 1);
          setItems((prev) => [payload.new, ...prev].slice(0, 10));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Close dropdown on outside click.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) fetchList();
      return next;
    });
  };

  const markAllRead = async () => {
    try {
      await api.post('/deallink/notifications/mark-all-read');
    } catch {
      return; // leave badge/items unchanged if the request failed
    }
    setCount(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true, is_read: true })));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={toggle}
        className="relative text-[#6e6e73] hover:text-[#1d1d1f]"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#b8860b] text-white text-[10px] font-bold leading-none"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 0,
            width: 320,
            background: '#1d1d1f',
            borderRadius: 12,
            border: '1px solid rgba(184,134,11,0.25)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            zIndex: 1001,
            overflow: 'hidden',
            fontFamily: 'var(--sans, system-ui, sans-serif)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 600 }}>Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              onMouseEnter={() => setHoverMark(true)}
              onMouseLeave={() => setHoverMark(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#b8860b',
                textDecoration: hoverMark ? 'underline' : 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              Mark all as read
            </button>
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ color: '#86868b', fontSize: 13, padding: '18px 14px', textAlign: 'center' }}>Loading…</p>
            ) : items.length === 0 ? (
              <p style={{ color: '#86868b', fontSize: 13, padding: '18px 14px', textAlign: 'center' }}>No notifications</p>
            ) : (
              items.map((n, i) => {
                const isRead = n.read ?? n.is_read ?? false;
                return (
                  <div
                    key={n.id ?? i}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: isRead ? 'transparent' : 'rgba(184,134,11,0.08)',
                    }}
                  >
                    <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, margin: 0 }}>
                      {n.title || 'Notification'}
                    </p>
                    {(n.body || n.message) && (
                      <p style={{ color: '#c7c7cc', fontSize: 12, margin: '2px 0 0' }}>
                        {n.body || n.message}
                      </p>
                    )}
                    <p style={{ color: '#86868b', fontSize: 11, margin: '4px 0 0' }}>
                      {relTime(n.created_at || n.createdAt || n.timestamp)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
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
          <NotificationBell userId={auth.user?.id} />
          <UserMenu
            initials={initials}
            onEditProfile={() => nav('/settings')}
            onSignOut={async () => { await dispatch({ type: 'sign_out' }); nav('/'); }}
          />
        </header>

        <main className="flex-1 overflow-auto bg-[#f5f5f7] p-4 md:p-6">
          {children}
        </main>
      </div>
      <OnboardingProgressBar />
    </div>
  );
}
