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
  return prisma.investorDocument.findMany({
    where: {
      OR: [
        { investorId },
        { offering: { subscriptions: { some: { investorId } } } },
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

  return {
    totalCommitted,
    totalFunded,
    totalCurrentValue,
    totalDistributions,
    totalGain,
    totalGainPct,
    avgCoc: weightBase > 0 ? weightedCoc / weightBase : 0,
    avgIrr: weightBase > 0 ? weightedIrr / weightBase : 0,
    activeCount,
    totalCount: subs.length,
  };
}

export const num = dec;
