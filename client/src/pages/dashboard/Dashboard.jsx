import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { StatCard, Card, LoadingSpinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data);
      } catch { setStats({}); }
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <Layout title="Dashboard">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Welcome back, {profile?.full_name || 'there'}</h2>
        <p className="text-sm text-gray-500 mt-1">Here's what's happening across your portfolio.</p>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Properties" value={stats?.properties ?? 0} />
          <StatCard label="Active Projects" value={stats?.active_projects ?? 0} />
          <StatCard label="Open Tasks" value={stats?.open_tasks ?? 0} />
          <StatCard label="Total Spend" value={`$${(stats?.total_spend ?? 0).toLocaleString()}`} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <p className="text-sm text-gray-500">Activity feed coming soon.</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <QuickAction label="Add Property" href="/properties" />
            <QuickAction label="Create Project" href="/construction" />
            <QuickAction label="Log Expense" href="/finance" />
          </div>
        </Card>
      </div>
    </Layout>
  );
}

function QuickAction({ label, href }) {
  return (
    <a href={href} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </a>
  );
}
