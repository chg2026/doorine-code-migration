import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

// ─── Auth: token storage + axios interceptors ─────────────────────────────────

const TOKEN_KEY = 'chg_auth_token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

// Listener pattern lets the App re-render to the login screen when the token
// is cleared (either explicitly via logout or by the 401 response interceptor).
const authListeners = new Set();
const notifyAuthChange = () => authListeners.forEach(fn => { try { fn(); } catch {} });

axios.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers = { ...(config.headers || {}), Authorization: `Bearer ${t}` };
  return config;
});
axios.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null);
      notifyAuthChange();
    }
    return Promise.reject(err);
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtMoney = (n) =>
  `$${parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const getTimeline = (startStr, targetStr) => {
  if (!startStr || !targetStr) return null;
  const MS = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start  = new Date(startStr  + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  const totalDays    = Math.max(1, Math.round((target - start) / MS));
  const daysActive   = Math.max(0, Math.round((today - start) / MS));
  const daysRemaining = Math.max(0, Math.round((target - today) / MS));
  const pct = Math.min(100, Math.round((daysActive / totalDays) * 100));
  return { totalDays, daysActive, daysRemaining, pct };
};

const phaseCompletion = (phases) => {
  if (!phases || !phases.length) return 0;
  return Math.round(phases.reduce((s, p) => s + (p.completion_pct || 0), 0) / phases.length);
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'single_family',  label: 'Single Family',  unitHint: '1 unit'     },
  { value: 'duplex',         label: 'Duplex',          unitHint: '2 units'    },
  { value: 'triplex',        label: 'Triplex',         unitHint: '3 units'    },
  { value: 'multi_unit',     label: 'Multi-unit',      unitHint: '4+ units'   },
  { value: 'small_building', label: 'Small Building',  unitHint: '5–20 units' },
  { value: 'large_building', label: 'Large Building',  unitHint: '20+ units'  },
  { value: 'commercial',     label: 'Commercial',      unitHint: ''           },
  { value: 'mixed_use',      label: 'Mixed Use',       unitHint: ''           },
];
const PROPERTY_TYPE_MAP = Object.fromEntries(PROPERTY_TYPES.map(t => [t.value, t]));

const PROPERTY_STATUSES = [
  { value: 'vacant',             label: 'Vacant',             color: '#9a9690', bg: '#222'    },
  { value: 'not_started',        label: 'Not Started',        color: '#aaa',    bg: '#252525' },
  { value: 'under_construction', label: 'Under Construction', color: '#6e9ec9', bg: '#1a2d3d' },
  { value: 'ready_to_rent',      label: 'Ready to Rent',      color: '#c8a96e', bg: '#2d2a1a' },
  { value: 'occupied',           label: 'Occupied',           color: '#7ab88a', bg: '#0d2b1a' },
  { value: 'partial',            label: 'Partially Occupied', color: '#9b8ec4', bg: '#1e1a2d' },
];
const PROPERTY_STATUS_MAP = {
  ...Object.fromEntries(PROPERTY_STATUSES.map(s => [s.value, s])),
  active: { label: 'Active', color: '#7ab88a', bg: '#0d2b1a' },
};

// Pre-loaded job phases organized by category for fast project setup
const STANDARD_PHASE_GROUPS = [
  { group: 'Structural / Prep',   phases: ['Demolition', 'Cleaning', 'Framing', 'Insulation'] },
  { group: 'MEP',                 phases: ['Electrical', 'Plumbing'] },
  { group: 'Walls & Ceiling',     phases: ['Drywall', 'Mudding', 'Ceiling Repair', 'Paint Preparation', 'Paint'] },
  { group: 'Bathroom Remodel',    phases: ['Bathroom Prep', 'Bathroom Tile Install', 'Bathroom Fixtures Install'] },
  { group: 'Flooring',            phases: ['Floor Leveling', 'Plywood', 'Vinyl Floor Install'] },
  { group: 'Finishes & Install',  phases: ['Kitchen Cabinets Installation', 'Fixtures Installation', 'Doors Installation', 'Window Replacement'] },
];
const ALL_STANDARD_PHASES = STANDARD_PHASE_GROUPS.flatMap(g => g.phases);

const PROJECT_STATUSES = [
  { value: 'planning',   label: 'Planning',   color: '#9b8ec4', bg: '#1e1a2d' },
  { value: 'active',     label: 'Active',     color: '#7ab88a', bg: '#0d2b1a' },
  { value: 'delayed',    label: 'Delayed',    color: '#c8a96e', bg: '#2b1a0d' },
  { value: 'on_hold',    label: 'On Hold',    color: '#9a9690', bg: '#222'    },
  { value: 'completed',  label: 'Completed',  color: '#5a5855', bg: '#1a1a1a' },
];
const PROJECT_STATUS_MAP = Object.fromEntries(PROJECT_STATUSES.map(s => [s.value, s]));

const getPropType   = (p) => PROPERTY_TYPE_MAP[p.type] || PROPERTY_TYPE_MAP[p.property_type] || null;
const getPropStatus = (s) => PROPERTY_STATUS_MAP[s] || { label: s || 'Vacant', color: '#9a9690', bg: '#222' };
const getProjStatus = (s) => PROJECT_STATUS_MAP[s]  || { label: s || 'Active', color: '#7ab88a', bg: '#0d2b1a' };

// ─── Shared UI components ─────────────────────────────────────────────────────

function Bar({ pct, color, height = 5 }) {
  return (
    <div style={{ height, background: '#252525', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

function Badge({ label, bg, color }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: bg, color, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: '#5a5855', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, ...style }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, color = '#f0ede8' }) {
  return (
    <div style={{ background: '#111', borderRadius: 8, padding: '12px 14px', border: '0.5px solid #222' }}>
      <div style={{ fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 300, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9a9690', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BudgetRow({ label, spent, budget, barColor }) {
  const pct  = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const over = budget > 0 && spent > budget;
  const statusColor = over ? '#c97b6e' : pct > 85 ? '#c8a96e' : '#7ab88a';
  const remaining = budget - spent;
  const color = barColor || (over ? '#c97b6e' : pct > 85 ? '#c8a96e' : '#7ab88a');
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#9a9690', fontWeight: 500, minWidth: 72 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 500 }}>{fmtMoney(spent)}</span>
            <span style={{ color: '#5a5855' }}> of {fmtMoney(budget)}</span>
          </span>
          {budget > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: over ? '#2d1a1a' : '#1a2d1a', color: statusColor, letterSpacing: '0.04em' }}>
              {over ? `▲ OVER ${fmtMoney(Math.abs(remaining))}` : remaining === 0 ? 'AT BUDGET' : `✓ UNDER ${fmtMoney(remaining)}`}
            </span>
          )}
        </div>
      </div>
      <Bar pct={pct} color={color} height={5} />
      <div style={{ textAlign: 'right', fontSize: 10, color: '#5a5855', marginTop: 3 }}>{pct}% utilized</div>
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ onClose, title, children, maxWidth = 560 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 16, width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '0.5px solid #2a2a2a', position: 'sticky', top: 0, background: '#1a1a1a', zIndex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9a9690', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

// Shared form input styles
const inp = { width: '100%', background: '#111', border: '0.5px solid #333', borderRadius: 8, padding: '10px 12px', color: '#f0ede8', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
const lbl = { fontSize: 11, color: '#9a9690', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const ghostBtn = { background: 'none', border: '0.5px solid #333', color: '#9a9690', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const primaryBtn = (disabled) => ({ background: disabled ? '#2a2a2a' : '#c8a96e', border: 'none', color: disabled ? '#5a5855' : '#0f0f0f', borderRadius: 8, padding: '9px 20px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' });
const dangerBtn = { background: 'none', border: '0.5px solid #c97b6e44', color: '#c97b6e', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };

function FormActions({ onClose, onDelete, onSave, saving, disabled, label }) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '0.5px solid #252525', marginTop: 8 }}>
      <div>
        {onDelete && !confirmDel && <button onClick={() => setConfirmDel(true)} style={dangerBtn}>Delete</button>}
        {confirmDel && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#c97b6e' }}>Confirm delete?</span>
            <button onClick={onDelete} style={{ ...dangerBtn, background: '#c97b6e', color: '#fff', border: 'none', fontWeight: 600 }}>Yes</button>
            <button onClick={() => setConfirmDel(false)} style={ghostBtn}>No</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={onSave} disabled={disabled || saving} style={primaryBtn(disabled || saving)}>
          {saving ? 'Saving…' : label || 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Property Modal ───────────────────────────────────────────────────────────

function PropertyModal({ property, tenants, onClose, onSave, onDelete }) {
  const isEdit = !!property?.id;
  const [form, setForm] = useState({
    address: property?.address || '', city: property?.city || '',
    type: property?.type || property?.property_type || 'single_family',
    unit_count: property?.unit_count || 1, status: property?.status || 'vacant',
    purchase_price: property?.purchase_price || '', acquisition_date: property?.acquisition_date || '',
    insurance_policy: property?.insurance_policy || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const propTenants = (tenants || []).filter(t => t.property_id === property?.id);

  const handleSave = async () => {
    if (!form.address.trim()) { setError('Address is required.'); return; }
    setSaving(true); setError('');
    try { await onSave({ ...form, unit_count: Number(form.unit_count) || 1 }); }
    catch (e) { setError(e?.response?.data?.error || 'Save failed.'); setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Property' : 'Add Property'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={lbl}>Address *</label><input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St" autoFocus /></div>
        <div><label style={lbl}>City / State</label><input style={inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Cleveland, OH" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Property Type</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.type} onChange={e => set('type', e.target.value)}>
              {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: '#1a1a1a' }}>{t.label}{t.unitHint ? ` (${t.unitHint})` : ''}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Unit Count</label><input style={inp} type="number" min={1} value={form.unit_count} onChange={e => set('unit_count', e.target.value)} /></div>
        </div>
        <div>
          <label style={lbl}>Property Status</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {PROPERTY_STATUSES.map(st => {
              const active = form.status === st.value;
              return (
                <button key={st.value} onClick={() => set('status', st.value)} style={{ padding: '9px 6px', borderRadius: 8, border: `1px solid ${active ? st.color : '#2a2a2a'}`, background: active ? st.bg : 'transparent', color: active ? st.color : '#5a5855', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3 }}>
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Purchase Price</label><input style={inp} type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="0" /></div>
          <div><label style={lbl}>Acquisition Date</label><input style={{ ...inp, colorScheme: 'dark' }} type="date" value={form.acquisition_date || ''} onChange={e => set('acquisition_date', e.target.value)} /></div>
        </div>
        <div><label style={lbl}>Insurance Policy #</label><input style={inp} value={form.insurance_policy || ''} onChange={e => set('insurance_policy', e.target.value)} placeholder="Policy number" /></div>
        {isEdit && propTenants.length > 0 && (
          <div>
            <label style={lbl}>Current Tenants</label>
            <div style={{ background: '#111', borderRadius: 8, border: '0.5px solid #2a2a2a', overflow: 'hidden' }}>
              {propTenants.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', fontSize: 13, borderBottom: i < propTenants.length - 1 ? '0.5px solid #1e1e1e' : 'none' }}>
                  <div><span style={{ fontWeight: 500 }}>{t.name}</span>{t.unit && <span style={{ color: '#9a9690', marginLeft: 8, fontSize: 12 }}>{t.unit}</span>}</div>
                  <Badge label={(t.payment_status || 'current').toUpperCase()} bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'} color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'} />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8 }}>{error}</div>}
        <FormActions onClose={onClose} onDelete={isEdit ? onDelete : null} onSave={handleSave} saving={saving} disabled={!form.address.trim()} label={isEdit ? 'Save Changes' : 'Add Property'} />
      </div>
    </Modal>
  );
}

// ─── Property card ────────────────────────────────────────────────────────────

function PropCard({ property, tenants, onClick }) {
  const typeInfo   = getPropType(property);
  const statusInfo = getPropStatus(property.status);
  const occupied = tenants.length;
  const total    = Number(property.unit_count) || 1;
  const pct      = total > 1 ? Math.round((occupied / total) * 100) : null;
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? '#1c1c1c' : '#171717', border: `0.5px solid ${hov ? '#444' : '#2a2a2a'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 3 }}>{property.address}</div>
          <div style={{ fontSize: 12, color: '#9a9690', marginBottom: 10 }}>
            {property.city && <>{property.city} &nbsp;·&nbsp; </>}
            {typeInfo ? <>{typeInfo.label}{typeInfo.unitHint ? ` (${typeInfo.unitHint})` : ''}</> : (property.type || property.property_type || 'Property')}
            {total > 1 && !typeInfo?.unitHint && <> &nbsp;·&nbsp; {total} units</>}
          </div>
          {total > 1 && pct !== null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5a5855', marginBottom: 4 }}>
                <span>{occupied} of {total} units occupied</span><span>{pct}%</span>
              </div>
              <Bar pct={pct} color={pct >= 80 ? '#7ab88a' : pct >= 40 ? '#c8a96e' : '#6e9ec9'} height={4} />
            </div>
          )}
          {property.purchase_price > 0 && (
            <div style={{ fontSize: 12, color: '#9a9690' }}>Purchased: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(property.purchase_price)}</span>{property.acquisition_date && <> &nbsp;·&nbsp; {fmtDate(property.acquisition_date)}</>}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginLeft: 16, flexShrink: 0 }}>
          <Badge label={(property.status || 'vacant').replace(/_/g, ' ').toUpperCase()} bg={statusInfo.bg} color={statusInfo.color} />
          <div style={{ fontSize: 10, color: hov ? '#666' : '#2e2e2e', transition: 'color 0.15s' }}>CLICK TO EDIT</div>
        </div>
      </div>
      {tenants.length > 0 && (
        <div style={{ borderTop: '0.5px solid #222', paddingTop: 10, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tenants.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#111', borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>
              <span style={{ fontWeight: 500 }}>{t.name}</span>
              {t.unit && <span style={{ color: '#9a9690', fontSize: 11 }}>{t.unit}</span>}
              <Badge label={(t.payment_status || 'current').toUpperCase()} bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'} color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project Form Modal (create / edit project) ───────────────────────────────

function ProjectFormModal({ project, properties, contractors, onClose, onSave, onDelete, onAddContractor }) {
  const isEdit = !!project?.id;
  const [form, setForm] = useState({
    name:              project?.name              || '',
    property_id:       project?.property_id       || '',
    contractor_id:     project?.contractor_id     || '',
    status:            project?.status            || 'planning',
    start_date:        project?.start_date        || '',
    target_completion: project?.target_completion || '',
    labor_budget:      project?.labor_budget      || '',
    material_budget:   project?.material_budget   || '',
  });
  // Default to all standard phases pre-selected for new projects
  const [selectedPhases, setSelectedPhases] = useState(isEdit ? [] : ALL_STANDARD_PHASES);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const togglePhase = (phase) => setSelectedPhases(prev =>
    prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]
  );
  const toggleGroup = (groupPhases) => {
    const allSelected = groupPhases.every(p => selectedPhases.includes(p));
    setSelectedPhases(prev => allSelected
      ? prev.filter(p => !groupPhases.includes(p))
      : Array.from(new Set([...prev, ...groupPhases]))
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({
        ...form,
        labor_budget:    parseFloat(form.labor_budget)    || 0,
        material_budget: parseFloat(form.material_budget) || 0,
        property_id:     form.property_id  || null,
        contractor_id:   form.contractor_id || null,
      }, isEdit ? null : selectedPhases);
    } catch (e) { setError(e?.response?.data?.error || 'Save failed.'); setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Project' : 'Plan New Project'} maxWidth={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div><label style={lbl}>Project Name *</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 10225 Bernard Ave — Full Rehab" autoFocus /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Property</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.property_id} onChange={e => set('property_id', e.target.value)}>
              <option value="" style={{ background: '#1a1a1a' }}>— No property linked —</option>
              {properties.map(p => <option key={p.id} value={p.id} style={{ background: '#1a1a1a' }}>{p.address}{p.city ? `, ${p.city}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Contractor</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.contractor_id} onChange={e => set('contractor_id', e.target.value)}>
              <option value="" style={{ background: '#1a1a1a' }}>— No contractor —</option>
              {contractors.map(c => <option key={c.id} value={c.id} style={{ background: '#1a1a1a' }}>{c.name}{c.trade ? ` (${c.trade})` : ''}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={lbl}>Project Status</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PROJECT_STATUSES.map(st => {
              const active = form.status === st.value;
              return (
                <button key={st.value} onClick={() => set('status', st.value)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${active ? st.color : '#2a2a2a'}`, background: active ? st.bg : 'transparent', color: active ? st.color : '#5a5855', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Start Date</label><input style={{ ...inp, colorScheme: 'dark' }} type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} /></div>
          <div><label style={lbl}>Target Completion</label><input style={{ ...inp, colorScheme: 'dark' }} type="date" value={form.target_completion || ''} onChange={e => set('target_completion', e.target.value)} /></div>
        </div>

        <div style={{ background: '#111', borderRadius: 10, padding: '16px', border: '0.5px solid #2a2a2a' }}>
          <div style={{ ...lbl, marginBottom: 14 }}>Budget Planning</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ ...lbl, color: '#6e9ec9' }}>Labor Budget</label>
              <input style={inp} type="number" min={0} value={form.labor_budget} onChange={e => set('labor_budget', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={{ ...lbl, color: '#c8a96e' }}>Material Budget</label>
              <input style={inp} type="number" min={0} value={form.material_budget} onChange={e => set('material_budget', e.target.value)} placeholder="0" />
            </div>
          </div>
          {(form.labor_budget || form.material_budget) ? (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#1a1a1a', borderRadius: 8, fontSize: 12, color: '#9a9690', display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Budget</span>
              <span style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtMoney((parseFloat(form.labor_budget) || 0) + (parseFloat(form.material_budget) || 0))}</span>
            </div>
          ) : null}
        </div>

        {/* ── Standard phase checklist (create mode only) ── */}
        {!isEdit && (
          <div style={{ background: '#111', borderRadius: 10, padding: '16px', border: '0.5px solid #2a2a2a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={lbl}>Pre-Load Job Phases</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSelectedPhases(ALL_STANDARD_PHASES)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 11 }}>Select all</button>
                <button onClick={() => setSelectedPhases([])} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 11 }}>Clear</button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#5a5855', marginBottom: 12 }}>
              {selectedPhases.length} of {ALL_STANDARD_PHASES.length} phases will be created. You can add, edit, or remove any phase later.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {STANDARD_PHASE_GROUPS.map(({ group, phases }) => {
                const allOn = phases.every(p => selectedPhases.includes(p));
                const someOn = phases.some(p => selectedPhases.includes(p));
                return (
                  <div key={group}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#c8a96e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</div>
                      <button onClick={() => toggleGroup(phases)}
                        style={{ background: 'none', border: 'none', color: allOn ? '#7ab88a' : someOn ? '#c8a96e' : '#5a5855', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {allOn ? '✓ all' : someOn ? 'some' : 'none'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                      {phases.map(p => {
                        const on = selectedPhases.includes(p);
                        return (
                          <button key={p} onClick={() => togglePhase(p)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${on ? '#c8a96e66' : '#2a2a2a'}`, background: on ? '#1e1a0e' : 'transparent', color: on ? '#f0ede8' : '#9a9690', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                            <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${on ? '#c8a96e' : '#3a3a3a'}`, background: on ? '#c8a96e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#0f0f0f', fontWeight: 700, flexShrink: 0 }}>
                              {on ? '✓' : ''}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8 }}>{error}</div>}
        <FormActions onClose={onClose} onDelete={isEdit ? onDelete : null} onSave={handleSave} saving={saving} disabled={!form.name.trim()} label={isEdit ? 'Save Changes' : 'Create Project'} />
      </div>
    </Modal>
  );
}

// ─── Phase Form Modal ─────────────────────────────────────────────────────────

function PhaseFormModal({ phase, onClose, onSave }) {
  const isEdit = !!phase?.id;
  const [form, setForm] = useState({
    name:           phase?.name           || '',
    budget:         phase?.budget         || '',
    completion_pct: phase?.completion_pct ?? 0,
    notes:          phase?.notes          || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave({ ...form, budget: parseFloat(form.budget) || 0, completion_pct: Number(form.completion_pct) }); }
    finally { setSaving(false); }
  };

  const pct = Number(form.completion_pct) || 0;
  const pctColor = pct === 100 ? '#7ab88a' : pct >= 50 ? '#c8a96e' : '#6e9ec9';

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Phase' : 'Add Phase'} maxWidth={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={lbl}>Phase Name *</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Demolition, Framing, Electrical…" autoFocus /></div>

        <div><label style={lbl}>Budget Allocation</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#5a5855', fontSize: 13 }}>$</span>
            <input style={{ ...inp, paddingLeft: 22 }} type="number" min={0} value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
          </div>
        </div>

        <div>
          <label style={lbl}>Completion</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <input
              type="range" min={0} max={100} step={5} value={pct}
              onChange={e => set('completion_pct', e.target.value)}
              style={{ flex: 1, accentColor: pctColor, height: 4 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
              <input
                style={{ ...inp, width: 64, textAlign: 'center', padding: '8px 6px' }}
                type="number" min={0} max={100}
                value={form.completion_pct}
                onChange={e => set('completion_pct', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
              <span style={{ color: '#9a9690', fontSize: 13 }}>%</span>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar pct={pct} color={pctColor} height={6} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            {[0, 25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => set('completion_pct', v)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `0.5px solid ${pct === v ? pctColor : '#2a2a2a'}`, background: pct === v ? '#1e1e1e' : 'transparent', color: pct === v ? pctColor : '#5a5855', cursor: 'pointer', fontFamily: 'inherit' }}>
                {v}%
              </button>
            ))}
          </div>
        </div>

        <div><label style={lbl}>Notes</label><textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" /></div>

        <FormActions onClose={onClose} onSave={handleSave} saving={saving} disabled={!form.name.trim()} label={isEdit ? 'Save Phase' : 'Add Phase'} />
      </div>
    </Modal>
  );
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

const EXPENSE_TYPES = [
  { value: 'labor',    label: 'Labor',    color: '#6e9ec9', bg: '#1a2d3d' },
  { value: 'material', label: 'Material', color: '#c8a96e', bg: '#2d2a1a' },
  { value: 'other',    label: 'Other',    color: '#9b8ec4', bg: '#1e1a2d' },
];

function ExpenseFormModal({ project, onClose, onSave }) {
  const [form, setForm] = useState({ type: 'material', vendor: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (e) { setError(e?.response?.data?.error || 'Failed to log expense.'); setSaving(false); }
  };

  const laborBudget    = parseFloat(project?.labor_budget    || 0);
  const materialBudget = parseFloat(project?.material_budget || 0);
  const laborSpent     = parseFloat(project?.labor_spent     || 0);
  const materialSpent  = parseFloat(project?.material_spent  || 0);
  const amt = parseFloat(form.amount) || 0;
  const newLabor    = form.type === 'labor'    ? laborSpent    + amt : laborSpent;
  const newMaterial = form.type === 'material' ? materialSpent + amt : materialSpent;

  return (
    <Modal onClose={onClose} title="Log Expense" maxWidth={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ padding: '10px 14px', background: '#111', borderRadius: 8, border: '0.5px solid #2a2a2a', fontSize: 13 }}>
          <div style={{ color: '#5a5855', fontSize: 11, marginBottom: 4 }}>Project</div>
          <div style={{ fontWeight: 500 }}>{project?.name}</div>
        </div>

        <div>
          <label style={lbl}>Expense Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {EXPENSE_TYPES.map(t => {
              const active = form.type === t.value;
              return (
                <button key={t.value} onClick={() => set('type', t.value)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: `1px solid ${active ? t.color : '#2a2a2a'}`, background: active ? t.bg : 'transparent', color: active ? t.color : '#5a5855', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div><label style={lbl}>Vendor / Description</label><input style={inp} value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Home Depot, JN Winston LLC…" autoFocus /></div>

        <div>
          <label style={lbl}>Amount</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#5a5855', fontSize: 13 }}>$</span>
            <input style={{ ...inp, paddingLeft: 22 }} type="number" min={0} step={0.01} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
          </div>
        </div>

        {/* Budget impact preview */}
        {amt > 0 && (form.type === 'labor' || form.type === 'material') && (
          <div style={{ background: '#111', borderRadius: 8, border: '0.5px solid #2a2a2a', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Budget Impact Preview</div>
            {form.type === 'labor' && laborBudget > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#9a9690' }}>Labor</span>
                  <span>
                    <span style={{ color: newLabor > laborBudget ? '#c97b6e' : '#7ab88a', fontWeight: 500 }}>{fmtMoney(newLabor)}</span>
                    <span style={{ color: '#5a5855' }}> of {fmtMoney(laborBudget)}</span>
                  </span>
                </div>
                <Bar pct={Math.min(100, Math.round(newLabor / laborBudget * 100))} color={newLabor > laborBudget ? '#c97b6e' : '#7ab88a'} height={4} />
              </div>
            )}
            {form.type === 'material' && materialBudget > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#9a9690' }}>Material</span>
                  <span>
                    <span style={{ color: newMaterial > materialBudget ? '#c97b6e' : '#c8a96e', fontWeight: 500 }}>{fmtMoney(newMaterial)}</span>
                    <span style={{ color: '#5a5855' }}> of {fmtMoney(materialBudget)}</span>
                  </span>
                </div>
                <Bar pct={Math.min(100, Math.round(newMaterial / materialBudget * 100))} color={newMaterial > materialBudget ? '#c97b6e' : '#c8a96e'} height={4} />
              </div>
            )}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8 }}>{error}</div>}
        <FormActions onClose={onClose} onSave={handleSave} saving={saving} disabled={!form.amount || parseFloat(form.amount) <= 0} label="Log Expense" />
      </div>
    </Modal>
  );
}

// ─── Contractor Modal ────────────────────────────────────────────────────────

const W9_STATUSES = [
  { value: 'pending',     label: 'Pending',     color: '#c8a96e', bg: '#2b1a0d' },
  { value: 'on_file',     label: 'On File',     color: '#7ab88a', bg: '#0d2b1a' },
  { value: 'not_required',label: 'Not Required',color: '#9a9690', bg: '#222'    },
];

function ContractorModal({ contractor, onClose, onSave, onDelete }) {
  const isEdit = !!contractor?.id;
  const [form, setForm] = useState({
    name:             contractor?.name             || '',
    trade:            contractor?.trade            || '',
    phone:            contractor?.phone            || '',
    email:            contractor?.email            || '',
    w9_status:        contractor?.w9_status        || 'pending',
    agreement_signed: !!contractor?.agreement_signed,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Contractor name is required.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (e) { setError(e?.response?.data?.error || 'Save failed.'); setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Contractor' : 'Add Contractor'} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={lbl}>Name *</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. JN Winston LLC" autoFocus /></div>
        <div><label style={lbl}>Trade / Specialty</label><input style={inp} value={form.trade} onChange={e => set('trade', e.target.value)} placeholder="e.g. General Contractor, Electrician, Plumber" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(216) 555-0123" /></div>
          <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@…" /></div>
        </div>
        <div>
          <label style={lbl}>W-9 Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {W9_STATUSES.map(st => {
              const active = form.w9_status === st.value;
              return (
                <button key={st.value} onClick={() => set('w9_status', st.value)}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: 8, border: `1px solid ${active ? st.color : '#2a2a2a'}`, background: active ? st.bg : 'transparent', color: active ? st.color : '#5a5855', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: '#111', border: '0.5px solid #2a2a2a', borderRadius: 8 }}>
          <input type="checkbox" checked={form.agreement_signed} onChange={e => set('agreement_signed', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#c8a96e' }} />
          <span style={{ fontSize: 13 }}>Contractor agreement signed</span>
        </label>
        {error && <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8 }}>{error}</div>}
        <FormActions onClose={onClose} onDelete={isEdit ? onDelete : null} onSave={handleSave} saving={saving} disabled={!form.name.trim()} label={isEdit ? 'Save Changes' : 'Add Contractor'} />
      </div>
    </Modal>
  );
}

// ─── Interactive Project Card ─────────────────────────────────────────────────

function ProjectCard({ project, projectInvoices, onEdit, onDelete, onAddPhase, onEditPhase, onDeletePhase, onLogExpense }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const phases        = project.construction_phases || [];
  const completionPct = phaseCompletion(phases);
  const timeline      = getTimeline(project.start_date, project.target_completion);
  const onTime        = timeline ? completionPct >= timeline.pct : true;

  const laborBudget    = parseFloat(project.labor_budget    || 0);
  const materialBudget = parseFloat(project.material_budget || 0);
  const laborSpent     = parseFloat(project.labor_spent     || 0);
  const materialSpent  = parseFloat(project.material_spent  || 0);
  const totalBudget    = laborBudget + materialBudget;
  const totalSpent     = laborSpent + materialSpent;

  const otherInvoices = (projectInvoices || []).filter(i => i.classification === 'construction_other');
  const otherSpent    = otherInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const statusInfo = getProjStatus(project.status);

  const btnStyle = { fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: '#9a9690', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' };
  const accentBtn = { ...btnStyle, border: '0.5px solid #c8a96e33', color: '#c8a96e' };

  return (
    <div style={{ background: '#171717', border: '0.5px solid #2a2a2a', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>{project.name || project.properties?.address}</div>
            <div style={{ fontSize: 12, color: '#9a9690' }}>
              {project.properties?.address && <>{project.properties.address}{project.properties.city ? `, ${project.properties.city}` : ''}</>}
              {project.contractors?.name && <> &nbsp;·&nbsp; {project.contractors.name}</>}
              {timeline && <> &nbsp;·&nbsp; {fmtDate(project.start_date)} → {fmtDate(project.target_completion)}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
            <Badge label={statusInfo.label.toUpperCase()} bg={statusInfo.bg} color={statusInfo.color} />
            {timeline && <Badge label={onTime ? 'ON TIME' : 'BEHIND'} bg={onTime ? '#0a2e18' : '#2e0a0a'} color={onTime ? '#7ab88a' : '#c97b6e'} />}
            <button onClick={onEdit} style={btnStyle}>Edit</button>
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)} title="Delete project" style={{ ...btnStyle, color: '#c97b6e', borderColor: '#c97b6e44', padding: '5px 9px' }}>Delete</button>
            ) : (
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#c97b6e' }}>Confirm?</span>
                <button onClick={() => { setConfirmDel(false); onDelete(); }} style={{ ...btnStyle, background: '#c97b6e', color: '#0f0f0f', border: 'none', fontWeight: 700 }}>Yes</button>
                <button onClick={() => setConfirmDel(false)} style={btnStyle}>No</button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px 20px', borderBottom: '0.5px solid #222' }}>
        <StatBox label="Completion" value={`${completionPct}%`} color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'} />
        <StatBox label="Total Spent" value={fmtMoney(totalSpent)} sub={totalBudget > 0 ? `of ${fmtMoney(totalBudget)} budget` : 'no budget set'} color="#c8a96e" />
        {timeline
          ? <StatBox label="Days Active" value={timeline.daysActive} sub={`${timeline.daysRemaining} days remaining`} color={onTime ? '#7ab88a' : '#c97b6e'} />
          : <StatBox label="Phases" value={phases.length} sub={`${phases.filter(p => p.completion_pct === 100).length} complete`} color="#6e9ec9" />
        }
      </div>

      {/* ── Budget breakdown ── */}
      {totalBudget > 0 && (
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #222' }}>
          <SectionLabel>Budget Overview</SectionLabel>
          {laborBudget > 0 && <BudgetRow label="Labor" spent={laborSpent} budget={laborBudget} barColor="#6e9ec9" />}
          {materialBudget > 0 && <BudgetRow label="Material" spent={materialSpent} budget={materialBudget} barColor="#c8a96e" />}
          {otherSpent > 0 && <BudgetRow label="Other" spent={otherSpent} budget={0} />}
          <div style={{ borderTop: '0.5px solid #2a2a2a', paddingTop: 12, marginTop: 4 }}>
            <BudgetRow label="Total" spent={totalSpent + otherSpent} budget={totalBudget} />
          </div>
        </div>
      )}

      {/* ── Completion bar ── */}
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Project Completion</SectionLabel>
          <span style={{ fontSize: 11, color: '#9a9690' }}>{completionPct}% ({phases.filter(p => p.completion_pct === 100).length} of {phases.length} phases done)</span>
        </div>
        <Bar pct={completionPct} color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'} height={8} />
      </div>

      {/* ── Timeline ── */}
      {timeline && (
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #222' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <SectionLabel style={{ marginBottom: 0 }}>Timeline</SectionLabel>
            <span style={{ fontSize: 11, color: onTime ? '#7ab88a' : '#c97b6e' }}>{timeline.pct}% of schedule elapsed</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
            <div><div style={{ color: '#5a5855', marginBottom: 1 }}>Start</div><div style={{ fontWeight: 500 }}>{fmtDate(project.start_date)}</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ color: '#5a5855', marginBottom: 1 }}>Today</div><div style={{ color: onTime ? '#7ab88a' : '#c97b6e', fontWeight: 500 }}>Day {timeline.daysActive} of {timeline.totalDays}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ color: '#5a5855', marginBottom: 1 }}>Target</div><div style={{ fontWeight: 500 }}>{fmtDate(project.target_completion)}</div></div>
          </div>
          <div style={{ position: 'relative', height: 12, background: '#252525', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${timeline.pct}%`, background: onTime ? '#0d3320' : '#2e1010', borderRadius: 6 }} />
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${completionPct}%`, background: onTime ? '#7ab88a' : '#c97b6e', borderRadius: 6, opacity: 0.85 }} />
          </div>
        </div>
      )}

      {/* ── Phases ── */}
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Construction Phases ({phases.length})</SectionLabel>
          <button onClick={onAddPhase} style={accentBtn}>+ Add Phase</button>
        </div>

        {phases.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#5a5855', fontSize: 13, padding: '12px 0' }}>No phases yet. Add your first phase to track progress.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px 44px 80px', gap: '0 8px', fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0', borderBottom: '0.5px solid #2a2a2a', marginBottom: 2 }}>
              <div>Phase</div><div style={{ textAlign: 'right' }}>Budget</div><div style={{ textAlign: 'center' }}>Progress</div><div style={{ textAlign: 'right' }}>%</div><div style={{ textAlign: 'right' }}>Actions</div>
            </div>
            {phases.map(ph => {
              const done = ph.completion_pct || 0;
              return (
                <div key={ph.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px 44px 80px', gap: '0 8px', padding: '8px 0', borderBottom: '0.5px solid #1e1e1e', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ color: done === 100 ? '#7ab88a' : '#9a9690', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {done === 100 && <span style={{ marginRight: 5 }}>✓</span>}{ph.name}
                  </div>
                  <div style={{ textAlign: 'right', color: '#c8a96e', fontSize: 11 }}>{parseFloat(ph.budget || 0) > 0 ? fmtMoney(ph.budget) : '—'}</div>
                  <div><Bar pct={done} color={done === 100 ? '#7ab88a' : done >= 50 ? '#c8a96e' : '#6e9ec9'} height={4} /></div>
                  <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 11, color: done === 100 ? '#7ab88a' : '#f0ede8' }}>{done}%</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button onClick={() => onEditPhase(ph)} style={{ ...btnStyle, padding: '3px 8px', fontSize: 10 }}>Edit</button>
                    <button onClick={() => onDeletePhase(ph.id)} style={{ ...btnStyle, padding: '3px 6px', fontSize: 12, color: '#c97b6e44', borderColor: 'transparent' }}>×</button>
                  </div>
                </div>
              );
            })}
            {phases.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#9a9690' }}>
                <span>Phase budgets: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(phases.reduce((s, p) => s + parseFloat(p.budget || 0), 0))}</span></span>
                <span>Project budget: <span style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtMoney(totalBudget)}</span></span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Expenses ── */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <SectionLabel style={{ marginBottom: 2 }}>Expense Log</SectionLabel>
            <div style={{ fontSize: 11, color: '#9a9690', display: 'flex', gap: 12 }}>
              <span>Labor: <span style={{ color: '#6e9ec9', fontWeight: 500 }}>{fmtMoney(laborSpent)}</span></span>
              <span>Material: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(materialSpent)}</span></span>
              {otherSpent > 0 && <span>Other: <span style={{ color: '#9b8ec4', fontWeight: 500 }}>{fmtMoney(otherSpent)}</span></span>}
            </div>
          </div>
          <button onClick={onLogExpense} style={accentBtn}>+ Log Expense</button>
        </div>

        {projectInvoices && projectInvoices.length > 0 ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 80px', gap: '0 8px', fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0', borderBottom: '0.5px solid #2a2a2a', marginBottom: 2 }}>
              <div>Type</div><div>Vendor</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'right' }}>Date</div>
            </div>
            {[...projectInvoices].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).map(inv => {
              const cls = inv.classification || '';
              const typeLabel = cls.replace('construction_', '').toUpperCase();
              const typeColor = cls === 'construction_labor' ? '#6e9ec9' : cls === 'construction_material' ? '#c8a96e' : '#9b8ec4';
              const typeBg    = cls === 'construction_labor' ? '#1a2d3d' : cls === 'construction_material' ? '#2d2a1a' : '#1e1a2d';
              return (
                <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 80px', gap: '0 8px', padding: '7px 0', borderBottom: '0.5px solid #1e1e1e', alignItems: 'center', fontSize: 12 }}>
                  <div><Badge label={typeLabel} bg={typeBg} color={typeColor} /></div>
                  <div style={{ color: '#9a9690', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.vendor || '—'}</div>
                  <div style={{ textAlign: 'right', color: '#f0ede8', fontWeight: 500 }}>{fmtMoney(inv.amount)}</div>
                  <div style={{ textAlign: 'right', color: '#5a5855', fontSize: 11 }}>
                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </div>
                </div>
              );
            })}
            {projectInvoices.length > 8 && (
              <div style={{ fontSize: 11, color: '#5a5855', textAlign: 'center', paddingTop: 8 }}>
                Showing 8 of {projectInvoices.length} expenses
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#5a5855', fontSize: 13, padding: '12px 0' }}>
            No expenses logged. Click "Log Expense" to add your first entry.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function LoginScreen({ onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!password) return;
    setBusy(true); setError('');
    try {
      const res = await axios.post(`${API}/api/auth/login`, { password });
      setToken(res.data.token);
      notifyAuthChange();
      onLoggedIn?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed.');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#c8a96e', letterSpacing: '0.12em', marginBottom: 6 }}>CHG</div>
        <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Cleveland Holding Group</div>
        <div style={{ fontSize: 13, color: '#9a9690', marginBottom: 22 }}>Sign in to continue</div>
        <label style={lbl}>Team Password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inp}
          placeholder="Enter password"
        />
        {error && <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8, marginTop: 12 }}>{error}</div>}
        <button type="submit" disabled={busy || !password} style={{ ...primaryBtn(busy || !password), width: '100%', marginTop: 18, padding: '11px 20px' }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <div style={{ fontSize: 11, color: '#5a5855', marginTop: 16, lineHeight: 1.5 }}>
          The password is stored as <code style={{ color: '#9a9690' }}>APP_PASSWORD</code> in Replit Secrets and can be rotated there.
        </div>
      </form>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  useEffect(() => {
    const fn = () => setAuthed(!!getToken());
    authListeners.add(fn);
    return () => authListeners.delete(fn);
  }, []);
  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;
  return <AppShell onLogout={() => { setToken(null); setAuthed(false); }} />;
}

function AppShell({ onLogout }) {
  const [activeTab,     setActiveTab]     = useState('overview');
  const [projects,      setProjects]      = useState([]);
  const [tenants,       setTenants]       = useState([]);
  const [deals,         setDeals]         = useState([]);
  const [tasks,         setTasks]         = useState([]);
  const [invoices,      setInvoices]      = useState([]);
  const [properties,    setProperties]    = useState([]);
  const [contractors,   setContractors]   = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Modal states
  const [propertyModal,   setPropertyModal]   = useState(null); // null | {} | property
  const [projectModal,    setProjectModal]    = useState(null); // null | {} | project
  const [phaseModal,      setPhaseModal]      = useState(null); // null | { phase?, projectId }
  const [expenseModal,    setExpenseModal]    = useState(null); // null | { project }
  const [contractorModal, setContractorModal] = useState(null); // null | {} | contractor

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [p, t, d, tk, inv, props, ctrs] = await Promise.all([
        axios.get(`${API}/api/projects`),
        axios.get(`${API}/api/tenants`),
        axios.get(`${API}/api/deals`),
        axios.get(`${API}/api/tasks`),
        axios.get(`${API}/api/invoices`),
        axios.get(`${API}/api/properties`),
        axios.get(`${API}/api/contractors`),
      ]);
      setProjects(p.data);
      setTenants(t.data);
      setDeals(d.data);
      setTasks(tk.data);
      setInvoices(inv.data);
      setProperties(props.data);
      setContractors(ctrs.data);
    } catch (err) {
      console.error('API error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Property CRUD ──────────────────────────────────────────────────────────

  const addProperty = async (form) => {
    const res = await axios.post(`${API}/api/properties`, form);
    setProperties(prev => [res.data, ...prev]);
  };
  const saveProperty = async (id, form) => {
    const res = await axios.put(`${API}/api/properties/${id}`, form);
    setProperties(prev => prev.map(p => p.id === id ? res.data : p));
  };
  const deleteProperty = async (id) => {
    await axios.delete(`${API}/api/properties/${id}`);
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  // ── Derived stats ──────────────────────────────────────────────────────────

  const lateCount       = tenants.filter(t => t.payment_status === 'late').length;
  const activeProjects  = projects.filter(p => p.status === 'active').length;
  const delayedProjects = projects.filter(p => p.status === 'delayed').length;
  const totalSpend      = invoices.reduce((a, i) => a + parseFloat(i.amount || 0), 0);
  const overdueTasks    = tasks.filter(t => t.status === 'pending').length;

  const tabs = [
    { id: 'overview',     label: 'Overview'      },
    { id: 'properties',   label: 'Properties'    },
    { id: 'construction', label: 'Construction'  },
    { id: 'pm',           label: 'Property Mgmt' },
    { id: 'contractors',  label: 'Contractors'   },
    { id: 'acquisitions', label: 'Acquisitions'  },
    { id: 'finance',      label: 'Finance'       },
    { id: 'tasks',        label: 'Tasks'         },
  ];

  return (
    <div style={s.app}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>Cleveland Holding Group</div>
          <div style={s.headerSub}>
            Operations CRM &nbsp;—&nbsp;
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onLogout} style={ghostBtn}>Sign out</button>
          <div style={s.headerBadge}>CHG</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <div style={s.nav}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ ...s.navBtn, ...(activeTab === tab.id ? s.navBtnActive : {}) }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.loading}>Loading CHG data…</div>
      ) : (
        <div style={s.content}>

          {/* ══ Overview ══ */}
          {activeTab === 'overview' && (
            <div>
              <div style={s.metricsGrid}>
                <div style={s.metric}><div style={s.metricLabel}>Active projects</div><div style={{ ...s.metricValue, color: '#7ab88a' }}>{activeProjects}</div>{delayedProjects > 0 && <div style={s.metricSub}>{delayedProjects} delayed</div>}</div>
                <div style={s.metric}><div style={s.metricLabel}>Occupied units</div><div style={{ ...s.metricValue, color: '#6e9ec9' }}>{tenants.length}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Late payments</div><div style={{ ...s.metricValue, color: lateCount > 0 ? '#c97b6e' : '#7ab88a' }}>{lateCount}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Total spend</div><div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Deals tracked</div><div style={{ ...s.metricValue, color: '#9b8ec4' }}>{deals.length}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Pending tasks</div><div style={{ ...s.metricValue, color: overdueTasks > 0 ? '#c97b6e' : '#7ab88a' }}>{overdueTasks}</div></div>
              </div>

              {properties.length > 0 ? (
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={s.cardTitle}>Portfolio</div>
                    <button onClick={() => { setActiveTab('properties'); setPropertyModal({}); }} style={s.addBtn}>+ Add</button>
                  </div>
                  {properties.map(p => {
                    const typeInfo = getPropType(p);
                    const ss = getPropStatus(p.status);
                    return (
                      <div key={p.id} style={{ ...s.row, cursor: 'pointer' }} onClick={() => { setActiveTab('properties'); setPropertyModal(p); }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{p.address}</div>
                          <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>{p.city && <>{p.city} &nbsp;·&nbsp; </>}{typeInfo ? typeInfo.label : (p.type || '—')}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Badge label={(p.status || 'vacant').replace(/_/g, ' ').toUpperCase()} bg={ss.bg} color={ss.color} />
                          <span style={{ fontSize: 11, color: '#3a3a3a' }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={s.cardTitle}>Portfolio</div>
                    <button onClick={() => { setActiveTab('properties'); setPropertyModal({}); }} style={s.addBtn}>+ Add Property</button>
                  </div>
                  <div style={s.empty}>No properties yet</div>
                </div>
              )}

              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={s.cardTitle}>Construction projects</div>
                  <button onClick={() => { setActiveTab('construction'); setProjectModal({}); }} style={s.addBtn}>+ New</button>
                </div>
                {projects.length === 0 ? (
                  <div style={s.empty}>No projects yet</div>
                ) : projects.map(p => {
                  const phases   = p.construction_phases || [];
                  const pct      = phaseCompletion(phases);
                  const timeline = getTimeline(p.start_date, p.target_completion);
                  const onTime   = timeline ? pct >= timeline.pct : true;
                  return (
                    <div key={p.id} style={s.row}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name || p.properties?.address}</div>
                        <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>{p.contractors?.name || '—'}{timeline && <> &nbsp;·&nbsp; Day {timeline.daysActive} of {timeline.totalDays}</>}</div>
                        <div style={{ marginTop: 8 }}><Bar pct={pct} color={pct >= 70 ? '#7ab88a' : pct >= 40 ? '#c8a96e' : '#6e9ec9'} /></div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 4 }}>
                          <Badge label={p.status?.toUpperCase()} bg={getProjStatus(p.status).bg} color={getProjStatus(p.status).color} />
                          {timeline && <Badge label={onTime ? 'ON TIME' : 'BEHIND'} bg={onTime ? '#0a2e18' : '#2e0a0a'} color={onTime ? '#7ab88a' : '#c97b6e'} />}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 400 }}>{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {lateCount > 0 && (
                <div style={{ ...s.card, borderColor: '#c97b6e33' }}>
                  <div style={{ ...s.cardTitle, color: '#c97b6e' }}>Late rent payments</div>
                  {tenants.filter(t => t.payment_status === 'late').map(t => (
                    <div key={t.id} style={s.row}>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{t.name}</div><div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit} — ${t.rent_amount}/mo</div></div>
                      <Badge label="LATE" bg="#3d1a1a" color="#c97b6e" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ Properties ══ */}
          {activeTab === 'properties' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>Property Portfolio</div>
                  <div style={{ fontSize: 12, color: '#9a9690', marginTop: 3 }}>{properties.length} {properties.length === 1 ? 'property' : 'properties'}{properties.length > 0 && <> &nbsp;·&nbsp; {tenants.length} total tenants</>}</div>
                </div>
                <button onClick={() => setPropertyModal({})} style={s.addBtn}>+ Add Property</button>
              </div>
              {properties.length === 0 && (
                <div style={{ ...s.card, textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
                  <div style={{ color: '#9a9690', marginBottom: 6, fontSize: 15 }}>No properties in portfolio yet</div>
                  <button onClick={() => setPropertyModal({})} style={{ ...s.addBtn, padding: '10px 24px', fontSize: 14 }}>Add Property</button>
                </div>
              )}
              {properties.map(p => (
                <PropCard key={p.id} property={p} tenants={tenants.filter(t => t.property_id === p.id)} onClick={() => setPropertyModal(p)} />
              ))}
              {properties.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
                  {[
                    { label: 'Occupied',           val: properties.filter(p => p.status === 'occupied' || p.status === 'active').length, color: '#7ab88a' },
                    { label: 'Under Construction', val: properties.filter(p => p.status === 'under_construction').length, color: '#6e9ec9' },
                    { label: 'Ready to Rent',      val: properties.filter(p => p.status === 'ready_to_rent').length, color: '#c8a96e' },
                  ].map(item => (
                    <div key={item.label} style={{ background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 300, color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              )}
              {propertyModal !== null && (
                <PropertyModal
                  property={propertyModal}
                  tenants={tenants}
                  onClose={() => setPropertyModal(null)}
                  onSave={async (form) => {
                    if (propertyModal.id) { await saveProperty(propertyModal.id, form); }
                    else { await addProperty(form); }
                    setPropertyModal(null);
                  }}
                  onDelete={propertyModal.id ? async () => { await deleteProperty(propertyModal.id); setPropertyModal(null); } : null}
                />
              )}
            </div>
          )}

          {/* ══ Construction ══ */}
          {activeTab === 'construction' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>Construction Projects</div>
                  <div style={{ fontSize: 12, color: '#9a9690', marginTop: 3 }}>
                    {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                    {projects.length > 0 && <> &nbsp;·&nbsp; {projects.filter(p => p.status === 'active').length} active</>}
                  </div>
                </div>
                <button onClick={() => setProjectModal({})} style={s.addBtn}>+ Plan New Project</button>
              </div>

              {projects.length === 0 ? (
                <div style={{ ...s.card, textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏗️</div>
                  <div style={{ color: '#9a9690', marginBottom: 6, fontSize: 15 }}>No construction projects yet</div>
                  <div style={{ color: '#5a5855', fontSize: 13, marginBottom: 20 }}>Plan your first project to track budgets and progress</div>
                  <button onClick={() => setProjectModal({})} style={{ ...s.addBtn, padding: '10px 24px', fontSize: 14 }}>Plan New Project</button>
                </div>
              ) : projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  projectInvoices={invoices.filter(inv =>
                    inv.property_id === p.property_id &&
                    (inv.classification || '').startsWith('construction_')
                  )}
                  onEdit={() => setProjectModal(p)}
                  onDelete={async () => {
                    try {
                      await axios.delete(`${API}/api/projects/${p.id}`);
                      fetchAll();
                    } catch (e) { alert('Failed to delete project: ' + (e?.response?.data?.error || e.message)); }
                  }}
                  onAddPhase={() => setPhaseModal({ projectId: p.id })}
                  onEditPhase={(phase) => setPhaseModal({ phase, projectId: p.id })}
                  onDeletePhase={async (phaseId) => {
                    if (!window.confirm('Delete this phase? This cannot be undone.')) return;
                    await axios.delete(`${API}/api/projects/phases/${phaseId}`);
                    fetchAll();
                  }}
                  onLogExpense={() => setExpenseModal({ project: p })}
                />
              ))}

              {/* Project create/edit modal */}
              {projectModal !== null && (
                <ProjectFormModal
                  project={projectModal.id ? projectModal : null}
                  properties={properties}
                  contractors={contractors}
                  onClose={() => setProjectModal(null)}
                  onSave={async (form, phasesToCreate) => {
                    if (projectModal.id) {
                      await axios.put(`${API}/api/projects/${projectModal.id}`, form);
                    } else {
                      // Server creates project + phases atomically and rolls back on failure
                      await axios.post(`${API}/api/projects`, {
                        ...form,
                        phases: phasesToCreate || [],
                      });
                    }
                    setProjectModal(null);
                    fetchAll();
                  }}
                  onDelete={projectModal.id ? async () => {
                    await axios.delete(`${API}/api/projects/${projectModal.id}`);
                    setProjectModal(null);
                    fetchAll();
                  } : null}
                />
              )}

              {/* Phase modal */}
              {phaseModal !== null && (
                <PhaseFormModal
                  phase={phaseModal.phase}
                  onClose={() => setPhaseModal(null)}
                  onSave={async (form) => {
                    if (phaseModal.phase?.id) {
                      await axios.put(`${API}/api/projects/phases/${phaseModal.phase.id}`, form);
                    } else {
                      await axios.post(`${API}/api/projects/${phaseModal.projectId}/phases`, form);
                    }
                    setPhaseModal(null);
                    fetchAll();
                  }}
                />
              )}

              {/* Expense modal */}
              {expenseModal !== null && (
                <ExpenseFormModal
                  project={expenseModal.project}
                  onClose={() => setExpenseModal(null)}
                  onSave={async (form) => {
                    await axios.post(`${API}/api/projects/${expenseModal.project.id}/expenses`, form);
                    setExpenseModal(null);
                    fetchAll();
                  }}
                />
              )}
            </div>
          )}

          {/* ══ Property Mgmt ══ */}
          {activeTab === 'pm' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Tenant tracker</div>
                <div style={{ display: 'flex', fontSize: 10, color: '#5a5855', fontWeight: 600, padding: '5px 0', borderBottom: '0.5px solid #2e2e2e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div style={{ flex: 2 }}>Tenant / Unit</div><div style={{ flex: 1 }}>Rent</div><div style={{ flex: 1 }}>Status</div>
                </div>
                {tenants.length === 0 ? <div style={s.empty}>No tenants yet</div> : tenants.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{t.name}</div><div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit}</div></div>
                    <div style={{ flex: 1 }}>${t.rent_amount}/mo</div>
                    <div style={{ flex: 1 }}><Badge label={t.payment_status?.toUpperCase()} bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'} color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'} /></div>
                  </div>
                ))}
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Late fee policy</div>
                <div style={{ fontSize: 13, color: '#9a9690', lineHeight: 2 }}>
                  1st late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>$69 flat fee</span><br />
                  2nd+ late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>10% of monthly rent</span> (Ohio max)<br />
                  Partial payments: <span style={{ color: '#c97b6e', fontWeight: 500 }}>Not accepted</span>
                </div>
              </div>
            </div>
          )}

          {/* ══ Contractors ══ */}
          {activeTab === 'contractors' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>Contractor Directory</div>
                  <div style={{ fontSize: 12, color: '#9a9690', marginTop: 3 }}>
                    {contractors.length} {contractors.length === 1 ? 'contractor' : 'contractors'}
                    {contractors.length > 0 && <> &nbsp;·&nbsp; {contractors.filter(c => c.agreement_signed).length} with signed agreement</>}
                  </div>
                </div>
                <button onClick={() => setContractorModal({})} style={s.addBtn}>+ Add Contractor</button>
              </div>

              {contractors.length === 0 ? (
                <div style={{ ...s.card, textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
                  <div style={{ color: '#9a9690', marginBottom: 6, fontSize: 15 }}>No contractors in directory yet</div>
                  <div style={{ color: '#5a5855', fontSize: 13, marginBottom: 20 }}>Add contractors so they're available when planning projects</div>
                  <button onClick={() => setContractorModal({})} style={{ ...s.addBtn, padding: '10px 24px', fontSize: 14 }}>Add Contractor</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {contractors.map(c => {
                    const w9 = W9_STATUSES.find(s => s.value === c.w9_status) || W9_STATUSES[0];
                    const projectCount = projects.filter(p => p.contractor_id === c.id).length;
                    return (
                      <div key={c.id} onClick={() => setContractorModal(c)}
                        style={{ background: '#171717', border: '0.5px solid #2a2a2a', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                            {c.trade && <div style={{ fontSize: 12, color: '#c8a96e' }}>{c.trade}</div>}
                          </div>
                          <Badge label={w9.label.toUpperCase()} bg={w9.bg} color={w9.color} />
                        </div>
                        <div style={{ fontSize: 12, color: '#9a9690', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
                          {c.phone && <div>📞 {c.phone}</div>}
                          {c.email && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>✉ {c.email}</div>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #222', fontSize: 11 }}>
                          <span style={{ color: c.agreement_signed ? '#7ab88a' : '#c97b6e' }}>{c.agreement_signed ? '✓ Agreement signed' : '⚠ No agreement'}</span>
                          <span style={{ color: '#5a5855' }}>{projectCount} {projectCount === 1 ? 'project' : 'projects'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {contractorModal !== null && (
                <ContractorModal
                  contractor={contractorModal}
                  onClose={() => setContractorModal(null)}
                  onSave={async (form) => {
                    if (contractorModal.id) {
                      await axios.put(`${API}/api/contractors/${contractorModal.id}`, form);
                    } else {
                      await axios.post(`${API}/api/contractors`, form);
                    }
                    setContractorModal(null);
                    fetchAll();
                  }}
                  onDelete={contractorModal.id ? async () => {
                    await axios.delete(`${API}/api/contractors/${contractorModal.id}`);
                    setContractorModal(null);
                    fetchAll();
                  } : null}
                />
              )}
            </div>
          )}

          {/* ══ Acquisitions ══ */}
          {activeTab === 'acquisitions' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Deal pipeline</div>
                {deals.length === 0 ? <div style={s.empty}>No deals in pipeline yet</div> : deals.map(d => (
                  <div key={d.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{d.address}</div><div style={{ fontSize: 12, color: '#9a9690' }}>Source: {d.source} &nbsp;|&nbsp; ROI: {d.roi_estimate}%</div></div>
                    <div style={{ flex: 1 }}>${d.asking_price?.toLocaleString()}</div>
                    <div style={{ flex: 1 }}><Badge label={d.opportunity_level} bg="#1a2d3d" color="#6e9ec9" /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ Finance ══ */}
          {activeTab === 'finance' && (
            <div>
              <div style={s.metricsGrid}>
                <div style={s.metric}><div style={s.metricLabel}>Total invoices</div><div style={s.metricValue}>{invoices.length}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Total spend</div><div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div></div>
                <div style={s.metric}><div style={s.metricLabel}>Expenses</div><div style={s.metricValue}>${invoices.filter(i => i.classification === 'expense').reduce((a, i) => a + parseFloat(i.amount || 0), 0).toLocaleString()}</div></div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Invoice log</div>
                {invoices.length === 0 ? <div style={s.empty}>No invoices logged yet</div> : invoices.map(inv => (
                  <div key={inv.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}><div style={{ fontWeight: 500 }}>{inv.vendor}</div><div style={{ fontSize: 12, color: '#9a9690' }}>{inv.properties?.address}</div></div>
                    <div style={{ flex: 1, fontWeight: 500 }}>${parseFloat(inv.amount).toLocaleString()}</div>
                    <div style={{ flex: 1 }}><Badge label={inv.classification} bg={inv.classification?.startsWith('construction') ? '#1a2d3d' : inv.classification === 'expense' ? '#2d2a1a' : '#1a3d2b'} color={inv.classification?.startsWith('construction') ? '#6e9ec9' : inv.classification === 'expense' ? '#c8a96e' : '#7ab88a'} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ Tasks ══ */}
          {activeTab === 'tasks' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Recurring tasks</div>
                {tasks.length === 0 ? <div style={s.empty}>No tasks yet</div> : tasks.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{t.properties?.address} — Due day: {t.due_day}</div>
                      {t.confirmation_number && <div style={{ fontSize: 12, color: '#7ab88a', marginTop: 2 }}>Confirmation: {t.confirmation_number}</div>}
                    </div>
                    <div style={{ flex: 1 }}><Badge label={t.status} bg={t.status === 'completed' ? '#1a3d2b' : '#3d2a1a'} color={t.status === 'completed' ? '#7ab88a' : '#c8a96e'} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Property modal accessible from Overview too */}
      {activeTab !== 'properties' && propertyModal !== null && (
        <PropertyModal
          property={propertyModal}
          tenants={tenants}
          onClose={() => setPropertyModal(null)}
          onSave={async (form) => {
            if (propertyModal.id) { await saveProperty(propertyModal.id, form); }
            else { await addProperty(form); }
            setPropertyModal(null);
          }}
          onDelete={propertyModal.id ? async () => { await deleteProperty(propertyModal.id); setPropertyModal(null); } : null}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  app:         { background: '#0f0f0f', minHeight: '100vh', color: '#f0ede8', fontFamily: "'DM Sans', -apple-system, sans-serif", paddingBottom: 60 },
  header:      { background: '#141414', borderBottom: '0.5px solid #242424', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em' },
  headerSub:   { fontSize: 12, color: '#5a5855', marginTop: 4 },
  headerBadge: { width: 40, height: 40, borderRadius: 8, background: '#c8a96e15', border: '0.5px solid #c8a96e33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#c8a96e' },
  nav:         { display: 'flex', gap: 6, padding: '14px 32px', borderBottom: '0.5px solid #242424', flexWrap: 'wrap' },
  navBtn:      { fontSize: 13, padding: '7px 16px', borderRadius: 20, border: '0.5px solid #2a2a2a', background: 'transparent', cursor: 'pointer', color: '#9a9690', fontFamily: 'inherit' },
  navBtnActive:{ background: '#1e1e1e', color: '#f0ede8', fontWeight: 500, border: '0.5px solid #3a3a3a' },
  content:     { padding: '20px 32px 0' },
  loading:     { textAlign: 'center', padding: 60, color: '#5a5855' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 },
  metric:      { background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', border: '0.5px solid #242424' },
  metricLabel: { fontSize: 10, color: '#5a5855', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  metricValue: { fontSize: 24, fontWeight: 300 },
  metricSub:   { fontSize: 11, color: '#c97b6e', marginTop: 3 },
  card:        { background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 12, padding: '16px 20px', marginBottom: 14 },
  cardTitle:   { fontSize: 14, fontWeight: 500, marginBottom: 14 },
  empty:       { textAlign: 'center', color: '#5a5855', fontSize: 13, padding: '20px 0' },
  row:         { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #222' },
  tableRow:    { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #222', fontSize: 13 },
  addBtn:      { fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '0.5px solid #c8a96e44', background: '#c8a96e12', color: '#c8a96e', cursor: 'pointer', fontFamily: 'inherit' },
};

export default App;
