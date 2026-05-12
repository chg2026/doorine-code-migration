import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PublicAPI } from '../lib/deallink-api.js';
import { Kicker, Hairline, Stripe, Status, Modal, Field } from '../components/LegacyPublicUI.jsx';

export default function DealDetail() {
  const { handle, dealId } = useParams();
  const [state, setState] = React.useState({ loading: true, profile: null, deal: null, error: null });
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function showToast(m) { setToast(m); setTimeout(() => setToast(null), 2400); }

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, profile: null, deal: null, error: null });
    PublicAPI.getDeal(handle, dealId).then((res) => {
      if (cancelled) return;
      if (!res) { setState({ loading: false, profile: null, deal: null, error: 'not-found' }); return; }
      setState({ loading: false, profile: res.profile, deal: res.deal, error: null });
    }).catch(() => { if (!cancelled) setState({ loading: false, profile: null, deal: null, error: 'not-found' }); });
    return () => { cancelled = true; };
  }, [handle, dealId]);

  if (state.loading) {
    return (
      <div className="public-page">
        <div className="public-frame" style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (state.error || !state.deal) {
    return (
      <div className="public-page"><div className="public-frame" style={{ textAlign: 'center', padding: 40 }}>
        <Kicker>Deal not found</Kicker>
        <Link to={`/p/${handle}`} className="btn sm" style={{ marginTop: 20 }}>Back to profile</Link>
      </div></div>
    );
  }

  const d = state.deal;
  const rows = [
    ['Address', d.addr],
    ['City / ZIP', `${d.city} ${d.zip}`],
    ['Type', typeLabel(d.type)],
    ['Units', `${d.units}`],
    ['Beds / Baths', `${d.beds} / ${d.baths}`],
    ['Sqft', Number(d.sqft).toLocaleString()],
    ['Occupancy', d.occ],
    ['Access', d.access],
    ['Asking', `$${Number(d.ask || 0).toLocaleString()}`],
    ['ARV', `$${Number(d.arv || 0).toLocaleString()}`],
    ['Spread', `$${Number((d.arv || 0) - (d.ask || 0)).toLocaleString()}`],
  ];

  return (
    <div className="public-page" style={{ paddingBottom: 96 }}>
      <div className="public-frame">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Link to={`/p/${handle}`} style={{ fontSize: 12, color: 'var(--mute)' }}>← {state.profile?.handle || handle}</Link>
          <Status kind={d.status} />
        </div>

        <Kicker>Deal · #{String(d.id || '').slice(0, 8).toUpperCase()}</Kicker>
        <div className="serif" style={{ fontSize: 22, marginTop: 6, lineHeight: 1.2 }}>{d.addr}</div>

        <Hairline style={{ margin: '18px 0 0' }} />
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderTop: 'none' }}>
          {rows.map(([l, v]) => (
            <div key={l} className="spec-row">
              <span className="l">{l}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>

        {d.notes && (
          <div style={{ marginTop: 18 }}>
            <Kicker>Notes</Kicker>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>{d.notes}</div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <Kicker>Photos · placeholder</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 8 }}>
            {[0, 1, 2, 3].map((i) => <Stripe key={i} height={70} />)}
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '14px 20px 18px', borderTop: '1px solid var(--line)', background: 'var(--bg)', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => setOpen(true)}
          disabled={d.status === 'Closed'}
          style={{ width: '100%', maxWidth: 420, background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 14, padding: '16px 20px', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, letterSpacing: -0.1, cursor: d.status === 'Closed' ? 'not-allowed' : 'pointer', opacity: d.status === 'Closed' ? 0.5 : 1 }}
        >
          {d.status === 'Closed' ? 'This deal has been sold' : "I'm interested"}
        </button>
      </div>

      {open && <LeadModal handle={handle} deal={d} onClose={() => setOpen(false)} onSubmitted={() => { setOpen(false); showToast("Request sent — they'll be in touch."); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function typeLabel(t) {
  return ({ SFR: 'Single Family', MF: 'Multi-Family', DUP: 'Duplex' })[t] || t;
}

function LeadModal({ handle, deal, onClose, onSubmitted }) {
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [buyerType, setBuyerType] = React.useState('Cash');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!first.trim() || !email.trim() || !phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await PublicAPI.submitLead(handle, { first, last, email, phone, buyerType, dealId: deal.id, kind: 'deal-interest' });
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Kicker>Interested in</Kicker>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{deal.addr}</div>
      <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2, fontFamily: 'var(--mono)' }}>${Number(deal.ask || 0).toLocaleString()} / ${Number(deal.arv || 0).toLocaleString()} ARV</div>
      <form onSubmit={submit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="First name"><input value={first} onChange={(e) => setFirst(e.target.value)} required autoFocus /></Field>
          <Field label="Last name"><input value={last} onChange={(e) => setLast(e.target.value)} /></Field>
        </div>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
        <Field label="Buyer type">
          <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)}>
            <option>Cash</option>
            <option>Hard money</option>
            <option>Agent</option>
            <option>JV partner</option>
            <option>Other</option>
          </select>
        </Field>
        {error && <div style={{ fontSize: 12, color: 'var(--err)' }}>{error}</div>}
        <button className="btn solid full" type="submit" disabled={submitting} style={{ marginTop: 8, padding: '14px', borderRadius: 14, fontSize: 14 }}>{submitting ? 'Sending…' : 'Send request'}</button>
        <div style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center', marginTop: 4 }}>You'll also join the weekly buyer list.</div>
      </form>
    </Modal>
  );
}
