import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner, ConfirmModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function MasterPhasesPage() {
  const { isSuperAdmin, isAccountAdmin, canEditDepartment } = useAuth();
  const canManage = isSuperAdmin || isAccountAdmin || canEditDepartment('construction');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/master-phases');
      setItems(data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.post('/master-phases', { name: newName.trim() });
      setNewName(''); setAdding(false);
      toast.success('Phase added');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Add failed');
    }
  };

  const saveEdit = async (id) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await api.put(`/master-phases/${id}`, { name: editName.trim() });
      setEditingId(null); setEditName('');
      toast.success('Phase renamed');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Rename failed');
    }
  };

  const toggleActive = async (item) => {
    try {
      await api.put(`/master-phases/${item.id}`, { is_active: !item.is_active });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Update failed');
    }
  };

  const removeItem = async () => {
    try {
      await api.delete(`/master-phases/${deleting.id}`);
      setDeleting(null);
      toast.success('Phase removed');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <Layout title="Master Phase Library">
      <div className="mb-4">
        <Link to="/construction" className="text-sm text-primary-600 hover:underline">← Back to construction</Link>
      </div>

      <Card className="p-5 mb-4">
        <p className="text-sm text-gray-700">
          The master phase library is the menu of phases you can quickly add to any project. Edit it to match how your team works — disabled phases stay hidden from the project picker but keep historical references intact.
        </p>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Phases ({items.length})</h2>
        {canManage && (
          <button onClick={() => setAdding(v => !v)}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white">
            {adding ? 'Cancel' : '+ Add Phase'}
          </button>
        )}
      </div>

      {adding && (
        <Card className="p-4 mb-3">
          <form onSubmit={create} className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
              placeholder="Phase name (e.g. Roofing)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            <button type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg">
              Add
            </button>
          </form>
        </Card>
      )}

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <Card><EmptyState icon="📋" title="No master phases" description="Add phases to make project setup faster." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {items.map(item => (
              <li key={item.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-xs text-gray-400 w-6">{item.sort_order}</span>
                {editingId === item.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500" />
                    <button onClick={() => saveEdit(item.id)} className="text-xs px-2 py-1 bg-primary-500 text-white rounded">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm ${item.is_active === false ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.name}</span>
                    {item.is_active === false && <span className="text-[10px] text-gray-500 bg-gray-50 ring-1 ring-inset ring-gray-500/10 rounded-full px-2 py-0.5">Hidden</span>}
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => toggleActive(item)} className="text-xs text-gray-500 hover:text-primary-600 px-2 py-1">
                          {item.is_active === false ? 'Enable' : 'Disable'}
                        </button>
                        <button onClick={() => { setEditingId(item.id); setEditName(item.name); }} className="text-xs text-gray-500 hover:text-primary-600 px-2 py-1">Rename</button>
                        <button onClick={() => setDeleting(item)} className="text-xs text-gray-500 hover:text-danger-600 px-2 py-1">Delete</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {deleting && (
        <ConfirmModal title="Delete Phase" message={`Delete "${deleting.name}" from your master library? Phases already added to projects are not affected.`}
          confirmLabel="Delete" danger onConfirm={removeItem} onCancel={() => setDeleting(null)} />
      )}
    </Layout>
  );
}
