import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const dec = (v: Prisma.Decimal | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
};

export const fmtMoney = (n: number, opts: { signed?: boolean } = {}): string => {
  const sign = opts.signed && n > 0 ? "+" : "";
  return `${sign}${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
};

export const fmtPct = (n: number | null | undefined, digits = 1): string => {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(digits)}%`;
};

export const fmtDate = (d: Date | null | undefined): string => {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export type SubscriptionWithOffering = Prisma.InvestorSubscriptionGetPayload<{
  include: { offering: true };
}>;

export type DistributionAllocationRow = Prisma.DistributionAllocationGetPayload<{
  include: { distribution: { include: { offering: true } } };
}>;

export type DealUpdateRow = Prisma.DealUpdateGetPayload<{
  include: { offering: true };
}>;

export type ActivityRow = Prisma.InvestorActivityGetPayload<Record<string, never>>;

export type DocumentRow = Prisma.InvestorDocumentGetPayload<{
  include: { offering: true };
}>;

export async function getInvestorSubscriptions(
  investorId: string
): Promise<SubscriptionWithOffering[]> {
  return prisma.investorSubscription.findMany({
    where: { investorId },
    include: { offering: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getInvestorDistributions(
  investorId: string
): Promise<DistributionAllocationRow[]> {
  return prisma.distributionAllocation.findMany({
    where: { subscription: { investorId } },
    include: { distribution: { include: { offering: true } } },
    orderBy: { distribution: { paidOn: "desc" } },
  });
}

export async function getInvestorDealUpdates(
  investorId: string
): Promise<DealUpdateRow[]> {
  return prisma.dealUpdate.findMany({
    where: {
      published: true,
      offering: { subscriptions: { some: { investorId } } },
    },
    include: { offering: true },
    orderBy: { postedAt: "desc" },
  });
}

export async function getInvestorActivities(
  investorId: string,
  limit = 8
): Promise<ActivityRow[]> {
  return prisma.investorActivity.findMany({
    where: { investorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getInvestorDocuments(
  investorId: string
): Promise<DocumentRow[]> {
  // Two strands of visibility:
  //   1. Personally-addressed docs:    investorId == self
  //   2. Shared offering docs:         investorId IS NULL AND the investor
  //                                    has a subscription on the offering
  // Other investors' personal docs (investorId != self) are explicitly excluded.
  return prisma.investorDocument.findMany({
    where: {
      OR: [
        { investorId },
        {
          investorId: null,
          offering: { subscriptions: { some: { investorId } } },
        },
      ],
    },
    include: { offering: true },
    orderBy: { uploadedAt: "desc" },
  });
}

export interface PortfolioTotals {
  totalCommitted: number;
  totalFunded: number;
  totalCurrentValue: number;
  totalDistributions: number;
  totalGain: number;
  totalGainPct: number;
  avgCoc: number;
  avgIrr: number;
  equityMultiple: number;
  activeCount: number;
  totalCount: number;
}

export function summarizePortfolio(
  subs: SubscriptionWithOffering[]
): PortfolioTotals {
  let totalCommitted = 0;
  let totalFunded = 0;
  let totalCurrentValue = 0;
  let totalDistributions = 0;
  let weightedCoc = 0;
  let weightedIrr = 0;
  let weightBase = 0;
  let activeCount = 0;

  for (const s of subs) {
    const committed = dec(s.committedAmount);
    const funded = dec(s.fundedAmount);
    const value = s.currentValue !== null ? dec(s.currentValue) : funded;
    const dist = dec(s.lifetimeDistributions);
    totalCommitted += committed;
    totalFunded += funded;
    totalCurrentValue += value;
    totalDistributions += dist;
    if (s.status === "Active") activeCount += 1;
    if (funded > 0) {
      weightBase += funded;
      if (s.cocToDate !== null) weightedCoc += dec(s.cocToDate) * funded;
      if (s.irrToDate !== null) weightedIrr += dec(s.irrToDate) * funded;
    }
  }

  const totalGain = totalCurrentValue + totalDistributions - totalFunded;
  const totalGainPct = totalFunded > 0 ? (totalGain / totalFunded) * 100 : 0;
  const equityMultiple =
    totalFunded > 0 ? (totalCurrentValue + totalDistributions) / totalFunded : 0;

  return {
    totalCommitted,
    totalFunded,
    totalCurrentValue,
    totalDistributions,
    totalGain,
    totalGainPct,
    avgCoc: weightBase > 0 ? weightedCoc / weightBase : 0,
    avgIrr: weightBase > 0 ? weightedIrr / weightBase : 0,
    equityMultiple,
    activeCount,
    totalCount: subs.length,
  };
}

/* ─────────────────────────────────────────────────────────────────────
 * Time-series + table helpers (Analytics + Activity MTD)
 * ───────────────────────────────────────────────────────────────────── */

export interface MonthlyDistPoint {
  /** First day of the month (UTC) */
  date: Date;
  label: string;
  amount: number;
}

/**
 * Bucket investor distribution allocations into the trailing N months
 * (oldest first). Months with no payouts return amount=0 so the bar
 * chart shows a continuous timeline.
 */
export function computeMonthlyDistributions(
  allocs: DistributionAllocationRow[],
  months = 12,
  now: Date = new Date()
): MonthlyDistPoint[] {
  const points: MonthlyDistPoint[] = [];
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
    points.push({
      date: d,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      amount: 0,
    });
  }

  for (const a of allocs) {
    const paid = a.distribution.paidOn;
    if (!paid) continue;
    const key = `${paid.getUTCFullYear()}-${paid.getUTCMonth()}`;
    const point = points.find(
      (p) => `${p.date.getUTCFullYear()}-${p.date.getUTCMonth()}` === key
    );
    if (point) point.amount += dec(a.amount);
  }

  return points;
}

export interface YtdDealRow {
  offeringId: string;
  dealName: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
  cocPct: number | null;
}

export interface YtdDistributionTable {
  rows: YtdDealRow[];
  totals: { q1: number; q2: number; q3: number; q4: number; total: number };
}

/**
 * Per-deal YTD distribution table broken into quarterly columns. CoC is the
 * sub.cocToDate stored on the Subscription (may be null for deals with no
 * funded capital yet).
 */
export function computeYtdDistributionTable(
  subs: SubscriptionWithOffering[],
  allocs: DistributionAllocationRow[],
  year: number = new Date().getUTCFullYear()
): YtdDistributionTable {
  const rows = new Map<string, YtdDealRow>();

  for (const s of subs) {
    rows.set(s.offeringId, {
      offeringId: s.offeringId,
      dealName: s.offering.name,
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
      total: 0,
      cocPct: s.cocToDate !== null ? dec(s.cocToDate) : null,
    });
  }

  for (const a of allocs) {
    const paid = a.distribution.paidOn;
    if (!paid || paid.getUTCFullYear() !== year) continue;
    const offeringId = a.distribution.offeringId;
    let row = rows.get(offeringId);
    if (!row) {
      row = {
        offeringId,
        dealName: a.distribution.offering.name,
        q1: 0,
        q2: 0,
        q3: 0,
        q4: 0,
        total: 0,
        cocPct: null,
      };
      rows.set(offeringId, row);
    }
    const amt = dec(a.amount);
    const q = Math.floor(paid.getUTCMonth() / 3); // 0..3
    if (q === 0) row.q1 += amt;
    else if (q === 1) row.q2 += amt;
    else if (q === 2) row.q3 += amt;
    else row.q4 += amt;
    row.total += amt;
  }

  const list = Array.from(rows.values())
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const totals = list.reduce(
    (acc, r) => {
      acc.q1 += r.q1;
      acc.q2 += r.q2;
      acc.q3 += r.q3;
      acc.q4 += r.q4;
      acc.total += r.total;
      return acc;
    },
    { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }
  );

  return { rows: list, totals };
}

export interface IrrBarRow {
  offeringId: string;
  dealName: string;
  irr: number | null;
  targetIrr: number | null;
}

/**
 * Map each subscription to a row of {actual IRR, target IRR midpoint} for
 * the Analytics IRR-vs-target horizontal bar chart.
 */
export function irrByDealVsTarget(
  subs: SubscriptionWithOffering[]
): IrrBarRow[] {
  return subs.map((s) => {
    const lo = s.offering.targetIrrLow !== null ? dec(s.offering.targetIrrLow) : null;
    const hi = s.offering.targetIrrHigh !== null ? dec(s.offering.targetIrrHigh) : null;
    let target: number | null = null;
    if (lo !== null && hi !== null) target = (lo + hi) / 2;
    else if (lo !== null) target = lo;
    else if (hi !== null) target = hi;
    return {
      offeringId: s.offeringId,
      dealName: s.offering.name,
      irr: s.irrToDate !== null ? dec(s.irrToDate) : null,
      targetIrr: target,
    };
  });
}

/** MTD aggregates for the Activity sidebar. */
export interface MtdCounters {
  distributionsAmount: number;
  newDocuments: number;
  updatesPosted: number;
}

export function computeMtdCounters(
  activities: ActivityRow[],
  now: Date = new Date()
): MtdCounters {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let distributionsAmount = 0;
  let newDocuments = 0;
  let updatesPosted = 0;
  for (const a of activities) {
    if (a.createdAt < monthStart) continue;
    if (a.eventType === "Distribution") {
      // Best-effort dollar parse from "$1,234" in the description.
      const m = a.description?.match(/\$([\d,]+(?:\.\d+)?)/);
      if (m) distributionsAmount += Number(m[1].replace(/,/g, ""));
    } else if (a.eventType === "Document") {
      newDocuments += 1;
    } else if (a.eventType === "Update") {
      updatesPosted += 1;
    }
  }
  return { distributionsAmount, newDocuments, updatesPosted };
}

export const num = dec;
