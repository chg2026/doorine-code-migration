import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PLAN_LABELS = {
  personal: 'Personal',
  team: 'Team',
};

export default function BillingSuccess() {
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const planParam = (params.get('plan') || '').toLowerCase();
  const planLabel = PLAN_LABELS[planParam] || 'paid';

  // Refresh /auth/me so the rest of the app sees the new plan immediately.
  React.useEffect(() => { if (refresh) refresh(); }, [refresh]);

  return (
    <Layout>
      <div className="max-w-xl mx-auto py-16">
        <div className="rounded-2xl border border-[#b8860b]/40 bg-gradient-to-br from-[rgba(184,134,11,0.08)] to-white p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#b8860b] flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-[#1d1d1f]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1d1d1f] mb-2">
            You're now on the {planLabel} plan!
          </h1>
          <p className="text-[#6e6e73] text-sm mb-6">
            Thanks for upgrading. All {planLabel} features are now unlocked on your account.
          </p>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold text-sm hover:opacity-90 transition-colors"
          >
            Go to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
