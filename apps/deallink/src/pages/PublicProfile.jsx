import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PublicAPI } from '../lib/deallink-api.js';
import { Avatar, Kicker, Stripe, Hairline, Tag, Modal, Field } from '../components/LegacyPublicUI.jsx';

// Public, unauthenticated wholesaler profile page. Fetches from
// /api/deallink/public/:handle so RLS + the server's hide_street masking
// (in routes/deallink-public.js) are the source of truth — no admin data
// ever flows through this page.
export default function PublicProfile() {
  const { handle } = useParams();
  const [data, setData] = React.useState({ profile: null, deals: [] });
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [view, setView] = React.useState('cards');
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    PublicAPI.getProfile(handle).then((res) => {
      if (cancelled) return;
      if (!res) { setNotFound(true); setLoading(false); return; }
      setData(res);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [handle]);

  if (loading) {
    return (
      <div className="public-page">
        <div className="public-frame" style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !data.profile) {
    return (
      <div className="public-page">
        <div className="public-frame" style={{ textAlign: 'center', padding: 40 }}>
          <Kicker>Not found</Kicker>
          <div className="serif" style={{ fontSize: 24, marginTop: 12 }}>@{handle}</div>
          <div style={{ marginTop: 8, color: 'var(--mute)', fontSize: 13 }}>This profile doesn't exist.</div>
          <Link to="/" className="btn sm" style={{ marginTop: 20 }}>Back home</Link>
        </div>
      </div>
    );
  }

  const profile = data.profile;
  const visible = data.deals; // server already filters out sold
  const featured = visible.find((d) => d.id === profile.featuredId) || visible[0];
  const others = visible.filter((d) => !featured || d.id !== featured.id);

  const filtered = others.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'sfr') return d.type === 'SFR';
    if (filter === 'mf') return d.type === 'MF' || d.type === 'DUP';
    if (filter === 'under150') return d.ask < 150;
    if (filter === 'vacant') return d.occ === 'Vacant';
    return true;
  });

  return (
    <div className="public-page">
      <div className="public-frame">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 4px 18px' }}>
          <Avatar size={72} initials={profile.initials} />
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>@{profile.handle}</div>
          <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.5, maxWidth: 320 }}>{profile.bio}</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }}>{visible.length}</div>
            <div className="kicker" style={{ marginTop: 2, letterSpacing: 0.8 }}>Active Deals</div>
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setJoinOpen(true)}>Join buyer list</button>
        </div>

        {featured && (
          <Link to={`/p/${profile.handle}/${featured.id}`} className="featured-card" style={{ marginBottom: 18 }}>
            <div style={{ position: 'relative' }}>
              <Stripe height={140} label="Featured" style={{ border: 'none', borderRadius: 0 }} />
              <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.92)', padding: '4px 10px', borderRadius: 999, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Featured</span>
            </div>
            <div style={{ padding: '16px 18px 18px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{featured.addr}</div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 3, fontFamily: 'var(--mono)' }}>{featured.city} · {featured.units}-unit · {Number(featured.sqft).toLocaleString()}sf</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontFamily: 'var(--mono)', fontSize: 12 }}>
                <span><span style={{ color: 'var(--mute)' }}>Ask </span><b>${featured.ask}k</b></span>
                <span><span style={{ color: 'var(--mute)' }}>ARV </span><b>${featured.arv}k</b></span>
                <span><span style={{ color: 'var(--mute)' }}>Spread </span><b>${featured.arv - featured.ask}k</b></span>
              </div>
            </div>
          </Link>
        )}

        <div style={{ display: 'flex', gap: 6, padding: '0 2px 12px', overflowX: 'auto' }}>
          {[
            ['all', `All ${others.length}`],
            ['sfr', 'SFR'],
            ['mf', 'MF / Duplex'],
            ['under150', '< $150k'],
            ['vacant', 'Vacant'],
          ].map(([k, l]) => (
            <Tag key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Tag>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 10px' }}>
          <Kicker>Active Deals · {filtered.length}</Kicker>
          <div className="kicker" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <button onClick={() => setView('cards')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: view === 'cards' ? 'var(--ink)' : 'var(--mute)', fontWeight: view === 'cards' ? 600 : 400 }}>Cards</button>
            <span style={{ color: 'var(--dim)' }}> / </span>
            <button onClick={() => setView('table')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: view === 'table' ? 'var(--ink)' : 'var(--mute)', fontWeight: view === 'table' ? 600 : 400 }}>Table</button>
          </div>
        </div>

        {filtered.length === 0 && <EmptyDeals />}

        {view === 'cards'
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((d) => (
                <Link key={d.id} to={`/p/${profile.handle}/${d.id}`} className="deal-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="ellipsis" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
                      {d.new && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--ink)', background: 'rgba(28,28,28,0.06)', padding: '2px 6px', borderRadius: 999, letterSpacing: 0.6 }}>NEW</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                      {d.zip} · {d.type} · {d.beds}/{d.baths} · {d.sqft}sf
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <div style={{ fontWeight: 600 }}>${d.ask}k</div>
                    <div style={{ color: 'var(--mute)', fontSize: 10 }}>ARV ${d.arv}k</div>
                  </div>
                </Link>
              ))}
            </div>
          : <div style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', padding: '10px 14px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', letterSpacing: 1, textTransform: 'uppercase' }}>
                <span>Address</span><span style={{ textAlign: 'right' }}>Ask / ARV</span>
              </div>
              {filtered.map((d) => (
                <Link key={d.id} to={`/p/${profile.handle}/${d.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', padding: '10px 14px', borderBottom: '1px solid var(--line)', alignItems: 'center', color: 'var(--ink)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontSize: 12, fontWeight: 500 }}>{d.addr}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{d.zip} · {d.beds}/{d.baths}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <div style={{ fontWeight: 600 }}>${d.ask}k</div>
                    <div style={{ color: 'var(--mute)', fontSize: 10 }}>${d.arv}k</div>
                  </div>
                </Link>
              ))}
            </div>}

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
          Powered by <Link to="/" style={{ textDecoration: 'underline', color: 'var(--mute)' }}>deallink.io</Link>
        </div>
      </div>

      {joinOpen && <JoinListModal handle={profile.handle} onClose={() => setJoinOpen(false)} onSubmitted={() => { setJoinOpen(false); showToast("You're on the list"); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function EmptyDeals() {
  return (
    <div className="empty-state">
      <div style={{ fontFamily: 'var(--mono)', fontSize: 24, color: 'var(--dim)' }}>∅</div>
      <div className="serif" style={{ fontSize: 18, marginTop: 8, color: 'var(--ink)' }}>No active deals</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>Check back next Monday — or join the buyer list to be notified.</div>
    </div>
  );
}

function JoinListModal({ handle, onClose, onSubmitted }) {
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !first.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await PublicAPI.submitLead(handle, { first, last, email, phone, buyerType: 'Cash', kind: 'buyer-list' });
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Kicker>Join buyer list</Kicker>
      <div className="serif" style={{ fontSize: 18, marginTop: 6 }}>Get Monday's drops first.</div>
      <form onSubmit={submit} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="First name"><input value={first} onChange={(e) => setFirst(e.target.value)} required /></Field>
          <Field label="Last name"><input value={last} onChange={(e) => setLast(e.target.value)} /></Field>
        </div>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {error && <div style={{ fontSize: 12, color: 'var(--err)' }}>{error}</div>}
        <button className="btn solid full" type="submit" disabled={submitting}>{submitting ? 'Subscribing…' : 'Subscribe'}</button>
      </form>
    </Modal>
  );
}
