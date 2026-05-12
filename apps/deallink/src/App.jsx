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
import NotFound from './pages/NotFound.jsx';

import Dashboard from './pages/Dashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminLeads from './pages/AdminLeads.jsx';
import AdminProfile from './pages/AdminProfile.jsx';
import DealEditor from './pages/DealEditor.jsx';
import CsvImport from './pages/CsvImport.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Buyers from './pages/Buyers.jsx';
import Offers from './pages/Offers.jsx';
import Analytics from './pages/Analytics.jsx';
import Marketplace from './pages/Marketplace.jsx';

import DealBlast from './pages/enterprise/DealBlast.jsx';
import GodMode from './pages/enterprise/GodMode.jsx';
import ArtemisMode from './pages/enterprise/ArtemisMode.jsx';
import JVDeals from './pages/enterprise/JVDeals.jsx';
import BuyerRental from './pages/enterprise/BuyerRental.jsx';
import Handoff from './pages/enterprise/Handoff.jsx';

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

        <Route path="/dashboard" element={<Admin><Dashboard /></Admin>} />
        <Route path="/admin" element={<Admin><AdminDashboard /></Admin>} />
        <Route path="/admin/leads" element={<Admin><AdminLeads /></Admin>} />
        <Route path="/admin/profile" element={<Admin><AdminProfile /></Admin>} />
        <Route path="/admin/deal/new" element={<Admin><DealEditor mode="new" /></Admin>} />
        <Route path="/admin/deal/:id" element={<Admin><DealEditor mode="edit" /></Admin>} />
        <Route path="/admin/import" element={<Admin><CsvImport /></Admin>} />

        <Route path="/pipeline" element={<Admin><Pipeline /></Admin>} />
        <Route path="/buyers" element={<Admin><Buyers /></Admin>} />
        <Route path="/offers" element={<Admin><Offers /></Admin>} />
        <Route path="/analytics" element={<Admin><Analytics /></Admin>} />
        <Route path="/marketplace" element={<Admin><Marketplace /></Admin>} />

        <Route path="/deal-blast" element={<Admin><DealBlast /></Admin>} />
        <Route path="/god-mode" element={<Admin><GodMode /></Admin>} />
        <Route path="/artemis-mode" element={<Admin><ArtemisMode /></Admin>} />
        <Route path="/jv-deals" element={<Admin><JVDeals /></Admin>} />
        <Route path="/buyer-rental" element={<Admin><BuyerRental /></Admin>} />
        <Route path="/handoff" element={<Admin><Handoff /></Admin>} />

        <Route path="/p/:handle" element={<PublicProfile />} />
        <Route path="/p/:handle/:dealId" element={<DealDetail />} />
        <Route path="/profile" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
