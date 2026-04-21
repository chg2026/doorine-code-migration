import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { ProjectFormModal } from './ProjectDashboard';
import { computeOnTime, projectStatusBadge, PROJECT_STATUSES, fmtUsd, fmtDate } from '../../lib/projectStatus';

const SORT_OPTIONS = [
  { value: 'created_desc',  label: 'Newest first' },
  { value: 'name_asc',      label: 'Name (A→Z)' },
  { value: 'budget_desc',   label: 'Largest budget' },
  { value: 'progress_asc',  label: 'Least progress' },
  { value: 'progress_desc', label: 'Most progress' },
  { value: 'target_asc',    label: 'Soonest target' },
];

export default function ConstructionPage() {
  const navigate = useNavigate();
  const { canEditDepartment, isSuperAdmin, isAccountAdmin } = useAuth();
  const canEdit = canEditDepartment('construction');
  const canManageLib = isSuperAdmin || isAccountAdmin;

  const [projects, setProjects] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [contractorFilter, setContractorFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [propertyStatusFilter, setPropertyStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all'); // all | on_time | delayed
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('created_desc');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, propRes, cRes] = await Promise.all([
        api.get('/projects'),
        api.get('/projects/lookups/properties').catch(() => ({ data: [] })),
        api.get('/projects/lookups/contractors').catch(() => ({ data: [] })),
      ]);
      setProjects(pRes.data || []);
      setProperties(propRes.data || []);
      setContractors(cRes.data || []);
    } catch { setProjects([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Decorate every project with totals + on-time so we can filter/sort once.
  const decorated = useMemo(() => projects.map(p => {
    const labor    = Number(p.labor_budget || 0);
    const material = Number(p.material_budget || 0);
    const totalBudget = labor + material;
    const totalSpent  = Number(p.labor_spent || 0) + Number(p.material_spent || 0);
    return { ...p, _totalBudget: totalBudget, _totalSpent: totalSpent, _onTime: computeOnTime(p) };
  }), [projects]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return decorated.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (contractorFilter !== 'all' && p.contractor_id !== contractorFilter) return false;
      if (propertyFilter !== 'all' && p.property_id !== propertyFilter) return false;
      if (propertyStatusFilter !== 'all') {
        const prop = properties.find(pr => pr.id === p.property_id);
        if (!prop || (prop.status || 'vacant') !== propertyStatusFilter) return false;
      }
      if (healthFilter !== 'all' && p._onTime.state !== healthFilter) return false;
      if (s) {
        const hay = `${p.name || ''} ${p.properties?.name || ''} ${p.properties?.address || ''} ${p.contractors?.name || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      const start = p.start_date ? String(p.start_date).slice(0, 10) : '';
      if (from && (!start || start < from)) return false;
      if (to && (!start || start > to)) return false;
      return true;
    });
  }, [decorated, search, statusFilter, contractorFilter, propertyFilter, propertyStatusFilter, healthFilter, from, to, properties]);

  // Distinct property statuses present on this account, plus standard ones.
  const propertyStatuses = useMemo(() => {
    const set = new Set(['vacant', 'occupied', 'under_renovation', 'sold']);
    properties.forEach(p => p.status && set.add(p.status));
    return Array.from(set);
  }, [properties]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case 'name_asc':      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'budget_desc':   arr.sort((a, b) => b._totalBudget - a._totalBudget); break;
      case 'progress_asc':  arr.sort((a, b) => (a.overall_pct || 0) - (b.overall_pct || 0)); break;
      case 'progress_desc': arr.sort((a, b) => (b.overall_pct || 0) - (a.overall_pct || 0)); break;
      case 'target_asc':    arr.sort((a, b) => (a.target_completion || '9999').localeCompare(b.target_completion || '9999')); break;
      default:              arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return arr;
  }, [filtered, sort]);

  // Top-level overview metrics use the *unfiltered* set so the cards always
  // reflect the user's whole portfolio rather than the active filter slice.
  const overview = useMemo(() => {
    const active = decorated.filter(p => p.status && p.status !== 'complete' && p.status !== 'on_hold');
    const totalBudget = decorated.reduce((s, p) => s + p._totalBudget, 0);
    const totalSpent  = decorated.reduce((s, p) => s + p._totalSpent, 0);
    const onTime = active.filter(p => p._onTime.state === 'on_time').length;
    const delayed = active.filter(p => p._onTime.state === 'delayed').length;
    return { active: active.length, totalBudget, totalSpent, onTime, delayed };
  }, [decorated]);

  // Per-property rollups for the grid: count of projects, sum of budget/spent.
  const propertyCards = useMemo(() => {
    const map = new Map();
    properties.forEach(prop => {
      map.set(prop.id, { ...prop, projects: 0, budget: 0, spent: 0, progress: 0 });
    });
    decorated.forEach(p => {
      if (!p.property_id) return;
      const card = map.get(p.property_id);
      if (!card) return;
      card.projects += 1;
      card.budget   += p._totalBudget;
      card.spent    += p._totalSpent;
      card.progress += Number(p.overall_pct || 0);
    });
    return Array.from(map.values()).map(c => ({
      ...c,
      avgProgress: c.projects > 0 ? Math.round(c.progress / c.projects) : 0,
    })).sort((a, b) => b.projects - a.projects || (a.name || '').localeCompare(b.name || ''));
  }, [decorated, properties]);

  return (
    <Layout title="Construction">
      {loading ? <LoadingSpinner /> : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Active Projects"     value={overview.active}                 tint="bg-blue-50 text-blue-700" />
            <SummaryCard label="Total Budget"        value={fmtUsd(overview.totalBudget)}    tint="bg-gray-50 text-gray-800" />
            <SummaryCard label="Total Spent"         value={fmtUsd(overview.totalSpent)}     tint="bg-amber-50 text-amber-800" sub={`${overview.totalBudget > 0 ? Math.round((overview.totalSpent / overview.totalBudget) * 100) : 0}% of budget`} />
            <SummaryCard label="On-Time / Delayed"   value={`${overview.onTime} / ${overview.delayed}`} tint={overview.delayed > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'} />
          </div>

          {/* Properties */}
          {propertyCards.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Properties</h2>
                <span className="text-xs text-gray-500">{propertyCards.length} total</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {propertyCards.map(c => (
                  <Link key={c.id} to={`/properties/${c.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition">
                    <div className="text-sm font-semibold text-gray-900 truncate">{c.name || c.address || 'Untitled property'}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{c.street || c.city || ''}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div><div className="font-semibold text-gray-900">{c.projects}</div><div className="text-gray-400">Projects</div></div>
                      <div><div className="font-semibold text-gray-900">{fmtUsd(c.spent)}</div><div className="text-gray-400">Spent</div></div>
                      <div><div className="font-semibold text-gray-900">{c.avgProgress}%</div><div className="text-gray-400">Avg progress</div></div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Projects table + filters */}
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
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

          <Card className="p-3 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input type="text" placeholder="Search by project, address, contractor…" value={search} onChange={e => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 lg:col-span-2" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="all">All statuses</option>
                {PROJECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="all">All health</option>
                <option value="on_time">On-time only</option>
                <option value="delayed">Delayed only</option>
              </select>
              <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="all">All properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name || p.address}</option>)}
              </select>
              <select value={propertyStatusFilter} onChange={e => setPropertyStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="all">Any property status</option>
                {propertyStatuses.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
              <select value={contractorFilter} onChange={e => setContractorFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="all">All contractors</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="Start from" />
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="Start to" />
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </Card>

          {sorted.length === 0 ? (
            <Card><EmptyState icon="🏗️"
              title={projects.length === 0 ? 'No projects' : 'No projects match these filters'}
              description={projects.length === 0 ? 'Create your first construction project to get started.' : 'Try adjusting search or filters.'}
              action={projects.length === 0 && canEdit ? '+ New Project' : null} onAction={() => setShowForm(true)} /></Card>
          ) : (
            <>
              {/* Table on md+, card list on mobile */}
              <Card className="hidden md:block overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Project</th>
                      <th className="text-left px-3 py-2 font-medium">Property / Contractor</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Progress</th>
                      <th className="text-right px-3 py-2 font-medium">Spent / Budget</th>
                      <th className="text-left px-3 py-2 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 truncate">{p.name || 'Untitled'}</div>
                          <div className="text-xs text-gray-500 truncate">{(p.construction_phases || []).length} phase{(p.construction_phases || []).length === 1 ? '' : 's'}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">
                          <div className="truncate">{p.properties?.name || p.properties?.address || '—'}</div>
                          <div className="text-gray-400 truncate">{p.contractors?.name || 'No contractor'}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${projectStatusBadge(p.status)}`}>
                              {(PROJECT_STATUSES.find(s => s.value === p.status)?.label) || (p.status || 'planning')}
                            </span>
                            <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${p._onTime.badgeClass}`}>
                              {p._onTime.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="font-medium text-gray-900">{Math.round(p.overall_pct || 0)}%</div>
                          <div className="mt-1 ml-auto w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500" style={{ width: `${p.overall_pct || 0}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="font-medium text-gray-900">{fmtUsd(p._totalSpent)}</div>
                          <div className="text-xs text-gray-400">/ {fmtUsd(p._totalBudget)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(p.target_completion) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <div className="md:hidden space-y-2">
                {sorted.map(p => (
                  <Card key={p.id} className="p-4 cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium text-gray-900 truncate">{p.name || 'Untitled'}</div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${projectStatusBadge(p.status)}`}>
                        {(PROJECT_STATUSES.find(s => s.value === p.status)?.label) || (p.status || 'planning')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate">{p.properties?.name || p.properties?.address || '—'} · {p.contractors?.name || 'No contractor'}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                      <span>{Math.round(p.overall_pct || 0)}% complete</span>
                      <span>{fmtUsd(p._totalSpent)} / {fmtUsd(p._totalBudget)}</span>
                    </div>
                    <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500" style={{ width: `${p.overall_pct || 0}%` }} />
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showForm && (
        <ProjectFormModal contractors={contractors}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await fetchAll(); }} />
      )}
    </Layout>
  );
}

function SummaryCard({ label, value, sub, tint }) {
  return (
    <Card className="p-4">
      <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${tint || 'bg-gray-50 text-gray-700'}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </Card>
  );
}
