import React from 'react';
import { Eye, Bot, Target, Sparkles } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, Button, PageHeader } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const tasks = [
  { kind: 'Hunt',     msg: 'Scanning MLS + private feeds for SFR under $80k in Atlanta', score: 0.87 },
  { kind: 'Score',    msg: 'Re-ranked 142 leads by buyer intent', score: 0.91 },
  { kind: 'Outreach', msg: 'Drafted 23 follow-ups for warm buyers', score: 0.78 },
  { kind: 'Match',    msg: 'Paired 11 buyers to 3 new deals', score: 0.83 },
];

export default function ArtemisMode() {
  return (
    <Layout>
      <PageHeader
        title="Quest Search"
        subtitle="Autonomous AI agent that hunts, scores, and routes deals 24/7"
        actions={<Button><Bot className="w-4 h-4" /> Configure agent</Button>}
      />
      <EnterpriseBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#b8860b] flex items-center justify-center"><Eye className="w-6 h-6 text-[#1d1d1f]" /></div>
            <div><p className="text-[#1d1d1f] font-bold">Quest Search</p><p className="text-[#b8860b] text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Online · 12d uptime</p></div>
          </div>
          <p className="text-[#3a3a3c] text-sm leading-relaxed">Your autonomous deal hunter. She scrapes signals, scores leads, and pings the right buyer — even while you sleep.</p>
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] grid grid-cols-2 gap-3">
            <div><p className="text-[#86868b] text-xs">Decisions today</p><p className="text-[#1d1d1f] text-xl font-bold mt-1">847</p></div>
            <div><p className="text-[#86868b] text-xs">Deals surfaced</p><p className="text-[#b8860b] text-xl font-bold mt-1">12</p></div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Agent activity</CardTitle><Sparkles className="w-4 h-4 text-[#b8860b]" /></CardHeader>
          <div className="divide-y divide-[rgba(0,0,0,0.08)]">
            {tasks.map((t, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-[rgba(184,134,11,0.10)] flex items-center justify-center"><Target className="w-4 h-4 text-[#b8860b]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#1d1d1f] text-sm"><span className="text-[#b8860b] font-semibold">{t.kind}</span> · {t.msg}</p>
                  <div className="mt-2 h-1 bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#b8860b]" style={{ width: `${Math.round(t.score * 100)}%` }} />
                  </div>
                </div>
                <span className="font-mono text-xs text-[#6e6e73] w-12 text-right">{Math.round(t.score * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
