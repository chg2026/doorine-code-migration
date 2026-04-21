import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, LoadingSpinner, EmptyState } from '../../components/ui';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const fmtUsd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function UnitDashboard() {
  const { propId, unitId } = useParams();
  const [property, setProperty] = useState(null);
  const [unit, setUnit] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: prop }, { data: units }, { data: s }] = await Promise.all([
        api.get(`/properties/${propId}`),
        api.get(`/units?property_id=${propId}`),
        api.get(`/units/${unitId}/stats`),
      ]);
      setProperty(prop);
      setUnit((units || []).find(u => u.id === unitId) || null);
      setStats(s);
    } catch {
      toast.error('Could not load unit');
    }
    setLoading(false);
  }, [propId, unitId]);

  useEffect(() => { load(); }, [load]);

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
        <Stat label="Completion" value={`${stats?.completion_pct ?? 0}%`} />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Projects assigned to this unit</h2>
        </div>
        <EmptyState icon="🏗️" title="No projects yet" description="Construction projects assigned to this unit will appear here." />
      </Card>
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
