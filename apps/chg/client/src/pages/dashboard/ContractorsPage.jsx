import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Badge, w9Badge, insuranceBadge, complianceSummary } from '../../lib/contractorAlerts';
import toast from 'react-hot-toast';

const TRADES = ['general','electrical','plumbing','hvac','roofing','painting','flooring','drywall','landscaping','other'];

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'action', label: 'Action Required' },
  { value: 'expiring', label: 'Expiring Soon' },
  { value: 'compliant', label: 'Compliant' },
];

export default function ContractorsPage() {
  const { canEditDepartment, profile } = useAuth();
  const canEdit = canEditDepartment('contractors');
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await api.get('/contractors');
      setItems(data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => items.filter(c => {
    if (search) {
      const s = search.toLowerCase();
      const hay = `${c.name || ''} ${c.company_name || ''} ${c.contact_name || ''} ${c.trade || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    if (filter === 'all') return true;
    const summary = complianceSummary(c);
    if (filter === 'action') return summary.tone === 'red';
    if (filter === 'expiring') return summary.tone === 'amber';
    if (filter === 'compliant') return summary.tone === 'green';
    return true;
  }), [items, search, filter]);

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
      fetchAll();
    } catch (e) { toast.error(e?.response?.data?.error || 'Save failed'); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/contractors/${deleting.id}`);
      toast.success('Contractor deleted');
      setDeleting(null);
      fetchAll();
    } catch (e) { toast.error(e?.response?.data?.error || 'Delete failed'); }
  };

  return (
    <Layout title="Contractors">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="text" placeholder="Search by name, company, trade..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-72" />
          <div className="flex bg-gray-100 rounded-lg p-1">
            {FILTERS.map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${filter === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
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
                <th className="px-4 py-3 font-medium text-gray-500">Contractor</th>
                <th className="px-4 py-3 font-medium text-gray-500">Trade</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Compliance</th>
                <th className="px-4 py-3 font-medium text-gray-500">Rating</th>
                {canEdit && <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr></thead>
              <tbody>
                {filtered.map(c => {
                  const w9 = w9Badge(c);
                  const ins = insuranceBadge(c);
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/contractors/${c.id}`)}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div>{c.name}</div>
                        {c.company_name && c.company_name !== c.name && (
                          <div className="text-xs text-gray-500">{c.company_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{c.trade || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{c.contact_name || '—'}</div>
                        <div className="text-xs text-gray-500">{c.phone || c.email || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={w9.tone} label={w9.label} />
                          <Badge tone={ins.tone} label={ins.label} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.performance_score ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <span className="text-amber-500">★</span>
                            <span className="font-medium text-gray-900">{c.performance_score}</span>
                            <span className="text-gray-400 text-xs">/10</span>
                          </span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditing(c)} className="text-gray-400 hover:text-primary-500 p-1" title="Edit"><EditIcon /></button>
                            <button onClick={() => setDeleting(c)} className="text-gray-400 hover:text-danger-500 p-1" title="Delete"><TrashIcon /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== null && <ContractorFormModal contractor={editing} accountId={profile?.account_id} onClose={() => setEditing(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Contractor" message={`Delete "${deleting.name}"? Active project assignments will be cleared.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </Layout>
  );
}

export function ContractorFormModal({ contractor, accountId, onClose, onSave }) {
  const isEdit = !!contractor?.id;
  const [form, setForm] = useState({
    name: contractor?.name || '',
    company_name: contractor?.company_name || '',
    contact_name: contractor?.contact_name || '',
    trade: contractor?.trade || '',
    phone: contractor?.phone || '',
    email: contractor?.email || '',
    w9_status: contractor?.w9_status || 'missing',
    w9_url: contractor?.w9_url || '',
    insurance_url: contractor?.insurance_url || '',
    insurance_expiry: contractor?.insurance_expiry || '',
    agreement_signed: !!contractor?.agreement_signed,
    performance_score: contractor?.performance_score || '',
    notes: contractor?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({ w9: false, insurance: false });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const uploadDoc = async (kind, file) => {
    if (!file) return;
    if (!accountId) { toast.error('Account not loaded — please refresh'); return; }
    setUploading(u => ({ ...u, [kind]: true }));
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = `${accountId}/contractors/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('project-documents').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr) throw sErr;
      if (kind === 'w9') {
        set('w9_url', signed.signedUrl);
        if (form.w9_status === 'missing') set('w9_status', 'on_file');
      } else {
        set('insurance_url', signed.signedUrl);
      }
      toast.success(`${kind === 'w9' ? 'W9' : 'Insurance'} uploaded`);
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    }
    setUploading(u => ({ ...u, [kind]: false }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Contractor' : 'Add Contractor'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <input value={form.name} onChange={e => set('name', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
            <Field label="Company Name">
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person">
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
            <Field label="Trade">
              <select value={form.trade} onChange={e => set('trade', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 capitalize">
                <option value="">Select trade...</option>
                {TRADES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Compliance & Documents</h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="W9 Status">
                <select value={form.w9_status} onChange={e => set('w9_status', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="on_file">On File</option>
                  <option value="expired">Expired</option>
                  <option value="missing">Missing</option>
                </select>
              </Field>
              <Field label="Insurance Expiry">
                <input type="date" value={form.insurance_expiry || ''} onChange={e => set('insurance_expiry', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <DocUpload label="W9 Document" url={form.w9_url} uploading={uploading.w9}
                onUpload={(f) => uploadDoc('w9', f)} onClear={() => set('w9_url', '')} />
              <DocUpload label="Insurance Certificate" url={form.insurance_url} uploading={uploading.insurance}
                onUpload={(f) => uploadDoc('insurance', f)} onClear={() => set('insurance_url', '')} />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.agreement_signed} onChange={e => set('agreement_signed', e.target.checked)}
                className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500" />
              Agreement signed
            </label>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <Field label="Performance Score (1–10)">
              <input type="number" min={1} max={10} value={form.performance_score}
                onChange={e => set('performance_score', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </Field>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving || uploading.w9 || uploading.insurance}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Contractor'}
            </button>
          </div>
        </form>
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

function DocUpload({ label, url, uploading, onUpload, onClear }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline truncate flex-1">📎 View document</a>
        ) : (
          <span className="text-xs text-gray-400 flex-1">No file uploaded</span>
        )}
        <label className="cursor-pointer text-xs text-primary-600 hover:underline whitespace-nowrap">
          {uploading ? 'Uploading...' : url ? 'Replace' : 'Upload'}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
        {url && (
          <button type="button" onClick={onClear} className="text-xs text-gray-400 hover:text-danger-600">Remove</button>
        )}
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
