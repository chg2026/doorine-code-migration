import React from 'react';
import { Building2, Users, FileText, DollarSign, Eye, MousePointerClick } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, CardHeader, CardTitle, PageHeader } from '../components/ui.jsx';
import { formatCurrency } from '../lib/utils.js';
import { DEAL_STATUSES } from '../lib/deallink-api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UpgradeBanner } from '../components/UpgradePrompt.jsx';

const STATUS_COLORS = { 'New': '#94a3b8', 'Marketed': '#60a5fa', 'Under Contract': '#fbbf24', 'Closed': '#34d399', 'Dead': '#f87171' };

function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#6e6e73] text-xs uppercase tracking-wider">{label}</p>
          <p className="text-[#1d1d1f] text-2xl font-bold mt-2">{value}</p>
          {sub && <p className="text-[#86868b] text-xs mt-1">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg bg-[rgba(184,134,11,0.10)] text-[#b8860b] flex items-center justify-center"><Icon className="w-4 h-4" /></div>
      </div>
    </Card>
  );
}

export default function Analytics() {
  const { state } = useStore();
  const { isFreePlan } = useAuth();
  const { deals, leads, buyers, offers, profile } = state;

  const profileVisits = Number(profile?.viewCount ?? profile?.visits ?? 0);
  const totalDealClicks = deals.reduce((s, d) => s + (Number(d.clickCount) || 0), 0);

  const byStatus = DEAL_STATUSES.map((s) => ({ status: s, count: deals.filter((d) => d.status === s).length }));
  const byType = Object.entries(deals.reduce((a, d) => { a[d.type || 'Other'] = (a[d.type || 'Other'] || 0) + 1; return a; }, {})).map(([type, count]) => ({ type, count }));
  const totalAsk = deals.reduce((s, d) => s + (Number(d.ask) || 0), 0);
  const totalArv = deals.reduce((s, d) => s + (Number(d.arv) || 0), 0);
  const totalSpread = totalArv - totalAsk;

  // group by month
  const byMonth = {};
  [...deals, ...leads, ...offers].forEach((item) => {
    const ts = item.createdAt ? (typeof item.createdAt === 'number' ? item.createdAt : Date.parse(item.createdAt)) : null;
    if (!ts) return;
    const key = new Date(ts).toLocaleString('en-US', { month: 'short', year: '2-digit' });
    byMonth[key] = byMonth[key] || { month: key, deals: 0, leads: 0, offers: 0 };
  });
  deals.forEach((d) => { if (d.createdAt) { const k = new Date(typeof d.createdAt === 'number' ? d.createdAt : Date.parse(d.createdAt)).toLocaleString('en-US', { month: 'short', year: '2-digit' }); if (byMonth[k]) byMonth[k].deals++; } });
  leads.forEach((l) => { if (l.createdAt) { const k = new Date(l.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' }); if (byMonth[k]) byMonth[k].leads++; } });
  offers.forEach((o) => { if (o.createdAt) { const k = new Date(o.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' }); if (byMonth[k]) byMonth[k].offers++; } });
  const trend = Object.values(byMonth).slice(-6);

  const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 };

  if (isFreePlan) {
    return (
      <Layout>
        <PageHeader title="Analytics" subtitle="Top-line traffic for your public profile." />
        <UpgradeBanner message="Free plan shows basic traffic. Upgrade to Personal or Team for pipeline charts, deal-status breakdowns, and 6-month trends." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <StatCard label="Profile visits" value={profileVisits.toLocaleString()} sub="Lifetime views of your public page" icon={Eye} />
          <StatCard label="Deal clicks" value={totalDealClicks.toLocaleString()} sub="Total clicks across all deals" icon={MousePointerClick} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="Analytics" subtitle="Pipeline performance at a glance." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Deals" value={deals.length} icon={Building2} />
        <StatCard label="Buyers" value={buyers.length} icon={Users} />
        <StatCard label="Offers" value={offers.length} icon={FileText} />
        <StatCard label="Pipeline value" value={formatCurrency(totalArv)} sub={`${formatCurrency(totalSpread)} potential spread`} icon={DollarSign} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Deals by status</CardTitle></CardHeader>
          <div className="p-5 h-72">
            <ResponsiveContainer>
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="status" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {byStatus.map((d) => <Cell key={d.status} fill={STATUS_COLORS[d.status]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Deals by type</CardTitle></CardHeader>
          <div className="p-5 h-72">
            {byType.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#86868b] text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={(d) => `${d.type} (${d.count})`}>
                    {byType.map((_, i) => <Cell key={i} fill={['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa'][i % 5]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Activity trend (last 6 months)</CardTitle></CardHeader>
        <div className="p-5 h-72">
          {trend.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[#86868b] text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="deals" stroke="#fbbf24" strokeWidth={2} />
                <Line type="monotone" dataKey="leads" stroke="#60a5fa" strokeWidth={2} />
                <Line type="monotone" dataKey="offers" stroke="#34d399" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </Layout>
  );
}
