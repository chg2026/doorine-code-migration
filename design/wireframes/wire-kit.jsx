// wire-kit.jsx — shared wireframe primitives (mid-fi monochrome)
// Editorial, lots of whitespace, 1px hairlines, striped img placeholders.

const WK = {
  // Exposed on window so every component reads the SAME object instance.
  // Theme toggle flips fields in place.
  ink: '#111',
  mute: '#666',
  dim: '#999',
  line: '#E5E3DE',
  bg: '#FAF8F4',
  card: '#FFFFFF',
  accent: '#111',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  sans: '-apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif',
  serif: '"Tiempos Text", "Source Serif Pro", Georgia, serif',
};

// Theme helper — mutates WK in place so all primitives pick it up.
function applyTheme(theme) {
  if (theme === 'dark') {
    Object.assign(WK, {
      ink: '#F2EFE8', mute: '#9A948A', dim: '#6C6760',
      line: '#2A2825', bg: '#131210', card: '#1A1815',
    });
  } else {
    Object.assign(WK, {
      ink: '#111', mute: '#666', dim: '#999',
      line: '#E5E3DE', bg: '#FAF8F4', card: '#FFFFFF',
    });
  }
}

// Diagonal-stripe placeholder; use for any image.
function Stripe({ h = 120, label, style = {} }) {
  const stripe = `repeating-linear-gradient(45deg, ${WK.line} 0 1px, transparent 1px 8px)`;
  return (
    <div style={{
      height: h, background: stripe, border: `1px solid ${WK.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: WK.dim, fontFamily: WK.mono, fontSize: 10, letterSpacing: 0.6,
      textTransform: 'uppercase', ...style,
    }}>{label}</div>
  );
}

// Tiny avatar (initials in a squircle of stripes)
function Avatar({ size = 56, initials = 'JR' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22,
      background: `repeating-linear-gradient(45deg, ${WK.line} 0 1px, transparent 1px 6px)`,
      border: `1px solid ${WK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: WK.sans, fontSize: size * 0.32, fontWeight: 600, color: WK.ink, letterSpacing: -0.5,
      flexShrink: 0,
    }}>{initials}</div>
  );
}

// Hairline label (small caps monospace)
function Kicker({ children, style = {} }) {
  return (
    <div style={{
      fontFamily: WK.mono, fontSize: 10, letterSpacing: 1.4,
      textTransform: 'uppercase', color: WK.mute, ...style,
    }}>{children}</div>
  );
}

// Button
function Btn({ children, solid = false, full = false, sm = false, style = {} }) {
  return (
    <button style={{
      border: `1px solid ${solid ? WK.ink : WK.line}`,
      background: solid ? WK.ink : 'transparent',
      color: solid ? WK.bg : WK.ink,
      padding: sm ? '8px 12px' : '12px 18px',
      fontFamily: WK.sans, fontSize: sm ? 12 : 13, fontWeight: 500,
      letterSpacing: -0.1, borderRadius: 2, cursor: 'pointer',
      width: full ? '100%' : undefined, ...style,
    }}>{children}</button>
  );
}

// Hairline row separator
function Hairline({ vertical = false, style = {} }) {
  return <div style={{
    background: WK.line,
    width: vertical ? 1 : '100%',
    height: vertical ? '100%' : 1,
    ...style,
  }} />;
}

// Tag pill (filter / status)
function Tag({ children, active = false, style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '5px 10px', fontFamily: WK.mono, fontSize: 10,
      letterSpacing: 0.8, textTransform: 'uppercase',
      border: `1px solid ${active ? WK.ink : WK.line}`,
      background: active ? WK.ink : 'transparent',
      color: active ? WK.bg : WK.ink, borderRadius: 999,
      whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

// Status dot + label
function Status({ kind = 'active' }) {
  const map = {
    active: { t: 'Active', c: WK.ink },
    pending: { t: 'Pending', c: WK.mute },
    sold: { t: 'Sold', c: WK.dim },
    new: { t: 'New', c: WK.ink },
  };
  const s = map[kind] || map.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: WK.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: s.c }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.c, border: kind === 'sold' ? `1px solid ${WK.dim}` : 'none', boxSizing: 'border-box', backgroundClip: kind === 'sold' ? 'padding-box' : undefined, backgroundColor: kind === 'sold' ? 'transparent' : s.c }} />
      {s.t}
    </span>
  );
}

// Phone scaffold — gives us a unified 320x660 artboard content region without
// needing the full iOS starter chrome for every screen. (We DO use IOSDevice
// for hero artboards.) Pads top for a faux status bar.
function PhoneScroll({ children, pad = true, style = {} }) {
  return (
    <div style={{
      height: '100%', background: WK.bg, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      fontFamily: WK.sans, color: WK.ink,
      paddingTop: pad ? 60 : 0, ...style,
    }}>{children}</div>
  );
}

// Fake status bar (compact, for non-IOSDevice artboards)
function MiniStatus() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 20px 12px', fontFamily: WK.sans, fontSize: 11, fontWeight: 600, color: WK.ink,
    }}>
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2.5" height="4" fill="currentColor"/><rect x="3.5" y="4" width="2.5" height="6" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" fill="currentColor"/><rect x="10.5" y="0" width="2.5" height="10" fill="currentColor"/></svg>
        <svg width="18" height="9" viewBox="0 0 18 9"><rect x="0.5" y="0.5" width="15" height="8" rx="2" fill="none" stroke="currentColor"/><rect x="2" y="2" width="12" height="5" rx="1" fill="currentColor"/></svg>
      </span>
    </div>
  );
}

// Sketchy annotation arrow — for design notes around artboards
function Note({ children, style = {} }) {
  return (
    <div style={{
      fontFamily: WK.mono, fontSize: 10, letterSpacing: 0.4, color: WK.mute,
      lineHeight: 1.5, maxWidth: 200, ...style,
    }}>{children}</div>
  );
}

Object.assign(window, { WK, applyTheme, Stripe, Avatar, Kicker, Btn, Hairline, Tag, Status, PhoneScroll, MiniStatus, Note });
