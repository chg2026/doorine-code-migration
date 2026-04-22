// public-profile.jsx — 4 wireframe directions for the public wholesaler page
// All at 320x660 content (fits inside iOS frame later).

// ─────────── A. Linktree-esque stacked rows ───────────
// Wholesaler card on top, then a vertical stack of one-tap deal rows.
function PublicA() {
  return (
    <PhoneScroll>
      <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <Avatar size={64} initials="JR" />
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>@jrodriguez.deals</div>
        <div style={{ fontSize: 12, color: WK.mute, lineHeight: 1.5, maxWidth: 260 }}>
          DFW wholesaler · 140+ closed since 2019 · Off-market inventory weekly
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
          {[['140','Closed'],['7','Active'],['$2.1M','Avg ARV']].map(([n,l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
              <div style={{ fontSize: 9, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <Btn solid full sm style={{ marginTop: 10, width: '100%' }}>Join buyer list →</Btn>
      </div>

      <Hairline />

      <div style={{ padding: '14px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Kicker>Active Deals · 5</Kicker>
        <Kicker style={{ textTransform: 'none', letterSpacing: 0 }}>Cards / <span style={{ color: WK.ink }}>Table</span></Kicker>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DEALS.filter(d => d.status === 'active').slice(0,4).map(d => (
          <div key={d.id} style={{ background: WK.card, border: `1px solid ${WK.line}`, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Stripe h={56} label="" style={{ width: 56, flexShrink: 0, border: `1px solid ${WK.line}` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
              <div style={{ fontSize: 10, color: WK.mute, marginTop: 2 }}>{d.zip} · {d.beds}bd · {d.baths}ba · {d.sqft}sf</div>
              <div style={{ fontSize: 11, marginTop: 4, fontFamily: WK.mono }}>
                ${d.ask}k <span style={{ color: WK.mute }}>→ ${d.arv}k ARV</span>
              </div>
            </div>
            <svg width="8" height="12" viewBox="0 0 8 12" style={{ color: WK.dim, flexShrink: 0 }}><path d="M1 1l6 5-6 5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </div>
        ))}
      </div>
    </PhoneScroll>
  );
}

// ─────────── B. Data-forward list, no photos ───────────
// Terminal-like. Emphasizes cash-buyer scanning: address, price, ARV, spread.
function PublicB() {
  return (
    <PhoneScroll>
      <div style={{ padding: '4px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={36} initials="JR" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>J Rodriguez</div>
            <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono }}>jrodriguez.deals · DFW</div>
          </div>
          <div style={{ marginLeft: 'auto' }}><Btn sm>Follow</Btn></div>
        </div>
      </div>

      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, overflow: 'hidden' }}>
        {['All 5','SFR','MF','< $150k','Vacant','75215'].map((t,i) => <Tag key={t} active={i===0}>{t}</Tag>)}
      </div>

      <Hairline />

      <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'space-between', fontFamily: WK.mono, fontSize: 9, color: WK.dim, letterSpacing: 1, textTransform: 'uppercase' }}>
        <span>Address</span><span>Ask / ARV</span>
      </div>
      <Hairline />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {DEALS.filter(d => d.status !== 'sold').slice(0,6).map((d,i) => (
          <div key={d.id}>
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
                  {d.new && <span style={{ fontFamily: WK.mono, fontSize: 8, color: WK.ink, border: `1px solid ${WK.ink}`, padding: '1px 4px', letterSpacing: 0.6 }}>NEW</span>}
                </div>
                <div style={{ fontSize: 10, color: WK.mute, marginTop: 3, fontFamily: WK.mono }}>
                  {d.zip} · {d.type} · {d.beds}/{d.baths} · {d.sqft}sf
                </div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: WK.mono, fontSize: 11 }}>
                <div style={{ fontWeight: 600 }}>${d.ask}k</div>
                <div style={{ color: WK.mute, fontSize: 10 }}>ARV ${d.arv}k</div>
              </div>
            </div>
            <Hairline />
          </div>
        ))}
      </div>
    </PhoneScroll>
  );
}

// ─────────── C. Hero-featured deal + list below ───────────
function PublicC() {
  const feat = DEALS[2];
  return (
    <PhoneScroll>
      <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={28} initials="JR" />
          <div style={{ fontSize: 12, fontWeight: 600 }}>@jrodriguez.deals</div>
        </div>
        <Btn sm>Contact</Btn>
      </div>

      {/* Featured */}
      <div style={{ margin: '0 16px', border: `1px solid ${WK.line}`, background: WK.card }}>
        <div style={{ position: 'relative' }}>
          <Stripe h={120} label="HERO · 16:9" style={{ border: 'none' }} />
          <span style={{ position: 'absolute', top: 10, left: 10 }}><Tag active>Featured</Tag></span>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3 }}>{feat.addr}</div>
          <div style={{ fontSize: 11, color: WK.mute, marginTop: 3 }}>{feat.city} {feat.zip} · {feat.units}-unit</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontFamily: WK.mono, fontSize: 11 }}>
            <div><div style={{ color: WK.mute, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>Ask</div><div style={{ fontWeight: 600, marginTop: 2 }}>${feat.ask}k</div></div>
            <div><div style={{ color: WK.mute, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>ARV</div><div style={{ fontWeight: 600, marginTop: 2 }}>${feat.arv}k</div></div>
            <div><div style={{ color: WK.mute, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>Spread</div><div style={{ fontWeight: 600, marginTop: 2 }}>${feat.arv-feat.ask}k</div></div>
          </div>
          <Btn solid full sm style={{ marginTop: 12 }}>I'm interested</Btn>
        </div>
      </div>

      <div style={{ padding: '18px 20px 6px' }}><Kicker>More Active · 4</Kicker></div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 20px' }}>
        {DEALS.filter(d => d.status === 'active' && d.id !== feat.id).slice(0,3).map(d => (
          <div key={d.id}>
            <div style={{ padding: '10px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Stripe h={42} label="" style={{ width: 42, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
                <div style={{ fontSize: 10, color: WK.mute, marginTop: 2, fontFamily: WK.mono }}>${d.ask}k / ${d.arv}k · {d.beds}/{d.baths}</div>
              </div>
            </div>
            <Hairline />
          </div>
        ))}
      </div>
    </PhoneScroll>
  );
}

// ─────────── D. Editorial / masthead ───────────
// Serif masthead treating the profile like a publication; deals as entries.
function PublicD() {
  return (
    <PhoneScroll>
      <div style={{ padding: '10px 24px 16px', textAlign: 'center' }}>
        <Kicker style={{ textAlign: 'center' }}>Dallas / Fort Worth · Vol. 27</Kicker>
        <div style={{ fontFamily: WK.serif, fontSize: 28, fontWeight: 500, letterSpacing: -0.6, marginTop: 8, lineHeight: 1.05 }}>
          The Rodriguez<br/>Inventory
        </div>
        <div style={{ fontSize: 10, color: WK.mute, marginTop: 10, fontFamily: WK.mono, letterSpacing: 0.6 }}>
          UPDATED APR 21 · 5 ACTIVE · 2 PENDING
        </div>
        <div style={{ margin: '14px 0 4px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Btn sm>About</Btn>
          <Btn sm solid>Join list</Btn>
        </div>
      </div>

      <Hairline />

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px' }}>
        {DEALS.filter(d => d.status === 'active').slice(0,4).map((d,i) => (
          <div key={d.id}>
            <div style={{ padding: '14px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: WK.mono, fontSize: 10, color: WK.mute, letterSpacing: 1 }}>No. {String(i+1).padStart(2,'0')}</div>
                <Status kind={d.new ? 'new' : d.status} />
              </div>
              <div style={{ fontFamily: WK.serif, fontSize: 17, fontWeight: 500, letterSpacing: -0.3, marginTop: 6, lineHeight: 1.25 }}>{d.addr}</div>
              <div style={{ fontSize: 11, color: WK.mute, marginTop: 4 }}>{d.city} · {d.type} · {d.beds}bd {d.baths}ba · {d.sqft.toLocaleString()} sf</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div style={{ fontFamily: WK.mono, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>${d.ask}k</span>
                  <span style={{ color: WK.mute }}> / ${d.arv}k ARV</span>
                </div>
                <span style={{ fontFamily: WK.mono, fontSize: 10, letterSpacing: 0.6, textDecoration: 'underline', textUnderlineOffset: 3 }}>I'm interested →</span>
              </div>
            </div>
            <Hairline />
          </div>
        ))}
      </div>
    </PhoneScroll>
  );
}

Object.assign(window, { PublicA, PublicB, PublicC, PublicD });
