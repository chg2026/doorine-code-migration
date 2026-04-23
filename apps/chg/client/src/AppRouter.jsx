import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/dashboard/Dashboard';
import PropertiesPage from './pages/dashboard/PropertiesPage';
import PropertyDashboard from './pages/dashboard/PropertyDashboard';
import UnitDashboard from './pages/dashboard/UnitDashboard';
import ConstructionPage from './pages/dashboard/ConstructionPage';
import ProjectDashboard from './pages/dashboard/ProjectDashboard';
import MasterPhasesPage from './pages/dashboard/MasterPhasesPage';
import ContractorsPage from './pages/dashboard/ContractorsPage';
import ContractorDetail from './pages/dashboard/ContractorDetail';
import AcquisitionsPage from './pages/dashboard/AcquisitionsPage';
import FinancePage from './pages/dashboard/FinancePage';
import TasksPage from './pages/dashboard/TasksPage';
import TenantsPage from './pages/dashboard/TenantsPage';
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
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/settings/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          <Route path="/acquisitions" element={<ProtectedRoute department="acquisitions"><AcquisitionsPage /></ProtectedRoute>} />
          <Route path="/construction" element={<ProtectedRoute department="construction"><ConstructionPage /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute department="construction"><ProjectDashboard /></ProtectedRoute>} />
          <Route path="/settings/master-phases" element={<ProtectedRoute department="construction"><MasterPhasesPage /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute department="property_management"><PropertiesPage /></ProtectedRoute>} />
          <Route path="/properties/:id" element={<ProtectedRoute department="property_management"><PropertyDashboard /></ProtectedRoute>} />
          <Route path="/properties/:propId/units/:unitId" element={<ProtectedRoute department="property_management"><UnitDashboard /></ProtectedRoute>} />
          <Route path="/tenants" element={<ProtectedRoute department="property_management"><TenantsPage /></ProtectedRoute>} />
          <Route path="/contractors" element={<ProtectedRoute department="contractors"><ContractorsPage /></ProtectedRoute>} />
          <Route path="/contractors/:id" element={<ProtectedRoute department="contractors"><ContractorDetail /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute department="finance"><FinancePage /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute department="tasks"><TasksPage /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
