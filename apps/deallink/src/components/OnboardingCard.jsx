import React from 'react';
import { X, PlayCircle, Check } from 'lucide-react';

const STORAGE_KEY = 'rei_flywheel_tour';
const GOLD = '#b8860b';

const STEPS = [
  {
    key: 'properties_list',
    index: 1,
    title: 'Your Deal Inventory',
    description:
      'Properties is where you manage all your active deals. Add a deal manually, import a CSV, and track asking price, ARV, and status — all in one place.',
    videoUrl: '',
  },
  {
    key: 'deal_overview',
    index: 2,
    title: 'Set Up Your Deal',
    description:
      'Fill in the address, specs, pricing, and photos for this property. The Live Preview on the right shows exactly what buyers will see on your public profile.',
    videoUrl: '',
  },
  {
    key: 'deal_documents',
    index: 3,
    title: 'Keep Docs with Your Deal',
    description:
      'Upload contracts, inspection reports, title docs — any file tied to this property. You can control which documents buyers see through the Investment Memo.',
    videoUrl: '',
  },
  {
    key: 'deal_im_builder',
    index: 4,
    title: 'Build Your Investment Memo',
    description:
      'Toggle which sections buyers can see — property details, photos, deal numbers, rehab breakdown, and your contact info. The public link at the top is ready to copy and send.',
    videoUrl: '',
  },
  {
    key: 'deal_im_preview',
    index: 5,
    title: 'Preview the Buyer View',
    description:
      'Click the preview to see exactly what a buyer sees when they open your deal link. No login required on their end — just a clean, professional investment memo.',
    videoUrl: '',
  },
  {
    key: 'deal_analysis',
    index: 6,
    title: 'Run Your Numbers (Internal)',
    description:
      'The Deal Analysis tab is your private workspace. Run BRRRR, Fix & Flip, Multifamily, or MAO scenarios. This data stays internal — buyers never see it.',
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
      data-tick={tick}
      style={{
        position: 'fixed',
        bottom: 88,
        right: 24,
        width: 360,
        zIndex: 1000,
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,248,210,0.88) 60%, rgba(184,134,11,0.08) 100%)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        border: '1.5px solid rgba(184,134,11,0.25)',
        borderRadius: 20,
        boxShadow:
          '0 8px 40px rgba(184,134,11,0.20), 0 2px 12px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
        overflow: 'hidden',
        fontFamily: 'var(--sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ height: 3, background: 'rgba(0,0,0,0.06)' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #b8860b, #e6b422)',
            boxShadow: '0 0 8px rgba(184,134,11,0.5)',
            transition: 'width 240ms ease',
          }}
        />
      </div>

      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: GOLD,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
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
            padding: 6,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '8px 16px 16px' }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1d1d1f',
            letterSpacing: -0.2,
            marginBottom: 6,
          }}
        >
          {step.title}
        </div>
        <div style={{ fontSize: 13, color: '#6e6e73', lineHeight: 1.6 }}>
          {step.description}
        </div>

        <div
          style={{
            marginTop: 12,
            aspectRatio: '16 / 9',
            width: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            background:
              'linear-gradient(135deg, #1a1a2e 0%, #2d1f0e 50%, #1a1a2e 100%)',
            border: '1px solid rgba(184,134,11,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
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
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(184,134,11,0.15)',
                  border: '2px solid rgba(184,134,11,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlayCircle size={28} color={GOLD} strokeWidth={2} />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(184,134,11,0.7)',
                  marginTop: 8,
                  letterSpacing: 0.4,
                }}
              >
                Video coming soon
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setTourStep(stepKey, 'complete')}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #b8860b, #d4a017)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(184,134,11,0.35)',
            }}
          >
            <Check size={14} /> Mark as done
          </button>
          <button
            type="button"
            onClick={() => setTourStep(stepKey, 'dismissed')}
            style={{
              background: 'rgba(0,0,0,0.04)',
              color: '#6e6e73',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 10,
              padding: '10px 16px',
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
