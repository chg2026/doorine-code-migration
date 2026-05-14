import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function BillingSuccess() {
  const { refresh } = useAuth();

  // Refresh /auth/me so the rest of the app sees the new plan immediately.
  React.useEffect(() => { if (refresh) refresh(); }, [refresh]);

  return (
    <Layout>
      <div className="max-w-xl mx-auto py-16">
        <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-400/[0.08] to-slate-900/40 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-400 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-slate-900" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You're now on the Personal plan!</h1>
          <p className="text-slate-400 text-sm mb-6">
            Thanks for upgrading. All Personal features are now unlocked on your account.
          </p>
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 text-slate-900 font-semibold text-sm hover:bg-amber-300 transition-colors"
          >
            Go to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
