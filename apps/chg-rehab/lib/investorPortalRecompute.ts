import { prisma } from "./prisma";
import { SubscriptionCommitmentType } from "@prisma/client";

/**
 * Recompute Offering.raisedToHard / raisedToSoft from the live set of
 * subscriptions. Called whenever subscriptions are upserted, edited, or
 * deleted so the Fundraising tab progress bar stays honest.
 *
 * raisedToHard = sum of committed where commitmentType = Hard
 * raisedToSoft = sum of committed across ALL subscriptions (incl. Hard)
 *               so the soft total represents "total interest" — matches
 *               Phase 1 seed conventions.
 */
export async function recomputeOfferingRaised(offeringId: string): Promise<void> {
  const subs = await prisma.investorSubscription.findMany({
    where: { offeringId },
    select: { committedAmount: true, commitmentType: true },
  });

  let hard = 0;
  let soft = 0;
  for (const s of subs) {
    const amt = Number(s.committedAmount);
    soft += amt;
    if (s.commitmentType === SubscriptionCommitmentType.Hard) hard += amt;
  }

  await prisma.offering.update({
    where: { id: offeringId },
    data: { raisedToHard: hard, raisedToSoft: soft },
  });
}

export async function recomputeOwnership(offeringId: string): Promise<void> {
  const subs = await prisma.investorSubscription.findMany({
    where: { offeringId },
    select: { id: true, committedAmount: true },
  });
  const totalCommitted = subs.reduce((s, x) => s + Number(x.committedAmount), 0);

  await prisma.$transaction(
    subs.map((s) =>
      prisma.investorSubscription.update({
        where: { id: s.id },
        data: {
          ownershipPct:
            totalCommitted > 0
              ? Number(((Number(s.committedAmount) / totalCommitted) * 100).toFixed(4))
              : 0,
        },
      })
    )
  );
}
