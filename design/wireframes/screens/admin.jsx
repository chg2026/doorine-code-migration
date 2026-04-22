// admin.jsx — Admin screens: login (2), dashboard deal list (3), add/edit deal (3)
// Desktop-flavored cards (admin is not mobile-first per spec).

// ═══════════ LOGIN / SIGNUP ═══════════

// A. Split hero — product name + minimal form
function LoginA() {
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

// B. Single column, editorial; signup emphasizes claim-handle
function LoginB() {
  return (
    <div style={{ width: '100%', height: '100%', background: WK.bg, color: WK.ink, fontFamily: WK.sans, padding: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Kicker>Claim your handle</Kicker>
      <div style={{ fontFamily: WK.serif, fontSize: 32, fontWeight: 500, letterSpacing: -0.6, marginTop: 10, textAlign: 'center', lineHeight: 1.1 }}>
        deallink.io/<span style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: 4 }}>yourname</span>
      </div>
      <div style={{ width: 320, marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', border: `1px solid ${WK.line}`, background: WK.card, alignItems: 'center' }}>
          <span style={{ padding: '0 12px', color: WK.dim, fontFamily: WK.mono, fontSize: 12 }}>deallink.io/</span>
          <div style={{ flex: 1, height: 36, borderLeft: `1px solid ${WK.line}` }} />
          <span style={{ padding: '0 12px', fontFamily: WK.mono, fontSize: 11, color: WK.ink }}>✓ available</span>
        </div>
        <div style={{ border: `1px solid ${WK.line}`, height: 36, background: WK.card, padding: '0 12px', display: 'flex', alignItems: 'center', fontFamily: WK.mono, fontSize: 11, color: WK.dim }}>you@email.com</div>
        <div style={{ border: `1px solid ${WK.line}`, height: 36, background: WK.card }} />
        <Btn solid full>Create profile →</Btn>
        <div style={{ fontSize: 11, color: WK.mute, textAlign: 'center', marginTop: 4 }}>Already have one? <span style={{ textDecoration: 'underline', color: WK.ink }}>Sign in</span></div>
      </div>
    </div>
  );
}

// ═══════════ ADMIN DASHBOARD ═══════════

// Shared admin chrome
function AdminShell({ tab = 'deals', children }) {
  return (
    <div style={{ width: '100%', height: '100%', background: WK.bg, color: WK.ink, fontFamily: WK.sans, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 22px', borderBottom: `1px solid ${WK.line}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontFamily: WK.mono, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>DealLink</div>
        <Hairline vertical style={{ height: 16 }} />
        <div style={{ display: 'flex', gap: 18, fontSize: 12 }}>
          {['Deals','Leads','Profile','Billing'].map(t => (
            <span key={t} style={{ color: t.toLowerCase() === tab ? WK.ink : WK.mute, borderBottom: t.toLowerCase() === tab ? `1px solid ${WK.ink}` : 'none', paddingBottom: 2, fontWeight: t.toLowerCase() === tab ? 600 : 400 }}>{t}</span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: WK.mute, fontFamily: WK.mono }}>deallink.io/jrodriguez.deals</span>
          <Avatar size={28} initials="JR" />
        </div>
      </div>
      {children}
    </div>
  );
}

// A. Spreadsheet / table-first
function AdminA() {
  const cols = ['Addr','ZIP','Type','Ask','ARV','Status','Updated',''];
  return (
    <AdminShell>
      <div style={{ padding: '20px 22px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <Kicker>7 Deals · 5 Active · 1 Pending · 1 Sold</Kicker>
          <div style={{ fontFamily: WK.serif, fontSize: 24, fontWeight: 500, letterSpacing: -0.4, marginTop: 4 }}>Inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn sm>Import CSV</Btn>
          <Btn sm solid>+ Add deal</Btn>
        </div>
      </div>
      <div style={{ padding: '0 22px 10px', display: 'flex', gap: 6 }}>
        {['All','Active','Pending','Sold','Drafts'].map((t,i) => <Tag key={t} active={i===0}>{t}</Tag>)}
        <div style={{ marginLeft: 'auto', border: `1px solid ${WK.line}`, padding: '4px 10px', fontSize: 11, color: WK.mute, fontFamily: WK.mono }}>⌕ search address, zip...</div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', margin: '0 22px', border: `1px solid ${WK.line}`, background: WK.card }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr .7fr .5fr .7fr .7fr .8fr .7fr 40px', padding: '10px 14px', borderBottom: `1px solid ${WK.line}`, fontFamily: WK.mono, fontSize: 9, color: WK.mute, letterSpacing: 1, textTransform: 'uppercase' }}>
          {cols.map(c => <span key={c}>{c}</span>)}
        </div>
        {DEALS.map(d => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '2fr .7fr .5fr .7fr .7fr .8fr .7fr 40px', padding: '10px 14px', borderBottom: `1px solid ${WK.line}`, fontSize: 12, alignItems: 'center' }}>
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</span>
            <span style={{ fontFamily: WK.mono, color: WK.mute }}>{d.zip}</span>
            <span style={{ fontFamily: WK.mono, color: WK.mute }}>{d.type}</span>
            <span style={{ fontFamily: WK.mono }}>${d.ask}k</span>
            <span style={{ fontFamily: WK.mono, color: WK.mute }}>${d.arv}k</span>
            <Status kind={d.status} />
            <span style={{ fontFamily: WK.mono, color: WK.dim, fontSize: 10 }}>2d ago</span>
            <span style={{ color: WK.dim, textAlign: 'right' }}>⋯</span>
          </div>
        ))}
      </div>
      <div style={{ height: 18 }} />
    </AdminShell>
  );
}

// B. Card grid — image-forward
function AdminB() {
  return (
    <AdminShell>
      <div style={{ padding: '20px 22px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, letterSpacing: -0.4 }}>Your deals</div>
        <Btn sm solid>+ Add deal</Btn>
      </div>
      <div style={{ padding: '0 22px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
        {['All 7','Active 5','Pending','Sold'].map((t,i) => <Tag key={t} active={i===0}>{t}</Tag>)}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: WK.mute, fontFamily: WK.mono }}>sort: newest ↓</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 22px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
        {DEALS.slice(0,6).map(d => (
          <div key={d.id} style={{ background: WK.card, border: `1px solid ${WK.line}` }}>
            <div style={{ position: 'relative' }}>
              <Stripe h={90} label="" style={{ border: 'none' }} />
              <div style={{ position: 'absolute', top: 6, left: 6 }}><Status kind={d.status} /></div>
              <div style={{ position: 'absolute', top: 6, right: 6, background: WK.card, padding: '2px 6px', fontFamily: WK.mono, fontSize: 9, border: `1px solid ${WK.line}` }}>⋯</div>
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
              <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>{d.zip} · {d.beds}/{d.baths}</div>
              <div style={{ marginTop: 6, fontFamily: WK.mono, fontSize: 11, fontWeight: 600 }}>${d.ask}k <span style={{ color: WK.mute, fontWeight: 400 }}>/ ${d.arv}k</span></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Btn sm style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}>Edit</Btn>
                <Btn sm style={{ padding: '6px 8px', fontSize: 11 }}>↗</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}

// C. Split — list + live preview rail
function AdminC() {
  return (
    <AdminShell>
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 260px' }}>
        <div style={{ padding: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <Kicker>Inventory</Kicker>
              <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>7 deals</div>
            </div>
            <Btn sm solid>+ New</Btn>
          </div>
          <div style={{ marginTop: 14, flex: 1, overflow: 'hidden', border: `1px solid ${WK.line}`, background: WK.card }}>
            {DEALS.slice(0,6).map((d,i) => (
              <div key={d.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${WK.line}`, display: 'flex', alignItems: 'center', gap: 10, background: i===0 ? WK.bg : 'transparent' }}>
                <Stripe h={34} label="" style={{ width: 34, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.addr}</div>
                  <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>${d.ask}k · {d.zip}</div>
                </div>
                <Status kind={d.status} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderLeft: `1px solid ${WK.line}`, background: WK.card, padding: 16, overflow: 'hidden' }}>
          <Kicker>Public preview</Kicker>
          <div style={{ marginTop: 10, border: `1px solid ${WK.line}`, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={24} initials="JR" />
              <div style={{ fontSize: 11, fontWeight: 600 }}>@jrodriguez.deals</div>
            </div>
            <Stripe h={70} label="" style={{ marginTop: 10 }} />
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 8 }}>{DEALS[0].addr}</div>
            <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>${DEALS[0].ask}k / ${DEALS[0].arv}k</div>
          </div>
          <Btn sm full style={{ marginTop: 12 }}>Open public link ↗</Btn>
          <Hairline style={{ margin: '16px 0' }} />
          <Kicker>This month</Kicker>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: WK.mono, fontSize: 11 }}>
            <span style={{ color: WK.mute }}>Views</span><span style={{ fontWeight: 600 }}>1,284</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: WK.mono, fontSize: 11 }}>
            <span style={{ color: WK.mute }}>Leads</span><span style={{ fontWeight: 600 }}>27</span>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// ═══════════ ADD / EDIT DEAL ═══════════

// A. Full-page form, sectioned
function FormA() {
  const field = (l, v = '', mono = false) => (
    <div>
      <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
      <div style={{ border: `1px solid ${WK.line}`, height: 32, background: WK.card, padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: mono ? WK.mono : WK.sans, fontSize: 12, color: v ? WK.ink : WK.dim }}>{v || '—'}</div>
    </div>
  );
  return (
    <AdminShell>
      <div style={{ padding: '18px 22px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 11, color: WK.mute }}>← Deals</span>
          <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>New deal</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn sm>Save draft</Btn>
          <Btn sm solid>Publish</Btn>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 22px 20px' }}>
        <div style={{ background: WK.card, border: `1px solid ${WK.line}`, padding: 18 }}>
          <Kicker>Address</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px', gap: 10, marginTop: 10 }}>
            {field('Street', '2418 Wentworth Ave')}
            {field('City', 'Dallas')}
            {field('ZIP', '75215', true)}
          </div>
          <Hairline style={{ margin: '16px 0' }} />
          <Kicker>Specs</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginTop: 10 }}>
            {field('Type','SFR')}{field('Units','1',true)}{field('Beds','3',true)}{field('Baths','2',true)}{field('Sqft','1,340',true)}{field('Occ','Vacant')}
          </div>
          <Hairline style={{ margin: '16px 0' }} />
          <Kicker>Price</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 10 }}>
            {field('Asking','$142,000',true)}{field('ARV','$225,000',true)}{field('Access','Lockbox')}
          </div>
          <Hairline style={{ margin: '16px 0' }} />
          <Kicker>Photos</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginTop: 10 }}>
            {[0,1,2].map(i => <Stripe key={i} h={60} label={`${i+1}`} />)}
            <div style={{ height: 60, border: `1px dashed ${WK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: WK.mono, fontSize: 11, color: WK.mute }}>+ upload</div>
          </div>
          <Hairline style={{ margin: '16px 0' }} />
          <Kicker>Notes (only custom field)</Kicker>
          <div style={{ marginTop: 8, border: `1px solid ${WK.line}`, background: WK.card, minHeight: 70, padding: 10, fontFamily: WK.sans, fontSize: 12, color: WK.mute }}>
            Cosmetic rehab. New roof 2023. Seller motivated, contract ready...
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// B. Two-column: form + live preview of public card
function FormB() {
  const field = (l, v) => (
    <div>
      <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{l}</div>
      <div style={{ borderBottom: `1px solid ${WK.line}`, height: 28, display: 'flex', alignItems: 'center', fontFamily: WK.mono, fontSize: 12 }}>{v}</div>
    </div>
  );
  return (
    <AdminShell>
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 300px' }}>
        <div style={{ padding: 22, overflow: 'hidden' }}>
          <Kicker>Editing</Kicker>
          <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>2418 Wentworth Ave</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
            {field('Address','2418 Wentworth Ave')}
            {field('ZIP','75215')}
            {field('Type','SFR')}
            {field('Units','1')}
            {field('Beds','3')}
            {field('Baths','2')}
            {field('Sqft','1,340')}
            {field('Occupancy','Vacant')}
            {field('Access','Lockbox')}
            {field('Asking','$142,000')}
            {field('ARV','$225,000')}
            {field('Status','Active')}
          </div>
          <Hairline style={{ margin: '22px 0 14px' }} />
          <Kicker>Notes</Kicker>
          <div style={{ marginTop: 8, border: `1px solid ${WK.line}`, minHeight: 60, padding: 10, fontFamily: WK.sans, fontSize: 12, color: WK.mute, background: WK.card }}>
            Cosmetic rehab. New roof 2023. Vacant, lockbox. Clear title.
          </div>
        </div>
        <div style={{ borderLeft: `1px solid ${WK.line}`, background: WK.card, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <Kicker>Live on your profile</Kicker>
          <div style={{ marginTop: 10, border: `1px solid ${WK.line}`, padding: 12 }}>
            <Stripe h={80} label="" />
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>2418 Wentworth Ave</div>
            <div style={{ fontSize: 10, color: WK.mute, fontFamily: WK.mono, marginTop: 2 }}>75215 · 3/2 · 1340sf</div>
            <div style={{ fontFamily: WK.mono, fontSize: 12, fontWeight: 600, marginTop: 8 }}>$142k <span style={{ color: WK.mute, fontWeight: 400 }}>/ $225k ARV</span></div>
            <Btn sm full style={{ marginTop: 10 }}>I'm interested</Btn>
          </div>
          <Kicker style={{ marginTop: 18 }}>Photos · 3 uploaded</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginTop: 8 }}>
            {[0,1,2].map(i => <Stripe key={i} h={40} label="" />)}
          </div>
          <div style={{ flex: 1 }} />
          <Btn solid full sm>Save changes</Btn>
        </div>
      </div>
    </AdminShell>
  );
}

// C. Quick-add inline modal (overlay)
function FormC() {
  return (
    <div style={{ width: '100%', height: '100%', background: WK.bg, fontFamily: WK.sans, position: 'relative' }}>
      <div style={{ padding: '22px 26px', opacity: 0.3 }}>
        <Kicker>Deals</Kicker>
        <div style={{ fontFamily: WK.serif, fontSize: 22, marginTop: 4 }}>Inventory</div>
        <div style={{ marginTop: 20 }}>{[1,2,3].map(i => <div key={i} style={{ height: 36, borderBottom: `1px solid ${WK.line}` }} />)}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 440, background: WK.card, border: `1px solid ${WK.line}`, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${WK.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>Quick add</Kicker>
            <span style={{ fontSize: 14, color: WK.dim }}>×</span>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: WK.mute, marginBottom: 6 }}>Paste an address — we'll auto-fill type, beds, baths, sqft from public records.</div>
            <div style={{ border: `1px solid ${WK.ink}`, background: WK.bg, height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 500 }}>2418 Wentworth Ave, Dallas, TX 75215</div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[['Ask','$142k'],['ARV','$225k'],['Status','Active']].map(([l,v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10, color: WK.mute, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
                  <div style={{ border: `1px solid ${WK.line}`, height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: WK.mono, fontSize: 12 }}>{v}</div>
                </div>
              ))}
            </div>
            <Kicker style={{ marginTop: 16 }}>Drop photos</Kicker>
            <div style={{ marginTop: 6, height: 80, border: `1px dashed ${WK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: WK.mono, fontSize: 11, color: WK.mute }}>
              drop up to 12 photos · or click to browse
            </div>
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${WK.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn sm>Cancel</Btn>
            <Btn sm solid>Create deal</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginA, LoginB, AdminA, AdminB, AdminC, FormA, FormB, FormC });
