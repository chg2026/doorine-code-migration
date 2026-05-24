import React from 'react';
import { Check, Sparkles, CreditCard, AlertCircle, Users, Settings } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const API_BASE = 'https://rei-code-dev.replit.app';
const SUCCESS_URL = 'https://deallink.neuroaios.ai/billing/success';
const CANCEL_URL  = 'https://deallink.neuroaios.ai/billing';

const PLANS = {
  free: {
    label: 'Free',
    price: '$0',
    cadence: 'forever',
    features: [
      'Up to 10 active deals',
      'Public Linktree-style profile',
      'Basic Deal Analyzer',
      'Email lead notifications',
    ],
  },
  personal: {
    label: 'Personal',
    price: '$29',
    cadence: 'per month',
    features: [
      'Unlimited deals',
      '0 team members',
      '2 guests (view-only)',
      'Buyers CRM with lead inbox',
      'Pipeline + Offers tracking',
      'Cross-wholesaler Marketplace',
      'Investment Memorandum sharing',
      'Priority support',
    ],
  },
  team: {
    label: 'Team',
    price: '$99',
    cadence: 'per month',
    features: [
      'Everything in Personal',
      '5 team members (same domain)',
      '5 guests (view-only)',
      'Unlimited deals',
      'All Enterprise modules (Deal Blast, Power, Quest Search)',
      'JV Deals + Buyer Rental',
      'Handoff workflow',
    ],
  },
};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export default function Billing() {
  const { plan, loading: authLoading, refresh } = useAuth();
  const [busyPlan, setBusyPlan] = React.useState(null); // 'personal' | 'team' | 'portal' | null
  const [error, setError] = React.useState(null);

  React.useEffect(() => { if (refresh) refresh(); }, [refresh]);

  async function startCheckout(planCode) {
    if (busyPlan) return;
    setBusyPlan(planCode); setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product_code: 'deallink',
          plan: planCode,
          success_url: `${SUCCESS_URL}?plan=${planCode}`,
          cancel_url: CANCEL_URL,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Checkout failed (${res.status})`);
      const url = body?.url || body?.checkout_url || body?.redirect_url;
      if (url) {
        window.location.href = url;
      } else if (body?.upgraded) {
        window.location.href = `/billing/success?plan=${planCode}`;
      } else {
        throw new Error('Checkout response did not include a redirect URL.');
      }
    } catch (e) {
      setError(e?.message || 'Could not start checkout.');
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    if (busyPlan) return;
    setBusyPlan('portal'); setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ return_url: CANCEL_URL }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Portal request failed (${res.status})`);
      const url = body?.url || body?.portal_url || body?.redirect_url;
      if (!url) throw new Error('Portal response did not include a redirect URL.');
      window.location.href = url;
    } catch (e) {
      setError(e?.message || 'Could not open billing portal.');
      setBusyPlan(null);
    }
  }

  const currentKey = (plan && PLANS[plan]) ? plan : 'free';
  const currentPlan = PLANS[currentKey];
  const showPersonal = currentKey === 'free';
  const showTeam = currentKey === 'free' || currentKey === 'personal';
  const isTeam = currentKey === 'team';

  return (
    <Layout>
      <div className="max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Billing</h1>
          <p className="text-sm text-[#6e6e73] mt-1">
            Manage your REI Flywheel subscription and payment plan.
          </p>
        </div>

        {/* ─── Current plan ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#86868b] mb-1">Current plan</p>
              <h2 className="text-xl font-semibold text-[#1d1d1f] flex items-center gap-2">
                {currentPlan.label}
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#b8860b]/15 text-[#b8860b] border border-[#b8860b]/30">
                  active
                </span>
              </h2>
              <p className="text-[#6e6e73] text-sm mt-1">
                <span className="text-[#1d1d1f] font-semibold">{currentPlan.price}</span>{' '}
                <span className="text-[#86868b]">/ {currentPlan.cadence}</span>
              </p>
            </div>
            {authLoading && (
              <p className="text-xs text-[#86868b] font-mono">Loading plan…</p>
            )}
          </div>

          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentPlan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-[#3a3a3c]">
                <Check className="w-4 h-4 text-[#b8860b] flex-shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── Upgrade cards ────────────────────────────────────────── */}
        {(showPersonal || showTeam) && (
          <div className={`grid gap-5 ${showPersonal && showTeam ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
            {showPersonal && (
              <PlanCard
                planKey="personal"
                icon={Sparkles}
                accent="amber"
                onUpgrade={() => startCheckout('personal')}
                busy={busyPlan === 'personal'}
                disabled={!!busyPlan && busyPlan !== 'personal'}
              />
            )}
            {showTeam && (
              <PlanCard
                planKey="team"
                icon={Users}
                accent="amber"
                highlight
                onUpgrade={() => startCheckout('team')}
                busy={busyPlan === 'team'}
                disabled={!!busyPlan && busyPlan !== 'team'}
              />
            )}
          </div>
        )}

        {/* ─── Team-plan management ─────────────────────────────────── */}
        {isTeam && (
          <div className="rounded-xl border border-[#b8860b]/40 bg-gradient-to-br from-[rgba(184,134,11,0.08)] to-white p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[#b8860b] flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-[#1d1d1f]" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#1d1d1f]">You're on the Team plan</h3>
                <p className="text-sm text-[#6e6e73] mt-0.5">
                  Update payment details, invoices, or cancel from the secure customer portal.
                </p>
              </div>
            </div>
            <button
              onClick={openPortal}
              disabled={!!busyPlan}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <Settings className="w-4 h-4" />
              {busyPlan === 'portal' ? 'Opening portal…' : 'Manage subscription'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

function PlanCard({ planKey, icon: Icon, highlight, onUpgrade, busy, disabled }) {
  const p = PLANS[planKey];
  return (
    <div
      className={`rounded-xl p-6 flex flex-col ${
        highlight
          ? 'border border-[#b8860b]/50 bg-gradient-to-br from-[rgba(184,134,11,0.08)] to-white'
          : 'border border-[rgba(0,0,0,0.08)] bg-white/40'
      }`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#b8860b] flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[#1d1d1f]" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
            {p.label}
            {highlight && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(184,134,11,0.10)] text-[#b8860b] border border-[#b8860b]/30 font-medium">
                MOST POWER
              </span>
            )}
          </h3>
          <p className="text-sm text-[#6e6e73] mt-0.5">
            {planKey === 'personal'
              ? 'For solo wholesalers ready to scale.'
              : 'For teams collaborating across deals.'}
          </p>
        </div>
        <p className="text-right">
          <span className="text-2xl font-bold text-[#1d1d1f]">{p.price}</span>
          <span className="block text-[11px] text-[#86868b]">{p.cadence}</span>
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 mb-5 flex-1">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[#3a3a3c]">
            <Check className="w-4 h-4 text-[#b8860b] flex-shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onUpgrade}
        disabled={busy || disabled}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <CreditCard className="w-4 h-4" />
        {busy ? 'Starting checkout…' : `Upgrade to ${p.label}`}
      </button>
      <p className="text-[11px] text-[#86868b] mt-3 text-center">
        Secure checkout. Cancel anytime.
      </p>
    </div>
  );
}
