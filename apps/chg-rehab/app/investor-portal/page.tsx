import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import InvestorPortalClient from "./Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Investor Portal · CHG Platform" };

const VALID_TABS = new Set(["overview", "investors", "deals", "fundraising", "finance"]);

export default async function InvestorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/investor-portal");

  const sp = await searchParams;
  const tab = VALID_TABS.has(sp.tab || "") ? (sp.tab as string) : "overview";

  const [investors, offerings, distributions, capitalCalls] = await Promise.all([
    prisma.investor.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: { select: { committedAmount: true, fundedAmount: true } },
      },
    }),
    prisma.offering.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: {
          include: {
            investor: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    }),
    prisma.distribution.findMany({
      where: { offering: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
      include: {
        offering: { select: { id: true, name: true } },
        allocations: {
          include: {
            subscription: {
              include: {
                investor: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.capitalCall.findMany({
      where: { offering: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
      include: {
        offering: { select: { id: true, name: true } },
        allocations: {
          include: {
            subscription: {
              include: {
                investor: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const investorName = (inv: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  }) =>
    [inv.firstName, inv.lastName].filter(Boolean).join(" ") ||
    inv.email ||
    "Investor";

  const investorRows = investors.map((i) => ({
    id: i.id,
    email: i.email,
    firstName: i.firstName,
    lastName: i.lastName,
    phone: i.phone,
    accreditedStatus: i.accreditedStatus,
    status: i.status,
    portalLastLoginAt: i.portalLastLoginAt?.toISOString() ?? null,
    committedTotal: i.subscriptions.reduce((s, x) => s + Number(x.committedAmount), 0),
    fundedTotal: i.subscriptions.reduce((s, x) => s + Number(x.fundedAmount), 0),
    subscriptionCount: i.subscriptions.length,
  }));

  const offeringRows = offerings.map((o) => ({
    id: o.id,
    name: o.name,
    propertyType: o.propertyType,
    marketCity: o.marketCity,
    marketState: o.marketState,
    description: o.description,
    targetIrrLow: o.targetIrrLow ? Number(o.targetIrrLow) : null,
    targetIrrHigh: o.targetIrrHigh ? Number(o.targetIrrHigh) : null,
    prefReturnPct: o.prefReturnPct ? Number(o.prefReturnPct) : null,
    holdMonths: o.holdMonths,
    minInvestment: o.minInvestment ? Number(o.minInvestment) : null,
    raiseTarget: o.raiseTarget ? Number(o.raiseTarget) : null,
    raisedToHard: o.raisedToHard ? Number(o.raisedToHard) : null,
    raisedToSoft: o.raisedToSoft ? Number(o.raisedToSoft) : null,
    stage: o.stage,
    status: o.status,
    closeDate: o.closeDate?.toISOString() ?? null,
    coverImageUrl: o.coverImageUrl,
    coverImageObjectPath: o.coverImageObjectPath,
    documentObjectPaths: o.documentObjectPaths,
    wireInstructions:
      (o.wireInstructions as Record<string, string> | null) ?? null,
    subscriptions: o.subscriptions.map((s) => ({
      id: s.id,
      investorId: s.investorId,
      investorName: investorName(s.investor),
      investorEmail: s.investor.email,
      committedAmount: Number(s.committedAmount),
      fundedAmount: Number(s.fundedAmount),
      commitmentType: s.commitmentType,
      status: s.status,
      ownershipPct: s.ownershipPct ? Number(s.ownershipPct) : null,
      lifetimeDistributions: Number(s.lifetimeDistributions),
    })),
  }));

  const distributionRows = distributions.map((d) => ({
    id: d.id,
    offeringId: d.offeringId,
    offeringName: d.offering.name,
    periodLabel: d.periodLabel,
    distributionType: d.distributionType,
    totalAmount: Number(d.totalAmount),
    paidOn: d.paidOn?.toISOString() ?? null,
    status: d.status,
    allocations: d.allocations.map((a) => ({
      id: a.id,
      subscriptionId: a.subscriptionId,
      investorName: investorName(a.subscription.investor),
      amount: Number(a.amount),
      status: a.status,
    })),
  }));

  const callRows = capitalCalls.map((c) => ({
    id: c.id,
    offeringId: c.offeringId,
    offeringName: c.offering.name,
    noticeNumber: c.noticeNumber,
    totalAmount: Number(c.totalAmount),
    dueDate: c.dueDate?.toISOString() ?? null,
    status: c.status,
    allocations: c.allocations.map((a) => ({
      id: a.id,
      subscriptionId: a.subscriptionId,
      investorName: investorName(a.subscription.investor),
      amountDue: Number(a.amountDue),
      amountReceived: Number(a.amountReceived),
    })),
  }));

  return (
    <Suspense fallback={null}>
      <InvestorPortalClient
        initialTab={tab}
        investors={investorRows}
        offerings={offeringRows}
        distributions={distributionRows}
        capitalCalls={callRows}
      />
    </Suspense>
  );
}
