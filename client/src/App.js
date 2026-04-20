import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const fmtMoney = (n) =>
  `$${parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const getTimeline = (startStr, targetStr) => {
  if (!startStr || !targetStr) return null;
  const MS = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start  = new Date(startStr + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  const totalDays     = Math.max(1, Math.round((target - start) / MS));
  const daysActive    = Math.max(0, Math.round((today - start) / MS));
  const daysRemaining = Math.max(0, Math.round((target - today) / MS));
  const pct = Math.min(100, Math.round((daysActive / totalDays) * 100));
  return { totalDays, daysActive, daysRemaining, pct };
};

const phaseCompletion = (phases) => {
  if (!phases || phases.length === 0) return 0;
  return Math.round(phases.reduce((s, ph) => s + (ph.completion_pct || 0), 0) / phases.length);
};

const estimatedSpent = (phases) =>
  (phases || []).reduce(
    (s, ph) => s + (parseFloat(ph.completion_pct || 0) / 100) * parseFloat(ph.budget || 0), 0
  );

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'single_family',  label: 'Single Family',   unitHint: '1 unit'     },
  { value: 'duplex',         label: 'Duplex',           unitHint: '2 units'    },
  { value: 'triplex',        label: 'Triplex',          unitHint: '3 units'    },
  { value: 'multi_unit',     label: 'Multi-unit',       unitHint: '4+ units'   },
  { value: 'small_building', label: 'Small Building',   unitHint: '5–20 units' },
  { value: 'large_building', label: 'Large Building',   unitHint: '20+ units'  },
  { value: 'commercial',     label: 'Commercial',       unitHint: ''           },
  { value: 'mixed_use',      label: 'Mixed Use',        unitHint: ''           },
];

const PROPERTY_TYPE_MAP = Object.fromEntries(PROPERTY_TYPES.map(t => [t.value, t]));

const PROPERTY_STATUSES = [
  { value: 'vacant',             label: 'Vacant',              color: '#9a9690', bg: '#222'    },
  { value: 'not_started',        label: 'Not Started',         color: '#aaa',    bg: '#252525' },
  { value: 'under_construction', label: 'Under Construction',  color: '#6e9ec9', bg: '#1a2d3d' },
  { value: 'ready_to_rent',      label: 'Ready to Rent',       color: '#c8a96e', bg: '#2d2a1a' },
  { value: 'occupied',           label: 'Occupied',            color: '#7ab88a', bg: '#0d2b1a' },
  { value: 'partial',            label: 'Partially Occupied',  color: '#9b8ec4', bg: '#1e1a2d' },
];

const STATUS_MAP = {
  ...Object.fromEntries(PROPERTY_STATUSES.map(s => [s.value, s])),
  active: { label: 'Active', color: '#7ab88a', bg: '#0d2b1a' },
};

const getPropType  = (p) => PROPERTY_TYPE_MAP[p.type] || PROPERTY_TYPE_MAP[p.property_type] || null;
const getPropStatus = (status) => STATUS_MAP[status] || { label: status || 'Vacant', color: '#9a9690', bg: '#222' };

// ─── Shared sub-components ────────────────────────────────────────────────────

function Bar({ pct, color, height = 5 }) {
  return (
    <div style={{ height, background: '#252525', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color, borderRadius: 3, transition: 'width 0.4s',
      }} />
    </div>
  );
}

function Badge({ label, bg, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
      background: bg, color, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: '#5a5855',
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
    }}>
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

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ onClose, title, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div style={{
        background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 16,
        width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 16px', borderBottom: '0.5px solid #2a2a2a',
          position: 'sticky', top: 0, background: '#1a1a1a', zIndex: 1,
        }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9a9690',
            cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit',
          }}>×</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Property add/edit modal ──────────────────────────────────────────────────

function PropertyModal({ property, tenants, onClose, onSave, onDelete }) {
  const isEdit = !!property?.id;

  const [form, setForm] = useState({
    address:          property?.address          || '',
    city:             property?.city             || '',
    type:             property?.type             || property?.property_type || 'single_family',
    unit_count:       property?.unit_count       || 1,
    status:           property?.status           || 'vacant',
    purchase_price:   property?.purchase_price   || '',
    acquisition_date: property?.acquisition_date || '',
    insurance_policy: property?.insurance_policy || '',
  });

  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [confirmDelete,  setConfirmDelete]  = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const propTenants = (tenants || []).filter(t => t.property_id === property?.id);

  const handleSave = async () => {
    if (!form.address.trim()) { setError('Address is required.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ ...form, unit_count: Number(form.unit_count) || 1 });
    } catch (e) {
      setError(e?.response?.data?.error || 'Save failed. Please try again.');
      setSaving(false);
    }
  };

  const inp = {
    width: '100%', background: '#111', border: '0.5px solid #333', borderRadius: 8,
    padding: '10px 12px', color: '#f0ede8', fontSize: 13, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  };
  const lbl = {
    fontSize: 11, color: '#9a9690', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', display: 'block', marginBottom: 6,
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Property' : 'Add Property'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Address */}
        <div>
          <label style={lbl}>Address *</label>
          <input
            style={inp}
            value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="123 Main St"
            autoFocus
          />
        </div>

        {/* City */}
        <div>
          <label style={lbl}>City / State</label>
          <input
            style={inp}
            value={form.city}
            onChange={e => set('city', e.target.value)}
            placeholder="Cleveland, OH"
          />
        </div>

        {/* Type + Unit Count */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Property Type</label>
            <select
              style={{ ...inp, cursor: 'pointer' }}
              value={form.type}
              onChange={e => set('type', e.target.value)}
            >
              {PROPERTY_TYPES.map(t => (
                <option key={t.value} value={t.value} style={{ background: '#1a1a1a' }}>
                  {t.label}{t.unitHint ? ` (${t.unitHint})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Unit Count</label>
            <input
              style={inp}
              type="number"
              min={1}
              value={form.unit_count}
              onChange={e => set('unit_count', e.target.value)}
            />
          </div>
        </div>

        {/* Status selector — button grid */}
        <div>
          <label style={lbl}>Property Status</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {PROPERTY_STATUSES.map(st => {
              const active = form.status === st.value;
              return (
                <button
                  key={st.value}
                  onClick={() => set('status', st.value)}
                  style={{
                    padding: '9px 6px', borderRadius: 8,
                    border: `1px solid ${active ? st.color : '#2a2a2a'}`,
                    background: active ? st.bg : 'transparent',
                    color: active ? st.color : '#5a5855',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s', lineHeight: 1.3,
                  }}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Purchase Price + Acquisition Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Purchase Price</label>
            <input
              style={inp}
              type="number"
              value={form.purchase_price}
              onChange={e => set('purchase_price', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label style={lbl}>Acquisition Date</label>
            <input
              style={{ ...inp, colorScheme: 'dark' }}
              type="date"
              value={form.acquisition_date || ''}
              onChange={e => set('acquisition_date', e.target.value)}
            />
          </div>
        </div>

        {/* Insurance */}
        <div>
          <label style={lbl}>Insurance Policy #</label>
          <input
            style={inp}
            value={form.insurance_policy || ''}
            onChange={e => set('insurance_policy', e.target.value)}
            placeholder="Policy number"
          />
        </div>

        {/* Tenants on this property (edit only) */}
        {isEdit && propTenants.length > 0 && (
          <div>
            <label style={lbl}>Current Tenants</label>
            <div style={{ background: '#111', borderRadius: 8, border: '0.5px solid #2a2a2a', overflow: 'hidden' }}>
              {propTenants.map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 12px', fontSize: 13,
                  borderBottom: i < propTenants.length - 1 ? '0.5px solid #1e1e1e' : 'none',
                }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{t.name}</span>
                    {t.unit && <span style={{ color: '#9a9690', marginLeft: 8, fontSize: 12 }}>{t.unit}</span>}
                  </div>
                  <Badge
                    label={(t.payment_status || 'current').toUpperCase()}
                    bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'}
                    color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ fontSize: 12, color: '#c97b6e', padding: '8px 12px', background: '#2d1a1a', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* Action row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 8, borderTop: '0.5px solid #252525', marginTop: 4,
        }}>
          <div>
            {isEdit && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'none', border: '0.5px solid #c97b6e44', color: '#c97b6e',
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'inherit',
                }}
              >
                Delete
              </button>
            )}
            {confirmDelete && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#c97b6e' }}>Delete this property?</span>
                <button
                  onClick={onDelete}
                  style={{
                    background: '#c97b6e', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: 'none', border: '0.5px solid #333', color: '#9a9690',
                    borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                    fontSize: 12, fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '0.5px solid #333', color: '#9a9690',
                borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.address.trim()}
              style={{
                background: saving || !form.address.trim() ? '#2a2a2a' : '#c8a96e',
                border: 'none',
                color: saving || !form.address.trim() ? '#5a5855' : '#0f0f0f',
                borderRadius: 8, padding: '9px 20px',
                cursor: saving || !form.address.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Property'}
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
}

// ─── Property card (Properties tab) ──────────────────────────────────────────

function PropCard({ property, tenants, onClick }) {
  const typeInfo  = getPropType(property);
  const statusInfo = getPropStatus(property.status);
  const occupied  = tenants.length;
  const total     = Number(property.unit_count) || 1;
  const pct       = total > 1 ? Math.round((occupied / total) * 100) : null;

  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#1c1c1c' : '#171717',
        border: `0.5px solid ${hovered ? '#444' : '#2a2a2a'}`,
        borderRadius: 12, padding: '16px 20px', marginBottom: 10,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left side */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 3 }}>{property.address}</div>
          <div style={{ fontSize: 12, color: '#9a9690', marginBottom: 10 }}>
            {property.city && <>{property.city} &nbsp;·&nbsp; </>}
            {typeInfo
              ? <>{typeInfo.label}{typeInfo.unitHint ? ` (${typeInfo.unitHint})` : ''}</>
              : (property.type || property.property_type || 'Property')
            }
            {total > 1 && !typeInfo?.unitHint && <> &nbsp;·&nbsp; {total} units</>}
          </div>

          {/* Occupancy bar for multi-unit */}
          {total > 1 && pct !== null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5a5855', marginBottom: 4 }}>
                <span>{occupied} of {total} units occupied</span>
                <span>{pct}%</span>
              </div>
              <Bar
                pct={pct}
                color={pct >= 80 ? '#7ab88a' : pct >= 40 ? '#c8a96e' : '#6e9ec9'}
                height={4}
              />
            </div>
          )}

          {property.purchase_price > 0 && (
            <div style={{ fontSize: 12, color: '#9a9690' }}>
              Purchased: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(property.purchase_price)}</span>
              {property.acquisition_date && <> &nbsp;·&nbsp; {fmtDate(property.acquisition_date)}</>}
            </div>
          )}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginLeft: 16, flexShrink: 0 }}>
          <Badge
            label={(property.status || 'vacant').replace(/_/g, ' ').toUpperCase()}
            bg={statusInfo.bg}
            color={statusInfo.color}
          />
          <div style={{ fontSize: 10, color: hovered ? '#666' : '#2e2e2e', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
            CLICK TO EDIT
          </div>
        </div>
      </div>

      {/* Tenant pills */}
      {tenants.length > 0 && (
        <div style={{ borderTop: '0.5px solid #222', paddingTop: 10, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tenants.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#111', borderRadius: 20, padding: '4px 10px', fontSize: 12,
            }}>
              <span style={{ fontWeight: 500 }}>{t.name}</span>
              {t.unit && <span style={{ color: '#9a9690', fontSize: 11 }}>{t.unit}</span>}
              <Badge
                label={(t.payment_status || 'current').toUpperCase()}
                bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'}
                color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Construction project card ────────────────────────────────────────────────

function ProjectCard({ project }) {
  const phases       = project.construction_phases || [];
  const totalBudget  = parseFloat(project.labor_budget || 0) + parseFloat(project.material_budget || 0);
  const spent        = estimatedSpent(phases);
  const budgetPct    = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;
  const completionPct = phaseCompletion(phases);
  const timeline     = getTimeline(project.start_date, project.target_completion);
  const onTime       = timeline ? completionPct >= timeline.pct : true;
  const phaseBudgetTotal = phases.reduce((s, ph) => s + parseFloat(ph.budget || 0), 0);

  const statusColor = project.status === 'active'
    ? { bg: '#0d2b1a', color: '#7ab88a' }
    : project.status === 'delayed'
    ? { bg: '#2b1a0d', color: '#c8a96e' }
    : { bg: '#1a1a1a', color: '#9a9690' };

  return (
    <div style={{ background: '#171717', border: '0.5px solid #2a2a2a', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>{project.name || project.properties?.address}</div>
            <div style={{ fontSize: 12, color: '#9a9690' }}>
              {project.properties?.address}{project.properties?.city ? `, ${project.properties.city}` : ''}
              {project.contractors?.name && <> &nbsp;·&nbsp; {project.contractors.name}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
            <Badge label={project.status?.toUpperCase() || 'ACTIVE'} bg={statusColor.bg} color={statusColor.color} />
            {timeline && (
              <Badge
                label={onTime ? 'ON TIME' : 'BEHIND'}
                bg={onTime ? '#0a2e18' : '#2e0a0a'}
                color={onTime ? '#7ab88a' : '#c97b6e'}
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px 20px', borderBottom: '0.5px solid #222' }}>
        <StatBox
          label="Completion"
          value={`${completionPct}%`}
          color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'}
        />
        <StatBox
          label="Budget spent"
          value={fmtMoney(spent)}
          sub={`of ${fmtMoney(totalBudget)} total`}
          color="#c8a96e"
        />
        {timeline && (
          <StatBox
            label="Days active"
            value={timeline.daysActive}
            sub={`${timeline.daysRemaining} days remaining`}
            color={onTime ? '#7ab88a' : '#c97b6e'}
          />
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <SectionLabel>Project Completion</SectionLabel>
            <span style={{ fontSize: 11, color: '#9a9690' }}>{completionPct}% of phases done</span>
          </div>
          <Bar pct={completionPct} color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'} height={8} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <SectionLabel>Budget Utilization</SectionLabel>
            <span style={{ fontSize: 11, color: '#9a9690' }}>
              {fmtMoney(spent)} spent &nbsp;/&nbsp; {fmtMoney(totalBudget)} total &nbsp;({budgetPct}%)
            </span>
          </div>
          <Bar pct={budgetPct} color={budgetPct > 90 ? '#c97b6e' : budgetPct > 70 ? '#c8a96e' : '#7ab88a'} height={8} />
        </div>

        {timeline && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionLabel>Project Timeline</SectionLabel>
              <span style={{ fontSize: 11, color: onTime ? '#7ab88a' : '#c97b6e' }}>
                {timeline.pct}% of schedule elapsed
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <div>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Start</div>
                <div style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtDate(project.start_date)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Today</div>
                <div style={{ color: onTime ? '#7ab88a' : '#c97b6e', fontWeight: 500 }}>
                  Day {timeline.daysActive} of {timeline.totalDays}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Target</div>
                <div style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtDate(project.target_completion)}</div>
              </div>
            </div>
            <div style={{ position: 'relative', height: 16, background: '#252525', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${timeline.pct}%`, background: onTime ? '#0d3320' : '#2e1010', borderRadius: 8 }} />
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${completionPct}%`, background: onTime ? '#7ab88a' : '#c97b6e', borderRadius: 8, opacity: 0.85 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a5855' }}>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7ab88a', marginRight: 4, verticalAlign: 'middle' }} />
                {completionPct}% complete
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#0d3320', border: '1px solid #1a5c34', marginRight: 4, verticalAlign: 'middle' }} />
                {timeline.pct}% of time elapsed
              </span>
            </div>
          </div>
        )}

        {phases.length > 0 && (
          <div>
            <SectionLabel>Construction Phases</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 36px', gap: '0 8px', fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0', borderBottom: '0.5px solid #2a2a2a', marginBottom: 2 }}>
              <div>Phase</div>
              <div style={{ textAlign: 'right' }}>Budget</div>
              <div style={{ textAlign: 'center' }}>Progress</div>
              <div style={{ textAlign: 'right' }}>%</div>
            </div>
            {phases.map(ph => {
              const done = ph.completion_pct || 0;
              return (
                <div key={ph.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 36px', gap: '0 8px', padding: '7px 0', borderBottom: '0.5px solid #1e1e1e', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ color: done === 100 ? '#7ab88a' : '#9a9690' }}>
                    {done === 100 && <span style={{ marginRight: 5 }}>✓</span>}
                    {ph.name}
                  </div>
                  <div style={{ textAlign: 'right', color: '#c8a96e', fontSize: 11 }}>{fmtMoney(ph.budget)}</div>
                  <div><Bar pct={done} color={done === 100 ? '#7ab88a' : '#6e9ec9'} height={4} /></div>
                  <div style={{ textAlign: 'right', fontWeight: 500, fontSize: 11, color: done === 100 ? '#7ab88a' : '#f0ede8' }}>{done}%</div>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 10, fontSize: 11, color: '#9a9690' }}>
              <span>Phase budgets total: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(phaseBudgetTotal)}</span></span>
              <span>Project budget: <span style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtMoney(totalBudget)}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [activeTab,    setActiveTab]    = useState('overview');
  const [projects,     setProjects]     = useState([]);
  const [tenants,      setTenants]      = useState([]);
  const [deals,        setDeals]        = useState([]);
  const [tasks,        setTasks]        = useState([]);
  const [invoices,     setInvoices]     = useState([]);
  const [properties,   setProperties]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [propertyModal, setPropertyModal] = useState(null); // null | {} (add) | {id,...} (edit)

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [p, t, d, tk, inv, props] = await Promise.all([
        axios.get(`${API}/api/projects`),
        axios.get(`${API}/api/tenants`),
        axios.get(`${API}/api/deals`),
        axios.get(`${API}/api/tasks`),
        axios.get(`${API}/api/invoices`),
        axios.get(`${API}/api/properties`),
      ]);
      setProjects(p.data);
      setTenants(t.data);
      setDeals(d.data);
      setTasks(tk.data);
      setInvoices(inv.data);
      setProperties(props.data);
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
        <div style={s.headerBadge}>CHG</div>
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
                <div style={s.metric}>
                  <div style={s.metricLabel}>Active projects</div>
                  <div style={{ ...s.metricValue, color: '#7ab88a' }}>{activeProjects}</div>
                  {delayedProjects > 0 && <div style={s.metricSub}>{delayedProjects} delayed</div>}
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Occupied units</div>
                  <div style={{ ...s.metricValue, color: '#6e9ec9' }}>{tenants.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Late payments</div>
                  <div style={{ ...s.metricValue, color: lateCount > 0 ? '#c97b6e' : '#7ab88a' }}>{lateCount}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total spend</div>
                  <div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Deals tracked</div>
                  <div style={{ ...s.metricValue, color: '#9b8ec4' }}>{deals.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Pending tasks</div>
                  <div style={{ ...s.metricValue, color: overdueTasks > 0 ? '#c97b6e' : '#7ab88a' }}>{overdueTasks}</div>
                </div>
              </div>

              {/* Portfolio — clickable rows */}
              {properties.length > 0 && (
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={s.cardTitle}>Portfolio</div>
                    <button
                      onClick={() => { setActiveTab('properties'); setPropertyModal({}); }}
                      style={s.addBtn}
                    >
                      + Add
                    </button>
                  </div>
                  {properties.map(p => {
                    const typeInfo = getPropType(p);
                    const ss = getPropStatus(p.status);
                    return (
                      <div
                        key={p.id}
                        style={{ ...s.row, cursor: 'pointer' }}
                        onClick={() => { setActiveTab('properties'); setPropertyModal(p); }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{p.address}</div>
                          <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>
                            {p.city && <>{p.city} &nbsp;·&nbsp; </>}
                            {typeInfo ? typeInfo.label : (p.type || p.property_type || '—')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Badge
                            label={(p.status || 'vacant').replace(/_/g, ' ').toUpperCase()}
                            bg={ss.bg}
                            color={ss.color}
                          />
                          <span style={{ fontSize: 11, color: '#3a3a3a' }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {properties.length === 0 && (
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={s.cardTitle}>Portfolio</div>
                    <button onClick={() => { setActiveTab('properties'); setPropertyModal({}); }} style={s.addBtn}>+ Add Property</button>
                  </div>
                  <div style={s.empty}>No properties yet</div>
                </div>
              )}

              {/* Construction summary */}
              <div style={s.card}>
                <div style={s.cardTitle}>Construction projects</div>
                {projects.length === 0 ? (
                  <div style={s.empty}>No projects yet</div>
                ) : projects.map(p => {
                  const phases = p.construction_phases || [];
                  const pct = phaseCompletion(phases);
                  const timeline = getTimeline(p.start_date, p.target_completion);
                  const onTime = timeline ? pct >= timeline.pct : true;
                  return (
                    <div key={p.id} style={s.row}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name || p.properties?.address}</div>
                        <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>
                          {p.contractors?.name || '—'}
                          {timeline && <> &nbsp;·&nbsp; Day {timeline.daysActive} of {timeline.totalDays}</>}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <Bar pct={pct} color={pct >= 70 ? '#7ab88a' : pct >= 40 ? '#c8a96e' : '#6e9ec9'} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 4 }}>
                          <Badge label={p.status?.toUpperCase()} bg={p.status === 'active' ? '#0d2b1a' : '#2b1a0d'} color={p.status === 'active' ? '#7ab88a' : '#c8a96e'} />
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
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit} — ${t.rent_amount}/mo</div>
                      </div>
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
              {/* Tab header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>Property Portfolio</div>
                  <div style={{ fontSize: 12, color: '#9a9690', marginTop: 3 }}>
                    {properties.length} {properties.length === 1 ? 'property' : 'properties'}
                    {properties.length > 0 && (
                      <> &nbsp;·&nbsp; {tenants.length} total tenants</>
                    )}
                  </div>
                </div>
                <button onClick={() => setPropertyModal({})} style={s.addBtn}>
                  + Add Property
                </button>
              </div>

              {/* Empty state */}
              {properties.length === 0 && (
                <div style={{ ...s.card, textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
                  <div style={{ color: '#9a9690', marginBottom: 6, fontSize: 15 }}>No properties in portfolio yet</div>
                  <div style={{ color: '#5a5855', fontSize: 13, marginBottom: 20 }}>Add your first property to get started</div>
                  <button onClick={() => setPropertyModal({})} style={{ ...s.addBtn, padding: '10px 24px', fontSize: 14 }}>
                    Add Property
                  </button>
                </div>
              )}

              {/* Property cards */}
              {properties.map(p => (
                <PropCard
                  key={p.id}
                  property={p}
                  tenants={tenants.filter(t => t.property_id === p.id)}
                  onClick={() => setPropertyModal(p)}
                />
              ))}

              {/* Summary bar */}
              {properties.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
                  {[
                    { label: 'Occupied',           val: properties.filter(p => p.status === 'occupied' || p.status === 'active').length,   color: '#7ab88a' },
                    { label: 'Under Construction', val: properties.filter(p => p.status === 'under_construction').length, color: '#6e9ec9' },
                    { label: 'Ready to Rent',      val: properties.filter(p => p.status === 'ready_to_rent').length,     color: '#c8a96e' },
                  ].map(item => (
                    <div key={item.label} style={{ background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 300, color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Property modal */}
              {propertyModal !== null && (
                <PropertyModal
                  property={propertyModal}
                  tenants={tenants}
                  onClose={() => setPropertyModal(null)}
                  onSave={async (form) => {
                    if (propertyModal.id) {
                      await saveProperty(propertyModal.id, form);
                    } else {
                      await addProperty(form);
                    }
                    setPropertyModal(null);
                  }}
                  onDelete={propertyModal.id ? async () => {
                    await deleteProperty(propertyModal.id);
                    setPropertyModal(null);
                  } : null}
                />
              )}
            </div>
          )}

          {/* ══ Construction ══ */}
          {activeTab === 'construction' && (
            <div>
              {projects.length === 0 ? (
                <div style={s.card}><div style={s.empty}>No projects yet</div></div>
              ) : projects.map(p => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {/* ══ Property Mgmt ══ */}
          {activeTab === 'pm' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Tenant tracker</div>
                <div style={{ display: 'flex', fontSize: 10, color: '#5a5855', fontWeight: 600, padding: '5px 0', borderBottom: '0.5px solid #2e2e2e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div style={{ flex: 2 }}>Tenant / Unit</div>
                  <div style={{ flex: 1 }}>Rent</div>
                  <div style={{ flex: 1 }}>Status</div>
                </div>
                {tenants.length === 0 ? (
                  <div style={s.empty}>No tenants yet</div>
                ) : tenants.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit}</div>
                    </div>
                    <div style={{ flex: 1 }}>${t.rent_amount}/mo</div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={t.payment_status?.toUpperCase()}
                        bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'}
                        color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'}
                      />
                    </div>
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

          {/* ══ Acquisitions ══ */}
          {activeTab === 'acquisitions' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Deal pipeline</div>
                {deals.length === 0 ? (
                  <div style={s.empty}>No deals in pipeline yet</div>
                ) : deals.map(d => (
                  <div key={d.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{d.address}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>Source: {d.source} &nbsp;|&nbsp; ROI: {d.roi_estimate}%</div>
                    </div>
                    <div style={{ flex: 1 }}>${d.asking_price?.toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <Badge label={d.opportunity_level} bg="#1a2d3d" color="#6e9ec9" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ Finance ══ */}
          {activeTab === 'finance' && (
            <div>
              <div style={s.metricsGrid}>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total invoices</div>
                  <div style={s.metricValue}>{invoices.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total spend</div>
                  <div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Expenses</div>
                  <div style={s.metricValue}>
                    ${invoices.filter(i => i.classification === 'expense').reduce((a, i) => a + parseFloat(i.amount || 0), 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Invoice log</div>
                {invoices.length === 0 ? (
                  <div style={s.empty}>No invoices logged yet</div>
                ) : invoices.map(inv => (
                  <div key={inv.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{inv.vendor}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{inv.properties?.address}</div>
                    </div>
                    <div style={{ flex: 1, fontWeight: 500 }}>${parseFloat(inv.amount).toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={inv.classification}
                        bg={inv.classification === 'expense' ? '#2d2a1a' : '#1a3d2b'}
                        color={inv.classification === 'expense' ? '#c8a96e' : '#7ab88a'}
                      />
                    </div>
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
                {tasks.length === 0 ? (
                  <div style={s.empty}>No tasks yet</div>
                ) : tasks.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>
                        {t.properties?.address} — Due day: {t.due_day}
                      </div>
                      {t.confirmation_number && (
                        <div style={{ fontSize: 12, color: '#7ab88a', marginTop: 2 }}>
                          Confirmation: {t.confirmation_number}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={t.status}
                        bg={t.status === 'completed' ? '#1a3d2b' : '#3d2a1a'}
                        color={t.status === 'completed' ? '#7ab88a' : '#c8a96e'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Property modal also accessible from Overview tab */}
      {activeTab !== 'properties' && propertyModal !== null && (
        <PropertyModal
          property={propertyModal}
          tenants={tenants}
          onClose={() => setPropertyModal(null)}
          onSave={async (form) => {
            if (propertyModal.id) {
              await saveProperty(propertyModal.id, form);
            } else {
              await addProperty(form);
            }
            setPropertyModal(null);
          }}
          onDelete={propertyModal.id ? async () => {
            await deleteProperty(propertyModal.id);
            setPropertyModal(null);
          } : null}
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
  addBtn:      { fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '0.5px solid #c8a96e44', background: '#c8a96e12', color: '#c8a96e', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' },
};

export default App;
