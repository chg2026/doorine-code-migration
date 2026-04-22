// final-screens.jsx — V2 redesign applying all teammate comments

// ═══════════ PUBLIC PROFILE (FINAL) ═══════════
// Avatar → handle → description → stats (no Closed) → featured deal → deal rows
function PublicFinal() {
  const feat = DEALS[2];
  const others = DEALS.filter(d => d.status !== 'sold' && d.id !== feat.id).slice(0,5);
  return (
    <PhoneScroll>
      {/* 1. Identity */}
      <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <Avatar size={64} initials="JR" />
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>@jrodriguez.deals</div>
        <div style={{ fontSize: 12, color: WK.mute, lineHeight: 1.5, maxWidth: 260 }}>
          DFW wholesaler · Off-market inventory posted Mondays
        </div>
        {/* Stats — only Active Deals per Nicole */}
        <div style={{ display: 'flex', gap: 22, marginTop: 6 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: WK.mono, fontSize: 15, fontWeight: 600 }}>7</div>
            <div style={{ fontSize: 9, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 }}>Active Deals</div>
          </div>
        </div>
      </div>

      {/* 2. Featured deal — modernized: rounded corners, soft shadow, no hard border */}
      <div style={{ margin: '0 16px 18px', borderRadius: 18, background: WK.card, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ position: 'relative' }}>
          <Stripe h={120} label="FEATURED" style={{ border: 'none', borderRadius: 0 }} />
          <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)', padding: '3px 8px', borderRadius: 999, fontFamily: WK.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Featured</span>
        </div>
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{feat.addr}</div>
          <div style={{ fontSize: 10, color: WK.mute, marginTop: 2, fontFamily: WK.mono }}>{feat.city} · {feat.units}-unit · {feat.sqft}sf</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontFamily: WK.mono, fontSize: 11 }}>
            <span><span style={{ color: WK.mute }}>Ask </span><span style={{ fontWeight: 600 }}>${feat.ask}k</span></span>
            <span><span style={{ color: WK.mute }}>ARV </span><span style={{ fontWeight: 600 }}>${feat.arv}k</span></span>
            <span><span style={{ color: WK.mute }}>Spread </span><span style={{ fontWeight: 600 }}>${feat.arv-feat.ask}k</span></span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Kicker>Active Deals · {others.length}</Kicker>
        <Kicker style={{ textTransform: 'none', letterSpacing: 0 }}>Cards / <span style={{ color: WK.ink }}>Table</span></Kicker>
      </div>

      {/* 3. Deal rows — modernized: rounded pill-cards w/ translucent surface */}
      <div style={{ flex: 1, padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {others.map((d) => (
          <div key={d.id} style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderRadius: 14, background: 'rgba(28,28,28,0.035)', border: `1px solid rgba(28,28,28,0.06)` }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.id === 'd5' ? <span style={{ color: WK.dim }}>— </span> : null}{d.addr}
                </div>
                {d.new && <span style={{ fontFamily: WK.mono, fontSize: 8, color: WK.ink, background: 'rgba(28,28,28,0.06)', padding: '2px 6px', borderRadius: 999, letterSpacing: 0.6 }}>NEW</span>}
              </div>
              <div style={{ fontSize: 10, color: WK.mute, marginTop: 4, fontFamily: WK.mono }}>
                {d.zip} · {d.type} · {d.beds}/{d.baths} · {d.sqft}sf
              </div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: WK.mono, fontSize: 11 }}>
              <div style={{ fontWeight: 600 }}>${d.ask}k</div>
              <div style={{ color: WK.mute, fontSize: 10 }}>ARV ${d.arv}k</div>
            </div>
          </div>
        ))}
      </div>
    </PhoneScroll>
  );
}

// ═══════════ DEAL DETAIL (FINAL) — spec-sheet with "I'm interested" ═══════════
function DetailFinal() {
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
        {rows.map(([l,v]) => (
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
      <div style={{ padding: '16px 20px 20px', borderTop: `1px solid ${WK.line}`, display: 'flex', justifyContent: 'center' }}>
        <button style={{ width: '100%', background: WK.ink, color: WK.bg, border: 'none', borderRadius: 14, padding: '18px 24px', fontFamily: WK.sans, fontSize: 15, fontWeight: 600, letterSpacing: -0.1, cursor: 'pointer' }}>I'm interested</button>
      </div>
    </PhoneScroll>
  );
}

// ═══════════ LEAD CAPTURE (FINAL) — centered floating modal w/ split name + JV dropdown ═══════════
function LeadFinal() {
  return (
    <div style={{ height: '100%', background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch', padding: '0 20px', fontFamily: WK.sans }}>
      <div style={{ background: WK.card, padding: '22px 22px 24px', borderRadius: 18, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', position: 'relative' }}>
        <button aria-label="Close" style={{ position: 'absolute', top: 10, right: 12, background: 'transparent', border: 'none', fontSize: 18, color: WK.mute, cursor: 'pointer', lineHeight: 1 }}>×</button>
        <Kicker>Interested in</Kicker>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>2418 Wentworth Ave</div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 2, fontFamily: WK.mono }}>$142k / $225k ARV</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {/* Split name: First / Last on same line */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>First name</div>
              <div style={{ border: `1px solid ${WK.line}`, borderRadius: 12, height: 38, background: WK.bg }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Last name</div>
              <div style={{ border: `1px solid ${WK.line}`, borderRadius: 12, height: 38, background: WK.bg }} />
            </div>
          </div>
          {['Email','Phone'].map(l => (
            <div key={l}>
              <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
              <div style={{ border: `1px solid ${WK.line}`, borderRadius: 12, height: 38, background: WK.bg }} />
            </div>
          ))}
          {/* Buyer type — dropdown CLOSED state (only selected value + chevron visible) */}
          <div>
            <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Buyer type</div>
            <div style={{ border: `1px solid ${WK.line}`, borderRadius: 12, height: 38, background: WK.bg, display: 'flex', alignItems: 'center', padding: '0 14px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: WK.ink }}>Cash</span>
              <span style={{ fontFamily: WK.mono, fontSize: 12, color: WK.mute }}>▾</span>
            </div>
          </div>
        </div>
        <button style={{ marginTop: 20, width: '100%', background: WK.ink, color: WK.bg, border: 'none', borderRadius: 14, padding: '16px 20px', fontFamily: WK.sans, fontSize: 14, fontWeight: 600, letterSpacing: -0.1, cursor: 'pointer' }}>Send request</button>
        <div style={{ fontSize: 10, color: WK.dim, marginTop: 10, textAlign: 'center' }}>You'll also join the weekly buyer list.</div>
      </div>
    </div>
  );
}

// ═══════════ LOGIN (FINAL) — A kept ═══════════
function LoginFinal() {
  return (
    <div style={{ width: '100%', height: '100%', background: WK.bg, color: WK.ink, fontFamily: WK.sans, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: `1px solid ${WK.line}` }}>
        <div style={{ fontFamily: WK.mono, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>DealLink</div>
        <div>
          <div style={{ fontFamily: WK.serif, fontSize: 34, fontWeight: 500, letterSpacing: -0.7, lineHeight: 1.05 }}>
            One link for<br/>every deal<br/>you wholesale.
          </div>
          <div style={{ fontSize: 12, color: WK.mute, marginTop: 16, maxWidth: 280 }}>
            Share a public profile. Post inventory once. Capture buyers.
          </div>
        </div>
        <Kicker>© 2026 · BuildFlow</Kicker>
      </div>
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Kicker>Sign in</Kicker>
        <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 8, letterSpacing: -0.4 }}>Welcome back.</div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {['Email','Password'].map(l => (
            <div key={l}>
              <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
              <div style={{ border: `1px solid ${WK.line}`, height: 34, background: WK.card }} />
            </div>
          ))}
          <Btn solid full>Sign in →</Btn>
          <div style={{ fontSize: 11, color: WK.mute, textAlign: 'center', marginTop: 6 }}>
            No account? <span style={{ textDecoration: 'underline', color: WK.ink }}>Claim your @handle</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════ ONBOARDING (FINAL) — with add-deal choice sheet & photo mapping ═══════════

// Main onboarding checklist
function OnboardFinal() {
  return (
    <PhoneScroll>
      <div style={{ padding: '0 20px 18px', textAlign: 'center' }}>
        <Avatar size={56} initials="?" />
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>@yourname.deals</div>
        <div style={{ fontSize: 11, color: WK.mute, marginTop: 4 }}>Let's get your profile live</div>
      </div>
      <Hairline />
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          ['01','Claim your handle',         'Done',    true],
          ['02','Add your first deal',       'Manual or CSV import', false],
          ['03','Upload photos (optional)',  'Assign to deals',      false],
          ['04','Share your link',           null,                   false],
        ].map(([n,t,d,done]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${WK.line}` }}>
            <span style={{ fontFamily: WK.mono, fontSize: 10, color: WK.dim }}>{n}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{t}</div>
              {d && !done && <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>{d}</div>}
            </div>
            {done ? <span style={{ fontSize: 10, fontFamily: WK.mono, color: WK.ink }}>✓ {d}</span>
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

// 02 → centered floating modal: Manual vs CSV
function OnboardAddChoice() {
  return (
    <div style={{ height: '100%', background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch', padding: '0 20px', fontFamily: WK.sans }}>
      <div style={{ background: WK.card, padding: '22px 22px 24px', borderRadius: 18, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', position: 'relative' }}>
        <button aria-label="Close" style={{ position: 'absolute', top: 10, right: 12, background: 'transparent', border: 'none', fontSize: 18, color: WK.mute, cursor: 'pointer', lineHeight: 1 }}>×</button>
        <Kicker>Add your deals</Kicker>
        <div style={{ fontFamily: WK.serif, fontSize: 20, fontWeight: 500, letterSpacing: -0.4, marginTop: 6, lineHeight: 1.2 }}>
          How do you want to start?
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={{ border: `1px solid ${WK.ink}`, background: WK.ink, color: WK.bg, padding: '14px 16px', textAlign: 'left', fontFamily: WK.sans, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Import from CSV</div>
              <div style={{ fontSize: 10, marginTop: 3, opacity: 0.7, fontFamily: WK.mono }}>One click · auto-mapped columns</div>
            </div>
            <span style={{ fontFamily: WK.mono, fontSize: 11 }}>→</span>
          </button>
          <button style={{ border: `1px solid ${WK.line}`, background: 'transparent', color: WK.ink, padding: '14px 16px', textAlign: 'left', fontFamily: WK.sans, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Add manually</div>
              <div style={{ fontSize: 10, color: WK.mute, marginTop: 3, fontFamily: WK.mono }}>One deal at a time</div>
            </div>
            <span style={{ fontFamily: WK.mono, fontSize: 11, color: WK.mute }}>→</span>
          </button>
        </div>
        <div style={{ fontSize: 10, color: WK.dim, marginTop: 14, textAlign: 'center' }}>You can mix both · add photos after.</div>
      </div>
    </div>
  );
}

// 03 → Upload photos & assign to deals (optional)
function OnboardPhotos() {
  return (
    <PhoneScroll>
      <div style={{ padding: '0 20px 14px' }}>
        <span style={{ fontSize: 11, color: WK.mute }}>← Onboarding</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
          <div>
            <Kicker>Step 03 · Optional</Kicker>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>Upload photos</div>
          </div>
          <Btn sm>Skip</Btn>
        </div>
      </div>

      <div style={{ margin: '0 14px 14px', height: 90, border: `1.5px dashed ${WK.line}`, background: WK.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: WK.mono, fontSize: 20, color: WK.dim }}>⇪</div>
        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4 }}>Drop photos</div>
        <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>up to 12 per deal</div>
      </div>

      <div style={{ padding: '0 20px 6px' }}><Kicker>Assign to deals</Kicker></div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {DEALS.slice(0,4).map((d,i) => (
          <div key={d.id}>
            <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
                <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>{i===0 ? '3 photos · ready' : '0 photos'}</div>
              </div>
              {/* preview chips */}
              <div style={{ display: 'flex', gap: 3 }}>
                {i === 0 ? [0,1,2].map(k => <Stripe key={k} h={28} label="" style={{ width: 28 }} />)
                         : <div style={{ width: 28, height: 28, border: `1px dashed ${WK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WK.dim, fontSize: 14 }}>+</div>}
              </div>
            </div>
            <Hairline />
          </div>
        ))}
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${WK.line}` }}>
        <Btn solid full sm>Continue →</Btn>
      </div>
    </PhoneScroll>
  );
}

Object.assign(window, { PublicFinal, DetailFinal, LeadFinal, LoginFinal, OnboardFinal, OnboardAddChoice, OnboardPhotos });
