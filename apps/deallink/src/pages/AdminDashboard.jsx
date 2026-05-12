import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Building2, Bed, Bath, Ruler, Eye, MoreVertical, Upload } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, Input, StatusBadge, PageHeader, EmptyState } from '../components/ui.jsx';
import { DEAL_STATUSES } from '../lib/deallink-api.js';

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address, city, ZIP..." className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...DEAL_STATUSES].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'}`}>
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
                <tr className="border-b border-slate-700">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Property</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">Asking</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">ARV</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">Details</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <Link to={`/admin/deal/${d.id}`} className="text-white text-sm font-medium hover:text-amber-400 truncate block">{d.addr || '—'}</Link>
                          <p className="text-slate-400 text-xs truncate">{[d.city, d.state || d.zip].filter(Boolean).join(', ')} · {d.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell"><p className="text-white text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p></td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-green-400 text-sm font-semibold">${Number(d.arv || 0).toLocaleString()}</p>
                      {d.arv > 0 && d.ask > 0 && <p className="text-slate-500 text-xs">{Math.round((d.arv - d.ask) / d.arv * 100)}% spread</p>}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-3 text-slate-400 text-xs">
                        {d.beds > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{d.beds}</span>}
                        {d.baths > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{d.baths}</span>}
                        {d.sqft > 0 && <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{Number(d.sqft).toLocaleString()}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-4 relative">
                      <button onClick={() => setMenu(menu === d.id ? null : d.id)} className="text-slate-400 hover:text-white"><MoreVertical className="w-4 h-4" /></button>
                      {menu === d.id && (
                        <div className="absolute right-2 top-12 z-20 bg-slate-800 border border-slate-700 rounded-lg min-w-[180px] py-1 shadow-xl text-xs" onMouseLeave={() => setMenu(null)}>
                          <Link to={`/admin/deal/${d.id}`} className="block px-3 py-2 text-slate-300 hover:bg-slate-700">Edit</Link>
                          {state.profile.handle && <Link to={`/p/${state.profile.handle}/${d.id}`} target="_blank" className="block px-3 py-2 text-slate-300 hover:bg-slate-700">View public ↗</Link>}
                          <button onClick={() => { dispatch({ type: 'update_profile', patch: { featuredId: d.id } }); setMenu(null); show('Featured updated'); }} className="block w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-700">Set as featured</button>
                          <div className="border-t border-slate-700 my-1" />
                          {DEAL_STATUSES.filter((s) => s !== d.status).map((s) => (
                            <button key={s} onClick={() => { dispatch({ type: 'update_deal', id: d.id, patch: { status: s } }); setMenu(null); show(`Marked ${s}`); }} className="block w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-700">Mark {s}</button>
                          ))}
                          <div className="border-t border-slate-700 my-1" />
                          <button onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: d.id }); setMenu(null); show('Deal deleted'); } }} className="block w-full text-left px-3 py-2 text-red-400 hover:bg-slate-700">Delete</button>
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
      {node}
    </Layout>
  );
}
