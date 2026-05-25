// Public route /deal/:slug — runs the IM gate (3 steps) for unauthenticated
// buyers, then renders the IMPage. If the buyer is already authed, skips
// straight to IMPage. The server's /api/im/deal/:slug endpoint decides
// whether to return a full IM body or just the OG summary based on the
// buyer JWT we send.
import React from 'react';
import { useParams } from 'react-router-dom';
import { BuyerAuthProvider, useBuyerAuth } from '../context/BuyerAuthContext.jsx';
import { ImAPI } from '../lib/im-api.js';
import GateStep1Name from '../components/im/GateStep1Name.jsx';
import GateStep2Phone from '../components/im/GateStep2Phone.jsx';
import GateStep3Verify from '../components/im/GateStep3Verify.jsx';
import IMPage from '../components/im/IMPage.jsx';

function DealIMInner() {
  const { slug } = useParams();
  const { buyer, loading: authLoading, isAuthed, setSession, refresh } = useBuyerAuth();

  const [data, setData] = React.useState(null);   // { gated, summary, deal? }
  const [error, setError] = React.useState(null);
  const [loadingDeal, setLoadingDeal] = React.useState(true);

  // Gate state
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [devCode, setDevCode] = React.useState(null);

  const reload = React.useCallback(async () => {
    setLoadingDeal(true); setError(null);
    try {
      const result = await ImAPI.getDeal(slug);
      setData(result);
      if (result?.summary?.addr) document.title = `${result.summary.addr} · REI Flywheel`;
    } catch (err) {
      setError(err?.status === 404 ? 'This deal link is no longer active.' : (err?.message || 'Failed to load deal'));
    } finally { setLoadingDeal(false); }
  }, [slug]);

  // Initial fetch — wait for auth check first so we send the token if we have one
  React.useEffect(() => {
    if (authLoading) return;
    reload();
  }, [authLoading, reload]);

  if (authLoading || loadingDeal) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-[#86868b] text-sm">Loading deal…</div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-[#b8860b] font-bold mb-3">REI Flywheel</div>
          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">Deal unavailable</h1>
          <p className="text-sm text-[#6e6e73]">{error}</p>
        </div>
      </div>
    );
  }

  // If authed and server returned the full IM, show it.
  if (isAuthed && data?.deal) {
    return (
      <IMPage
        deal={data.deal}
        buyer={buyer}
        onUnlockWholesaler={async () => {
          try { await ImAPI.unlockWholesaler(); refresh(); } catch {}
        }}
      />
    );
  }

  // Otherwise — run the gate.
  const summary = data?.summary;

  if (step === 1) {
    return (
      <GateStep1Name summary={summary} initialName={name} onNext={(n) => { setName(n); setStep(2); }} />
    );
  }
  if (step === 2) {
    return (
      <GateStep2Phone
        summary={summary}
        name={name}
        initialPhone={phone}
        onBack={() => setStep(1)}
        onNext={(p, dev) => { setPhone(p); setDevCode(dev); setStep(3); }}
      />
    );
  }
  return (
    <GateStep3Verify
      summary={summary}
      phone={phone}
      devCode={devCode}
      onBack={() => setStep(2)}
      onVerified={async ({ token, buyer }) => {
        setSession({ token, buyer });
        await reload();
      }}
    />
  );
}

export default function DealIM() {
  return (
    <BuyerAuthProvider>
      <DealIMInner />
    </BuyerAuthProvider>
  );
}
