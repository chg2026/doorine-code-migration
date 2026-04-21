import Layout from '../../components/Layout';
import { Card, EmptyState } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const DEPARTMENTS = {
  acquisitions:        { title: 'Acquisitions',         icon: '🔍', desc: 'Track and evaluate property acquisition opportunities.' },
  construction:        { title: 'Construction',         icon: '🏗️', desc: 'Manage construction projects, phases, and budgets.' },
  properties:          { title: 'Property Management',  icon: '🏢', desc: 'Manage properties, tenants, and maintenance.' },
  contractors:         { title: 'Contractors',           icon: '🔧', desc: 'Manage your contractor directory and assignments.' },
  finance:             { title: 'Finance',               icon: '📊', desc: 'Track expenses, invoices, and financial metrics.' },
  tasks:               { title: 'Tasks',                 icon: '✅', desc: 'Manage recurring tasks and action items.' },
};

export default function DepartmentPage({ department }) {
  const info = DEPARTMENTS[department] || { title: department, icon: '📄', desc: '' };
  const { canEditDepartment } = useAuth();
  const canEdit = canEditDepartment(department);

  return (
    <Layout title={info.title}>
      <Card className="p-0">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{info.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{info.desc}</p>
          </div>
          {canEdit && (
            <button className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + Add New
            </button>
          )}
        </div>
        <EmptyState
          icon={info.icon}
          title={`${info.title} module`}
          description="This department is being configured. Full functionality coming soon."
        />
      </Card>
    </Layout>
  );
}
