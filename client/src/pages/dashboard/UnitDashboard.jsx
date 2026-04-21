import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, LoadingSpinner, EmptyState } from '../../components/ui';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { computeOnTime, projectStatusBadge, PROJECT_STATUSES, fmtUsd } from '../../lib/projectStatus';

export default function UnitDashboard() {
  const { propId, unitId } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [unit, setUnit] = useState(null);
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: prop }, { data: units }, { data: s }, { data: allProjects }] = await Promise.all([
        api.get(`/properties/${propId}`),
        api.get(`/units?property_id=${propId}`),
        api.get(`/units/${unitId}/stats`),
        api.get('/projects'),
      ]);
      setProperty(prop);
      setUnit((units || []).find(u => u.id === unitId) || null);
      setStats(s);
      setProjects((allProjects || []).filter(p => p.unit_id === unitId));
    } catch {
      toast.error('Could not load unit');
    }
    setLoading(false);
  }, [propId, unitId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (loading) return <Layout title="Unit"><LoadingSpinner /></Layout>;
  if (!unit) return <Layout title="Unit"><EmptyState icon="🏷️" title="Unit not found" description="This unit may have been deleted." /></Layout>;

  const onTime = stats?.on_time !== false;

  return (
    <Layout title={`${unit.label}${property ? ` · ${property.name || property.address}` : ''}`}>
      <div className="mb-4">
        <Link to={`/properties/${propId}`} className="text-sm text-primary-600 hover:underline">← Back to property</Link>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{unit.label}</h1>
            {property && (
              <p className="text-sm text-gray-600 mt-1">{property.name || property.address}</p>
            )}
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${onTime ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}>
            {onTime ? 'On Time' : 'Delayed'}
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Projects" value={stats?.project_count ?? 0} />
        <Stat label="Active" value={stats?.active_count ?? 0} />
        <Stat label="Budget / Spent" value={`${fmtUsd(stats?.total_budget)} / ${fmtUsd(stats?.total_spent)}`} />
        <Stat label="Combined Completion" value={`${stats?.completion_pct ?? 0}%`} />
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Projects on this unit</h2>
      {projects.length === 0 ? (
        <Card><EmptyState icon="🏗️" title="No projects yet" description="Create a project from the Construction page and assign it to this unit." /></Card>
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const sb = projectStatusBadge(p.status);
            const ot = computeOnTime(p);
            const totalBudget = (Number(p.labor_budget) || 0) + (Number(p.material_budget) || 0);
            const totalSpent  = (Number(p.labor_spent) || 0)  + (Number(p.material_spent) || 0);
            const isOpen = expanded.has(p.id);
            const phases = p.construction_phases || [];
            return (
              <Card key={p.id}>
                <div className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggle(p.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${sb}`}>
                        {PROJECT_STATUSES.find(s => s.value === p.status)?.label || p.status}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ot.badgeClass}`}>
                        {ot.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {p.contractors?.name ? `${p.contractors.name} · ` : ''}{Math.round(p.overall_pct || 0)}% · {fmtUsd(totalSpent)} / {fmtUsd(totalBudget)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/projects/${p.id}`); }}
                      className="text-xs text-primary-600 hover:underline px-2 py-1">Open</button>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                    {phases.length === 0 ? (
                      <p className="text-sm text-gray-500">No phases yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {phases.map(ph => (
                          <li key={ph.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{ph.name}</span>
                            <span className="text-xs text-gray-500">{ph.completion_pct ?? 0}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </Card>
  );
}
