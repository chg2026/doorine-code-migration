import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { Card, EmptyState, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function TasksPage() {
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment('tasks');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [completing, setCompleting] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks');
      setTasks(data || []);
    } catch { setTasks([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = tasks.filter(t => !filter || t.status === filter);
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  const handleComplete = async (taskId, confirmationNumber) => {
    try {
      await api.put(`/tasks/${taskId}/complete`, { confirmation_number: confirmationNumber });
      toast.success('Task completed');
      setCompleting(null);
      fetch();
    } catch (e) {
      toast.error('Failed to complete task');
    }
  };

  return (
    <Layout title="Tasks">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500">Total Tasks</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{tasks.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-amber-600">Pending</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{pendingCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-green-600">Completed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{completedCount}</p>
        </Card>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {['pending', 'completed', ''].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === f ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
            {f === '' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="✅" title="No tasks" description={filter === 'pending' ? 'All caught up! No pending tasks.' : 'No tasks found.'} />
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(t => (
              <div key={t.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${t.status === 'completed' ? 'bg-green-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{t.task_name || t.name || 'Untitled Task'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {t.properties?.address || 'No property'} · {t.frequency || 'one-time'}
                    {t.due_date && ` · Due ${new Date(t.due_date).toLocaleDateString()}`}
                  </div>
                  {t.confirmation_number && (
                    <div className="text-xs text-gray-400 mt-0.5">Confirmation: {t.confirmation_number}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.status === 'completed' && t.completed_at && (
                    <span className="text-xs text-gray-400">
                      {new Date(t.completed_at).toLocaleDateString()}
                    </span>
                  )}
                  {t.status === 'pending' && canEdit && (
                    <button onClick={() => setCompleting(t)}
                      className="text-sm font-medium text-primary-500 hover:text-primary-600 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors">
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {completing && <CompleteModal task={completing} onClose={() => setCompleting(null)} onComplete={handleComplete} />}
    </Layout>
  );
}

function CompleteModal({ task, onClose, onComplete }) {
  const [confirmNum, setConfirmNum] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onComplete(task.id, confirmNum);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Complete Task</h3>
        <p className="text-sm text-gray-500 mb-4">Mark "{task.task_name || task.name}" as completed.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Number (optional)</label>
            <input value={confirmNum} onChange={e => setConfirmNum(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. receipt or reference number" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
              {saving ? 'Completing...' : 'Mark Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
