import React from 'react';
import { Handshake, Plus, Building2, Percent } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, Button, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const jvDeals = [
  { id: 1, addr: '7110 Beckley Ave, Dallas TX', partner: '@reywholesale', split: '50/50', status: 'Marketed',       fee: 12000 },
  { id: 2, addr: '203 Walnut St, Memphis TN',   partner: '@kwilliams.deals', split: '60/40', status: 'Under Contract', fee: 8500 },
  { id: 3, addr: '88 Oak Ln, Atlanta GA',       partner: '@atlflips',  split: '70/30', status: 'Closed',  fee: 21000 },
];

export default function JVDeals() {
  return (
    <Layout>
      <PageHeader title="JV Deals" subtitle="Co-wholesale with partners, automatic fee splits" actions={<Button><Plus className="w-4 h-4" /> New JV</Button>} />
      <EnterpriseBanner />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4"><p className="text-[#6e6e73] text-xs">Active JVs</p><p className="text-[#1d1d1f] text-2xl font-bold mt-1">7</p></Card>
        <Card className="p-4"><p className="text-[#6e6e73] text-xs">Closed YTD</p><p className="text-green-400 text-2xl font-bold mt-1">12</p></Card>
        <Card className="p-4"><p className="text-[#6e6e73] text-xs">Earned</p><p className="text-[#b8860b] text-2xl font-bold mt-1">$148k</p></Card>
        <Card className="p-4"><p className="text-[#6e6e73] text-xs">Partners</p><p className="text-blue-400 text-2xl font-bold mt-1">5</p></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Open joint-ventures</CardTitle></CardHeader>
        <div className="divide-y divide-[rgba(0,0,0,0.08)]">
          {jvDeals.map((j) => (
            <div key={j.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[rgba(0,0,0,0.06)]/30">
              <div className="w-10 h-10 rounded-lg bg-[rgba(0,0,0,0.06)] flex items-center justify-center"><Building2 className="w-4 h-4 text-[#6e6e73]" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[#1d1d1f] text-sm font-medium truncate">{j.addr}</p>
                <p className="text-[#86868b] text-xs flex items-center gap-1"><Handshake className="w-3 h-3" /> JV with <span className="text-[#b8860b]">{j.partner}</span></p>
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-[#86868b] text-xs">Split</p>
                <p className="text-[#1d1d1f] font-mono text-sm font-semibold flex items-center gap-1"><Percent className="w-3 h-3" />{j.split}</p>
              </div>
              <div className="hidden md:block text-right">
                <p className="text-[#86868b] text-xs">Your fee</p>
                <p className="text-green-400 font-mono text-sm font-semibold">${j.fee.toLocaleString()}</p>
              </div>
              <StatusBadge status={j.status} />
            </div>
          ))}
        </div>
      </Card>
    </Layout>
  );
}
