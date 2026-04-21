import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function PropertiesPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('property_management');
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
    return (p.address || '').toLowerCase().includes(s) || (p.city || '').toLowerCase().includes(s);
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
      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search by address or city..." value={search} onChange={e => setSearch(e.target.value)}
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
                <th className="px-4 py-3 font-medium text-gray-500">Address</th>
                <th className="px-4 py-3 font-medium text-gray-500">City</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Units</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.address || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.city || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{(p.property_type || p.type || '—').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-600">{p.unit_count ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${p.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'}`}>
                        {p.status || 'active'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
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

      {editing !== null && <PropertyFormModal property={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Property" message={`Delete "${deleting.address}"? This will also remove related tenants, projects, and invoices.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </Layout>
  );
}

function PropertyFormModal({ property, onClose, onSave }) {
  const isEdit = !!property?.id;
  const [form, setForm] = useState({
    address: property?.address || '',
    city: property?.city || '',
    property_type: property?.property_type || property?.type || 'single_family',
    unit_count: property?.unit_count || '',
    purchase_price: property?.purchase_price || '',
    status: property?.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Property' : 'Add Property'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input value={form.city} onChange={e => set('city', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
              <select value={form.property_type} onChange={e => set('property_type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="single_family">Single Family</option>
                <option value="multi_family">Multi Family</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Units</label>
              <input type="number" value={form.unit_count} onChange={e => set('unit_count', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
            <input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>;
}
function TrashIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>;
}
