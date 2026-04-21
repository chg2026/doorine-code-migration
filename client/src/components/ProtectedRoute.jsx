import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, department, requireEdit, requireAdmin, requireSuperAdmin }) {
  const { user, profile, loading, isSuperAdmin, isAccountAdmin, hasDepartmentAccess, canEditDepartment } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (profile?.status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Account Suspended</h2>
          <p className="text-sm text-gray-500">Your account has been suspended. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (requireSuperAdmin && !isSuperAdmin) return <Navigate to="/" replace />;
  if (requireAdmin && !isSuperAdmin && !isAccountAdmin) return <Navigate to="/" replace />;
  if (department && !hasDepartmentAccess(department)) return <Navigate to="/" replace />;
  if (department && requireEdit && !canEditDepartment(department)) return <Navigate to="/" replace />;

  return children;
}
