import React from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Mail, Phone } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, PageHeader, EmptyState, Button } from '../components/ui.jsx';
import { formatRelTime } from '../lib/utils.js';

export default function AdminLeads() {
  const { state } = useStore();
  const leads = state.leads;
  const dealMap = Object.fromEntries(state.deals.map((d) => [d.id, d]));
  const dealInterest = leads.filter((l) => l.kind === 'deal-interest').length;
  const buyerList = leads.filter((l) => l.kind === 'buyer-list').length;

  return (
    <Layout>
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} total · ${dealInterest} deal interest · ${buyerList} buyer list`}
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No leads yet"
          body="Share your public link — buyers who tap I'm interested land here."
          action={state.profile.handle ? <a href={`/p/${state.profile.handle}`} target="_blank" rel="noreferrer"><Button>Open public profile</Button></a> : null}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">Contact</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Deal</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {leads.map((l) => {
                  const deal = l.dealId ? dealMap[l.dealId] : null;
                  return (
                    <tr key={l.id} className="hover:bg-slate-800/50">
                      <td className="px-5 py-4 text-white text-sm font-medium">{[l.first, l.last].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <div className="space-y-1">
                          {l.email && <div className="text-slate-300 text-xs flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-500" /> {l.email}</div>}
                          {l.phone && <div className="text-slate-400 text-xs flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-500" /> {l.phone}</div>}
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell text-slate-300 text-xs">{l.buyerType || '—'}</td>
                      <td className="px-5 py-4 text-sm">{deal ? <Link className="text-amber-400 hover:underline" to={`/admin/deal/${deal.id}`}>{deal.addr}</Link> : <span className="text-slate-500">Buyer list</span>}</td>
                      <td className="px-5 py-4 hidden lg:table-cell text-slate-500 text-xs font-mono">{formatRelTime(l.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Layout>
  );
}
