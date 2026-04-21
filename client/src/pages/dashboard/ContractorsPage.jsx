import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ContractorsPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('contractors');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/contractors');
      setItems(data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = items.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(s) || (c.trade || '').toLowerCase().includes(s);
  });

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        await api.put(`/contractors/${editing.id}`, form);
        toast.success('Contractor updated');
      } else {
        await api.post('/contractors', form);
        toast.success('Contractor added');
      }
      setEditing(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/contractors/${deleting.id}`);
      toast.success('Contractor deleted');
      setDeleting(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <Layout title="Contractors">
      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search by name or trade..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-72" />
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Contractor
          </button>
        )}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="🔧" title="No contractors" description="Add contractors to your directory." action={canEdit ? '+ Add Contractor' : null} onAction={() => setEditing({})} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Trade</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Rating</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{c.trade || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                    <td className="px-4 py-3">
                      {c.performance_score ? (
                        <div className="flex items-center gap-1">
                          <span className="text-amber-500">{'★'.repeat(Math.round(c.performance_score))}</span>
                          <span className="text-gray-400 text-xs">{c.performance_score}</span>
                        </div>
                      ) : '—'}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(c)} className="text-gray-400 hover:text-primary-500 p-1"><EditIcon /></button>
                          <button onClick={() => setDeleting(c)} className="text-gray-400 hover:text-danger-500 p-1"><TrashIcon /></button>
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

      {editing !== null && <ContractorFormModal contractor={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Contractor" message={`Delete "${deleting.name}"? Active project assignments will be cleared.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </Layout>
  );
}

function ContractorFormModal({ contractor, onClose, onSave }) {
  const isEdit = !!contractor?.id;
  const [form, setForm] = useState({
    name: contractor?.name || '',
    trade: contractor?.trade || '',
    phone: contractor?.phone || '',
    email: contractor?.email || '',
    performance_score: contractor?.performance_score || '',
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Contractor' : 'Add Contractor'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trade</label>
              <select value={form.trade} onChange={e => set('trade', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Select trade...</option>
                <option value="general">General</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
                <option value="hvac">HVAC</option>
                <option value="roofing">Roofing</option>
                <option value="painting">Painting</option>
                <option value="flooring">Flooring</option>
                <option value="drywall">Drywall</option>
                <option value="landscaping">Landscaping</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
              <select value={form.performance_score} onChange={e => set('performance_score', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">No rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Average</option>
                <option value="2">2 - Below Avg</option>
                <option value="1">1 - Poor</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Contractor'}
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
