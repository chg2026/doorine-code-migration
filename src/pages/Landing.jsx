import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Kicker, Hairline, Avatar } from '../components/UI.jsx';

export default function Landing() {
  const { state } = useStore();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 600 }}>DealLink</Link>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn sm">Sign in</Link>
          <Link to="/onboarding" className="btn sm solid">Claim your handle →</Link>
        </div>
      </header>

      <section style={{ padding: '80px 32px 60px', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <Kicker style={{ justifyContent: 'center', display: 'inline-block' }}>For real estate wholesalers</Kicker>
        <h1 className="serif" style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 500, lineHeight: 1.05, margin: '24px 0 18px' }}>
          One link for every deal<br />you wholesale.
        </h1>
        <p style={{ fontSize: 16, color: 'var(--mute)', maxWidth: 540, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Share a public profile. Post inventory once. Capture buyers — without the spreadsheet shuffle.
        </p>
        <div style={{ display: 'inline-flex', gap: 10 }}>
          <Link to="/onboarding" className="btn solid">Claim your handle →</Link>
          <Link to={`/p/${state.profile.handle}`} className="btn">View example profile</Link>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
          deallink.io/<u>yourname</u>
        </div>
      </section>

      <Hairline />

      <section style={{ padding: '60px 32px', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
        {[
          ['01', 'A public profile', 'Avatar, handle, bio. Buyers bookmark it. You only post once.'],
          ['02', 'Bulk import deals', 'Drop a CSV. We auto-map columns, flag duplicates, and validate.'],
          ['03', 'Capture lead intent', 'Buyers tap “I’m interested.” Name, email, phone, buyer type.'],
          ['04', 'See who’s knocking', 'A clean leads inbox tied to each deal — no Slack DMs lost.'],
        ].map(([n, t, d]) => (
          <div key={n}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', letterSpacing: 1.4 }}>{n}</div>
            <div className="serif" style={{ fontSize: 20, marginTop: 6 }}>{t}</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </section>

      <Hairline />

      <section style={{ padding: '60px 32px', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <Kicker>Sample wholesaler</Kicker>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Avatar size={64} initials="JR" />
          <div className="serif" style={{ fontSize: 22 }}>@jrodriguez.deals</div>
          <Link to={`/p/${state.profile.handle}`} className="btn solid sm">Open profile →</Link>
        </div>
      </section>

      <footer style={{ marginTop: 'auto', padding: '24px 32px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--mono)' }}>
        <span>© 2026 · BuildFlow</span>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  );
}
