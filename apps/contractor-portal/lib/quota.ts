import { prisma } from "./prisma";

export const FREE_TIER_EXTERNAL_QUOTES = 3;

function ym(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getQuotaStatus(accountId: string) {
  const account = await prisma.cpAccount.findUnique({
    where: { id: accountId },
    select: { planTier: true },
  });
  const plan = account?.planTier || "free";
  const usage = await prisma.cpQuotaUsage.findUnique({
    where: { accountId_yearMonth: { accountId, yearMonth: ym() } },
  });
  const used = usage?.quotesUsed || 0;
  const max = plan === "free" ? FREE_TIER_EXTERNAL_QUOTES : Infinity;
  const remaining = Math.max(0, max - used);
  return { plan, used, max, remaining, blocked: plan === "free" && used >= FREE_TIER_EXTERNAL_QUOTES };
}

/**
 * Increment the external-quote counter for the current month. Returns
 * `false` if the contractor is already at their free-tier cap.
 */
export async function consumeQuota(accountId: string): Promise<boolean> {
  const status = await getQuotaStatus(accountId);
  if (status.blocked) return false;
  await prisma.cpQuotaUsage.upsert({
    where: { accountId_yearMonth: { accountId, yearMonth: ym() } },
    create: { accountId, yearMonth: ym(), quotesUsed: 1 },
    update: { quotesUsed: { increment: 1 } },
  });
  return true;
}
