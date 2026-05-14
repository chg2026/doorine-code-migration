import { useMemo, useState } from "react";
import {
  Calculator, Home, Wrench, Building2, ChevronRight, Save, ArrowLeft,
  Plus, Trash2, AlertCircle, CheckCircle2, LayoutDashboard, Kanban,
  FileText, Globe, Upload, Users, ListChecks, Handshake, UserCheck,
  Zap, Eye, BarChart3, Settings, ExternalLink, Bell, LogOut, Grid3x3,
  Repeat, Layers, Briefcase,
} from "lucide-react";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtSigned = (n: number) => (n < 0 ? `-${fmt(Math.abs(n))}` : fmt(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type StratKey = "rental" | "brrrr" | "flip" | "multi" | "commercial";
type SubTab = "property" | "financing" | "income" | "rehab";

const STRATS: { k: StratKey; label: string; icon: typeof Wrench }[] = [
  { k: "rental", label: "Rental", icon: Home },
  { k: "brrrr", label: "BRRRR", icon: Repeat },
  { k: "flip", label: "Fix & Flip", icon: Wrench },
  { k: "multi", label: "Multifamily", icon: Layers },
  { k: "commercial", label: "Commercial", icon: Briefcase },
];

const SUBTABS: { k: SubTab; label: string }[] = [
  { k: "property", label: "Property" },
  { k: "financing", label: "Financing" },
  { k: "income", label: "Income" },
  { k: "rehab", label: "Rehab" },
];

type RehabItem = { id: string; category: string; description: string; cost: number };

export default function DealAnalyzer() {
  const [strategy, setStrategy] = useState<StratKey>("brrrr");
  const [subtab, setSubtab] = useState<SubTab>("rehab");

  // Property
  const [purchasePrice, setPurchasePrice] = useState(295000);
  const [arv, setArv] = useState(0);

  // Financing
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.25);
  const [term, setTerm] = useState(30);
  const [closingPct, setClosingPct] = useState(2.5);

  // Income
  const [monthlyRent, setMonthlyRent] = useState(1900);
  const [vacancyPct, setVacancyPct] = useState(8);
  const [taxesYr, setTaxesYr] = useState(4200);
  const [insYr, setInsYr] = useState(1400);
  const [mgmtPct, setMgmtPct] = useState(12);
  const [maintPct, setMaintPct] = useState(10);
  const [capexPct, setCapexPct] = useState(10);
  const [holdingMo, setHoldingMo] = useState(6);

  // Rehab
  const [rehabOverride, setRehabOverride] = useState(8000);
  const [items, setItems] = useState<RehabItem[]>([
    { id: "r1", category: "Flooring", description: "LVP throughout", cost: 4500 },
    { id: "r2", category: "Interior Paint", description: "Interior paint", cost: 3500 },
  ]);

  // BRRRR refi
  const [refiArv, setRefiArv] = useState(0);
  const [refiLTV, setRefiLTV] = useState(75);
  const [refiRate, setRefiRate] = useState(7.5);

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

    // 5-yr projection (3% appreciation, 2% rent growth)
    const years = [1, 2, 3, 4, 5].map((y) => {
      const rentMul = Math.pow(1.02, y - 1);
      const appMul = Math.pow(1.03, y);
      const cf = (grossYr * rentMul - opex) - piti * 12;
      return {
        year: y,
        cashFlow: cf,
        noi: grossYr * rentMul - opex,
        propValue: purchasePrice * appMul,
      };
    });
    const sale5 = years[4].propValue;
    const projSale = sale5 * 0.94 - loan * 0.95;
    const totalReturn = years.reduce((s, y) => s + y.cashFlow, 0) + (projSale - totalCash);

    // BRRRR
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

    // Flip
    const sellingCostsPct = 8;
    const sellingCosts = arv * (sellingCostsPct / 100);
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

  const isHold = strategy === "rental" || strategy === "multi" || strategy === "commercial" || strategy === "brrrr";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex">
      <DealLinkSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <DealLinkTopbar />

        <div className="px-8 py-6">
          {/* Page header */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <button className="text-slate-500 hover:text-slate-200">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-semibold text-white">123 Maple Street</h1>
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <button className="px-4 py-2 text-sm rounded-md bg-amber-500 text-slate-950 font-medium hover:bg-amber-400 flex items-center gap-2 shadow-sm">
              <Save className="w-4 h-4" /> Save Deal
            </button>
          </div>

          {/* Strategy tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {STRATS.map(({ k, label, icon: Icon }) => {
              const active = strategy === k;
              return (
                <button
                  key={k}
                  onClick={() => setStrategy(k)}
                  className={`px-4 py-2 text-sm rounded-md border flex items-center gap-2 transition ${
                    active
                      ? "bg-sky-500/15 border-sky-500/60 text-sky-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              );
            })}
          </div>

          {/* Sub-tabs */}
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
                        ? "border-amber-400 text-white"
                        : "border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* LEFT — inputs (sub-tab driven) */}
            <div className="col-span-12 lg:col-span-5 space-y-5">
              {subtab === "property" && (
                <Card title="Property">
                  <Field label="Purchase price" prefix="$" value={purchasePrice} onChange={setPurchasePrice} />
                  <Field label="ARV (after-repair value)" prefix="$" value={arv} onChange={setArv} />
                </Card>
              )}
              {subtab === "financing" && (
                <Card title="Financing">
                  <Field label="Down payment" suffix="%" value={downPct} onChange={setDownPct} />
                  <Field label="Interest rate" suffix="%" value={rate} onChange={setRate} step={0.125} />
                  <Field label="Term" suffix="yrs" value={term} onChange={setTerm} />
                  <Field label="Closing costs" suffix="%" value={closingPct} onChange={setClosingPct} step={0.1} />
                  {strategy === "brrrr" && (
                    <>
                      <Divider label="Refinance" />
                      <Field label="Refi ARV" prefix="$" value={refiArv} onChange={setRefiArv} />
                      <Field label="Refi LTV" suffix="%" value={refiLTV} onChange={setRefiLTV} />
                      <Field label="Refi rate" suffix="%" value={refiRate} onChange={setRefiRate} step={0.125} />
                    </>
                  )}
                </Card>
              )}
              {subtab === "income" && (
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
              {subtab === "rehab" && (
                <RehabEstimator
                  override={rehabOverride}
                  setOverride={setRehabOverride}
                  items={items}
                  setItems={setItems}
                />
              )}
            </div>

            {/* RIGHT — strategy-specific results */}
            <div className="col-span-12 lg:col-span-7 space-y-5">
              {strategy === "flip" ? (
                <FlipResults m={m} arv={arv} purchasePrice={purchasePrice} />
              ) : (
                <RentalResults m={m} />
              )}

              {isHold && (
                <>
                  <InvestmentSummary m={m} />
                  <ExpenseBreakdown m={m} />
                  <Projection m={m} />
                </>
              )}

              {strategy === "brrrr" && <BrrrAnalysis m={m} />}

              <Comps />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- left card: rehab estimator ---------- */
function RehabEstimator({
  override, setOverride, items, setItems,
}: {
  override: number; setOverride: (n: number) => void;
  items: RehabItem[]; setItems: (it: RehabItem[]) => void;
}) {
  const total = items.reduce((s, i) => s + (i.cost || 0), 0);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Rehab Estimator</p>
          <p className="text-2xl font-semibold text-white mt-0.5">{fmt(override || total)}</p>
        </div>
        <button className="px-3 py-1.5 text-xs rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Total Rehab (manual override)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={override}
              onChange={(e) => setOverride(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md py-2 pl-7 pr-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500/60"
            />
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
            <select
              value={it.category}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, category: e.target.value } : x))}
              className="col-span-4 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100"
            >
              {["Flooring", "Interior Paint", "Kitchen", "Bathroom", "Roof", "HVAC", "Electrical", "Plumbing", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              value={it.description}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, description: e.target.value } : x))}
              className="col-span-5 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100"
            />
            <input
              type="number"
              value={it.cost}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, cost: Number(e.target.value) || 0 } : x))}
              className="col-span-2 bg-slate-950 border border-slate-800 rounded-md py-1.5 px-2 text-sm text-slate-100"
            />
            <button
              onClick={() => setItems(items.filter((x) => x.id !== it.id))}
              className="col-span-1 text-slate-500 hover:text-rose-400 flex justify-center"
            >
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

/* ---------- right: rental key metrics ---------- */
function RentalResults({ m }: { m: any }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">Key Metrics</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Kpi label="Monthly Cash Flow" value={fmtSigned(m.cashFlowYr / 12)} sub={`${fmtSigned(m.cashFlowYr)}/yr`} tone={m.cashFlowYr >= 0 ? "ok" : "bad"} />
        <Kpi label="Cash-on-Cash Return" value={fmtPct(m.coc)} tone={m.coc >= 8 ? "good" : m.coc >= 0 ? "ok" : "bad"} />
        <Kpi label="Cap Rate" value={fmtPct(m.cap)} tone={m.cap >= 6 ? "good" : "ok"} />
        <Kpi label="Annual NOI" value={fmt(m.noi).replace(/,(\d{3})$/, "K").replace(/,000$/, "K")} tone="good" />
      </div>
      <div className="space-y-2">
        <RuleRow label="1% Rule" value={fmtPct((m.grossYr / 12) / 295000 * 100)} pass={false} />
        <RuleRow label="Cash-on-Cash" value={fmtPct(m.coc)} pass={m.coc >= 8} />
        <RuleRow label="Cap Rate" value={fmtPct(m.cap)} pass={m.cap >= 6} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "good" | "ok" | "bad" }) {
  const toneText = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-amber-300";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneText}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function RuleRow({ label, value, pass }: { label: string; value: string; pass: boolean }) {
  const tone = pass ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5";
  const valTone = pass ? "text-emerald-300" : "text-rose-300";
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

/* ---------- right: investment summary ---------- */
function InvestmentSummary({ m }: { m: any }) {
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

function ExpenseBreakdown({ m }: { m: any }) {
  const items = [
    { label: "Mortgage (P&I)", val: m.piti, max: m.piti },
    { label: "Property Tax", val: 350, max: m.piti },
    { label: "Insurance", val: 117, max: m.piti },
    { label: "Property Mgmt", val: m.mgmt / 12, max: m.piti },
    { label: "Maintenance", val: m.maint / 12, max: m.piti },
    { label: "CapEx Reserve", val: m.capex / 12, max: m.piti },
  ];
  const total = items.reduce((s, i) => s + i.val, 0);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">Monthly Expense Breakdown</h3>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.label} className="grid grid-cols-12 items-center gap-3 text-sm">
            <span className="col-span-4 text-slate-400">{it.label}</span>
            <div className="col-span-6 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500/70"
                style={{ width: `${Math.min(100, (it.val / it.max) * 100)}%` }}
              />
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

/* ---------- right: 5-year projection ---------- */
function Projection({ m }: { m: any }) {
  const yrs = m.years as { year: number; cashFlow: number; noi: number; propValue: number }[];
  const max = Math.max(...yrs.map((y) => y.propValue));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-4">5-Year Projection</h3>
      <div className="h-44 relative border-l border-b border-slate-800">
        <svg viewBox="0 0 500 160" className="w-full h-full" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="rgb(245 158 11 / 0.9)"
            strokeWidth="2"
            points={yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(" ")}
          />
          <polyline
            fill="rgb(245 158 11 / 0.1)"
            stroke="none"
            points={`0,160 ${yrs.map((y, i) => `${i * 125},${160 - (y.propValue / max) * 140}`).join(" ")} 500,160`}
          />
        </svg>
        <div className="absolute -left-12 top-0 text-[10px] text-slate-500">{fmt(max)}</div>
        <div className="absolute -left-12 bottom-0 text-[10px] text-slate-500">{fmt(0)}</div>
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
              <td className={`py-1.5 text-right ${y.cashFlow < 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtSigned(y.cashFlow)}</td>
              <td className="py-1.5 text-right text-slate-300">{fmt(y.noi)}</td>
              <td className="py-1.5 text-right text-slate-200">{fmt(y.propValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- right: BRRRR analysis ---------- */
function BrrrAnalysis({ m }: { m: any }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-medium text-slate-100 mb-3">BRRRR Analysis</h3>
      <Row label="Refi Loan Amount" value={fmt(m.refiLoan)} />
      <Row label="Cash Out Received" value={fmtSigned(m.cashOut)} tone={m.cashOut < 0 ? "bad" : "good"} />
      <Row label="Cash Left in Deal" value={fmt(m.cashLeft)} />
      <Row label="New Mortgage" value={`${fmt(m.newPiti)}/mo`} />
      <div className="border-t border-slate-800 mt-2 pt-2">
        <Row label="CoC After Refinance" value={fmtPct(m.cocAfterRefi)} tone={m.cocAfterRefi >= 8 ? "good" : "bad"} />
        <Row label="Equity Created" value={fmtSigned(m.equityCreated)} tone={m.equityCreated < 0 ? "bad" : "good"} />
      </div>
    </div>
  );
}

/* ---------- right: Fix & Flip results ---------- */
function FlipResults({ m, arv, purchasePrice }: { m: any; arv: number; purchasePrice: number }) {
  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-100 mb-4">Fix & Flip Analysis</h3>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Net Profit" value={fmtSigned(m.flipNetProfit)} tone={m.flipNetProfit >= 0 ? "good" : "bad"} />
          <Kpi label="Total ROI" value={fmtPct(m.flipROI)} tone={m.flipROI >= 0 ? "good" : "bad"} />
          <Kpi label="Annualized ROI" value={fmtPct(m.flipAnnROI)} tone={m.flipAnnROI >= 0 ? "good" : "bad"} />
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
          <Row label="Max Allowable Offer (70% Rule)" value={fmtSigned(m.mao)} accent tone={m.mao < 0 ? "bad" : "good"} />
        </div>
      </div>
    </>
  );
}

/* ---------- right: comps ---------- */
function Comps() {
  const comps = [
    { addr: "110 Oak Ave", beds: "3bd/2ba", sqft: "1,640 sqft", ppsf: "$190/sqft", date: "2024-11-01", price: 295000 },
    { addr: "201 Elm Dr", beds: "3bd/2ba", sqft: "1,800 sqft", ppsf: "$155/sqft", date: "2024-10-15", price: 280000 },
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

/* ---------- ui primitives ---------- */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, prefix, suffix, step }: {
  label: string; value: number; onChange: (n: number) => void;
  prefix?: string; suffix?: string; step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{prefix}</span>}
        <input
          type="number"
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full bg-slate-950 border border-slate-800 rounded-md py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500/60 ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-12" : "pr-3"}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex items-center gap-3 mt-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function Row({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "good" | "bad" }) {
  const toneCls = tone === "bad" ? "text-rose-300" : tone === "good" ? "text-emerald-300" : "";
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${accent ? "font-medium" : ""}`}>
      <span className="text-slate-400">{label}</span>
      <span className={`${accent ? "text-amber-300" : "text-slate-200"} ${toneCls}`}>{value}</span>
    </div>
  );
}

/* ---------- DealLink sidebar ---------- */
const NAV_GROUPS: { label: string | null; items: { label: string; icon: any; active?: boolean; enterprise?: boolean }[] }[] = [
  { label: null, items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  { label: "Deals", items: [
    { label: "Properties", icon: Building2 },
    { label: "Pipeline", icon: Kanban },
    { label: "Offers", icon: FileText },
    { label: "Marketplace", icon: Globe },
    { label: "Import CSV", icon: Upload },
  ]},
  { label: "Deal Analyzer", items: [
    { label: "Deal Analyzer", icon: Calculator, active: true },
  ]},
  { label: "Buyers", items: [
    { label: "Buyers List", icon: Users },
    { label: "Leads", icon: ListChecks },
    { label: "JV Deals", icon: Handshake, enterprise: true },
    { label: "Buyer Rental", icon: UserCheck, enterprise: true },
  ]},
  { label: "Enterprise", items: [
    { label: "AI Deal Blast", icon: Zap, enterprise: true },
    { label: "God Mode", icon: Eye, enterprise: true },
    { label: "Artemis Mode", icon: Eye, enterprise: true },
    { label: "Handoff", icon: Handshake, enterprise: true },
  ]},
  { label: "Reports", items: [{ label: "Analytics", icon: BarChart3 }] },
];

function DealLinkSidebar() {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-slate-900" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            Deal<span className="text-amber-400">Link</span>
          </span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider px-3 mb-1">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ label, icon: Icon, active, enterprise }) => (
                <div key={label}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active ? "bg-amber-400 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {enterprise && !active && (
                    <span className="text-[10px] bg-amber-400/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">E</span>
                  )}
                  {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-slate-700 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400">
          <Settings className="w-4 h-4" /> Profile
        </div>
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400">
          <ExternalLink className="w-4 h-4" /> Public profile
        </div>
      </div>
    </aside>
  );
}

function DealLinkTopbar() {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-4 flex-shrink-0">
      <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 font-mono">
        deallink.io/chgroup <ExternalLink className="w-3 h-3" />
      </span>
      <div className="flex-1" />
      <Grid3x3 className="w-5 h-5 text-slate-400" />
      <button className="relative text-slate-400">
        <Bell className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 font-bold text-sm">CH</div>
        <span className="text-white text-sm font-medium hidden sm:block">Cleveland Holding</span>
      </div>
      <div className="text-slate-400 text-xs flex items-center gap-1.5">
        <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span>
      </div>
    </header>
  );
}
