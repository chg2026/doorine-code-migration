import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, LoadingSpinner, ConfirmModal, EmptyState } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
  PHASE_STATUSES, PROJECT_STATUSES, projectStatusBadge, phaseStatusBadge,
  phaseRowAccent, computeOnTime, budgetHealth, fmtUsd, fmtDate,
} from '../../lib/projectStatus';

const DOC_KINDS = [
  { key: 'agreement_url', label: 'Signed Agreement', emoji: '📝' },
  { key: 'w9_url',        label: 'Contractor W9',    emoji: '🧾' },
  { key: 'insurance_url', label: 'Insurance Cert',   emoji: '🛡️' },
];

export default function ProjectDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEditDepartment, profile } = useAuth();
  const canEdit = canEditDepartment('construction');

  const [project, setProject] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [masterPhases, setMasterPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProject, setEditingProject] = useState(false);
  const [addingPhases, setAddingPhases] = useState(false);
  const [deletingPhase, setDeletingPhase] = useState(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editingPhase, setEditingPhase] = useState(null);

  const load = useCallback(async () => {
    try {
      const [pRes, cRes, mRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get('/contractors').catch(() => ({ data: [] })),
        api.get('/master-phases').catch(() => ({ data: [] })),
      ]);
      setProject(pRes.data);
      setContractors(cRes.data || []);
      setMasterPhases(mRes.data || []);
    } catch {
      toast.error('Could not load project');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const reload = async () => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data);
    } catch { /* ignore */ }
  };

  const updatePhase = async (phaseId, updates) => {
    try {
      await api.put(`/projects/phases/${phaseId}`, updates);
      await reload();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Phase update failed');
    }
  };

  const removePhase = async () => {
    try {
      await api.delete(`/projects/phases/${deletingPhase.id}`);
      toast.success('Phase removed');
      setDeletingPhase(null);
      await reload();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  const removeProject = async () => {
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted');
      navigate('/construction');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <Layout title="Project"><LoadingSpinner /></Layout>;
  if (!project) return <Layout title="Project"><EmptyState icon="🏗️" title="Project not found" description="It may have been deleted." /></Layout>;

  const phases     = project.construction_phases || [];
  const onTime     = computeOnTime(project);
  const totalBudget = Number(project.labor_budget || 0) + Number(project.material_budget || 0);
  const totalSpent  = Number(project.labor_spent || 0)  + Number(project.material_spent || 0);
  const totalHealth = budgetHealth(totalSpent, totalBudget);
  const laborHealth = budgetHealth(project.labor_spent, project.labor_budget);
  const matHealth   = budgetHealth(project.material_spent, project.material_budget);
  const statusBadge = projectStatusBadge(project.status);
  const statusLabel = (PROJECT_STATUSES.find(s => s.value === project.status)?.label) || (project.status || 'Planning');

  return (
    <Layout title={project.name}>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/construction" className="text-sm text-primary-600 hover:underline">← Back to projects</Link>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditingProject(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
              Edit Project
            </button>
            <button onClick={() => setDeletingProject(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg text-danger-600 hover:bg-danger-50 border border-transparent">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge}`}>
                {statusLabel}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${onTime.badgeClass}`}>
                {onTime.label}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
              {project.properties && (
                <Link to={`/properties/${project.properties.id}`} className="hover:underline">
                  🏠 {project.properties.name || project.properties.address}
                </Link>
              )}
              {project.units && <span>🏷️ {project.units.label}</span>}
              {project.contractors && (
                <Link to={`/contractors/${project.contractors.id}`} className="hover:underline">
                  👷 {project.contractors.name}
                </Link>
              )}
            </div>
            {project.description && (
              <p className="mt-3 text-sm text-gray-700 max-w-3xl whitespace-pre-wrap">{project.description}</p>
            )}
            <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-x-4">
              <span>Start: {fmtDate(project.start_date)}</span>
              <span>Target: {fmtDate(project.target_completion)}</span>
              {onTime.state !== 'no_dates' && onTime.state !== 'completed' && (
                <span>Elapsed: {Math.round(onTime.elapsedPct)}% · Complete: {Math.round(onTime.completionPct)}%</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Budget */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Budget</h2>
            <span className={`text-xs font-medium ${totalHealth.class}`}>{totalHealth.label}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{fmtUsd(totalSpent)}</span>
            <span className="text-sm text-gray-500">/ {fmtUsd(totalBudget)} total</span>
          </div>
          <BudgetBar spent={totalSpent} budget={totalBudget} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <BudgetLine label="Labor"    spent={project.labor_spent}    budget={project.labor_budget}    health={laborHealth} />
            <BudgetLine label="Materials" spent={project.material_spent} budget={project.material_budget} health={matHealth} />
          </div>
        </Card>

        {/* Completion */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Completion</h2>
            <span className="text-xs text-gray-500">{phases.filter(p => p.status === 'complete').length} of {phases.length} phases done</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{Math.round(project.overall_pct || 0)}%</span>
            <span className="text-sm text-gray-500">overall</span>
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${project.overall_pct || 0}%` }} />
          </div>
          {onTime.state === 'on_time' || onTime.state === 'delayed' ? (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>Time elapsed</span>
              <span>{Math.round(onTime.elapsedPct)}%</span>
            </div>
          ) : null}
          {(onTime.state === 'on_time' || onTime.state === 'delayed') && (
            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${onTime.state === 'delayed' ? 'bg-red-500' : 'bg-gray-400'}`}
                style={{ width: `${onTime.elapsedPct}%` }} />
            </div>
          )}
        </Card>
      </div>

      {/* Phases */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Phases</h2>
        {canEdit && (
          <button onClick={() => setAddingPhases(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white">
            + Add Phases
          </button>
        )}
      </div>

      {phases.length === 0 ? (
        <Card><EmptyState icon="📋" title="No phases yet"
          description="Add phases from your master library or as custom entries to start tracking work."
          action={canEdit ? '+ Add Phases' : null} onAction={() => setAddingPhases(true)} /></Card>
      ) : (
        <div className="space-y-2 mb-6">
          {phases.map(ph => (
            <PhaseRow key={ph.id} phase={ph} canEdit={canEdit} contractors={contractors}
              onChange={(updates) => updatePhase(ph.id, updates)}
              onEdit={() => setEditingPhase(ph)}
              onDelete={() => setDeletingPhase(ph)} />
          ))}
        </div>
      )}

      {/* Documents */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3 mt-8">Documents</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {DOC_KINDS.map(d => (
          <DocumentCard key={d.key} doc={d} url={project[d.key]} canEdit={canEdit}
            accountId={profile?.account_id} projectId={project.id}
            onChange={async (url) => {
              try { await api.put(`/projects/${id}`, { [d.key]: url }); await reload(); toast.success(url ? 'Document updated' : 'Document removed'); }
              catch (e) { toast.error(e?.response?.data?.error || 'Save failed'); }
            }} />
        ))}
      </div>

      {/* Quick actions placeholder for next tasks (invoices, addendums, notes) */}
      <Card className="p-4 mb-6 bg-gray-50/60">
        <p className="text-xs text-gray-500">Invoice logging, addendum approvals, and notes & activity arrive in the next steps of this rollout.</p>
      </Card>

      {/* Modals */}
      {editingProject && (
        <ProjectFormModal project={project} contractors={contractors}
          onClose={() => setEditingProject(false)}
          onSaved={async () => { setEditingProject(false); await reload(); }} />
      )}
      {addingPhases && (
        <AddPhasesModal projectId={id} masterPhases={masterPhases} contractors={contractors}
          existingNames={new Set(phases.map(p => (p.name || '').toLowerCase()))}
          onClose={() => setAddingPhases(false)}
          onSaved={async () => { setAddingPhases(false); await reload(); toast.success('Phases added'); }} />
      )}
      {editingPhase && (
        <EditPhaseModal phase={editingPhase} contractors={contractors}
          onClose={() => setEditingPhase(null)}
          onSaved={async () => { setEditingPhase(null); await reload(); toast.success('Phase updated'); }} />
      )}
      {deletingPhase && (
        <ConfirmModal title="Remove Phase" message={`Remove "${deletingPhase.name}" from this project?`}
          confirmLabel="Remove" danger onConfirm={removePhase} onCancel={() => setDeletingPhase(null)} />
      )}
      {deletingProject && (
        <ConfirmModal title="Delete Project" message={`Delete "${project.name}"? All phases will be removed too.`}
          confirmLabel="Delete" danger onConfirm={removeProject} onCancel={() => setDeletingProject(false)} />
      )}
    </Layout>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function BudgetBar({ spent, budget }) {
  const b = Number(budget || 0);
  const s = Number(spent || 0);
  if (b <= 0) return <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden" />;
  const pct = Math.min(100, (s / b) * 100);
  const over = s > b;
  return (
    <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${over ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-green-500'}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

function BudgetLine({ label, spent, budget, health }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-gray-600">{label}</span>
        <span className={`text-xs font-medium ${health.class}`}>{health.label}</span>
      </div>
      <div className="text-gray-900 font-medium">{fmtUsd(spent)} <span className="text-gray-400 font-normal">/ {fmtUsd(budget)}</span></div>
    </div>
  );
}

function PhaseRow({ phase, canEdit, contractors, onChange, onEdit, onDelete }) {
  const [pct, setPct] = useState(phase.completion_pct || 0);
  useEffect(() => { setPct(phase.completion_pct || 0); }, [phase.completion_pct]);
  const accent = phaseRowAccent(phase.status);
  const badge = phaseStatusBadge(phase.status);
  const statusLabel = (PHASE_STATUSES.find(s => s.value === phase.status)?.label) || 'Not Started';
  const phaseBudget = Number(phase.labor_budget || 0) + Number(phase.materials_budget || 0) + Number(phase.budget || 0);
  const phaseSpent  = Number(phase.labor_spent || 0)  + Number(phase.materials_spent || 0);
  const contractor  = phase.contractors || contractors.find(c => c.id === phase.contractor_id);

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-lg px-4 py-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{phase.name}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${badge}`}>
              {statusLabel}
            </span>
            {phase.payment_approved && <span className="text-[10px] font-medium text-green-700 bg-green-50 ring-1 ring-inset ring-green-600/20 rounded-full px-2 py-0.5">💰 Payment OK</span>}
            {phase.checklist_complete && <span className="text-[10px] font-medium text-blue-700 bg-blue-50 ring-1 ring-inset ring-blue-600/20 rounded-full px-2 py-0.5">✓ Checklist</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
            {contractor && <span>{contractor.name}</span>}
            {phaseBudget > 0 && <span>{fmtUsd(phaseSpent)} / {fmtUsd(phaseBudget)}</span>}
            {phase.estimated_start && <span>Start {fmtDate(phase.estimated_start)}</span>}
            {phase.estimated_completion && <span>Due {fmtDate(phase.estimated_completion)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="100" value={pct}
                onChange={e => setPct(parseInt(e.target.value))}
                onMouseUp={() => onChange({ completion_pct: pct, ...(pct === 100 && phase.status !== 'complete' ? { status: 'complete' } : {}) })}
                onTouchEnd={() => onChange({ completion_pct: pct, ...(pct === 100 && phase.status !== 'complete' ? { status: 'complete' } : {}) })}
                className="w-32 accent-primary-500" />
              <span className="text-sm font-medium text-gray-700 w-10 text-right">{pct}%</span>
            </div>
          ) : (
            <span className="text-sm text-gray-700">{pct}%</span>
          )}
          {canEdit && (
            <>
              <select value={phase.status || 'not_started'} onChange={e => onChange({ status: e.target.value })}
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                {PHASE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={onEdit} className="text-xs text-gray-500 hover:text-primary-600 px-2 py-1">Edit</button>
              <button onClick={onDelete} className="text-xs text-gray-500 hover:text-danger-600 px-2 py-1">Delete</button>
            </>
          )}
        </div>
      </div>
      {phase.notes && (
        <p className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{phase.notes}</p>
      )}
    </div>
  );
}

function DocumentCard({ doc, url, canEdit, accountId, projectId, onChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!accountId) { toast.error('Account not loaded'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${accountId}/${projectId}/${doc.key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('project-documents').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage.from('project-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr) throw sErr;
      await onChange(signed.signedUrl);
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    }
    setUploading(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{doc.emoji}</span>
          <span className="text-sm font-medium text-gray-900 truncate">{doc.label}</span>
        </div>
        {url ? (
          <span className="text-[10px] text-green-700 bg-green-50 ring-1 ring-inset ring-green-600/20 rounded-full px-2 py-0.5">On file</span>
        ) : (
          <span className="text-[10px] text-gray-500 bg-gray-50 ring-1 ring-inset ring-gray-500/10 rounded-full px-2 py-0.5">Missing</span>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">View document</a>
        ) : (
          <span className="text-gray-500">No document uploaded</span>
        )}
        {canEdit && (
          <div className="flex items-center gap-2">
            <label className="cursor-pointer text-xs text-primary-600 hover:underline">
              {uploading ? 'Uploading…' : (url ? 'Replace' : 'Upload')}
              <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
            </label>
            {url && (
              <button type="button" onClick={() => onChange('')} className="text-xs text-gray-500 hover:text-danger-600">Remove</button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Edit Project Modal (shared with ConstructionPage's create flow) ─────────

export function ProjectFormModal({ project, contractors, onClose, onSaved }) {
  const isEdit = !!project?.id;
  const { profile } = useAuth();
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({
    name: project?.name || '',
    description: project?.description || '',
    property_id: project?.property_id || '',
    unit_id: project?.unit_id || '',
    contractor_id: project?.contractor_id || '',
    status: project?.status || 'planning',
    start_date: project?.start_date ? project.start_date.split('T')[0] : '',
    target_completion: project?.target_completion ? project.target_completion.split('T')[0] : '',
    labor_budget: project?.labor_budget ?? '',
    material_budget: project?.material_budget ?? '',
    agreement_url: project?.agreement_url || '',
    w9_url: project?.w9_url || '',
    insurance_url: project?.insurance_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/properties').then(r => setProperties(r.data || [])).catch(() => setProperties([]));
  }, []);

  useEffect(() => {
    if (!form.property_id) { setUnits([]); return; }
    api.get(`/units?property_id=${form.property_id}`).then(r => setUnits(r.data || [])).catch(() => setUnits([]));
  }, [form.property_id]);

  const totalBudget = (parseFloat(form.labor_budget) || 0) + (parseFloat(form.material_budget) || 0);

  const uploadDoc = async (key, file) => {
    if (!profile?.account_id) { toast.error('Account not loaded'); return; }
    setUploading(key);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const folder = project?.id || 'new-projects';
      const path = `${profile.account_id}/${folder}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('project-documents').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage.from('project-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr) throw sErr;
      set(key, signed.signedUrl);
    } catch (err) { toast.error(err?.message || 'Upload failed'); }
    setUploading(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.unit_id === '') payload.unit_id = null;
      if (payload.contractor_id === '') payload.contractor_id = null;
      if (isEdit) {
        await api.put(`/projects/${project.id}`, payload);
        toast.success('Project updated');
      } else {
        await api.post('/projects', payload);
        toast.success('Project created');
      }
      await onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Project' : 'New Project'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Project Name" required>
              <input value={form.name} onChange={e => set('name', e.target.value)} required
                placeholder="e.g. 123 Main St — Kitchen Renovation"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </FormField>

            <FormField label="Scope Description">
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                placeholder="Brief scope of work overview…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Property">
                <select value={form.property_id} onChange={e => { set('property_id', e.target.value); set('unit_id', ''); }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="">Select property…</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name || p.address}</option>)}
                </select>
              </FormField>
              <FormField label="Unit">
                <select value={form.unit_id} onChange={e => set('unit_id', e.target.value)}
                  disabled={!form.property_id || units.length === 0}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">{form.property_id ? (units.length ? 'Select unit…' : 'No units') : 'Pick a property first'}</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Assigned Contractor">
                <select value={form.contractor_id} onChange={e => set('contractor_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="">— None —</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {PROJECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start Date">
                <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </FormField>
              <FormField label="Target Completion">
                <input type="date" value={form.target_completion} onChange={e => set('target_completion', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Labor Budget">
                <input type="number" min="0" step="0.01" value={form.labor_budget} onChange={e => set('labor_budget', e.target.value)} placeholder="$"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </FormField>
              <FormField label="Materials Budget">
                <input type="number" min="0" step="0.01" value={form.material_budget} onChange={e => set('material_budget', e.target.value)} placeholder="$"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </FormField>
            </div>

            <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg flex justify-between">
              <span>Total Budget</span>
              <span className="font-semibold text-gray-900">{fmtUsd(totalBudget)}</span>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Documents</h4>
              <div className="space-y-2">
                {DOC_KINDS.map(d => (
                  <DocUploadRow key={d.key} doc={d} url={form[d.key]}
                    uploading={uploading === d.key}
                    onUpload={(file) => uploadDoc(d.key, file)}
                    onClear={() => set(d.key, '')} />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function DocUploadRow({ doc, url, uploading, onUpload, onClear }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
      <span className="text-lg">{doc.emoji}</span>
      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{doc.label}</span>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">View</a>
          <button type="button" onClick={onClear} className="text-xs text-gray-500 hover:text-danger-600">Remove</button>
        </>
      ) : (
        <label className="cursor-pointer text-xs text-primary-600 hover:underline">
          {uploading ? 'Uploading…' : 'Upload'}
          <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

function AddPhasesModal({ projectId, masterPhases, contractors, existingNames, onClose, onSaved }) {
  const [picked, setPicked] = useState(new Set());
  const [custom, setCustom] = useState('');
  const [defaults, setDefaults] = useState({ contractor_id: '', labor_budget: '', materials_budget: '' });
  const [saving, setSaving] = useState(false);
  const available = masterPhases.filter(m => m.is_active !== false);

  const toggle = (name) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const names = [...picked];
    custom.split('\n').map(s => s.trim()).filter(Boolean).forEach(n => { if (!names.includes(n)) names.push(n); });
    const phases = names.map(name => {
      const row = { name };
      if (defaults.contractor_id) row.contractor_id = defaults.contractor_id;
      if (defaults.labor_budget) row.labor_budget = defaults.labor_budget;
      if (defaults.materials_budget) row.materials_budget = defaults.materials_budget;
      return row;
    });
    if (phases.length === 0) { toast.error('Pick at least one phase'); return; }
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/phases/bulk`, { phases });
      await onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Add failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Phases</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From Master Library</label>
            {available.length === 0 ? (
              <p className="text-sm text-gray-500">No phases in your master library yet. Manage them under Settings → Master Phases.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {available.map(m => {
                  const already = existingNames.has(m.name.toLowerCase());
                  const isPicked = picked.has(m.name);
                  return (
                    <label key={m.id}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer ${already ? 'opacity-50 cursor-not-allowed bg-gray-50' : isPicked ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" disabled={already} checked={isPicked} onChange={() => toggle(m.name)}
                        className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                      <span className="text-gray-900">{m.name}</span>
                      {already && <span className="text-[10px] text-gray-500 ml-auto">added</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Phase(s)</label>
            <textarea value={custom} onChange={e => setCustom(e.target.value)} rows={2}
              placeholder="One phase per line"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Apply defaults to all selected phases (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              <select value={defaults.contractor_id} onChange={e => setDefaults({ ...defaults, contractor_id: e.target.value })}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                <option value="">No contractor</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="number" placeholder="Labor $" value={defaults.labor_budget}
                onChange={e => setDefaults({ ...defaults, labor_budget: e.target.value })}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
              <input type="number" placeholder="Materials $" value={defaults.materials_budget}
                onChange={e => setDefaults({ ...defaults, materials_budget: e.target.value })}
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Phases'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPhaseModal({ phase, contractors, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: phase.name || '',
    contractor_id: phase.contractor_id || '',
    status: phase.status || 'not_started',
    completion_pct: phase.completion_pct ?? 0,
    labor_budget: phase.labor_budget ?? '',
    materials_budget: phase.materials_budget ?? '',
    labor_spent: phase.labor_spent ?? '',
    materials_spent: phase.materials_spent ?? '',
    estimated_start: phase.estimated_start ? phase.estimated_start.split('T')[0] : '',
    estimated_completion: phase.estimated_completion ? phase.estimated_completion.split('T')[0] : '',
    payment_approved: !!phase.payment_approved,
    checklist_complete: !!phase.checklist_complete,
    notes: phase.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.contractor_id === '') payload.contractor_id = null;
      await api.put(`/projects/phases/${phase.id}`, payload);
      await onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Phase</h3>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Phase Name" required>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contractor">
              <select value={form.contractor_id} onChange={e => set('contractor_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">— None —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                {PHASE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label={`Completion (${form.completion_pct}%)`}>
            <input type="range" min="0" max="100" value={form.completion_pct}
              onChange={e => set('completion_pct', parseInt(e.target.value))} className="w-full accent-primary-500" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Labor Budget"><input type="number" min="0" step="0.01" value={form.labor_budget} onChange={e => set('labor_budget', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
            <FormField label="Materials Budget"><input type="number" min="0" step="0.01" value={form.materials_budget} onChange={e => set('materials_budget', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
            <FormField label="Labor Spent"><input type="number" min="0" step="0.01" value={form.labor_spent} onChange={e => set('labor_spent', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
            <FormField label="Materials Spent"><input type="number" min="0" step="0.01" value={form.materials_spent} onChange={e => set('materials_spent', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
            <FormField label="Estimated Start"><input type="date" value={form.estimated_start} onChange={e => set('estimated_start', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
            <FormField label="Estimated Completion"><input type="date" value={form.estimated_completion} onChange={e => set('estimated_completion', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" /></FormField>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.payment_approved} onChange={e => set('payment_approved', e.target.checked)}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
              Payment approved
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.checklist_complete} onChange={e => set('checklist_complete', e.target.checked)}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
              Checklist complete
            </label>
          </div>
          <FormField label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </FormField>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-danger-500"> *</span>}</label>
      {children}
    </div>
  );
}
