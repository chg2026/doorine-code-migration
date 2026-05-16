import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { StoreProvider } from './store.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ProGate from './components/ProGate.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Onboarding from './pages/Onboarding.jsx';
import PublicProfile from './pages/PublicProfile.jsx';
import DealDetail from './pages/DealDetail.jsx';
import DealIM from './pages/DealIM.jsx';
import IMDeal from './pages/IMDeal.jsx';
import BuyerDashboard from './pages/BuyerDashboard.jsx';
import NotFound from './pages/NotFound.jsx';

import Dashboard from './pages/Dashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminLeads from './pages/AdminLeads.jsx';
import AdminProfile from './pages/AdminProfile.jsx';
import DealEditor from './pages/DealEditor.jsx';
import CsvImport from './pages/CsvImport.jsx';
import Pipeline from './pages/Pipeline.jsx';
import DealAnalyzer from './pages/DealAnalyzer.jsx';
import Buyers from './pages/Buyers.jsx';
import Offers from './pages/Offers.jsx';
import Analytics from './pages/Analytics.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Billing from './pages/Billing.jsx';
import BillingSuccess from './pages/BillingSuccess.jsx';

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
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<Admin><Onboarding /></Admin>} />
        <Route path="/deal/:slug" element={<DealIM />} />
        <Route path="/im/:dealId" element={<IMDeal />} />
        <Route path="/buyer/dashboard" element={<BuyerDashboard />} />

        <Route path="/dashboard" element={<Admin><Dashboard /></Admin>} />
        <Route path="/admin" element={<Admin><AdminDashboard /></Admin>} />
        <Route path="/admin/leads" element={<Admin><ProGate pageTitle="Leads" pageSubtitle="Buyers who clicked Get details" title="Lead inbox is a paid feature" body="On the Free plan you'll still receive an email each time someone requests a deal. Upgrade to see, filter, and manage the full lead list here.">
          <AdminLeads />
        </ProGate></Admin>} />
        <Route path="/admin/profile" element={<Admin><AdminProfile /></Admin>} />
        <Route path="/admin/deal/new" element={<Admin><DealEditor mode="new" /></Admin>} />
        <Route path="/admin/deal/:id" element={<Admin><DealEditor mode="edit" /></Admin>} />
        <Route path="/admin/import" element={<Admin><CsvImport /></Admin>} />

        <Route path="/pipeline" element={<Admin><Pipeline /></Admin>} />
        {/* Public — buyers (and visitors from BuyerDashboard) can analyze
            any deal without signing in. The /:dealId variant remains
            authed because it loads a specific wholesaler-owned deal. */}
        <Route path="/deal-analyzer" element={<StoreProvider><DealAnalyzer /></StoreProvider>} />
        <Route path="/deal-analyzer/:dealId" element={<Admin><DealAnalyzer /></Admin>} />
        <Route path="/buyers" element={<Admin><ProGate pageTitle="Buyers" pageSubtitle="Your buyer network" title="Buyer CRM is a paid feature" body="Upgrade to Personal or Team to build a deduped buyer list, import from leads, and match buyers to deals.">
          <Buyers />
        </ProGate></Admin>} />
        <Route path="/offers" element={<Admin><Offers /></Admin>} />
        <Route path="/analytics" element={<Admin><Analytics /></Admin>} />
        <Route path="/marketplace" element={<Admin><ProGate pageTitle="Marketplace" pageSubtitle="Cross-wholesaler deal flow" title="Marketplace is a paid feature" body="Upgrade to Personal or Team to opt into the cross-wholesaler marketplace and browse deals from other DealLink members.">
          <Marketplace />
        </ProGate></Admin>} />

        <Route path="/deal-blast" element={<Admin><ProGate pageTitle="AI Deal Blast"><DealBlast /></ProGate></Admin>} />
        <Route path="/god-mode" element={<Admin><ProGate pageTitle="God Mode"><GodMode /></ProGate></Admin>} />
        <Route path="/artemis-mode" element={<Admin><ProGate pageTitle="Artemis Mode"><ArtemisMode /></ProGate></Admin>} />
        <Route path="/jv-deals" element={<Admin><ProGate pageTitle="JV Deals"><JVDeals /></ProGate></Admin>} />
        <Route path="/buyer-rental" element={<Admin><ProGate pageTitle="Buyer Rental"><BuyerRental /></ProGate></Admin>} />
        <Route path="/handoff" element={<Admin><ProGate pageTitle="Handoff"><Handoff /></ProGate></Admin>} />

        <Route path="/billing" element={<Admin><Billing /></Admin>} />
        <Route path="/billing/success" element={<Admin><BillingSuccess /></Admin>} />

        <Route path="/p/:handle" element={<PublicProfile />} />
        <Route path="/p/:handle/:dealId" element={<DealDetail />} />
        <Route path="/profile" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
