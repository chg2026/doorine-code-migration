import { useMemo, useState } from "react";
import {
  Calculator, Home, Wrench, Banknote, TrendingUp, DollarSign,
  Percent, Building2, Save, Share2, ChevronRight, AlertTriangle,
  CheckCircle2, FileText, Layers,
} from "lucide-react";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type StratKey = "flip" | "rental" | "wholesale";

export function DealAnalyzer() {
  const [strategy, setStrategy] = useState<StratKey>("flip");

  // Property
  const [address] = useState("4127 Larchmont Ave, Cleveland OH 44109");
  const [purchase, setPurchase] = useState(125000);
  const [rehab, setRehab] = useState(38000);
  const [arv, setArv] = useState(225000);
  const [holding, setHolding] = useState(4200);
  const [closingBuy, setClosingBuy] = useState(2500);
  const [closingSell, setClosingSell] = useState(7800);
  const [agentPct, setAgentPct] = useState(6);

  // Financing
  const [downPct, setDownPct] = useState(20);
  const [ratePct, setRatePct] = useState(8.25);
  const [termYrs, setTermYrs] = useState(30);

  // Rental
  const [rent, setRent] = useState(1850);
  const [taxes, setTaxes] = useState(2400);
  const [insurance, setInsurance] = useState(1200);
  const [vacancyPct, setVacancyPct] = useState(8);
  const [mgmtPct, setMgmtPct] = useState(8);
  const [maintPct, setMaintPct] = useState(5);

  // Wholesale
  const [assignFee, setAssignFee] = useState(12000);

  // Derived
  const m = useMemo(() => {
    const loanAmt = purchase * (1 - downPct / 100);
    const monthlyRate = ratePct / 100 / 12;
    const n = termYrs * 12;
    const piti = monthlyRate
      ? (loanAmt * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
      : loanAmt / n;
    const downPayment = purchase * (downPct / 100);

    // Flip
    const agentCost = arv * (agentPct / 100);
    const totalCost = purchase + rehab + holding + closingBuy + closingSell + agentCost;
    const flipProfit = arv - totalCost;
    const flipROI = totalCost ? (flipProfit / (downPayment + rehab + holding + closingBuy)) * 100 : 0;
    const arvSeventy = arv * 0.7 - rehab;

    // Rental
    const grossAnnual = rent * 12;
    const vacancy = grossAnnual * (vacancyPct / 100);
    const mgmt = grossAnnual * (mgmtPct / 100);
    const maint = grossAnnual * (maintPct / 100);
    const opex = taxes + insurance + vacancy + mgmt + maint;
    const noi = grossAnnual - opex;
    const annualDebt = piti * 12;
    const cashFlow = noi - annualDebt;
    const cashIn = downPayment + rehab + closingBuy;
    const cocROI = cashIn ? (cashFlow / cashIn) * 100 : 0;
    const capRate = arv ? (noi / arv) * 100 : 0;
    const dscr = annualDebt ? noi / annualDebt : 0;

    // Wholesale
    const wholesaleProfit = assignFee - closingBuy;
    const wholesaleROI = closingBuy ? (wholesaleProfit / closingBuy) * 100 : 0;

    return {
      loanAmt, downPayment, piti, agentCost, totalCost, flipProfit, flipROI, arvSeventy,
      grossAnnual, opex, noi, cashFlow, cocROI, capRate, dscr,
      vacancy, mgmt, maint, wholesaleProfit, wholesaleROI,
    };
  }, [purchase, rehab, arv, holding, closingBuy, closingSell, agentPct, downPct, ratePct, termYrs,
      rent, taxes, insurance, vacancyPct, mgmtPct, maintPct, assignFee]);

  const verdict = useMemo(() => {
    if (strategy === "flip") {
      if (m.flipROI >= 25 && m.flipProfit >= 25000) return { tone: "good", label: "Strong Deal" };
      if (m.flipROI >= 15) return { tone: "ok", label: "Marginal" };
      return { tone: "bad", label: "Pass" };
    }
    if (strategy === "rental") {
      if (m.cocROI >= 10 && m.cashFlow > 0 && m.dscr >= 1.25) return { tone: "good", label: "Strong Deal" };
      if (m.cashFlow > 0) return { tone: "ok", label: "Marginal" };
      return { tone: "bad", label: "Pass" };
    }
    if (m.wholesaleProfit >= 8000) return { tone: "good", label: "Strong Deal" };
    if (m.wholesaleProfit >= 3000) return { tone: "ok", label: "Marginal" };
    return { tone: "bad", label: "Pass" };
  }, [strategy, m]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Pipeline page chrome (so the Pipeline > Analyzer placement is obvious) */}
      <PipelineChrome />

      <div className="px-8 pb-12">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 pt-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider mb-2">
              <span>Pipeline</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-amber-400">Deal Analyzer</span>
            </div>
            <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
              <Calculator className="w-6 h-6 text-amber-400" />
              Deal Analyzer
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Model flip, rental, and wholesale exits side by side. Inputs save to the deal record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button className="px-3 py-2 text-sm rounded-md bg-amber-500 text-slate-950 font-medium hover:bg-amber-400 flex items-center gap-2">
              <Save className="w-4 h-4" /> Save to deal
            </button>
          </div>
        </div>

        {/* Strategy switcher */}
        <div className="mt-6 inline-flex p-1 rounded-lg bg-slate-900 border border-slate-800">
          {([
            { k: "flip", label: "Fix & Flip", icon: Wrench },
            { k: "rental", label: "Buy & Hold", icon: Home },
            { k: "wholesale", label: "Wholesale", icon: Layers },
          ] as { k: StratKey; label: string; icon: typeof Wrench }[]).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => setStrategy(k)}
              className={`px-4 py-1.5 text-sm rounded-md flex items-center gap-2 transition ${
                strategy === k
                  ? "bg-amber-500 text-slate-950 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Body grid */}
        <div className="mt-6 grid grid-cols-12 gap-6">
          {/* LEFT — inputs */}
          <div className="col-span-12 lg:col-span-7 space-y-5">
            <Section title="Property" icon={Building2} subtitle={address}>
              <div className="grid grid-cols-2 gap-4">
                <NumField label="Purchase price" value={purchase} onChange={setPurchase} prefix="$" />
                <NumField label="Rehab budget" value={rehab} onChange={setRehab} prefix="$" />
                <NumField label="ARV (after-repair value)" value={arv} onChange={setArv} prefix="$" />
                <NumField label="Holding costs (total)" value={holding} onChange={setHolding} prefix="$" />
              </div>
            </Section>

            {strategy === "flip" && (
              <Section title="Selling costs" icon={DollarSign}>
                <div className="grid grid-cols-3 gap-4">
                  <NumField label="Closing (buy)" value={closingBuy} onChange={setClosingBuy} prefix="$" />
                  <NumField label="Closing (sell)" value={closingSell} onChange={setClosingSell} prefix="$" />
                  <NumField label="Agent commission" value={agentPct} onChange={setAgentPct} suffix="%" />
                </div>
              </Section>
            )}

            {(strategy === "flip" || strategy === "rental") && (
              <Section title="Financing" icon={Banknote}>
                <div className="grid grid-cols-3 gap-4">
                  <NumField label="Down payment" value={downPct} onChange={setDownPct} suffix="%" />
                  <NumField label="Interest rate" value={ratePct} onChange={setRatePct} suffix="%" step={0.125} />
                  <NumField label="Term" value={termYrs} onChange={setTermYrs} suffix=" yrs" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-slate-400">
                  <Stat compact label="Loan amount" value={fmt(m.loanAmt)} />
                  <Stat compact label="Down" value={fmt(m.downPayment)} />
                  <Stat compact label="Monthly P&I" value={fmt(m.piti)} />
                </div>
              </Section>
            )}

            {strategy === "rental" && (
              <Section title="Rental operating" icon={TrendingUp}>
                <div className="grid grid-cols-2 gap-4">
                  <NumField label="Monthly rent" value={rent} onChange={setRent} prefix="$" />
                  <NumField label="Annual taxes" value={taxes} onChange={setTaxes} prefix="$" />
                  <NumField label="Annual insurance" value={insurance} onChange={setInsurance} prefix="$" />
                  <div />
                  <NumField label="Vacancy" value={vacancyPct} onChange={setVacancyPct} suffix="%" />
                  <NumField label="Property mgmt" value={mgmtPct} onChange={setMgmtPct} suffix="%" />
                  <NumField label="Maintenance" value={maintPct} onChange={setMaintPct} suffix="%" />
                </div>
              </Section>
            )}

            {strategy === "wholesale" && (
              <Section title="Assignment" icon={FileText}>
                <div className="grid grid-cols-2 gap-4">
                  <NumField label="Assignment fee" value={assignFee} onChange={setAssignFee} prefix="$" />
                  <NumField label="Earnest / closing" value={closingBuy} onChange={setClosingBuy} prefix="$" />
                </div>
              </Section>
            )}
          </div>

          {/* RIGHT — results */}
          <div className="col-span-12 lg:col-span-5 space-y-5">
            <VerdictCard verdict={verdict} strategy={strategy} m={m} />

            {strategy === "flip" && (
              <ResultsCard title="Flip metrics">
                <Stat label="Projected profit" value={fmt(m.flipProfit)} accent />
                <Stat label="ROI on cash in" value={fmtPct(m.flipROI)} icon={Percent} />
                <Stat label="Total cost basis" value={fmt(m.totalCost)} />
                <Stat label="70% rule max offer" value={fmt(m.arvSeventy)} sub="ARV × 0.70 − rehab" />
                <Stat label="Agent commission" value={fmt(m.agentCost)} muted />
              </ResultsCard>
            )}
            {strategy === "rental" && (
              <ResultsCard title="Rental metrics">
                <Stat label="Monthly cash flow" value={fmt(m.cashFlow / 12)} accent />
                <Stat label="Cash-on-cash" value={fmtPct(m.cocROI)} icon={Percent} />
                <Stat label="Cap rate" value={fmtPct(m.capRate)} />
                <Stat label="DSCR" value={m.dscr.toFixed(2)} sub={m.dscr >= 1.25 ? "Lender-friendly" : "Below 1.25"} />
                <Stat label="Annual NOI" value={fmt(m.noi)} muted />
              </ResultsCard>
            )}
            {strategy === "wholesale" && (
              <ResultsCard title="Wholesale metrics">
                <Stat label="Net to you" value={fmt(m.wholesaleProfit)} accent />
                <Stat label="ROI on earnest" value={fmtPct(m.wholesaleROI)} icon={Percent} />
                <Stat label="Buyer all-in (purchase + rehab)" value={fmt(purchase + rehab)} />
                <Stat label="Buyer equity at ARV" value={fmt(arv - purchase - rehab - assignFee)} muted />
              </ResultsCard>
            )}

            {strategy === "rental" && (
              <ResultsCard title="Operating breakdown" tone="muted">
                <Row label="Gross rent" value={fmt(m.grossAnnual)} />
                <Row label="− Vacancy" value={fmt(-m.vacancy)} />
                <Row label="− Mgmt" value={fmt(-m.mgmt)} />
                <Row label="− Maintenance" value={fmt(-m.maint)} />
                <Row label="− Taxes" value={fmt(-taxes)} />
                <Row label="− Insurance" value={fmt(-insurance)} />
                <Row label="− Debt service" value={fmt(-m.piti * 12)} />
                <div className="border-t border-slate-800 mt-2 pt-2">
                  <Row strong label="Annual cash flow" value={fmt(m.cashFlow)} />
                </div>
              </ResultsCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- pipeline chrome (header + tabs) ---------- */
function PipelineChrome() {
  return (
    <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
      <div className="px-8 pt-5">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="text-slate-300 font-medium">Pipeline</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">14 active</span>
        </div>
        <div className="mt-3 flex items-center gap-1 -mb-px">
          <Tab>Kanban</Tab>
          <Tab>List</Tab>
          <Tab active>Deal Analyzer</Tab>
          <Tab>Activity</Tab>
        </div>
      </div>
    </div>
  );
}
function Tab({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition ${
        active
          ? "border-amber-400 text-white"
          : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- ui primitives ---------- */
function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: typeof Wrench; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-slate-100">{title}</h3>
        </div>
        {subtitle && <span className="text-xs text-slate-500 truncate max-w-[60%]">{subtitle}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function NumField({ label, value, onChange, prefix, suffix, step }: {
  label: string; value: number; onChange: (n: number) => void;
  prefix?: string; suffix?: string; step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{prefix}</span>
        )}
        <input
          type="number"
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full bg-slate-950 border border-slate-800 rounded-md py-2 text-sm text-slate-100
                      focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30
                      ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-10" : "pr-3"}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{suffix}</span>
        )}
      </div>
    </label>
  );
}

function VerdictCard({ verdict, strategy, m }: {
  verdict: { tone: string; label: string }; strategy: StratKey; m: any;
}) {
  const toneMap: Record<string, string> = {
    good: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 text-emerald-300",
    ok: "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-300",
    bad: "from-rose-500/20 to-rose-500/5 border-rose-500/40 text-rose-300",
  };
  const Icon = verdict.tone === "bad" ? AlertTriangle : CheckCircle2;
  const headline =
    strategy === "flip" ? fmt(m.flipProfit)
      : strategy === "rental" ? `${fmt(m.cashFlow / 12)}/mo`
      : fmt(m.wholesaleProfit);
  const sub =
    strategy === "flip" ? `${fmtPct(m.flipROI)} ROI on cash in`
      : strategy === "rental" ? `${fmtPct(m.cocROI)} CoC · DSCR ${m.dscr.toFixed(2)}`
      : `${fmtPct(m.wholesaleROI)} ROI on earnest`;

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneMap[verdict.tone]} p-5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-medium">
          <Icon className="w-4 h-4" /> {verdict.label}
        </div>
        <span className="text-[10px] text-slate-400 uppercase">Verdict</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{headline}</div>
      <div className="text-xs text-slate-300 mt-1">{sub}</div>
    </div>
  );
}

function ResultsCard({ title, children, tone }: {
  title: string; children: React.ReactNode; tone?: "muted";
}) {
  return (
    <div className={`rounded-xl border border-slate-800 ${tone === "muted" ? "bg-slate-900/20" : "bg-slate-900/40"}`}>
      <div className="px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

function Stat({ label, value, sub, accent, muted, compact, icon: Icon }: {
  label: string; value: string; sub?: string;
  accent?: boolean; muted?: boolean; compact?: boolean; icon?: typeof Percent;
}) {
  return (
    <div className={`flex items-start justify-between ${compact ? "" : "gap-4"}`}>
      <div className={`text-xs ${muted ? "text-slate-500" : "text-slate-400"}`}>{label}</div>
      <div className="text-right">
        <div className={`flex items-center justify-end gap-1.5 ${
          accent ? "text-amber-300 text-xl font-semibold"
            : compact ? "text-slate-100 text-sm font-medium"
            : muted ? "text-slate-400 text-sm" : "text-slate-100 text-sm font-medium"
        }`}>
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {value}
        </div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={strong ? "text-slate-100 font-medium" : "text-slate-400"}>{label}</span>
      <span className={`font-mono ${strong ? "text-amber-300 font-semibold" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}
