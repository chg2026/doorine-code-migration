// Buyer-facing Investment Memorandum. Read-only — every visibility
// decision happens server-side; this component only renders what was
// returned. Do NOT add any field that isn't already in the props.
import React from 'react';
import { Building2, MapPin, Bed, Bath, Ruler, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

function fmtUsd(n) {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-[#86868b]">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent || 'text-[#1d1d1f]'}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    'New':            'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[rgba(184,134,11,0.30)]',
    'Marketed':       'bg-blue-400/15 text-blue-300 border-blue-400/30',
    'Under Contract': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status] || 'bg-[rgba(0,0,0,0.08)] text-[#1d1d1f] border-[rgba(0,0,0,0.08)]'}`}>
      {status}
    </span>
  );
}

export default function IMPage({ deal, buyer, onUnlockWholesaler }) {
  const spread = (deal.arv != null && deal.ask != null) ? Number(deal.arv) - Number(deal.ask) : null;
  const t = deal.toggles || {};
  const showAnalysis = t.repair;

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      {/* Top nav */}
      <header className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
        <Link to="/buyer" className="text-[#6e6e73] hover:text-[#b8860b] inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="w-4 h-4" /> My deals
        </Link>
        <div className="text-[#b8860b] font-bold tracking-wide text-sm">REI Flywheel</div>
        <div className="text-xs text-[#6e6e73] truncate max-w-[40%]">{buyer?.name}</div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="aspect-[16/9] sm:aspect-[21/9] bg-gradient-to-br from-[#f5f5f7] to-white overflow-hidden">
          {deal.photo_url ? (
            <img src={deal.photo_url} alt={deal.addr} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#86868b]">
              <Building2 className="w-20 h-20" />
            </div>
          )}
        </div>
        <div className="absolute top-3 left-3"><StatusBadge status={deal.status} /></div>
        <div className="absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-[#3a3a3c]/70 bg-black/40 backdrop-blur px-2 py-0.5 rounded">
          Powered by REI Flywheel
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f]">{deal.addr}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6e6e73]">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {[deal.city, deal.state].filter(Boolean).join(', ')}</span>
            {deal.type && <span>· {deal.type}</span>}
            {deal.beds != null && <span className="inline-flex items-center gap-1"><Bed className="w-3.5 h-3.5" /> {deal.beds}</span>}
            {deal.baths != null && <span className="inline-flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {deal.baths}</span>}
            {deal.sqft != null && <span className="inline-flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> {Number(deal.sqft).toLocaleString()} sqft</span>}
          </div>
          {(deal.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {deal.tags.map((tag) => (
                <span key={tag} className="text-[10px] uppercase tracking-wider text-[#3a3a3c] bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] px-2 py-0.5 rounded">{tag}</span>
              ))}
            </div>
          )}
        </header>

        {/* Stats grid */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {t.asking && <StatCard label="Asking" value={fmtUsd(deal.ask)} accent="text-[#b8860b]" />}
          {t.arv    && <StatCard label="ARV"    value={fmtUsd(deal.arv)} />}
          {t.asking && t.arv && spread != null && (
            <StatCard label="Spread" value={fmtUsd(spread)} accent={spread > 0 ? 'text-emerald-400' : 'text-red-400'} />
          )}
          {deal.sqft   != null && <StatCard label="Sqft"      value={Number(deal.sqft).toLocaleString()} />}
          {deal.access         && <StatCard label="Access"    value={deal.access} />}
          {deal.occ            && <StatCard label="Occupancy" value={deal.occ} />}
        </section>

        {/* Analysis box */}
        {showAnalysis && (
          <section className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wider mb-3">Deal analysis</h2>
            <dl className="divide-y divide-[rgba(0,0,0,0.08)] text-sm">
              <Row label="ARV"            value={t.arv ? fmtUsd(deal.arv) : '—'} />
              <Row label="Repair estimate (est.)" value="—" hint="V2" />
              <Row label="Holding / closing (est.)" value="—" hint="V2" />
              <Row label="Investor profit (70% rule)" value="—" hint="V2" />
              {t.mao && <Row label="MAO (max allowable offer)" value="—" hint="V2" accent="text-[#b8860b]" />}
            </dl>
            <p className="text-[11px] text-[#86868b] mt-3">
              Estimates above are placeholders for V1. Actual repair / MAO figures land in the next module.
            </p>
          </section>
        )}

        {/* Description */}
        {deal.description && (
          <section className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">About this deal</h2>
            <p className="text-sm text-[#3a3a3c] whitespace-pre-line leading-relaxed">{deal.description}</p>
          </section>
        )}

        {/* Wholesaler strip */}
        {deal.wholesaler && (
          <section className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[rgba(184,134,11,0.10)] text-[#b8860b] inline-flex items-center justify-center font-bold border border-[rgba(184,134,11,0.30)]">
                {deal.wholesaler.initials || (deal.wholesaler.name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[#1d1d1f] font-semibold truncate">{deal.wholesaler.name}</div>
                <div className="text-xs text-[#6e6e73] truncate">@{deal.wholesaler.handle} {deal.wholesaler.city ? `· ${deal.wholesaler.city}` : ''}</div>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#b8860b] text-white text-sm font-semibold hover:bg-[#9a7209]"
              title="Coming soon"
              disabled
            >
              Submit offer
            </button>
          </section>
        )}

        {/* Wholesaler unlock prompt */}
        {buyer && !buyer.wholesaler_enabled && (
          <section className="bg-[rgba(184,134,11,0.10)] border border-[rgba(184,134,11,0.30)] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#b8860b] mt-0.5" />
              <div>
                <div className="text-[#1d1d1f] font-semibold">Are you a wholesaler too?</div>
                <div className="text-sm text-[#3a3a3c]">Unlock free tools to list your own deals — same account.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onUnlockWholesaler}
              className="shrink-0 px-3 py-1.5 rounded-md bg-[#b8860b] text-white text-sm font-semibold hover:bg-[#9a7209]"
            >
              Yes, unlock
            </button>
          </section>
        )}

        <footer className="text-center text-[11px] text-[#86868b] py-6">
          Powered by REI Flywheel · <a className="underline hover:text-[#b8860b]" href="#">Terms of Service</a>
        </footer>
      </main>
    </div>
  );
}

function Row({ label, value, hint, accent }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-[#6e6e73]">
        {label}
        {hint && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#86868b]">{hint}</span>}
      </dt>
      <dd className={`font-semibold ${accent || 'text-[#1d1d1f]'}`}>{value}</dd>
    </div>
  );
}
