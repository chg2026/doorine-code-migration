import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STAGES = ['lead', 'analyzing', 'offer_sent', 'under_contract', 'due_diligence', 'closed', 'dead'];

export default function AcquisitionsPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('acquisitions');
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [editing, setEditing] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/deals');
      setDeals(data || []);
    } catch { setDeals([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = deals.filter(d => {
    if (stageFilter && d.stage !== stageFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.address || '').toLowerCase().includes(s) || (d.seller_name || '').toLowerCase().includes(s);
  });

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        await api.put(`/deals/${editing.id}`, form);
        toast.success('Deal updated');
      } else {
        await api.post('/deals', form);
        toast.success('Deal created');
      }
      setEditing(null);
      fetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const stageColor = (s) => {
    if (s === 'closed') return 'bg-green-50 text-green-700 ring-green-600/20';
    if (s === 'dead') return 'bg-red-50 text-red-700 ring-red-600/20';
    if (s === 'under_contract' || s === 'due_diligence') return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    if (s === 'offer_sent') return 'bg-purple-50 text-purple-700 ring-purple-600/20';
    return 'bg-gray-50 text-gray-600 ring-gray-500/10';
  };

  const pipelineStats = STAGES.filter(s => s !== 'dead' && s !== 'closed').map(s => ({
    stage: s,
    count: deals.filter(d => d.stage === s).length,
  }));

  return (
    <Layout title="Acquisitions">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {pipelineStats.map(s => (
          <button key={s.stage} onClick={() => setStageFilter(stageFilter === s.stage ? '' : s.stage)}
            className={`p-3 rounded-xl border text-left transition-colors ${stageFilter === s.stage ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <div className="text-xl font-bold text-gray-900">{s.count}</div>
            <div className="text-xs text-gray-500 capitalize">{s.stage.replace(/_/g, ' ')}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-64" />
          {stageFilter && (
            <button onClick={() => setStageFilter('')} className="text-xs text-primary-500 hover:text-primary-600 font-medium">
              Clear filter
            </button>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + New Deal
          </button>
        )}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="No deals" description="Start tracking acquisition opportunities." action={canEdit ? '+ New Deal' : null} onAction={() => setEditing({})} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Address</th>
                <th className="px-4 py-3 font-medium text-gray-500">Stage</th>
                <th className="px-4 py-3 font-medium text-gray-500">Asking</th>
                <th className="px-4 py-3 font-medium text-gray-500">ARV</th>
                <th className="px-4 py-3 font-medium text-gray-500">ROI</th>
                <th className="px-4 py-3 font-medium text-gray-500">Seller</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{d.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset capitalize ${stageColor(d.stage)}`}>
                        {(d.stage || 'lead').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{d.asking_price ? `$${Number(d.asking_price).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{d.arv ? `$${Number(d.arv).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3">
                      {d.roi_estimate != null ? (
                        <span className={d.roi_estimate >= 20 ? 'text-green-600 font-medium' : d.roi_estimate >= 0 ? 'text-gray-600' : 'text-red-600 font-medium'}>
                          {d.roi_estimate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{d.seller_name || '—'}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditing(d)} className="text-gray-400 hover:text-primary-500 p-1"><EditIcon /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== null && <DealFormModal deal={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
    </Layout>
  );
}

function DealFormModal({ deal, onClose, onSave }) {
  const isEdit = !!deal?.id;
  const [form, setForm] = useState({
    address: deal?.address || '',
    city: deal?.city || '',
    state: deal?.state || '',
    stage: deal?.stage || 'lead',
    asking_price: deal?.asking_price || '',
    offer_price: deal?.offer_price || '',
    arv: deal?.arv || '',
    labor_estimate: deal?.labor_estimate || '',
    material_estimate: deal?.material_estimate || '',
    seller_name: deal?.seller_name || '',
    seller_phone: deal?.seller_phone || '',
    notes: deal?.notes || '',
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Deal' : 'New Deal'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asking Price</label>
              <input type="number" value={form.asking_price} onChange={e => set('asking_price', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offer Price</label>
              <input type="number" value={form.offer_price} onChange={e => set('offer_price', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ARV</label>
              <input type="number" value={form.arv} onChange={e => set('arv', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Labor Estimate</label>
              <input type="number" value={form.labor_estimate} onChange={e => set('labor_estimate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material Estimate</label>
              <input type="number" value={form.material_estimate} onChange={e => set('material_estimate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seller Name</label>
              <input value={form.seller_name} onChange={e => set('seller_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seller Phone</label>
              <input value={form.seller_phone} onChange={e => set('seller_phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Deal'}
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
