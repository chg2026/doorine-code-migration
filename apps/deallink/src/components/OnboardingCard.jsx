import React from 'react';
import { X, Play, Check } from 'lucide-react';

const STORAGE_KEY = 'rei_flywheel_tour';
const GOLD = '#b8860b';

const STEPS = [
  {
    key: 'properties_list',
    index: 1,
    title: 'Your deal inventory',
    description:
      'Properties is where you manage all your active deals. Add a deal manually, import a CSV, and track asking price, ARV, and status — all in one place.',
    videoUrl: '',
  },
  {
    key: 'deal_overview',
    index: 2,
    title: 'Set up your deal',
    description:
      'Fill in the address, specs, pricing, and photos for this property. The Live Preview on the right shows exactly what buyers will see on your public profile.',
    videoUrl: '',
  },
  {
    key: 'deal_analysis',
    index: 3,
    title: 'Run the numbers',
    description:
      'Run a Deal Analyzer on this property to calculate ARV, repair cost, and MAO. The results attach to this deal and can be shown to buyers in the Investment Memo.',
    videoUrl: '',
  },
  {
    key: 'deal_documents',
    index: 4,
    title: 'Keep docs with your deal',
    description:
      'Upload contracts, inspection reports, title docs — any file tied to this property. You can control which documents buyers see through the Investment Memo.',
    videoUrl: '',
  },
  {
    key: 'deal_im',
    index: 5,
    title: 'Share with buyers',
    description:
      'The Investment Memo is a public page buyers can open without logging in. Toggle which sections to include, copy the link, and send it straight to your buyer list.',
    videoUrl: '',
  },
];

export const TOUR_STEP_KEYS = STEPS.map((s) => s.key);
export const TOUR_STEPS = STEPS;

export function getTourState() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setTourStep(key, status) {
  if (typeof window === 'undefined') return;
  const state = getTourState();
  if (status === undefined || status === null) delete state[key];
  else state[key] = status;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('rei_tour_update'));
  } catch {}
}

export function resetTour() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('rei_tour_update'));
  } catch {}
}

export default function OnboardingCard({ stepKey }) {
  const step = STEPS.find((s) => s.key === stepKey);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener('rei_tour_update', onUpdate);
    return () => window.removeEventListener('rei_tour_update', onUpdate);
  }, []);

  if (!step) return null;
  const state = getTourState();
  const status = state[stepKey];
  if (status === 'complete' || status === 'dismissed') return null;

  const pct = (step.index / STEPS.length) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 88,
        right: 24,
        width: 360,
        background: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 10px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        zIndex: 1000,
        overflow: 'hidden',
        fontFamily: 'var(--sans, system-ui, sans-serif)',
      }}
      data-tick={tick}
    >
      <div style={{ height: 3, background: 'rgba(0,0,0,0.06)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: GOLD, transition: 'width 240ms ease' }} />
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Step {step.index} of {STEPS.length}
        </div>
        <button
          type="button"
          onClick={() => setTourStep(stepKey, 'dismissed')}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#86868b',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1d1f', letterSpacing: -0.2 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 6, lineHeight: 1.5 }}>{step.description}</div>

        <div
          style={{
            marginTop: 12,
            aspectRatio: '16 / 9',
            width: '100%',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#1d1d1f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          {step.videoUrl ? (
            <iframe
              src={step.videoUrl}
              title={step.title}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(184,134,11,0.18)',
                  border: `1px solid ${GOLD}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={20} color={GOLD} fill={GOLD} />
              </div>
              <div style={{ fontSize: 12, letterSpacing: 0.4 }}>Video coming soon</div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setTourStep(stepKey, 'complete')}
            style={{
              flex: 1,
              background: GOLD,
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Check size={14} /> Mark as done
          </button>
          <button
            type="button"
            onClick={() => setTourStep(stepKey, 'dismissed')}
            style={{
              background: 'rgba(0,0,0,0.05)',
              color: '#6e6e73',
              border: 'none',
              borderRadius: 10,
              padding: '11px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
