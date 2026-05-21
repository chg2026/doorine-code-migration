"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/pipeline";

export type PipelineDealRow = {
  id: string;
  code: string;
  address: string;
  stage: string;
  askingPrice: string | null;
  estimatedRoi: string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  meta: Record<string, unknown> | null;
};

const STAGES = {
  Sourced:       "Sourced",
  Underwriting:  "Underwriting",
  OfferOut:      "OfferOut",
  UnderContract: "UnderContract",
  Closed:        "Closed",
  Lost:          "Lost",
} as const;

type Stage5 = "Identified" | "Offer Submitted" | "Under Contract" | "Due Diligence" | "Closed/Acquired";

const WIREFRAME_COLS: { label: Stage5; stages: string[] }[] = [
  { label: "Identified",      stages: [STAGES.Sourced, STAGES.Underwriting] },
  { label: "Offer Submitted", stages: [STAGES.OfferOut] },
  { label: "Under Contract",  stages: [STAGES.UnderContract] },
  { label: "Due Diligence",   stages: [] },
  { label: "Closed/Acquired", stages: [STAGES.Closed] },
];

function getDealStageLabel(stage: string): Stage5 {
  switch (stage) {
    case STAGES.Sourced:
    case STAGES.Underwriting:  return "Identified";
    case STAGES.OfferOut:      return "Offer Submitted";
    case STAGES.UnderContract: return "Under Contract";
    case STAGES.Closed:        return "Closed/Acquired";
    default:                   return "Identified";
  }
}

function getDealPrice(deal: PipelineDealRow): number | null {
  const m = deal.meta || {};
  if (deal.stage === STAGES.OfferOut) return (m.offer as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
  if (deal.stage === STAGES.UnderContract || deal.stage === STAGES.Closed) return (m.purchase as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
  return deal.askingPrice ? Number(deal.askingPrice) : null;
}

function getDealMetric(deal: PipelineDealRow): string {
  const m = deal.meta || {};
  const strategy = m.strategy as string | undefined;
  if (deal.stage === STAGES.Closed) {
    return m.arv ? `✓ ARV ${formatMoney(m.arv as number, { compact: true })}` : `✓ ROI ${Number(deal.estimatedRoi || 0)}%`;
  }
  if (strategy === "brrrr" && m.arv) {
    const cf = m.monthlyFlow as number | undefined;
    return cf != null ? `Proj. CF ${cf >= 0 ? "+" : ""}${formatMoney(cf, { compact: true })}/mo` : `ARV ${formatMoney(m.arv as number, { compact: true })}`;
  }
  if (m.arv && m.rehab) {
    const price = getDealPrice(deal) ?? 0;
    const profit = (m.arv as number) - price - (m.rehab as number);
    return profit > 0 ? `Est. profit ${formatMoney(profit, { compact: true })}` : `ARV ${formatMoney(m.arv as number, { compact: true })}`;
  }
  if (deal.stage === STAGES.OfferOut) {
    const offer = (m.offer as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
    return offer ? `Offer: ${formatMoney(offer, { compact: true })}` : "—";
  }
  if (deal.stage === STAGES.UnderContract && m.closingDate) {
    const d = new Date(m.closingDate as string);
    return `Close: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return `ROI ${Number(deal.estimatedRoi || 0)}%`;
}

function getDealType(deal: PipelineDealRow): "sfr" | "mf" | null {
  const t = ((deal.meta?.type as string) || "").toLowerCase();
  if (t.includes("multi") || t === "mf") return "mf";
  if (t.includes("sfr") || t.includes("single")) return "sfr";
  return null;
}

function getDealDays(deal: PipelineDealRow): number {
  const m = deal.meta || {};
  return (m.daysInStage as number) ?? Math.max(0, Math.round((Date.now() - new Date(deal.createdAt).getTime()) / 86_400_000));
}

function getAssigneeName(deal: PipelineDealRow): string {
  return (deal.meta?.assignee as string) || "—";
}

function isOverdue(deal: PipelineDealRow): boolean {
  return (deal.meta?.overdue as boolean) === true || getDealDays(deal) > 14;
}

// ── Badge components ──────────────────────────────────────────────────
function TypeBadge({ type }: { type: "sfr" | "mf" | null }) {
  if (!type) return null;
  const isMf = type === "mf";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
      background: isMf ? "rgba(52,199,89,0.1)" : "rgba(31,77,92,0.1)",
      color: isMf ? "#1A6B35" : "#143641",
    }}>
      {isMf ? "MF" : "SFR"}
    </span>
  );
}

function StrategyBadge({ deal }: { deal: PipelineDealRow }) {
  const s = ((deal.meta?.strategy as string) || "").toLowerCase();
  if (!s) return null;
  const isBrrrr = s === "brrrr";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
      background: isBrrrr ? "rgba(155,89,182,0.12)" : "rgba(255,159,10,0.12)",
      color: isBrrrr ? "#6B2FA0" : "#7D4A00",
    }}>
      {isBrrrr ? "BRRRR" : "Flip"}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: "50%",
      background: "linear-gradient(135deg,#A8C4D0,#5B8FA8)",
      color: "#fff", fontSize: 8, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── Deal Card ─────────────────────────────────────────────────────────
function DealCard({ deal }: { deal: PipelineDealRow }) {
  const type = getDealType(deal);
  const price = getDealPrice(deal);
  const metric = getDealMetric(deal);
  const days = getDealDays(deal);
  const assignee = getAssigneeName(deal);
  const overdue = isOverdue(deal) && deal.stage !== STAGES.Closed;
  const isClosed = deal.stage === STAGES.Closed;
  const initials = assignee === "—" ? "??" : assignee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      background: "#fff", borderRadius: 8, padding: "11px 12px",
      border: overdue ? "0.5px solid rgba(255,59,48,0.4)" : "0.5px solid rgba(0,0,0,0.06)",
      borderLeft: overdue ? "3px solid #FF3B30" : undefined,
      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      cursor: "pointer",
      opacity: isClosed ? 0.75 : 1,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? "#8C1515" : "#1D1D1F", marginBottom: 5, letterSpacing: "-0.01em" }}>
        {overdue ? `⚠ ${deal.address}` : deal.address}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
        <TypeBadge type={type} />
        <StrategyBadge deal={deal} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1D1D1F" }}>{formatMoney(price)}</div>
      <div style={{ fontSize: 10, color: overdue ? "#8C1515" : isClosed ? "#1A6B35" : "#AEAEB2", marginTop: 2 }}>{metric}</div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 8, paddingTop: 7, borderTop: "0.5px solid rgba(0,0,0,0.06)",
      }}>
        <Avatar initials={initials} />
        <span style={{ fontSize: 9, color: overdue ? "#8C1515" : "#AEAEB2" }}>
          {isClosed && deal.closedAt
            ? new Date(deal.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : `Day ${days}`}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export default function PipelineView({ deals }: { deals: PipelineDealRow[] }) {
  const [view, setView] = useState<"board" | "list">("board");
  const [typeFilter, setTypeFilter] = useState<"all" | "sfr" | "mf" | "mine">("all");
  const [stageFilter, setStageFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  const activeDeals = deals.filter((d) => d.stage !== STAGES.Lost);
  const underContractCount = activeDeals.filter((d) => d.stage === STAGES.UnderContract).length;
  const closedCount = activeDeals.filter((d) => d.stage === STAGES.Closed).length;
  const overdueCount = activeDeals.filter((d) => isOverdue(d) && d.stage !== STAGES.Closed).length;

  function filterDeals(list: PipelineDealRow[]): PipelineDealRow[] {
    return list.filter((d) => {
      const type = getDealType(d);
      if (typeFilter === "sfr" && type !== "sfr") return false;
      if (typeFilter === "mf" && type !== "mf") return false;
      if (typeFilter === "mine" && !(d.meta?.mine)) return false;
      if (stageFilter && getDealStageLabel(d.stage) !== stageFilter) return false;
      if (teamFilter) {
        const assignee = getAssigneeName(d);
        if (!assignee.toLowerCase().includes(teamFilter.toLowerCase())) return false;
      }
      return true;
    });
  }

  const filtered = filterDeals(activeDeals);

  const btnActive: React.CSSProperties = {
    background: "#E8EFF1", color: "#143641", border: "0.5px solid rgba(31,77,92,0.3)",
  };
  const btnInactive: React.CSSProperties = {
    background: "#F2F2F7", color: "#6E6E73", border: "0.5px solid rgba(0,0,0,0.12)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{
        background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.06)",
        padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em", color: "#1D1D1F" }}>Pipeline</div>
          <div style={{ fontSize: 12, color: "#6E6E73", marginTop: 3 }}>
            Deal tracking · Identified → Offer Submitted → Under Contract → Due Diligence → Closed/Acquired
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setView("board")}
            style={{ fontSize: 11, fontWeight: 600, padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", ...(view === "board" ? btnActive : btnInactive) }}
          >Board</button>
          <button
            onClick={() => setView("list")}
            style={{ fontSize: 11, fontWeight: 600, padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", ...(view === "list" ? btnActive : btnInactive) }}
          >List</button>
          <button
            style={{ fontSize: 11, fontWeight: 600, padding: "7px 16px", borderRadius: 20, background: "#1F4D5C", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onClick={() => alert("New deal setup coming in next sprint")}
          >+ New deal</button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#F5F5F7", minHeight: 0 }}>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { val: activeDeals.filter((d) => d.stage !== STAGES.Closed).length, lbl: "Total active",               color: "#143641" },
            { val: underContractCount,                                             lbl: "Under contract",             color: "#7D4A00" },
            { val: closedCount,                                                    lbl: "Closed this quarter",        color: "#1A6B35" },
            { val: overdueCount,                                                   lbl: "Overdue / follow-up needed", color: "#8C1515" },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.06)", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 3, color }}>{val}</div>
              <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.06)",
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap",
        }}>
          {(["all", "sfr", "mf", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 20,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: typeFilter === f ? "#E8EFF1" : "transparent",
                color: typeFilter === f ? "#143641" : "#6E6E73",
              }}
            >
              {f === "all" ? "All deals" : f === "sfr" ? "SFR" : f === "mf" ? "Multifamily" : "Mine"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 20, border: "0.5px solid rgba(0,0,0,0.12)", background: "#F2F2F7", fontFamily: "inherit", color: "#6E6E73" }}
          >
            <option value="">All stages</option>
            {WIREFRAME_COLS.map((c) => <option key={c.label}>{c.label}</option>)}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 20, border: "0.5px solid rgba(0,0,0,0.12)", background: "#F2F2F7", fontFamily: "inherit", color: "#6E6E73" }}
          >
            <option value="">All team</option>
          </select>
        </div>

        {/* ── Board view ── */}
        {view === "board" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, minHeight: 400 }}>
            {WIREFRAME_COLS.map((col) => {
              const colDeals = filtered.filter((d) => col.stages.includes(d.stage));
              return (
                <div key={col.label} style={{ background: "#FAFAFA", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
                  <div style={{
                    padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: "0.5px solid rgba(0,0,0,0.06)", background: "#fff",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6E6E73" }}>
                      {col.label}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "#F2F2F7", color: "#AEAEB2" }}>
                      {colDeals.length}
                    </span>
                  </div>
                  <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {colDeals.map((d) => <DealCard key={d.id} deal={d} />)}
                    {colDeals.length === 0 && (
                      <div style={{ fontSize: 10, color: "#AEAEB2", textAlign: "center", padding: "16px 0" }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── List view ── */}
        {view === "list" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFAFA" }}>
                  {["Address", "Type", "Stage", "Price", "Key metric", "Assigned", "Days"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: h === "Price" ? "right" : "left",
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "#AEAEB2", borderBottom: "0.5px solid rgba(0,0,0,0.06)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const type = getDealType(d);
                  const price = getDealPrice(d);
                  const metric = getDealMetric(d);
                  const days = getDealDays(d);
                  const assignee = getAssigneeName(d);
                  const overdue = isOverdue(d) && d.stage !== STAGES.Closed;
                  const initials = assignee === "—" ? "??" : assignee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <tr key={d.id} style={{ cursor: "pointer", background: overdue ? "rgba(255,59,48,0.03)" : undefined }}>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", fontWeight: 600, fontSize: 12, color: overdue ? "#8C1515" : "#1D1D1F" }}>
                        {overdue ? `⚠ ${d.address}` : d.address}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <TypeBadge type={type} />
                          <StrategyBadge deal={d} />
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", fontSize: 11, color: "#6E6E73" }}>
                        {getDealStageLabel(d.stage)}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", textAlign: "right", fontWeight: 600 }}>
                        {formatMoney(price)}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", fontSize: 11, color: overdue ? "#8C1515" : "#6E6E73" }}>
                        {metric}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}>
                        <Avatar initials={initials} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", fontSize: 11, color: overdue ? "#8C1515" : "#AEAEB2" }}>
                        {days}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "40px 14px", textAlign: "center", color: "#AEAEB2", fontSize: 11 }}>
                      No deals match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
