import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Home, Wrench, ArrowLeft, Plus, Trash2, AlertCircle,
  CheckCircle2, Save, Repeat, Layers, Briefcase, Building2, Search, Repeat2,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { DEAL_STATUSES } from '../lib/deallink-api.js';

const fmt = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtSigned = (n) => (n < 0 ? `-${fmt(Math.abs(n))}` : fmt(n));
const fmtPct = (n) => `${n.toFixed(1)}%`;

const STRATS = [
  { k: 'rental', label: 'Rental', icon: Home },
  { k: 'brrrr', label: 'BRRRR', icon: Repeat },
  { k: 'flip', label: 'Fix & Flip', icon: Wrench },
  { k: 'multi', label: 'Multifamily', icon: Layers },
  { k: 'commercial', label: 'Commercial', icon: Briefcase },
];

const SUBTABS = [
  { k: 'property', label: 'Property' },
  { k: 'financing', label: 'Financing' },
  { k: 'income', label: 'Income' },
  { k: 'rehab', label: 'Rehab' },
];

export default function DealAnalyzer() {
  const { dealId } = useParams();
  const { state } = useStore();

  // No property selected yet → show the picker.
  if (!dealId) return <PropertySelector deals={state.deals} loaded={state.loaded} />;

  // Wait for the store to hydrate before deciding the deal is missing.
  if (!state.loaded) {
    return <Layout><div className="py-32 text-center text-xs text-slate-500 font-mono">Loading…</div></Layout>;
  }

  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal) {
    return (
      <Layout>
        <div className="py-24 text-center">
          <p className="text-slate-300 mb-3">That property isn't in your list.</p>
          <Link to="/deal-analyzer" className="text-amber-400 text-sm hover:underline">Pick a property to analyze →</Link>
        </div>
      </Layout>
    );
  }

  // Remount on dealId change so all useState initializers re-run with the new property's data.
  return <Analyzer key={deal.id} deal={deal} />;
}

function Analyzer({ deal }) {
  const { dispatch } = useStore();
  const { show, node: toastNode } = useToast();
  const [saving, setSaving] = useState(false);

  // Saved analysis (if any) wins over the raw deal fields. Falls back to
  // sane defaults whenever a key is missing from saved state.
  const s = deal.analyzerState || {};
  const seed = (key, fallback) => (s[key] !== undefined && s[key] !== null ? s[key] : fallback);

  const [strategy, setStrategy] = useState(seed('strategy', 'brrrr'));
  const [subtab, setSubtab] = useState('rehab');

  const [purchasePrice, setPurchasePrice] = useState(seed('purchasePrice', Number(deal.ask) || 0));
  const [arv, setArv] = useState(seed('arv', Number(deal.arv) || 0));
  const [downPct, setDownPct] = useState(seed('downPct', 20));
  const [rate, setRate] = useState(seed('rate', 8.25));
  const [term, setTerm] = useState(seed('term', 30));
  const [closingPct, setClosingPct] = useState(seed('closingPct', 2.5));

  const [monthlyRent, setMonthlyRent] = useState(seed('monthlyRent', 1900));
  const [vacancyPct, setVacancyPct] = useState(seed('vacancyPct', 8));
  const [taxesYr, setTaxesYr] = useState(seed('taxesYr', 4200));
  const [insYr, setInsYr] = useState(seed('insYr', 1400));
  const [mgmtPct, setMgmtPct] = useState(seed('mgmtPct', 12));
  const [maintPct, setMaintPct] = useState(seed('maintPct', 10));
  const [capexPct, setCapexPct] = useState(seed('capexPct', 10));
  const [holdingMo, setHoldingMo] = useState(seed('holdingMo', 6));

  const [rehabOverride, setRehabOverride] = useState(seed('rehabOverride', 8000));
  const [items, setItems] = useState(
    // Honor a saved empty array — only fall back to defaults when nothing
    // has ever been saved.
    Array.isArray(s.items)
      ? s.items
      : [
          { id: 'r1', category: 'Flooring', description: 'LVP throughout', cost: 4500 },
          { id: 'r2', category: 'Interior Paint', description: 'Interior paint', cost: 3500 },
        ]
  );

  const [refiArv, setRefiArv] = useState(seed('refiArv', Number(deal.arv) || 0));
  const [refiLTV, setRefiLTV] = useState(seed('refiLTV', 75));
  const [refiRate, setRefiRate] = useState(seed('refiRate', 7.5));

  const m = useMemo(() => {
    const rehab = rehabOverride || items.reduce((s, i) => s + (i.cost || 0), 0);
    const closingBuy = purchasePrice * (closingPct / 100);
    const holdingTotal = (taxesYr / 12 + insYr / 12) * holdingMo;
    const loan = purchasePrice * (1 - downPct / 100);
    const r = rate / 100 / 12;
    const n = term * 12;
    const piti = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n;
    const totalCash = purchasePrice * (downPct / 100) + rehab + closingBuy;
    const grossYr = monthlyRent * 12;
    const vacancy = grossYr * (vacancyPct / 100);
    const mgmt = grossYr * (mgmtPct / 100);
    const maint = grossYr * (maintPct / 100);
    const capex = grossYr * (capexPct / 100);
    const opex = vacancy + mgmt + maint + capex + taxesYr + insYr;
    const noi = grossYr - opex;
    const cashFlowYr = noi - piti * 12;
    const coc = totalCash > 0 ? (cashFlowYr / totalCash) * 100 : 0;
    const cap = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
    const grm = grossYr > 0 ? purchasePrice / grossYr : 0;

    const years = [1, 2, 3, 4, 5].map((y) => {
      const rentMul = Math.pow(1.02, y - 1);
      const appMul = Math.pow(1.03, y);
      return {
        year: y,
        cashFlow: (grossYr * rentMul - opex) - piti * 12,
        noi: grossYr * rentMul - opex,
        propValue: purchasePrice * appMul,
      };
    });
    const sale5 = years[4].propValue;
    const projSale = sale5 * 0.94 - loan * 0.95;
    const totalReturn = years.reduce((s, y) => s + y.cashFlow, 0) + (projSale - totalCash);

    const refiLoan = refiArv * (refiLTV / 100);
    const cashOut = refiLoan - loan;
    const cashLeft = totalCash - cashOut;
    const newPiti = (() => {
      const rr = refiRate / 100 / 12;
      return rr > 0 ? (refiLoan * rr) / (1 - Math.pow(1 + rr, -n)) : refiLoan / n;
    })();
    const newCfYr = noi - newPiti * 12;
    const cocAfterRefi = cashLeft > 0 ? (newCfYr / cashLeft) * 100 : 0;
    const equityCreated = refiArv - purchasePrice - rehab;

    const sellingCosts = arv * 0.08;
    const flipNetProfit = arv - purchasePrice - rehab - closingBuy - holdingTotal - sellingCosts - piti * holdingMo;
    const flipInvestment = totalCash + holdingTotal + piti * holdingMo;
    const flipROI = flipInvestment > 0 ? (flipNetProfit / flipInvestment) * 100 : 0;
    const flipAnnROI = (flipROI * 12) / Math.max(holdingMo, 1);
    const mao = arv * 0.7 - rehab;

    return {
      rehab, closingBuy, holdingTotal, loan, piti, totalCash,
      grossYr, vacancy, mgmt, maint, capex, opex, noi, cashFlowYr,
      coc, cap, grm, years, sale5, projSale, totalReturn,
      refiLoan, cashOut, cashLeft, newPiti, cocAfterRefi, equityCreated,
      sellingCosts, flipNetProfit, flipInvestment, flipROI, flipAnnROI, mao,
    };
  }, [
    purchasePrice, arv, downPct, rate, term, closingPct,
    monthlyRent, vacancyPct, taxesYr, insYr, mgmtPct, maintPct, capexPct, holdingMo,
    rehabOverride, items, refiArv, refiLTV, refiRate,
  ]);

  const isHold = strategy === 'rental' || strategy === 'multi' || strategy === 'commercial' || strategy === 'brrrr';

  async function saveAnalysis() {
    if (saving) return;
    setSaving(true);
    const stratLabel = (STRATS.find((x) => x.k === strategy) || {}).label || strategy;
    const monthlyCashFlow = strategy === 'flip' ? 0 : m.cashFlowYr / 12;
    const roi = strategy === 'flip' ? m.flipROI : m.coc;
    const analyzerState = {
      v: 1,
      strategy,
      purchasePrice, arv, downPct, rate, term, closingPct,
      monthlyRent, vacancyPct, taxesYr, insYr, mgmtPct, maintPct, capexPct, holdingMo,
      rehabOverride, items,
      refiArv, refiLTV, refiRate,
      summary: {
        strategy,
        strategyLabel: stratLabel,
        purchasePrice,
        arv,
        rehab: m.rehab,
        mao: m.mao,
        monthlyCashFlow,
        roi,
      },
    };
    try {
      await dispatch({ type: 'update_deal', id: deal.id, patch: { analyzerState }, throwOnError: true });
      show('Analysis saved');
    } catch (e) {
      show(e?.response?.data?.error || e?.message || 'Could not save analysis');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="-m-4 md:-m-6 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/deal-analyzer" className="text-slate-500 hover:text-slate-200" title="Pick a different property">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {deal.photoUrl ? (
              <img src={deal.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-800 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-800 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white truncate">{deal.addr || 'Untitled property'}</h1>
              <p className="text-xs text-slate-500 truncate">
                {[deal.city, deal.state || deal.zip].filter(Boolean).join(', ')}
                {deal.type ? ` · ${deal.type}` : ''}
                {deal.beds ? ` · ${deal.beds}bd` : ''}{deal.baths ? `/${deal.baths}ba` : ''}
                {deal.sqft ? ` · ${Number(deal.sqft).toLocaleString()} sqft` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/deal-analyzer" className="px-3 py-2 text-xs rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 flex items-center gap-1.5">
              <Repeat2 className="w-3.5 h-3.5" /> Switch property
            </Link>
            <button
              onClick={saveAnalysis}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-amber-500 text-slate-950 font-medium hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Deal'}
            </button>
          </div>
        </div>
        {toastNode}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {STRATS.map(({ k, label, icon: Icon }) => {
            const active = strategy === k;
            return (
              <button
                key={k}
                onClick={() => setStrategy(k)}
                className={`px-4 py-2 text-sm rounded-md border flex items-center gap-2 transition ${
                  active
                    ? 'bg-sky-500/15 border-sky-500/60 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            );
          })}
        </div>

        <div className="border-b border-slate-800 mb-5">
          <div className="flex items-center gap-1">
            {SUBTABS.map(({ k, label }) => {
              const active = subtab === k;
              return (
                <button
                  key={k}
                  onClick={() => setSubtab(k)}
                  className={`px-5 py-2.5 text-sm border-b-2 -mb-px transition ${
                    active
                      ? 'border-amber-400 text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-5 space-y-5">
            {subtab === 'property' && (
              <Card title="Property">
                <Field label="Purchase price" prefix="$" value={purchasePrice} onChange={setPurchasePrice} />
                <Field label="ARV (after-repair value)" prefix="$" value={arv} onChange={setArv} />
              </Card>
            )}
            {subtab === 'financing' && (
              <Card title="Financing">
                <Field label="Down payment" suffix="%" value={downPct} onChange={setDownPct} />
                <Field label="Interest rate" suffix="%" value={rate} onChange={setRate} step={0.125} />
                <Field label="Term" suffix="yrs" value={term} onChange={setTerm} />
                <Field label="Closing costs" suffix="%" value={closingPct} onChange={setClosingPct} step={0.1} />
                {strategy === 'brrrr' && (
                  <>
                    <Divider label="Refinance" />
                    <Field label="Refi ARV" prefix="$" value={refiArv} onChange={setRefiArv} />
                    <Field label="Refi LTV" suffix="%" value={refiLTV} onChange={setRefiLTV} />
                    <Field label="Refi rate" suffix="%" value={refiRate} onChange={setRefiRate} step={0.125} />
                  </>
                )}
              </Card>
            )}
            {subtab === 'income' && (
              <Card title="Income & Operations">
                <Field label="Monthly rent" prefix="$" value={monthlyRent} onChange={setMonthlyRent} />
                <Field label="Vacancy" suffix="%" value={vacancyPct} onChange={setVacancyPct} />
                <Field label="Taxes (yr)" prefix="$" value={taxesYr} onChange={setTaxesYr} />
                <Field label="Insurance (yr)" prefix="$" value={insYr} onChange={setInsYr} />
                <Field label="Property mgmt" suffix="%" value={mgmtPct} onChange={setMgmtPct} />
                <Field label="Maintenance" suffix="%" value={maintPct} onChange={setMaintPct} />
                <Field label="CapEx reserve" suffix="%" value={capexPct} onChange={setCapexPct} />
                <Field label="Holding months" value={holdingMo} onChange={setHoldingMo} />
              </Card>
            )}
            {subtab === 'rehab' && (
              <RehabEstimator
                override={rehabOverride}
                setOverride={setRehabOverride}
                items={items}
                setItems={setItems}
              />
            )}
          </div>

          <div className="col-span-12 lg:col-span-7 space-y-5">
            {strategy === 'flip' ? (
              <FlipResults m={m} arv={arv} purchasePrice={purchasePrice} />
            ) : (
              <RentalResults m={m} purchasePrice={purchasePrice} />
            )}
            {isHold && (
              <>
                <InvestmentSummary m={m} />
                <ExpenseBreakdown m={m} />
                <Projection m={m} />
              </>
            )}
            {strategy === 'brrrr' && <BrrrAnalysis m={m} />}
            <Comps />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function RehabEstimator({ override, setOverride, items, setItems }) {
  const total = items.reduce((s, i) => s + (i.cost || 0), 0);
  const addItem = () => setItems([...items, { id: `r${Date.now()}`, category: 'Other', description: '', cost: 0 }]);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Rehab Estimator</p>
          <p className="text-2xl font-semibold text-white mt-0.5">{fmt(override || total)}</p>
        </div>
        <button onClick={addItem} className="px-3 py-1.5 text-xs rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Total Rehab (manual override)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input type="number" value={override} onChange={(e) => setOverride(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md py-2 pl-7 pr-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500/60" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Or use line items below for detailed estimate</p>
        </div>
        <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-500 uppercase tracking-wider px-1">
          <div className="col-span-4">Category</div>
          <div className="col-span-5">Description</div>
          <div className="col-span-2">Cost</div>
          <div className="col-span-1" />
        </div>
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
            <select value={it.category}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, category: e.target.value } : x))}
              className="col-span-4 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100">
              {['Flooring', 'Interior Paint', 'Kitchen', 'Bathroom', 'Roof', 'HVAC', 'Electrical', 'Plumbing', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input value={it.description}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, description: e.target.value } : x))}
              className="col-span-5 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100" />
            <input type="number" value={it.cost}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, cost: Number(e.target.value) || 0 } : x))}
              className="col-span-2 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100" />
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))}
              className="col-span-1 text-slate-500 hover:text-rose-400 flex justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-sm">
          <span className="text-slate-400">Total Estimate</span>
          <span className="text-white font-semibold">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

function RentalResults({ m, purchasePrice }) {
  const onePct = purchasePrice > 0 ? ((m.grossYr / 12) / purchasePrice) * 100 : 0;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">Key Metrics</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Kpi label="Monthly Cash Flow" value={fmtSigned(m.cashFlowYr / 12)} sub={`${fmtSigned(m.cashFlowYr)}/yr`} tone={m.cashFlowYr >= 0 ? 'ok' : 'bad'} />
        <Kpi label="Cash-on-Cash Return" value={fmtPct(m.coc)} tone={m.coc >= 8 ? 'good' : m.coc >= 0 ? 'ok' : 'bad'} />
        <Kpi label="Cap Rate" value={fmtPct(m.cap)} tone={m.cap >= 6 ? 'good' : 'ok'} />
        <Kpi label="Annual NOI" value={fmt(m.noi)} tone="good" />
      </div>
      <div className="space-y-2">
        <RuleRow label="1% Rule" value={fmtPct(onePct)} pass={onePct >= 1} />
        <RuleRow label="Cash-on-Cash" value={fmtPct(m.coc)} pass={m.coc >= 8} />
        <RuleRow label="Cap Rate" value={fmtPct(m.cap)} pass={m.cap >= 6} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const toneText = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-amber-300';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneText}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function RuleRow({ label, value, pass }) {
  const tone = pass ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5';
  const valTone = pass ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className={`flex items-center justify-between rounded-md border ${tone} px-3 py-2 text-sm`}>
      <span className="flex items-center gap-2 text-slate-300">
        {pass ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
        {label}
      </span>
      <span className={valTone}>{value}</span>
    </div>
  );
}

function InvestmentSummary({ m }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-3">Investment Summary</h3>
      <Row label="Total Cash Invested" value={fmt(m.totalCash)} />
      <Row label="Loan Amount" value={fmt(m.loan)} />
      <Row label="Monthly Mortgage" value={fmt(m.piti)} />
      <Row label="Gross Rent Multiplier" value={`${m.grm.toFixed(1)}x`} />
      <Row label="Operating Expenses" value={`${fmt(m.opex / 12)}/mo`} />
      <div className="border-t border-slate-800 mt-2 pt-2">
        <Row label="Projected Sale Proceeds (5yr)" value={fmt(m.projSale)} accent />
        <Row label="Total Return" value={fmt(m.totalReturn)} accent />
      </div>
    </div>
  );
}

function ExpenseBreakdown({ m }) {
  const items = [
    { label: 'Mortgage (P&I)', val: m.piti },
    { label: 'Property Tax', val: 350 },
    { label: 'Insurance', val: 117 },
    { label: 'Property Mgmt', val: m.mgmt / 12 },
    { label: 'Maintenance', val: m.maint / 12 },
    { label: 'CapEx Reserve', val: m.capex / 12 },
  ];
  const max = Math.max(...items.map((i) => i.val), 1);
  const total = items.reduce((s, i) => s + i.val, 0);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">Monthly Expense Breakdown</h3>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.label} className="grid grid-cols-12 items-center gap-3 text-sm">
            <span className="col-span-4 text-slate-400">{it.label}</span>
            <div className="col-span-6 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-500/70" style={{ width: `${Math.min(100, (it.val / max) * 100)}%` }} />
            </div>
            <span className="col-span-2 text-right text-slate-200">{fmt(it.val)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 mt-3 pt-3 flex items-center justify-between text-sm">
        <span className="text-slate-300 font-medium">Total</span>
        <span className="text-white font-semibold">{fmt(total)}</span>
      </div>
    </div>
  );
}

function Projection({ m }) {
  const yrs = m.years;
  const max = Math.max(...yrs.map((y) => y.propValue));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">5-Year Projection</h3>
      <div className="h-44 relative border-l border-b border-slate-800">
        <svg viewBox="0 0 500 160" className="w-full h-full" preserveAspectRatio="none">
          <polyline fill="none" stroke="rgb(245 158 11 / 0.9)" strokeWidth="2"
            points={yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(' ')} />
          <polyline fill="rgb(245 158 11 / 0.1)" stroke="none"
            points={`0,160 ${yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(' ')} 500,160`} />
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
        {yrs.map((y) => <span key={y.year}>Y {y.year}</span>)}
      </div>
      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 text-left font-normal">Year</th>
            <th className="py-2 text-right font-normal">Cash Flow</th>
            <th className="py-2 text-right font-normal">NOI</th>
            <th className="py-2 text-right font-normal">Prop. Value</th>
          </tr>
        </thead>
        <tbody>
          {yrs.map((y) => (
            <tr key={y.year} className="border-b border-slate-800/60">
              <td className="py-1.5 text-slate-300">{y.year}</td>
              <td className={`py-1.5 text-right ${y.cashFlow < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{fmtSigned(y.cashFlow)}</td>
              <td className="py-1.5 text-right text-slate-300">{fmt(y.noi)}</td>
              <td className="py-1.5 text-right text-slate-200">{fmt(y.propValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrrrAnalysis({ m }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-3">BRRRR Analysis</h3>
      <Row label="Refi Loan Amount" value={fmt(m.refiLoan)} />
      <Row label="Cash Out Received" value={fmtSigned(m.cashOut)} tone={m.cashOut < 0 ? 'bad' : 'good'} />
      <Row label="Cash Left in Deal" value={fmt(m.cashLeft)} />
      <Row label="New Mortgage" value={`${fmt(m.newPiti)}/mo`} />
      <div className="border-t border-slate-800 mt-2 pt-2">
        <Row label="CoC After Refinance" value={fmtPct(m.cocAfterRefi)} tone={m.cocAfterRefi >= 8 ? 'good' : 'bad'} />
        <Row label="Equity Created" value={fmtSigned(m.equityCreated)} tone={m.equityCreated < 0 ? 'bad' : 'good'} />
      </div>
    </div>
  );
}

function FlipResults({ m, arv, purchasePrice }) {
  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-100 mb-4">Fix & Flip Analysis</h3>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Net Profit" value={fmtSigned(m.flipNetProfit)} tone={m.flipNetProfit >= 0 ? 'good' : 'bad'} />
          <Kpi label="Total ROI" value={fmtPct(m.flipROI)} tone={m.flipROI >= 0 ? 'good' : 'bad'} />
          <Kpi label="Annualized ROI" value={fmtPct(m.flipAnnROI)} tone={m.flipAnnROI >= 0 ? 'good' : 'bad'} />
          <Kpi label="Total Investment" value={fmt(m.flipInvestment)} tone="ok" />
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <Row label="ARV" value={fmt(arv)} />
        <Row label="Purchase Price" value={fmt(purchasePrice)} />
        <Row label="Rehab Costs" value={fmt(m.rehab)} />
        <Row label="Closing Costs" value={fmt(m.closingBuy)} />
        <Row label="Holding Costs" value={fmt(m.holdingTotal)} />
        <div className="border-t border-slate-800 mt-2 pt-2">
          <Row label="Max Allowable Offer (70% Rule)" value={fmtSigned(m.mao)} accent tone={m.mao < 0 ? 'bad' : 'good'} />
        </div>
      </div>
    </>
  );
}

function Comps() {
  const comps = [
    { addr: '110 Oak Ave', beds: '3bd/2ba', sqft: '1,640 sqft', ppsf: '$190/sqft', date: '2024-11-01', price: 295000 },
    { addr: '201 Elm Dr', beds: '3bd/2ba', sqft: '1,800 sqft', ppsf: '$155/sqft', date: '2024-10-15', price: 280000 },
  ];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-slate-100">Comparable Sales (Comps)</h3>
          <p className="text-[11px] text-slate-500">Avg: $288K · $172/sqft</p>
        </div>
        <button className="px-3 py-1.5 text-xs rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Comp
        </button>
      </div>
      <div className="space-y-2">
        {comps.map((c) => (
          <div key={c.addr} className="flex items-center justify-between border-t border-slate-800 pt-2 text-sm">
            <div>
              <p className="text-slate-200 flex items-center gap-2"><Home className="w-3.5 h-3.5 text-amber-400" /> {c.addr}</p>
              <p className="text-[11px] text-slate-500 ml-5">{c.beds} · {c.sqft} · {c.ppsf} · {c.date}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-100 font-medium">{fmt(c.price)}</span>
              <button className="text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, prefix, suffix, step }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{prefix}</span>}
        <input type="number" step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full bg-slate-950 border border-slate-800 rounded-md py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500/60 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-12' : 'pr-3'}`} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function Divider({ label }) {
  return (
    <div className="col-span-2 flex items-center gap-3 mt-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function Row({ label, value, accent, tone }) {
  const toneCls = tone === 'bad' ? 'text-rose-300' : tone === 'good' ? 'text-emerald-300' : '';
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${accent ? 'font-medium' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <span className={`${accent ? 'text-amber-300' : 'text-slate-200'} ${toneCls}`}>{value}</span>
    </div>
  );
}

// ─── Property Selector ────────────────────────────────────────────────────
// Shown when the user navigates to /deal-analyzer with no property
// selected. Lists every deal from the Properties tab so the user can
// pick which one to analyze. Selecting a card routes to
// /deal-analyzer/:dealId, where the analyzer prefills from the deal.

function PropertySelector({ deals, loaded }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const filtered = deals.filter((d) => {
    if (filter !== 'All' && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${d.addr || ''} ${d.zip || ''} ${d.city || ''} ${d.state || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const counts = deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Deal Analyzer</h1>
        <p className="text-sm text-slate-400 mt-1">Choose a property to analyze</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address, city, ZIP..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {['All', ...DEAL_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filter === s
                ? 'bg-amber-400 text-slate-900'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
            }`}
          >
            {s} {s !== 'All' ? counts[s] || 0 : deals.length}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="py-24 text-center text-xs text-slate-500 font-mono">Loading properties…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-300 mb-2">{deals.length === 0 ? 'No properties yet.' : 'No matches.'}</p>
          <p className="text-xs text-slate-500">
            {deals.length === 0
              ? <>Add a deal in <Link to="/admin" className="text-amber-400 hover:underline">Properties</Link> to get started.</>
              : 'Try a different filter or search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const spread = (d.arv > 0 && d.ask > 0) ? Math.round(((d.arv - d.ask) / d.arv) * 100) : null;
            return (
              <Link
                key={d.id}
                to={`/deal-analyzer/${d.id}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700 transition-colors px-4 py-4"
              >
                <div className="flex items-center gap-4">
                  {d.photoUrl ? (
                    <img src={d.photoUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-800 flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-800 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{d.addr || '—'}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {[d.city, d.state || d.zip].filter(Boolean).join(', ')}
                      {d.type ? ` · ${d.type}` : ''}
                      {d.beds ? ` · ${d.beds}bd` : ''}{d.baths ? ` / ${d.baths}ba` : ''}
                      {d.sqft ? ` / ${Number(d.sqft).toLocaleString()} sqft` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p>
                    {d.arv > 0 && (
                      <p className="text-emerald-400 text-xs mt-0.5">ARV: ${Number(d.arv).toLocaleString()}</p>
                    )}
                    {spread != null && spread !== 0 && (
                      <p className="text-slate-500 text-[10px] mt-0.5">{spread}% spread</p>
                    )}
                    {d.status && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] border border-emerald-500/30">
                        {d.status}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
