import React from 'react';
import { Lock } from 'lucide-react';
import { Card } from '../../components/ui.jsx';

export function EnterpriseBanner() {
  return (
    <div className="bg-gradient-to-r from-amber-500/10 to-amber-400/5 border border-amber-400/30 rounded-xl p-4 mb-6 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0"><Lock className="w-5 h-5 text-amber-400" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">Enterprise preview</p>
        <p className="text-slate-400 text-xs mt-0.5">This is a visual mockup. Upgrade to unlock real automation.</p>
      </div>
      <button className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold text-xs px-4 py-2 rounded-lg flex-shrink-0">Upgrade</button>
    </div>
  );
}

export function MockGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

export function MockCard({ title, body, footer, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-3">{accent}<div className="min-w-0 flex-1"><p className="text-white font-semibold text-sm">{title}</p></div></div>
      <div className="text-sm text-slate-300 space-y-2">{body}</div>
      {footer && <div className="mt-4 pt-4 border-t border-slate-700">{footer}</div>}
    </Card>
  );
}
