import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, StatusBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function TenantsPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('property_management');
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const [tRes, pRes] = await Promise.all([
        api.get('/tenants'),
        api.get('/properties').catch(() => ({ data: [] })),
      ]);
      setTenants(tRes.data || []);
      setProperties(pRes.data || []);
    } catch { setTenants([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = tenants.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.name || '').toLowerCase().includes(s) || (t.properties?.address || '').toLowerCase().includes(s);
  });

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        await api.put(`/tenants/${editing.id}`, form);
        toast.success('Tenant updated');
      } else {
        await api.post('/tenants', form);
        toast.success('Tenant added');
      }
      setEditing(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  return (
    <Layout title="Tenants">
      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search tenants..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-72" />
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Tenant
          </button>
        )}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="👤" title="No tenants" description="Add tenants to track leases and payments." action={canEdit ? '+ Add Tenant' : null} onAction={() => setEditing({})} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Property</th>
                <th className="px-4 py-3 font-medium text-gray-500">Unit</th>
                <th className="px-4 py-3 font-medium text-gray-500">Rent</th>
                <th className="px-4 py-3 font-medium text-gray-500">Payment Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Lease End</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{t.properties?.address || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{t.unit || '—'}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">${(Number(t.rent_amount) || 0).toLocaleString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.payment_status || 'current'} /></td>
                    <td className="px-4 py-3 text-gray-600">{t.lease_end ? new Date(t.lease_end).toLocaleDateString() : '—'}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-primary-500 p-1"><EditIcon /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== null && <TenantFormModal tenant={editing} properties={properties} onClose={() => setEditing(null)} onSave={handleSave} />}
    </Layout>
  );
}

function TenantFormModal({ tenant, properties, onClose, onSave }) {
  const isEdit = !!tenant?.id;
  const [form, setForm] = useState({
    name: tenant?.name || '',
    property_id: tenant?.property_id || '',
    unit: tenant?.unit || '',
    rent_amount: tenant?.rent_amount || '',
    lease_start: tenant?.lease_start || '',
    lease_end: tenant?.lease_end || '',
    payment_status: tenant?.payment_status || 'current',
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Tenant' : 'Add Tenant'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
              <select value={form.property_id} onChange={e => set('property_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Select property...</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input value={form.unit} onChange={e => set('unit', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent</label>
              <input type="number" value={form.rent_amount} onChange={e => set('rent_amount', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select value={form.payment_status} onChange={e => set('payment_status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="current">Current</option>
                <option value="late">Late</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lease Start</label>
              <input type="date" value={form.lease_start ? form.lease_start.split('T')[0] : ''} onChange={e => set('lease_start', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lease End</label>
              <input type="date" value={form.lease_end ? form.lease_end.split('T')[0] : ''} onChange={e => set('lease_end', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Tenant'}
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
