// Neumorphism design system for Deal Link.
// Tones, accents, and shadow generators used by both the public profile and
// the admin Customize section. Keep pure (no React imports) so it can be
// reused by any component or worker.

const NEU_FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", system-ui, sans-serif';

function hex(c) {
  c = (c || '').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function rgbStr(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a == null ? 1 : a})`; }
function shade(c, amt) {
  const [r, g, b] = hex(c);
  const f = (v) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return rgbStr(f(r), f(g), f(b));
}
function darkShade(c, a) { const [r, g, b] = hex(c); return rgbStr(r * 0.35, g * 0.35, b * 0.45, a); }
function lightShade(c, a) { const [r, g, b] = hex(c); return rgbStr(Math.min(255, r + 50), Math.min(255, g + 50), Math.min(255, b + 55), a); }

function neuOut(base, dark = false, intensity = 1, size = 14) {
  const lo = dark ? `rgba(255,255,255,${0.04 * intensity})` : lightShade(base, 0.9 * intensity);
  const dk = dark ? `rgba(0,0,0,${0.55 * intensity})` : darkShade(base, 0.22 * intensity);
  return `${-size / 2}px ${-size / 2}px ${size}px ${lo}, ${size / 2}px ${size / 2}px ${size}px ${dk}`;
}
function neuIn(base, dark = false, intensity = 1, size = 10) {
  const lo = dark ? `rgba(255,255,255,${0.05 * intensity})` : lightShade(base, 1.0 * intensity);
  const dk = dark ? `rgba(0,0,0,${0.55 * intensity})` : darkShade(base, 0.25 * intensity);
  return `inset ${-size / 2}px ${-size / 2}px ${size}px ${lo}, inset ${size / 2}px ${size / 2}px ${size}px ${dk}`;
}
function neuBg(base, dark = false, gradient = false) {
  if (!gradient) return base;
  if (dark) return `linear-gradient(155deg, ${shade(base, 0.06)} 0%, ${base} 55%, ${shade(base, -0.18)} 100%)`;
  return `linear-gradient(155deg, ${shade(base, 0.22)} 0%, ${base} 55%, ${shade(base, -0.06)} 100%)`;
}

export const TONES = {
  Mist:  { base: '#E6E9EF', ink: '#2A2F3A', mute: '#7B8294', dim: '#A4ABBC', dark: false },
  Sand:  { base: '#EFE8DC', ink: '#3A2E20', mute: '#8A7A60', dim: '#B9AC92', dark: false },
  Moss:  { base: '#DBE3DA', ink: '#1F2D24', mute: '#637568', dim: '#9AAA9B', dark: false },
  Slate: { base: '#D9DEE6', ink: '#1F2530', mute: '#5F6779', dim: '#92A1B0', dark: false },
  Ink:   { base: '#1E2230', ink: '#E8ECF5', mute: '#9FA9C0', dim: '#6A7290', dark: true  },
};
export const TONE_ORDER = ['Mist', 'Sand', 'Moss', 'Slate', 'Ink'];
export const ACCENTS = ['#6C5DD3', '#C77B3A', '#3F7A55', '#D63A6E', '#1F8AA8', '#1F2230'];
export const DEFAULT_THEME = { tone: 'Mist', accent: '#6C5DD3', radius: 20, gradient: false };

export function resolveTheme(profile) {
  // Prefer the canonical top-level fields (tone, accentColor, radius,
  // gradientEnabled). Fall back to the legacy storage shape
  // (backgroundType / backgroundValue / onboarding.theme) so older saved
  // profiles keep rendering correctly.
  const themeBag = (profile?.onboarding && profile.onboarding.theme) || {};

  const toneCandidate = profile?.tone || profile?.backgroundType;
  const toneName = TONES[toneCandidate] ? toneCandidate : DEFAULT_THEME.tone;
  const tone = TONES[toneName];

  const accentCandidate = profile?.accentColor || profile?.backgroundValue;
  const accent = (accentCandidate && /^#[0-9a-f]{3,8}$/i.test(accentCandidate))
    ? accentCandidate
    : DEFAULT_THEME.accent;

  const radiusCandidate = Number.isFinite(profile?.radius) ? profile.radius : themeBag.radius;
  const radius = Number.isFinite(radiusCandidate)
    ? Math.max(8, Math.min(36, radiusCandidate))
    : DEFAULT_THEME.radius;

  const gradient = (profile && 'gradientEnabled' in profile)
    ? !!profile.gradientEnabled
    : !!themeBag.gradient;

  return { toneName, tone, accent, radius, gradient };
}

export { NEU_FONT, hex, rgbStr, shade, darkShade, lightShade, neuOut, neuIn, neuBg };
