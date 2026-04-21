import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { StatCard, Card, StatusBadge, LoadingSpinner, EmptyState, ConfirmModal } from '../../components/ui';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const tabs = [
    { id: 'overview',    label: 'Overview' },
    { id: 'accounts',    label: 'Accounts' },
    { id: 'users',       label: 'Users' },
    { id: 'roles',       label: 'Roles & Permissions' },
  ];

  return (
    <Layout title="Admin">
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-primary-500 text-primary-500' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview'  && <OverviewTab />}
      {tab === 'accounts'  && <AccountsTab />}
      {tab === 'users'     && <UsersTab />}
      {tab === 'roles'     && <RolesTab />}
    </Layout>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => setStats({})).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Total Accounts" value={stats?.total_accounts ?? 0} />
      <StatCard label="Total Users" value={stats?.total_users ?? 0} />
      <StatCard label="Active Accounts" value={stats?.active_accounts ?? 0} />
      <StatCard label="New (30 days)" value={stats?.recent_accounts ?? 0} />
    </div>
  );
}

function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editAccount, setEditAccount] = useState(null);
  const [deleteAccount, setDeleteAccount] = useState(null);

  const fetchAccounts = () => {
    setLoading(true);
    api.get('/admin/accounts').then(r => setAccounts(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(fetchAccounts, []);

  const filtered = accounts.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !(a.billing_email || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const handleSave = async (form) => {
    try {
      if (editAccount?.id) {
        await api.put(`/admin/accounts/${editAccount.id}`, form);
        toast.success('Account updated');
      } else {
        await api.post('/admin/accounts', form);
        toast.success('Account created');
      }
      setEditAccount(null);
      fetchAccounts();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/accounts/${deleteAccount.id}`);
      toast.success('Account deleted');
      setDeleteAccount(null);
      fetchAccounts();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    }
  };

  const handleSuspend = async (account) => {
    const newStatus = account.status === 'suspended' ? 'active' : 'suspended';
    try {
      await api.put(`/admin/accounts/${account.id}`, { status: newStatus });
      toast.success(`Account ${newStatus}`);
      fetchAccounts();
    } catch (e) {
      toast.error('Action failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-64" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={() => setEditAccount({})}
          className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Account
        </button>
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState title="No accounts found" description="Create your first client account to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Plan</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Users</th>
                <th className="px-4 py-3 font-medium text-gray-500">Created</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.name}</div>
                      {a.billing_email && <div className="text-xs text-gray-500">{a.billing_email}</div>}
                    </td>
                    <td className="px-4 py-3 capitalize">{a.plan_tier}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3">{a.user_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditAccount(a)} className="text-gray-400 hover:text-primary-500 p-1" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                        <button onClick={() => handleSuspend(a)} className="text-gray-400 hover:text-warning-500 p-1" title={a.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </button>
                        <button onClick={() => setDeleteAccount(a)} className="text-gray-400 hover:text-danger-500 p-1" title="Delete">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editAccount !== null && <AccountFormModal account={editAccount} onClose={() => setEditAccount(null)} onSave={handleSave} />}
      {deleteAccount && <ConfirmModal title="Delete Account" message={`Are you sure you want to delete "${deleteAccount.name}"? This will remove all users and data.`} confirmLabel="Delete Account" danger onConfirm={handleDelete} onCancel={() => setDeleteAccount(null)} />}
    </div>
  );
}

function AccountFormModal({ account, onClose, onSave }) {
  const isEdit = !!account?.id;
  const [form, setForm] = useState({
    name: account?.name || '',
    plan_tier: account?.plan_tier || 'starter',
    status: account?.status || 'active',
    billing_email: account?.billing_email || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isEdit ? 'Edit Account' : 'New Account'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Tier</label>
              <select value={form.plan_tier} onChange={e => set('plan_tier', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email</label>
            <input type="email" value={form.billing_email} onChange={e => set('billing_email', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    !search || (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-64" />
      </div>
      <Card>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState title="No users found" description="Users will appear here when accounts are created." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Account</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Last Login</th>
              </tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">{u.role_name || '—'}</td>
                    <td className="px-4 py-3">{u.account_name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/roles').then(r => setRoles(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const depts = ['acquisitions','construction','property_management','contractors','finance','tasks'];

  return (
    <div>
      <Card>
        {loading ? <LoadingSpinner /> : roles.length === 0 ? (
          <EmptyState title="No roles configured" description="Create roles to assign department-level permissions." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Account</th>
                {depts.map(d => <th key={d} className="px-3 py-3 font-medium text-gray-500 text-center capitalize text-xs">{d.replace(/_/g, ' ')}</th>)}
              </tr></thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.account_name || 'System'}</td>
                    {depts.map(d => {
                      const perm = (r.permissions || []).find(p => p.department === d);
                      return <td key={d} className="px-3 py-3 text-center"><StatusBadge status={perm?.permission_level || 'none'} size="xs" /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
