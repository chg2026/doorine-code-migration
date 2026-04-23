export function StatusBadge({ status, size = 'sm' }) {
  const styles = {
    active:    'bg-green-50 text-green-700 ring-green-600/20',
    trial:     'bg-blue-50 text-blue-700 ring-blue-600/20',
    suspended: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
    past_due:  'bg-red-50 text-red-700 ring-red-600/20',
    pending:   'bg-amber-50 text-amber-700 ring-amber-600/20',
    current:   'bg-green-50 text-green-700 ring-green-600/20',
    late:      'bg-red-50 text-red-700 ring-red-600/20',
    view:      'bg-blue-50 text-blue-700 ring-blue-600/20',
    edit:      'bg-green-50 text-green-700 ring-green-600/20',
    none:      'bg-gray-50 text-gray-500 ring-gray-500/10',
  };
  const cls = styles[status] || 'bg-gray-50 text-gray-700 ring-gray-600/20';
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset capitalize ${cls} ${sz}`}>
      {(status || '').replace(/_/g, ' ')}
    </span>
  );
}

export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
              danger ? 'bg-danger-500 hover:bg-danger-600' : 'bg-primary-500 hover:bg-primary-600'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, onAction }) {
  return (
    <div className="text-center py-12 px-6">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">{description}</p>
      {action && (
        <button onClick={onAction} className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>{children}</div>;
}

export function StatCard({ label, value, change, icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && <p className={`text-xs mt-1 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>{change > 0 ? '+' : ''}{change}% from last month</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-500">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
