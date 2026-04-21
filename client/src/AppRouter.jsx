import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/dashboard/Dashboard';
import DepartmentPage from './pages/dashboard/DepartmentPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import Profile from './pages/dashboard/Profile';
import { Toaster } from 'react-hot-toast';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000, style: { fontSize: '14px' } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/settings/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          <Route path="/acquisitions" element={<ProtectedRoute department="acquisitions"><DepartmentPage department="acquisitions" /></ProtectedRoute>} />
          <Route path="/construction" element={<ProtectedRoute department="construction"><DepartmentPage department="construction" /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute department="property_management"><DepartmentPage department="properties" /></ProtectedRoute>} />
          <Route path="/contractors" element={<ProtectedRoute department="contractors"><DepartmentPage department="contractors" /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute department="finance"><DepartmentPage department="finance" /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute department="tasks"><DepartmentPage department="tasks" /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
