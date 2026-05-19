// Shared full-screen gate layout. Wraps each step with a consistent
// background, progress indicator, deal pill, and footer.
import React from 'react';
import { ChevronLeft } from 'lucide-react';

function fmtUsd(n) {
  if (n == null) return null;
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function DealPill({ summary }) {
  if (!summary) return null;
  const cityState = [summary.city, summary.state].filter(Boolean).join(', ');
  const ask = fmtUsd(summary.ask);
  return (
    <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-400/5 text-xs text-slate-200">
      <span className="font-semibold text-white truncate">{summary.addr}</span>
      {cityState && <span className="text-slate-400">· {cityState}</span>}
      {ask && <span className="text-amber-300 font-semibold whitespace-nowrap">· {ask}</span>}
    </div>
  );
}

export function ProgressBar({ step, total = 3 }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-amber-400' : 'bg-slate-700'
          }`}
        />
      ))}
    </div>
  );
}

export default function GateShell({ step, summary, onBack, title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="px-4 py-4 border-b border-slate-800/60 flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} className="text-slate-400 hover:text-amber-400 -ml-2 p-1" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-7" />}
        <div className="text-amber-400 font-bold tracking-wide">REI Flywheel</div>
      </header>

      {/* Centered card */}
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          <ProgressBar step={step} />
          <div className="flex justify-center">
            <DealPill summary={summary} />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
            {children}
          </div>
          {footer}
        </div>
      </main>

      <footer className="px-4 py-4 text-center text-[11px] text-slate-500">
        By continuing you agree to REI Flywheel's <a className="underline hover:text-amber-400" href="#">Terms of Service</a>.
      </footer>
    </div>
  );
}
