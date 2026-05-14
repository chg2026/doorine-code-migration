import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Image as ImageIcon, Share2, Copy, ExternalLink, Check } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Select, Textarea, Field, StatusBadge } from '../components/ui.jsx';
import { DEAL_STATUSES, DealLinkAPI } from '../lib/deallink-api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UpgradeBanner } from '../components/UpgradePrompt.jsx';

const FREE_DEAL_LIMIT = 10;
const FREE_HIDE_STREET_LIMIT = 1;

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

  const { isFreePlan } = useAuth();
  const existing = mode === 'edit' ? state.deals.find((d) => d.id === id) : null;
  const [form, setForm] = React.useState(existing || EMPTY);
  const [error, setError] = React.useState(null);

  const dealCount = state.deals.length;
  const otherHiddenCount = state.deals.filter((d) => d.hideStreet && (!existing || d.id !== existing.id)).length;
  const atDealCap = isFreePlan && mode === 'new' && dealCount >= FREE_DEAL_LIMIT;
  const hideStreetLocked = isFreePlan && otherHiddenCount >= FREE_HIDE_STREET_LIMIT && !form.hideStreet;

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
    if (atDealCap) {
      setError(`Free plan is limited to ${FREE_DEAL_LIMIT} deals. Upgrade to Personal or Team to add more.`);
      return;
    }
    if (!form.addr.trim()) { setError('Address is required'); return; }
    if (!form.zip.trim()) { setError('ZIP is required'); return; }
    if (!form.ask) { setError('Asking price is required'); return; }
    const safeHide = isFreePlan && form.hideStreet && otherHiddenCount >= FREE_HIDE_STREET_LIMIT ? false : !!form.hideStreet;
    const data = {
      ...form,
      hideStreet: safeHide,
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
          <Button onClick={save} disabled={atDealCap}>{mode === 'new' ? 'Add deal' : 'Save changes'}</Button>
        </div>
      </div>

      {atDealCap && (
        <UpgradeBanner message={`You've hit the Free plan's ${FREE_DEAL_LIMIT}-deal limit. Upgrade to Personal or Team to add more.`} />
      )}

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
              <label className={`flex items-center gap-2 mt-3 text-xs ${hideStreetLocked ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400'}`}>
                <input
                  type="checkbox"
                  checked={!!form.hideStreet}
                  disabled={hideStreetLocked}
                  onChange={(e) => patch({ hideStreet: e.target.checked })}
                  className="w-4 h-4 accent-amber-400 disabled:opacity-40"
                />
                Hide street number on public profile
                {hideStreetLocked && <span className="text-amber-400 ml-1">(Free plan: 1 hidden deal max — upgrade for unlimited)</span>}
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
                <Field label="Asking ($)"><Input type="number" min="0" step="1000" value={form.ask} onChange={(e) => patch({ ask: e.target.value })} placeholder="100000" /></Field>
                <Field label="ARV ($)"><Input type="number" min="0" step="1000" value={form.arv} onChange={(e) => patch({ arv: e.target.value })} placeholder="150000" /></Field>
                <Field label="Access"><Select value={form.access} onChange={(e) => patch({ access: e.target.value })}><option>Lockbox</option><option>Tenant</option><option>Call</option><option>Agent</option></Select></Field>
                <Field label="Status"><Select value={form.status} onChange={(e) => patch({ status: e.target.value })}>{DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-3">Spread: <b className={spread > 0 ? 'text-green-400' : 'text-red-400'}>${spread.toLocaleString()}</b></p>
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

            {mode === 'edit' && existing && (
              <IMSharePanel deal={existing} onChange={(patch) => dispatch({ type: 'update_deal', id: existing.id, patch })} show={show} />
            )}
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
                <p className="text-white font-mono text-sm font-semibold mt-2">${(Number(form.ask) || 0).toLocaleString()} <span className="text-slate-400 font-normal">/ ${(Number(form.arv) || 0).toLocaleString()} ARV</span></p>
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

// ─── Investment Memorandum share panel ───────────────────────────────────
// Lets the wholesaler generate a public /deal/<slug> link and choose which
// fields appear on the buyer-facing IM page. Persists toggles immediately
// (one PATCH per change) and pushes the new state back into the store so
// the rest of the UI stays in sync.
const IM_TOGGLES = [
  { key: 'imShowAsking',       label: 'Asking price' },
  { key: 'imShowArv',          label: 'ARV' },
  { key: 'imShowRepair',       label: 'Repair / deal analysis' },
  { key: 'imShowMao',          label: 'MAO (max allowable offer)', sensitive: true },
  { key: 'imShowContact',      label: 'Wholesaler contact' },
  { key: 'imShowStreetNumber', label: 'Street number on hero' },
];

function IMSharePanel({ deal, onChange, show }) {
  const [slug, setSlug] = React.useState(deal.imSlug || null);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { setSlug(deal.imSlug || null); }, [deal.imSlug]);

  const shareUrl = slug && typeof window !== 'undefined'
    ? `${window.location.origin}/deal/${slug}`
    : '';

  async function generate() {
    setGenerating(true); setError(null);
    try {
      const s = await DealLinkAPI.shareIM(deal.id);
      setSlug(s);
      onChange({ imSlug: s });
      show('Share link ready');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to generate share link');
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  }

  async function toggle(key, value) {
    setSaving(key); setError(null);
    onChange({ [key]: value });   // optimistic
    try {
      await DealLinkAPI.updateIMToggles(deal.id, { [key]: value });
    } catch (err) {
      onChange({ [key]: !value }); // revert
      setError(err?.response?.data?.error || err?.message || 'Failed to save toggle');
    } finally {
      setSaving(null);
    }
  }

  return (
    <section>
      <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
        <Share2 className="w-4 h-4 text-amber-400" /> Investment Memorandum
      </h3>
      <p className="text-xs text-slate-400 mb-3">
        Generate a shareable buyer-facing link for this deal. Buyers verify by SMS, then see the IM with only the fields you allow below.
      </p>

      {!slug && (
        <Button onClick={generate} disabled={generating}>
          <Share2 className="w-4 h-4" /> {generating ? 'Generating…' : 'Generate share link'}
        </Button>
      )}

      {slug && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button variant="secondary" onClick={copy} title="Copy URL">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-400/40"
              title="Open preview"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-[11px] text-slate-500 font-mono">slug: {slug}</p>
        </div>
      )}

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Visibility on the IM page</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {IM_TOGGLES.map((t) => {
            const value = !!deal[t.key];
            const isSaving = saving === t.key;
            return (
              <label
                key={t.key}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border ${
                  value ? 'border-amber-400/30 bg-amber-400/5' : 'border-slate-700 bg-slate-800/40'
                } ${isSaving ? 'opacity-60' : ''}`}
              >
                <span className="text-sm text-slate-200">
                  {t.label}
                  {t.sensitive && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-400">sensitive</span>}
                </span>
                <input
                  type="checkbox"
                  checked={value}
                  disabled={isSaving}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{error}</div>
      )}
    </section>
  );
}
