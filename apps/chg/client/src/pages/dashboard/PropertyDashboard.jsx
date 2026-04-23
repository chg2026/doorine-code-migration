import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, LoadingSpinner, ConfirmModal, EmptyState } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const PROPERTY_TYPE_LABEL = {
  single_family: 'Single Family',
  duplex: 'Duplex',
  triplex: 'Triplex',
  multi_unit: 'Multi-Unit / Apartment',
  commercial: 'Commercial',
};

const STATUS_LABEL = {
  pre_construction: 'Pre-Construction',
  under_construction: 'Under Construction',
  completed: 'Completed',
  occupied: 'Occupied',
  active: 'Active',
  vacant: 'Vacant',
};

const STATUS_COLORS = {
  pre_construction: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  under_construction: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-green-50 text-green-700 ring-green-600/20',
  occupied: 'bg-green-50 text-green-700 ring-green-600/20',
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  vacant: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

const fmtUsd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function PropertyDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('property_management');

  const [property, setProperty] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitStats, setUnitStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingUnit, setEditingUnit] = useState(null);
  const [deletingUnit, setDeletingUnit] = useState(null);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: prop }, { data: us }] = await Promise.all([
        api.get(`/properties/${id}`),
        api.get(`/units?property_id=${id}`),
      ]);
      setProperty(prop);
      setUnits(us || []);
      const stats = {};
      await Promise.all((us || []).map(async (u) => {
        try {
          const { data } = await api.get(`/units/${u.id}/stats`);
          stats[u.id] = data;
        } catch { stats[u.id] = null; }
      }));
      setUnitStats(stats);
    } catch {
      toast.error('Could not load property');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const renameUnit = async () => {
    if (!editingUnit?.label?.trim()) return;
    try {
      await api.put(`/units/${editingUnit.id}`, { label: editingUnit.label });
      toast.success('Unit renamed');
      setEditingUnit(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Rename failed'); }
  };

  const removeUnit = async () => {
    try {
      await api.delete(`/units/${deletingUnit.id}`);
      toast.success('Unit deleted');
      setDeletingUnit(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Delete failed'); }
  };

  const addUnit = async () => {
    if (!newUnitLabel.trim()) return;
    try {
      await api.post('/units', { property_id: id, label: newUnitLabel.trim(), sort_order: units.length });
      toast.success('Unit added');
      setAddingUnit(false);
      setNewUnitLabel('');
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Add failed'); }
  };

  if (loading) return <Layout title="Property"><LoadingSpinner /></Layout>;
  if (!property) return <Layout title="Property"><EmptyState icon="🏠" title="Property not found" description="This property may have been deleted." /></Layout>;

  const statusKey = property.status || 'active';
  const totals = units.reduce((acc, u) => {
    const s = unitStats[u.id];
    if (s) {
      acc.budget += s.total_budget || 0;
      acc.spent += s.total_spent || 0;
      acc.projects += s.project_count || 0;
      acc.completion += s.completion_pct || 0;
    }
    return acc;
  }, { budget: 0, spent: 0, projects: 0, completion: 0 });
  const avgCompletion = units.length ? Math.round(totals.completion / units.length) : 0;

  return (
    <Layout title={property.name || property.address}>
      <div className="mb-4">
        <Link to="/properties" className="text-sm text-primary-600 hover:underline">← Back to properties</Link>
      </div>

      {/* Header card */}
      <Card className="p-6 mb-6">
        <div className="flex items-start gap-6 flex-wrap">
          {property.photo_url ? (
            <img src={property.photo_url} alt={property.name || 'Property'} className="w-32 h-32 rounded-lg object-cover border border-gray-200" />
          ) : (
            <div className="w-32 h-32 rounded-lg bg-gray-100 flex items-center justify-center text-4xl">🏠</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">{property.name || property.address}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {[property.street || property.address, property.city, property.state, property.zip].filter(Boolean).join(', ') || '—'}
                </p>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 flex-wrap">
                  <span>{PROPERTY_TYPE_LABEL[property.property_type] || property.property_type || 'Unknown type'}</span>
                  <span>•</span>
                  <span>{units.length} unit{units.length === 1 ? '' : 's'}</span>
                  <span>•</span>
                  <span>Purchased {fmtDate(property.purchase_date || property.acquisition_date)}</span>
                  {property.purchase_price && <><span>•</span><span>{fmtUsd(property.purchase_price)}</span></>}
                </div>
              </div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[statusKey] || STATUS_COLORS.active}`}>
                {STATUS_LABEL[statusKey] || statusKey}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Combined cost summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryStat label="Total Units" value={units.length} />
        <SummaryStat label="Active Projects" value={totals.projects} />
        <SummaryStat label="Combined Budget" value={fmtUsd(totals.budget)} />
        <SummaryStat label="Combined Spent" value={fmtUsd(totals.spent)} sub={`${avgCompletion}% avg complete`} />
      </div>

      {/* Units */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Units</h2>
        {canEdit && (
          <button onClick={() => setAddingUnit(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white">+ Add Unit</button>
        )}
      </div>

      {units.length === 0 ? (
        <Card><EmptyState icon="🏷️" title="No units yet" description="Add a unit to start tracking projects." /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map(u => {
            const s = unitStats[u.id] || {};
            const onTime = s.on_time !== false;
            const isEditing = editingUnit?.id === u.id;
            return (
              <Card key={u.id} className={`p-5 ${isEditing ? '' : 'hover:shadow-md transition-shadow cursor-pointer'}`}
                onClick={() => { if (!isEditing) navigate(`/properties/${id}/units/${u.id}`); }}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  {editingUnit?.id === u.id ? (
                    <div className="flex-1 flex gap-2">
                      <input value={editingUnit.label} onChange={e => setEditingUnit({ ...editingUnit, label: e.target.value })}
                        autoFocus
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500" />
                      <button onClick={renameUnit} className="text-xs px-2 py-1 bg-primary-500 text-white rounded">Save</button>
                      <button onClick={() => setEditingUnit(null)} className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold text-gray-900">{u.label}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${onTime ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}>
                        {onTime ? 'On Time' : 'Delayed'}
                      </span>
                    </>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Active projects</span>
                    <span className="font-medium text-gray-900">{s.active_count ?? 0}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Completion</span>
                      <span className="font-medium text-gray-900">{s.completion_pct ?? 0}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${s.completion_pct ?? 0}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Budget / Spent</span>
                    <span className="font-medium text-gray-900">{fmtUsd(s.total_budget)} / {fmtUsd(s.total_spent)}</span>
                  </div>
                </div>
                {canEdit && !isEditing && (
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditingUnit({ id: u.id, label: u.label })} className="text-xs text-gray-500 hover:text-primary-600">Rename</button>
                    <button onClick={() => setDeletingUnit(u)} className="text-xs text-gray-500 hover:text-danger-600">Delete</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {addingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Unit</h3>
            <input value={newUnitLabel} onChange={e => setNewUnitLabel(e.target.value)} autoFocus
              placeholder="Unit label (e.g. Upper Unit, Unit 1A)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setAddingUnit(false); setNewUnitLabel(''); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={addUnit} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}

      {deletingUnit && (
        <ConfirmModal title="Delete Unit" message={`Delete "${deletingUnit.label}"? Projects assigned to this unit will be unassigned.`}
          confirmLabel="Delete" danger onConfirm={removeUnit} onCancel={() => setDeletingUnit(null)} />
      )}
    </Layout>
  );
}

function SummaryStat({ label, value, sub }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}
