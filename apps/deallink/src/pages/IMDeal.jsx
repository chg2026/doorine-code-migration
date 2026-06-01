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
import { supabase } from '../lib/supabase.js';

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

function deriveMetricsV2(s) {
  if (!s || !s.summary) return null;
  const sm = s.summary;
  const parseVal = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9.\-]/g, '')) || 0;
  };
  const isBrrrr = s.strategy === 'brrrr';
  if (isBrrrr) {
    const monthlyCashFlow = parseVal(sm.brrrrCfmo);
    const cap = parseVal(sm.brrrrCapC);
    return { monthlyCashFlow, cap, noi: 0, coc: 0, purchasePrice: 0, arv: 0, rehab: 0,
      closingBuy: 0, totalCash: parseVal(sm.brrrrCapitalInvested), loan: 0, piti: 0,
      holdingTotal: 0, items: [] };
  } else {
    const flipNetProfit = parseVal(sm.flipProfit);
    return { flipNetProfit, flipROI: 0, flipAnnROI: 0, flipInvestment: 0, purchasePrice: 0,
      arv: 0, rehab: 0, closingBuy: 0, totalCash: 0, loan: 0, piti: 0,
      holdingTotal: 0, noi: 0, monthlyCashFlow: 0, coc: 0, cap: 0, items: [] };
  }
}

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

  const initialFullName = (initialBuyer?.name || '').trim();
  const initialNameParts = initialFullName ? initialFullName.split(/\s+/) : [];
  const [firstName, setFirstName] = React.useState(initialBuyer?.first_name || initialNameParts[0] || '');
  const [lastName, setLastName] = React.useState(initialBuyer?.last_name || initialNameParts.slice(1).join(' ') || '');
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
        // Public IM endpoint returns { gated: true, preview: { addr, city, zip,
        // type, ask, arv, beds, baths, sqft, status } }. After buyer verifies
        // the server returns the full deal under `deal`. Read from whichever
        // is present, in that order.
        const d = data.preview || data.deal || data;
        setDeal(d);
        if (d?.addr) document.title = `${d.addr} · REI Flywheel`;
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
      // The user types 10 digits; the API expects E.164 (+1XXXXXXXXXX).
      // Normalize once here and persist back to state so verifyOtp sends
      // the same phone the server already keyed the code under.
      const formattedPhone = phone.startsWith('+1') ? phone : '+1' + phone.replace(/\D/g, '');
      setPhone(formattedPhone);
      const res = await fetch(`${IM_API_BASE}/${encodeURIComponent(dealId)}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: formattedPhone }),
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
      // Establish a real Supabase session so the buyer can navigate the app
      // (e.g. /buyer/dashboard) without being kicked back to /login.
      if (data?.session?.access_token) {
        try {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        } catch (sessionErr) {
          // eslint-disable-next-line no-console
          console.warn('[deallink] Failed to set Supabase session after OTP verify:', sessionErr);
        }
      }
      const buyerId = data.buyer_id || data.buyerId || data.id || `buyer-${Date.now()}`;
      const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const buyer = { id: buyerId, first_name: firstName, last_name: lastName, name: joinedName, phone, verifiedAt: Date.now() };
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
    return <DealLinkShell><div className="py-32 text-center text-[#86868b] text-sm">Loading deal…</div></DealLinkShell>;
  }
  if (error) {
    return (
      <DealLinkShell>
        <div className="py-24 text-center max-w-md mx-auto">
          <div className="inline-flex w-12 h-12 rounded-full bg-[rgba(0,0,0,0.06)] items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-[#86868b]" />
          </div>
          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">Deal unavailable</h1>
          <p className="text-sm text-[#6e6e73]">{error}</p>
        </div>
      </DealLinkShell>
    );
  }
  if (!deal) return <DealLinkShell><div className="py-32 text-center text-[#86868b] text-sm">No deal</div></DealLinkShell>;

  return (
    <DealLinkShell>
      {step === 'preview' && (
        <Step0Preview deal={deal} onUnlock={() => setStep('name')} />
      )}
      {step === 'name' && (
        <Step1Name
          deal={deal}
          firstName={firstName}
          lastName={lastName}
          onChangeFirst={setFirstName}
          onChangeLast={setLastName}
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
        <>
          {deal?.wholesaler?.handle && (
            <a
              href={`/p/${deal.wholesaler.handle}`}
              className="inline-flex items-center gap-1 text-sm text-[#6e6e73] hover:text-[#1d1d1f] mb-4 block"
            >
              <ArrowLeft className="w-4 h-4" /> Back to profile
            </a>
          )}
          <FullDealReport
            deal={deal}
            dealId={dealId}
            buyer={loadBuyer()}
            onDashboard={() => navigate('/buyer/dashboard')}
          />
        </>
      )}

      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[rgba(0,0,0,0.06)] border border-red-500/40 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg">
          {flash}
        </div>
      )}
    </DealLinkShell>
  );
}

// ─── Shell + reusable bits ───────────────────────────────────────────────
function DealLinkShell({ children }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-center">
        <div className="text-[#b8860b] font-bold tracking-wide text-sm">REI Flywheel</div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
      <footer className="px-4 py-6 text-center">
        <a
          href="https://doorine.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#b8860b]/60 hover:text-[#b8860b] transition-colors"
        >
          Built on REI Flywheel
        </a>
      </footer>
    </div>
  );
}

function PropertyPill({ deal }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(0,0,0,0.08)] bg-white text-xs text-[#3a3a3c] font-mono">
      <MapPin className="w-3.5 h-3.5 text-[#b8860b]" />
      <span className="truncate max-w-[16rem]">{deal.addr || 'Property'}</span>
      <span className="text-[#86868b]">—</span>
      <span className="text-[#b8860b] font-semibold">{fmtUsd(deal.ask)} asking</span>
    </div>
  );
}

function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-[11px] text-[#86868b] mb-2">
        <span>Step {step} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
        <div className="h-full bg-[#b8860b] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Step 0: gated preview ───────────────────────────────────────────────
function Step0Preview({ deal, onUnlock }) {
  const wholesaler = deal.wholesaler || {};
  return (
    <div>
      {wholesaler.handle && (
        <a
          href={`/p/${wholesaler.handle}`}
          className="inline-flex items-center gap-1 text-sm text-[#6e6e73] hover:text-[#1d1d1f] mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </a>
      )}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden">
        <div className="aspect-[16/9] bg-gradient-to-br from-[#f5f5f7] to-white flex items-center justify-center relative">
          {(deal.photo_url || deal.photos?.[0]) ? (
            <img src={deal.photo_url || deal.photos[0]} alt="" className="w-full h-full object-cover blur-sm opacity-60" />
          ) : (
            <Building2 className="w-16 h-16 text-[#86868b]" />
          )}
          <div className="absolute inset-0 bg-[rgba(0,0,0,0.10)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock className="w-10 h-10 text-[#b8860b]/80" />
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">
              {[deal.addr, deal.city].filter(Boolean).join(', ') || '—'}
            </h1>
            <p className="text-sm text-[#6e6e73] mt-1">
              {[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Asking"   value={fmtUsd(deal.ask)} accent="text-[#b8860b]" />
            <Stat label="ARV"      value={fmtUsd(deal.arv)} />
            <Stat label="Type"     value={deal.type || '—'} />
            <Stat label="Beds"     value={deal.beds ?? '—'} />
            <Stat label="Baths"    value={deal.baths ?? '—'} />
            <Stat label="Sqft"     value={deal.sqft ? Number(deal.sqft).toLocaleString() : '—'} />
          </div>

          <button
            type="button"
            onClick={onUnlock}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209]"
          >
            <Lock className="w-4 h-4" /> View full analysis
          </button>

          {wholesaler?.handle && (
            <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 16, textAlign: 'center' }}>
              Shared by{' '}
              <a
                href={`https://doorine.com/r/${wholesaler.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                @{wholesaler.handle}
              </a>
              {' · '}
              <a
                href="https://reiflywheel.doorine.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--mute)', textDecoration: 'underline' }}
              >
                Join REI Flywheel
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
      <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
      <p className={`text-base font-semibold mt-1 ${accent || 'text-[#1d1d1f]'}`}>{value}</p>
    </div>
  );
}

// ─── Steps 1–3 ───────────────────────────────────────────────────────────
function GateLayout({ deal, step, total, children }) {
  return (
    <div>
      <div className="flex justify-center mb-4"><PropertyPill deal={deal} /></div>
      <ProgressBar step={step} total={total} />
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6">
        {children}
      </div>
    </div>
  );
}

function Step1Name({ deal, firstName, lastName, onChangeFirst, onChangeLast, onNext }) {
  const can = (firstName || '').trim().length >= 2;
  return (
    <GateLayout deal={deal} step={1} total={3}>
      <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">What's your name?</h2>
      <p className="text-sm text-[#6e6e73] mb-5">We'll share it with the wholesaler if you make an offer.</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={firstName}
          onChange={(e) => onChangeFirst(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && can) onNext(); }}
          placeholder="Jane"
          required
          className="flex-1 bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2.5 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]"
        />
        <input
          value={lastName}
          onChange={(e) => onChangeLast(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && can) onNext(); }}
          placeholder="Doe"
          className="flex-1 bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2.5 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]"
        />
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!can}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] disabled:opacity-50 disabled:cursor-not-allowed"
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
      <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">What's your number?</h2>
      <p className="text-sm text-[#6e6e73] mb-5">We'll text you a 6-digit code to verify.</p>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-3 py-2.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.03)] text-[#3a3a3c] font-mono text-sm">+1</span>
        <input
          autoFocus
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && can && !submitting) onNext(); }}
          placeholder="(555) 123-4567"
          className="flex-1 bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2.5 text-[#1d1d1f] placeholder-[#86868b] font-mono focus:outline-none focus:border-[#b8860b]"
        />
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!can || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] disabled:opacity-50 disabled:cursor-not-allowed"
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
      <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Enter your code</h2>
      <p className="text-sm text-[#6e6e73] mb-5">Check your texts — it should arrive in a few seconds.</p>

      <input
        autoFocus
        inputMode="numeric"
        value={clean}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter' && can && !submitting) onVerify(); }}
        placeholder="000000"
        className="w-full bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-3 text-2xl font-mono tracking-[0.5em] text-center text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]"
        maxLength={6}
      />

      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={!can || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Verifying…' : <>Verify <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </GateLayout>
  );
}

// ─── Full deal report (after verification) ───────────────────────────────
function FullDealReport({ deal, dealId, buyer, onDashboard }) {
  // The IM memo builder writes a nested shape (`cfg.sections.<key>` /
  // `cfg.fields.<key>`); the legacy renderer used flat `cfg.show_*` keys.
  // Support both so old and new memos both render correctly.
  const cfg = deal.im_config || deal.imConfig || {};
  const hasSections = cfg && typeof cfg.sections === 'object' && cfg.sections !== null;
  const sections = hasSections ? cfg.sections : {};
  const showPhotos   = cfg.show_photos   !== false && sections.photos          !== false;
  const showAnalyzer = cfg.show_analyzer !== false && sections.dealAnalysis    !== false;
  const showRehab    = cfg.show_rehab    !== false && sections.rehabBreakdown  !== false;

  const wholesaler = deal.wholesaler || {};
  const spread = (deal.arv != null && deal.ask != null) ? Number(deal.arv) - Number(deal.ask) : null;
  const photos = Array.isArray(deal.photos) && deal.photos.length
    ? deal.photos
    : (deal.photo_url ? [deal.photo_url] : []);

  const cfgAnalysis = cfg.latestAnalysis || null;
  const analyzer = cfgAnalysis || pickFirstAnalysis(deal.analyzerState || deal.analyzer_state);
  const metrics = analyzer?.v === 2 ? deriveMetricsV2(analyzer) : deriveMetrics(analyzer);
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
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f]">{deal.addr || 'Property'}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-[#6e6e73]">
              <MapPin className="w-3.5 h-3.5" />
              <span>{[deal.city, deal.state].filter(Boolean).join(', ') || '—'}</span>
              {deal.status && <StatusBadge status={deal.status} />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <PriceCell label="Asking" value={fmtUsd(deal.ask)} accent="text-[#b8860b]" />
            <PriceCell label="ARV"    value={fmtUsd(deal.arv)} />
            <PriceCell label="Spread" value={spread != null ? fmtSignedUsd(spread) : '—'} accent={spread > 0 ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
        </div>
      </div>

      {/* Photos — hidden entirely when none */}
      {showPhotos && photos.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white">
                <img
                  src={src}
                  alt={`Photo ${i + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Specs grid */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Property specs</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SpecCard icon={Building2} label="Type"      value={deal.type || '—'} />
          <SpecCard icon={Bed}       label="Beds"      value={deal.beds ?? '—'} />
          <SpecCard icon={Bath}      label="Baths"     value={deal.baths ?? '—'} />
          <SpecCard icon={Ruler}     label="Sqft"      value={deal.sqft ? Number(deal.sqft).toLocaleString() : '—'} />
          <SpecCard icon={ShieldCheck} label="Occupancy" value={deal.occ || '—'} />
          <SpecCard icon={KeyRound}  label="Access"    value={deal.access || '—'} />
        </div>
      </section>

      {/* Analyzer — rental / flip / etc. */}
      {showAnalyzer && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-[#b8860b]" /> Deal analysis
          </h3>
          {metrics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(isFlip
                  ? [
                      { label: 'Net Profit',        value: fmtSignedUsd(metrics.flipNetProfit), tone: metrics.flipNetProfit >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Total ROI',         value: fmtPct(metrics.flipROI),             tone: metrics.flipROI >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Annualized ROI',    value: fmtPct(metrics.flipAnnROI),          tone: metrics.flipAnnROI >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Total Investment',  value: fmtUsd(metrics.flipInvestment),      tone: 'text-[#1d1d1f]' },
                    ]
                  : [
                      { label: 'Monthly Cash Flow',     value: fmtSignedUsd(metrics.monthlyCashFlow), tone: metrics.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Cash-on-Cash Return',   value: fmtPct(metrics.coc),                   tone: metrics.coc >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Cap Rate',              value: fmtPct(metrics.cap),                   tone: metrics.cap >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                      { label: 'Annual NOI',            value: fmtSignedUsd(metrics.noi),             tone: metrics.noi >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                    ]
                ).map((k) => (
                  <div key={k.label} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <p className="text-[11px] uppercase tracking-wider text-[#86868b]">{k.label}</p>
                    <p className={`text-xl font-semibold mt-1 ${k.tone}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white divide-y divide-[rgba(0,0,0,0.08)]">
                <h4 className="px-4 py-2 text-[10px] uppercase tracking-wider text-[#86868b] font-semibold">Investment summary</h4>
                {[
                  { label: 'Purchase Price',      value: fmtUsd(metrics.purchasePrice) },
                  { label: 'Rehab Costs',         value: fmtUsd(metrics.rehab) },
                  { label: 'Closing Costs',       value: fmtUsd(metrics.closingBuy) },
                  { label: 'Total Cash Invested', value: fmtUsd(metrics.totalCash), strong: true },
                  { label: 'Loan Amount',         value: fmtUsd(metrics.loan) },
                  { label: 'Monthly Mortgage',    value: fmtUsd(metrics.piti) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className={`text-sm ${row.strong ? 'text-[#1d1d1f] font-semibold' : 'text-[#3a3a3c]'}`}>{row.label}</span>
                    <span className={`text-sm font-mono ${row.strong ? 'text-[#b8860b] font-semibold' : 'text-[#1d1d1f]'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#86868b]">The wholesaler hasn't shared a saved analysis for this deal.</p>
          )}
        </section>
      )}

      {/* Rehab line items. */}
      {showRehab && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2 flex items-center gap-2">
            <Hammer className="w-3.5 h-3.5 text-[#b8860b]" /> Rehab estimate
          </h3>
          {rehabItems.length > 0 ? (
            <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 bg-white border-b border-[rgba(0,0,0,0.08)] text-[10px] uppercase tracking-wider text-[#86868b] font-semibold">
                <div className="col-span-4">Category</div>
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Cost</div>
              </div>
              <div className="divide-y divide-[rgba(0,0,0,0.08)]">
                {rehabItems.map((i, idx) => (
                  <div key={i.id || idx} className="grid grid-cols-12 px-4 py-2.5 text-sm">
                    <div className="col-span-4 text-[#3a3a3c]">{i.category || '—'}</div>
                    <div className="col-span-6 text-[#6e6e73]">{i.description || '—'}</div>
                    <div className="col-span-2 text-right font-mono text-[#1d1d1f]">{fmtUsd(Number(i.cost) || 0)}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-12 px-4 py-2.5 bg-white border-t border-[rgba(0,0,0,0.08)]">
                <div className="col-span-10 text-sm text-[#1d1d1f] font-semibold">Total</div>
                <div className="col-span-2 text-right text-sm font-mono text-[#b8860b] font-semibold">{fmtUsd(rehabTotal)}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#86868b]">No rehab line items provided.</p>
          )}
        </section>
      )}

      {/* Wholesaler contact */}
      <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[rgba(184,134,11,0.10)] text-[#b8860b] inline-flex items-center justify-center font-bold border border-[rgba(184,134,11,0.30)]">
          {(wholesaler.initials || (wholesaler.name || wholesaler.handle || '?').slice(0, 2)).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[#1d1d1f] font-semibold truncate">@{wholesaler.handle || 'wholesaler'}</p>
          {wholesaler.name && <p className="text-sm text-[#6e6e73] truncate">{wholesaler.name}</p>}
        </div>
      </section>

      {/* CTAs */}
      <section className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => setOfferOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209]"
        >
          <Send className="w-4 h-4" /> Make an offer
        </button>
        <button
          type="button"
          onClick={onDashboard}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white text-[#1d1d1f] hover:border-[#b8860b] hover:text-[#b8860b]"
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

      <footer className="text-center text-[11px] text-[#86868b] py-6">
        Powered by REI Flywheel
      </footer>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    'New':            'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[rgba(184,134,11,0.30)]',
    'Marketed':       'bg-blue-400/15 text-blue-300 border-blue-400/30',
    'Under Contract': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    'Closed':         'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.08)]',
    'Dead':           'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${map[status] || 'bg-[rgba(0,0,0,0.08)] text-[#1d1d1f] border-[rgba(0,0,0,0.08)]'}`}>
      {status}
    </span>
  );
}

function PriceCell({ label, value, accent }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
      <p className={`text-sm font-semibold font-mono ${accent || 'text-[#1d1d1f]'}`}>{value}</p>
    </div>
  );
}

function SpecCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3 flex items-start gap-3">
      <div className="w-9 h-9 shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white flex items-center justify-center text-[#b8860b]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="block text-[10px] uppercase tracking-wider text-[#86868b] leading-none">
          {label}
        </span>
        <span className="block text-sm font-semibold text-[#1d1d1f] break-words leading-snug">
          {value}
        </span>
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
      <div className="relative bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-6 w-full max-w-md">
        <h2 className="text-[#1d1d1f] font-bold text-lg mb-1">Make an offer</h2>
        <p className="text-xs text-[#6e6e73] mb-4 truncate">{deal.addr}</p>

        {sent ? (
          <div className="text-center py-6">
            <div className="inline-flex w-12 h-12 rounded-full bg-emerald-500/20 items-center justify-center mb-3">
              <ShieldCheck className="w-6 h-6 text-emerald-300" />
            </div>
            <p className="text-[#1d1d1f] font-semibold mb-1">Offer sent</p>
            <p className="text-sm text-[#6e6e73] mb-5">The wholesaler will reach out shortly.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209]"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[#6e6e73] text-xs block mb-1">Offer amount ($)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]"
              />
            </div>
            <div>
              <label className="text-[#6e6e73] text-xs block mb-1">Buyer type</label>
              <select
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value)}
                className="w-full bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]"
              >
                <option>Cash Buyer</option>
                <option>Hard Money</option>
                <option>Conventional</option>
                <option>Owner Occupant</option>
                <option>JV / Partner</option>
              </select>
            </div>
            <div>
              <label className="text-[#6e6e73] text-xs block mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Closing timeline, contingencies, anything else…"
                className="w-full bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b] min-h-[80px]"
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
                className="px-4 py-2 rounded-lg bg-[rgba(0,0,0,0.06)] hover:bg-[rgba(0,0,0,0.06)] text-[#1d1d1f] border border-[rgba(0,0,0,0.08)] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !amount}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] disabled:opacity-50 text-sm"
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
