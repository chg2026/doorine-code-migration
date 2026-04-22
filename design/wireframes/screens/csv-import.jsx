// csv-import.jsx — 3-step CSV bulk import flow + 2 overall direction variations

// Step 1: Upload / drop file
function CsvUpload() {
  return (
    <AdminShell>
      <div style={{ padding: '22px 26px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 11, color: WK.mute }}>← Deals</span>
          <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>Bulk import</div>
        </div>
        <Kicker>Step 1 of 3 · Upload</Kicker>
      </div>
      <div style={{ padding: '0 26px', display: 'flex', gap: 6, marginBottom: 16 }}>
        {['Upload','Map columns','Preview'].map((s,i) => (
          <div key={s} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${i===0?WK.ink:WK.line}`, background: i===0?WK.card:'transparent', fontFamily: WK.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: i===0?WK.ink:WK.mute }}>
            {String(i+1).padStart(2,'0')} · {s}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '0 26px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 520, height: 220, border: `1.5px dashed ${WK.line}`, background: WK.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ fontFamily: WK.mono, fontSize: 28, color: WK.dim }}>⇪</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Drop CSV or XLSX here</div>
          <div style={{ fontSize: 11, color: WK.mute }}>Up to 500 rows · max 10 MB</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Btn sm>Browse files</Btn>
            <Btn sm>Use Google Sheet</Btn>
          </div>
        </div>
        <div style={{ marginTop: 20, maxWidth: 520, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: WK.mute }}>First time? <span style={{ color: WK.ink, textDecoration: 'underline' }}>Download template.csv</span></div>
          <div style={{ fontFamily: WK.mono, fontSize: 10, color: WK.dim }}>address · zip · ask · arv · beds · baths · sqft · ...</div>
        </div>
      </div>
    </AdminShell>
  );
}

// Step 2: Column mapping — auto-detected with override
function CsvMap() {
  const rows = [
    ['Property Address', 'Address',      true,  '2418 Wentworth Ave'],
    ['Zip',              'ZIP',          true,  '75215'],
    ['# Units',          'Units',        true,  '1'],
    ['Price',            'Asking price', true,  '142000'],
    ['ARV',              'ARV',          true,  '225000'],
    ['Type',             'Property type',true,  'SFR'],
    ['Bed',              'Bedrooms',     true,  '3'],
    ['Bath',             'Bathrooms',    true,  '2'],
    ['SqFt',             'Sqft',         true,  '1340'],
    ['Occ',              'Occupancy',    true,  'Vacant'],
    ['Access',           'Access type',  true,  'Lockbox'],
    ['Comments',         'Notes',        true,  'Cosmetic rehab, new roof...'],
    ['Seller Phone',     '— Ignore —',   false, '214-555-0148'],
  ];
  return (
    <AdminShell>
      <div style={{ padding: '22px 26px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <Kicker>properties_april.csv · 87 rows</Kicker>
          <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>Match your columns</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Kicker>Step 2 of 3</Kicker>
          <Btn sm solid>Continue →</Btn>
        </div>
      </div>

      <div style={{ padding: '0 26px', display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['Upload','done'],['Map columns','now'],['Preview','next']].map(([s,k],i) => (
          <div key={s} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${k==='now'?WK.ink:WK.line}`, background: k==='now'?WK.card:(k==='done'?WK.bg:'transparent'), fontFamily: WK.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: k==='now'?WK.ink:WK.mute }}>
            {k==='done'?'✓':String(i+1).padStart(2,'0')} · {s}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', margin: '0 26px 20px', border: `1px solid ${WK.line}`, background: WK.card }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 28px 1.2fr 1.6fr 90px', padding: '10px 16px', borderBottom: `1px solid ${WK.line}`, fontFamily: WK.mono, fontSize: 9, color: WK.mute, letterSpacing: 1, textTransform: 'uppercase' }}>
          <span>Your column</span><span></span><span>DealLink field</span><span>Sample value</span><span style={{ textAlign: 'right' }}>Auto</span>
        </div>
        {rows.map(([src, dst, ok, sample], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 28px 1.2fr 1.6fr 90px', padding: '9px 16px', borderBottom: i<rows.length-1 ? `1px solid ${WK.line}` : 'none', alignItems: 'center', fontSize: 12 }}>
            <span style={{ fontFamily: WK.mono, color: WK.ink }}>{src}</span>
            <span style={{ color: WK.dim }}>→</span>
            <span style={{ border: `1px solid ${WK.line}`, padding: '4px 8px', fontFamily: WK.sans, fontSize: 11, color: ok?WK.ink:WK.dim, display: 'inline-flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {dst} <span style={{ fontFamily: WK.mono, color: WK.dim, marginLeft: 8 }}>▾</span>
            </span>
            <span style={{ fontFamily: WK.mono, fontSize: 11, color: WK.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sample}</span>
            <span style={{ textAlign: 'right', fontFamily: WK.mono, fontSize: 10, color: ok?WK.ink:WK.dim }}>{ok ? '✓ auto' : 'skip'}</span>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}

// Step 3: Preview with validation + duplicate detection
function CsvPreview() {
  // Each row: status (ok | warn | err | dup), addr, zip, ask, arv, beds, baths, issue
  const rows = [
    ['ok',   '2418 Wentworth Ave',    '75215', '$142k', '$225k', '3/2', null],
    ['ok',   '1903 N Prairie St',     '75204', '$89k',  '$168k', '2/1', null],
    ['dup',  '7412 Beckley Ave',      '75232', '$310k', '$480k', '8/4', 'Duplicate — exists in your inventory'],
    ['ok',   '4221 Maple Grove Rd',   '76114', '$168k', '$245k', '3/2', null],
    ['warn', '508 E Jefferson Blvd',  '75203', '$74k',  '—',     '2/1', 'ARV missing — will import without it'],
    ['ok',   '1201 Ferris Ave',       '75165', '$215k', '$340k', '4/2', null],
    ['err',  '—',                     '75216', '$99k',  '$180k', '3/2', 'Address required'],
    ['ok',   '6810 Ridgecrest Dr',    '76016', '$195k', '$310k', '3/2', null],
  ];
  const colors = { ok: WK.ink, warn: '#8A6D1C', err: '#9E2B1E', dup: WK.mute };
  const chip = (s) => ({
    ok:   { t: '✓ Ready',     c: WK.ink,      bg: 'transparent' },
    warn: { t: '! Warning',   c: '#8A6D1C',   bg: 'transparent' },
    err:  { t: '× Error',     c: '#9E2B1E',   bg: 'transparent' },
    dup:  { t: '⊘ Duplicate', c: WK.mute,    bg: 'transparent' },
  })[s];

  return (
    <AdminShell>
      <div style={{ padding: '22px 26px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <Kicker>Preview · properties_april.csv</Kicker>
          <div style={{ fontFamily: WK.serif, fontSize: 22, fontWeight: 500, marginTop: 4 }}>Review & confirm</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Kicker>Step 3 of 3</Kicker>
          <Btn sm>Back</Btn>
          <Btn sm solid>Import 83 deals →</Btn>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ margin: '0 26px 14px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, border: `1px solid ${WK.line}`, background: WK.card }}>
        {[
          ['Ready',     '83', WK.ink],
          ['Warnings',  ' 3', '#8A6D1C'],
          ['Errors',    ' 1', '#9E2B1E'],
          ['Duplicates',' 0', WK.mute],
        ].map(([l,n,c], i) => (
          <div key={l} style={{ padding: '12px 16px', borderRight: i<3 ? `1px solid ${WK.line}` : 'none' }}>
            <Kicker>{l}</Kicker>
            <div style={{ fontFamily: WK.mono, fontSize: 22, fontWeight: 600, marginTop: 4, color: c }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 26px 8px', display: 'flex', gap: 6 }}>
        {['All 87','Ready 83','Warnings 3','Errors 1','Duplicates 0'].map((t,i) => <Tag key={t} active={i===0}>{t}</Tag>)}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: WK.mute, fontFamily: WK.mono, alignSelf: 'center' }}>errors excluded from import</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', margin: '0 26px 20px', border: `1px solid ${WK.line}`, background: WK.card }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 2fr .7fr .6fr .6fr .4fr 1.3fr', padding: '10px 14px', borderBottom: `1px solid ${WK.line}`, fontFamily: WK.mono, fontSize: 9, color: WK.mute, letterSpacing: 1, textTransform: 'uppercase' }}>
          <span>Status</span><span>Address</span><span>ZIP</span><span>Ask</span><span>ARV</span><span>B/B</span><span>Issue</span>
        </div>
        {rows.map((r, i) => {
          const [s, addr, zip, ask, arv, bb, issue] = r;
          const ch = chip(s);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 2fr .7fr .6fr .6fr .4fr 1.3fr', padding: '10px 14px', borderBottom: i<rows.length-1 ? `1px solid ${WK.line}` : 'none', alignItems: 'center', fontSize: 12, opacity: s==='err'||s==='dup'?0.75:1 }}>
              <span style={{ fontFamily: WK.mono, fontSize: 10, letterSpacing: 0.6, color: ch.c, textTransform: 'uppercase' }}>{ch.t}</span>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: s==='err'?WK.dim:WK.ink }}>{addr}</span>
              <span style={{ fontFamily: WK.mono, color: WK.mute }}>{zip}</span>
              <span style={{ fontFamily: WK.mono }}>{ask}</span>
              <span style={{ fontFamily: WK.mono, color: arv==='—'?WK.dim:WK.ink }}>{arv}</span>
              <span style={{ fontFamily: WK.mono, color: WK.mute }}>{bb}</span>
              <span style={{ fontSize: 10, color: issue?colors[s]:WK.dim, fontFamily: WK.mono }}>{issue || '—'}</span>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}

Object.assign(window, { CsvUpload, CsvMap, CsvPreview });
