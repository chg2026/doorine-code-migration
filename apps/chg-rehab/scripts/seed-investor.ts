/**
 * Standalone Investor Portal Phase 1 seed.
 *
 * Runs the investor-portal demo data (Investor + 4 Offerings + 4
 * Subscriptions + 2 Distributions + 3 DealUpdates + 4 Activities) without
 * re-running the full chg-rehab seed, which has pre-existing data
 * conflicts that are out of scope for Phase 1.
 *
 * Run:
 *   npm run rehab:db:seed-investor
 * or:
 *   tsx apps/chg-rehab/scripts/seed-investor.ts
 */
import {
  PrismaClient,
  InvestorAccreditedStatus,
  InvestorStatus,
  OfferingPropertyType,
  OfferingStage,
  OfferingStatus,
  SubscriptionCommitmentType,
  InvestorSubscriptionStatus,
  DistributionType,
  DistributionStatus,
  DistributionAllocationStatus,
  DealUpdateType,
  InvestorActivityType,
} from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const COMPANY_ID = "seed-company-chg";
const INVESTOR_EMAIL = "james.wilson@vestry-demo.com";
const INVESTOR_PASSWORD = "password123";
const FALLBACK_INVESTOR_ID = "00000000-0000-4000-8000-000000000001";

async function main() {
  // Ensure the demo company exists (idempotent — tolerates the case where
  // the broader chg-rehab seed has not been run).
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: { name: "Cleveland Holding Group" },
    create: {
      id: COMPANY_ID,
      name: "Cleveland Holding Group",
      legalName: "Cleveland Holding Group LLC",
      ein: "82-1234567",
    },
  });

  // ── Best-effort Supabase auth user + user_profiles flag ────────────
  let investorId = FALLBACK_INVESTOR_ID;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sbUrl && sbKey) {
    try {
      const admin = createClient(sbUrl, sbKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      let existingId: string | null = null;
      for (let page = 1; page <= 5 && !existingId; page++) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) break;
        const found = data.users.find(
          (u) => (u.email || "").toLowerCase() === INVESTOR_EMAIL
        );
        if (found) existingId = found.id;
        if (data.users.length < 200) break;
      }
      if (existingId) {
        investorId = existingId;
        console.log(
          `[seed:investor] reused Supabase auth user ${INVESTOR_EMAIL} (${investorId})`
        );
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: INVESTOR_EMAIL,
          password: INVESTOR_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: "James Wilson" },
        });
        if (error) {
          console.warn(
            "[seed:investor] could not create Supabase auth user:",
            error.message
          );
        } else if (data.user) {
          investorId = data.user.id;
          console.log(
            `[seed:investor] created Supabase auth user ${INVESTOR_EMAIL} (${investorId})`
          );
        }
      }
      const { error: upErr } = await admin.from("user_profiles").upsert(
        {
          id: investorId,
          email: INVESTOR_EMAIL,
          full_name: "James Wilson",
          is_investor: true,
          status: "active",
        },
        { onConflict: "id" }
      );
      if (upErr) {
        console.warn(
          "[seed:investor] could not upsert user_profiles:",
          upErr.message
        );
      } else {
        console.log("[seed:investor] user_profiles is_investor=true upserted");
      }
    } catch (e) {
      console.warn(
        "[seed:investor] Supabase step failed:",
        (e as Error).message
      );
    }
  } else {
    console.warn(
      "[seed:investor] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, " +
        "using fallback investor id"
    );
  }

  // ── Investor ────────────────────────────────────────────────────────
  await prisma.investor.upsert({
    where: { id: investorId },
    update: {
      companyId: COMPANY_ID,
      email: INVESTOR_EMAIL,
      firstName: "James",
      lastName: "Wilson",
      phone: "+1-757-555-0142",
      accreditedStatus: InvestorAccreditedStatus.Verified,
      status: InvestorStatus.Active,
    },
    create: {
      id: investorId,
      companyId: COMPANY_ID,
      email: INVESTOR_EMAIL,
      firstName: "James",
      lastName: "Wilson",
      phone: "+1-757-555-0142",
      accreditedStatus: InvestorAccreditedStatus.Verified,
      status: InvestorStatus.Active,
    },
  });

  // ── 4 Offerings ─────────────────────────────────────────────────────
  const offeringSpecs = [
    {
      id: "seed-offering-1",
      name: "Lakewood Ave SFR Fund",
      propertyType: OfferingPropertyType.SF,
      marketCity: "Norfolk",
      marketState: "VA",
      description:
        "Value-add single-family rehab + rent in Norfolk's Lakewood corridor.",
      targetIrrLow: "16.0",
      targetIrrHigh: "22.0",
      prefReturnPct: "8.0",
      holdMonths: 36,
      minInvestment: "50000",
      raiseTarget: "1500000",
      raisedToHard: "1500000",
      raisedToSoft: "1500000",
      stage: OfferingStage.Closed,
      status: OfferingStatus.Active,
      closeDate: "2025-09-15",
    },
    {
      id: "seed-offering-2",
      name: "Edgewood Duplex Fund II",
      propertyType: OfferingPropertyType.MF,
      marketCity: "Norfolk",
      marketState: "VA",
      description: "Two-property duplex rehab with cash-flow focus.",
      targetIrrLow: "14.0",
      targetIrrHigh: "18.0",
      prefReturnPct: "8.0",
      holdMonths: 48,
      minInvestment: "50000",
      raiseTarget: "2000000",
      raisedToHard: "1750000",
      raisedToSoft: "1900000",
      stage: OfferingStage.Closing,
      status: OfferingStatus.Active,
      closeDate: "2026-06-30",
    },
    {
      id: "seed-offering-3",
      name: "Cleveland BTR Portfolio",
      propertyType: OfferingPropertyType.SF,
      marketCity: "Cleveland",
      marketState: "OH",
      description: "Build-to-rent SFR portfolio across 8 Cleveland sub-markets.",
      targetIrrLow: "15.0",
      targetIrrHigh: "20.0",
      prefReturnPct: "7.5",
      holdMonths: 60,
      minInvestment: "100000",
      raiseTarget: "5000000",
      raisedToHard: "1200000",
      raisedToSoft: "2400000",
      stage: OfferingStage.Raise,
      status: OfferingStatus.Active,
      closeDate: "2026-09-30",
    },
    {
      id: "seed-offering-4",
      name: "VA Beach Short-Term Rentals",
      propertyType: OfferingPropertyType.MX,
      marketCity: "Virginia Beach",
      marketState: "VA",
      description: "Coastal STR conversion of 4 beachfront properties.",
      targetIrrLow: "18.0",
      targetIrrHigh: "25.0",
      prefReturnPct: "8.0",
      holdMonths: 36,
      minInvestment: "75000",
      raiseTarget: "3000000",
      raisedToHard: "0",
      raisedToSoft: "450000",
      stage: OfferingStage.Prospecting,
      status: OfferingStatus.Active,
      closeDate: "2026-12-31",
    },
  ] as const;

  for (const o of offeringSpecs) {
    const data = {
      companyId: COMPANY_ID,
      name: o.name,
      propertyType: o.propertyType,
      marketCity: o.marketCity,
      marketState: o.marketState,
      description: o.description,
      targetIrrLow: o.targetIrrLow,
      targetIrrHigh: o.targetIrrHigh,
      prefReturnPct: o.prefReturnPct,
      holdMonths: o.holdMonths,
      minInvestment: o.minInvestment,
      raiseTarget: o.raiseTarget,
      raisedToHard: o.raisedToHard,
      raisedToSoft: o.raisedToSoft,
      stage: o.stage,
      status: o.status,
      closeDate: new Date(o.closeDate),
    };
    await prisma.offering.upsert({
      where: { id: o.id },
      update: data,
      create: { id: o.id, ...data },
    });
  }

  // ── 4 Subscriptions ────────────────────────────────────────────────
  const subscriptionSpecs = [
    {
      id: "seed-sub-1",
      offeringId: "seed-offering-1",
      committedAmount: "150000",
      fundedAmount: "150000",
      commitmentType: SubscriptionCommitmentType.Hard,
      signedAt: "2025-08-12",
      fundedAt: "2025-08-20",
      ownershipPct: "10.0000",
      currentValue: "171500",
      lifetimeDistributions: "12400",
      irrToDate: "17.40",
      cocToDate: "8.30",
      status: InvestorSubscriptionStatus.Active,
    },
    {
      id: "seed-sub-2",
      offeringId: "seed-offering-2",
      committedAmount: "100000",
      fundedAmount: "100000",
      commitmentType: SubscriptionCommitmentType.Hard,
      signedAt: "2025-11-05",
      fundedAt: "2025-11-12",
      ownershipPct: "5.0000",
      currentValue: "104500",
      lifetimeDistributions: "3200",
      irrToDate: "12.10",
      cocToDate: "3.20",
      status: InvestorSubscriptionStatus.Active,
    },
    {
      id: "seed-sub-3",
      offeringId: "seed-offering-3",
      committedAmount: "200000",
      fundedAmount: "0",
      commitmentType: SubscriptionCommitmentType.Soft,
      signedAt: "2026-04-18",
      ownershipPct: "4.0000",
      status: InvestorSubscriptionStatus.Pending,
    },
    {
      id: "seed-sub-4",
      offeringId: "seed-offering-4",
      committedAmount: "75000",
      fundedAmount: "0",
      commitmentType: SubscriptionCommitmentType.Soft,
      signedAt: "2026-04-26",
      ownershipPct: "2.5000",
      status: InvestorSubscriptionStatus.Pending,
    },
  ] as const;

  for (const spec of subscriptionSpecs) {
    const s = spec as typeof spec & {
      fundedAt?: string;
      currentValue?: string;
      lifetimeDistributions?: string;
      irrToDate?: string;
      cocToDate?: string;
    };
    const data = {
      investorId,
      offeringId: s.offeringId,
      committedAmount: s.committedAmount,
      fundedAmount: s.fundedAmount,
      commitmentType: s.commitmentType,
      signedAt: s.signedAt ? new Date(s.signedAt) : null,
      fundedAt: s.fundedAt ? new Date(s.fundedAt) : null,
      ownershipPct: s.ownershipPct,
      currentValue: s.currentValue ?? null,
      lifetimeDistributions: s.lifetimeDistributions ?? "0",
      irrToDate: s.irrToDate ?? null,
      cocToDate: s.cocToDate ?? null,
      status: s.status,
    };
    await prisma.investorSubscription.upsert({
      where: { id: s.id },
      update: data,
      create: { id: s.id, ...data },
    });
  }

  // ── 2 Distributions + per-investor allocations ────────────────────
  const distributionSpecs = [
    {
      id: "seed-dist-1",
      offeringId: "seed-offering-1",
      periodLabel: "Q4 2025",
      distributionType: DistributionType.CashFlow,
      totalAmount: "62000",
      perDollarRate: "0.041333",
      paidOn: "2026-01-15",
      status: DistributionStatus.Sent,
      subscriptionId: "seed-sub-1",
      allocationId: "seed-dist-alloc-1",
      amount: "6200",
      wireRef: "WIRE-2026-0115-CHG1",
    },
    {
      id: "seed-dist-2",
      offeringId: "seed-offering-1",
      periodLabel: "Q1 2026",
      distributionType: DistributionType.CashFlow,
      totalAmount: "62000",
      perDollarRate: "0.041333",
      paidOn: "2026-04-15",
      status: DistributionStatus.Sent,
      subscriptionId: "seed-sub-1",
      allocationId: "seed-dist-alloc-2",
      amount: "6200",
      wireRef: "WIRE-2026-0415-CHG1",
    },
  ] as const;

  for (const d of distributionSpecs) {
    await prisma.distribution.upsert({
      where: { id: d.id },
      update: {
        offeringId: d.offeringId,
        periodLabel: d.periodLabel,
        distributionType: d.distributionType,
        totalAmount: d.totalAmount,
        perDollarRate: d.perDollarRate,
        paidOn: new Date(d.paidOn),
        status: d.status,
      },
      create: {
        id: d.id,
        offeringId: d.offeringId,
        periodLabel: d.periodLabel,
        distributionType: d.distributionType,
        totalAmount: d.totalAmount,
        perDollarRate: d.perDollarRate,
        paidOn: new Date(d.paidOn),
        status: d.status,
      },
    });
    await prisma.distributionAllocation.upsert({
      where: { id: d.allocationId },
      update: {
        distributionId: d.id,
        subscriptionId: d.subscriptionId,
        amount: d.amount,
        wireRef: d.wireRef,
        status: DistributionAllocationStatus.Sent,
      },
      create: {
        id: d.allocationId,
        distributionId: d.id,
        subscriptionId: d.subscriptionId,
        amount: d.amount,
        wireRef: d.wireRef,
        status: DistributionAllocationStatus.Sent,
      },
    });
  }

  // ── 3 Deal Updates ────────────────────────────────────────────────
  const updateSpecs = [
    {
      id: "seed-update-1",
      offeringId: "seed-offering-1",
      updateType: DealUpdateType.Quarterly,
      title: "Q1 2026 Update — Lakewood Ave SFR Fund",
      body:
        "Property is fully tenanted at $1,950/mo. Q1 distributions paid on schedule. " +
        "Year-1 IRR tracking 17.4%, slightly ahead of underwriting (16-18% range).",
      postedAt: "2026-04-15T14:00:00Z",
      published: true,
    },
    {
      id: "seed-update-2",
      offeringId: "seed-offering-2",
      updateType: DealUpdateType.Market,
      title: "Edgewood Duplex II — 87.5% subscribed",
      body:
        "Soft commits crossed $1.9M of the $2.0M target. Hard close June 30, 2026.",
      postedAt: "2026-04-10T10:00:00Z",
      published: true,
    },
    {
      id: "seed-update-3",
      offeringId: "seed-offering-3",
      updateType: DealUpdateType.Market,
      title: "Cleveland BTR Portfolio now open",
      body:
        "8-property build-to-rent thesis across Cleveland's eastern sub-markets. " +
        "Deck and PPM available in Documents.",
      postedAt: "2026-03-22T09:00:00Z",
      published: true,
    },
  ] as const;

  for (const u of updateSpecs) {
    await prisma.dealUpdate.upsert({
      where: { id: u.id },
      update: {
        offeringId: u.offeringId,
        updateType: u.updateType,
        title: u.title,
        body: u.body,
        postedAt: new Date(u.postedAt),
        published: u.published,
      },
      create: {
        id: u.id,
        offeringId: u.offeringId,
        updateType: u.updateType,
        title: u.title,
        body: u.body,
        postedAt: new Date(u.postedAt),
        published: u.published,
      },
    });
  }

  // ── 4 Investor Activities ─────────────────────────────────────────
  const activitySpecs = [
    {
      id: "seed-iact-1",
      eventType: InvestorActivityType.Distribution,
      title: "Distribution received — $6,200",
      description: "Q1 2026 distribution from Lakewood Ave SFR Fund.",
      relatedSubscriptionId: "seed-sub-1" as string | null,
      relatedUpdateId: null as string | null,
      createdAt: "2026-04-15T14:05:00Z",
    },
    {
      id: "seed-iact-2",
      eventType: InvestorActivityType.Update,
      title: "New update posted",
      description: "Q1 2026 Update for Lakewood Ave SFR Fund.",
      relatedSubscriptionId: null as string | null,
      relatedUpdateId: "seed-update-1" as string | null,
      createdAt: "2026-04-15T14:00:00Z",
    },
    {
      id: "seed-iact-3",
      eventType: InvestorActivityType.Subscription,
      title: "Subscription signed — VA Beach STR",
      description: "Soft-circled $75k for VA Beach Short-Term Rentals.",
      relatedSubscriptionId: "seed-sub-4" as string | null,
      relatedUpdateId: null as string | null,
      createdAt: "2026-04-26T16:20:00Z",
    },
    {
      id: "seed-iact-4",
      eventType: InvestorActivityType.Other,
      title: "Portal login",
      description: "Signed in to the investor portal.",
      relatedSubscriptionId: null as string | null,
      relatedUpdateId: null as string | null,
      createdAt: "2026-04-30T09:14:00Z",
    },
  ];

  for (const a of activitySpecs) {
    await prisma.investorActivity.upsert({
      where: { id: a.id },
      update: {
        investorId,
        eventType: a.eventType,
        title: a.title,
        description: a.description,
        relatedSubscriptionId: a.relatedSubscriptionId,
        relatedUpdateId: a.relatedUpdateId,
        createdAt: new Date(a.createdAt),
      },
      create: {
        id: a.id,
        investorId,
        eventType: a.eventType,
        title: a.title,
        description: a.description,
        relatedSubscriptionId: a.relatedSubscriptionId,
        relatedUpdateId: a.relatedUpdateId,
        createdAt: new Date(a.createdAt),
      },
    });
  }

  console.log(
    `[seed:investor] DONE — investor ${INVESTOR_EMAIL} (${investorId}) with ` +
      `${offeringSpecs.length} offerings, ${subscriptionSpecs.length} subscriptions, ` +
      `${distributionSpecs.length} distributions, ${updateSpecs.length} updates, ` +
      `${activitySpecs.length} activities`
  );
}

main()
  .catch((e) => {
    console.error("[seed:investor] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
