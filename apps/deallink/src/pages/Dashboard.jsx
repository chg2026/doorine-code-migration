import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, FileText, TrendingUp, DollarSign, Plus, Upload, Eye, ArrowUpRight } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, CardHeader, CardTitle, StatusBadge, Button } from '../components/ui.jsx';
import { formatCurrency, formatRelTime } from '../lib/utils.js';

function StatCard({ label, value, sub, icon: Icon, trend }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#6e6e73] text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-[#1d1d1f] text-3xl font-bold mt-2">{value}</p>
          {sub && <p className="text-[#86868b] text-xs mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-[rgba(184,134,11,0.10)] text-[#b8860b] flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend != null && (
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-[#22a06b]">
          <TrendingUp className="w-3 h-3" />{trend}
        </div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { state } = useStore();
  const { deals, leads, buyers, offers, profile } = state;

  const counts = deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const totalAsk = deals.reduce((s, d) => s + (Number(d.ask) || 0), 0);
  const totalArv = deals.reduce((s, d) => s + (Number(d.arv) || 0), 0);
  const recent = deals.slice(0, 6);
  const recentLeads = leads.slice(0, 6);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">Welcome back{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
            <p className="text-[#6e6e73] text-sm mt-1">Here's what's happening across your inventory.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/import"><Button variant="secondary"><Upload className="w-4 h-4" /> Import CSV</Button></Link>
            <Link to="/admin/deal/new"><Button><Plus className="w-4 h-4" /> Add deal</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total deals" value={deals.length} sub={`${counts['Marketed'] || 0} marketed · ${counts['Under Contract'] || 0} under contract`} icon={Building2} />
          <StatCard label="Buyers" value={buyers.length} sub="In your network" icon={Users} />
          <StatCard label="Offers" value={offers.length} sub={`${offers.filter(o => o.status === 'Pending').length} pending`} icon={FileText} />
          <StatCard label="ARV pipeline" value={formatCurrency(totalArv)} sub={`${formatCurrency(totalAsk)} asking`} icon={DollarSign} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent deals</CardTitle>
              <Link to="/admin" className="text-[#b8860b] text-xs hover:underline">View all →</Link>
            </CardHeader>
            <div className="divide-y divide-[rgba(0,0,0,0.08)]">
              {recent.length === 0 && (
                <div className="px-5 py-12 text-center text-[#86868b] text-sm">
                  No deals yet. <Link to="/admin/deal/new" className="text-[#b8860b] hover:underline">Add your first deal</Link>.
                </div>
              )}
              {recent.map((d) => (
                <Link key={d.id} to={`/admin/deal/${d.id}`} className="px-5 py-3 flex items-center justify-between hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#6e6e73]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#1d1d1f] text-sm font-medium truncate hover:text-[#b8860b]">{d.addr || '—'}</p>
                      <p className="text-[#6e6e73] text-xs truncate">{[d.city, d.state || d.zip].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block mr-4">
                    <p className="text-[#1d1d1f] text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p>
                    <p className="text-[#6e6e73] text-xs">ARV ${Number(d.arv || 0).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <div className="p-5 space-y-4">
              {recentLeads.length === 0 && offers.length === 0 && (
                <p className="text-[#86868b] text-sm text-center py-8">Quiet so far. Share your link.</p>
              )}
              {recentLeads.map((l) => (
                <div key={l.id} className="flex gap-3">
                  <Eye className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#b8860b]" />
                  <div>
                    <p className="text-[#1d1d1f] text-sm">
                      <b>{[l.first, l.last].filter(Boolean).join(' ') || 'A buyer'}</b> {l.kind === 'deal-interest' ? 'is interested in a deal' : 'joined your buyer list'}
                    </p>
                    <p className="text-[#86868b] text-xs mt-0.5">{formatRelTime(l.createdAt)}</p>
                  </div>
                </div>
              ))}
              {offers.slice(0, 3).map((o) => (
                <div key={o.id} className="flex gap-3">
                  <ArrowUpRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#3478f6]" />
                  <div>
                    <p className="text-[#1d1d1f] text-sm"><b>{o.buyerName || 'Buyer'}</b> offered ${Number(o.amount).toLocaleString()}</p>
                    <p className="text-[#86868b] text-xs mt-0.5">{formatRelTime(o.createdAt)} · {o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
