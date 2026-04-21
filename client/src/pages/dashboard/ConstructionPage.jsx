import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { ProjectFormModal } from './ProjectDashboard';
import { computeOnTime, projectStatusBadge, PROJECT_STATUSES, fmtUsd } from '../../lib/projectStatus';

export default function ConstructionPage() {
  const navigate = useNavigate();
  const { canEditDepartment, isSuperAdmin, isAccountAdmin } = useAuth();
  const canEdit = canEditDepartment('construction');
  const canManageLib = canEdit || isSuperAdmin || isAccountAdmin;

  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api.get('/projects'),
        api.get('/contractors').catch(() => ({ data: [] })),
      ]);
      setProjects(pRes.data || []);
      setContractors(cRes.data || []);
    } catch { setProjects([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s)
      || (p.properties?.name || p.properties?.address || '').toLowerCase().includes(s)
      || (p.contractors?.name || '').toLowerCase().includes(s);
  });

  return (
    <Layout title="Construction">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="all">All statuses</option>
            {PROJECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {canManageLib && (
            <Link to="/settings/master-phases"
              className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
              Master Phases
            </Link>
          )}
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + New Project
            </button>
          )}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon="🏗️" title="No projects" description="Create your first construction project."
          action={canEdit ? '+ New Project' : null} onAction={() => setShowForm(true)} /></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const onTime = computeOnTime(p);
            const sb = projectStatusBadge(p.status);
            const totalBudget = (Number(p.labor_budget) || 0) + (Number(p.material_budget) || 0);
            const totalSpent  = (Number(p.labor_spent) || 0)  + (Number(p.material_spent) || 0);
            const phaseCount  = (p.construction_phases || []).length;
            return (
              <Card key={p.id} className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{p.name || 'Untitled'}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${sb}`}>
                        {(PROJECT_STATUSES.find(s => s.value === p.status)?.label) || (p.status || 'planning')}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${onTime.badgeClass}`}>
                        {onTime.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      {p.properties && <span>🏠 {p.properties.name || p.properties.address}</span>}
                      {p.units && <span>🏷️ {p.units.label}</span>}
                      {p.contractors && <span>👷 {p.contractors.name}</span>}
                      <span>{phaseCount} phase{phaseCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm flex-shrink-0">
                    <div className="text-right min-w-[80px]">
                      <div className="text-xs text-gray-400">Progress</div>
                      <div className="font-medium text-gray-900">{Math.round(p.overall_pct || 0)}%</div>
                      <div className="mt-1 w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500" style={{ width: `${p.overall_pct || 0}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Spent / Budget</div>
                      <div className="font-medium text-gray-900">{fmtUsd(totalSpent)} <span className="text-gray-400 font-normal">/ {fmtUsd(totalBudget)}</span></div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <ProjectFormModal contractors={contractors}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await fetchAll(); }} />
      )}
    </Layout>
  );
}
