import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function FinancePage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('finance');
  const [invoices, setInvoices] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const [iRes, pRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/properties').catch(() => ({ data: [] })),
      ]);
      setInvoices(iRes.data || []);
      setProperties(pRes.data || []);
    } catch { setInvoices([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = invoices.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (i.vendor || '').toLowerCase().includes(s) || (i.properties?.address || '').toLowerCase().includes(s) || (i.classification || '').toLowerCase().includes(s);
  });

  const totalAmount = filtered.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const handleSave = async (form) => {
    try {
      await api.post('/invoices', form);
      toast.success('Invoice added');
      setEditing(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const classColor = (c) => {
    if ((c || '').includes('labor')) return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    if ((c || '').includes('material')) return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    if ((c || '').includes('utility')) return 'bg-green-50 text-green-700 ring-green-600/20';
    return 'bg-gray-50 text-gray-600 ring-gray-500/10';
  };

  return (
    <Layout title="Finance">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{invoices.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500">Total Amount</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${totalAmount.toLocaleString()}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500">Avg Invoice</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ${invoices.length > 0 ? Math.round(totalAmount / invoices.length).toLocaleString() : 0}
          </p>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-72" />
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Invoice
          </button>
        )}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="📊" title="No invoices" description="Start tracking expenses and invoices." action={canEdit ? '+ Add Invoice' : null} onAction={() => setEditing({})} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Vendor</th>
                <th className="px-4 py-3 font-medium text-gray-500">Property</th>
                <th className="px-4 py-3 font-medium text-gray-500">Classification</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Amount</th>
              </tr></thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{new Date(i.date || i.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{i.vendor || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.properties?.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset capitalize ${classColor(i.classification)}`}>
                        {(i.classification || 'other').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">${(Number(i.amount) || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== null && <InvoiceFormModal properties={properties} onClose={() => setEditing(null)} onSave={handleSave} />}
    </Layout>
  );
}

function InvoiceFormModal({ properties, onClose, onSave }) {
  const [form, setForm] = useState({
    vendor: '',
    amount: '',
    property_id: '',
    classification: 'construction_labor',
    date: new Date().toISOString().split('T')[0],
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
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Invoice</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <input value={form.vendor} onChange={e => set('vendor', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
              <select value={form.classification} onChange={e => set('classification', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="construction_labor">Construction Labor</option>
                <option value="construction_material">Construction Material</option>
                <option value="construction_other">Construction Other</option>
                <option value="utility">Utility</option>
                <option value="insurance">Insurance</option>
                <option value="tax">Tax</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
