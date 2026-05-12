import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, CheckCircle2, AlertCircle, XCircle, Copy } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardBody, Button, Select } from '../components/ui.jsx';

const FIELDS = [
  { key: 'addr', label: 'Address', match: ['address', 'street', 'property'] },
  { key: 'city', label: 'City', match: ['city', 'town'] },
  { key: 'state', label: 'State', match: ['state'] },
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
  { key: 'description', label: 'Description', match: ['description', 'desc'] },
  { key: 'notes', label: 'Notes', match: ['notes', 'comments', 'remarks'] },
  { key: '__ignore', label: '— Ignore —', match: [] },
];

const SAMPLE_CSV = `Property Address,City,State,Zip,Price,ARV,Type,Bed,Bath,SqFt,Occ,Access,Comments
2418 Wentworth Ave,Dallas,TX,75215,142000,225000,SFR,3,2,1340,Vacant,Lockbox,Cosmetic rehab new roof
1903 N Prairie St,Dallas,TX,75204,89000,168000,SFR,2,1,980,Tenant,Tenant,Tenant on M2M
7412 Beckley Ave,Dallas,TX,75232,310000,480000,MF,8,4,3200,Mixed,Call,4-unit good cashflow
4221 Maple Grove Rd,Fort Worth,TX,76114,168000,245000,SFR,3,2,1520,Vacant,Lockbox,Backup welcome
508 E Jefferson Blvd,Dallas,TX,75203,74000,140000,SFR,2,1,820,Vacant,Lockbox,Cash only minor foundation`;

export default function CsvImport() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [step, setStep] = React.useState(1);
  const [filename, setFilename] = React.useState('');
  const [rawRows, setRawRows] = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  const [over, setOver] = React.useState(false);

  function parseCsv(text) {
    return text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0).map((l) => l.split(',').map((c) => c.trim()));
  }
  function autoMap(headers) {
    const m = {};
    headers.forEach((h) => {
      const norm = h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const f = FIELDS.find((f) => f.match.some((x) => norm.includes(x)));
      m[h] = f ? f.key : '__ignore';
    });
    return m;
  }
  async function handleFile(file) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { show('Empty file'); return; }
    setFilename(file.name); setRawRows(rows); setMapping(autoMap(rows[0])); setStep(2);
  }
  function useSample() {
    const rows = parseCsv(SAMPLE_CSV);
    setFilename('properties_sample.csv'); setRawRows(rows); setMapping(autoMap(rows[0])); setStep(2);
  }
  function buildPreview() {
    if (rawRows.length < 2) return [];
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    const existingAddrs = new Set(state.deals.map((d) => (d.addr || '').toLowerCase()));
    return dataRows.map((cols, i) => {
      const obj = {};
      headers.forEach((h, idx) => { const key = mapping[h]; if (!key || key === '__ignore') return; obj[key] = cols[idx] || ''; });
      ['ask', 'arv'].forEach((k) => { if (obj[k]) { const n = Number(String(obj[k]).replace(/[^0-9.]/g, '')); obj[k] = n >= 1000 ? Math.round(n / 1000) : n; } });
      ['beds', 'baths', 'sqft', 'units'].forEach((k) => { if (obj[k]) obj[k] = Number(String(obj[k]).replace(/[^0-9.]/g, '')) || 0; });
      let status = 'ok', issue = null;
      if (!obj.addr) { status = 'err'; issue = 'Address required'; }
      else if (existingAddrs.has(obj.addr.toLowerCase())) { status = 'dup'; issue = 'Duplicate'; }
      else if (!obj.arv) { status = 'warn'; issue = 'ARV missing'; }
      return { i, obj, status, issue };
    });
  }

  if (step === 1) {
    return (
      <Layout>
        <Header step={1} />
        <div className="flex items-center justify-center py-8">
          <label
            className={`relative cursor-pointer w-full max-w-2xl border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${over ? 'border-amber-400 bg-amber-400/5' : 'border-slate-700 hover:border-slate-500'}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
          >
            <Upload className="w-10 h-10 mx-auto text-slate-500 mb-3" />
            <p className="text-white font-semibold">Drop CSV here or click to browse</p>
            <p className="text-slate-400 text-xs mt-1">Up to 500 rows · max 10 MB</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="secondary" type="button">Browse files</Button>
              <Button variant="secondary" type="button" onClick={(e) => { e.preventDefault(); useSample(); }}><Copy className="w-3 h-3" /> Use sample</Button>
            </div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
          </label>
        </div>
        {node}
      </Layout>
    );
  }

  if (step === 2) {
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    return (
      <Layout>
        <Header step={2} filename={filename} count={dataRows.length} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Your column</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">DealLink field</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Sample value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {headers.map((h, idx) => {
                  const sample = (dataRows[0] && dataRows[0][idx]) || '—';
                  return (
                    <tr key={h}>
                      <td className="px-5 py-3 text-white font-mono text-xs">{h}</td>
                      <td className="px-5 py-3 w-64">
                        <Select value={mapping[h] || '__ignore'} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                          {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </Select>
                      </td>
                      <td className="px-5 py-3 text-slate-400 font-mono text-xs truncate max-w-[200px]">{sample}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {node}
      </Layout>
    );
  }

  // step 3
  const preview = buildPreview();
  const summary = { ok: 0, warn: 0, err: 0, dup: 0 };
  preview.forEach((r) => { summary[r.status]++; });
  const importable = preview.filter((r) => r.status === 'ok' || r.status === 'warn');
  function doImport() {
    if (importable.length === 0) { show('Nothing to import'); return; }
    dispatch({ type: 'add_deals', deals: importable.map((r) => r.obj) });
    dispatch({ type: 'update_onboarding', patch: { addedDeal: true } });
    show(`Imported ${importable.length} deals`);
    nav('/admin');
  }
  const ICONS = { ok: CheckCircle2, warn: AlertCircle, err: XCircle, dup: AlertCircle };
  const COLORS = { ok: 'text-green-400', warn: 'text-amber-400', err: 'text-red-400', dup: 'text-slate-400' };
  const LABELS = { ok: 'Ready', warn: 'Warning', err: 'Error', dup: 'Duplicate' };

  return (
    <Layout>
      <Header step={3} filename={filename} onBack={() => setStep(2)} onImport={doImport} importCount={importable.length} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[['Ready', summary.ok, 'text-green-400'], ['Warnings', summary.warn, 'text-amber-400'], ['Errors', summary.err, 'text-red-400'], ['Duplicates', summary.dup, 'text-slate-400']].map(([l, n, c]) => (
          <Card key={l} className="p-4"><p className="text-slate-400 text-xs uppercase">{l}</p><p className={`text-2xl font-bold mt-1 ${c}`}>{n}</p></Card>
        ))}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-700">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Address</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">ZIP</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Ask / ARV</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Issue</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700">
              {preview.map((r) => {
                const Icon = ICONS[r.status];
                return (
                  <tr key={r.i} className={r.status === 'err' || r.status === 'dup' ? 'opacity-60' : ''}>
                    <td className="px-5 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium uppercase ${COLORS[r.status]}`}><Icon className="w-3 h-3" />{LABELS[r.status]}</span></td>
                    <td className="px-5 py-3 text-white text-sm">{r.obj.addr || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs font-mono">{r.obj.zip || '—'}</td>
                    <td className="px-5 py-3 text-white text-xs font-mono">{r.obj.ask ? `$${r.obj.ask}k` : '—'} / <span className="text-slate-400">{r.obj.arv ? `$${r.obj.arv}k` : '—'}</span></td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-400">{r.issue || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {node}
    </Layout>
  );
}

function Header({ step, filename, count, onBack, onNext, onImport, importCount }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
      <div>
        <Link to="/admin" className="text-slate-400 text-xs hover:text-amber-400 flex items-center gap-1.5"><ArrowLeft className="w-3 h-3" /> Properties</Link>
        <h1 className="text-2xl font-bold text-white mt-2">
          {step === 1 ? 'Bulk import' : step === 2 ? 'Match your columns' : 'Review & confirm'}
        </h1>
        {filename && <p className="text-slate-400 text-xs mt-1 font-mono">{filename}{count != null ? ` · ${count} rows` : ''} · Step {step}/3</p>}
      </div>
      <div className="flex gap-2">
        {step >= 2 && <Button variant="secondary" onClick={onBack}>Back</Button>}
        {step === 2 && <Button onClick={onNext}>Continue →</Button>}
        {step === 3 && <Button onClick={onImport}>Import {importCount} deals →</Button>}
      </div>
    </div>
  );
}
