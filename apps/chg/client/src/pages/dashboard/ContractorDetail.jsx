import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, LoadingSpinner, EmptyState, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Badge, w9Badge, insuranceBadge, agreementBadge, complianceSummary } from '../../lib/contractorAlerts';
import { ContractorFormModal } from './ContractorsPage';
import toast from 'react-hot-toast';

const TRADE_LABEL = (t) => (t || '').replace(/_/g, ' ');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ContractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEditDepartment, profile } = useAuth();
  const canEdit = canEditDepartment('contractors');

  const [contractor, setContractor] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: c }, { data: p }] = await Promise.all([
        api.get(`/contractors/${id}`),
        api.get(`/contractors/${id}/projects`).catch(() => ({ data: [] })),
      ]);
      setContractor(c);
      setProjects(p || []);
    } catch {
      toast.error('Could not load contractor');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      await api.put(`/contractors/${id}`, form);
      toast.success('Contractor updated');
      setEditing(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Save failed'); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/contractors/${id}`);
      toast.success('Contractor deleted');
      navigate('/contractors');
    } catch (e) { toast.error(e?.response?.data?.error || 'Delete failed'); }
  };

  if (loading) return <Layout title="Contractor"><LoadingSpinner /></Layout>;
  if (!contractor) return <Layout title="Contractor"><EmptyState icon="🔧" title="Contractor not found" description="This contractor may have been deleted." /></Layout>;

  const w9 = w9Badge(contractor);
  const ins = insuranceBadge(contractor);
  const agr = agreementBadge(contractor);
  const summary = complianceSummary(contractor);

  return (
    <Layout title={contractor.name}>
      <div className="mb-4 flex justify-between items-center">
        <Link to="/contractors" className="text-sm text-primary-600 hover:underline">← Back to contractors</Link>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white">Edit</button>
            <button onClick={() => setDeleting(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-danger-600 hover:bg-danger-50">Delete</button>
          </div>
        )}
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{contractor.name}</h1>
            {contractor.company_name && <p className="text-sm text-gray-600 mt-1">{contractor.company_name}</p>}
            <p className="text-sm text-gray-500 mt-1 capitalize">{TRADE_LABEL(contractor.trade) || 'Trade not set'}</p>
          </div>
          <Badge tone={summary.tone} label={summary.label} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
          <Info label="Contact Person" value={contractor.contact_name} />
          <Info label="Phone" value={contractor.phone} />
          <Info label="Email" value={contractor.email} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Compliance</h2>
          <div className="space-y-3">
            <Row label="W9">
              <div className="flex items-center gap-2">
                <Badge tone={w9.tone} label={w9.label} />
                {contractor.w9_url && <a href={contractor.w9_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">View</a>}
              </div>
            </Row>
            <Row label="Insurance">
              <div className="flex items-center gap-2">
                <Badge tone={ins.tone} label={ins.label} />
                {contractor.insurance_expiry && <span className="text-xs text-gray-500">expires {fmtDate(contractor.insurance_expiry)}</span>}
                {contractor.insurance_url && <a href={contractor.insurance_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">View</a>}
              </div>
            </Row>
            <Row label="Agreement">
              <Badge tone={agr.tone} label={agr.label} />
            </Row>
            <Row label="Performance">
              {contractor.performance_score ? (
                <span className="text-sm font-medium text-gray-900">
                  <span className="text-amber-500">★</span> {contractor.performance_score}/10
                </span>
              ) : <span className="text-sm text-gray-400">Not rated</span>}
            </Row>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Notes</h2>
          {contractor.notes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contractor.notes}</p>
          ) : (
            <p className="text-sm text-gray-400">No notes</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Project History</h2>
          <span className="text-xs text-gray-500">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
        </div>
        {projects.length === 0 ? (
          <EmptyState icon="🏗️" title="No projects yet" description="Projects assigned to this contractor will appear here." />
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map(p => (
              <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{p.name || 'Untitled project'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtDate(p.start_date)} → {fmtDate(p.target_completion)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">{p.overall_pct ?? 0}%</span>
                  <Badge tone={p.status === 'completed' ? 'green' : p.status === 'cancelled' ? 'gray' : 'amber'} label={(p.status || 'active').replace(/_/g, ' ')} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <ContractorFormModal contractor={contractor} accountId={profile?.account_id} onClose={() => setEditing(false)} onSave={handleSave} />}
      {deleting && <ConfirmModal title="Delete Contractor" message={`Delete "${contractor.name}"? Active project assignments will be cleared.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleting(false)} />}
    </Layout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-1">{value || '—'}</p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-600">{label}</span>
      <div>{children}</div>
    </div>
  );
}
