import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { StoreProvider } from './store.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import PublicProfile from './pages/PublicProfile.jsx';
import DealDetail from './pages/DealDetail.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminLeads from './pages/AdminLeads.jsx';
import AdminProfile from './pages/AdminProfile.jsx';
import DealEditor from './pages/DealEditor.jsx';
import CsvImport from './pages/CsvImport.jsx';
import NotFound from './pages/NotFound.jsx';

// Authed admin pages share a StoreProvider so /api/deallink/{profile,deals,leads}
// is fetched once and reused. Public pages (Landing, PublicProfile, DealDetail,
// Login) don't need the store — they fetch directly from the public read API
// and avoid pulling in any Supabase session state.
function Admin({ children }) {
  return (
    <ProtectedRoute>
      <StoreProvider>{children}</StoreProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Admin><Onboarding /></Admin>} />
        <Route path="/admin" element={<Admin><AdminDashboard /></Admin>} />
        <Route path="/admin/leads" element={<Admin><AdminLeads /></Admin>} />
        <Route path="/admin/profile" element={<Admin><AdminProfile /></Admin>} />
        <Route path="/admin/deal/new" element={<Admin><DealEditor mode="new" /></Admin>} />
        <Route path="/admin/deal/:id" element={<Admin><DealEditor mode="edit" /></Admin>} />
        <Route path="/admin/import" element={<Admin><CsvImport /></Admin>} />
        <Route path="/p/:handle" element={<PublicProfile />} />
        <Route path="/p/:handle/:dealId" element={<DealDetail />} />
        <Route path="/profile" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
