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
    <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-full border border-[rgba(184,134,11,0.30)] bg-[rgba(184,134,11,0.05)] text-xs text-[#1d1d1f]">
      <span className="font-semibold text-[#1d1d1f] truncate">{summary.addr}</span>
      {cityState && <span className="text-[#6e6e73]">· {cityState}</span>}
      {ask && <span className="text-[#b8860b] font-semibold whitespace-nowrap">· {ask}</span>}
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
            i < step ? 'bg-[#b8860b]' : 'bg-[rgba(0,0,0,0.08)]'
          }`}
        />
      ))}
    </div>
  );
}

export default function GateShell({ step, summary, onBack, title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col">
      {/* Top bar */}
      <header className="px-4 py-4 border-b border-[rgba(0,0,0,0.08)] flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} className="text-[#6e6e73] hover:text-[#b8860b] -ml-2 p-1" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-7" />}
        <div className="text-[#b8860b] font-bold tracking-wide">REI Flywheel</div>
      </header>

      {/* Centered card */}
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          <ProgressBar step={step} />
          <div className="flex justify-center">
            <DealPill summary={summary} />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f]">{title}</h1>
            {subtitle && <p className="text-sm text-[#6e6e73]">{subtitle}</p>}
          </div>
          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5 sm:p-6 space-y-4">
            {children}
          </div>
          {footer}
        </div>
      </main>

      <footer className="px-4 py-4 text-center text-[11px] text-[#86868b]">
        By continuing you agree to REI Flywheel's <a className="underline hover:text-[#b8860b]" href="#">Terms of Service</a>.
      </footer>
    </div>
  );
}
