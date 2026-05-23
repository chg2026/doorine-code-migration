import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Home, Wrench, ArrowLeft, Plus, Trash2, AlertCircle,
  CheckCircle2, Save, Repeat, Layers, Briefcase, Building2, Search, Repeat2,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import FlipBrrrrCalc from '../components/FlipBrrrrCalc.jsx';
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
  { k: 'brrrr_adv', label: 'Advanced BRRRR', icon: Repeat },
  { k: 'flip_adv', label: 'Advanced Fix & Flip', icon: Wrench },
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
    return <Layout><div className="py-32 text-center text-xs text-[#86868b] font-mono">Loading…</div></Layout>;
  }

  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal) {
    return (
      <Layout>
        <div className="py-24 text-center">
          <p className="text-[#3a3a3c] mb-3">That property isn't in your list.</p>
          <Link to="/deal-analyzer" className="text-[#b8860b] text-sm hover:underline">Pick a property to analyze →</Link>
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

  // analyzerState is now an array of saved analyses. Legacy single-object
  // saves are coerced into a 1-item array. The most-recent saved analysis
  // (by savedAt) seeds the form; missing fields fall back to sensible
  // defaults.
  const savedAnalyses = React.useMemo(() => {
    const raw = deal.analyzerState;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return [raw]; // legacy single object
    return [];
  }, [deal.analyzerState]);

  const s = React.useMemo(() => {
    if (savedAnalyses.length === 0) return {};
    const sorted = [...savedAnalyses].sort((a, b) => {
      const ta = new Date(a?.savedAt || 0).getTime();
      const tb = new Date(b?.savedAt || 0).getTime();
      return tb - ta;
    });
    return sorted[0] || {};
  }, [savedAnalyses]);
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

  // ─── Comparable sales ────────────────────────────────────────────────
  // Comps live alongside the deal (not inside any one saved analysis),
  // so they're persisted via the flexible `imConfig` JSONB blob under
  // `imConfig.comps`. (`comps` is not in the server's DEAL_FIELDS
  // allow-list, and analyzerState is an array of saved analyses — not
  // an object — so neither is a good direct home.)
  const initialComps = Array.isArray(deal.imConfig?.comps) ? deal.imConfig.comps : [];
  const [comps, setComps] = useState(initialComps);
  const [showCompModal, setShowCompModal] = useState(false);
  const EMPTY_COMP_FORM = { addr: '', price: '', beds: '', baths: '', sqft: '', date: '' };
  const [compForm, setCompForm] = useState(EMPTY_COMP_FORM);

  function persistComps(next) {
    const baseCfg = (deal.imConfig && typeof deal.imConfig === 'object') ? deal.imConfig : {};
    dispatch({
      type: 'update_deal',
      id: deal.id,
      patch: { imConfig: { ...baseCfg, comps: next } },
    });
  }

  function handleAddComp() {
    if (!compForm.addr || !compForm.price) return;
    const newComp = {
      id: Date.now(),
      addr: compForm.addr,
      price: Number(String(compForm.price).replace(/[^0-9.]/g, '')) || 0,
      beds: compForm.beds,
      baths: compForm.baths,
      sqft: Number(String(compForm.sqft).replace(/[^0-9.]/g, '')) || 0,
      date: compForm.date,
    };
    const updated = [...comps, newComp];
    setComps(updated);
    setShowCompModal(false);
    setCompForm(EMPTY_COMP_FORM);
    persistComps(updated);
  }

  function handleRemoveComp(id) {
    const updated = comps.filter((c) => c.id !== id);
    setComps(updated);
    persistComps(updated);
  }

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
    let newAnalysis;
    if (strategy === 'flip_adv' || strategy === 'brrrr_adv') {
      // These tabs use the iframe calculator — save its state directly.
      newAnalysis = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `an_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        v: 2,
        source: 'iframe',
        strategy: strategy === 'brrrr_adv' ? 'brrrr' : 'flip',
        label: `${stratLabel} Analysis`,
        savedAt: new Date().toISOString(),
        calcState: deal?.imConfig?.calcState || null,
        summary: deal?.imConfig?.summary || null,
      };
    } else {
      const monthlyCashFlow = m.cashFlowYr / 12;
      const roi = m.coc;
      newAnalysis = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `an_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        v: 1,
        strategy,
        label: `${stratLabel} Analysis`,
        savedAt: new Date().toISOString(),
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
    }
    const nextAnalyses = [...savedAnalyses, newAnalysis];
    const baseCfg = (deal.imConfig && typeof deal.imConfig === 'object') ? deal.imConfig : {};
    const imConfigPatch = { ...baseCfg, latestAnalysis: newAnalysis };
    try {
      await dispatch({
        type: 'update_deal',
        id: deal.id,
        patch: { analyzerState: nextAnalyses },
        throwOnError: true,
      });
      await dispatch({
        type: 'update_deal',
        id: deal.id,
        patch: { imConfig: imConfigPatch },
      });
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
            <Link to="/deal-analyzer" className="text-[#86868b] hover:text-[#3a3a3c]" title="Pick a different property">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link
              to={`/admin/deal/${deal.id}`}
              className="text-[#6e6e73] hover:text-[#1d1d1f] text-sm flex items-center gap-1"
            >
              ← Back to property
            </Link>
            {deal.photoUrl ? (
              <img src={deal.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-[rgba(0,0,0,0.08)] flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-[#86868b]" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-[#1d1d1f] truncate">{deal.addr || 'Untitled property'}</h1>
              <p className="text-xs text-[#86868b] truncate">
                {[deal.city, deal.state || deal.zip].filter(Boolean).join(', ')}
                {deal.type ? ` · ${deal.type}` : ''}
                {deal.beds ? ` · ${deal.beds}bd` : ''}{deal.baths ? `/${deal.baths}ba` : ''}
                {deal.sqft ? ` · ${Number(deal.sqft).toLocaleString()} sqft` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/deal-analyzer" className="px-3 py-2 text-xs rounded-md border border-[rgba(0,0,0,0.08)] text-[#3a3a3c] hover:text-[#1d1d1f] hover:border-[rgba(0,0,0,0.10)] flex items-center gap-1.5">
              <Repeat2 className="w-3.5 h-3.5" /> Switch property
            </Link>
            <button
              onClick={saveAnalysis}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-[#b8860b] text-white font-medium hover:bg-[#b8860b] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
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
                    : 'bg-white border-[rgba(0,0,0,0.08)] text-[#6e6e73] hover:text-[#3a3a3c] hover:border-[rgba(0,0,0,0.08)]'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            );
          })}
        </div>

        {(strategy === 'flip_adv' || strategy === 'brrrr_adv') ? (
          <div className="-mx-6 -mb-6">
            <FlipBrrrrCalc deal={deal} dispatch={dispatch} mode={strategy === 'brrrr_adv' ? 'brrrr' : 'flip'} />
          </div>
        ) : (<>
        <div className="border-b border-[rgba(0,0,0,0.08)] mb-5">
          <div className="flex items-center gap-1">
            {SUBTABS.map(({ k, label }) => {
              const active = subtab === k;
              return (
                <button
                  key={k}
                  onClick={() => setSubtab(k)}
                  className={`px-5 py-2.5 text-sm border-b-2 -mb-px transition ${
                    active
                      ? 'border-[#b8860b] text-[#1d1d1f]'
                      : 'border-transparent text-[#86868b] hover:text-[#3a3a3c]'
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
            <ResearchTabs
              tabs={[
                {
                  key: 'comps',
                  label: 'Comps',
                  render: () => (
                    <Comps
                      comps={comps}
                      onAdd={handleAddComp}
                      onRemove={handleRemoveComp}
                      showModal={showCompModal}
                      setShowModal={setShowCompModal}
                      compForm={compForm}
                      setCompForm={setCompForm}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>
        </>)}
      </div>
    </Layout>
  );
}

function RehabEstimator({ override, setOverride, items, setItems }) {
  const total = items.reduce((s, i) => s + (i.cost || 0), 0);
  const addItem = () => setItems([...items, { id: `r${Date.now()}`, category: 'Other', description: '', cost: 0 }]);
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40">
      <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#86868b]">Rehab Estimator</p>
          <p className="text-2xl font-semibold text-[#1d1d1f] mt-0.5">{fmt(override || total)}</p>
        </div>
        <button onClick={addItem} className="px-3 py-1.5 text-xs rounded-md border border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.10)] text-[#3a3a3c] flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-[#6e6e73] mb-1.5">Total Rehab (manual override)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-sm">$</span>
            <input type="number" value={override} onChange={(e) => setOverride(Number(e.target.value) || 0)}
              className="w-full bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-2 pl-7 pr-3 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]/60" />
          </div>
          <p className="text-[11px] text-[#86868b] mt-1">Or use line items below for detailed estimate</p>
        </div>
        <div className="grid grid-cols-12 gap-2 text-[11px] text-[#86868b] uppercase tracking-wider px-1">
          <div className="col-span-4">Category</div>
          <div className="col-span-5">Description</div>
          <div className="col-span-2">Cost</div>
          <div className="col-span-1" />
        </div>
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
            <select value={it.category}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, category: e.target.value } : x))}
              className="col-span-4 bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-1.5 px-2 text-sm text-[#1d1d1f]">
              {['Flooring', 'Interior Paint', 'Kitchen', 'Bathroom', 'Roof', 'HVAC', 'Electrical', 'Plumbing', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input value={it.description}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, description: e.target.value } : x))}
              className="col-span-5 bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-1.5 px-2 text-sm text-[#1d1d1f]" />
            <input type="number" value={it.cost}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, cost: Number(e.target.value) || 0 } : x))}
              className="col-span-2 bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-1.5 px-2 text-sm text-[#1d1d1f]" />
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))}
              className="col-span-1 text-[#86868b] hover:text-rose-400 flex justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="border-t border-[rgba(0,0,0,0.08)] pt-3 flex items-center justify-between text-sm">
          <span className="text-[#6e6e73]">Total Estimate</span>
          <span className="text-[#1d1d1f] font-semibold">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

function RentalResults({ m, purchasePrice }) {
  const onePct = purchasePrice > 0 ? ((m.grossYr / 12) / purchasePrice) * 100 : 0;
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <h3 className="text-sm font-medium text-[#1d1d1f] mb-4">Key Metrics</h3>
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
  const toneText = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-[#b8860b]';
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#f5f5f7]/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneText}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#86868b] mt-1">{sub}</p>}
    </div>
  );
}

function RuleRow({ label, value, pass }) {
  const tone = pass ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5';
  const valTone = pass ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className={`flex items-center justify-between rounded-md border ${tone} px-3 py-2 text-sm`}>
      <span className="flex items-center gap-2 text-[#3a3a3c]">
        {pass ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
        {label}
      </span>
      <span className={valTone}>{value}</span>
    </div>
  );
}

function InvestmentSummary({ m }) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">Investment Summary</h3>
      <Row label="Total Cash Invested" value={fmt(m.totalCash)} />
      <Row label="Loan Amount" value={fmt(m.loan)} />
      <Row label="Monthly Mortgage" value={fmt(m.piti)} />
      <Row label="Gross Rent Multiplier" value={`${m.grm.toFixed(1)}x`} />
      <Row label="Operating Expenses" value={`${fmt(m.opex / 12)}/mo`} />
      <div className="border-t border-[rgba(0,0,0,0.08)] mt-2 pt-2">
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
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <h3 className="text-sm font-medium text-[#1d1d1f] mb-4">Monthly Expense Breakdown</h3>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.label} className="grid grid-cols-12 items-center gap-3 text-sm">
            <span className="col-span-4 text-[#6e6e73]">{it.label}</span>
            <div className="col-span-6 h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
              <div className="h-full bg-[rgba(184,134,11,0.10)]" style={{ width: `${Math.min(100, (it.val / max) * 100)}%` }} />
            </div>
            <span className="col-span-2 text-right text-[#3a3a3c]">{fmt(it.val)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[rgba(0,0,0,0.08)] mt-3 pt-3 flex items-center justify-between text-sm">
        <span className="text-[#3a3a3c] font-medium">Total</span>
        <span className="text-[#1d1d1f] font-semibold">{fmt(total)}</span>
      </div>
    </div>
  );
}

function Projection({ m }) {
  const yrs = m.years;
  const max = Math.max(...yrs.map((y) => y.propValue));
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <h3 className="text-sm font-medium text-[#1d1d1f] mb-4">5-Year Projection</h3>
      <div className="h-44 relative border-l border-b border-[rgba(0,0,0,0.08)]">
        <svg viewBox="0 0 500 160" className="w-full h-full" preserveAspectRatio="none">
          <polyline fill="none" stroke="rgb(245 158 11 / 0.9)" strokeWidth="2"
            points={yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(' ')} />
          <polyline fill="rgb(245 158 11 / 0.1)" stroke="none"
            points={`0,160 ${yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(' ')} 500,160`} />
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-[#86868b] mt-1 px-1">
        {yrs.map((y) => <span key={y.year}>Y {y.year}</span>)}
      </div>
      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#86868b] border-b border-[rgba(0,0,0,0.08)]">
            <th className="py-2 text-left font-normal">Year</th>
            <th className="py-2 text-right font-normal">Cash Flow</th>
            <th className="py-2 text-right font-normal">NOI</th>
            <th className="py-2 text-right font-normal">Prop. Value</th>
          </tr>
        </thead>
        <tbody>
          {yrs.map((y) => (
            <tr key={y.year} className="border-b border-[rgba(0,0,0,0.08)]/60">
              <td className="py-1.5 text-[#3a3a3c]">{y.year}</td>
              <td className={`py-1.5 text-right ${y.cashFlow < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{fmtSigned(y.cashFlow)}</td>
              <td className="py-1.5 text-right text-[#3a3a3c]">{fmt(y.noi)}</td>
              <td className="py-1.5 text-right text-[#3a3a3c]">{fmt(y.propValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrrrAnalysis({ m }) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <h3 className="text-sm font-medium text-[#1d1d1f] mb-3">BRRRR Analysis</h3>
      <Row label="Refi Loan Amount" value={fmt(m.refiLoan)} />
      <Row label="Cash Out Received" value={fmtSigned(m.cashOut)} tone={m.cashOut < 0 ? 'bad' : 'good'} />
      <Row label="Cash Left in Deal" value={fmt(m.cashLeft)} />
      <Row label="New Mortgage" value={`${fmt(m.newPiti)}/mo`} />
      <div className="border-t border-[rgba(0,0,0,0.08)] mt-2 pt-2">
        <Row label="CoC After Refinance" value={fmtPct(m.cocAfterRefi)} tone={m.cocAfterRefi >= 8 ? 'good' : 'bad'} />
        <Row label="Equity Created" value={fmtSigned(m.equityCreated)} tone={m.equityCreated < 0 ? 'bad' : 'good'} />
      </div>
    </div>
  );
}

function FlipResults({ m, arv, purchasePrice }) {
  return (
    <>
      <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
        <h3 className="text-sm font-medium text-[#1d1d1f] mb-4">Fix & Flip Analysis</h3>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Net Profit" value={fmtSigned(m.flipNetProfit)} tone={m.flipNetProfit >= 0 ? 'good' : 'bad'} />
          <Kpi label="Total ROI" value={fmtPct(m.flipROI)} tone={m.flipROI >= 0 ? 'good' : 'bad'} />
          <Kpi label="Annualized ROI" value={fmtPct(m.flipAnnROI)} tone={m.flipAnnROI >= 0 ? 'good' : 'bad'} />
          <Kpi label="Total Investment" value={fmt(m.flipInvestment)} tone="ok" />
        </div>
      </div>
      <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
        <Row label="ARV" value={fmt(arv)} />
        <Row label="Purchase Price" value={fmt(purchasePrice)} />
        <Row label="Rehab Costs" value={fmt(m.rehab)} />
        <Row label="Closing Costs" value={fmt(m.closingBuy)} />
        <Row label="Holding Costs" value={fmt(m.holdingTotal)} />
        <div className="border-t border-[rgba(0,0,0,0.08)] mt-2 pt-2">
          <Row label="Max Allowable Offer (70% Rule)" value={fmtSigned(m.mao)} accent tone={m.mao < 0 ? 'bad' : 'good'} />
        </div>
      </div>
    </>
  );
}

function ResearchTabs({ tabs }) {
  const [active, setActive] = React.useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) || tabs[0];
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.key === active);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    setActive(tabs[next].key);
  };
  return (
    <div>
      <div
        role="tablist"
        aria-label="Research view"
        onKeyDown={onKey}
        style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--card)', marginBottom: 12 }}
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.key)}
              style={{
                border: 'none', cursor: 'pointer', padding: '7px 16px', fontSize: 12,
                fontFamily: 'var(--sans)', fontWeight: 600,
                background: on ? 'var(--ink)' : 'transparent',
                color: on ? '#fff' : 'var(--mute)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current?.render()}</div>
    </div>
  );
}

function Comps({ comps, onAdd, onRemove, showModal, setShowModal, compForm, setCompForm }) {
  const EMPTY_COMP_FORM = { addr: '', price: '', beds: '', baths: '', sqft: '', date: '' };
  const avgPrice = comps.length
    ? Math.round(comps.reduce((s, c) => s + (c.price || 0), 0) / comps.length)
    : 0;
  const withSqft = comps.filter((c) => c.sqft > 0);
  const avgPpsf = withSqft.length
    ? Math.round(withSqft.reduce((s, c) => s + c.price / c.sqft, 0) / withSqft.length)
    : 0;

  const subline = comps.length
    ? `Avg: ${fmt(avgPrice)}${avgPpsf > 0 ? ` · $${avgPpsf}/sqft` : ''}`
    : 'No comps yet — add nearby sales to estimate ARV.';

  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-[#1d1d1f]">Comparable Sales (Comps)</h3>
          <p className="text-[11px] text-[#86868b]">{subline}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 text-xs rounded-md border border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.10)] text-[#3a3a3c] flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Comp
        </button>
      </div>

      {comps.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#86868b]">
          Add nearby sales to anchor your ARV.
        </div>
      ) : (
        <div className="space-y-2">
          {comps.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-t border-[rgba(0,0,0,0.08)] pt-2 text-sm">
              <div>
                <p className="text-[#3a3a3c] flex items-center gap-2">
                  <Home className="w-3.5 h-3.5 text-[#b8860b]" /> {c.addr}
                </p>
                <p className="text-[11px] text-[#86868b] ml-5">
                  {[
                    c.beds && `${c.beds}bd`,
                    c.baths && `${c.baths}ba`,
                    c.sqft > 0 && `${c.sqft.toLocaleString()} sqft`,
                    c.sqft > 0 && c.price > 0 && `$${Math.round(c.price / c.sqft)}/sqft`,
                    c.date,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#1d1d1f] font-medium">{fmt(c.price || 0)}</span>
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  className="text-[#86868b] hover:text-rose-400"
                  aria-label="Remove comp"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-[360px] max-w-[90vw] rounded-xl bg-white p-7 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-medium text-[#1d1d1f] mb-5">Add comp</h4>
            {[
              { key: 'addr',  label: 'Address',    placeholder: '123 Main St' },
              { key: 'price', label: 'Sale price', placeholder: '295000' },
              { key: 'beds',  label: 'Bedrooms',   placeholder: '3' },
              { key: 'baths', label: 'Bathrooms',  placeholder: '2' },
              { key: 'sqft',  label: 'Sq ft',      placeholder: '1640' },
              { key: 'date',  label: 'Sale date',  placeholder: '2024-11-01' },
            ].map(({ key, label, placeholder }) => (
              <label key={key} className="block mb-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#86868b] mb-1">{label}</span>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={compForm[key]}
                  onChange={(e) => setCompForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-2 px-3 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]/60"
                />
              </label>
            ))}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onAdd}
                disabled={!compForm.addr || !compForm.price}
                className="flex-1 rounded-md bg-[#b8860b] text-white text-sm font-medium py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save comp
              </button>
              <button
                type="button"
                onClick={() => { setShowModal(false); setCompForm(EMPTY_COMP_FORM); }}
                className="rounded-md border border-[rgba(0,0,0,0.08)] text-sm text-[#3a3a3c] py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h3 className="text-sm font-medium text-[#1d1d1f]">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, prefix, suffix, step }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#6e6e73] mb-1.5">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-sm">{prefix}</span>}
        <input type="number" step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-md py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]/60 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-12' : 'pr-3'}`} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function Divider({ label }) {
  return (
    <div className="col-span-2 flex items-center gap-3 mt-2">
      <span className="text-[10px] uppercase tracking-wider text-[#86868b]">{label}</span>
      <div className="flex-1 h-px bg-[rgba(0,0,0,0.06)]" />
    </div>
  );
}

function Row({ label, value, accent, tone }) {
  const toneCls = tone === 'bad' ? 'text-rose-300' : tone === 'good' ? 'text-emerald-300' : '';
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${accent ? 'font-medium' : ''}`}>
      <span className="text-[#6e6e73]">{label}</span>
      <span className={`${accent ? 'text-[#b8860b]' : 'text-[#3a3a3c]'} ${toneCls}`}>{value}</span>
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
        <h1 className="text-2xl font-semibold text-[#1d1d1f]">Deal Analyzer</h1>
        <p className="text-sm text-[#6e6e73] mt-1">Choose a property to analyze</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e6e73]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address, city, ZIP..."
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]/60"
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
                ? 'bg-[#b8860b] text-white'
                : 'bg-[rgba(0,0,0,0.06)] text-[#6e6e73] border border-[rgba(0,0,0,0.08)] hover:text-[#1d1d1f]'
            }`}
          >
            {s} {s !== 'All' ? counts[s] || 0 : deals.length}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="py-24 text-center text-xs text-[#86868b] font-mono">Loading properties…</div>
      ) : deals.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <div className="inline-flex w-12 h-12 rounded-full bg-[rgba(0,0,0,0.06)] items-center justify-center mb-4">
            <Search className="w-5 h-5 text-[#86868b]" />
          </div>
          <p className="text-[#3a3a3c] font-medium mb-1">No properties yet</p>
          <p className="text-sm text-[#6e6e73] mb-6">
            Add your first deal in Properties to start analyzing deals.
          </p>
          <Link
            to="/admin/deal/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:opacity-90"
          >
            Add your first property
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[#3a3a3c] mb-2">No matches.</p>
          <p className="text-xs text-[#86868b]">Try a different filter or search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const spread = (d.arv > 0 && d.ask > 0) ? Math.round(((d.arv - d.ask) / d.arv) * 100) : null;
            return (
              <Link
                key={d.id}
                to={`/deal-analyzer/${d.id}`}
                className="block rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 hover:bg-white/70 hover:border-[rgba(0,0,0,0.08)] transition-colors px-4 py-4"
              >
                <div className="flex items-center gap-4">
                  {d.photoUrl ? (
                    <img src={d.photoUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-[rgba(0,0,0,0.08)] flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-[#86868b]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[#1d1d1f] text-sm font-semibold truncate">{d.addr || '—'}</p>
                    <p className="text-xs text-[#6e6e73] truncate mt-0.5">
                      {[d.city, d.state || d.zip].filter(Boolean).join(', ')}
                      {d.type ? ` · ${d.type}` : ''}
                      {d.beds ? ` · ${d.beds}bd` : ''}{d.baths ? ` / ${d.baths}ba` : ''}
                      {d.sqft ? ` / ${Number(d.sqft).toLocaleString()} sqft` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[#1d1d1f] text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p>
                    {d.arv > 0 && (
                      <p className="text-emerald-400 text-xs mt-0.5">ARV: ${Number(d.arv).toLocaleString()}</p>
                    )}
                    {spread != null && spread !== 0 && (
                      <p className="text-[#86868b] text-[10px] mt-0.5">{spread}% spread</p>
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
