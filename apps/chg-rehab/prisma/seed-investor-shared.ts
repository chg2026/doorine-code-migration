/**
 * Investor-portal seed logic shared between the full `seed.ts` (which runs
 * it at the end of `main()`) and the standalone `seed-investor.ts` (which
 * runs it on its own without the rest of the chg-rehab seed).
 */
import type { PrismaClient } from "@prisma/client";

export async function seedInvestorPortal(prisma: PrismaClient, companyId: string) {
  console.log("[seed:investor] starting");

  // NOTE: `public.user_profiles` lives in the **Supabase** database, not in
  // Helium DB (which is what `prisma` here is connected to via DATABASE_URL).
  // Schema changes for that table — including the `is_investor` column —
  // are versioned in `supabase/migrations/` and applied via
  // `npm run supabase:migrate` (or by hand from the Supabase SQL editor).
  // See `apps/chg-rehab/prisma/README.md` for the full split.

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn("[seed:investor] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping demo investor.");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const demoEmail = "james.wilson@vestry-demo.com";
  const demoPassword = "password123";

  let authUserId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { full_name: "James Wilson", is_demo_investor: true },
  });
  if (created.data.user) {
    authUserId = created.data.user.id;
  } else if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === demoEmail);
    if (found) {
      authUserId = found.id;
      await admin.auth.admin.updateUserById(found.id, {
        password: demoPassword,
        email_confirm: true,
      });
    } else {
      console.error("[seed:investor] failed to create or find demo user:", created.error.message);
      return;
    }
  }
  if (!authUserId) {
    console.error("[seed:investor] no auth user id resolved; aborting investor seed.");
    return;
  }

  // NOTE: `account_id` on Supabase `user_profiles` is a UUID FK to the
  //   Supabase `accounts` table — distinct from the Prisma `Company.id`
  //   string used by the chg-rehab seed. We intentionally leave it null
  //   for the demo investor; the Prisma `Investor.companyId` carries the
  //   association the investor portal cares about.
  const { error: profileErr } = await admin.from("user_profiles").upsert(
    {
      id: authUserId,
      email: demoEmail,
      full_name: "James Wilson",
      is_investor: true,
      is_super_admin: false,
      is_account_admin: false,
      status: "active",
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    console.error("[seed:investor] user_profiles upsert failed:", profileErr.message);
    return;
  }

  await prisma.investor.upsert({
    where: { id: authUserId },
    update: {
      companyId,
      email: demoEmail,
      firstName: "James",
      lastName: "Wilson",
      phone: "+15551234567",
      accreditedStatus: "Verified",
      status: "Active",
    },
    create: {
      id: authUserId,
      companyId,
      email: demoEmail,
      firstName: "James",
      lastName: "Wilson",
      phone: "+15551234567",
      accreditedStatus: "Verified",
      status: "Active",
    },
  });

  const offerings: {
    id: string;
    name: string;
    propertyType: "MF" | "SF" | "MX" | "Other";
    marketCity: string;
    marketState: string;
    targetIrrLow: number;
    targetIrrHigh: number;
    holdMonths: number;
    raiseTarget: number;
    raisedToHard: number;
    stage: "Prospecting" | "Diligence" | "Raise" | "Closing" | "Closed";
    closeDate: Date | null;
    description: string;
    committed: number;
    funded: number;
    irr: number;
    coc: number;
    currentValue: number;
    lifetimeDist: number;
    subStatus: "Pending" | "Active" | "Closed";
    commitType: "Soft" | "Hard";
  }[] = [
    {
      id: "seed-offering-maple-grove",
      name: "Maple Grove Apartments",
      propertyType: "MF",
      marketCity: "Cleveland",
      marketState: "OH",
      targetIrrLow: 14,
      targetIrrHigh: 16,
      holdMonths: 60,
      raiseTarget: 8_000_000,
      raisedToHard: 7_500_000,
      stage: "Closing",
      closeDate: new Date("2025-09-15T00:00:00Z"),
      description: "120-unit value-add multifamily acquisition in Cleveland.",
      committed: 150_000,
      funded: 150_000,
      irr: 14.7,
      coc: 8.2,
      currentValue: 168_500,
      lifetimeDist: 12_400,
      subStatus: "Active",
      commitType: "Hard",
    },
    {
      id: "seed-offering-riverside",
      name: "Riverside Commons",
      propertyType: "MF",
      marketCity: "Columbus",
      marketState: "OH",
      targetIrrLow: 11,
      targetIrrHigh: 13,
      holdMonths: 60,
      raiseTarget: 6_500_000,
      raisedToHard: 6_500_000,
      stage: "Closed",
      closeDate: new Date("2024-11-30T00:00:00Z"),
      description: "84-unit Class B multifamily, stabilized cash flow.",
      committed: 100_000,
      funded: 100_000,
      irr: 12.0,
      coc: 7.5,
      currentValue: 108_900,
      lifetimeDist: 7_500,
      subStatus: "Active",
      commitType: "Hard",
    },
    {
      id: "seed-offering-commerce-park",
      name: "Commerce Park Industrial",
      propertyType: "MX",
      marketCity: "Akron",
      marketState: "OH",
      targetIrrLow: 16,
      targetIrrHigh: 19,
      holdMonths: 48,
      raiseTarget: 12_000_000,
      raisedToHard: 11_200_000,
      stage: "Raise",
      closeDate: new Date("2026-06-30T00:00:00Z"),
      description: "Light industrial / flex park with strong tenant demand.",
      committed: 200_000,
      funded: 200_000,
      irr: 17.6,
      coc: 9.1,
      currentValue: 228_400,
      lifetimeDist: 18_200,
      subStatus: "Active",
      commitType: "Hard",
    },
    {
      id: "seed-offering-elm-street",
      name: "Elm Street Townhomes",
      propertyType: "SF",
      marketCity: "Cincinnati",
      marketState: "OH",
      targetIrrLow: 9,
      targetIrrHigh: 12,
      holdMonths: 36,
      raiseTarget: 2_500_000,
      raisedToHard: 2_500_000,
      stage: "Closed",
      closeDate: new Date("2024-07-01T00:00:00Z"),
      description: "12-unit townhome rehab. Underperforming.",
      committed: 35_000,
      funded: 35_000,
      irr: -5.8,
      coc: 1.2,
      currentValue: 32_900,
      lifetimeDist: 420,
      subStatus: "Active",
      commitType: "Hard",
    },
  ];

  for (const o of offerings) {
    await prisma.offering.upsert({
      where: { id: o.id },
      update: {
        companyId,
        name: o.name,
        propertyType: o.propertyType,
        marketCity: o.marketCity,
        marketState: o.marketState,
        description: o.description,
        targetIrrLow: o.targetIrrLow,
        targetIrrHigh: o.targetIrrHigh,
        holdMonths: o.holdMonths,
        raiseTarget: o.raiseTarget,
        raisedToHard: o.raisedToHard,
        closeDate: o.closeDate,
        stage: o.stage,
      },
      create: {
        id: o.id,
        companyId,
        name: o.name,
        propertyType: o.propertyType,
        marketCity: o.marketCity,
        marketState: o.marketState,
        description: o.description,
        targetIrrLow: o.targetIrrLow,
        targetIrrHigh: o.targetIrrHigh,
        holdMonths: o.holdMonths,
        raiseTarget: o.raiseTarget,
        raisedToHard: o.raisedToHard,
        closeDate: o.closeDate,
        stage: o.stage,
      },
    });

    const subId = `seed-sub-${o.id}`;
    await prisma.investorSubscription.upsert({
      where: { id: subId },
      update: {
        committedAmount: o.committed,
        fundedAmount: o.funded,
        commitmentType: o.commitType,
        signedAt: o.closeDate || new Date(),
        fundedAt: o.closeDate || new Date(),
        currentValue: o.currentValue,
        lifetimeDistributions: o.lifetimeDist,
        irrToDate: o.irr,
        cocToDate: o.coc,
        status: o.subStatus,
      },
      create: {
        id: subId,
        investorId: authUserId,
        offeringId: o.id,
        committedAmount: o.committed,
        fundedAmount: o.funded,
        commitmentType: o.commitType,
        signedAt: o.closeDate || new Date(),
        fundedAt: o.closeDate || new Date(),
        currentValue: o.currentValue,
        lifetimeDistributions: o.lifetimeDist,
        irrToDate: o.irr,
        cocToDate: o.coc,
        status: o.subStatus,
      },
    });

    const distId = `seed-dist-${o.id}-q1-2026`;
    await prisma.distribution.upsert({
      where: { id: distId },
      update: {
        offeringId: o.id,
        periodLabel: "Q1 2026",
        totalAmount: Number(o.lifetimeDist) || 1,
        paidOn: new Date("2026-04-15T00:00:00Z"),
        status: "Sent",
      },
      create: {
        id: distId,
        offeringId: o.id,
        periodLabel: "Q1 2026",
        distributionType: "CashFlow",
        totalAmount: Number(o.lifetimeDist) || 1,
        paidOn: new Date("2026-04-15T00:00:00Z"),
        status: "Sent",
      },
    });

    const allocId = `seed-distalloc-${o.id}-q1-2026`;
    await prisma.distributionAllocation.upsert({
      where: { id: allocId },
      update: { amount: Number(o.lifetimeDist) || 1, status: "Sent" },
      create: {
        id: allocId,
        distributionId: distId,
        subscriptionId: subId,
        amount: Number(o.lifetimeDist) || 1,
        status: "Sent",
      },
    });

    const updateId = `seed-update-${o.id}-q1`;
    await prisma.dealUpdate.upsert({
      where: { id: updateId },
      update: {
        title: `${o.name} — Q1 2026 update`,
        body: `Quarterly operations update for ${o.name}. Performance tracking to plan.`,
        published: true,
      },
      create: {
        id: updateId,
        offeringId: o.id,
        updateType: "Quarterly",
        title: `${o.name} — Q1 2026 update`,
        body: `Quarterly operations update for ${o.name}. Performance tracking to plan.`,
        published: true,
        postedAt: new Date("2026-04-20T00:00:00Z"),
      },
    });

    const distActivityId = `seed-activity-${o.id}-dist`;
    await prisma.investorActivity.upsert({
      where: { id: distActivityId },
      update: {
        title: `Distribution received — ${o.name}`,
        description: `Q1 2026 distribution of $${Number(o.lifetimeDist).toLocaleString()} paid.`,
      },
      create: {
        id: distActivityId,
        investorId: authUserId,
        eventType: "Distribution",
        title: `Distribution received — ${o.name}`,
        description: `Q1 2026 distribution of $${Number(o.lifetimeDist).toLocaleString()} paid.`,
        relatedSubscriptionId: subId,
        createdAt: new Date("2026-04-15T12:00:00Z"),
      },
    });

    const updActivityId = `seed-activity-${o.id}-update`;
    await prisma.investorActivity.upsert({
      where: { id: updActivityId },
      update: {
        title: `New update posted — ${o.name}`,
        description: "Quarterly update available.",
      },
      create: {
        id: updActivityId,
        investorId: authUserId,
        eventType: "Update",
        title: `New update posted — ${o.name}`,
        description: "Quarterly update available.",
        relatedUpdateId: updateId,
        createdAt: new Date("2026-04-20T09:00:00Z"),
      },
    });
  }

  console.log("[seed:investor] done — login as " + demoEmail + " / " + demoPassword);
}
