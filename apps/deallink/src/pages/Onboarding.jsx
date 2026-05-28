import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Upload, Plus, Sparkles } from 'lucide-react';
import { useStore, useToast } from '../store.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { TONES, ACCENTS, neuOut, neuIn, neuBg, NEU_FONT } from '../lib/neu.js';
import { supabase } from '../lib/supabase.js';

const TONE_CHOICES = [
  { key: 'Mist', label: 'Mist', desc: 'Light & airy' },
  { key: 'Sand', label: 'Sand', desc: 'Warm beige' },
  { key: 'Ink',  label: 'Ink',  desc: 'Dark & moody' },
  { key: 'Moss', label: 'Moss', desc: 'Quiet green' },
];

const RADIUS_CHOICES = [12, 18, 24, 32];

// Onboarding always renders against the Ink tone — the brand "studio" shell.
const SHELL = {
  base:  '#f5f5f7',
  ink:   '#1d1d1f',
  mute:  '#6e6e73',
  dim:   '#86868b',
};

export default function Onboarding() {
  const { state, dispatch } = useStore();
  const { profile: authProfile, user: authUser } = useAuth();
  const nav = useNavigate();
  const { show, node } = useToast();

  const profile = state.profile || {};
  const authEmail = (authProfile?.email || authUser?.email || '').trim();
  const authFirstName = (authProfile?.first_name || '').trim();
  const authLastName = (authProfile?.last_name || '').trim();

  // Step state — always start at 1 and walk through all five.
  const [step, setStep] = React.useState(1);
  const [busy, setBusy] = React.useState(false);

  // Step 1
  const [handle, setHandle] = React.useState((profile.handle || '').replace(/\.deals$/, ''));
  const [firstName, setFirstName] = React.useState(authFirstName || '');
  const [lastName, setLastName] = React.useState(authLastName || '');
  const [email, setEmail] = React.useState(profile.email || authEmail || '');

  // Step 2
  const [tone, setTone] = React.useState(profile.tone || 'Ink');

  // Step 3
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatarUrl || '');
  const [displayName, setDisplayName] = React.useState(profile.name || [authFirstName, authLastName].filter(Boolean).join(' ') || '');
  const [bio, setBio] = React.useState(profile.bio || '');

  // Step 5
  const [radius, setRadius] = React.useState(Number.isFinite(profile.radius) ? profile.radius : 18);
  const [accentColor, setAccentColor] = React.useState(profile.accentColor || ACCENTS[0]);
  const [gradientEnabled, setGradientEnabled] = React.useState(!!profile.gradientEnabled);

  React.useEffect(() => {
    if (!email && authEmail) setEmail(authEmail);
    if (!firstName && !lastName && (authFirstName || authLastName)) {
      setFirstName(authFirstName);
      setLastName(authLastName);
      setDisplayName([authFirstName, authLastName].filter(Boolean).join(' '));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authEmail, authFirstName, authLastName]);

  const emailLocked = !!authEmail;

  // ─── step actions ───────────────────────────────────────────────────────
  async function saveStep1(e) {
    e?.preventDefault?.();
    if (!handle.trim()) { show('Pick a handle to continue'); return; }
    setBusy(true);
    try {
      const name = [firstName, lastName].filter(Boolean).join(' ').trim() || handle;
      const initials = name.split(/\s+|\./).filter(Boolean).slice(0, 2)
        .map((w) => w[0].toUpperCase()).join('') || handle[0].toUpperCase();
      await dispatch({
        type: 'update_profile',
        patch: {
          handle: handle.trim().toLowerCase() + '.deals',
          email: email.trim(),
          name,
          initials,
          onboarding: { ...(profile.onboarding || {}), claimed: true },
        },
      });
      show('Handle claimed');
      setStep(2);
    } finally { setBusy(false); }
  }

  async function saveStep2() {
    setBusy(true);
    try {
      await dispatch({ type: 'update_profile', patch: { tone } });
      setStep(3);
    } finally { setBusy(false); }
  }

  async function saveStep3() {
    setBusy(true);
    try {
      await dispatch({ type: 'update_profile', patch: { avatarUrl, name: displayName, bio } });
      setStep(4);
    } finally { setBusy(false); }
  }

  async function saveStep5() {
    setBusy(true);
    try {
      await dispatch({
        type: 'update_profile',
        patch: {
          radius,
          accentColor,
          gradientEnabled,
          onboarding: { ...(profile.onboarding || {}), claimed: true, completed: true },
        },
      });
      show('Profile published');
      nav('/admin');
    } finally { setBusy(false); }
  }

  // ─── shell ──────────────────────────────────────────────────────────────
  const pageStyle = {
    minHeight: '100vh',
    background: '#f5f5f7',
    color: SHELL.ink,
    fontFamily: NEU_FONT,
    padding: '32px 16px 64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };
  const cardStyle = {
    width: '100%',
    maxWidth: 480,
    background: '#ffffff',
    borderRadius: 24,
    padding: 24,
    boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)',
  };

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 480, marginBottom: 20 }}>
        <Link to="/" style={{ color: SHELL.mute, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', textDecoration: 'none' }}>
          ← REI Flywheel
        </Link>
        <ProgressBar step={step} />
        <p style={{ fontSize: 11, color: SHELL.dim, marginTop: 8, fontFamily: 'JetBrains Mono, monospace' }}>
          Step {step} of 5
        </p>
      </div>

      <div style={cardStyle}>
        {step === 1 && (
          <Step1
            handle={handle} setHandle={setHandle}
            firstName={firstName} setFirstName={setFirstName}
            lastName={lastName} setLastName={setLastName}
            email={email} setEmail={setEmail}
            emailLocked={emailLocked}
            authFullName={[authFirstName, authLastName].filter(Boolean).join(' ')} authEmail={authEmail}
            onContinue={saveStep1} busy={busy}
          />
        )}
        {step === 2 && (
          <Step2
            tone={tone} setTone={setTone}
            onBack={() => setStep(1)} onContinue={saveStep2} busy={busy}
          />
        )}
        {step === 3 && (
          <Step3
            avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl}
            displayName={displayName} setDisplayName={setDisplayName}
            bio={bio} setBio={setBio}
            onBack={() => setStep(2)} onContinue={saveStep3} busy={busy}
          />
        )}
        {step === 4 && (
          <Step4
            onBack={() => setStep(3)}
            onSkip={() => setStep(5)}
            onCsv={() => nav('/admin/import')}
            onManual={() => nav('/admin/deal/new')}
          />
        )}
        {step === 5 && (
          <Step5
            radius={radius} setRadius={setRadius}
            accentColor={accentColor} setAccentColor={setAccentColor}
            gradientEnabled={gradientEnabled} setGradientEnabled={setGradientEnabled}
            onBack={() => setStep(4)} onPublish={saveStep5} busy={busy}
          />
        )}
      </div>

      {node}
    </div>
  );
}

// ─── progress bar ────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= step;
        return (
          <div
            key={n}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: active ? '#b8860b' : 'rgba(0,0,0,0.08)',
              boxShadow: active ? '0 0 12px rgba(184,134,11,0.45)' : 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)',
              transition: 'background 0.25s ease',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── step kicker ─────────────────────────────────────────────────────────
function Kicker({ children }) {
  return (
    <p style={{
      color: '#b8860b', fontSize: 10, fontWeight: 700, letterSpacing: 2,
      textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', margin: 0,
    }}>{children}</p>
  );
}
function Title({ children }) {
  return (
    <h1 style={{ color: SHELL.ink, fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>{children}</h1>
  );
}
function Sub({ children }) {
  return <p style={{ color: SHELL.mute, fontSize: 13, marginBottom: 24 }}>{children}</p>;
}

// ─── primitives ──────────────────────────────────────────────────────────
function NeuField({ label, children, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: SHELL.mute, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
      {children}
      {hint && <span style={{ color: SHELL.dim, fontSize: 11 }}>{hint}</span>}
    </label>
  );
}
function NeuInput(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 14px',
        borderRadius: 12, border: 'none', outline: 'none',
        background: SHELL.base, color: SHELL.ink, fontSize: 14,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)',
        ...(props.style || {}),
      }}
    />
  );
}
function NeuTextarea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 14px',
        borderRadius: 12, border: 'none', outline: 'none', resize: 'none',
        background: SHELL.base, color: SHELL.ink, fontSize: 14,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)',
        fontFamily: NEU_FONT,
        ...(props.style || {}),
      }}
    />
  );
}
function PrimaryButton({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      style={{
        width: '100%', padding: '12px 16px', borderRadius: 14, border: 'none',
        background: '#b8860b', color: '#1F2230', fontWeight: 700, fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >{children}</button>
  );
}
function GhostButton({ children, onClick, type = 'button' }) {
  return (
    <button
      type={type} onClick={onClick}
      style={{
        padding: '10px 14px', borderRadius: 12, border: 'none',
        background: SHELL.base, color: SHELL.mute, fontSize: 13, cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >{children}</button>
  );
}

// ─── STEP 1 — claim handle ───────────────────────────────────────────────
function Step1({ handle, setHandle, firstName, setFirstName, lastName, setLastName, email, setEmail, emailLocked, authFullName, authEmail, onContinue, busy }) {
  const [checking] = React.useState(false);
  const available = handle.trim().length >= 2;
  return (
    <form onSubmit={onContinue}>
      <Kicker>Claim your handle</Kicker>
      <Title>Pick your REI Flywheel address</Title>
      <Sub>This is the public URL buyers will see.</Sub>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: 4, borderRadius: 14, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)', marginBottom: 16 }}>
        <span style={{ padding: '8px 12px', color: SHELL.dim, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>doorine.com/r/</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
          placeholder="yourname"
          autoFocus
          style={{ flex: 1, background: 'transparent', color: SHELL.ink, border: 'none', outline: 'none', fontSize: 14, padding: '8px 0' }}
        />
        {handle && (
          <span style={{ paddingRight: 12, fontSize: 11, color: available ? '#10B981' : SHELL.dim }}>
            {checking ? 'checking…' : available ? 'available' : 'too short'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <NeuField label="First name">
              <NeuInput value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required />
            </NeuField>
          </div>
          <div style={{ flex: 1 }}>
            <NeuField label="Last name">
              <NeuInput value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rodriguez" />
            </NeuField>
          </div>
        </div>
        {!emailLocked && (
          <NeuField label="Email">
            <NeuInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
          </NeuField>
        )}
        {emailLocked && (
          <div style={{ padding: '10px 12px', borderRadius: 12, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)', color: SHELL.dim, fontSize: 12 }}>
            Signed in as <span style={{ color: SHELL.ink, fontWeight: 600 }}>{authFullName || authEmail}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <PrimaryButton type="submit" disabled={busy || !available}>
          Continue <ArrowRight size={16} />
        </PrimaryButton>
      </div>
    </form>
  );
}

// ─── STEP 2 — theme ──────────────────────────────────────────────────────
function Step2({ tone, setTone, onBack, onContinue, busy }) {
  return (
    <div>
      <Kicker>Pick a theme</Kicker>
      <Title>Choose your tone</Title>
      <Sub>You can change this any time from your profile.</Sub>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {TONE_CHOICES.map((c) => {
          const t = TONES[c.key];
          const selected = tone === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setTone(c.key)}
              style={{
                padding: 14, borderRadius: 16, border: 'none', cursor: 'pointer',
                background: SHELL.base, textAlign: 'left',
                boxShadow: selected ? 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
                outline: selected ? `2px solid #b8860b` : '2px solid transparent',
                transition: 'outline-color 0.15s ease',
              }}
            >
              <div style={{
                width: '100%', height: 48, borderRadius: 10, marginBottom: 10,
                background: t.base,
                boxShadow: t.dark ? 'inset 0 0 0 1px rgba(255,255,255,0.06)' : 'inset 0 0 0 1px rgba(0,0,0,0.05)',
              }} />
              <div style={{ color: SHELL.ink, fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              <div style={{ color: SHELL.dim, fontSize: 11, marginTop: 2 }}>{c.desc}</div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
        <GhostButton onClick={onBack}><ArrowLeft size={14} /> Back</GhostButton>
        <div style={{ flex: 1 }}>
          <PrimaryButton onClick={onContinue} disabled={busy}>
            Continue <ArrowRight size={16} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 3 — profile details ────────────────────────────────────────────
function Step3({ avatarUrl, setAvatarUrl, displayName, setDisplayName, bio, setBio, onBack, onContinue, busy }) {
  const remaining = 160 - (bio || '').length;
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef(null);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop();
    setUploading(true);
    try {
      const path = `profiles/onboarding/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('deal-photos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('deal-photos').getPublicUrl(path);
      setAvatarUrl(urlData.publicUrl);
    } catch (err) {
      alert(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Kicker>Profile details</Kicker>
      <Title>Tell buyers about you</Title>
      <Sub>This shows up at the top of your public page.</Sub>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: SHELL.base,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
              backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: SHELL.dim, fontSize: 11,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {!avatarUrl && (uploading ? '…' : 'PHOTO')}
          </div>
          <div style={{ flex: 1 }}>
            <NeuField label="Profile photo" hint={avatarUrl ? 'Photo uploaded ✓' : 'Click the circle or the button to upload.'}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoUpload}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  width: '100%', padding: '10px 14px',
                  borderRadius: 10, border: '1.5px dashed rgba(0,0,0,0.15)',
                  background: 'transparent', cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: 13, color: SHELL.mute, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Upload size={14} />
                {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
            </NeuField>
          </div>
        </div>

        <NeuField label="Display name">
          <NeuInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="J Rodriguez" />
        </NeuField>

        <NeuField label={`Bio (${Math.max(0, remaining)} left)`}>
          <NeuTextarea
            rows={3}
            maxLength={160}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 160))}
            placeholder="Cleveland wholesaler. Off-market singles & small multis."
          />
        </NeuField>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
        <GhostButton onClick={onBack}><ArrowLeft size={14} /> Back</GhostButton>
        <div style={{ flex: 1 }}>
          <PrimaryButton onClick={onContinue} disabled={busy || uploading}>
            Continue <ArrowRight size={16} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 4 — add deals ──────────────────────────────────────────────────
function Step4({ onBack, onSkip, onCsv, onManual }) {
  return (
    <div>
      <Kicker>Add your deals</Kicker>
      <Title>Get inventory on your page</Title>
      <Sub>You can do this now or later — your call.</Sub>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <OptionCard
          icon={<Upload size={20} />}
          title="Import from CSV"
          desc="One click · auto-mapped columns"
          onClick={onCsv}
        />
        <OptionCard
          icon={<Plus size={20} />}
          title="Add manually"
          desc="One deal at a time"
          onClick={onManual}
        />
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <GhostButton onClick={onBack}><ArrowLeft size={14} /> Back</GhostButton>
        <div style={{ flex: 1 }}>
          <PrimaryButton onClick={onSkip}>
            Skip for now <ArrowRight size={16} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
function OptionCard({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 16, border: 'none', cursor: 'pointer',
        background: SHELL.base, textAlign: 'left',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
        color: SHELL.ink,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: SHELL.base, color: '#b8860b',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)',
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ color: SHELL.dim, fontSize: 12, marginTop: 2 }}>{desc}</div>
      </div>
      <ArrowRight size={16} color={SHELL.mute} />
    </button>
  );
}

// ─── STEP 5 — customize ──────────────────────────────────────────────────
function Step5({ radius, setRadius, accentColor, setAccentColor, gradientEnabled, setGradientEnabled, onBack, onPublish, busy }) {
  return (
    <div>
      <Kicker>Customize</Kicker>
      <Title>Make it yours</Title>
      <Sub>Tweak the corners, accent, and depth.</Sub>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <SectionLabel>Corner radius</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {RADIUS_CHOICES.map((r) => {
              const selected = radius === r;
              return (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  style={{
                    padding: '14px 0', border: 'none', cursor: 'pointer',
                    background: SHELL.base, color: SHELL.ink, fontWeight: 700, fontSize: 13,
                    borderRadius: r,
                    boxShadow: selected ? 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
                    outline: selected ? `2px solid ${accentColor}` : '2px solid transparent',
                  }}
                >{r}</button>
              );
            })}
          </div>
        </div>

        <div>
          <SectionLabel>Accent color</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {ACCENTS.map((c) => {
              const selected = accentColor === c;
              return (
                <button
                  key={c}
                  onClick={() => setAccentColor(c)}
                  aria-label={c}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: c,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
                    outline: selected ? '3px solid #b8860b' : '3px solid transparent',
                    outlineOffset: 2,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <SectionLabel>Gradient background</SectionLabel>
          <button
            onClick={() => setGradientEnabled(!gradientEnabled)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '12px 16px', border: 'none', cursor: 'pointer',
              background: SHELL.base, color: SHELL.ink, borderRadius: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
              <Sparkles size={14} color="#b8860b" />
              {gradientEnabled ? 'On' : 'Off'}
            </span>
            <span style={{
              width: 44, height: 24, borderRadius: 999, position: 'relative',
              background: gradientEnabled ? '#b8860b' : 'rgba(0,0,0,0.08)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)',
              transition: 'background 0.2s ease',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: gradientEnabled ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
              }} />
            </span>
          </button>
        </div>
      </div>

      <div style={{ marginTop: 28, display: 'flex', gap: 10 }}>
        <GhostButton onClick={onBack}><ArrowLeft size={14} /> Back</GhostButton>
        <div style={{ flex: 1 }}>
          <PrimaryButton onClick={onPublish} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish profile'} <ArrowRight size={16} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{
      color: SHELL.mute, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', marginBottom: 10, fontFamily: 'JetBrains Mono, monospace',
    }}>{children}</div>
  );
}
