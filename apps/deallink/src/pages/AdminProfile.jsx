import React from 'react';
import { Twitter, Linkedin, Instagram, Globe } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { DealLinkAPI } from '../lib/deallink-api.js';
import { initialsOf } from '../lib/utils.js';
import {
  NEU_FONT, TONES, TONE_ORDER, ACCENTS, DEFAULT_THEME,
  neuOut, neuIn, neuBg, shade, hex,
} from '../lib/neu.js';

// Admin uses its own dark slate chrome (kept from prior version) so the
// editing surface stays consistent regardless of which tone is being edited.
const ADMIN = {
  bg: '#161b2e',
  accent: '#F5C518',
  ink: '#c8cfe8',
  mute: '#5a6180',
  inkStrong: '#eef0fa',
};
const RAISED_SHADOW = '-5px -5px 12px rgba(255,255,255,0.06), 5px 5px 12px rgba(0,0,0,0.55)';
const INSET_SHADOW = 'inset -3px -3px 8px rgba(255,255,255,0.06), inset 3px 3px 8px rgba(0,0,0,0.55)';

const SOCIALS = [
  { key: 'twitter',   label: 'Twitter / X',  icon: Twitter,   placeholder: 'https://x.com/yourhandle' },
  { key: 'linkedin',  label: 'LinkedIn',      icon: Linkedin,  placeholder: 'https://linkedin.com/in/you' },
  { key: 'instagram', label: 'Instagram',     icon: Instagram, placeholder: 'https://instagram.com/you' },
  { key: 'website',   label: 'Website',       icon: Globe,     placeholder: 'https://your-site.com' },
];

function readTheme(profile) {
  const tone = TONES[profile?.backgroundType] ? profile.backgroundType : DEFAULT_THEME.tone;
  const accent = (profile?.backgroundValue && /^#[0-9a-f]{3,8}$/i.test(profile.backgroundValue))
    ? profile.backgroundValue
    : DEFAULT_THEME.accent;
  const bag = (profile?.onboarding && profile.onboarding.theme) || {};
  const radius = Number.isFinite(bag.radius) ? bag.radius : DEFAULT_THEME.radius;
  const gradient = !!bag.gradient;
  return { tone, accent, radius, gradient };
}

export default function AdminProfile() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [form, setForm] = React.useState(state.profile);
  const [theme, setTheme] = React.useState(() => readTheme(state.profile));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.loaded) {
      setForm(state.profile);
      setTheme(readTheme(state.profile));
    }
  }, [state.loaded, state.profile]);

  if (!state.loaded) {
    return <Layout><div style={{ padding: 80, textAlign: 'center', color: ADMIN.mute, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Loading profile…</div></Layout>;
  }

  function setField(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function setSocial(key, val) { setForm((f) => ({ ...f, socialLinks: { ...(f.socialLinks || {}), [key]: val } })); }
  function setT(patch) { setTheme((t) => ({ ...t, ...patch })); }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const nextOnboarding = {
        ...(form.onboarding || {}),
        theme: { radius: theme.radius, gradient: theme.gradient },
      };
      const updated = await DealLinkAPI.patchProfile({
        handle: state.profile.handle || form.handle || '',
        avatarUrl: form.avatarUrl || '',
        bio: form.bio || '',
        backgroundType: theme.tone,
        backgroundValue: theme.accent,
        socialLinks: form.socialLinks || {},
        name: form.name || '',
        onboarding: nextOnboarding,
      });
      dispatch({ type: 'set_profile', profile: updated });
      setForm(updated);
      setTheme(readTheme(updated));
      show('Profile saved');
    } catch (err) {
      show(err?.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const bioLen = (form.bio || '').length;

  return (
    <Layout>
      <div style={{
        background: ADMIN.bg, color: ADMIN.ink,
        margin: '-16px', padding: 24, minHeight: 'calc(100vh - 56px)',
      }} className="md:!-m-6 md:p-8">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: ADMIN.inkStrong, margin: 0 }}>Public profile</h1>
          <p style={{ fontSize: 13, color: ADMIN.mute, marginTop: 4 }}>Customize how buyers see your wholesaler page.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)',
          gap: 28, alignItems: 'start',
        }}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <NeuCard>
              <SectionTitle>Profile photo</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  boxShadow: RAISED_SHADOW,
                  background: form.avatarUrl ? `center/cover no-repeat url(${form.avatarUrl})` : ADMIN.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#1a1208', fontWeight: 800, fontSize: 22,
                  overflow: 'hidden', flexShrink: 0,
                }}>
                  {!form.avatarUrl && (form.initials || initialsOf(form.name || form.handle))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <Label>Image URL</Label>
                  <NeuInput
                    value={form.avatarUrl}
                    onChange={(e) => setField('avatarUrl', e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
              </div>
            </NeuCard>

            <NeuCard>
              <SectionTitle>Identity</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <Label>Display name</Label>
                  <NeuInput value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Jordan Reyes" />
                </div>
                <div>
                  <Label>Handle</Label>
                  <NeuInput value={form.handle} readOnly prefix="deallink.io/" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Label>Bio</Label>
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: bioLen > 110 ? ADMIN.accent : ADMIN.mute }}>
                      {bioLen}/120
                    </span>
                  </div>
                  <NeuTextarea
                    value={form.bio}
                    onChange={(e) => setField('bio', e.target.value.slice(0, 120))}
                    maxLength={120}
                    placeholder="Off-market SFR + duplex flips in Cleveland."
                  />
                </div>
              </div>
            </NeuCard>

            {/* ── Customize ── */}
            <NeuCard>
              <SectionTitle>Customize</SectionTitle>

              {/* Tone picker */}
              <Label>Tone</Label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 10, marginBottom: 16,
              }}>
                {TONE_ORDER.map((name) => (
                  <ToneCard
                    key={name}
                    name={name}
                    active={theme.tone === name}
                    onClick={() => setT({ tone: name })}
                  />
                ))}
              </div>

              {/* Accent picker */}
              <Label>Accent color</Label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 10, marginBottom: 16, justifyItems: 'center',
              }}>
                {ACCENTS.map((c) => (
                  <AccentSwatch key={c} value={c} active={theme.accent === c} onClick={() => setT({ accent: c })} />
                ))}
              </div>

              {/* Radius slider */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Label>Border radius</Label>
                  <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: ADMIN.mute }}>{theme.radius}px</span>
                </div>
                <input
                  type="range"
                  min={8} max={36} step={2}
                  value={theme.radius}
                  onChange={(e) => setT({ radius: Number(e.target.value) })}
                  style={{
                    width: '100%', accentColor: ADMIN.accent,
                    background: 'transparent', cursor: 'pointer',
                  }}
                />
              </div>

              {/* Gradient toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Label>Gradient surface</Label>
                  <div style={{ fontSize: 11, color: ADMIN.mute }}>Soft diagonal wash on the page background.</div>
                </div>
                <NeuToggle on={theme.gradient} onChange={(v) => setT({ gradient: v })} />
              </div>
            </NeuCard>

            <NeuCard>
              <SectionTitle>Social links</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SOCIALS.map(({ key, label, icon: Icon, placeholder }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 12,
                      background: ADMIN.bg, boxShadow: RAISED_SHADOW,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: ADMIN.ink, flexShrink: 0,
                    }} title={label}>
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <NeuInput
                        value={(form.socialLinks || {})[key] || ''}
                        onChange={(e) => setSocial(key, e.target.value)}
                        placeholder={placeholder}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </NeuCard>

            <NeuButton type="submit" gold disabled={saving} style={{ width: '100%', padding: '14px 20px', fontSize: 14 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </NeuButton>
          </form>

          <div style={{ position: 'sticky', top: 24, display: 'flex', justifyContent: 'center' }}>
            <PhonePreview profile={form} deals={state.deals} theme={theme} />
          </div>
        </div>
      </div>
      {node}
    </Layout>
  );
}

/* ────────────── primitives (admin chrome) ────────────── */

function NeuCard({ children, style }) {
  return (
    <div style={{
      background: ADMIN.bg, borderRadius: 16,
      boxShadow: RAISED_SHADOW, padding: 20, ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
      color: ADMIN.mute, fontFamily: 'JetBrains Mono, monospace',
      marginBottom: 14,
    }}>{children}</div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
      color: ADMIN.mute, fontFamily: 'JetBrains Mono, monospace',
      marginBottom: 6,
    }}>{children}</div>
  );
}

function NeuInput({ value, onChange, placeholder, type = 'text', readOnly = false, prefix }) {
  return (
    <div style={{
      borderRadius: 12, boxShadow: INSET_SHADOW, background: ADMIN.bg,
      display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8,
    }}>
      {prefix && <span style={{ color: ADMIN.mute, fontSize: 13 }}>{prefix}</span>}
      <input
        type={type}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: ADMIN.inkStrong, fontSize: 14, fontFamily: 'inherit',
          width: '100%', cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  );
}

function NeuTextarea({ value, onChange, placeholder, maxLength, rows = 3 }) {
  return (
    <div style={{
      borderRadius: 12, boxShadow: INSET_SHADOW, background: ADMIN.bg, padding: '10px 14px',
    }}>
      <textarea
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          color: ADMIN.inkStrong, fontSize: 14, fontFamily: 'inherit', resize: 'none',
        }}
      />
    </div>
  );
}

function NeuButton({ children, onClick, type = 'button', gold = false, disabled = false, style }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: gold ? ADMIN.accent : ADMIN.bg,
        color: gold ? '#1a1208' : ADMIN.ink,
        fontWeight: gold ? 700 : 500, fontSize: 13, border: 'none',
        borderRadius: 12, padding: '10px 18px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: (pressed && !disabled) ? INSET_SHADOW : RAISED_SHADOW,
        transition: 'box-shadow 80ms ease',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'inherit', letterSpacing: gold ? 0.4 : 0,
        ...style,
      }}
    >{children}</button>
  );
}

function ToneCard({ name, active, onClick }) {
  const tone = TONES[name];
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      style={{
        padding: 8, borderRadius: 12,
        background: ADMIN.bg, border: 'none', cursor: 'pointer',
        boxShadow: active ? `0 0 0 2px ${ADMIN.accent}, ${INSET_SHADOW}` : RAISED_SHADOW,
        transition: 'box-shadow 120ms ease',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        height: 36, borderRadius: 8, marginBottom: 6,
        background: tone.base,
        boxShadow: 'inset 0 0 8px rgba(0,0,0,0.15)',
      }} />
      <div style={{
        fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase',
        color: active ? ADMIN.accent : ADMIN.ink, fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace',
      }}>{name}</div>
    </button>
  );
}

function AccentSwatch({ value, active, onClick }) {
  return (
    <button
      type="button" onClick={onClick} title={value}
      style={{
        width: 38, height: 38, borderRadius: '50%',
        background: value, border: 'none', cursor: 'pointer',
        boxShadow: active ? `0 0 0 2px ${ADMIN.accent}, ${INSET_SHADOW}` : RAISED_SHADOW,
        transition: 'box-shadow 120ms ease',
      }}
    />
  );
}

function NeuToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        position: 'relative',
        width: 52, height: 28, borderRadius: 999,
        background: ADMIN.bg, border: 'none', cursor: 'pointer',
        boxShadow: INSET_SHADOW,
        padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 27 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: on ? ADMIN.accent : ADMIN.ink,
        boxShadow: '2px 2px 6px rgba(0,0,0,0.5)',
        transition: 'left 140ms ease, background 140ms ease',
      }} />
    </button>
  );
}

/* ────────────── phone preview (uses live theme) ────────────── */

function PhonePreview({ profile, deals, theme }) {
  const tone = TONES[theme.tone];
  const { accent, radius, gradient } = theme;
  const activeDeals = (deals || []).filter((d) => ['New', 'Marketed', 'Under Contract'].includes(d.status));
  const previewDeals = activeDeals.slice(0, 2);
  const displayInitials = profile.initials || initialsOf(profile.name || profile.handle || 'A');
  const links = profile.socialLinks || {};
  const visibleSocials = SOCIALS.filter((s) => (links[s.key] || '').trim());
  const [accR, accG, accB] = hex(accent);

  return (
    <div style={{
      width: 320, borderRadius: 36, padding: 12,
      background: ADMIN.bg, boxShadow: RAISED_SHADOW,
    }}>
      <div style={{
        borderRadius: 28, overflow: 'hidden',
        background: neuBg(tone.base, tone.dark, gradient),
        minHeight: 600,
        padding: '24px 18px 22px',
        color: tone.ink,
        fontFamily: NEU_FONT,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: profile.avatarUrl ? `center/cover no-repeat url(${profile.avatarUrl})` : tone.base,
            boxShadow: neuIn(tone.base, tone.dark, 0.95, 10),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: tone.ink, fontWeight: 800, fontSize: 22,
            overflow: 'hidden',
          }}>
            {!profile.avatarUrl && displayInitials}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>@{profile.handle || 'unclaimed'}</div>
          {profile.bio && (
            <div style={{ fontSize: 11, color: tone.mute, textAlign: 'center', maxWidth: 220, lineHeight: 1.45 }}>
              {profile.bio}
            </div>
          )}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 999,
            background: tone.base, boxShadow: neuIn(tone.base, tone.dark, 0.8, 6),
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: tone.ink, fontWeight: 600,
            marginTop: 2,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: 999, background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }} />
            {activeDeals.length} active
          </div>
          {visibleSocials.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {visibleSocials.map(({ key, icon: Icon }) => (
                <span key={key} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.85, 8),
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: tone.ink,
                }}><Icon size={12} /></span>
              ))}
            </div>
          )}
        </div>

        {/* featured-style preview */}
        {previewDeals[0] && (
          <div style={{
            borderRadius: radius, overflow: 'hidden',
            background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.9, 12),
          }}>
            <div style={{
              height: 70,
              background: `linear-gradient(155deg, ${shade(accent, 0.4)} 0%, rgba(${accR},${accG},${accB},0.25) 100%)`,
              position: 'relative',
            }}>
              <span style={{
                position: 'absolute', left: 10, bottom: 8,
                background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
                padding: '3px 8px', borderRadius: 999,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
                letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700,
                color: '#1a1208',
              }}>Featured</span>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tone.ink }}>
                {previewDeals[0].addr || 'Untitled deal'}
              </div>
              <div style={{ fontSize: 9, color: tone.mute, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                Ask ${Number(previewDeals[0].ask || 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* row preview */}
        {previewDeals[1] && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            background: tone.base, borderRadius: radius * 0.7,
            boxShadow: neuOut(tone.base, tone.dark, 0.85, 10),
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: tone.base, boxShadow: neuIn(tone.base, tone.dark, 0.85, 6),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700,
              color: tone.ink,
            }}>{(previewDeals[1].type || '—').slice(0, 4).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: tone.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{previewDeals[1].addr}</div>
              <div style={{ fontSize: 9, color: tone.mute, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                {previewDeals[1].zip || previewDeals[1].city}
              </div>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: tone.ink }}>
              ${Number(previewDeals[1].ask || 0).toLocaleString()}
            </div>
          </div>
        )}

        {previewDeals.length === 0 && (
          <div style={{
            textAlign: 'center', fontSize: 11, padding: 18,
            borderRadius: 12, background: tone.base, color: tone.mute,
            boxShadow: neuIn(tone.base, tone.dark, 0.8, 8),
          }}>No active deals yet</div>
        )}

        {/* footer pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'auto' }}>
          <div style={{
            padding: '7px 14px', borderRadius: 999,
            background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.85, 8),
            fontSize: 10, color: tone.mute, letterSpacing: 0.4,
          }}>
            Join <span style={{ color: tone.ink, fontWeight: 600 }}>@{profile.handle || 'unclaimed'}</span> on DealLink
          </div>
        </div>
      </div>
    </div>
  );
}
