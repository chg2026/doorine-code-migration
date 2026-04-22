import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Avatar, Field, Modal, Stripe, Hairline } from '../components/UI.jsx';

export default function Onboarding() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [choiceOpen, setChoiceOpen] = React.useState(false);
  const [step, setStep] = React.useState(state.auth.signedIn ? 'checklist' : 'claim');
  const [handle, setHandle] = React.useState(state.profile.handle.replace(/\.deals$/, ''));
  const [email, setEmail] = React.useState(state.profile.email || '');
  const [name, setName] = React.useState(state.profile.name || '');

  function claim(e) {
    e.preventDefault();
    if (!handle.trim()) return;
    const initials = (name || handle).split(/\s+|\./).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || handle[0].toUpperCase();
    dispatch({ type: 'update_profile', patch: { handle: handle.trim().toLowerCase() + '.deals', email: email.trim(), name: name.trim() || handle, initials } });
    dispatch({ type: 'sign_in' });
    dispatch({ type: 'update_onboarding', patch: { claimed: true } });
    setStep('checklist');
    show('Profile claimed');
  }

  if (step === 'claim') return <ClaimStep handle={handle} setHandle={setHandle} email={email} setEmail={setEmail} name={name} setName={setName} onSubmit={claim} toast={node} />;

  const items = [
    ['01', 'Claim your handle', 'Done', state.onboarding.claimed],
    ['02', 'Add your first deal', 'Manual or CSV import', state.onboarding.addedDeal || state.deals.length > 0],
    ['03', 'Upload photos (optional)', 'Assign to deals', state.onboarding.uploadedPhotos],
    ['04', 'Share your link', `deallink.io/${state.profile.handle}`, state.onboarding.shared],
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>← DealLink</Link>
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <Avatar size={64} initials={state.profile.initials || '?'} />
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>@{state.profile.handle}</div>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>Let's get your profile live</div>
        </div>

        <div style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 4 }}>
          {items.map(([n, t, d, done], i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>{n}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{t}</div>
                <div style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--mono)', marginTop: 2 }}>{d}</div>
              </div>
              {done
                ? <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>✓</span>
                : <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--mute)' }}>→</span>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          {!(state.onboarding.addedDeal || state.deals.length > 0)
            ? <button className="btn solid full" onClick={() => setChoiceOpen(true)}>Add first deal</button>
            : !state.onboarding.shared
              ? <button className="btn solid full" onClick={() => { dispatch({ type: 'update_onboarding', patch: { shared: true } }); navigator.clipboard?.writeText(`https://deallink.io/${state.profile.handle}`); show('Link copied'); }}>Copy your link</button>
              : <Link to="/admin" className="btn solid full">Open dashboard →</Link>}
        </div>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Link to="/admin" style={{ fontSize: 12, color: 'var(--mute)', textDecoration: 'underline' }}>Skip to dashboard</Link>
        </div>
      </div>

      {choiceOpen && (
        <Modal onClose={() => setChoiceOpen(false)}>
          <Kicker>Add your deals</Kicker>
          <div className="serif" style={{ fontSize: 22, marginTop: 6, lineHeight: 1.2 }}>How do you want to start?</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="btn solid"
              style={{ padding: '16px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12 }}
              onClick={() => { setChoiceOpen(false); nav('/admin/import'); }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Import from CSV</div>
                <div style={{ fontSize: 10, marginTop: 3, opacity: 0.7, fontFamily: 'var(--mono)' }}>One click · auto-mapped columns</div>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>→</span>
            </button>
            <button
              className="btn"
              style={{ padding: '16px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12 }}
              onClick={() => { setChoiceOpen(false); nav('/admin/deal/new'); }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Add manually</div>
                <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 3, fontFamily: 'var(--mono)' }}>One deal at a time</div>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mute)' }}>→</span>
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 14, textAlign: 'center' }}>You can mix both · add photos after.</div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function ClaimStep({ handle, setHandle, email, setEmail, name, setName, onSubmit, toast }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 32 }}>← DealLink</Link>
      <div className="kicker">Claim your handle</div>
      <div className="serif" style={{ fontSize: 'clamp(24px, 4vw, 34px)', marginTop: 12, textAlign: 'center', lineHeight: 1.1 }}>
        deallink.io/<span style={{ borderBottom: '1px dashed var(--ink)', paddingBottom: 2 }}>{handle || 'yourname'}</span>
      </div>

      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 360, marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Your handle">
          <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--line)', background: 'var(--card)' }}>
            <span style={{ padding: '10px 12px', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12, borderRight: '1px solid var(--line)' }}>deallink.io/</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9.-]/gi, ''))}
              placeholder="yourname"
              style={{ border: 'none', borderRadius: 0, flex: 1 }}
              autoFocus
            />
            <span style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)' }}>{handle ? '✓ available' : ''}</span>
          </div>
        </Field>
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="J Rodriguez" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
        </Field>
        <button type="submit" className="btn solid full">Create profile →</button>
        <div style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center' }}>Already have one? <Link to="/login" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Sign in</Link></div>
      </form>
      {toast}
    </div>
  );
}
