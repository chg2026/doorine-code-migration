import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Image as ImageIcon } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Select, Textarea, Field, StatusBadge } from '../components/ui.jsx';
import { DEAL_STATUSES } from '../lib/deallink-api.js';

const EMPTY = {
  addr: '', city: '', state: '', zip: '', type: 'SFR', units: 1, beds: 3, baths: 2, sqft: 1200,
  ask: 0, arv: 0, occ: 'Vacant', access: 'Lockbox', status: 'New', notes: '',
  description: '', photoUrl: '', tags: [], hideStreet: false,
};

export default function DealEditor({ mode }) {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();

  const existing = mode === 'edit' ? state.deals.find((d) => d.id === id) : null;
  const [form, setForm] = React.useState(existing || EMPTY);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { if (mode === 'edit' && existing) setForm(existing); }, [mode, existing]);

  if (mode === 'edit' && !state.loaded) {
    return <Layout><div className="py-32 text-center text-slate-400 text-xs font-mono">Loading deal…</div></Layout>;
  }
  if (mode === 'edit' && !existing) {
    return <Layout>
      <div className="py-32 text-center">
        <p className="text-white text-lg">Deal not found</p>
        <Link to="/admin"><Button variant="secondary" className="mt-4">Back to properties</Button></Link>
      </div>
    </Layout>;
  }

  function patch(p) { setForm((f) => ({ ...f, ...p })); setError(null); }

  function save() {
    if (!form.addr.trim()) { setError('Address is required'); return; }
    if (!form.zip.trim()) { setError('ZIP is required'); return; }
    if (!form.ask) { setError('Asking price is required'); return; }
    const data = {
      ...form,
      ask: Number(form.ask) || 0,
      arv: Number(form.arv) || 0,
      beds: Number(form.beds) || 0,
      baths: Number(form.baths) || 0,
      sqft: Number(form.sqft) || 0,
      units: Number(form.units) || 1,
      tags: Array.isArray(form.tags) ? form.tags : [],
    };
    if (mode === 'new') {
      dispatch({ type: 'add_deal', deal: data });
      dispatch({ type: 'update_onboarding', patch: { addedDeal: true } });
      show('Deal added');
    } else {
      dispatch({ type: 'update_deal', id: existing.id, patch: data });
      show('Saved');
    }
    nav('/admin');
  }

  const spread = (Number(form.arv) || 0) - (Number(form.ask) || 0);

  return (
    <Layout>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <Link to="/admin" className="text-slate-400 text-xs hover:text-amber-400 flex items-center gap-1.5"><ArrowLeft className="w-3 h-3" /> Properties</Link>
          <h1 className="text-2xl font-bold text-white mt-2">{mode === 'new' ? 'New deal' : (form.addr || 'Edit deal')}</h1>
        </div>
        <div className="flex gap-2">
          {mode === 'edit' && (
            <Button variant="danger" onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: existing.id }); show('Deleted'); nav('/admin'); } }}>
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
          <Button onClick={save}>{mode === 'new' ? 'Add deal' : 'Save changes'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <CardBody className="space-y-6">
            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-lg">{error}</div>}

            <section>
              <h3 className="text-white font-semibold text-sm mb-3">Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_80px] gap-3">
                <Field label="Street"><Input value={form.addr} onChange={(e) => patch({ addr: e.target.value })} placeholder="2418 Wentworth Ave" /></Field>
                <Field label="City"><Input value={form.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Dallas" /></Field>
                <Field label="State"><Input value={form.state} onChange={(e) => patch({ state: e.target.value.toUpperCase() })} maxLength={2} placeholder="TX" /></Field>
                <Field label="ZIP"><Input value={form.zip} onChange={(e) => patch({ zip: e.target.value })} placeholder="75215" /></Field>
              </div>
              <label className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                <input type="checkbox" checked={!!form.hideStreet} onChange={(e) => patch({ hideStreet: e.target.checked })} className="w-4 h-4 accent-amber-400" />
                Hide street number on public profile
              </label>
            </section>

            <section>
              <h3 className="text-white font-semibold text-sm mb-3">Specs</h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Field label="Type"><Select value={form.type} onChange={(e) => patch({ type: e.target.value })}><option>SFR</option><option>MF</option><option>DUP</option></Select></Field>
                <Field label="Units"><Input type="number" min="1" value={form.units} onChange={(e) => patch({ units: e.target.value })} /></Field>
                <Field label="Beds"><Input type="number" min="0" value={form.beds} onChange={(e) => patch({ beds: e.target.value })} /></Field>
                <Field label="Baths"><Input type="number" min="0" step="0.5" value={form.baths} onChange={(e) => patch({ baths: e.target.value })} /></Field>
                <Field label="Sqft"><Input type="number" min="0" value={form.sqft} onChange={(e) => patch({ sqft: e.target.value })} /></Field>
                <Field label="Occupancy"><Select value={form.occ} onChange={(e) => patch({ occ: e.target.value })}><option>Vacant</option><option>Tenant</option><option>Mixed</option><option>Owner</option></Select></Field>
              </div>
            </section>

            <section>
              <h3 className="text-white font-semibold text-sm mb-3">Pricing & status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Asking ($k)"><Input type="number" min="0" value={form.ask} onChange={(e) => patch({ ask: e.target.value })} /></Field>
                <Field label="ARV ($k)"><Input type="number" min="0" value={form.arv} onChange={(e) => patch({ arv: e.target.value })} /></Field>
                <Field label="Access"><Select value={form.access} onChange={(e) => patch({ access: e.target.value })}><option>Lockbox</option><option>Tenant</option><option>Call</option><option>Agent</option></Select></Field>
                <Field label="Status"><Select value={form.status} onChange={(e) => patch({ status: e.target.value })}>{DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-3">Spread: <b className={spread > 0 ? 'text-green-400' : 'text-red-400'}>${spread}k</b></p>
            </section>

            <section>
              <h3 className="text-white font-semibold text-sm mb-3">Description</h3>
              <Field label="Short description (1–2 lines, shown on the marketplace)">
                <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Vacant SFR, cosmetic rehab, motivated seller." />
              </Field>
              <Field label="Long notes (private)">
                <Textarea rows={4} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="New roof 2023. Seller motivated. Contract ready." />
              </Field>
            </section>

            <section>
              <h3 className="text-white font-semibold text-sm mb-3">Tags & photo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Tags (comma-sep)">
                  <Input
                    value={(form.tags || []).join(', ')}
                    onChange={(e) => patch({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                    placeholder="vacant, cash-only, rehab"
                  />
                </Field>
                <Field label="Photo URL"><Input value={form.photoUrl} onChange={(e) => patch({ photoUrl: e.target.value })} placeholder="https://…" /></Field>
              </div>
            </section>
          </CardBody>
        </Card>

        <Card className="lg:sticky lg:top-4">
          <CardHeader><CardTitle>Live preview</CardTitle></CardHeader>
          <CardBody>
            <div className="rounded-lg overflow-hidden border border-slate-700">
              <div className="h-32 bg-slate-800 flex items-center justify-center">
                {form.photoUrl ? <img src={form.photoUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-600" />}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between"><p className="text-white text-sm font-semibold truncate">{form.hideStreet && form.addr ? form.addr.replace(/^\d+\s+/, '— ') : (form.addr || '—')}</p><StatusBadge status={form.status} /></div>
                <p className="text-slate-400 text-xs font-mono mt-1">{form.zip || '—'} · {form.beds}/{form.baths} · {form.sqft}sf</p>
                <p className="text-white font-mono text-sm font-semibold mt-2">${form.ask || 0}k <span className="text-slate-400 font-normal">/ ${form.arv || 0}k ARV</span></p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">This is what buyers see on your public profile.</p>
          </CardBody>
        </Card>
      </div>
      {node}
    </Layout>
  );
}
