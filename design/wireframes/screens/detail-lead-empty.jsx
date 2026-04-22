// detail-lead-empty.jsx — deal detail (3), lead capture (3), empty state (2)

// ═══════════ DEAL DETAIL ═══════════

// A. Photo-first, single scroll
function DetailA() {
  const d = DEALS[0];
  return (
    <PhoneScroll pad={false}>
      <div style={{ position: 'relative' }}>
        <Stripe h={240} label="PHOTO 1 / 8" style={{ border: 'none' }} />
        <button style={{ position: 'absolute', top: 62, left: 14, width: 32, height: 32, borderRadius: 16, background: WK.card, border: 'none', fontSize: 16 }}>←</button>
        <span style={{ position: 'absolute', top: 68, right: 14 }}><Tag active>Active</Tag></span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>{d.addr}</div>
        <div style={{ fontSize: 12, color: WK.mute, marginTop: 3 }}>{d.city} {d.zip}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: WK.line, border: `1px solid ${WK.line}`, marginTop: 14 }}>
          {[['Ask',`$${d.ask}k`],['ARV',`$${d.arv}k`],['Spread',`$${d.arv-d.ask}k`],['Sqft',`${d.sqft}`]].map(([l,v])=>(
            <div key={l} style={{ background: WK.card, padding: '10px 12px' }}>
              <Kicker>{l}</Kicker>
              <div style={{ fontFamily: WK.mono, fontSize: 14, fontWeight: 600, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: WK.ink, lineHeight: 1.6 }}>
          Cosmetic rehab. New roof 2023. Vacant, lockbox on site.
          Clear title. Seller motivated — assignable contract ready.
        </div>
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${WK.line}`, display: 'flex', gap: 8 }}>
        <Btn sm style={{ flex: 1 }}>Save</Btn>
        <Btn solid sm style={{ flex: 2 }}>I'm interested</Btn>
      </div>
    </PhoneScroll>
  );
}

// B. Spec sheet (data-dense, no photo hero)
function DetailB() {
  const d = DEALS[0];
  const rows = [
    ['Address', d.addr], ['City / ZIP', `${d.city} ${d.zip}`],
    ['Type', 'Single Family'], ['Units', `${d.units}`],
    ['Beds / Baths', `${d.beds} / ${d.baths}`], ['Sqft', `${d.sqft.toLocaleString()}`],
    ['Occupancy', d.occ], ['Access', d.access],
    ['Asking', `$${d.ask},000`], ['ARV', `$${d.arv},000`], ['Spread', `$${d.arv-d.ask},000`],
  ];
  return (
    <PhoneScroll>
      <div style={{ padding: '0 20px 12px' }}>
        <Kicker>Deal · #{d.id.toUpperCase()}</Kicker>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3, marginTop: 6 }}>{d.addr}</div>
      </div>
      <Hairline />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {rows.map(([l,v],i) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: `1px solid ${WK.line}`, fontFamily: WK.mono, fontSize: 11 }}>
            <span style={{ color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>{l}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
        <div style={{ padding: '12px 20px' }}>
          <Kicker>Photos · 8</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginTop: 6 }}>
            {[0,1,2,3].map(i => <Stripe key={i} h={52} label="" />)}
          </div>
        </div>
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${WK.line}` }}>
        <Btn solid full sm>Request full info</Btn>
      </div>
    </PhoneScroll>
  );
}

// C. Split — photo + sticky key-metrics rail
function DetailC() {
  const d = DEALS[2];
  return (
    <PhoneScroll>
      <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: WK.mute }}>← Back</span>
        <div style={{ marginLeft: 'auto' }}><Status kind="active" /></div>
      </div>
      <div style={{ padding: '0 14px' }}>
        <Stripe h={140} label="MAP + STREET" />
      </div>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontFamily: WK.serif, fontSize: 20, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.2 }}>{d.addr}</div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 4 }}>{d.city} · 4-plex · {d.sqft} sf</div>
      </div>
      <div style={{ margin: '14px 20px', padding: 14, border: `1px solid ${WK.ink}`, background: WK.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><Kicker>Asking</Kicker><div style={{ fontFamily: WK.mono, fontSize: 20, fontWeight: 600, marginTop: 4 }}>${d.ask}k</div></div>
          <div style={{ textAlign: 'right' }}><Kicker>ARV</Kicker><div style={{ fontFamily: WK.mono, fontSize: 20, fontWeight: 600, marginTop: 4 }}>${d.arv}k</div></div>
        </div>
        <Hairline style={{ margin: '12px 0' }} />
        <div style={{ fontFamily: WK.mono, fontSize: 11, display: 'flex', justifyContent: 'space-between', color: WK.mute }}>
          <span>POTENTIAL SPREAD</span>
          <span style={{ color: WK.ink, fontWeight: 600 }}>${d.arv-d.ask},000</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 20px', fontSize: 12, color: WK.ink, lineHeight: 1.6 }}>
        4 units all 2/1. 3 occupied · 1 vacant. Gross rent $3,850/mo.
        Roof replaced 2021. Needs unit-1 rehab ~$28k.
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${WK.line}`, display: 'flex', gap: 8 }}>
        <Btn sm>Share</Btn>
        <Btn solid sm style={{ flex: 1 }}>I'm interested →</Btn>
      </div>
    </PhoneScroll>
  );
}

// ═══════════ LEAD CAPTURE ═══════════

// A. Bottom-sheet form (appears over deal)
function LeadA() {
  return (
    <div style={{ height: '100%', background: 'rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontFamily: WK.sans }}>
      <div style={{ background: WK.card, padding: '18px 20px 24px', borderTop: `1px solid ${WK.line}` }}>
        <div style={{ width: 32, height: 3, background: WK.line, borderRadius: 2, margin: '0 auto 14px' }} />
        <Kicker>Interested in</Kicker>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>2418 Wentworth Ave</div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 2, fontFamily: WK.mono }}>$142k / $225k ARV</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {['Full name','Email','Phone'].map(l => (
            <div key={l}>
              <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
              <div style={{ border: `1px solid ${WK.line}`, height: 36, background: WK.bg }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Buyer type</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Cash','Hard money','Agent','Other'].map((t,i) => <Tag key={t} active={i===0}>{t}</Tag>)}
            </div>
          </div>
        </div>
        <Btn solid full style={{ marginTop: 16 }}>Send request</Btn>
        <div style={{ fontSize: 10, color: WK.dim, marginTop: 10, textAlign: 'center' }}>You'll also join the weekly buyer list.</div>
      </div>
    </div>
  );
}

// B. One-tap — SMS deep link + optional email
function LeadB() {
  return (
    <PhoneScroll>
      <div style={{ padding: '0 20px 14px', fontSize: 11, color: WK.mute }}>← Back to deal</div>
      <div style={{ padding: '6px 20px' }}>
        <Kicker>Step 1 of 2</Kicker>
        <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, letterSpacing: -0.4, marginTop: 8, lineHeight: 1.2 }}>
          How should we reach you?
        </div>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <button style={{ border: `1px solid ${WK.ink}`, background: WK.ink, color: WK.bg, padding: '14px 16px', fontFamily: WK.sans, fontSize: 13, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Text me the deal</span><span style={{ fontFamily: WK.mono, fontSize: 11, opacity: 0.7 }}>SMS →</span>
        </button>
        <button style={{ border: `1px solid ${WK.line}`, background: 'transparent', color: WK.ink, padding: '14px 16px', fontFamily: WK.sans, fontSize: 13, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Email me the info</span><span style={{ fontFamily: WK.mono, fontSize: 11, color: WK.mute }}>→</span>
        </button>
        <button style={{ border: `1px solid ${WK.line}`, background: 'transparent', color: WK.ink, padding: '14px 16px', fontFamily: WK.sans, fontSize: 13, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Call right now</span><span style={{ fontFamily: WK.mono, fontSize: 11, color: WK.mute }}>→</span>
        </button>

        <Hairline style={{ margin: '20px 0 8px' }} />
        <Kicker>Also add me to the buyer list</Kicker>
        <div style={{ border: `1px solid ${WK.line}`, height: 36, background: WK.bg, marginTop: 4 }} />
      </div>
    </PhoneScroll>
  );
}

// C. Success state after submit
function LeadC() {
  return (
    <PhoneScroll>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 30, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: 30, border: `1.5px solid ${WK.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke={WK.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.2 }}>
          Request sent
        </div>
        <div style={{ fontSize: 12, color: WK.mute, marginTop: 10, maxWidth: 240, lineHeight: 1.5 }}>
          J. Rodriguez will reach out within 24h with photos, the full address, and the contract.
        </div>
        <Hairline style={{ margin: '26px 0 18px', width: 40 }} />
        <Kicker>While you wait</Kicker>
        <div style={{ marginTop: 12, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[0,1].map(i => (
            <div key={i} style={{ border: `1px solid ${WK.line}`, padding: 10, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left' }}>
              <Stripe h={36} label="" style={{ width: 36, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{DEALS[i+1].addr}</div>
                <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono }}>${DEALS[i+1].ask}k / ${DEALS[i+1].arv}k</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PhoneScroll>
  );
}

// ═══════════ EMPTY STATE ═══════════

// A. First-time wholesaler — walkthrough prompt
function EmptyA() {
  return (
    <PhoneScroll>
      <div style={{ padding: '10px 20px 18px', textAlign: 'center' }}>
        <Avatar size={56} initials="?" />
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>@yourname.deals</div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 4 }}>Let's get your profile live</div>
      </div>
      <Hairline />
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          ['01','Claim your handle','Done'],
          ['02','Add your first deal',null],
          ['03','Upload photos',null],
          ['04','Share your link',null],
        ].map(([n,t,d]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${WK.line}` }}>
            <span style={{ fontFamily: WK.mono, fontSize: 10, color: WK.dim }}>{n}</span>
            <div style={{ flex: 1, fontSize: 13 }}>{t}</div>
            {d ? <span style={{ fontSize: 10, fontFamily: WK.mono, color: WK.ink }}>✓ {d}</span>
               : <span style={{ fontSize: 10, fontFamily: WK.mono, color: WK.mute }}>→</span>}
          </div>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${WK.line}` }}>
        <Btn solid full sm>Add first deal</Btn>
      </div>
    </PhoneScroll>
  );
}

// B. Public-facing empty profile (what visitors see before any deal)
function EmptyB() {
  return (
    <PhoneScroll>
      <div style={{ padding: '8px 20px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <Avatar size={56} initials="JR" />
        <div style={{ fontSize: 15, fontWeight: 600 }}>@jrodriguez.deals</div>
        <div style={{ fontSize: 11, color: WK.mute, maxWidth: 240 }}>DFW off-market deals. New inventory posted Mondays.</div>
      </div>
      <Hairline />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 30, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, border: `1px dashed ${WK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: WK.mono, fontSize: 20, color: WK.dim }}>∅</div>
        </div>
        <div style={{ fontFamily: WK.serif, fontSize: 18, fontWeight: 500, marginTop: 14, lineHeight: 1.3 }}>
          No active deals<br/>this week
        </div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 8, maxWidth: 240 }}>
          Get on the buyer list and we'll text you the moment new inventory drops.
        </div>
        <Btn solid sm style={{ marginTop: 16 }}>Join buyer list →</Btn>
      </div>
    </PhoneScroll>
  );
}

Object.assign(window, { DetailA, DetailB, DetailC, LeadA, LeadB, LeadC, EmptyA, EmptyB });
