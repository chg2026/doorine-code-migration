import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ConstructionPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('construction');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [properties, setProperties] = useState([]);
  const [contractors, setContractors] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, cRes, prRes] = await Promise.all([
        api.get('/projects'),
        api.get('/contractors').catch(() => ({ data: [] })),
        api.get('/properties').catch(() => ({ data: [] })),
      ]);
      setProjects(pRes.data || []);
      setContractors(cRes.data || []);
      setProperties(prRes.data || []);
    } catch { setProjects([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = projects.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.properties?.address || '').toLowerCase().includes(s);
  });

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        await api.put(`/projects/${editing.id}`, form);
        toast.success('Project updated');
      } else {
        await api.post('/projects', form);
        toast.success('Project created');
      }
      setEditing(null);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/projects/${deleting.id}`);
      toast.success('Project deleted');
      setDeleting(null);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  const handlePhaseUpdate = async (phaseId, updates) => {
    try {
      await api.put(`/projects/phases/${phaseId}`, updates);
      toast.success('Phase updated');
      fetchAll();
    } catch (e) {
      toast.error('Failed to update phase');
    }
  };

  const statusColor = (s) => {
    if (s === 'active' || s === 'in_progress') return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    if (s === 'completed') return 'bg-green-50 text-green-700 ring-green-600/20';
    if (s === 'on_hold') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    return 'bg-gray-50 text-gray-600 ring-gray-500/10';
  };

  return (
    <Layout title="Construction">
      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-72" />
        {canEdit && (
          <button onClick={() => setEditing({})}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + New Project
          </button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon="🏗️" title="No projects" description="Create your first construction project." action={canEdit ? '+ New Project' : null} onAction={() => setEditing({})} /></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id} className="overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{p.name || 'Untitled'}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset capitalize ${statusColor(p.status)}`}>
                        {(p.status || 'planning').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.properties?.address || 'No property'} {p.contractors?.name ? `· ${p.contractors.name}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-500 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Progress</div>
                      <div className="font-medium text-gray-900">{p.overall_pct ?? 0}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Budget</div>
                      <div className="font-medium text-gray-900">${((Number(p.labor_budget) || 0) + (Number(p.material_budget) || 0)).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {canEdit && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setEditing(p); }} className="text-gray-400 hover:text-primary-500 p-1">
                        <EditIcon />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleting(p); }} className="text-gray-400 hover:text-danger-500 p-1">
                        <TrashIcon />
                      </button>
                    </>
                  )}
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === p.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {expanded === p.id && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${p.overall_pct ?? 0}%` }} />
                    </div>
                  </div>
                  {(p.construction_phases || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No phases defined for this project.</p>
                  ) : (
                    <div className="space-y-2">
                      {p.construction_phases.map(ph => (
                        <div key={ph.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{ph.name}</div>
                            <div className="text-xs text-gray-500">Budget: ${(Number(ph.budget) || 0).toLocaleString()}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {canEdit ? (
                              <input type="range" min="0" max="100" value={ph.completion_pct || 0}
                                onChange={e => handlePhaseUpdate(ph.id, { completion_pct: parseInt(e.target.value) })}
                                className="w-24 accent-primary-500" />
                            ) : null}
                            <span className="text-sm font-medium text-gray-700 w-10 text-right">{ph.completion_pct || 0}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Labor:</span>{' '}
                      <span className="font-medium">${(Number(p.labor_spent) || 0).toLocaleString()} / ${(Number(p.labor_budget) || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Material:</span>{' '}
                      <span className="font-medium">${(Number(p.material_spent) || 0).toLocaleString()} / ${(Number(p.material_budget) || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing !== null && <ProjectFormModal project={editing} properties={properties} contractors={contractors} onClose={() => setEditing(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Project" message={`Delete "${deleting.name}"? All phases will also be removed.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </Layout>
  );
}

const DEFAULT_PHASES = ['Demo', 'Rough-In', 'Drywall', 'Finish', 'Final Inspection'];

function ProjectFormModal({ project, properties, contractors, onClose, onSave }) {
  const isEdit = !!project?.id;
  const [form, setForm] = useState({
    name: project?.name || '',
    property_id: project?.property_id || '',
    contractor_id: project?.contractor_id || '',
    status: project?.status || 'planning',
    labor_budget: project?.labor_budget || '',
    material_budget: project?.material_budget || '',
    start_date: project?.start_date || '',
    target_completion: project?.target_completion || '',
  });
  const [useDefaultPhases, setUseDefaultPhases] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (!isEdit && useDefaultPhases) payload.phases = DEFAULT_PHASES;
    await onSave(payload);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Project' : 'New Project'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Contractor</label>
              <select value={form.contractor_id} onChange={e => set('contractor_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Select contractor...</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Labor Budget</label>
              <input type="number" value={form.labor_budget} onChange={e => set('labor_budget', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material Budget</label>
              <input type="number" value={form.material_budget} onChange={e => set('material_budget', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="$" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.start_date ? form.start_date.split('T')[0] : ''} onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Completion</label>
              <input type="date" value={form.target_completion ? form.target_completion.split('T')[0] : ''} onChange={e => set('target_completion', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={useDefaultPhases} onChange={e => setUseDefaultPhases(e.target.checked)}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
              Add default phases (Demo, Rough-In, Drywall, Finish, Final Inspection)
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
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
