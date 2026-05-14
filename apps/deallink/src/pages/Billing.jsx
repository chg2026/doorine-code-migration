import React from 'react';
import { Check, Sparkles, CreditCard, AlertCircle } from 'lucide-react';
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
      'Multiple seats + guest viewers',
      'Enterprise modules (Deal Blast, God Mode, Artemis)',
      'JV Deals + Buyer Rental',
      'Handoff workflow',
    ],
  },
};

export default function Billing() {
  const { plan, loading: authLoading, refresh } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  // The user spec asked for an explicit GET to /api/auth/me on this page;
  // useAuth already loads it via the shared axios client, so we just
  // re-fetch on mount to make sure the displayed plan is fresh after a
  // checkout return.
  React.useEffect(() => { if (refresh) refresh(); }, [refresh]);

  async function upgrade() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('You must be signed in to upgrade.');

      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_code: 'deallink',
          plan: 'personal',
          success_url: SUCCESS_URL,
          cancel_url: CANCEL_URL,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Checkout failed (${res.status})`);

      const url = body?.url || body?.checkout_url || body?.redirect_url;
      if (!url) throw new Error('Checkout response did not include a redirect URL.');
      window.location.href = url;
    } catch (e) {
      setError(e?.message || 'Could not start checkout.');
      setBusy(false);
    }
  }

  const currentPlan = (plan && PLANS[plan]) || PLANS.free;
  const currentKey = (plan && PLANS[plan]) ? plan : 'free';
  const isFree = currentKey === 'free';

  return (
    <Layout>
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your Deal Link subscription and payment plan.
          </p>
        </div>

        {/* ─── Current plan ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Current plan</p>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                {currentPlan.label}
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  active
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                <span className="text-white font-semibold">{currentPlan.price}</span>{' '}
                <span className="text-slate-500">/ {currentPlan.cadence}</span>
              </p>
            </div>
            {authLoading && (
              <p className="text-xs text-slate-500 font-mono">Loading plan…</p>
            )}
          </div>

          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentPlan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                <Check className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ─── Upgrade card ────────────────────────────────────────── */}
        {isFree && (
          <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-400/[0.06] to-slate-900/40 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-slate-900" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Upgrade to Personal</h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  Unlock unlimited deals, the Buyers CRM, the Marketplace, and IM sharing.
                </p>
              </div>
              <p className="text-right">
                <span className="text-2xl font-bold text-white">{PLANS.personal.price}</span>
                <span className="block text-[11px] text-slate-500">{PLANS.personal.cadence}</span>
              </p>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
              {PLANS.personal.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {error && (
              <div className="mb-4 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={upgrade}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 text-slate-900 font-semibold text-sm hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              {busy ? 'Starting checkout…' : 'Upgrade to Personal'}
            </button>
            <p className="text-[11px] text-slate-500 mt-3">
              You'll be redirected to a secure checkout page. Cancel anytime.
            </p>
          </div>
        )}

        {!isFree && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <p className="text-sm text-slate-300">
              You're on the <span className="text-amber-300 font-semibold">{currentPlan.label}</span> plan. To
              change or cancel your subscription, contact support.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
