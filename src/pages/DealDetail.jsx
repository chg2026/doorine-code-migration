import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Hairline, Stripe, Status, Modal, Field } from '../components/UI.jsx';

export default function DealDetail() {
  const { handle, dealId } = useParams();
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [open, setOpen] = React.useState(false);

  if (state.profile.handle !== handle) {
    return (
      <div className="public-page"><div className="public-frame" style={{ textAlign: 'center', padding: 40 }}>
        <Kicker>Not found</Kicker><Link to="/" className="btn sm" style={{ marginTop: 20 }}>Home</Link>
      </div></div>
    );
  }
  const d = state.deals.find(x => x.id === dealId);
  if (!d) {
    return (
      <div className="public-page"><div className="public-frame" style={{ textAlign: 'center', padding: 40 }}>
        <Kicker>Deal not found</Kicker>
        <Link to={`/p/${handle}`} className="btn sm" style={{ marginTop: 20 }}>Back to profile</Link>
      </div></div>
    );
  }

  const addr = d.hideStreet ? d.addr.replace(/^\d+\s+/, '— ') : d.addr;
  const rows = [
    ['Address', addr],
    ['City / ZIP', `${d.city} ${d.zip}`],
    ['Type', typeLabel(d.type)],
    ['Units', `${d.units}`],
    ['Beds / Baths', `${d.beds} / ${d.baths}`],
    ['Sqft', d.sqft.toLocaleString()],
    ['Occupancy', d.occ],
    ['Access', d.access],
    ['Asking', `$${d.ask.toLocaleString()},000`],
    ['ARV', `$${d.arv.toLocaleString()},000`],
    ['Spread', `$${(d.arv - d.ask).toLocaleString()},000`],
  ];

  return (
    <div className="public-page" style={{ paddingBottom: 96 }}>
      <div className="public-frame">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Link to={`/p/${handle}`} style={{ fontSize: 12, color: 'var(--mute)' }}>← {state.profile.handle}</Link>
          <Status kind={d.status} />
        </div>

        <Kicker>Deal · #{d.id.toUpperCase()}</Kicker>
        <div className="serif" style={{ fontSize: 22, marginTop: 6, lineHeight: 1.2 }}>{addr}</div>

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
            {[0, 1, 2, 3].map(i => <Stripe key={i} height={70} />)}
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '14px 20px 18px', borderTop: '1px solid var(--line)', background: 'var(--bg)', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => setOpen(true)}
          disabled={d.status === 'sold'}
          style={{ width: '100%', maxWidth: 420, background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 14, padding: '16px 20px', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, letterSpacing: -0.1, cursor: d.status === 'sold' ? 'not-allowed' : 'pointer', opacity: d.status === 'sold' ? 0.5 : 1 }}
        >
          {d.status === 'sold' ? 'This deal has been sold' : "I'm interested"}
        </button>
      </div>

      {open && <LeadModal deal={d} onClose={() => setOpen(false)} onSubmit={(lead) => {
        dispatch({ type: 'add_lead', lead: { ...lead, dealId: d.id, kind: 'deal-interest' } });
        setOpen(false);
        show('Request sent — they\'ll be in touch.');
      }} />}
      {node}
    </div>
  );
}

function typeLabel(t) {
  return ({ SFR: 'Single Family', MF: 'Multi-Family', DUP: 'Duplex' })[t] || t;
}

function LeadModal({ deal, onClose, onSubmit }) {
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [buyerType, setBuyerType] = React.useState('Cash');

  function submit(e) {
    e.preventDefault();
    if (!first.trim() || !email.trim() || !phone.trim()) return;
    onSubmit({ first, last, email, phone, buyerType });
  }

  return (
    <Modal onClose={onClose}>
      <Kicker>Interested in</Kicker>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{deal.hideStreet ? deal.addr.replace(/^\d+\s+/, '— ') : deal.addr}</div>
      <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2, fontFamily: 'var(--mono)' }}>${deal.ask}k / ${deal.arv}k ARV</div>
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
        <button className="btn solid full" type="submit" style={{ marginTop: 8, padding: '14px', borderRadius: 14, fontSize: 14 }}>Send request</button>
        <div style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center', marginTop: 4 }}>You'll also join the weekly buyer list.</div>
      </form>
    </Modal>
  );
}
