// Public route /im/:dealId — buyer-facing Investment Memorandum flow.
// No wholesaler auth; uses its own SMS-OTP gate, then renders a full deal
// report whose sections are governed by the wholesaler's im_config.
//
// Talks directly to the Gold Bridge server (apps/server) at
// https://rei-code-dev.replit.app/api/deallink/im/... — separate from
// the relative-path im-api.js used by the legacy /deal/:slug flow.
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, ArrowLeft, ArrowRight, Building2, MapPin, Bed, Bath, Ruler, KeyRound, ShieldCheck, Hammer, BarChart3, Send } from 'lucide-react';

const IM_API_BASE = 'https://rei-code-dev.replit.app/api/deallink/im';
const BUYER_STORAGE_KEY = 'dl.im.buyer';

function loadBuyer() {
  try { return JSON.parse(localStorage.getItem(BUYER_STORAGE_KEY) || 'null'); } catch { return null; }
}
function saveBuyer(b) {
  try { localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(b)); } catch {}
}
function recordVisit(dealId) {
  try {
    const key = 'dl.im.viewed';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const at = Date.now();
    const filtered = arr.filter((v) => v.dealId !== dealId);
    filtered.unshift({ dealId, at });
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 50)));
  } catch {}
}
function recordOffer(o) {
  try {
    const key = 'dl.im.offers';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.unshift({ ...o, at: Date.now() });
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 100)));
  } catch {}
}

function fmtUsd(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n) { return Number.isFinite(n) ? `${Number(n).toFixed(1)}%` : '0.0%'; }
function fmtSignedUsd(n) { return n < 0 ? `-${fmtUsd(Math.abs(n))}` : fmtUsd(n); }

// Mirror of deriveMetrics() in DealEditor.jsx so the buyer-facing report
// shows the exact same headline numbers the wholesaler saw on save.
function deriveMetrics(s) {
  if (!s) return null;
  const purchasePrice = Number(s.purchasePrice) || 0;
  const arv           = Number(s.arv) || 0;
  const downPct       = Number(s.downPct) || 0;
  const rate          = Number(s.rate) || 0;
  const term          = Number(s.term) || 30;
  const closingPct    = Number(s.closingPct) || 0;
  const taxesYr       = Number(s.taxesYr) || 0;
  const insYr         = Number(s.insYr) || 0;
  const monthlyRent   = Number(s.monthlyRent) || 0;
  const vacancyPct    = Number(s.vacancyPct) || 0;
  const mgmtPct       = Number(s.mgmtPct) || 0;
  const maintPct      = Number(s.maintPct) || 0;
  const capexPct      = Number(s.capexPct) || 0;
  const holdingMo     = Number(s.holdingMo) || 0;
  const items         = Array.isArray(s.items) ? s.items : [];

  const rehab = Number(s.rehabOverride) || items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);
  const closingBuy = purchasePrice * (closingPct / 100);
  const holdingTotal = (taxesYr / 12 + insYr / 12) * holdingMo;
  const loan = purchasePrice * (1 - downPct / 100);
  const r = rate / 100 / 12;
  const n = term * 12;
  const piti = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : (n > 0 ? loan / n : 0);
  const totalCash = purchasePrice * (downPct / 100) + rehab + closingBuy;

  const grossYr = monthlyRent * 12;
  const opex = grossYr * (vacancyPct / 100) + grossYr * (mgmtPct / 100)
             + grossYr * (maintPct / 100) + grossYr * (capexPct / 100)
             + taxesYr + insYr;
  const noi = grossYr - opex;
  const cashFlowYr = noi - piti * 12;
  const monthlyCashFlow = cashFlowYr / 12;
  const coc = totalCash > 0 ? (cashFlowYr / totalCash) * 100 : 0;
  const cap = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

  const sellingCosts = arv * 0.08;
  const flipNetProfit = arv - purchasePrice - rehab - closingBuy - holdingTotal - sellingCosts - piti * holdingMo;
  const flipInvestment = totalCash + holdingTotal + piti * holdingMo;
  const flipROI = flipInvestment > 0 ? (flipNetProfit / flipInvestment) * 100 : 0;
  const flipAnnROI = (flipROI * 12) / Math.max(holdingMo, 1);

  return {
    purchasePrice, arv, rehab, closingBuy, holdingTotal, loan, piti, totalCash,
    noi, monthlyCashFlow, coc, cap,
    flipNetProfit, flipInvestment, flipROI, flipAnnROI,
    items,
  };
}

function pickFirstAnalysis(state) {
  if (!state) return null;
  if (Array.isArray(state)) {
    const sorted = [...state].filter(Boolean).sort((a, b) => {
      return new Date(b?.savedAt || 0).getTime() - new Date(a?.savedAt || 0).getTime();
    });
    return sorted[0] || null;
  }
  return state;
}

export default function IMDeal() {
  const { dealId } = useParams();
  const navigate = useNavigate();

  // 'preview' | 'name' | 'phone' | 'verify' | 'report'
  const initialBuyer = loadBuyer();
  const [step, setStep] = React.useState(initialBuyer?.id ? 'report' : 'preview');

  const [deal, setDeal] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [name, setName] = React.useState(initialBuyer?.name || '');
  const [phone, setPhone] = React.useState(initialBuyer?.phone || '');
  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [flash, setFlash] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${IM_API_BASE}/${encodeURIComponent(dealId)}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const msg = res.status === 404 ? 'This deal is no longer available.' : `Could not load deal (${res.status})`;
          throw new Error(msg);
        }
        const data = await res.json();
        if (cancelled) return;
        const d = data.deal || data;
        setDeal(d);
        if (d?.addr) document.title = `${d.addr} · DealLink`;
        if (initialBuyer?.id) recordVisit(dealId);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Failed to load deal');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  function showFlash(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2400);
  }

  async function sendOtp() {
    setSubmitting(true);
    try {
      const res = await fetch(`${IM_API_BASE}/${encodeURIComponent(dealId)}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to send code (${res.status})`);
      }
      setStep('verify');
    } catch (e) {
      showFlash(e?.message || 'Could not send code');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    setSubmitting(true);
    try {
      const res = await fetch(`${IM_API_BASE}/${encodeURIComponent(dealId)}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Invalid code (${res.status})`);
      }
      const data = await res.json();
      const buyerId = data.buyer_id || data.buyerId || data.id || `buyer-${Date.now()}`;
      const buyer = { id: buyerId, name, phone, verifiedAt: Date.now() };
      saveBuyer(buyer);
      recordVisit(dealId);
      setStep('report');
    } catch (e) {
      showFlash(e?.message || 'Code did not verify');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <DealLinkShell><div className="py-32 text-center text-slate-500 text-sm">Loading deal…</div></DealLinkShell>;
  }
  if (error) {
    return (
      <DealLinkShell>
        <div className="py-24 text-center max-w-md mx-auto">
          <div className="inline-flex w-12 h-12 rounded-full bg-slate-800 items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-slate-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Deal unavailable</h1>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </DealLinkShell>
    );
  }
  if (!deal) return <DealLinkShell><div className="py-32 text-center text-slate-500 text-sm">No deal</div></DealLinkShell>;

  return (
    <DealLinkShell>
      {step === 'preview' && (
        <Step0Preview deal={deal} onUnlock={() => setStep('name')} />
      )}
      {step === 'name' && (
        <Step1Name
          deal={deal}
          value={name}
          onChange={setName}
          onNext={() => setStep('phone')}
        />
      )}
      {step === 'phone' && (
        <Step2Phone
          deal={deal}
          value={phone}
          onChange={setPhone}
          onBack={() => setStep('name')}
          onNext={sendOtp}
          submitting={submitting}
        />
      )}
      {step === 'verify' && (
        <Step3Verify
          deal={deal}
          value={code}
          onChange={setCode}
          onBack={() => setStep('phone')}
          onVerify={verifyOtp}
          submitting={submitting}
        />
      )}
      {step === 'report' && (
        <FullDealReport
          deal={deal}
          dealId={dealId}
          buyer={loadBuyer()}
          onDashboard={() => navigate('/buyer/dashboard')}
        />
      )}

      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-red-500/40 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg">
          {flash}
        </div>
      )}
    </DealLinkShell>
  );
}

// ─── Shell + reusable bits ───────────────────────────────────────────────
function DealLinkShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-center">
        <div className="text-amber-400 font-bold tracking-wide text-sm">DealLink</div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function PropertyPill({ deal }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/60 text-xs text-slate-300 font-mono">
      <MapPin className="w-3.5 h-3.5 text-amber-400" />
      <span className="truncate max-w-[16rem]">{deal.addr || 'Property'}</span>
      <span className="text-slate-500">—</span>
      <span className="text-amber-300 font-semibold">{fmtUsd(deal.ask)} asking</span>
    </div>
  );
}

function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
        <span>Step {step} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Step 0: gated preview ───────────────────────────────────────────────
function Step0Preview({ deal, onUnlock }) {
  const wholesaler = deal.wholesaler || {};
  return (
    <div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
          {deal.photo_url ? (
            <img src={deal.photo_url} alt="" className="w-full h-full object-cover blur-sm opacity-60" />
          ) : (
            <Building2 className="w-16 h-16 text-slate-700" />
          )}
          <div className="absolute inset-0 bg-slate-950/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock className="w-10 h-10 text-amber-400/80" />
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{deal.addr || 'Off-market property'}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {[deal.city, deal.state].filter(Boolean).join(', ')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Asking"   value={fmtUsd(deal.ask)} accent="text-amber-400" />
            <Stat label="ARV"      value={fmtUsd(deal.arv)} />
            <Stat label="Type"     value={deal.type || '—'} />
            <Stat label="Beds"     value={deal.beds ?? '—'} />
            <Stat label="Baths"    value={deal.baths ?? '—'} />
            <Stat label="Sqft"     value={deal.sqft ? Number(deal.sqft).toLocaleString() : '—'} />
          </div>

          <button
            type="button"
            onClick={onUnlock}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
          >
            <Lock className="w-4 h-4" /> View full analysis
          </button>

          <p className="text-center text-xs text-slate-500">
            This deal is shared by{' '}
            <span className="text-amber-300 font-semibold">@{wholesaler.handle || 'wholesaler'}</span>{' '}
            on DealLink
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-base font-semibold mt-1 ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}

// ─── Steps 1–3 ───────────────────────────────────────────────────────────
function GateLayout({ deal, step, total, children }) {
  return (
    <div>
      <div className="flex justify-center mb-4"><PropertyPill deal={deal} /></div>
      <ProgressBar step={step} total={total} />
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        {children}
      </div>
    </div>
  );
}

function Step1Name({ deal, value, onChange, onNext }) {
  const can = (value || '').trim().length >= 2;
  return (
    <GateLayout deal={deal} step={1} total={3}>
      <h2 className="text-xl font-semibold text-white mb-1">What's your name?</h2>
      <p className="text-sm text-slate-400 mb-5">We'll share it with the wholesaler if you make an offer.</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && can) onNext(); }}
        placeholder="Jane Doe"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
      />
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!can}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </GateLayout>
  );
}

function Step2Phone({ deal, value, onChange, onBack, onNext, submitting }) {
  const digits = (value || '').replace(/\D/g, '');
  const can = digits.length === 10;
  return (
    <GateLayout deal={deal} step={2} total={3}>
      <h2 className="text-xl font-semibold text-white mb-1">What's your number?</h2>
      <p className="text-sm text-slate-400 mb-5">We'll text you a 6-digit code to verify.</p>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 font-mono text-sm">+1</span>
        <input
          autoFocus
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && can && !submitting) onNext(); }}
          placeholder="(555) 123-4567"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-400"
        />
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!can || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </GateLayout>
  );
}

function Step3Verify({ deal, value, onChange, onBack, onVerify, submitting }) {
  const clean = (value || '').replace(/\D/g, '').slice(0, 6);
  const can = clean.length === 6;
  return (
    <GateLayout deal={deal} step={3} total={3}>
      <h2 className="text-xl font-semibold text-white mb-1">Enter your code</h2>
      <p className="text-sm text-slate-400 mb-5">Check your texts — it should arrive in a few seconds.</p>

      <input
        autoFocus
        inputMode="numeric"
        value={clean}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter' && can && !submitting) onVerify(); }}
        placeholder="000000"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-2xl font-mono tracking-[0.5em] text-center text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
        maxLength={6}
      />

      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={!can || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Verifying…' : <>Verify <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </GateLayout>
  );
}

// ─── Full deal report (after verification) ───────────────────────────────
function FullDealReport({ deal, dealId, buyer, onDashboard }) {
  const cfg = deal.im_config || deal.imConfig || { show_photos: true, show_analyzer: true, show_rehab: true };
  const showPhotos   = cfg.show_photos   !== false;
  const showAnalyzer = cfg.show_analyzer !== false;
  const showRehab    = cfg.show_rehab    !== false;

  const wholesaler = deal.wholesaler || {};
  const spread = (deal.arv != null && deal.ask != null) ? Number(deal.arv) - Number(deal.ask) : null;
  const photos = Array.isArray(deal.photos) && deal.photos.length
    ? deal.photos
    : (deal.photo_url ? [deal.photo_url] : []);

  const analyzer = pickFirstAnalysis(deal.analyzerState || deal.analyzer_state);
  const metrics = deriveMetrics(analyzer);
  const strategy = analyzer?.strategy || 'rental';
  const isFlip = strategy === 'flip';

  const rehabItems = (metrics?.items || []).filter((i) => i && (i.category || i.description || Number(i.cost)));
  const rehabTotal = rehabItems.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);

  const [offerOpen, setOfferOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{deal.addr || 'Property'}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
              <MapPin className="w-3.5 h-3.5" />
              <span>{[deal.city, deal.state].filter(Boolean).join(', ') || '—'}</span>
              {deal.status && <StatusBadge status={deal.status} />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <PriceCell label="Asking" value={fmtUsd(deal.ask)} accent="text-amber-400" />
            <PriceCell label="ARV"    value={fmtUsd(deal.arv)} />
            <PriceCell label="Spread" value={spread != null ? fmtSignedUsd(spread) : '—'} accent={spread > 0 ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
        </div>
      </div>

      {/* Photos */}
      {showPhotos && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Photos</h3>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((src, i) => (
                <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                  <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="aspect-[16/9] rounded-lg border border-slate-800 bg-slate-900/60 flex items-center justify-center text-slate-600">
              <Building2 className="w-12 h-12" />
            </div>
          )}
        </section>
      )}

      {/* Specs grid */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Property specs</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SpecCard icon={Building2} label="Type"      value={deal.type || '—'} />
          <SpecCard icon={Bed}       label="Beds"      value={deal.beds ?? '—'} />
          <SpecCard icon={Bath}      label="Baths"     value={deal.baths ?? '—'} />
          <SpecCard icon={Ruler}     label="Sqft"      value={deal.sqft ? Number(deal.sqft).toLocaleString() : '—'} />
          <SpecCard icon={ShieldCheck} label="Occupancy" value={deal.occ || '—'} />
          <SpecCard icon={KeyRound}  label="Access"    value={deal.access || '—'} />
        </div>
      </section>

      {/* Analyzer */}
      {showAnalyzer && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" /> Deal analysis
          </h3>
          {metrics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(isFlip
                  ? [
                      { label: 'Net Profit',        value: fmtSignedUsd(metrics.flipNetProfit), tone: metrics.flipNetProfit >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Total ROI',         value: fmtPct(metrics.flipROI),             tone: metrics.flipROI >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Annualized ROI',    value: fmtPct(metrics.flipAnnROI),          tone: metrics.flipAnnROI >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Total Investment',  value: fmtUsd(metrics.flipInvestment),      tone: 'text-white' },
                    ]
                  : [
                      { label: 'Monthly Cash Flow',     value: fmtSignedUsd(metrics.monthlyCashFlow), tone: metrics.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Cash-on-Cash Return',   value: fmtPct(metrics.coc),                   tone: metrics.coc >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Cap Rate',              value: fmtPct(metrics.cap),                   tone: metrics.cap >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Annual NOI',            value: fmtSignedUsd(metrics.noi),             tone: metrics.noi >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                    ]
                ).map((k) => (
                  <div key={k.label} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">{k.label}</p>
                    <p className={`text-xl font-semibold mt-1 ${k.tone}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 divide-y divide-slate-800">
                <h4 className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Investment summary</h4>
                {[
                  { label: 'Purchase Price',      value: fmtUsd(metrics.purchasePrice) },
                  { label: 'Rehab Costs',         value: fmtUsd(metrics.rehab) },
                  { label: 'Closing Costs',       value: fmtUsd(metrics.closingBuy) },
                  { label: 'Total Cash Invested', value: fmtUsd(metrics.totalCash), strong: true },
                  { label: 'Loan Amount',         value: fmtUsd(metrics.loan) },
                  { label: 'Monthly Mortgage',    value: fmtUsd(metrics.piti) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className={`text-sm ${row.strong ? 'text-white font-semibold' : 'text-slate-300'}`}>{row.label}</span>
                    <span className={`text-sm font-mono ${row.strong ? 'text-amber-300 font-semibold' : 'text-white'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">The wholesaler hasn't shared a saved analysis for this deal.</p>
          )}
        </section>
      )}

      {/* Rehab line items */}
      {showRehab && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-2">
            <Hammer className="w-3.5 h-3.5 text-amber-400" /> Rehab estimate
          </h3>
          {rehabItems.length > 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 bg-slate-900/60 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <div className="col-span-4">Category</div>
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Cost</div>
              </div>
              <div className="divide-y divide-slate-800">
                {rehabItems.map((i, idx) => (
                  <div key={i.id || idx} className="grid grid-cols-12 px-4 py-2.5 text-sm">
                    <div className="col-span-4 text-slate-300">{i.category || '—'}</div>
                    <div className="col-span-6 text-slate-400">{i.description || '—'}</div>
                    <div className="col-span-2 text-right font-mono text-white">{fmtUsd(Number(i.cost) || 0)}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-900/60 border-t border-slate-800">
                <div className="col-span-10 text-sm text-white font-semibold">Total</div>
                <div className="col-span-2 text-right text-sm font-mono text-amber-300 font-semibold">{fmtUsd(rehabTotal)}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No rehab line items provided.</p>
          )}
        </section>
      )}

      {/* Wholesaler contact */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-300 inline-flex items-center justify-center font-bold border border-amber-400/30">
          {(wholesaler.initials || (wholesaler.name || wholesaler.handle || '?').slice(0, 2)).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold truncate">@{wholesaler.handle || 'wholesaler'}</p>
          {wholesaler.name && <p className="text-sm text-slate-400 truncate">{wholesaler.name}</p>}
        </div>
      </section>

      {/* CTAs */}
      <section className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => setOfferOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
        >
          <Send className="w-4 h-4" /> Make an offer
        </button>
        <button
          type="button"
          onClick={onDashboard}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-400 hover:text-amber-300"
        >
          Go to my dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </section>

      {offerOpen && (
        <OfferModal
          deal={deal}
          dealId={dealId}
          buyer={buyer}
          onClose={() => setOfferOpen(false)}
        />
      )}

      <footer className="text-center text-[11px] text-slate-500 py-6">
        Powered by DealLink
      </footer>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    'New':            'bg-amber-400/15 text-amber-300 border-amber-400/30',
    'Marketed':       'bg-blue-400/15 text-blue-300 border-blue-400/30',
    'Under Contract': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    'Closed':         'bg-slate-600/30 text-slate-300 border-slate-600/40',
    'Dead':           'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${map[status] || 'bg-slate-700 text-slate-200 border-slate-600'}`}>
      {status}
    </span>
  );
}

function PriceCell({ label, value, accent }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-sm font-semibold font-mono ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}

function SpecCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-md border border-slate-800 bg-slate-900/60 flex items-center justify-center text-amber-400">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Offer modal ─────────────────────────────────────────────────────────
function OfferModal({ deal, dealId, buyer, onClose }) {
  const [amount, setAmount] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [buyerType, setBuyerType] = React.useState('Cash Buyer');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const body = {
        buyer_id: buyer?.id || null,
        amount: Number(amount) || 0,
        notes: notes || '',
        buyer_type: buyerType,
      };
      const res = await fetch(`${IM_API_BASE}/${encodeURIComponent(dealId)}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to submit offer (${res.status})`);
      }
      recordOffer({ dealId, addr: deal.addr, ...body });
      setSent(true);
    } catch (e) {
      setError(e?.message || 'Could not submit offer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-white font-bold text-lg mb-1">Make an offer</h2>
        <p className="text-xs text-slate-400 mb-4 truncate">{deal.addr}</p>

        {sent ? (
          <div className="text-center py-6">
            <div className="inline-flex w-12 h-12 rounded-full bg-emerald-500/20 items-center justify-center mb-3">
              <ShieldCheck className="w-6 h-6 text-emerald-300" />
            </div>
            <p className="text-white font-semibold mb-1">Offer sent</p>
            <p className="text-sm text-slate-400 mb-5">The wholesaler will reach out shortly.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-slate-400 text-xs block mb-1">Offer amount ($)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Buyer type</label>
              <select
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                <option>Cash Buyer</option>
                <option>Hard Money</option>
                <option>Conventional</option>
                <option>Owner Occupant</option>
                <option>JV / Partner</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Closing timeline, contingencies, anything else…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 min-h-[80px]"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !amount}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50 text-sm"
              >
                {submitting ? 'Sending…' : <>Submit offer <Send className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
