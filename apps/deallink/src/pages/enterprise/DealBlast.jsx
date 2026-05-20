import React from 'react';
import { Zap, Sparkles, Send, Clock, CheckCircle2 } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, Button, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const blasts = [
  { id: 1, deal: '1234 Oak Street, Atlanta GA', sent: 184, opens: 121, replies: 18, status: 'Sent', when: '2h ago' },
  { id: 2, deal: '5678 Pine Ave, Dallas TX',    sent: 296, opens: 217, replies: 34, status: 'Sent', when: 'Yesterday' },
  { id: 3, deal: '9012 Maple Dr, Phoenix AZ',   sent: 0,   opens: 0,   replies: 0,  status: 'Draft', when: '—' },
];

export default function DealBlast() {
  return (
    <Layout>
      <PageHeader title="AI Deal Blast" subtitle="One-click email + SMS to your matched buyers" actions={<Button><Zap className="w-4 h-4" /> Compose blast</Button>} />
      <EnterpriseBanner />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[['Open rate', '64%', 'text-green-400'], ['Reply rate', '12%', 'text-[#b8860b]'], ['Total sent', '480', 'text-[#1d1d1f]'], ['Avg time-to-open', '4m', 'text-blue-400']].map(([l, v, c]) => (
          <Card key={l} className="p-4"><p className="text-[#6e6e73] text-xs">{l}</p><p className={`text-2xl font-bold mt-1 ${c}`}>{v}</p></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent blasts</CardTitle>
          <span className="text-xs text-[#6e6e73] flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#b8860b]" /> AI-matched 1,247 buyers</span>
        </CardHeader>
        <div className="divide-y divide-[rgba(0,0,0,0.08)]">
          {blasts.map((b) => (
            <div key={b.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[rgba(0,0,0,0.06)]/30">
              <div className="w-10 h-10 rounded-lg bg-[rgba(184,134,11,0.10)] flex items-center justify-center flex-shrink-0">
                {b.status === 'Sent' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-[#b8860b]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#1d1d1f] text-sm font-medium truncate">{b.deal}</p>
                <p className="text-[#86868b] text-xs">{b.when}</p>
              </div>
              <div className="hidden md:flex gap-6 text-xs">
                <Stat l="Sent" v={b.sent} />
                <Stat l="Opens" v={b.opens} />
                <Stat l="Replies" v={b.replies} c="text-green-400" />
              </div>
              <StatusBadge status={b.status === 'Sent' ? 'Closed' : 'New'} />
              <Button size="sm" variant="secondary"><Send className="w-3 h-3" /> Resend</Button>
            </div>
          ))}
        </div>
      </Card>
    </Layout>
  );
}

function Stat({ l, v, c = 'text-[#1d1d1f]' }) { return <div className="text-right"><p className="text-[#86868b]">{l}</p><p className={`font-semibold ${c}`}>{v}</p></div>; }
