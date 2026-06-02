import React from 'react';
import OnboardingCard from '../components/OnboardingCard.jsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Image as ImageIcon, Share2, Copy, ExternalLink, Check, Calculator, ChevronRight, FileText, Upload, Download, FileImage, FileCheck2, Scroll, FileBadge, Eye, X } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import DealDebutModal from '../components/DealDebutModal.jsx';
import DealHighlightCard from '../components/DealHighlightCard.jsx';
import MilestoneCard from '../components/MilestoneCard.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Select, Textarea, Field, StatusBadge, Modal } from '../components/ui.jsx';
import { DEAL_STATUSES, DealLinkAPI, DOCUMENT_CATEGORIES } from '../lib/deallink-api.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UpgradeBanner } from '../components/UpgradePrompt.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';

const FREE_DEAL_LIMIT = 10;
const FREE_HIDE_STREET_LIMIT = 1;

function parseComps(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  return list.map((c) => ({
    id: c?.id || crypto.randomUUID(),
    address: c?.address ?? '',
    salePrice: c?.salePrice ?? '',
    sqft: c?.sqft ?? '',
    dateSold: c?.dateSold ?? '',
  }));
}

const EMPTY = {
  addr: '', city: '', state: '', zip: '', type: 'SFR', units: 1, beds: 3, baths: 2, sqft: 1200,
  ask: 0, arv: 0, occ: 'Vacant', access: 'Lockbox', status: 'New', notes: '',
  description: '', photoUrl: '', photos: [], tags: [], hideStreet: false,
  marketplaceVisible: true,
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
  const [tab, setTab] = React.useState('overview');
  const [comps, setComps] = React.useState(() => parseComps(existing?.comps));
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [debut, setDebut] = React.useState({ open: false, address: '' });
  const [highlightOpen, setHighlightOpen] = React.useState(false);
  const [milestone, setMilestone] = React.useState(null);

  const dealCount = state.deals.length;
  const otherHiddenCount = state.deals.filter((d) => d.hideStreet && (!existing || d.id !== existing.id)).length;
  const atDealCap = isFreePlan && mode === 'new' && dealCount >= FREE_DEAL_LIMIT;
  const hideStreetLocked = isFreePlan && otherHiddenCount >= FREE_HIDE_STREET_LIMIT && !form.hideStreet;

  React.useEffect(() => { if (mode === 'edit' && existing) { setForm(existing); setComps(parseComps(existing.comps)); } }, [mode, existing]);

  function addComp() {
    setComps((c) => [...c, { id: crypto.randomUUID(), address: '', salePrice: '', sqft: '', dateSold: '' }]);
  }
  function patchComp(cid, p) {
    setComps((c) => c.map((x) => (x.id === cid ? { ...x, ...p } : x)));
  }
  function removeComp(cid) {
    setComps((c) => c.filter((x) => x.id !== cid));
  }

  if (mode === 'edit' && !state.loaded) {
    return <Layout><div className="py-32 text-center text-[#6e6e73] text-xs font-mono">Loading deal…</div></Layout>;
  }
  if (mode === 'edit' && !existing) {
    return <Layout>
      <div className="py-32 text-center">
        <p className="text-[#1d1d1f] text-lg">Deal not found</p>
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
      comps: JSON.stringify(comps),
    };
    if (mode === 'new') {
      const isFirstDeal = dealCount === 0;
      dispatch({ type: 'add_deal', deal: data });
      dispatch({ type: 'update_onboarding', patch: { addedDeal: true } });
      show('Deal added');
      if (isFirstDeal && !localStorage.getItem('debut_shown')) {
        localStorage.setItem('debut_shown', 'true');
        setDebut({ open: true, address: data.addr });
        return;
      }
    } else {
      const wasClosed = existing.status === 'Closed';
      dispatch({ type: 'update_deal', id: existing.id, patch: data });
      show('Saved');
      if (data.status === 'Closed' && !wasClosed && !localStorage.getItem('milestone_first_deal_closed')) {
        localStorage.setItem('milestone_first_deal_closed', 'true');
        setMilestone({ type: 'first_deal_closed' });
        return;
      }
    }
    nav('/admin');
  }

  const spread = (Number(form.arv) || 0) - (Number(form.ask) || 0);

  return (
    <Layout>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <Link to="/admin" className="text-[#6e6e73] text-xs hover:text-[#b8860b] flex items-center gap-1.5"><ArrowLeft className="w-3 h-3" /> Properties</Link>
          <h1 className="text-2xl font-bold text-[#1d1d1f] mt-2">{mode === 'new' ? 'New deal' : (form.addr || 'Edit deal')}</h1>
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

      {mode === 'edit' && existing && (
        <div className="border-b border-[rgba(0,0,0,0.08)] mb-5 flex items-center gap-6">
          {[
            { k: 'overview',   label: 'Overview' },
            { k: 'documents',  label: 'Documents' },
            { k: 'im_builder', label: 'IM Builder' },
            { k: 'im_preview', label: 'IM Live Preview' },
            { k: 'analysis',   label: 'Deal Analysis', internal: true },
          ].map((t) => {
            const active = tab === t.k;
            const inactiveColor = t.internal
              ? 'text-[#aeaeb2] hover:text-[#3a3a3c]'
              : 'text-[#6e6e73] hover:text-[#3a3a3c]';
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`relative pb-3 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  active ? 'text-[#1d1d1f]' : inactiveColor
                }`}
              >
                {t.label}
                {t.internal && (
                  <span
                    style={{
                      fontSize: 9,
                      background: 'rgba(0,0,0,0.07)',
                      color: '#6e6e73',
                      borderRadius: 99,
                      padding: '2px 7px',
                      fontWeight: 600,
                    }}
                  >
                    🔒 Internal
                  </span>
                )}
                <span
                  className={`absolute left-0 right-0 -bottom-px h-0.5 rounded-full ${
                    active ? 'bg-[#b8860b]' : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
      {mode === 'edit' && existing && <OnboardingCard stepKey={`deal_${tab}`} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <CardBody className="space-y-6">
            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-lg">{error}</div>}

            {(mode !== 'edit' || tab === 'overview') && (<>

            {mode === 'edit' && existing && (
              <div className="flex items-center justify-between gap-3 pb-1">
                <h3 className="text-[#1d1d1f] font-semibold text-sm">Overview</h3>
                <Button variant="secondary" onClick={() => setHighlightOpen(true)}>
                  <Share2 className="w-4 h-4" /> Share this deal
                </Button>
              </div>
            )}

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_80px] gap-3">
                <Field label="Street"><Input value={form.addr} onChange={(e) => patch({ addr: e.target.value })} placeholder="2418 Wentworth Ave" /></Field>
                <Field label="City"><Input value={form.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Dallas" /></Field>
                <Field label="State"><Input value={form.state} onChange={(e) => patch({ state: e.target.value.toUpperCase() })} maxLength={2} placeholder="TX" /></Field>
                <Field label="ZIP"><Input value={form.zip} onChange={(e) => patch({ zip: e.target.value })} placeholder="75215" /></Field>
              </div>
              <label className={`flex items-center gap-2 mt-3 text-xs ${hideStreetLocked ? 'text-[#6e6e73] cursor-not-allowed' : 'text-[#6e6e73]'}`}>
                <input
                  type="checkbox"
                  checked={!!form.hideStreet}
                  disabled={hideStreetLocked}
                  onChange={(e) => patch({ hideStreet: e.target.checked })}
                  className="w-4 h-4 accent-[#b8860b] disabled:opacity-40"
                />
                Hide street number on public profile
                {hideStreetLocked && <span className="text-[#b8860b] ml-1">(Free plan: 1 hidden deal max — upgrade for unlimited)</span>}
              </label>
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Specs</h3>
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
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Pricing & status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Asking ($)"><Input type="number" min="0" step="1000" value={form.ask} onChange={(e) => patch({ ask: e.target.value })} placeholder="100000" /></Field>
                <Field label="ARV ($)"><Input type="number" min="0" step="1000" value={form.arv} onChange={(e) => patch({ arv: e.target.value })} placeholder="150000" /></Field>
                <Field label="Access"><Select value={form.access} onChange={(e) => patch({ access: e.target.value })}><option>Lockbox</option><option>Tenant</option><option>Call</option><option>Agent</option></Select></Field>
                <Field label="Status"><Select value={form.status} onChange={(e) => patch({ status: e.target.value })}>{DEAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <p className="text-xs text-[#6e6e73] font-mono mt-3">Spread: <b className={spread > 0 ? 'text-green-400' : 'text-red-400'}>${spread.toLocaleString()}</b></p>
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Description</h3>
              <Field label="Short description (1–2 lines, shown on the marketplace)">
                <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Vacant SFR, cosmetic rehab, motivated seller." />
              </Field>
              <Field label="Long notes (private)">
                <Textarea rows={4} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="New roof 2023. Seller motivated. Contract ready." />
              </Field>
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Marketplace</h3>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.06)] text-[#b8860b] focus:ring-[#b8860b]"
                  checked={form.marketplaceVisible !== false}
                  onChange={(e) => patch({ marketplaceVisible: e.target.checked })}
                />
                <span>
                  <span className="block text-sm text-[#1d1d1f] font-medium">Show on marketplace</span>
                  <span className="block text-xs text-[#6e6e73] mt-0.5">
                    When on, this deal appears on the cross-wholesaler marketplace.
                  </span>
                </span>
              </label>
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Tags</h3>
              <Field label="Tags (comma-sep)">
                <Input
                  value={(form.tags || []).join(', ')}
                  onChange={(e) => patch({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="vacant, cash-only, rehab"
                />
              </Field>
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Photos</h3>
              <p className="text-xs text-[#86868b] mb-3">
                Upload up to 12 photos. Drag to reorder — the first photo is your cover image
                (shown as the thumbnail on your public profile and on the buyer-facing IM).
              </p>
              <PhotoUploader
                dealId={existing?.id || 'pending'}
                value={form.photos}
                onChange={(photos) => {
                  // Keep the legacy photoUrl in sync with the cover so the
                  // public profile + IM preview light up immediately for
                  // existing call-sites that still read photoUrl.
                  patch({ photos, photoUrl: photos[0] || '' });
                }}
              />
            </section>

            <section>
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-1">Comparable Sales (Comps)</h3>
              <p className="text-xs text-[#86868b] mb-3">These are visible to buyers on your public deal page.</p>
              <div className="space-y-3">
                {comps.map((c) => {
                  const sp = Number(c.salePrice) || 0;
                  const sf = Number(c.sqft) || 0;
                  const ppsf = sf > 0 ? sp / sf : null;
                  return (
                    <div key={c.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end">
                      <Field label="Street address">
                        <Input value={c.address} onChange={(e) => patchComp(c.id, { address: e.target.value })} placeholder="1234 Main St" />
                      </Field>
                      <Field label="Sale price ($)">
                        <Input type="number" min="0" step="1000" value={c.salePrice} onChange={(e) => patchComp(c.id, { salePrice: e.target.value })} placeholder="150000" />
                      </Field>
                      <Field label="Sqft">
                        <Input type="number" min="0" value={c.sqft} onChange={(e) => patchComp(c.id, { sqft: e.target.value })} placeholder="1200" />
                      </Field>
                      <Field label="Price/sqft">
                        <Input value={ppsf != null ? `$${ppsf.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'} readOnly className="bg-[rgba(0,0,0,0.04)] text-[#6e6e73]" />
                      </Field>
                      <Field label="Date sold">
                        <Input type="date" value={c.dateSold} onChange={(e) => patchComp(c.id, { dateSold: e.target.value })} />
                      </Field>
                      <button
                        type="button"
                        onClick={() => removeComp(c.id)}
                        title="Remove comp"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[rgba(0,0,0,0.12)] text-red-500 hover:bg-red-500/10 hover:border-red-500/40 transition-colors mb-px"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {comps.length === 0 && (
                  <p className="text-xs text-[#86868b]">No comps added yet.</p>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={addComp}
                className="mt-3 border-[#b8860b]/40 text-[#b8860b] hover:bg-[#b8860b]/5"
              >
                + Add comp
              </Button>
            </section>

            </>)}

            {mode === 'edit' && existing && tab === 'documents' && (
              <DealDocumentsSection deal={existing} show={show} />
            )}

            {mode === 'edit' && existing && tab === 'im_builder' && (
              <IMMemoBuilder
                deal={existing}
                onSave={(patch) => dispatch({ type: 'update_deal', id: existing.id, patch, throwOnError: true })}
                show={show}
              />
            )}

            {mode === 'edit' && existing && tab === 'im_preview' && (
              <section className="space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] pb-4">
                  <div className="flex-1">
                    <IMPublicLink deal={existing} show={show} />
                  </div>
                  <ShareIMButton
                    deal={existing}
                    onSave={(patch) => dispatch({ type: 'update_deal', id: existing.id, patch, throwOnError: true })}
                    show={show}
                  />
                </div>
                <IMLivePreview deal={existing} />
              </section>
            )}

            {mode === 'edit' && existing && tab === 'analysis' && (
              <DealAnalysisSection
                deal={existing}
                onDelete={async (analysisId) => {
                  if (!confirm('Delete this saved analysis?')) return;
                  const current = Array.isArray(existing.analyzerState)
                    ? existing.analyzerState
                    : (existing.analyzerState ? [existing.analyzerState] : []);
                  const next = current.filter((a) => a && a.id !== analysisId);
                  try {
                    await dispatch({
                      type: 'update_deal',
                      id: existing.id,
                      patch: { analyzerState: next.length ? next : null },
                      throwOnError: true,
                    });
                    show('Analysis deleted');
                  } catch (e) {
                    show(e?.response?.data?.error || e?.message || 'Could not delete analysis');
                  }
                }}
              />
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-4">
          <MAOCalculator arv={form.arv} />
          <Card>
            <CardHeader><CardTitle>Live preview</CardTitle></CardHeader>
            <CardBody>
              {mode === 'edit' && existing ? (
                <div
                  onClick={() => setPreviewOpen(true)}
                  style={{ cursor: 'pointer' }}
                  className="rounded-lg overflow-hidden border border-[rgba(0,0,0,0.08)] transition-[outline] [outline:2px_solid_transparent] hover:[outline:2px_solid_rgba(184,134,11,0.4)]"
                >
                  <div className="h-32 bg-[rgba(0,0,0,0.06)] flex items-center justify-center">
                    {(form.photos?.[0] || form.photoUrl) ? <img src={form.photos?.[0] || form.photoUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-[#6e6e73]" />}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between"><p className="text-[#1d1d1f] text-sm font-semibold truncate">{form.hideStreet && form.addr ? form.addr.replace(/^\d+\s+/, '— ') : (form.addr || '—')}</p><StatusBadge status={form.status} /></div>
                    <p className="text-[#6e6e73] text-xs font-mono mt-1">{form.zip || '—'} · {form.beds}/{form.baths} · {form.sqft}sf</p>
                    <p className="text-[#1d1d1f] font-mono text-sm font-semibold mt-2">${(Number(form.ask) || 0).toLocaleString()} <span className="text-[#6e6e73] font-normal">/ ${(Number(form.arv) || 0).toLocaleString()} ARV</span></p>
                  </div>
                  <p style={{ fontSize: '10px', color: '#b8860b', textAlign: 'center', padding: '6px' }}>👁 Click to preview buyer view</p>
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden border border-[rgba(0,0,0,0.08)]">
                  <div className="h-32 bg-[rgba(0,0,0,0.06)] flex items-center justify-center">
                    {(form.photos?.[0] || form.photoUrl) ? <img src={form.photos?.[0] || form.photoUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-[#6e6e73]" />}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between"><p className="text-[#1d1d1f] text-sm font-semibold truncate">{form.hideStreet && form.addr ? form.addr.replace(/^\d+\s+/, '— ') : (form.addr || '—')}</p><StatusBadge status={form.status} /></div>
                    <p className="text-[#6e6e73] text-xs font-mono mt-1">{form.zip || '—'} · {form.beds}/{form.baths} · {form.sqft}sf</p>
                    <p className="text-[#1d1d1f] font-mono text-sm font-semibold mt-2">${(Number(form.ask) || 0).toLocaleString()} <span className="text-[#6e6e73] font-normal">/ ${(Number(form.arv) || 0).toLocaleString()} ARV</span></p>
                  </div>
                </div>
              )}
              <p className="text-xs text-[#86868b] mt-3">This is what buyers see on your public profile.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      {mode === 'edit' && existing && previewOpen && (
        <div
          onClick={() => setPreviewOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(90vw, 1100px)', height: '85vh', background: 'white', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ height: '44px', background: '#1d1d1f', display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between' }}>
              <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>👁 Buyer view — Live Preview</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                style={{ color: 'white', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <IMLivePreview deal={existing} />
            </div>
          </div>
        </div>
      )}
      <DealDebutModal
        open={debut.open}
        handle={state.profile?.handle || ''}
        address={debut.address}
        onClose={() => { setDebut({ open: false, address: '' }); nav('/admin'); }}
      />
      {highlightOpen && existing && (
        <DealHighlightCard
          deal={existing}
          profile={state.profile}
          onClose={() => setHighlightOpen(false)}
        />
      )}
      {milestone && (
        <MilestoneCard
          milestone={milestone}
          profile={state.profile}
          onClose={() => { setMilestone(null); nav('/admin'); }}
        />
      )}
      {node}
    </Layout>
  );
}

// ─── (legacy ShareIMModal removed — its job moved into DealIMSection on
// the "Investment memo (IM)" tab. Stub kept temporarily for diff
// readability; safe to delete once the IM tab ships.) ───────────────────
function _LegacyShareIMModal_unused({ open, onClose, deal, onSave, show }) {
  const initial = React.useMemo(() => ({
    show_photos:   deal.imConfig?.show_photos   ?? true,
    show_analyzer: deal.imConfig?.show_analyzer ?? true,
    show_rehab:    deal.imConfig?.show_rehab    ?? true,
  }), [deal.imConfig]);

  const [cfg, setCfg] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { if (open) setCfg(initial); }, [open, initial]);

  const shareUrl = `https://deallink.neuroaios.ai/im/${deal.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      show('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      show('Could not copy — select and copy manually');
    }
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ imConfig: cfg });
      show('Settings saved');
      onClose();
    } catch (e) {
      show(e?.response?.data?.error || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const toggles = [
    { key: 'show_photos',   label: 'Show photos' },
    { key: 'show_analyzer', label: 'Show deal analysis / analyzer scenarios' },
    { key: 'show_rehab',    label: 'Show rehab estimate' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Share Investment Memorandum" maxWidth="max-w-xl">
      <div className="space-y-5">
        <div className="space-y-2">
          {toggles.map((t) => {
            const value = !!cfg[t.key];
            return (
              <label
                key={t.key}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${
                  value ? 'border-[#b8860b]/30 bg-[#b8860b]/5' : 'border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.06)]/40'
                }`}
              >
                <span className="text-sm text-[#3a3a3c]">{t.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  onClick={() => setCfg((c) => ({ ...c, [t.key]: !c[t.key] }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    value ? 'bg-[#b8860b]' : 'bg-[rgba(0,0,0,0.08)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            );
          })}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Shareable link</p>
          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button variant="secondary" onClick={copy} title="Copy link">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Deal Analysis section ───────────────────────────────────────────────
// Shown inside the property editor. When the analyzer has been saved for
// this deal, renders a summary card with the headline numbers; otherwise
// falls back to the original "open analyzer" button.

const fmtUsd = (n) =>
  Number.isFinite(n)
    ? Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : '$0';
const fmtSignedUsd = (n) => (n < 0 ? `-${fmtUsd(Math.abs(n))}` : fmtUsd(n));
const fmtPct = (n) => (Number.isFinite(n) ? `${Number(n).toFixed(1)}%` : '0.0%');

function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60)         return 'just now';
  const min = Math.floor(s / 60);
  if (min < 60)       return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)         return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)         return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STRATEGY_LABELS = {
  rental: 'Rental',
  brrrr: 'BRRRR',
  flip: 'Fix & Flip',
  multi: 'Multifamily',
  commercial: 'Commercial',
  brrrr_adv: 'Advanced BRRRR',
  flip_adv: 'Advanced Fix & Flip',
  mao: 'MAO',
};

// Recompute the headline metrics from the saved analyzerState inputs.
// Mirrors the math in DealAnalyzer's `m` memo so the report reflects the
// exact same numbers the user saw on save (without storing every derived
// value).
function deriveMetrics(s) {
  const purchasePrice = Number(s.purchasePrice) || 0;
  const arv           = Number(s.arv) || 0;
  const downPct       = Number(s.downPct) || 0;
  const rate          = Number(s.rate) || 0;
  const term          = Number(s.term) || 30;
  const closingPct    = Number(s.closingPct) || 0;
  const taxesYr       = Number(s.taxesYr) || 0;
  const insYr         = Number(s.insYr) || 0;
  const monthlyRent   = Number(s.monthlyRent) || 0;
  const vacancyPct    = Number(s.vacancyPct) || 0;
  const mgmtPct       = Number(s.mgmtPct) || 0;
  const maintPct      = Number(s.maintPct) || 0;
  const capexPct      = Number(s.capexPct) || 0;
  const holdingMo     = Number(s.holdingMo) || 0;
  const items         = Array.isArray(s.items) ? s.items : [];

  const rehab = Number(s.rehabOverride) || items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);
  const closingBuy = purchasePrice * (closingPct / 100);
  const holdingTotal = (taxesYr / 12 + insYr / 12) * holdingMo;
  const loan = purchasePrice * (1 - downPct / 100);
  const r = rate / 100 / 12;
  const n = term * 12;
  const piti = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : (n > 0 ? loan / n : 0);
  const totalCash = purchasePrice * (downPct / 100) + rehab + closingBuy;

  const grossYr = monthlyRent * 12;
  const opex = grossYr * (vacancyPct / 100) + grossYr * (mgmtPct / 100)
             + grossYr * (maintPct / 100) + grossYr * (capexPct / 100)
             + taxesYr + insYr;
  const noi = grossYr - opex;
  const cashFlowYr = noi - piti * 12;
  const monthlyCashFlow = cashFlowYr / 12;
  const coc = totalCash > 0 ? (cashFlowYr / totalCash) * 100 : 0;
  const cap = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

  const sellingCosts = arv * 0.08;
  const flipNetProfit = arv - purchasePrice - rehab - closingBuy - holdingTotal - sellingCosts - piti * holdingMo;
  const flipInvestment = totalCash + holdingTotal + piti * holdingMo;
  const flipROI = flipInvestment > 0 ? (flipNetProfit / flipInvestment) * 100 : 0;
  const flipAnnROI = (flipROI * 12) / Math.max(holdingMo, 1);
  const mao = arv * 0.7 - rehab;

  return {
    purchasePrice, arv, rehab, closingBuy, holdingTotal, loan, piti, totalCash,
    noi, monthlyCashFlow, coc, cap,
    flipNetProfit, flipInvestment, flipROI, flipAnnROI, mao,
    items,
  };
}

const STRATEGY_BADGE = {
  rental:        { label: 'Rental',      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  brrrr:         { label: 'BRRRR',       cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  flip:          { label: 'Fix & Flip',  cls: 'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[#b8860b]/40' },
  brrrr_adv:     { label: 'Adv. BRRRR',     cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  flip_adv:      { label: 'Adv. Fix & Flip', cls: 'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[#b8860b]/40' },
  multi:         { label: 'Multifamily', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  commercial:    { label: 'Commercial',  cls: 'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.12)]/40' },
  mao:           { label: 'MAO',         cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
};

function fmtSavedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function DealAnalysisSection({ deal, onDelete }) {
  const raw = deal.analyzerState;
  const analyses = React.useMemo(() => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (raw && typeof raw === 'object') return [raw]; // legacy single object
    return [];
  }, [raw]);

  const sorted = React.useMemo(() => {
    return [...analyses].sort((a, b) => {
      const ta = new Date(a?.savedAt || 0).getTime();
      const tb = new Date(b?.savedAt || 0).getTime();
      return tb - ta;
    });
  }, [analyses]);

  const [expandedId, setExpandedId] = React.useState(null);

  if (analyses.length === 0) {
    return (
      <section>
        <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3">Deal Analysis</h3>
        <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 p-4">
          <p className="text-sm text-[#6e6e73] mb-3">
            No analysis saved yet.
          </p>
          <Link
            to={`/deal-analyzer/${deal.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#b8860b]/60 bg-white text-[#b8860b] text-sm hover:border-[#b8860b] hover:text-[#b8860b]"
          >
            <Calculator className="w-3.5 h-3.5" /> Run one in the Deal Analyzer
          </Link>
          <p className="text-xs text-[#86868b] mt-2">
            Opens the analyzer prefilled with this property's address, ask, and ARV.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[#1d1d1f] font-semibold text-sm flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#b8860b]" /> Saved analyses
          <span className="text-[11px] text-[#86868b] font-normal">({analyses.length})</span>
        </h3>
        <Link
          to={`/deal-analyzer/${deal.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#b8860b] text-white text-xs font-semibold hover:opacity-90"
        >
          <Calculator className="w-3.5 h-3.5" /> New analysis
        </Link>
      </div>

      <div className="space-y-2">
        {sorted.map((a) => {
          const expanded = expandedId === a.id;
          return (
            <SavedAnalysisRow
              key={a.id || a.savedAt}
              analysis={a}
              deal={deal}
              expanded={expanded}
              onToggle={() => setExpandedId(expanded ? null : a.id)}
              onDelete={() => onDelete && onDelete(a.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function SavedAnalysisRow({ analysis, deal, expanded, onToggle, onDelete }) {
  const a = analysis;
  const strategy = a.strategy || (a.summary && a.summary.strategy) || 'rental';
  const badge = STRATEGY_BADGE[strategy] || { label: strategy, cls: 'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.12)]/40' };
  const isFlip = strategy === 'flip';

  const isIframe = a.source === 'iframe';
  const m = isIframe ? null : deriveMetrics(a);
  const previewLabel = isIframe ? null : (isFlip ? 'Net Profit' : 'Monthly Cash Flow');
  const previewValue = isIframe ? null : (isFlip ? m?.flipNetProfit : m?.monthlyCashFlow);
  const previewTone = (!isIframe && previewValue >= 0) ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity"
        >
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border ${badge.cls} flex-shrink-0`}>
            {badge.label}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#6e6e73] truncate">{fmtSavedAt(a.savedAt)}</p>
            <p className="text-[11px] text-[#86868b] mt-0.5">
              {isIframe ? (
                <span className="text-[#6e6e73]">Tap to view full analysis →</span>
              ) : (
                <>
                  <span className="text-[#6e6e73]">{previewLabel}:</span>{' '}
                  <span className={`font-mono font-semibold ${previewTone}`}>{fmtSignedUsd(previewValue)}</span>
                </>
              )}
            </p>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-[#86868b] flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
        <button
          onClick={onDelete}
          className="text-[#86868b] hover:text-rose-300 p-1.5 rounded hover:bg-[rgba(0,0,0,0.06)] flex-shrink-0"
          title="Delete this analysis"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[rgba(0,0,0,0.08)]">
          <SavedAnalysisReport analysis={a} deal={deal} />
        </div>
      )}
    </div>
  );
}

function IframeCalcReport({ analysis }) {
  const frameRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const mode = analysis.strategy === 'brrrr' ? 'brrrr' : 'flip';
  React.useEffect(() => {
    if (!ready || !frameRef.current) return;
    try {
      frameRef.current.contentWindow.postMessage({
        type: 'REI_PREFILL',
        mode,
        deal: { calcState: analysis.calcState },
      }, '*');
    } catch (e) {}
  }, [ready, mode, analysis.calcState]);
  return (
    <div style={{ width: '100%', height: 900 }}>
      <iframe
        ref={frameRef}
        src={`/deal-calc.html?mode=${mode}&readonly=1`}
        style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
        onLoad={() => setReady(true)}
        title="Saved Deal Analysis"
      />
    </div>
  );
}

function SavedAnalysisReport({ analysis, deal }) {
  if (analysis.source === 'iframe' && analysis.calcState) {
    return <IframeCalcReport analysis={analysis} />;
  }
  const state = analysis;
  const strategy = state.strategy || (state.summary && state.summary.strategy) || 'rental';
  const strategyLabel = STRATEGY_LABELS[strategy] || (state.summary && state.summary.strategyLabel) || strategy;
  const isFlip = strategy === 'flip';

  const savedAtIso = state.savedAt || deal.analyzerStateUpdatedAt;
  const savedDate = savedAtIso
    ? new Date(savedAtIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const addressLine = [deal.addr, [deal.city, deal.state || deal.zip].filter(Boolean).join(', ')]
    .filter(Boolean).join(' · ');

  const m = deriveMetrics(state);

  // Tone helpers
  const tonePos = (n) => (n >= 0 ? 'text-emerald-300' : 'text-rose-300');

  // Key metrics differ by strategy.
  const keyMetrics = isFlip
    ? [
        { label: 'Net Profit',        value: fmtSignedUsd(m.flipNetProfit), tone: tonePos(m.flipNetProfit) },
        { label: 'Total ROI',         value: fmtPct(m.flipROI),             tone: tonePos(m.flipROI) },
        { label: 'Annualized ROI',    value: fmtPct(m.flipAnnROI),          tone: tonePos(m.flipAnnROI) },
        { label: 'Total Investment',  value: fmtUsd(m.flipInvestment),      tone: 'text-[#1d1d1f]' },
      ]
    : [
        { label: 'Monthly Cash Flow',     value: fmtSignedUsd(m.monthlyCashFlow), tone: tonePos(m.monthlyCashFlow) },
        { label: 'Cash-on-Cash Return',   value: fmtPct(m.coc),                   tone: tonePos(m.coc) },
        { label: 'Cap Rate',              value: fmtPct(m.cap),                   tone: tonePos(m.cap) },
        { label: 'Annual NOI',            value: fmtSignedUsd(m.noi),             tone: tonePos(m.noi) },
      ];

  // Investment Summary line items.
  const investmentRows = [
    { label: 'Purchase Price',     value: fmtUsd(m.purchasePrice) },
    { label: 'Rehab Costs',        value: fmtUsd(m.rehab) },
    { label: 'Closing Costs',      value: fmtUsd(m.closingBuy) },
    { label: 'Total Cash Invested', value: fmtUsd(m.totalCash), strong: true },
    { label: 'Loan Amount',        value: fmtUsd(m.loan) },
    { label: 'Monthly Mortgage',   value: fmtUsd(m.piti) },
    ...(isFlip ? [
      { label: 'ARV',                       value: fmtUsd(m.arv) },
      { label: 'Max Allowable Offer (70% Rule)', value: fmtSignedUsd(m.mao), tone: tonePos(m.mao) },
      { label: 'Holding Costs',             value: fmtUsd(m.holdingTotal) },
    ] : []),
  ];

  const rehabItems = m.items.filter((i) => i && (i.category || i.description || Number(i.cost)));
  const rehabTotal = rehabItems.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);

  return (
    <section className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#b8860b]/30 bg-gradient-to-br from-[rgba(184,134,11,0.08)] to-white p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-4 h-4 text-[#b8860b]" />
              <span className="text-[10px] uppercase tracking-wider text-[#b8860b] font-semibold">
                {strategyLabel} Analysis
              </span>
            </div>
            <h3 className="text-[#1d1d1f] font-semibold text-base truncate">
              {addressLine || 'Untitled property'}
            </h3>
            {savedDate && (
              <p className="text-xs text-[#6e6e73] mt-1">Saved on {savedDate}</p>
            )}
          </div>
          <Link
            to={`/deal-analyzer/${deal.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#b8860b] text-white text-xs font-semibold hover:opacity-90 flex-shrink-0"
          >
            <Calculator className="w-3.5 h-3.5" /> Re-run analysis
          </Link>
        </div>
      </div>

      {/* ─── Key Metrics (2x2) ───────────────────────────────────── */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Key Metrics</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {keyMetrics.map((k) => (
            <div key={k.label} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 p-4">
              <p className="text-[11px] uppercase tracking-wider text-[#86868b]">{k.label}</p>
              <p className={`text-xl font-semibold mt-1 ${k.tone}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Investment Summary ──────────────────────────────────── */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Investment Summary</h4>
        <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 divide-y divide-[rgba(0,0,0,0.08)]">
          {investmentRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
              <span className={`text-sm ${row.strong ? 'text-[#1d1d1f] font-semibold' : 'text-[#3a3a3c]'}`}>
                {row.label}
              </span>
              <span className={`text-sm font-mono ${row.tone || (row.strong ? 'text-[#b8860b] font-semibold' : 'text-[#1d1d1f]')}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Rehab Breakdown ─────────────────────────────────────── */}
      {rehabItems.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Rehab Breakdown</h4>
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2 bg-white/60 border-b border-[rgba(0,0,0,0.08)] text-[10px] uppercase tracking-wider text-[#86868b] font-semibold">
              <div className="col-span-4">Category</div>
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-right">Cost</div>
            </div>
            <div className="divide-y divide-[rgba(0,0,0,0.08)]">
              {rehabItems.map((i, idx) => (
                <div key={i.id || idx} className="grid grid-cols-12 px-4 py-2.5 text-sm">
                  <div className="col-span-4 text-[#3a3a3c]">{i.category || '—'}</div>
                  <div className="col-span-6 text-[#6e6e73]">{i.description || '—'}</div>
                  <div className="col-span-2 text-right font-mono text-[#1d1d1f]">{fmtUsd(Number(i.cost) || 0)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12 px-4 py-2.5 bg-white/60 border-t border-[rgba(0,0,0,0.08)]">
              <div className="col-span-10 text-sm text-[#1d1d1f] font-semibold">Total</div>
              <div className="col-span-2 text-right text-sm font-mono text-[#b8860b] font-semibold">{fmtUsd(rehabTotal)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Footer actions ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-1">
        <Link
          to={`/deal-analyzer/${deal.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#b8860b]/60 bg-white text-[#b8860b] text-xs hover:border-[#b8860b] hover:text-[#b8860b]"
        >
          <Calculator className="w-3.5 h-3.5" /> Re-run analysis
        </Link>
      </div>
    </section>
  );
}

// Right-rail MAO Calculator — the full detailed widget mirrored from the
// Deal Analyzer (MaoCalc). ARV is pre-filled from the deal's current ARV;
// all other fields are editable local state and are NOT saved to the deal.
// MAO = ARV − buyer profit − repair − wholesale fee − misc costs.
function MAOCalculator({ arv }) {
  const [arvVal, setArv] = React.useState(Number(arv) || 0);
  const [repair, setRepair] = React.useState(0);
  const [fee, setFee] = React.useState(0);
  const [misc, setMisc] = React.useState(0);
  const [profitVal, setProfitVal] = React.useState(20);
  const [profitMode, setProfitMode] = React.useState('%'); // '%' or '$'

  const profitDollar = profitMode === '%' ? arvVal * (profitVal / 100) : profitVal;
  const profitPct    = profitMode === '$' ? (arvVal > 0 ? (profitVal / arvVal) * 100 : 0) : profitVal;
  const mao          = arvVal - profitDollar - repair - fee - misc;
  const totalInvest  = mao + repair + misc;
  const roi          = totalInvest > 0 ? (profitDollar / totalInvest) * 100 : 0;

  const inp = 'w-full border border-[rgba(0,0,0,0.08)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#b8860b]';
  const row = (label, icon, children) => (
    <div className="mb-3">
      <label className="flex items-center gap-1.5 text-xs text-[#6e6e73] mb-1">{icon} {label}</label>
      {children}
    </div>
  );

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
        <Calculator className="w-4 h-4 text-[#b8860b]" /> MAO (Maximum Allowable Offer)
      </h2>

      {row('After Repair Value (ARV)', '🏠',
        <div className="flex items-center gap-1">
          <span className="text-sm text-[#6e6e73]">$</span>
          <input type="number" className={inp} value={arvVal} onChange={e => setArv(Number(e.target.value) || 0)} />
        </div>
      )}
      {row('Repair Costs', '🔧',
        <div className="flex items-center gap-1">
          <span className="text-sm text-[#6e6e73]">$</span>
          <input type="number" className={inp} value={repair} onChange={e => setRepair(Number(e.target.value) || 0)} />
        </div>
      )}
      {row('Your Wholesale Fee', '$',
        <div className="flex items-center gap-1">
          <span className="text-sm text-[#6e6e73]">$</span>
          <input type="number" className={inp} value={fee} onChange={e => setFee(Number(e.target.value) || 0)} />
        </div>
      )}
      {row('Miscellaneous Costs', '$',
        <div className="flex items-center gap-1">
          <span className="text-sm text-[#6e6e73]">$</span>
          <input type="number" className={inp} value={misc} onChange={e => setMisc(Number(e.target.value) || 0)} />
        </div>
      )}
      {row("Buyer's Profit", '📊',
        <div className="flex items-center gap-1">
          <input type="number" className={inp} value={profitVal} onChange={e => setProfitVal(Number(e.target.value) || 0)} />
          <select
            value={profitMode}
            onChange={e => setProfitMode(e.target.value)}
            className="border border-[rgba(0,0,0,0.08)] rounded-md px-2 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b8860b]"
          >
            <option value="%">%</option>
            <option value="$">$</option>
          </select>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6e6e73] mb-3">Results</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#b8860b] font-medium">Maximum Allowable Offer:</span>
            <span className="font-semibold text-[#b8860b]">{mao >= 0 ? `$${Math.round(mao).toLocaleString()}` : '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#6e6e73]">Total Buyer Investment:</span>
            <span className="font-mono">${Math.round(totalInvest).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#6e6e73]">Buyer's Profit Margin:</span>
            <span className="font-mono">{profitPct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#6e6e73]">Buyer's ROI:</span>
            <span className="font-mono">{roi.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#b8860b]">Your Wholesale Fee:</span>
            <span className="font-semibold text-[#b8860b]">${Math.round(fee).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${tone || 'text-[#1d1d1f]'}`}>{value}</p>
    </div>
  );
}

// ─── (legacy IMSharePanel removed — replaced by DealIMSection on the
// "Investment memo (IM)" tab. Kept the stub below until 2026-Q3 cleanup
// to make the diff easy to follow.) ─────────────────────────────────────
function _LegacyIMSharePanel_unused({ deal, onChange, show }) {
  const [slug, setSlug] = React.useState(deal.imSlug || null);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { setSlug(deal.imSlug || null); }, [deal.imSlug]);

  const shareUrl = slug ? `https://doorine.com/r/${deal.id}` : '';

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
    <section id="im-share-panel" className="rounded-lg p-3 -m-3 transition-shadow scroll-mt-6">
      <h3 className="text-[#1d1d1f] font-semibold text-sm mb-3 flex items-center gap-2">
        <Share2 className="w-4 h-4 text-[#b8860b]" /> Investment Memorandum
      </h3>
      <p className="text-xs text-[#6e6e73] mb-3">
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
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[rgba(0,0,0,0.08)] text-[#3a3a3c] hover:text-[#b8860b] hover:border-[#b8860b]/40"
              title="Open preview"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-[11px] text-[#86868b] font-mono">slug: {slug}</p>
        </div>
      )}

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Visibility on the IM page</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {IM_TOGGLES.map((t) => {
            const value = !!deal[t.key];
            const isSaving = saving === t.key;
            return (
              <label
                key={t.key}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border ${
                  value ? 'border-[#b8860b]/30 bg-[#b8860b]/5' : 'border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.06)]/40'
                } ${isSaving ? 'opacity-60' : ''}`}
              >
                <span className="text-sm text-[#3a3a3c]">
                  {t.label}
                  {t.sensitive && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#b8860b]">sensitive</span>}
                </span>
                <input
                  type="checkbox"
                  checked={value}
                  disabled={isSaving}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                  className="w-4 h-4 accent-[#b8860b]"
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

// ─── Deal Documents section ──────────────────────────────────────────────
// Shown inside the property editor on the Documents tab. Lists every file
// attached to the deal, supports upload (via Supabase signed-URL flow) and
// delete. The IM "show on memorandum" toggle is intentionally NOT here —
// that's the next task.

const CATEGORY_STYLES = {
  Contract:   { cls: 'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[#b8860b]/40',     Icon: FileBadge },
  Inspection: { cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',           Icon: FileCheck2 },
  Photos:     { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: FileImage },
  Title:      { cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30',  Icon: Scroll },
  Other:      { cls: 'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.12)]/40',     Icon: FileText },
};

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDocDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DealDocumentsSection({ deal, show }) {
  const [docs, setDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('Other');
  const [busy, setBusy] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const fileRef = React.useRef(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await DealLinkAPI.listDocuments(deal.id);
      setDocs(list);
    } catch (e) {
      setLoadError(e?.response?.data?.error || e?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [deal.id]);

  React.useEffect(() => { reload(); }, [reload]);

  function pickFile(f) {
    setFile(f || null);
    if (f && !name) setName(f.name);
  }

  function resetForm() {
    setFile(null);
    setName('');
    setCategory('Other');
    setUploadOpen(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function upload() {
    if (!file) { show('Choose a file first'); return; }
    const finalName = (name || file.name).trim();
    if (!finalName) { show('Document name is required'); return; }
    setBusy(true);
    try {
      const signed = await DealLinkAPI.createSignedUpload(deal.id, file.name);
      const { error: upErr } = await supabase.storage
        .from(signed.bucket || 'deal-photos')
        .uploadToSignedUrl(signed.path || signed.storagePath, signed.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (upErr) throw upErr;
      const created = await DealLinkAPI.commitDocument(deal.id, {
        name: finalName,
        category,
        storagePath: signed.path || signed.storagePath,
        fileSizeBytes: file.size,
        mimeType: file.type || '',
      });
      setDocs((prev) => [created, ...prev]);
      show('Document uploaded');
      resetForm();
    } catch (e) {
      show(e?.response?.data?.error || e?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function download(doc) {
    setBusyId(doc.id);
    try {
      const url = await DealLinkAPI.downloadDocument(deal.id, doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      show(e?.response?.data?.error || e?.message || 'Could not open document');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(doc) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setBusyId(doc.id);
    try {
      await DealLinkAPI.deleteDocument(deal.id, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      show('Document deleted');
    } catch (e) {
      show(e?.response?.data?.error || e?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[#1d1d1f] font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#b8860b]" /> Documents
          <span className="text-[11px] text-[#86868b] font-normal">({docs.length})</span>
        </h3>
        {!uploadOpen && (
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#b8860b] text-white text-xs font-semibold hover:opacity-90"
          >
            <Upload className="w-3.5 h-3.5" /> Upload document
          </button>
        )}
      </div>

      {uploadOpen && (
        <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/60 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
            <Field label="File">
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="block w-full text-sm text-[#3a3a3c] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[rgba(0,0,0,0.06)] file:text-[#3a3a3c] file:text-xs file:font-semibold hover:file:bg-[rgba(0,0,0,0.08)]"
              />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Purchase contract — signed" />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={resetForm} disabled={busy}>Cancel</Button>
            <Button onClick={upload} disabled={busy || !file}>
              {busy ? 'Uploading…' : <><Upload className="w-4 h-4" /> Upload</>}
            </Button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-lg">{loadError}</div>
      )}

      {loading ? (
        <div className="text-xs text-[#86868b] font-mono py-6 text-center">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.08)] bg-white/40 p-8 text-center">
          <FileText className="w-8 h-8 text-[#6e6e73] mx-auto mb-2" />
          <p className="text-sm text-[#6e6e73]">No documents yet.</p>
          <p className="text-xs text-[#86868b] mt-1">Upload contracts, inspections, photos, or title docs to keep them with this deal.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const style = CATEGORY_STYLES[d.category] || CATEGORY_STYLES.Other;
            const Icon = style.Icon;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3 hover:border-[rgba(0,0,0,0.08)]"
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-md border ${style.cls}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[#1d1d1f] font-medium truncate">{d.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${style.cls} font-semibold uppercase tracking-wide`}>
                      {d.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#86868b] font-mono mt-0.5">
                    {fmtBytes(d.fileSizeBytes)} · {fmtDocDate(d.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => download(d)}
                  disabled={busyId === d.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[#3a3a3c] hover:text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.06)] disabled:opacity-50"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Investment Memorandum (IM) tab
// ═══════════════════════════════════════════════════════════════════════════
// Top-level "Investment memo (IM)" tab on the deal editor. Two sub-tabs:
//   1. Memo builder — pick which saved analysis feeds the IM, toggle which
//      sections appear, and copy the public link.
//   2. Live preview — placeholder for the next sub-task; will render the IM
//      exactly as buyers see it.
// All persistence flows through `imConfig` JSONB on `deallink_deals`. Saves
// are optimistic and per-toggle (the existing store dispatch handles PATCH).

const IM_SECTIONS = [
  { key: 'propertyOverview',  title: 'Property overview',  desc: 'Address, type, beds/baths',                       defaultOn: true  },
  { key: 'description',       title: 'Description',        desc: 'Short pitch shown at top of the memo',            defaultOn: true  },
  { key: 'photos',            title: 'Photos',             desc: 'Gallery from the property record',                defaultOn: true  },
  { key: 'dealNumbers',       title: 'Deal numbers',       desc: 'ARV, asking, repair, MAO',                        defaultOn: true  },
  { key: 'dealChecks',        title: 'Deal checks',        desc: '1% rule, ARV spread, etc.',                       defaultOn: true  },
  { key: 'rehabBreakdown',    title: 'Rehab breakdown',    desc: 'Line-item scope & cost',                          defaultOn: true  },
  { key: 'notes',             title: 'Notes',              desc: 'Public notes you write here',                     defaultOn: false },
  { key: 'documents',         title: 'Documents',          desc: 'Files attached to this deal (per-doc toggles next)', defaultOn: false },
  { key: 'wholesalerContact', title: 'Wholesaler contact', desc: 'Your name, phone, email',                         defaultOn: true  },
  { key: 'dealAnalysis',      title: 'Deal analysis',      desc: 'Cash flow, cap rate, ROI from the chosen scenario', defaultOn: true  },
];

const IM_NUMBER_FIELDS = [
  { key: 'showArv',    label: 'ARV',                            defaultOn: true  },
  { key: 'showAsking', label: 'Asking price',                   defaultOn: true  },
  { key: 'showRepair', label: 'Repair cost',                    defaultOn: true  },
  { key: 'showMao',    label: 'MAO (max allowable offer)',      defaultOn: false, sensitive: true },
];

function defaultImConfig() {
  return {
    selectedAnalysisId: null,
    sections: Object.fromEntries(IM_SECTIONS.map((s) => [s.key, s.defaultOn])),
    fields:   Object.fromEntries(IM_NUMBER_FIELDS.map((f) => [f.key, f.defaultOn])),
    privacy:  { showStreetNumber: true },
  };
}

// Merge a stored config blob with the current defaults so newly-added
// sections/fields appear in their default state for older deals.
function mergeImConfig(stored) {
  const def = defaultImConfig();
  if (!stored || typeof stored !== 'object') return def;
  return {
    selectedAnalysisId: stored.selectedAnalysisId ?? def.selectedAnalysisId,
    sections: { ...def.sections, ...(stored.sections || {}) },
    fields:   { ...def.fields,   ...(stored.fields   || {}) },
    privacy:  { ...def.privacy,  ...(stored.privacy  || {}) },
  };
}

function dealAnalysesArray(deal) {
  const raw = deal?.analyzerState;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

function analysisHeadline(a) {
  if (!a) return null;
  try {
    const m = deriveMetrics(a);
    const strategy = STRATEGY_LABELS[a.strategy] || a.strategy || 'Analysis';
    const when = a.savedAt ? new Date(a.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return { strategy, when, metrics: m };
  } catch {
    return { strategy: 'Analysis', when: '', metrics: null };
  }
}

// ─── IM Public link row ──────────────────────────────────────────────────
// Shared between the "IM Builder" and "IM Live Preview" top-level tabs.
// Generates the buyer-facing share URL plus a copy affordance. The
// open-preview button is disabled until the public IM route ships.
function IMPublicLink({ deal, show }) {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);
  const shareUrl = `https://doorine.com/im/${deal.id}`;
  const previewLive = false;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      show && show('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  }

  return (
    <div>
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}
      <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Public link</p>
      <div className="flex items-center gap-2">
        <Input value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button variant="secondary" onClick={copyLink} title="Copy link">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {previewLive ? (
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[rgba(0,0,0,0.08)] text-[#3a3a3c] hover:text-[#b8860b] hover:border-[#b8860b]/40"
            title="Open preview"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        ) : (
          <span
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[rgba(0,0,0,0.08)] text-[#6e6e73] cursor-not-allowed"
            title="The public IM page hasn't shipped yet — coming with the next sub-task."
            aria-disabled="true"
          >
            <ExternalLink className="w-4 h-4" />
          </span>
        )}
      </div>
      {!previewLive && (
        <p className="text-[11px] text-[#86868b] mt-1.5">
          The public IM page goes live with the next update — copy the link now to share once it ships.
        </p>
      )}
    </div>
  );
}

// Share button rendered next to the Live preview sub-tab. Generates the
// public buyer link (slug) on first click via DealLinkAPI.shareIM, then
// switches to a copy affordance with the resolved URL.
function ShareIMButton({ deal, show }) {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(null);
  const shareUrl = `https://doorine.com/im/${deal.id}`;

  async function handleClick() {
    setError(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      show && show('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-md bg-yellow-400 hover:bg-yellow-300 border-2 border-black px-3 py-1.5 text-sm font-semibold text-black shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        title={shareUrl}
      >
        <Share2 className="w-4 h-4" />
        {copied ? 'Copied!' : 'Share IM'}
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
      {!error && (
        <span className="text-[11px] text-[#86868b] max-w-[280px] truncate" title={shareUrl}>
          {shareUrl}
        </span>
      )}
    </div>
  );
}

// ─── IM Live Preview ─────────────────────────────────────────────────────
// Renders the Investment Memorandum exactly as buyers will see it on the
// public page, using the section/field/privacy toggles from imConfig and
// the analysis selected in the Memo builder. Renders inline inside the
// editor so wholesalers can flip between Memo builder and Live preview
// without leaving the page.
function IMLivePreview({ deal }) {
  const { state } = useStore();
  const profile = state?.profile || {};
  const cfg = React.useMemo(() => mergeImConfig(deal.imConfig), [deal.imConfig]);
  const analyses = React.useMemo(() => dealAnalysesArray(deal), [deal.analyzerState]);

  const selectedAnalysis = React.useMemo(() => {
    if (!cfg.selectedAnalysisId) return null;
    return analyses.find((a) => a && a.id === cfg.selectedAnalysisId) || null;
  }, [analyses, cfg.selectedAnalysisId]);

  const metrics = React.useMemo(
    () => (selectedAnalysis ? deriveMetrics(selectedAnalysis) : null),
    [selectedAnalysis],
  );

  const ask    = Number(deal.ask) || 0;
  const arv    = Number(deal.arv) || 0;
  const spread = arv - ask;
  const repair = metrics?.rehab || 0;
  const mao    = metrics?.mao || 0;

  // Address rendering — respects the Memo builder privacy toggle.
  const addrLine = cfg.privacy.showStreetNumber
    ? (deal.addr || '—')
    : (deal.addr ? deal.addr.replace(/^\d+\s+/, '— ') : '—');

  const cityLine = [deal.city, deal.state, deal.zip].filter(Boolean).join(', ');
  const specsLine = `${deal.type || 'SFR'} · ${deal.beds || 0}bd / ${deal.baths || 0}ba · ${(Number(deal.sqft) || 0).toLocaleString()} sqft`;

  // Deal checks — computed live from the selected analysis (or from the
  // raw deal numbers when no analysis is selected).
  const onePctRule  = ask > 0 && metrics ? ((Number(selectedAnalysis?.monthlyRent) || 0) / ask) * 100 : null;
  const cashOnCash  = metrics ? metrics.coc : null;
  const capRateNum  = metrics ? metrics.cap : null;
  const arvSpreadPct = ask > 0 ? (spread / ask) * 100 : 0;

  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f5f5f7]/40 overflow-hidden">
      {/* Buyer-view banner so the wholesaler knows this is a preview. */}
      <div className="bg-[rgba(184,134,11,0.10)] border-b border-[#b8860b]/20 px-4 py-2 flex items-center gap-2 text-xs text-[#b8860b]">
        <Eye className="w-3.5 h-3.5" />
        Buyer view — this is exactly what investors see.
      </div>

      <div className="p-6 space-y-6">
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <header className="space-y-1.5">
          <h2 className="text-2xl font-bold text-[#1d1d1f]">
            {addrLine} <span className="text-[#b8860b]">— Investment Opportunity</span>
          </h2>
          <p className="text-sm text-[#6e6e73]">
            {cityLine || 'Location pending'} · {specsLine}
          </p>
        </header>

        {/* ─── Photos ─────────────────────────────────────────────────── */}
        {cfg.sections.photos && (() => {
          const gallery = (Array.isArray(deal.photos) && deal.photos.length
            ? deal.photos
            : (deal.photoUrl ? [deal.photoUrl] : []));
          const visible = gallery.slice(0, 3);
          const overflow = Math.max(0, gallery.length - visible.length);
          return (
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                  const url = visible[i];
                  // Use the +N tile in the third slot when there are more
                  // than 3 photos so buyers know more exist.
                  const isOverflowTile = i === 2 && overflow > 0;
                  return (
                    <div
                      key={i}
                      className="aspect-video rounded-lg border border-[rgba(0,0,0,0.08)] bg-white flex items-center justify-center overflow-hidden relative"
                    >
                      {url ? (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-[#6e6e73]">
                          {i === 0 ? 'Main photo' : `Photo ${i + 1}`}
                        </span>
                      )}
                      {isOverflowTile && (
                        <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-semibold">
                          +{overflow + 1} photos
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {gallery.length === 0 && (
                <p className="text-[11px] text-[#86868b] mt-2">
                  Upload photos on the Overview tab to populate the gallery.
                </p>
              )}
            </section>
          );
        })()}

        {/* ─── Description ────────────────────────────────────────────── */}
        {cfg.sections.description && deal.description && (
          <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3">
            <p className="text-sm text-[#3a3a3c] leading-relaxed">{deal.description}</p>
          </section>
        )}

        {/* ─── Key metrics ────────────────────────────────────────────── */}
        {cfg.sections.dealNumbers && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">Key metrics</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {cfg.fields.showAsking && (
                <MetricTile label="Asking price" value={fmtUsd(ask)} tone="text-[#1d1d1f]" />
              )}
              {cfg.fields.showArv && (
                <MetricTile
                  label="ARV"
                  value={fmtUsd(arv)}
                  hint={ask > 0 ? `${arvSpreadPct.toFixed(0)}% spread` : null}
                  tone="text-[#1d1d1f]"
                />
              )}
              {capRateNum != null && (
                <MetricTile label="Cap rate" value={fmtPct(capRateNum)} tone="text-[#b8860b]" />
              )}
              {metrics && (
                <MetricTile label="Annual NOI" value={fmtUsd(metrics.noi)} tone="text-emerald-400" />
              )}
              {cfg.fields.showRepair && repair > 0 && (
                <MetricTile label="Repair cost" value={fmtUsd(repair)} tone="text-[#1d1d1f]" />
              )}
              {cfg.fields.showMao && mao > 0 && (
                <MetricTile label="MAO" value={fmtUsd(mao)} tone="text-[#b8860b]" />
              )}
            </div>
            {!metrics && (cfg.fields.showRepair || cfg.fields.showMao) && (
              <p className="text-[11px] text-[#86868b] mt-2">
                Select a saved analysis on the Memo builder tab to populate cap rate, NOI, repair, and MAO.
              </p>
            )}
          </section>
        )}

        {/* ─── Property details + deal checks side by side ────────────── */}
        {(cfg.sections.propertyOverview || cfg.sections.dealChecks) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cfg.sections.propertyOverview && (
              <DetailTable
                title="Property details"
                rows={[
                  ['Type',           deal.type || 'SFR'],
                  ['Beds / baths',   `${deal.beds || 0} bd · ${deal.baths || 0} ba`],
                  ['Square footage', `${(Number(deal.sqft) || 0).toLocaleString()} sqft`],
                  ['Status',         deal.status || 'New'],
                  ['Total investment', metrics ? fmtUsd(metrics.totalCash) : '—'],
                ]}
              />
            )}
            {cfg.sections.dealChecks && (
              <DetailTable
                title="Deal checks"
                rows={[
                  [
                    '1% rule',
                    onePctRule != null ? `${onePctRule.toFixed(1)}%` : '—',
                    onePctRule != null && onePctRule >= 1 ? 'good' : (onePctRule != null ? 'bad' : 'muted'),
                  ],
                  [
                    'Cash-on-cash',
                    cashOnCash != null ? `${cashOnCash.toFixed(1)}%` : '—',
                    cashOnCash != null && cashOnCash >= 8 ? 'good' : (cashOnCash != null ? 'bad' : 'muted'),
                  ],
                  [
                    'Cap rate',
                    capRateNum != null ? fmtPct(capRateNum) : '—',
                    capRateNum != null && capRateNum >= 6 ? 'good' : (capRateNum != null ? 'bad' : 'muted'),
                  ],
                  [
                    'ARV spread',
                    `${arvSpreadPct.toFixed(0)}%`,
                    arvSpreadPct >= 25 ? 'good' : (arvSpreadPct >= 0 ? 'warn' : 'bad'),
                  ],
                ]}
              />
            )}
          </section>
        )}

        {/* ─── Deal analysis (full breakdown) ─────────────────────────── */}
        {cfg.sections.dealAnalysis && metrics && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">
              Deal analysis · {STRATEGY_LABELS[selectedAnalysis?.strategy] || 'Scenario'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricTile label="Monthly cash flow" value={fmtSignedUsd(metrics.monthlyCashFlow)} tone={metrics.monthlyCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <MetricTile label="Annual cash flow" value={fmtSignedUsd(metrics.monthlyCashFlow * 12)} tone={metrics.monthlyCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <MetricTile label="P&I / mo" value={fmtUsd(metrics.piti)} tone="text-[#1d1d1f]" />
              <MetricTile label="Cash to close" value={fmtUsd(metrics.totalCash)} tone="text-[#1d1d1f]" />
            </div>
          </section>
        )}

        {/* ─── Rehab breakdown ────────────────────────────────────────── */}
        {cfg.sections.rehabBreakdown && metrics && Array.isArray(metrics.items) && metrics.items.length > 0 && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">Rehab breakdown</p>
            <div className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {metrics.items.map((it, i) => {
                    const safe = it && typeof it === 'object' ? it : {};
                    return (
                      <tr key={i} className={i % 2 ? 'bg-white/40' : ''}>
                        <td className="px-3 py-2 text-[#3a3a3c]">{safe.label || safe.name || `Item ${i + 1}`}</td>
                        <td className="px-3 py-2 text-right text-[#3a3a3c] font-mono">{fmtUsd(Number(safe.cost) || 0)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#b8860b]/5 border-t border-[#b8860b]/20">
                    <td className="px-3 py-2 text-[#b8860b] font-semibold">Total rehab</td>
                    <td className="px-3 py-2 text-right text-[#b8860b] font-semibold font-mono">{fmtUsd(metrics.rehab)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── Notes ──────────────────────────────────────────────────── */}
        {cfg.sections.notes && deal.notes && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">Notes</p>
            <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3">
              <p className="text-sm text-[#3a3a3c] whitespace-pre-wrap leading-relaxed">{deal.notes}</p>
            </div>
          </section>
        )}

        {/* ─── Documents (placeholder until per-doc IM toggle ships) ──── */}
        {cfg.sections.documents && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">Documents</p>
            <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-5 text-center">
              <FileText className="w-5 h-5 text-[#6e6e73] mx-auto mb-2" />
              <p className="text-xs text-[#6e6e73]">
                Per-document visibility ships with the next update — once you opt files in, they'll show here for buyers.
              </p>
            </div>
          </section>
        )}

        {/* ─── Wholesaler contact ─────────────────────────────────────── */}
        {cfg.sections.wholesalerContact && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">Wholesaler contact</p>
            <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full bg-[#b8860b]/15 border border-[#b8860b]/30 flex items-center justify-center text-[#b8860b] text-sm font-semibold shrink-0"
                style={profile.avatarUrl ? { background: `center/cover no-repeat url(${profile.avatarUrl})`, border: 'none' } : {}}
              >
                {!profile.avatarUrl && (profile.name || profile.handle || 'W').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 text-sm">
                <p className="text-[#1d1d1f] font-medium truncate">{profile.name || profile.handle || 'Wholesaler'}</p>
                <p className="text-xs text-[#6e6e73] truncate">
                  {profile.handle ? `@${profile.handle}` : ''}{profile.bio ? ` · ${profile.bio}` : ''}
                </p>
                {profile.handle && (
                  <a
                    href={`${import.meta.env.VITE_DEALLINK_URL || ''}/signup`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline truncate"
                    style={{ fontSize: 12, color: '#b8860b', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
                  >
                    Follow @{profile.handle} on REI Flywheel →
                  </a>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
      <p className={`text-lg font-semibold mt-1 font-mono ${tone || 'text-[#1d1d1f]'}`}>{value}</p>
      {hint && <p className="text-[10px] text-[#86868b] mt-0.5">{hint}</p>}
    </div>
  );
}

function DetailTable({ title, rows }) {
  const toneCls = {
    good: 'text-emerald-400',
    bad:  'text-red-400',
    warn: 'text-[#b8860b]',
    muted: 'text-[#86868b]',
  };
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[#86868b] mb-2">{title}</p>
      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value, tone], i) => (
              <tr key={i} className={i % 2 ? 'bg-white/40' : ''}>
                <td className="px-3 py-2 text-[#6e6e73]">{label}</td>
                <td className={`px-3 py-2 text-right font-mono ${tone ? toneCls[tone] : 'text-[#3a3a3c]'}`}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IMMemoBuilder({ deal, onSave, show }) {
  const cfg = React.useMemo(() => mergeImConfig(deal.imConfig), [deal.imConfig]);
  const analyses = React.useMemo(() => dealAnalysesArray(deal), [deal.analyzerState]);

  const [saving, setSaving] = React.useState(null); // key currently being saved
  const [error, setError] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  // The dedicated /im/:dealId public route hasn't been wired yet — that
  // ships with the "Live preview" sub-task. Until then the link string is
  // generated (and copyable for later) but the open-preview affordance is
  // disabled to avoid sending users to a 404.
  const shareUrl = `https://doorine.com/im/${deal.id}`;
  const previewLive = false;

  // Optimistic patch helper. `path` is one of: 'selectedAnalysisId',
  // 'sections.<key>', 'fields.<key>', 'privacy.<key>'.
  async function patchCfg(path, value, savingKey) {
    setSaving(savingKey || path);
    setError(null);
    const next = { ...cfg };
    if (path === 'selectedAnalysisId') {
      next.selectedAnalysisId = value;
    } else {
      const [bucket, key] = path.split('.');
      next[bucket] = { ...next[bucket], [key]: value };
    }
    try {
      await onSave({ imConfig: next });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not save');
    } finally {
      setSaving(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      show && show('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* ─── Public link ───────────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Public link</p>
        <div className="flex items-center gap-2">
          <Input value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <Button variant="secondary" onClick={copyLink} title="Copy link">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {previewLive ? (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[rgba(0,0,0,0.08)] text-[#3a3a3c] hover:text-[#b8860b] hover:border-[#b8860b]/40"
              title="Open preview"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          ) : (
            <span
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[rgba(0,0,0,0.08)] text-[#6e6e73] cursor-not-allowed"
              title="The public IM page hasn't shipped yet — coming with the next sub-task."
              aria-disabled="true"
            >
              <ExternalLink className="w-4 h-4" />
            </span>
          )}
        </div>
        {!previewLive && (
          <p className="text-[11px] text-[#86868b] mt-1.5">
            The public IM page goes live with the next update — copy the link now to share once it ships.
          </p>
        )}
      </div>

      {/* ─── Sections to include ───────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Sections to include</p>
        <div className="space-y-2">
          {IM_SECTIONS.map((s) => {
            const value = !!cfg.sections[s.key];
            const isSaving = saving === `sections.${s.key}`;
            return (
              <SectionToggleRow
                key={s.key}
                title={s.title}
                desc={s.desc}
                value={value}
                disabled={isSaving}
                onToggle={() => patchCfg(`sections.${s.key}`, !value)}
              >
                {/* Inline sub-toggles for "Deal numbers" — fine-grained
                    control over which dollar amounts appear on the IM. */}
                {s.key === 'dealNumbers' && value && (
                  <div className="mt-3 pl-3 border-l-2 border-[#b8860b]/30 space-y-1.5">
                    {IM_NUMBER_FIELDS.map((f) => {
                      const fv = !!cfg.fields[f.key];
                      const fSaving = saving === `fields.${f.key}`;
                      return (
                        <label
                          key={f.key}
                          className={`flex items-center justify-between gap-3 py-1 ${fSaving ? 'opacity-60' : ''}`}
                        >
                          <span className="text-xs text-[#3a3a3c]">
                            {f.label}
                            {f.sensitive && (
                              <span className="ml-2 text-[9px] uppercase tracking-wider text-[#b8860b]">sensitive</span>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            checked={fv}
                            disabled={fSaving}
                            onChange={(e) => patchCfg(`fields.${f.key}`, e.target.checked)}
                            className="w-4 h-4 accent-[#b8860b]"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </SectionToggleRow>
            );
          })}
        </div>
      </div>

      {/* ─── Choose analysis ───────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Choose analysis</p>
        {analyses.length === 0 ? (
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.06)]/40 px-4 py-5 text-center">
            <Calculator className="w-5 h-5 text-[#86868b] mx-auto mb-2" />
            <p className="text-sm text-[#3a3a3c]">No saved analyses yet</p>
            <p className="text-xs text-[#86868b] mt-1">
              Save an analysis on the Deal analysis tab to feature it on the IM.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {analyses.map((a) => {
              const head = analysisHeadline(a);
              const selected = cfg.selectedAnalysisId === a.id;
              const isSaving = saving === 'selectedAnalysisId';
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => patchCfg('selectedAnalysisId', selected ? null : a.id)}
                  disabled={isSaving}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                    selected
                      ? 'border-[#b8860b]/60 bg-[#b8860b]/5 ring-1 ring-[#b8860b]/40'
                      : 'border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.06)]/40 hover:border-[rgba(0,0,0,0.10)]'
                  } ${isSaving ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#1d1d1f] font-medium">
                        {head?.strategy || 'Analysis'}
                        {head?.when && <span className="text-[#6e6e73] font-normal ml-2">· {head.when}</span>}
                      </p>
                      {head?.metrics && (
                        <p className="text-xs text-[#6e6e73] font-mono mt-1">
                          CF: <span className={head.metrics.monthlyCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {fmtSignedUsd(head.metrics.monthlyCashFlow)}/mo
                          </span>
                          {' · '}Cap: <span className="text-[#3a3a3c]">{fmtPct(head.metrics.cap)}</span>
                          {' · '}ARV: <span className="text-[#3a3a3c]">{fmtUsd(Number(a.arv) || 0)}</span>
                        </p>
                      )}
                    </div>
                    <span
                      aria-hidden
                      className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 ${
                        selected ? 'border-[#b8860b] bg-[#b8860b]' : 'border-[rgba(0,0,0,0.10)]'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
            <p className="text-[11px] text-[#86868b] mt-1">
              Click again to deselect — the IM will skip the analysis section.
            </p>
          </div>
        )}
      </div>

      {/* ─── Privacy ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#86868b] mb-2">Privacy</p>
        <SectionToggleRow
          title="Show street number"
          desc="When off, the address is shown as &quot;— Wow Ave&quot; until a buyer requests details."
          value={!!cfg.privacy.showStreetNumber}
          disabled={saving === 'privacy.showStreetNumber'}
          onToggle={() => patchCfg('privacy.showStreetNumber', !cfg.privacy.showStreetNumber)}
        />
      </div>
    </div>
  );
}

function SectionToggleRow({ title, desc, value, disabled, onToggle, children }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-colors ${
        value ? 'border-[#b8860b]/30 bg-[#b8860b]/5' : 'border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.06)]/40'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#1d1d1f] font-medium">{title}</p>
          {desc && <p className="text-xs text-[#6e6e73] mt-0.5">{desc}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={disabled}
          onClick={onToggle}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            value ? 'bg-[#b8860b]' : 'bg-[rgba(0,0,0,0.08)]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {children}
    </div>
  );
}
