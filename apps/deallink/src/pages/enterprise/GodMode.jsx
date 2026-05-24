import React from 'react';
import { Eye, TrendingUp, Activity, MapPin } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, PageHeader } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const markets = [
  { name: 'Atlanta, GA',    deals: 87,  avgArv: 162, hot: true,  trend: '+18%' },
  { name: 'Dallas, TX',     deals: 124, avgArv: 198, hot: true,  trend: '+24%' },
  { name: 'Phoenix, AZ',    deals: 56,  avgArv: 142, hot: false, trend: '-3%' },
  { name: 'Memphis, TN',    deals: 41,  avgArv: 98,  hot: true,  trend: '+12%' },
  { name: 'Birmingham, AL', deals: 33,  avgArv: 110, hot: false, trend: '+1%' },
  { name: 'Houston, TX',    deals: 92,  avgArv: 175, hot: true,  trend: '+15%' },
];

const signals = [
  { kind: 'Foreclosure', addr: '4421 N Pearl, Dallas TX',  ts: '12m ago' },
  { kind: 'Probate',     addr: '7710 Ash Ct, Atlanta GA',  ts: '34m ago' },
  { kind: 'Vacancy',     addr: '203 Elm St, Memphis TN',   ts: '1h ago' },
  { kind: 'Tax lien',    addr: '99 Spruce Ln, Houston TX', ts: '2h ago' },
];

export default function GodMode() {
  return (
    <Layout>
      <PageHeader title="Power" subtitle="Real-time market intelligence across the network" />
      <EnterpriseBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Hot markets</CardTitle><span className="text-xs text-[#b8860b] flex items-center gap-1.5"><Activity className="w-3 h-3" /> Live</span></CardHeader>
          <div className="divide-y divide-[rgba(0,0,0,0.08)]">
            {markets.map((m) => (
              <div key={m.name} className="px-5 py-3 flex items-center gap-4 hover:bg-[rgba(0,0,0,0.06)]/30">
                <div className={`w-2 h-8 rounded-full ${m.hot ? 'bg-[#b8860b]' : 'bg-[rgba(0,0,0,0.10)]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[#1d1d1f] text-sm font-medium flex items-center gap-1.5"><MapPin className="w-3 h-3 text-[#86868b]" />{m.name}</p>
                  <p className="text-[#86868b] text-xs mt-0.5">{m.deals} active deals · avg ARV ${m.avgArv}k</p>
                </div>
                <span className={`text-xs font-mono font-bold flex items-center gap-1 ${m.trend.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}><TrendingUp className="w-3 h-3" /> {m.trend}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Off-market signals</CardTitle><Eye className="w-4 h-4 text-[#b8860b]" /></CardHeader>
          <div className="p-5 space-y-3">
            {signals.map((s, i) => (
              <div key={i} className="p-3 bg-[rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.08)] rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[#b8860b] text-xs font-bold uppercase">{s.kind}</span>
                  <span className="text-[#86868b] text-xs">{s.ts}</span>
                </div>
                <p className="text-[#1d1d1f] text-sm mt-1">{s.addr}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
