import React from 'react';
import { Globe, Building2, Bed, Bath, Ruler, MapPin, Eye, Zap, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { DealLinkAPI } from '../lib/deallink-api.js';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, PageHeader, StatusBadge } from '../components/ui.jsx';
import { initialsOf } from '../lib/utils.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Marketplace() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState('All');

  const { isFreePlan } = useAuth();

  async function load() {
    setLoading(true); setError(null);
    try { const deals = await DealLinkAPI.listMarketplace(); setItems(deals); }
    catch (e) {
      const status = e?.response?.status;
      if (status === 404) setError("Marketplace isn't available yet on this server. Check back soon.");
      else if (status === 401 || status === 403) setError("You don't have access to the marketplace. Sign in or contact your admin.");
      else setError(e?.response?.data?.error || e?.message || 'Failed to load marketplace');
    }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); }, []);

  const types = Array.from(new Set(items.map((d) => d.type).filter(Boolean)));
  const filtered = filter === 'All' ? items : items.filter((d) => d.type === filter);

  return (
    <Layout>
      <PageHeader
        title="Marketplace"
        subtitle="Cross-wholesaler deal feed. Mark any deal as visible to share it here."
        actions={<Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>}
      />

      {isFreePlan && (
        <div className="mb-6 rounded-xl border border-[#b8860b]/40 bg-gradient-to-br from-[rgba(184,134,11,0.08)] to-white p-5 flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#b8860b] flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#1d1d1f] font-semibold text-sm">Upgrade to browse the marketplace</p>
            <p className="text-[#6e6e73] text-xs mt-1">Your deals marked as marketplace-visible are already visible to paid members. Upgrade to Personal or Team to browse all listings.</p>
          </div>
          <a href="/billing" className="flex-shrink-0 px-4 py-2 rounded-lg bg-[#b8860b] text-white font-semibold text-xs hover:opacity-90 transition-opacity">Upgrade</a>
        </div>
      )}

      <div className={isFreePlan ? 'relative' : ''}>
        {isFreePlan && (
          <div className="absolute inset-0 z-10 backdrop-blur-sm bg-white/30 rounded-xl flex items-center justify-center pointer-events-none" />
        )}
        <div className={isFreePlan ? 'pointer-events-none select-none' : ''}>
          <div className="flex gap-2 flex-wrap mb-6">
            {['All', ...types].map((t) => (
              <button key={t} onClick={() => !isFreePlan && setFilter(t)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === t ? 'bg-[#b8860b] text-white' : 'bg-[rgba(0,0,0,0.06)] text-[#6e6e73] border border-[rgba(0,0,0,0.08)] hover:text-[#1d1d1f]'}`}>
                {t}
              </button>
            ))}
          </div>
          {loading ? (
            <Card className="text-center py-16 text-[#6e6e73] font-mono text-xs">Loading marketplace…</Card>
          ) : error ? (
            <Card className="text-center py-16 text-red-400 text-sm">{error}</Card>
          ) : filtered.length === 0 ? (
            <Card className="text-center py-16">
              <Globe className="w-10 h-10 mx-auto text-[#6e6e73]" />
              <p className="text-[#1d1d1f] font-semibold mt-4">No deals on the marketplace yet</p>
              <p className="text-[#6e6e73] text-sm mt-2">Add deals and mark them as marketplace-visible to be the first to share.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((d) => (
                <Card key={d.id} className="overflow-hidden hover:border-[rgba(0,0,0,0.12)] transition-colors group">
                  <div className="relative h-40 bg-[rgba(0,0,0,0.06)] flex items-center justify-center">
                    {(() => {
                      const src = d.photoUrl || d.photo_url || (Array.isArray(d.photos) && d.photos[0]) || null;
                      return src
                        ? <img src={src} alt={d.addr} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        : <Building2 className="w-12 h-12 text-[#6e6e73]" />;
                    })()}
                    <div className="absolute top-3 left-3"><StatusBadge status={d.status} /></div>
                  </div>
                  <div className="p-4">
                    <p className="text-[#1d1d1f] font-semibold text-sm truncate">{d.addr}</p>
                    <p className="text-[#6e6e73] text-xs mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{[d.city, d.state].filter(Boolean).join(', ')} · {d.type}</p>
                    <div className="flex items-center gap-3 text-[#6e6e73] text-xs mt-2">
                      {d.beds > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{d.beds}</span>}
                      {d.baths > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{d.baths}</span>}
                      {d.sqft > 0 && <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{Number(d.sqft).toLocaleString()} sqft</span>}
                    </div>
                    <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                      <div>
                        <p className="text-[#1d1d1f] font-bold text-lg">${Number(d.ask || 0).toLocaleString()}</p>
                        <p className="text-green-400 text-xs">ARV ${Number(d.arv || 0).toLocaleString()}</p>
                      </div>
                      {!isFreePlan && d.seller?.handle ? (
                        <a href={`/p/${d.seller.handle}/${d.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-[#b8860b] hover:opacity-90 text-white font-semibold px-3 py-2 rounded-lg text-xs transition-colors">
                          <Zap className="w-3 h-3" /> View
                        </a>
                      ) : null}
                    </div>
                    {!isFreePlan && d.seller && (
                      <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)] flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[rgba(0,0,0,0.08)] flex items-center justify-center text-[#1d1d1f] text-[10px] font-bold">{d.seller.initials || initialsOf(d.seller.name || d.seller.handle)}</div>
                        <div className="min-w-0">
                          <p className="text-[#3a3a3c] text-xs font-medium truncate">@{d.seller.handle}</p>
                          <p className="text-[#86868b] text-[10px] truncate">{d.seller.city || d.seller.name || ''}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      {node}
    </Layout>
  );
}
