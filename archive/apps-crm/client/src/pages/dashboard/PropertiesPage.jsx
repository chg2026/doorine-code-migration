import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single Family', defaultUnits: 1, locked: true },
  { value: 'duplex', label: 'Duplex', defaultUnits: 2 },
  { value: 'triplex', label: 'Triplex', defaultUnits: 3 },
  { value: 'multi_unit', label: 'Multi-Unit / Apartment', defaultUnits: 4 },
  { value: 'commercial', label: 'Commercial Building', defaultUnits: 1 },
];

const STATUS_OPTIONS = [
  { value: 'pre_construction', label: 'Pre-Construction' },
  { value: 'under_construction', label: 'Under Construction' },
  { value: 'completed', label: 'Completed' },
  { value: 'occupied', label: 'Occupied' },
];

const STATUS_STYLE = {
  pre_construction: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  under_construction: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-green-50 text-green-700 ring-green-600/20',
  occupied: 'bg-green-50 text-green-700 ring-green-600/20',
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  vacant: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

const typeLabel = (v) => PROPERTY_TYPES.find(t => t.value === v)?.label || (v || '').replace(/_/g, ' ');
const statusLabel = (v) => STATUS_OPTIONS.find(s => s.value === v)?.label || (v || '').replace(/_/g, ' ');

export default function PropertiesPage() {
  const { canEditDepartment, profile } = useAuth();
  const canEdit = canEditDepartment('property_management');
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/properties');
      setItems(data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = items.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s)
      || (p.address || '').toLowerCase().includes(s)
      || (p.street || '').toLowerCase().includes(s)
      || (p.city || '').toLowerCase().includes(s);
  });

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        await api.put(`/properties/${editing.id}`, form);
        toast.success('Property updated');
      } else {
        await api.post('/properties', form);
        toast.success('Property added');
      }
      setEditing(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/properties/${deleting.id}`);
      toast.success('Property deleted');
      setDeleting(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <Layout title="Property Management">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <input type="text" placeholder="Search by name, address, city..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-72" />
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Property
          </button>
        )}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="🏢" title="No properties yet" description="Add your first property to get started." action={canEdit ? '+ Add Property' : null} onAction={() => setEditing({})} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Property</th>
                <th className="px-4 py-3 font-medium text-gray-500">Address</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Units</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/properties/${p.id}`)}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="w-10 h-10 rounded object-cover border border-gray-200" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-lg">🏠</div>
                        )}
                        <span>{p.name || p.address || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {[p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{typeLabel(p.property_type || p.type) || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.unit_count ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[p.status] || STATUS_STYLE.active}`}>
                        {statusLabel(p.status) || 'active'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="text-gray-400 hover:text-primary-500 p-1" title="Edit">
                            <EditIcon />
                          </button>
                          <button onClick={() => setDeleting(p)} className="text-gray-400 hover:text-danger-500 p-1" title="Delete">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== null && <PropertyFormModal property={editing} accountId={profile?.account_id} onClose={() => setEditing(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Property" message={`Delete "${deleting.name || deleting.address}"? This will also remove related units, tenants, projects, and invoices.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </Layout>
  );
}

function PropertyFormModal({ property, accountId, onClose, onSave }) {
  const isEdit = !!property?.id;
  const initialType = property?.property_type || property?.type || 'single_family';
  const initialCount = property?.unit_count || PROPERTY_TYPES.find(t => t.value === initialType)?.defaultUnits || 1;

  const [form, setForm] = useState({
    name: property?.name || '',
    street: property?.street || property?.address || '',
    city: property?.city || '',
    state: property?.state || '',
    zip: property?.zip || '',
    property_type: initialType,
    unit_count: initialCount,
    purchase_date: property?.purchase_date || property?.acquisition_date || '',
    purchase_price: property?.purchase_price || '',
    status: property?.status || 'pre_construction',
    photo_url: property?.photo_url || '',
  });
  const [unitLabels, setUnitLabels] = useState(
    Array.from({ length: initialCount }, (_, i) => `Unit ${i + 1}`)
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const typeMeta = PROPERTY_TYPES.find(t => t.value === form.property_type) || PROPERTY_TYPES[0];
  const isLocked = typeMeta.locked;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onTypeChange = (newType) => {
    const meta = PROPERTY_TYPES.find(t => t.value === newType) || PROPERTY_TYPES[0];
    const count = meta.defaultUnits;
    setForm(f => ({ ...f, property_type: newType, unit_count: count }));
    setUnitLabels(Array.from({ length: count }, (_, i) => `Unit ${i + 1}`));
  };

  const onCountChange = (raw) => {
    if (isLocked) return;
    const n = Math.max(1, Math.min(200, parseInt(raw, 10) || 1));
    set('unit_count', n);
    setUnitLabels(prev => {
      const next = [...prev];
      while (next.length < n) next.push(`Unit ${next.length + 1}`);
      return next.slice(0, n);
    });
  };

  const setLabel = (i, v) => setUnitLabels(prev => prev.map((l, idx) => idx === i ? v : l));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!accountId) {
      toast.error('Account not loaded — please refresh and try again');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${accountId}/properties/photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('project-documents').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: signed, error: signErr } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signErr) throw signErr;
      set('photo_url', signed.signedUrl);
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, address: form.street }; // keep legacy address column populated
    if (!isEdit) payload.unit_labels = unitLabels;
    await onSave(payload);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Property' : 'Add Property'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Property Name" required>
              <input value={form.name} onChange={e => set('name', e.target.value)} required
                placeholder="e.g. Cleveland Triplex"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>

            <Field label="Street Address" required>
              <input value={form.street} onChange={e => set('street', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="City"><input value={form.city} onChange={e => set('city', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></Field>
              <Field label="State"><input value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} placeholder="OH" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 uppercase" /></Field>
              <Field label="ZIP"><input value={form.zip} onChange={e => set('zip', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Property Type">
                <select value={form.property_type} onChange={e => onTypeChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label={isEdit ? 'Units (manage from property dashboard)' : isLocked ? 'Units (locked for Single Family)' : 'Number of Units'}>
                <input type="number" min={1} max={200} value={form.unit_count} onChange={e => onCountChange(e.target.value)}
                  disabled={isLocked || isEdit}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500" />
              </Field>
            </div>

            {!isEdit && unitLabels.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit Labels</label>
                <p className="text-xs text-gray-500 mb-2">Customize each unit's label (e.g. Upper Unit, Lower Unit, Unit 1A)</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {unitLabels.map((label, i) => (
                    <input key={i} value={label} onChange={e => setLabel(i, e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase Date">
                <input type="date" value={form.purchase_date || ''} onChange={e => set('purchase_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </Field>
              <Field label="Purchase Price">
                <input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="$"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </Field>
            </div>

            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>

            <Field label="Property Photo">
              <div className="flex items-center gap-3">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="" className="w-16 h-16 rounded object-cover border border-gray-200" />
                ) : (
                  <div className="w-16 h-16 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl">📷</div>
                )}
                <label className="cursor-pointer text-sm text-primary-600 hover:underline">
                  {uploading ? 'Uploading...' : (form.photo_url ? 'Replace photo' : 'Upload photo')}
                  <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" disabled={uploading} />
                </label>
                {form.photo_url && (
                  <button type="button" onClick={() => set('photo_url', '')} className="text-sm text-gray-500 hover:text-danger-600">Remove</button>
                )}
              </div>
            </Field>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Property'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-danger-500"> *</span>}</label>
      {children}
    </div>
  );
}

function EditIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>;
}
function TrashIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>;
}
