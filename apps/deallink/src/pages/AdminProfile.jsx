import React from 'react';
import { Twitter, Linkedin, Instagram, Globe, Upload, Link2, Camera } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { DealLinkAPI } from '../lib/deallink-api.js';
import { initialsOf } from '../lib/utils.js';

const PALETTE = {
  bg: '#161b2e',
  accent: '#F5C518',
  ink: '#c8cfe8',
  mute: '#5a6180',
  inkStrong: '#eef0fa',
};

const RAISED_SHADOW = '-5px -5px 12px rgba(255,255,255,0.06), 5px 5px 12px rgba(0,0,0,0.55)';
const INSET_SHADOW = 'inset -3px -3px 8px rgba(255,255,255,0.06), inset 3px 3px 8px rgba(0,0,0,0.55)';

const SOLID_SWATCHES = ['#161b2e', '#0f172a', '#1f1147', '#0b3d3a', '#3d1212', '#1b1b1b'];
const GRADIENT_SWATCHES = [
  'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
  'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  'linear-gradient(135deg, #fc5c7d 0%, #6a82fb 100%)',
  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  'linear-gradient(135deg, #f5c518 0%, #e85a00 100%)',
];

const SOCIALS = [
  { key: 'twitter', label: 'Twitter / X', icon: Twitter, placeholder: 'https://x.com/yourhandle' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/in/you' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/you' },
  { key: 'website', label: 'Website', icon: Globe, placeholder: 'https://your-site.com' },
];

function NeuCard({ children, style }) {
  return (
    <div style={{
      background: PALETTE.bg,
      borderRadius: 16,
      boxShadow: RAISED_SHADOW,
      padding: 20,
      ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: PALETTE.mute,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      marginBottom: 14,
    }}>{children}</div>
  );
}

function NeuInput({ value, onChange, placeholder, type = 'text', readOnly = false, maxLength, style, prefix }) {
  return (
    <div style={{
      borderRadius: 12,
      boxShadow: INSET_SHADOW,
      background: PALETTE.bg,
      display: 'flex',
      alignItems: 'center',
      padding: '10px 14px',
      gap: 8,
      ...style,
    }}>
      {prefix && <span style={{ color: PALETTE.mute, fontSize: 13 }}>{prefix}</span>}
      <input
        type={type}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: PALETTE.inkStrong,
          fontSize: 14,
          fontFamily: 'inherit',
          width: '100%',
          cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  );
}

function NeuTextarea({ value, onChange, placeholder, maxLength, rows = 3 }) {
  return (
    <div style={{
      borderRadius: 12,
      boxShadow: INSET_SHADOW,
      background: PALETTE.bg,
      padding: '10px 14px',
    }}>
      <textarea
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: PALETTE.inkStrong,
          fontSize: 14,
          fontFamily: 'inherit',
          resize: 'none',
        }}
      />
    </div>
  );
}

function NeuButton({ children, onClick, type = 'button', gold = false, disabled = false, style }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: gold ? PALETTE.accent : PALETTE.bg,
        color: gold ? '#1a1208' : PALETTE.ink,
        fontWeight: gold ? 700 : 500,
        fontSize: 13,
        border: 'none',
        borderRadius: 12,
        padding: '10px 18px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: (pressed && !disabled) ? INSET_SHADOW : RAISED_SHADOW,
        transition: 'box-shadow 80ms ease',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: 'inherit',
        letterSpacing: gold ? 0.4 : 0,
        ...style,
      }}
    >{children}</button>
  );
}

function NeuSwatch({ value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: value,
        border: 'none',
        cursor: 'pointer',
        boxShadow: active
          ? `0 0 0 2px ${PALETTE.accent}, ${INSET_SHADOW}`
          : RAISED_SHADOW,
        transition: 'box-shadow 120ms ease',
      }}
    />
  );
}

function BackgroundTab({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 0',
        background: PALETTE.bg,
        color: active ? PALETTE.accent : PALETTE.mute,
        border: 'none',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: active ? INSET_SHADOW : 'none',
        fontFamily: 'inherit',
        letterSpacing: 0.3,
      }}
    >{label}</button>
  );
}

export default function AdminProfile() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [form, setForm] = React.useState(state.profile);
  const [bgTab, setBgTab] = React.useState(() => state.profile.backgroundType || 'solid');
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (state.loaded) {
      setForm(state.profile);
      setBgTab(state.profile.backgroundType || 'solid');
    }
  }, [state.loaded, state.profile]);

  if (!state.loaded) {
    return <Layout><div style={{ padding: 80, textAlign: 'center', color: PALETTE.mute, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Loading profile…</div></Layout>;
  }

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function setSocial(key, val) {
    setForm((f) => ({ ...f, socialLinks: { ...(f.socialLinks || {}), [key]: val } }));
  }

  function pickBgTab(tab) {
    setBgTab(tab);
    if (tab !== form.backgroundType) {
      const firstByTab = tab === 'gradient' ? GRADIENT_SWATCHES[0] : tab === 'solid' ? SOLID_SWATCHES[0] : '';
      setForm((f) => ({ ...f, backgroundType: tab, backgroundValue: firstByTab }));
    }
  }

  function pickSwatch(val) {
    setForm((f) => ({ ...f, backgroundValue: val }));
  }

  function onUploadClick() { fileInputRef.current?.click(); }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setField('avatarUrl', ev.target?.result || '');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function onUseUrl() {
    const url = window.prompt('Image URL', form.avatarUrl || '');
    if (url == null) return;
    setField('avatarUrl', url.trim());
  }

  function onBgImageUrl() {
    const url = window.prompt('Background image URL', form.backgroundType === 'image' ? (form.backgroundValue || '') : '');
    if (url == null) return;
    setForm((f) => ({ ...f, backgroundType: 'image', backgroundValue: url.trim() }));
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const updated = await DealLinkAPI.patchProfile({
        handle: state.profile.handle || form.handle || '',
        avatarUrl: form.avatarUrl || '',
        bio: form.bio || '',
        backgroundType: form.backgroundType || 'solid',
        backgroundValue: form.backgroundValue || '',
        socialLinks: form.socialLinks || {},
        name: form.name || '',
      });
      dispatch({ type: 'set_profile', profile: updated });
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
        background: PALETTE.bg,
        color: PALETTE.ink,
        margin: '-16px',
        padding: 24,
        minHeight: 'calc(100vh - 56px)',
      }} className="md:!-m-6 md:p-8">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: PALETTE.inkStrong, margin: 0 }}>Public profile</h1>
          <p style={{ fontSize: 13, color: PALETTE.mute, marginTop: 4 }}>Customize how buyers see your wholesaler page.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)',
          gap: 28,
          alignItems: 'start',
        }}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <NeuCard>
              <SectionTitle>Profile photo</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  boxShadow: RAISED_SHADOW,
                  background: form.avatarUrl ? `center/cover no-repeat url(${form.avatarUrl})` : PALETTE.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1a1208',
                  fontWeight: 800,
                  fontSize: 22,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  {!form.avatarUrl && (form.initials || initialsOf(form.name || form.handle))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <NeuButton onClick={onUploadClick}><Upload size={14} /> Upload photo</NeuButton>
                  <NeuButton onClick={onUseUrl}><Link2 size={14} /> Use URL</NeuButton>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
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
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: bioLen > 110 ? PALETTE.accent : PALETTE.mute }}>
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

            <NeuCard>
              <SectionTitle>Background</SectionTitle>
              <div style={{
                display: 'flex',
                gap: 6,
                padding: 4,
                background: PALETTE.bg,
                borderRadius: 12,
                boxShadow: INSET_SHADOW,
                marginBottom: 16,
              }}>
                <BackgroundTab active={bgTab === 'solid'} label="Solid" onClick={() => pickBgTab('solid')} />
                <BackgroundTab active={bgTab === 'gradient'} label="Gradient" onClick={() => pickBgTab('gradient')} />
                <BackgroundTab active={bgTab === 'image'} label="Image" onClick={() => pickBgTab('image')} />
              </div>

              {bgTab !== 'image' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, justifyItems: 'center' }}>
                  {(bgTab === 'solid' ? SOLID_SWATCHES : GRADIENT_SWATCHES).map((v) => (
                    <NeuSwatch key={v} value={v} active={form.backgroundValue === v} onClick={() => pickSwatch(v)} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    height: 80,
                    borderRadius: 12,
                    boxShadow: INSET_SHADOW,
                    background: form.backgroundValue ? `center/cover no-repeat url(${form.backgroundValue})` : 'transparent',
                  }} />
                  <NeuButton onClick={onBgImageUrl}><Camera size={14} /> Set image URL</NeuButton>
                </div>
              )}
            </NeuCard>

            <NeuCard>
              <SectionTitle>Social links</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SOCIALS.map(({ key, label, icon: Icon, placeholder }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: PALETTE.bg,
                      boxShadow: RAISED_SHADOW,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: PALETTE.ink,
                      flexShrink: 0,
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
            <PhonePreview profile={form} deals={state.deals} />
          </div>
        </div>
      </div>
      {node}
    </Layout>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: PALETTE.mute,
      fontFamily: 'JetBrains Mono, monospace',
      marginBottom: 6,
    }}>{children}</div>
  );
}

function PhonePreview({ profile, deals }) {
  const bgStyle = backgroundStyleFor(profile);
  const activeDeals = (deals || []).filter((d) => ['New', 'Marketed', 'Under Contract'].includes(d.status));
  const previewDeals = activeDeals.slice(0, 2);
  const displayInitials = profile.initials || initialsOf(profile.name || profile.handle || 'A');
  const links = profile.socialLinks || {};
  const visibleSocials = SOCIALS.filter((s) => (links[s.key] || '').trim());

  return (
    <div style={{
      width: 300,
      borderRadius: 36,
      padding: 12,
      background: PALETTE.bg,
      boxShadow: RAISED_SHADOW,
    }}>
      <div style={{
        borderRadius: 28,
        overflow: 'hidden',
        ...bgStyle,
        minHeight: 580,
        padding: '28px 18px 24px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: profile.avatarUrl ? `center/cover no-repeat url(${profile.avatarUrl})` : PALETTE.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a1208',
            fontWeight: 800,
            fontSize: 20,
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}>
            {!profile.avatarUrl && displayInitials}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>@{profile.handle || 'unclaimed'}</div>
          {profile.name && <div style={{ fontSize: 12, opacity: 0.78 }}>{profile.name}</div>}
          {profile.bio && (
            <div style={{ fontSize: 11.5, opacity: 0.85, textAlign: 'center', lineHeight: 1.45, maxWidth: 240 }}>
              {profile.bio}
            </div>
          )}
        </div>

        {visibleSocials.length > 0 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {visibleSocials.map(({ key, icon: Icon, label }) => (
              <span key={key} title={label} style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.14)',
                backdropFilter: 'blur(6px)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}>
                <Icon size={14} />
              </span>
            ))}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 14,
          padding: '10px 8px',
          marginTop: 4,
        }}>
          <Stat label="Active" value={activeDeals.length} />
          <Stat label="Views" value={profile.views ?? '—'} />
          <Stat label="Clicks" value={profile.clicks ?? '—'} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {previewDeals.length === 0 && (
            <div style={{
              textAlign: 'center',
              fontSize: 11,
              padding: 18,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              opacity: 0.75,
            }}>No active deals yet</div>
          )}
          {previewDeals.map((d) => (
            <div key={d.id} style={{
              borderRadius: 14,
              background: 'rgba(0,0,0,0.22)',
              boxShadow: 'inset -2px -2px 6px rgba(255,255,255,0.05), inset 2px 2px 6px rgba(0,0,0,0.55)',
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr || 'Untitled deal'}</div>
                <div style={{ fontSize: 10, opacity: 0.72, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {d.city || d.zip} · {d.type}
                </div>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                ${Number(d.ask || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
      <div style={{
        fontSize: 9,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: 0.7,
        fontFamily: 'JetBrains Mono, monospace',
        marginTop: 2,
      }}>{label}</div>
    </div>
  );
}

export function backgroundStyleFor(profile) {
  const t = profile?.backgroundType || 'solid';
  const v = profile?.backgroundValue || '';
  if (t === 'gradient' && v) return { background: v };
  if (t === 'image' && v) return { background: `center/cover no-repeat url(${v})` };
  return { background: v || PALETTE.bg };
}
