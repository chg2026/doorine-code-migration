import { prisma } from "./prisma";

/**
 * Derive a contractor's role tier from the OperatorEdge graph.
 *   L1 = chg-rehab operator (not a CpAccount; surfaced via the Layer-1
 *        "Operator Lens" inside chg-rehab, not this app).
 *   L2 = invited by an L1 chg-rehab Company.
 *   L3 = invited by another CpAccount (an L2 contractor).
 *   sole = no inbound edges (just a free-tier contractor).
 */
export type ContractorRole = "L2" | "L3" | "sole";

export async function deriveRole(accountId: string): Promise<ContractorRole> {
  const edges = await prisma.cpOperatorEdge.findMany({
    where: { contractorId: accountId },
    select: { layer1CompanyId: true, inviterAccountId: true },
  });
  if (edges.some((e) => e.layer1CompanyId)) return "L2";
  if (edges.some((e) => e.inviterAccountId)) return "L3";
  return "sole";
}

/** All upstream operators that can see this contractor. */
export async function getOperators(accountId: string) {
  return prisma.cpOperatorEdge.findMany({
    where: { contractorId: accountId },
    include: {
      layer1Company: { select: { id: true, name: true } },
      inviter: { select: { id: true, contactName: true, companyName: true } },
    },
  });
}

/** All downstream contractors this account has invited (L2 only). */
export async function getInvitees(accountId: string) {
  return prisma.cpOperatorEdge.findMany({
    where: { inviterAccountId: accountId },
    include: {
      contractor: { select: { id: true, contactName: true, companyName: true, email: true, trade: true } },
    },
  });
}
