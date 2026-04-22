import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Field, Hairline, Stripe } from '../components/UI.jsx';

const EMPTY = {
  addr: '', city: '', zip: '', type: 'SFR', units: 1, beds: 3, baths: 2, sqft: 1200,
  ask: 0, arv: 0, occ: 'Vacant', access: 'Lockbox', status: 'active', notes: '', hideStreet: false,
};

export default function DealEditor({ mode }) {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();

  const existing = mode === 'edit' ? state.deals.find(d => d.id === id) : null;
  const [form, setForm] = React.useState(existing || EMPTY);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { if (mode === 'edit' && existing) setForm(existing); }, [id]);

  if (mode === 'edit' && !existing) {
    return (
      <AdminShell tab="deals">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Kicker>Not found</Kicker>
          <div style={{ marginTop: 8 }}>This deal doesn't exist.</div>
          <Link to="/admin" className="btn sm" style={{ marginTop: 16 }}>Back to deals</Link>
        </div>
      </AdminShell>
    );
  }

  function patch(p) { setForm(f => ({ ...f, ...p })); setError(null); }

  function save(publish) {
    if (!form.addr.trim()) { setError('Address is required'); return; }
    if (!form.zip.trim()) { setError('ZIP is required'); return; }
    if (!form.ask) { setError('Asking price is required'); return; }
    const status = publish ? (form.status === 'sold' ? 'sold' : 'active') : (mode === 'new' ? 'active' : form.status);
    const data = {
      ...form,
      status,
      ask: Number(form.ask) || 0,
      arv: Number(form.arv) || 0,
      beds: Number(form.beds) || 0,
      baths: Number(form.baths) || 0,
      sqft: Number(form.sqft) || 0,
      units: Number(form.units) || 1,
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
    <AdminShell tab="deals">
      <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link to="/admin" style={{ fontSize: 12, color: 'var(--mute)' }}>← Deals</Link>
          <div className="serif" style={{ fontSize: 24, marginTop: 4 }}>{mode === 'new' ? 'New deal' : form.addr || 'Edit deal'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mode === 'edit' && <button className="btn sm" onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: existing.id }); show('Deleted'); nav('/admin'); } }} style={{ color: 'var(--err)' }}>Delete</button>}
          <button className="btn sm" onClick={() => save(false)}>Save</button>
          <button className="btn sm solid" onClick={() => save(true)}>{mode === 'new' ? 'Publish' : 'Save & publish'}</button>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, alignItems: 'start' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 20 }}>
          {error && <div style={{ color: 'var(--err)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

          <Kicker>Address</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <Field label="Street"><input value={form.addr} onChange={(e) => patch({ addr: e.target.value })} placeholder="2418 Wentworth Ave" /></Field>
            <Field label="City"><input value={form.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Dallas, TX" /></Field>
            <Field label="ZIP"><input value={form.zip} onChange={(e) => patch({ zip: e.target.value })} placeholder="75215" /></Field>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--mute)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="hideStreet" checked={!!form.hideStreet} onChange={(e) => patch({ hideStreet: e.target.checked })} style={{ width: 'auto' }} />
            <label htmlFor="hideStreet">Hide street number on public profile (privacy)</label>
          </div>

          <Hairline style={{ margin: '20px 0' }} />
          <Kicker>Specs</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginTop: 10 }}>
            <Field label="Type">
              <select value={form.type} onChange={(e) => patch({ type: e.target.value })}>
                <option value="SFR">SFR</option>
                <option value="MF">MF</option>
                <option value="DUP">Duplex</option>
              </select>
            </Field>
            <Field label="Units"><input type="number" min="1" value={form.units} onChange={(e) => patch({ units: e.target.value })} /></Field>
            <Field label="Beds"><input type="number" min="0" value={form.beds} onChange={(e) => patch({ beds: e.target.value })} /></Field>
            <Field label="Baths"><input type="number" min="0" step="0.5" value={form.baths} onChange={(e) => patch({ baths: e.target.value })} /></Field>
            <Field label="Sqft"><input type="number" min="0" value={form.sqft} onChange={(e) => patch({ sqft: e.target.value })} /></Field>
            <Field label="Occupancy">
              <select value={form.occ} onChange={(e) => patch({ occ: e.target.value })}>
                <option>Vacant</option><option>Tenant</option><option>Mixed</option><option>Owner</option>
              </select>
            </Field>
          </div>

          <Hairline style={{ margin: '20px 0' }} />
          <Kicker>Price</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            <Field label="Asking ($k)"><input type="number" min="0" value={form.ask} onChange={(e) => patch({ ask: e.target.value })} /></Field>
            <Field label="ARV ($k)"><input type="number" min="0" value={form.arv} onChange={(e) => patch({ arv: e.target.value })} /></Field>
            <Field label="Access">
              <select value={form.access} onChange={(e) => patch({ access: e.target.value })}>
                <option>Lockbox</option><option>Tenant</option><option>Call</option><option>Agent</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => patch({ status: e.target.value })}>
                <option value="active">Active</option><option value="pending">Pending</option><option value="sold">Sold</option>
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
            Spread: <b style={{ color: spread > 0 ? 'var(--ink)' : 'var(--err)' }}>${spread}k</b>
          </div>

          <Hairline style={{ margin: '20px 0' }} />
          <Kicker>Notes</Kicker>
          <div style={{ marginTop: 8 }}>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Cosmetic rehab. New roof 2023. Seller motivated, contract ready..."
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <Hairline style={{ margin: '20px 0' }} />
          <Kicker>Photos · placeholder</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 10 }}>
            {[0, 1, 2].map(i => <Stripe key={i} height={70} label={`${i + 1}`} />)}
            <div style={{ height: 70, border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>+ upload</div>
          </div>
        </div>

        <aside style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 16, position: 'sticky', top: 16 }}>
          <Kicker>Live preview</Kicker>
          <div style={{ marginTop: 12, border: '1px solid var(--line)', padding: 14 }}>
            <Stripe height={90} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{form.hideStreet ? form.addr.replace(/^\d+\s+/, '— ') : form.addr || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--mono)', marginTop: 2 }}>{form.zip || '—'} · {form.beds}/{form.baths} · {form.sqft}sf</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, marginTop: 8 }}>${form.ask || 0}k <span style={{ color: 'var(--mute)', fontWeight: 400 }}>/ ${form.arv || 0}k ARV</span></div>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)' }}>
            This is what buyers see on your public profile.
          </div>
        </aside>
      </div>
      {node}
    </AdminShell>
  );
}
