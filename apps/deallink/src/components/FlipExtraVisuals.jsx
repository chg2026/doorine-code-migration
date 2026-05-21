// FlipExtraVisuals — reusable advanced-analysis blocks for the Fix & Flip+
// strategy. Rendered on the saved Deal Analysis tab in the editor, in the
// IM live preview, and in the public IM report. Each block is independently
// toggleable via the `show` prop so the IM memo builder can hide pieces.
//
// Payload shape (set by public/flip-extra-calc.html on save):
//   {
//     strategy: 'flip-extra',
//     inputs:   { purchase, rehab, arv, closing, holding, cosPct, months },
//     results:  { profit, roi, roiAnn, irr, mult, npv, costOfSale, allIn },
//     breakdown:   [{ label, amount, color }, ...],
//     sensitivity: { bear|base|bull: { salePrice, profit, profitPctOfSale } },
//     doomsday:    { low|base|high:   { profit, allIn } }
//   }
//
// Older saves without `breakdown / sensitivity / doomsday` still render the
// key-metric tiles correctly and gracefully skip the chart blocks.

import React from 'react';

// ── Formatters (kept local so this module has no cross-file coupling) ──
function fmtUsd(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
}
function fmtSignedUsd(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0';
  return (v > 0 ? '+' : '-') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
}

export function isFlipExtra(s) {
  return !!s && s.strategy === 'flip-extra';
}

export function flipExtraSummary(s) {
  if (!isFlipExtra(s)) return null;
  const inp = s.inputs  || {};
  const res = s.results || {};
  return {
    purchase:   Number(inp.purchase) || 0,
    rehab:      Number(inp.rehab)    || 0,
    arv:        Number(inp.arv)      || 0,
    closing:    Number(inp.closing)  || 0,
    holding:    Number(inp.holding)  || 0,
    cosPct:     Number(inp.cosPct)   || 0,
    months:     Number(inp.months)   || 0,
    profit:     Number(res.profit)     || 0,
    roi:        Number(res.roi)        || 0,
    roiAnn:     Number(res.roiAnn)     || 0,
    irr:        Number(res.irr)        || 0,
    mult:       Number(res.mult)       || 0,
    npv:        Number(res.npv)        || 0,
    costOfSale: Number(res.costOfSale) || 0,
    allIn:      Number(res.allIn)      || 0,
    breakdown:   Array.isArray(s.breakdown) ? s.breakdown : null,
    sensitivity: s.sensitivity && typeof s.sensitivity === 'object' ? s.sensitivity : null,
    doomsday:    s.doomsday    && typeof s.doomsday    === 'object' ? s.doomsday    : null,
  };
}

function KeyMetrics({ s }) {
  const tone = (n) => (n >= 0 ? 'text-emerald-500' : 'text-rose-500');
  const tiles = [
    { label: 'Net Profit',       value: fmtSignedUsd(s.profit),         tone: tone(s.profit) },
    { label: 'Total ROI',        value: `${(s.roi).toFixed(2)}%`,       tone: tone(s.roi) },
    { label: 'Annualized ROI',   value: `${(s.roiAnn).toFixed(2)}%`,    tone: tone(s.roiAnn) },
    { label: 'IRR',              value: `${(s.irr).toFixed(2)}%`,       tone: tone(s.irr) },
    { label: 'Equity Multiple',  value: `${s.mult.toFixed(2)}×`,        tone: 'text-[#1d1d1f]' },
    { label: 'NPV',              value: fmtSignedUsd(s.npv),            tone: tone(s.npv) },
  ];
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Key Metrics</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((k) => (
          <div key={k.label} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
            <p className="text-[11px] uppercase tracking-wider text-[#86868b]">{k.label}</p>
            <p className={`text-lg font-semibold mt-1 font-mono ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#86868b] mt-2">
        Hold period: {s.months} month{s.months === 1 ? '' : 's'} · All-in {fmtUsd(s.allIn)}
      </p>
    </div>
  );
}

function DealStructure({ s }) {
  if (!Array.isArray(s.breakdown) || s.breakdown.length === 0) return null;
  const max   = s.breakdown.reduce((mx, x) => Math.max(mx, Number(x.amount) || 0), 0) || 1;
  const total = s.breakdown.reduce((sum, x) => sum + (Number(x.amount) || 0), 0) || 1;
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Deal Structure Breakdown</h4>
      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4 space-y-2.5">
        {s.breakdown.map((row, i) => {
          const amt = Number(row.amount) || 0;
          const pct = (amt / max) * 100;
          const sharePct = (amt / total) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs text-[#3a3a3c]">{row.label}</div>
              <div className="flex-1 h-3 rounded bg-[rgba(0,0,0,0.06)] overflow-hidden">
                <div
                  className="h-full rounded transition-[width]"
                  style={{ width: `${Math.max(pct, 1).toFixed(1)}%`, background: row.color || '#b8860b' }}
                />
              </div>
              <div className="w-28 text-right text-xs font-mono text-[#1d1d1f]">{fmtUsd(amt)}</div>
              <div className="w-12 text-right text-[11px] text-[#86868b]">{sharePct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sensitivity({ s }) {
  if (!s.sensitivity) return null;
  const cases = [
    { key: 'bear', label: 'Bear case', sub: 'ARV −10%',          accent: 'text-rose-500',     border: 'border-rose-500/30',   bg: 'bg-rose-500/5' },
    { key: 'base', label: 'Base case', sub: 'ARV at projection', accent: 'text-[#b8860b]',    border: 'border-[#b8860b]/40',  bg: 'bg-[#b8860b]/5' },
    { key: 'bull', label: 'Bull case', sub: 'ARV +10%',          accent: 'text-emerald-500',  border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
  ];
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">ARV / Sale Price Sensitivity</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cases.map((c) => {
          const data = s.sensitivity[c.key] || {};
          const profit  = Number(data.profit)          || 0;
          const sale    = Number(data.salePrice)       || 0;
          const pctSale = Number(data.profitPctOfSale) || 0;
          return (
            <div key={c.key} className={`rounded-lg border ${c.border} ${c.bg} p-4`}>
              <p className={`text-[11px] uppercase tracking-wider font-semibold ${c.accent}`}>{c.label}</p>
              <p className="text-[10px] text-[#86868b] mt-0.5">{c.sub}</p>
              <p className="text-xs text-[#6e6e73] mt-3">Sale price</p>
              <p className="text-sm font-mono text-[#1d1d1f]">{fmtUsd(sale)}</p>
              <p className="text-xs text-[#6e6e73] mt-2">Projected profit</p>
              <p className={`text-lg font-semibold font-mono ${profit >= 0 ? c.accent : 'text-rose-500'}`}>
                {fmtSignedUsd(profit)}
              </p>
              <p className="text-[11px] text-[#86868b] mt-0.5">
                {pctSale >= 0 ? '+' : ''}{pctSale.toFixed(1)}% of sale price
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StressTest({ s }) {
  if (!s.doomsday) return null;
  const cases = [
    { key: 'low',  label: 'Best case',  sub: 'Rehab −10%, ARV +10%' },
    { key: 'base', label: 'Baseline',   sub: 'Underwriting numbers' },
    { key: 'high', label: 'Worst case', sub: 'Rehab +10%, ARV −10%' },
  ];
  const profits = cases.map((c) => Number(s.doomsday[c.key]?.profit) || 0);
  const maxAbs  = Math.max.apply(null, profits.map(Math.abs)) || 1;
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-2">Doomsday Stress Test</h4>
      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
        <div className="flex items-end justify-between gap-4 h-44 mb-3">
          {cases.map((c, i) => {
            const profit = profits[i];
            const h = (Math.abs(profit) / maxAbs) * 140;
            const positive = profit >= 0;
            return (
              <div key={c.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <span className={`text-xs font-semibold font-mono ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {fmtSignedUsd(profit)}
                </span>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(h, 4)}px`,
                    background: positive ? '#86EFAC' : '#FCA5A5',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-[rgba(0,0,0,0.08)] pt-3">
          {cases.map((c) => (
            <div key={c.key} className="flex-1 min-w-0 text-center">
              <p className="text-xs font-semibold text-[#1d1d1f] truncate">{c.label}</p>
              <p className="text-[10px] text-[#86868b] truncate">{c.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FlipExtraVisuals({ analysis, show }) {
  const s = flipExtraSummary(analysis);
  if (!s) return null;
  const cfg = {
    keyMetrics:    show?.keyMetrics    !== false,
    dealStructure: show?.dealStructure !== false,
    sensitivity:   show?.sensitivity   !== false,
    stressTest:    show?.stressTest    !== false,
  };
  return (
    <div className="space-y-5">
      {cfg.keyMetrics    && <KeyMetrics    s={s} />}
      {cfg.dealStructure && <DealStructure s={s} />}
      {cfg.sensitivity   && <Sensitivity   s={s} />}
      {cfg.stressTest    && <StressTest    s={s} />}
    </div>
  );
}
