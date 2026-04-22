import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider } from './store.jsx';
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

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/leads" element={<AdminLeads />} />
        <Route path="/admin/profile" element={<AdminProfile />} />
        <Route path="/admin/deal/new" element={<DealEditor mode="new" />} />
        <Route path="/admin/deal/:id" element={<DealEditor mode="edit" />} />
        <Route path="/admin/import" element={<CsvImport />} />
        <Route path="/p/:handle" element={<PublicProfile />} />
        <Route path="/p/:handle/:dealId" element={<DealDetail />} />
        <Route path="/profile" element={<Navigate to="/p/jrodriguez.deals" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </StoreProvider>
  );
}
