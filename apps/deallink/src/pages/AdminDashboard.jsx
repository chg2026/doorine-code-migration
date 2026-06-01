import React from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Building2, Bed, Bath, Ruler, Eye, MoreVertical, Upload,
  ArrowUp, ArrowDown, FileText, Users, Clock, ChevronRight, MapPin, AlertCircle, Award,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, Input, StatusBadge, PageHeader, EmptyState } from '../components/ui.jsx';
import { DEAL_STATUSES } from '../lib/deallink-api.js';
import api from '../lib/api.js';
import OnboardingCard from '../components/OnboardingCard.jsx';

const GOLD = '#b8860b';

// Animate a number from 0 → target with a simple setInterval counter.
function useCountUp(target, duration = 900) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const end = Number(target) || 0;
    if (end <= 0) { setVal(0); return undefined; }
    const steps = 30;
    const stepMs = Math.max(16, Math.floor(duration / steps));
    const inc = end / steps;
    let current = 0;
    const id = setInterval(() => {
      current += inc;
      if (current >= end) { setVal(end); clearInterval(id); }
      else setVal(Math.floor(current));
    }, stepMs);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function ActivityCounter() {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/stats')
      .then(({ data }) => { if (alive) setStats(data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const thisWeek = Number(stats?.profile_views_this_week) || 0;
  const lastWeek = Number(stats?.profile_views_last_week) || 0;
  const animated = useCountUp(thisWeek);
  const delta = thisWeek - lastWeek;
  const up = delta >= 0;

  if (!stats) return null;

  return (
    <Card className="p-5 mb-6">
      <p className="text-xs font-medium text-[#6e6e73] uppercase tracking-wider mb-2">This week</p>
      <div className="flex items-end gap-3 flex-wrap">
        <p className="text-[#1d1d1f] text-lg">
          Your profile had <span className="font-bold text-2xl text-[#b8860b]">{animated.toLocaleString()}</span> views this week
        </p>
        {delta !== 0 && (
          <span className={`inline-flex items-center gap-1 text-sm font-semibold mb-1 ${up ? 'text-[#22a06b]' : 'text-[#d4493a]'}`}>
            {up ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {Math.abs(delta).toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-[#86868b] text-xs mt-1">vs. {lastWeek.toLocaleString()} last week</p>
    </Card>
  );
}

function ActionInbox() {
  const [inbox, setInbox] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/action-inbox')
      .then(({ data }) => { if (alive) setInbox(data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const total = Number(inbox?.total) || 0;
  if (!inbox || total <= 0) return null;

  const rows = [
    { key: 'offers', icon: FileText, label: 'unreviewed offers', count: Number(inbox.unreviewed_offers) || 0, to: '/offers' },
    { key: 'leads', icon: Users, label: 'uncontacted leads', count: Number(inbox.uncontacted_leads) || 0, to: '/admin/leads' },
    { key: 'stale', icon: Clock, label: 'stale deals', count: Number(inbox.stale_deals) || 0, to: '/admin' },
  ];

  return (
    <Card className="mb-6 overflow-hidden border-[rgba(184,134,11,0.35)]" style={{ background: 'rgba(184,134,11,0.08)' }}>
      <div className="px-5 py-4 border-b border-[rgba(184,134,11,0.2)] flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-[#b8860b]" />
        <h2 className="text-[#1d1d1f] font-semibold">{total} thing{total === 1 ? '' : 's'} need your attention</h2>
      </div>
      <div className="divide-y divide-[rgba(184,134,11,0.15)]">
        {rows.map(({ key, icon: Icon, label, count, to }) => (
          <Link key={key} to={to} className={`flex items-center gap-3 px-5 py-3 hover:bg-[rgba(184,134,11,0.10)] transition-colors ${count === 0 ? 'opacity-50' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-[rgba(184,134,11,0.15)] flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-[#b8860b]" />
            </div>
            <span className="text-[#1d1d1f] text-sm font-medium flex-1">
              <span className="font-bold">{count.toLocaleString()}</span> {label}
            </span>
            <ChevronRight className="w-4 h-4 text-[#b8860b]" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function MarketFeed() {
  const [deals, setDeals] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/market-feed')
      .then(({ data }) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : (data?.deals || data?.items || []);
        setDeals(list.slice(0, 5));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!deals || deals.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-[#1d1d1f] font-semibold mb-3">New deals in your market</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {deals.map((d, i) => {
          const id = d.id ?? d.dealId;
          const handle = d.seller?.handle || d.handle || d.sellerHandle;
          const addr = d.addr || d.address || '—';
          const ask = Number(d.ask ?? d.asking_price ?? d.askingPrice ?? d.price) || 0;
          const type = d.type || d.property_type || d.propertyType || '';
          const href = handle && id ? `/p/${handle}/${id}` : null;
          const inner = (
            <Card className="p-4 min-w-[220px] max-w-[220px] hover:border-[#b8860b] transition-colors h-full">
              <div className="w-9 h-9 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center mb-3">
                <MapPin className="w-4 h-4 text-[#6e6e73]" />
              </div>
              <p className="text-[#1d1d1f] text-sm font-medium truncate">{addr}</p>
              <p className="text-[#b8860b] text-base font-bold mt-1">${ask.toLocaleString()}</p>
              {type && <p className="text-[#6e6e73] text-xs mt-1">{type}</p>}
            </Card>
          );
          return href ? (
            <a key={id ?? i} href={href} target="_blank" rel="noreferrer" className="block">{inner}</a>
          ) : (
            <div key={id ?? i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileScore() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/profile-score')
      .then(({ data: d }) => { if (alive) setData(d || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  const score = Math.max(0, Math.min(100, Number(data.score) || 0));
  const next = data.next_action;
  const nextLabel = typeof next === 'string' ? next : (next?.label || next?.text);
  const nextHref = typeof next === 'object' && next ? (next.href || next.to || next.url) : null;

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Profile strength</p>
        <span className="text-[#1d1d1f] text-sm font-bold">{score}%</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: GOLD }} />
      </div>
      {nextLabel && (
        nextHref ? (
          <Link to={nextHref} className="inline-flex items-center gap-1 text-sm font-semibold text-[#b8860b] hover:underline mt-3">
            {nextLabel} <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <p className="text-sm text-[#6e6e73] mt-3">{nextLabel}</p>
        )
      )}
    </Card>
  );
}

function ReferralTracker() {
  const [data, setData] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/deallink/referrals/my-link'),
      api.get('/deallink/referrals/stats'),
    ])
      .then(([linkRes, statsRes]) => {
        if (alive) setData({ link: linkRes.data || {}, stats: statsRes.data || {} });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  const referralUrl = data.link?.referral_url ?? null;

  if (!referralUrl) {
    return (
      <Card className="p-4 mb-6">
        <p className="text-sm text-[#6e6e73]">
          Set your handle in{' '}
          <Link to="/admin/profile" className="font-semibold text-[#b8860b] hover:underline">profile settings</Link>{' '}
          to get your referral link
        </p>
      </Card>
    );
  }

  const activated = Math.max(0, Number(data.stats?.activated) || 0);
  const earned = activated >= 3;
  const pct = Math.min(100, (activated / 3) * 100);

  function copy() {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(referralUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <Card className="mb-6 p-5 border-[rgba(184,134,11,0.35)]" style={{ background: 'rgba(184,134,11,0.08)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Award className="w-5 h-5 text-[#b8860b] flex-shrink-0" />
        <h2 className="text-[#1d1d1f] font-semibold">Invite wholesalers — earn your Founding Member badge</h2>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          readOnly
          value={referralUrl}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white border border-[rgba(184,134,11,0.3)] text-[#1d1d1f] text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="bg-[#b8860b] hover:opacity-90 text-white font-semibold text-sm px-4 py-2 rounded-lg flex-shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {earned ? (
        <p className="text-[#1d1d1f] text-sm font-semibold">🏆 Founding Member badge earned!</p>
      ) : (
        <>
          <div className="w-full h-2.5 rounded-full bg-[rgba(0,0,0,0.08)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: GOLD }} />
          </div>
          <p className="text-[#6e6e73] text-xs mt-2">{activated} of 3 referrals activated</p>
        </>
      )}
    </Card>
  );
}

function DashboardInsights() {
  return (
    <div className="mt-8">
      <ActivityCounter />
      <ReferralTracker />
      <ActionInbox />
      <MarketFeed />
      <ProfileScore />
    </div>
  );
}

export default function AdminDashboard() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [filter, setFilter] = React.useState('All');
  const [search, setSearch] = React.useState('');
  const [menu, setMenu] = React.useState(null);

  const counts = state.deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const filtered = state.deals.filter((d) => {
    if (filter !== 'All' && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${d.addr} ${d.zip} ${d.city} ${d.state}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <Layout>
      <OnboardingCard stepKey="properties_list" />
      <PageHeader
        title="Properties"
        subtitle={`${state.deals.length} active listing${state.deals.length === 1 ? '' : 's'}`}
        actions={<>
          <Link to="/admin/import"><Button variant="secondary"><Upload className="w-4 h-4" /> Import CSV</Button></Link>
          <Link to="/admin/deal/new"><Button><Plus className="w-4 h-4" /> Add property</Button></Link>
        </>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e6e73]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address, city, ZIP..." className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...DEAL_STATUSES].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-[#b8860b] text-white' : 'bg-[rgba(0,0,0,0.06)] text-[#6e6e73] border border-[rgba(0,0,0,0.08)] hover:text-[#1d1d1f]'}`}>
              {s} {s !== 'All' ? counts[s] || 0 : state.deals.length}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={state.deals.length === 0 ? 'No properties yet' : 'No matches'}
          body={state.deals.length === 0 ? 'Add your first deal manually or import a CSV.' : 'Try a different filter or search.'}
          action={state.deals.length === 0 ? <div className="flex gap-2 justify-center"><Link to="/admin/deal/new"><Button>Add deal</Button></Link><Link to="/admin/import"><Button variant="secondary">Import CSV</Button></Link></div> : null}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(0,0,0,0.08)]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Property</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider hidden sm:table-cell">Asking</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider hidden md:table-cell">ARV</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider hidden lg:table-cell">Details</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.08)]">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-[#6e6e73]" />
                        </div>
                        <div className="min-w-0">
                          <Link to={`/admin/deal/${d.id}`} className="text-[#1d1d1f] text-sm font-medium hover:text-[#b8860b] truncate block">{d.addr || '—'}</Link>
                          <p className="text-[#6e6e73] text-xs truncate">{[d.city, d.state || d.zip].filter(Boolean).join(', ')} · {d.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell"><p className="text-[#1d1d1f] text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p></td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-green-400 text-sm font-semibold">${Number(d.arv || 0).toLocaleString()}</p>
                      {d.arv > 0 && d.ask > 0 && <p className="text-[#86868b] text-xs">{Math.round((d.arv - d.ask) / d.arv * 100)}% spread</p>}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-3 text-[#6e6e73] text-xs">
                        {d.beds > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{d.beds}</span>}
                        {d.baths > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{d.baths}</span>}
                        {d.sqft > 0 && <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{Number(d.sqft).toLocaleString()}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-4 relative">
                      <button onClick={() => setMenu(menu === d.id ? null : d.id)} className="text-[#6e6e73] hover:text-[#1d1d1f]"><MoreVertical className="w-4 h-4" /></button>
                      {menu === d.id && (
                        <div className="absolute right-2 top-12 z-20 bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg min-w-[180px] py-1 shadow-xl text-xs" onMouseLeave={() => setMenu(null)}>
                          <Link to={`/admin/deal/${d.id}`} className="block px-3 py-2 text-[#3a3a3c] hover:bg-[rgba(0,0,0,0.08)]">Edit</Link>
                          {state.profile.handle && <Link to={`/p/${state.profile.handle}/${d.id}`} target="_blank" className="block px-3 py-2 text-[#3a3a3c] hover:bg-[rgba(0,0,0,0.08)]">View public ↗</Link>}
                          <button onClick={() => { dispatch({ type: 'update_profile', patch: { featuredId: d.id } }); setMenu(null); show('Featured updated'); }} className="block w-full text-left px-3 py-2 text-[#3a3a3c] hover:bg-[rgba(0,0,0,0.08)]">Set as featured</button>
                          <div className="border-t border-[rgba(0,0,0,0.08)] my-1" />
                          {DEAL_STATUSES.filter((s) => s !== d.status).map((s) => (
                            <button key={s} onClick={() => { dispatch({ type: 'update_deal', id: d.id, patch: { status: s } }); setMenu(null); show(`Marked ${s}`); }} className="block w-full text-left px-3 py-2 text-[#3a3a3c] hover:bg-[rgba(0,0,0,0.08)]">Mark {s}</button>
                          ))}
                          <div className="border-t border-[rgba(0,0,0,0.08)] my-1" />
                          <button onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: d.id }); setMenu(null); show('Deal deleted'); } }} className="block w-full text-left px-3 py-2 text-red-400 hover:bg-[rgba(0,0,0,0.08)]">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <DashboardInsights />
      {node}
    </Layout>
  );
}
