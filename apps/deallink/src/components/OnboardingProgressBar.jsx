import React from 'react';
import { ChevronUp, Trophy, Play } from 'lucide-react';
import { getTourState, setTourStep, TOUR_STEP_KEYS } from './OnboardingCard.jsx';

const GOLD = '#b8860b';
const GOLD_GLOW =
  '0 0 0 1px rgba(184,134,11,0.25), 0 8px 24px rgba(184,134,11,0.35), 0 2px 8px rgba(0,0,0,0.12)';

const STEP_LABELS = [
  { key: 'properties_list', label: 'Properties' },
  { key: 'deal_overview', label: 'Deal overview' },
  { key: 'deal_analysis', label: 'Deal analysis' },
  { key: 'deal_documents', label: 'Documents' },
  { key: 'deal_im', label: 'Investment memo' },
];

function readHidden() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('rei_flywheel_tour_hidden') === '1';
  } catch {
    return false;
  }
}

export default function OnboardingProgressBar() {
  const [state, setState] = React.useState(() => getTourState());
  const [hidden, setHidden] = React.useState(() => readHidden());
  const [expanded, setExpanded] = React.useState(false);
  const [hoverKey, setHoverKey] = React.useState(null);

  // Drag state. Once the user has dragged, we switch from fixed bottom/left
  // anchoring to absolute top/left coordinates tracked here.
  const [pos, setPos] = React.useState(null); // null = use default bottom/left anchor
  const [dragging, setDragging] = React.useState(false);
  const dragInfoRef = React.useRef(null);
  const didDragRef = React.useRef(false);
  const wrapRef = React.useRef(null);
  const DRAG_THRESHOLD = 4;

  React.useEffect(() => {
    const onUpdate = () => {
      setState(getTourState());
      setHidden(readHidden());
    };
    window.addEventListener('rei_tour_update', onUpdate);
    return () => window.removeEventListener('rei_tour_update', onUpdate);
  }, []);

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const info = dragInfoRef.current;
      if (!info) return;
      const dx = e.clientX - info.startX;
      const dy = e.clientY - info.startY;
      if (!didDragRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      didDragRef.current = true;
      const w = wrapRef.current ? wrapRef.current.offsetWidth : 220;
      const h = wrapRef.current ? wrapRef.current.offsetHeight : 60;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      const nextX = Math.min(maxX, Math.max(0, e.clientX - info.offsetX));
      const nextY = Math.min(maxY, Math.max(0, e.clientY - info.offsetY));
      setPos({ x: nextX, y: nextY });
    };
    const onUp = () => {
      setDragging(false);
      dragInfoRef.current = null;
      // didDragRef is intentionally left as-is so the synthetic click
      // that fires immediately after mouseup can read it and decide
      // whether to toggle. It is reset on the next mousedown.
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const startDrag = (e) => {
    if (e.button !== 0) return;
    const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : null;
    if (!rect) return;
    // On first drag, seed pos from the current rendered rect so the pill
    // doesn't jump from its bottom-anchored origin.
    if (!pos) setPos({ x: rect.left, y: rect.top });
    dragInfoRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    didDragRef.current = false;
    setDragging(true);
  };

  if (hidden) return null;

  const total = TOUR_STEP_KEYS.length;
  const completeCount = TOUR_STEP_KEYS.filter((k) => state[k] === 'complete').length;
  const allDone = completeCount === total;
  const pct = (completeCount / total) * 100;

  const wrapperStyle = pos
    ? {
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        zIndex: 999,
        fontFamily: 'var(--sans, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
        userSelect: dragging ? 'none' : 'auto',
      }
    : {
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 999,
        fontFamily: 'var(--sans, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
        userSelect: dragging ? 'none' : 'auto',
      };

  const dragCursor = dragging ? 'grabbing' : 'grab';

  if (allDone && !expanded) {
    return (
      <div ref={wrapRef} style={wrapperStyle}>
        <div
          onMouseDown={startDrag}
          onClick={() => { if (!didDragRef.current) setExpanded(true); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#ffffff',
            border: `1.5px solid ${GOLD}`,
            borderRadius: 999,
            padding: '12px 22px',
            boxShadow: GOLD_GLOW,
            cursor: dragCursor,
            fontSize: 14,
            fontWeight: 700,
            color: GOLD,
            transform: 'translateZ(0)',
          }}
        >
          <Trophy size={16} color={GOLD} />
          Setup complete! 🎉
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={wrapperStyle}>
      {expanded && (
        <div
          style={{
            width: 260,
            borderRadius: 16,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(255,248,220,0.95) 100%)',
            border: '1.5px solid rgba(184,134,11,0.2)',
            boxShadow:
              '0 12px 40px rgba(184,134,11,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            padding: '14px 16px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f' }}>
              Getting started
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>
              {completeCount}/{total}
            </div>
          </div>

          {STEP_LABELS.map(({ key, label }) => {
            const status = state[key];
            const isComplete = status === 'complete';
            const isSkipped = status === 'dismissed';
            return (
              <div
                key={key}
                style={{
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `1.5px solid ${isComplete ? GOLD : 'rgba(0,0,0,0.2)'}`,
                    background: isComplete ? GOLD : 'transparent',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isComplete ? '✓' : ''}
                </span>
                <span
                  onClick={isComplete ? () => setTourStep(key, undefined) : undefined}
                  onMouseEnter={isComplete ? () => setHoverKey(key) : undefined}
                  onMouseLeave={isComplete ? () => setHoverKey(null) : undefined}
                  title={isComplete ? 'Click to rewatch' : undefined}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: isComplete ? '#1d1d1f' : '#6e6e73',
                    fontWeight: isComplete ? 600 : 500,
                    cursor: isComplete ? 'pointer' : 'default',
                    textDecoration:
                      isComplete && hoverKey === key ? 'underline' : 'none',
                    textDecorationColor: GOLD,
                    textUnderlineOffset: 2,
                  }}
                >
                  {label}
                </span>
                {isSkipped && (
                  <button
                    type="button"
                    onClick={() => setTourStep(key, undefined)}
                    aria-label={`Replay ${label}`}
                    title="Replay this step"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `1.5px solid ${GOLD}`,
                      background: 'transparent',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Play size={9} color={GOLD} fill={GOLD} style={{ marginLeft: 1 }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        onMouseDown={startDrag}
        onClick={() => { if (!didDragRef.current) setExpanded((v) => !v); }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          background: '#ffffff',
          border: '1.5px solid rgba(184,134,11,0.3)',
          borderRadius: 40,
          padding: '10px 20px',
          boxShadow: GOLD_GLOW,
          cursor: dragCursor,
          transform: 'translateZ(0)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: GOLD,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Getting started
          </span>
          <div
            style={{
              width: 120,
              height: 7,
              borderRadius: 99,
              background: 'rgba(184,134,11,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: GOLD,
                borderRadius: 99,
                filter: 'drop-shadow(0 0 4px rgba(184,134,11,0.6))',
                transition: 'width 240ms ease',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#1d1d1f',
              lineHeight: 1,
            }}
          >
            {completeCount} of {total} complete
          </span>
        </div>
        <ChevronUp
          size={16}
          color={GOLD}
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms ease',
          }}
        />
      </div>
    </div>
  );
}
