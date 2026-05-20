// Public route /buyer/dashboard — simplified dashboard for verified IM
// buyers. Reads entirely from localStorage (the same store that
// IMDeal.jsx writes to). No authenticated API calls — this page must
// never redirect to /login.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, ShieldCheck, Building2, ArrowRight, ListChecks } from 'lucide-react';

const BUYER_STORAGE_KEY = 'dl.im.buyer';

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function fmtUsd(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtRelative(ts) {
  if (!ts) return '';
  const ms = Date.now() - Number(ts);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  return new Date(Number(ts)).toLocaleDateString();
}

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const buyer = loadJson(BUYER_STORAGE_KEY, null);

  const sharedDeals = loadJson('dl.im.viewed', []);
  const offers = loadJson('dl.im.offers', []);

  if (!buyer?.id) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-24">
          <div className="inline-flex w-12 h-12 rounded-full bg-[rgba(0,0,0,0.06)] items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5 text-[#86868b]" />
          </div>
          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">Buyer dashboard</h1>
          <p className="text-sm text-[#6e6e73] mb-6">
            Start by clicking an REI Flywheel link from a wholesaler.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-[#b8860b] text-white font-semibold hover:opacity-90"
          >
            Back to REI Flywheel
          </button>
        </div>
      </Shell>
    );
  }

  const displayName = buyer.name || 'there';

  const bestSpread = sharedDeals.reduce((max, d) => {
    const ask = Number(d.ask ?? d.asking ?? 0);
    const arv = Number(d.arv ?? 0);
    const spread = arv - ask;
    return Number.isFinite(spread) && spread > max ? spread : max;
  }, 0);

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-[#b8860b] font-semibold">Buyer dashboard</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f] mt-1">Welcome, {displayName}</h1>
        <p className="text-sm text-[#6e6e73] mt-1">Your shared deals and submitted offers in one place.</p>
      </header>

      {/* Stats row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard label="Deals shared with me" value={sharedDeals.length} icon={Building2} />
        <StatCard label="Offers sent"          value={offers.length}      icon={Send} />
        <StatCard label="Best spread"          value={bestSpread > 0 ? fmtUsd(bestSpread) : '—'} icon={ListChecks} accent="text-[#b8860b]" />
      </section>

      {/* Shared deals */}
      <section className="mb-8">
        <h2 className="text-[#1d1d1f] font-semibold text-sm mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#b8860b]" /> Deals shared with me
        </h2>
        {sharedDeals.length === 0 ? (
          <Empty body="No deals shared with you yet. Ask a wholesaler for their REI Flywheel link." />
        ) : (
          <div className="space-y-2">
            {sharedDeals.map((d, i) => {
              const id = d.dealId || d.deal_id || d.id;
              const addr = d.addr || d.address || '—';
              return (
                <Link
                  key={id || i}
                  to={id ? `/im/${id}` : '#'}
                  className="flex items-center gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3 hover:border-[#b8860b]/40"
                >
                  <div className="w-9 h-9 rounded-md border border-[rgba(0,0,0,0.08)] bg-white/60 flex items-center justify-center text-[#b8860b]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#1d1d1f] font-medium truncate">{addr}</p>
                    <p className="text-xs text-[#86868b] font-mono mt-0.5">
                      {d.ask != null && <>Asking {fmtUsd(d.ask)} · </>}
                      {fmtRelative(d.at)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#86868b]" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* My offers */}
      <section className="mb-8">
        <h2 className="text-[#1d1d1f] font-semibold text-sm mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-[#b8860b]" /> My offers
        </h2>
        {offers.length === 0 ? (
          <Empty body="You haven't sent any offers yet." />
        ) : (
          <div className="space-y-2">
            {offers.map((o, i) => (
              <div
                key={o.id || i}
                className="flex items-center gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#1d1d1f] font-medium truncate">{o.addr || o.deal_addr || `Deal ${o.dealId || o.deal_id || ''}`}</p>
                  <p className="text-xs text-[#86868b] font-mono mt-0.5">
                    Offer {fmtUsd(o.amount)} · {o.buyer_type || o.buyerType || 'Buyer'} · {fmtRelative(o.at || o.created_at)}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[#b8860b]/30 text-[#b8860b] bg-[rgba(184,134,11,0.10)]">
                  Sent
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Wholesaler unlock */}
      <section className="rounded-xl border border-[#b8860b]/30 bg-[#b8860b]/[0.06] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#b8860b] mt-0.5" />
          <div>
            <p className="text-[#1d1d1f] font-semibold">Are you a wholesaler?</p>
            <p className="text-sm text-[#3a3a3c]">Unlock the full REI Flywheel toolkit — list deals, build a buyer network, share IMs.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#b8860b] text-white font-semibold hover:opacity-90"
        >
          Yes, unlock <ArrowRight className="w-4 h-4" />
        </button>
      </section>

      <footer className="text-center text-[11px] text-[#86868b] py-8">
        Powered by REI Flywheel
      </footer>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]/60 flex items-center justify-center">
        <div className="text-[#b8860b] font-bold tracking-wide text-sm">REI Flywheel</div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/60 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-md border border-[rgba(0,0,0,0.08)] bg-white/60 flex items-center justify-center text-[#b8860b]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${accent || 'text-[#1d1d1f]'}`}>{value}</p>
      </div>
    </div>
  );
}

function Empty({ body }) {
  return (
    <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.08)] bg-white/40 p-6 text-center">
      <p className="text-sm text-[#6e6e73]">{body}</p>
    </div>
  );
}
