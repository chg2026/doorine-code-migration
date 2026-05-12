import React from 'react';
import { Globe, Building2, Bed, Bath, Ruler, MapPin, Eye, Zap, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { DealLinkAPI } from '../lib/deallink-api.js';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, PageHeader, StatusBadge } from '../components/ui.jsx';
import { initialsOf } from '../lib/utils.js';

export default function Marketplace() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState('All');

  const optedIn = !!state.profile?.marketplaceOptIn;

  async function load() {
    setLoading(true); setError(null);
    try { const deals = await DealLinkAPI.listMarketplace(); setItems(deals); }
    catch (e) { setError(e?.message || 'Failed to load marketplace'); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); }, []);

  const types = Array.from(new Set(items.map((d) => d.type).filter(Boolean)));
  const filtered = filter === 'All' ? items : items.filter((d) => d.type === filter);

  async function toggleOptIn() {
    await dispatch({ type: 'update_profile', patch: { marketplaceOptIn: !optedIn } });
    show(optedIn ? 'Removed from marketplace' : 'Listed on marketplace');
    load();
  }

  return (
    <Layout>
      <PageHeader
        title="Marketplace"
        subtitle="Cross-wholesaler deal feed. Opt in to share your inventory."
        actions={<>
          <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button variant={optedIn ? 'secondary' : 'primary'} onClick={toggleOptIn}>{optedIn ? 'Opted in ✓' : 'Opt in to share'}</Button>
        </>}
      />

      <div className="flex gap-2 flex-wrap mb-6">
        {['All', ...types].map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === t ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="text-center py-16 text-slate-400 font-mono text-xs">Loading marketplace…</Card>
      ) : error ? (
        <Card className="text-center py-16 text-red-400 text-sm">{error}</Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <Globe className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-white font-semibold mt-4">No deals on the marketplace yet</p>
          <p className="text-slate-400 text-sm mt-2">{optedIn ? 'Add deals to your inventory and they\'ll show up here.' : 'Opt in to be the first to share.'}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((d) => (
            <Card key={d.id} className="overflow-hidden hover:border-slate-500 transition-colors group">
              <div className="relative h-40 bg-slate-800 flex items-center justify-center">
                {d.photoUrl
                  ? <img src={d.photoUrl} alt={d.addr} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <Building2 className="w-12 h-12 text-slate-600" />}
                <div className="absolute top-3 left-3"><StatusBadge status={d.status} /></div>
              </div>
              <div className="p-4">
                <p className="text-white font-semibold text-sm truncate">{d.addr}</p>
                <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{[d.city, d.state].filter(Boolean).join(', ')} · {d.type}</p>
                <div className="flex items-center gap-3 text-slate-400 text-xs mt-2">
                  {d.beds > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{d.beds}</span>}
                  {d.baths > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{d.baths}</span>}
                  {d.sqft > 0 && <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{Number(d.sqft).toLocaleString()} sqft</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-lg">${d.ask}k</p>
                    <p className="text-green-400 text-xs">ARV ${d.arv}k</p>
                  </div>
                  {d.seller?.handle ? (
                    <a href={`/p/${d.seller.handle}/${d.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold px-3 py-2 rounded-lg text-xs transition-colors">
                      <Zap className="w-3 h-3" /> View
                    </a>
                  ) : null}
                </div>
                {d.seller && (
                  <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-white text-[10px] font-bold">{d.seller.initials || initialsOf(d.seller.name || d.seller.handle)}</div>
                    <div className="min-w-0">
                      <p className="text-slate-300 text-xs font-medium truncate">@{d.seller.handle}</p>
                      <p className="text-slate-500 text-[10px] truncate">{d.seller.city || d.seller.name || ''}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {node}
    </Layout>
  );
}
