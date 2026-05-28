import React from 'react';
import { ChevronUp, Trophy } from 'lucide-react';
import { getTourState, setTourStep, TOUR_STEP_KEYS } from './OnboardingCard.jsx';

const GOLD = '#b8860b';

const STEP_LABELS = [
  { key: 'properties_list', label: 'Properties' },
  { key: 'deal_overview', label: 'Deal overview' },
  { key: 'deal_analysis', label: 'Deal analysis' },
  { key: 'deal_documents', label: 'Documents' },
  { key: 'deal_im', label: 'Investment memo' },
];

export default function OnboardingProgressBar() {
  const [state, setState] = React.useState(() => getTourState());
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const onUpdate = () => setState(getTourState());
    window.addEventListener('rei_tour_update', onUpdate);
    return () => window.removeEventListener('rei_tour_update', onUpdate);
  }, []);

  const total = TOUR_STEP_KEYS.length;
  const completeCount = TOUR_STEP_KEYS.filter((k) => state[k] === 'complete').length;
  const allDone = completeCount === total;
  const pct = (completeCount / total) * 100;

  if (allDone && !expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#ffffff',
          border: `1.5px solid ${GOLD}`,
          borderRadius: 999,
          padding: '8px 14px',
          boxShadow: '0 4px 14px rgba(184,134,11,0.18)',
          cursor: 'pointer',
          fontFamily: 'var(--sans, system-ui, sans-serif)',
          fontSize: 13,
          fontWeight: 600,
          color: '#1d1d1f',
        }}
        onClick={() => setExpanded(true)}
      >
        <Trophy size={15} color={GOLD} />
        Setup complete!
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 999,
        fontFamily: 'var(--sans, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      {expanded && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 14,
            boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
            padding: '12px 14px',
            width: 260,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
            Get started
          </div>
          {STEP_LABELS.map(({ key, label }) => {
            const status = state[key];
            const isComplete = status === 'complete';
            const isSkipped = status === 'dismissed';
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1.5px solid ${isComplete ? GOLD : 'rgba(0,0,0,0.2)'}`,
                    background: isComplete ? GOLD : '#ffffff',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isComplete ? '✓' : ''}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: isSkipped ? '#86868b' : '#1d1d1f',
                    textDecoration: isSkipped ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </span>
                {isSkipped && (
                  <button
                    type="button"
                    onClick={() => setTourStep(key, undefined)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: GOLD,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Redo
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 999,
          padding: '7px 12px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 80,
            height: 5,
            borderRadius: 999,
            background: 'rgba(0,0,0,0.08)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: GOLD, transition: 'width 240ms ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f' }}>
          {completeCount}/{total} done
        </span>
        <ChevronUp
          size={14}
          color="#86868b"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
        />
      </div>
    </div>
  );
}
