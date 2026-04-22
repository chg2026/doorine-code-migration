import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Tag, Stripe } from '../components/UI.jsx';

const FIELDS = [
  { key: 'addr', label: 'Address', match: ['address', 'street', 'property'] },
  { key: 'city', label: 'City', match: ['city', 'town'] },
  { key: 'zip', label: 'ZIP', match: ['zip', 'postal', 'zipcode'] },
  { key: 'type', label: 'Property type', match: ['type'] },
  { key: 'units', label: 'Units', match: ['units', '#units'] },
  { key: 'beds', label: 'Bedrooms', match: ['bed', 'beds', 'bedrooms', 'br'] },
  { key: 'baths', label: 'Bathrooms', match: ['bath', 'baths', 'bathrooms', 'ba'] },
  { key: 'sqft', label: 'Sqft', match: ['sqft', 'sq ft', 'square feet', 'sf'] },
  { key: 'ask', label: 'Asking price', match: ['ask', 'asking', 'price', 'list'] },
  { key: 'arv', label: 'ARV', match: ['arv', 'after repair', 'value'] },
  { key: 'occ', label: 'Occupancy', match: ['occ', 'occupancy', 'occupied'] },
  { key: 'access', label: 'Access type', match: ['access'] },
  { key: 'notes', label: 'Notes', match: ['notes', 'comments', 'remarks'] },
  { key: '__ignore', label: '— Ignore —', match: [] },
];

const SAMPLE_CSV = `Property Address,City,Zip,Price,ARV,Type,Bed,Bath,SqFt,Occ,Access,Comments,Seller Phone
2418 Wentworth Ave,Dallas,75215,142000,225000,SFR,3,2,1340,Vacant,Lockbox,Cosmetic rehab new roof,214-555-0148
1903 N Prairie St,Dallas,75204,89000,168000,SFR,2,1,980,Tenant,Tenant,Tenant on M2M,214-555-0149
7412 Beckley Ave,Dallas,75232,310000,480000,MF,8,4,3200,Mixed,Call,4-unit good cashflow,214-555-0150
4221 Maple Grove Rd,Fort Worth,76114,168000,245000,SFR,3,2,1520,Vacant,Lockbox,Under contract backup welcome,817-555-0101
508 E Jefferson Blvd,Dallas,75203,74000,140000,SFR,2,1,820,Vacant,Lockbox,Cash only minor foundation,214-555-0151
1201 Ferris Ave,Waxahachie,75165,215000,340000,DUP,4,2,2100,Tenant,Tenant,Both leased 2800/mo,469-555-0123
,75216,99000,180000,SFR,3,2,1100,Vacant,Lockbox,Address pending,214-555-0152
6810 Ridgecrest Dr,Arlington,76016,195000,310000,SFR,3,2,1680,Vacant,Lockbox,Cosmetic only,817-555-0102
9912 Greenway Ln,Dallas,75217,128000,205000,SFR,3,2,1280,Vacant,Lockbox,New listing,214-555-0153`;

export default function CsvImport() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [step, setStep] = React.useState(1);
  const [filename, setFilename] = React.useState('');
  const [rawRows, setRawRows] = React.useState([]); // [headers, ...data]
  const [mapping, setMapping] = React.useState({}); // header -> field key
  const [over, setOver] = React.useState(false);

  function parseCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
    return lines.map(l => l.split(',').map(c => c.trim()));
  }

  function autoMap(headers) {
    const m = {};
    headers.forEach(h => {
      const norm = h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const f = FIELDS.find(f => f.match.some(x => norm.includes(x)));
      m[h] = f ? f.key : '__ignore';
    });
    return m;
  }

  async function handleFile(file) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { show('Empty file'); return; }
    setFilename(file.name);
    setRawRows(rows);
    setMapping(autoMap(rows[0]));
    setStep(2);
  }

  function useSample() {
    const rows = parseCsv(SAMPLE_CSV);
    setFilename('properties_sample.csv');
    setRawRows(rows);
    setMapping(autoMap(rows[0]));
    setStep(2);
  }

  function buildPreview() {
    if (rawRows.length < 2) return [];
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    const existingAddrs = new Set(state.deals.map(d => d.addr.toLowerCase()));
    return dataRows.map((cols, i) => {
      const obj = {};
      headers.forEach((h, idx) => {
        const key = mapping[h];
        if (!key || key === '__ignore') return;
        obj[key] = cols[idx] || '';
      });
      // Normalize prices (in $k)
      ['ask', 'arv'].forEach(k => {
        if (obj[k]) {
          const n = Number(String(obj[k]).replace(/[^0-9.]/g, ''));
          obj[k] = n >= 1000 ? Math.round(n / 1000) : n;
        }
      });
      ['beds', 'baths', 'sqft', 'units'].forEach(k => { if (obj[k]) obj[k] = Number(String(obj[k]).replace(/[^0-9.]/g, '')) || 0; });
      let status = 'ok';
      let issue = null;
      if (!obj.addr) { status = 'err'; issue = 'Address required'; }
      else if (existingAddrs.has(obj.addr.toLowerCase())) { status = 'dup'; issue = 'Duplicate — exists in your inventory'; }
      else if (!obj.arv) { status = 'warn'; issue = 'ARV missing — will import without it'; }
      return { i, obj, status, issue };
    });
  }

  if (step === 1) {
    return (
      <AdminShell tab="deals">
        <Header step={1} />
        <div style={{ padding: '0 24px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <label
            className={`dropzone${over ? ' over' : ''}`}
            style={{ width: '100%', maxWidth: 560, height: 220 }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, color: 'var(--dim)' }}>⇪</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop CSV here or click to browse</div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>Up to 500 rows · max 10 MB</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span className="btn sm">Browse files</span>
              <span className="btn sm" onClick={(e) => { e.preventDefault(); useSample(); }}>Use sample CSV</span>
            </div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files[0])} style={{ display: 'none' }} />
          </label>
          <div style={{ marginTop: 16, maxWidth: 560, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn sm" onClick={useSample}>First time? Try sample CSV</button>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)' }}>address · zip · ask · arv · beds · baths · sqft · …</div>
          </div>
        </div>
        {node}
      </AdminShell>
    );
  }

  if (step === 2) {
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    return (
      <AdminShell tab="deals">
        <Header step={2} filename={filename} count={dataRows.length} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        <div style={{ padding: '0 24px 24px', flex: 1, overflow: 'auto' }}>
          <div className="table" style={{ overflowX: 'auto' }}>
            <div className="row head" style={{ gridTemplateColumns: '1fr 28px 1.4fr 1.5fr 80px', minWidth: 700 }}>
              <span>Your column</span><span></span><span>DealLink field</span><span>Sample value</span><span style={{ textAlign: 'right' }}>Auto</span>
            </div>
            {headers.map((h, idx) => {
              const sample = (dataRows[0] && dataRows[0][idx]) || '—';
              const ok = mapping[h] && mapping[h] !== '__ignore';
              return (
                <div key={h} className="row" style={{ gridTemplateColumns: '1fr 28px 1.4fr 1.5fr 80px', minWidth: 700, fontSize: 13 }}>
                  <span className="mono">{h}</span>
                  <span style={{ color: 'var(--dim)' }}>→</span>
                  <select value={mapping[h] || '__ignore'} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                    {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <span className="mono ellipsis" style={{ fontSize: 11, color: 'var(--mute)' }}>{sample}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: ok ? 'var(--ink)' : 'var(--dim)' }}>{ok ? '✓ auto' : 'skip'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </AdminShell>
    );
  }

  // step 3: preview
  const preview = buildPreview();
  const summary = {
    ok: preview.filter(r => r.status === 'ok').length,
    warn: preview.filter(r => r.status === 'warn').length,
    err: preview.filter(r => r.status === 'err').length,
    dup: preview.filter(r => r.status === 'dup').length,
  };
  const importable = preview.filter(r => r.status === 'ok' || r.status === 'warn');

  function doImport() {
    if (importable.length === 0) { show('Nothing to import'); return; }
    dispatch({ type: 'add_deals', deals: importable.map(r => r.obj) });
    dispatch({ type: 'update_onboarding', patch: { addedDeal: true } });
    show(`Imported ${importable.length} deals`);
    nav('/admin');
  }

  const colors = { ok: 'var(--ink)', warn: 'var(--warn)', err: 'var(--err)', dup: 'var(--mute)' };
  const labels = { ok: '✓ Ready', warn: '! Warning', err: '× Error', dup: '⊘ Duplicate' };

  return (
    <AdminShell tab="deals">
      <Header step={3} filename={filename} onBack={() => setStep(2)} onImport={doImport} importCount={importable.length} />
      <div style={{ padding: '0 24px 24px' }}>
        <div className="summary-grid">
          {[
            ['Ready', summary.ok, 'var(--ink)'],
            ['Warnings', summary.warn, 'var(--warn)'],
            ['Errors', summary.err, 'var(--err)'],
            ['Duplicates', summary.dup, 'var(--mute)'],
          ].map(([l, n, c]) => (
            <div key={l} className="cell">
              <Kicker>{l}</Kicker>
              <div className="num" style={{ color: c }}>{n}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tag active>All {preview.length}</Tag>
          <Tag>Ready {summary.ok}</Tag>
          <Tag>Warnings {summary.warn}</Tag>
          <Tag>Errors {summary.err}</Tag>
          <Tag>Duplicates {summary.dup}</Tag>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--mono)' }}>errors & duplicates excluded from import</span>
        </div>

        <div className="table" style={{ marginTop: 12, overflowX: 'auto' }}>
          <div className="row head" style={{ gridTemplateColumns: '90px 2fr .8fr .7fr .7fr .5fr 1.4fr', minWidth: 760 }}>
            <span>Status</span><span>Address</span><span>ZIP</span><span>Ask</span><span>ARV</span><span>B/B</span><span>Issue</span>
          </div>
          {preview.map(r => (
            <div key={r.i} className="row" style={{ gridTemplateColumns: '90px 2fr .8fr .7fr .7fr .5fr 1.4fr', minWidth: 760, opacity: r.status === 'err' || r.status === 'dup' ? 0.7 : 1 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.6, color: colors[r.status], textTransform: 'uppercase' }}>{labels[r.status]}</span>
              <span className="ellipsis" style={{ fontWeight: 500 }}>{r.obj.addr || '—'}</span>
              <span className="mono" style={{ color: 'var(--mute)' }}>{r.obj.zip || '—'}</span>
              <span className="mono">{r.obj.ask ? `$${r.obj.ask}k` : '—'}</span>
              <span className="mono" style={{ color: r.obj.arv ? 'var(--ink)' : 'var(--dim)' }}>{r.obj.arv ? `$${r.obj.arv}k` : '—'}</span>
              <span className="mono" style={{ color: 'var(--mute)' }}>{r.obj.beds || '—'}/{r.obj.baths || '—'}</span>
              <span style={{ fontSize: 11, color: r.issue ? colors[r.status] : 'var(--dim)', fontFamily: 'var(--mono)' }}>{r.issue || '—'}</span>
            </div>
          ))}
        </div>
      </div>
      {node}
    </AdminShell>
  );
}

function Header({ step, filename, count, onBack, onNext, onImport, importCount }) {
  return (
    <>
      <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {filename
            ? <Kicker>{filename}{count != null ? ` · ${count} rows` : ''}</Kicker>
            : <Link to="/admin" style={{ fontSize: 12, color: 'var(--mute)' }}>← Deals</Link>}
          <div className="serif" style={{ fontSize: 24, marginTop: 4 }}>
            {step === 1 ? 'Bulk import' : step === 2 ? 'Match your columns' : 'Review & confirm'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Kicker>Step {step} of 3</Kicker>
          {step === 2 && <button className="btn sm" onClick={onBack}>Back</button>}
          {step === 2 && <button className="btn sm solid" onClick={onNext}>Continue →</button>}
          {step === 3 && <button className="btn sm" onClick={onBack}>Back</button>}
          {step === 3 && <button className="btn sm solid" onClick={onImport}>Import {importCount} deals →</button>}
        </div>
      </div>
      <div style={{ padding: '0 24px' }}>
        <div className="steps">
          {['Upload', 'Map columns', 'Preview'].map((s, i) => {
            const idx = i + 1;
            const cls = idx === step ? 'now' : idx < step ? 'done' : '';
            return <div key={s} className={`step ${cls}`}>{idx < step ? '✓' : String(idx).padStart(2, '0')} · {s}</div>;
          })}
        </div>
      </div>
    </>
  );
}
