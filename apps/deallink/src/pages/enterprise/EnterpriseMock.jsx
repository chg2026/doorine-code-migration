import React from 'react';
import { Lock } from 'lucide-react';
import { Card } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export function EnterpriseBanner() {
  const { plan } = useAuth();
  if (plan === 'personal' || plan === 'team') return null;
  return (
    <div className="bg-gradient-to-r from-[rgba(184,134,11,0.08)] to-[rgba(184,134,11,0.04)] border border-[#b8860b]/30 rounded-xl p-4 mb-6 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-[rgba(184,134,11,0.10)] flex items-center justify-center flex-shrink-0"><Lock className="w-5 h-5 text-[#b8860b]" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[#1d1d1f] text-sm font-semibold">Enterprise preview</p>
        <p className="text-[#6e6e73] text-xs mt-0.5">This is a visual mockup. Upgrade to unlock real automation.</p>
      </div>
      <button className="bg-[#b8860b] hover:opacity-90 text-white font-semibold text-xs px-4 py-2 rounded-lg flex-shrink-0">Upgrade</button>
    </div>
  );
}

export function MockGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

export function MockCard({ title, body, footer, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-3">{accent}<div className="min-w-0 flex-1"><p className="text-[#1d1d1f] font-semibold text-sm">{title}</p></div></div>
      <div className="text-sm text-[#3a3a3c] space-y-2">{body}</div>
      {footer && <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)]">{footer}</div>}
    </Card>
  );
}
