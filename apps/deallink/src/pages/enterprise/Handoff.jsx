import React from 'react';
import { Handshake, FileCheck, CheckCircle2, Circle, Clock } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, PageHeader } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const transactions = [
  { id: 1, addr: '5678 Pine Ave, Dallas TX', buyer: 'Maria Rodriguez', step: 3, total: 6, eta: 'Closes May 22' },
  { id: 2, addr: '7890 Cedar Ln, Memphis TN', buyer: 'Sandra Lee',     step: 5, total: 6, eta: 'Closes May 14' },
  { id: 3, addr: '203 Walnut St, Memphis TN', buyer: 'Kevin Brooks',    step: 1, total: 6, eta: 'Just contracted' },
];

const STEPS = ['Contract', 'EM wired', 'Title open', 'Inspection', 'Funding', 'Closing'];

export default function Handoff() {
  return (
    <Layout>
      <PageHeader title="Handoff" subtitle="Track every contract from signature to wire" />
      <EnterpriseBanner />

      <div className="space-y-4">
        {transactions.map((tx) => (
          <Card key={tx.id} className="p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[rgba(184,134,11,0.10)] flex items-center justify-center"><FileCheck className="w-4 h-4 text-[#b8860b]" /></div>
                <div>
                  <p className="text-[#1d1d1f] text-sm font-semibold">{tx.addr}</p>
                  <p className="text-[#6e6e73] text-xs flex items-center gap-1"><Handshake className="w-3 h-3" /> Buyer: {tx.buyer}</p>
                </div>
              </div>
              <span className="text-xs text-[#6e6e73] flex items-center gap-1.5"><Clock className="w-3 h-3" /> {tx.eta}</span>
            </div>
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const done = i < tx.step;
                const active = i === tx.step;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      {done ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : active ? <Circle className="w-5 h-5 text-[#b8860b] fill-[rgba(184,134,11,0.30)]" /> : <Circle className="w-5 h-5 text-[#3a3a3c]" />}
                      <span className={`text-[10px] font-medium truncate ${done ? 'text-green-400' : active ? 'text-[#b8860b]' : 'text-[#86868b]'}`}>{s}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? 'bg-green-400' : 'bg-[rgba(0,0,0,0.08)]'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
