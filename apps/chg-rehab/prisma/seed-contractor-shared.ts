/**
 * Contractor-portal seed (Task 23). Idempotent.
 *
 * Topology:
 *   L1 operator   = the chg-rehab Company `seed-company-vestry` (Vestry Capital)
 *   L2 contractor = CpAccount Mike Torres (mike@torresdrywall.com)
 *                   linked to Vestry via CpOperatorEdge.layer1CompanyId
 *   L3 contractor = CpAccount Southwest Wall Co (d.howell@swwallco.com)
 *                   linked to Mike via CpOperatorEdge.inviterAccountId
 */
import type { PrismaClient } from "@prisma/client";

/**
 * Provision (or look up) a Supabase auth user for a demo contractor and
 * mirror their profile row with `is_contractor = true`. Returns the
 * Supabase auth UUID, which we use verbatim as the CpAccount.id so that
 * `getCurrentContractor()` (which keys off `auth.user.id`) resolves
 * straight onto the seeded demo account on first sign-in.
 */
async function ensureContractorAuthUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn(`[seed:contractor] SUPABASE_URL/SERVICE_ROLE missing — skipping auth provisioning for ${input.email}`);
    return null;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authUserId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, is_demo_contractor: true },
  });
  if (created.data.user) {
    authUserId = created.data.user.id;
  } else if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === input.email.toLowerCase());
    if (found) {
      authUserId = found.id;
      await admin.auth.admin.updateUserById(found.id, { password: input.password, email_confirm: true });
    } else {
      console.error(`[seed:contractor] failed to create/find auth user ${input.email}: ${created.error.message}`);
      return null;
    }
  }
  if (!authUserId) return null;

  const { error: profileErr } = await admin.from("user_profiles").upsert(
    {
      id: authUserId,
      email: input.email,
      full_name: input.fullName,
      phone: input.phone || null,
      is_contractor: true,
      is_investor: false,
      is_super_admin: false,
      is_account_admin: false,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    console.error(`[seed:contractor] user_profiles upsert failed for ${input.email}: ${profileErr.message}`);
    return null;
  }
  return authUserId;
}

/**
 * Idempotency helper for migrating from a previous seed pass that used a
 * hard-coded string id (e.g. "seed-cp-mike-torres") to the Supabase auth
 * UUID. Removes any stale CpAccount keyed by the same email but a
 * different id; cascade FKs clean up the stale transactional data.
 */
async function purgeStaleAccountByEmail(prisma: PrismaClient, email: string, keepId: string) {
  const stale = await prisma.cpAccount.findMany({
    where: { email, NOT: { id: keepId } },
    select: { id: true },
  });
  if (stale.length === 0) return;
  await prisma.cpAccount.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
}

export async function seedContractorPortal(prisma: PrismaClient) {
  // ── L1: Vestry Capital (separate from the main demo CHG company) ──────
  const vestry = await prisma.company.upsert({
    where: { id: "seed-company-vestry" },
    update: { name: "Vestry Capital" },
    create: {
      id: "seed-company-vestry",
      name: "Vestry Capital",
      legalName: "Vestry Capital Holdings LLC",
      ein: "47-2289011",
    },
  });

  // ── L2: Mike Torres ───────────────────────────────────────────────────
  // Use the Supabase auth UUID as the CpAccount id so the seeded graph
  // is visible the moment Mike signs in. Falls back to a fixed string id
  // when SUPABASE_SERVICE_ROLE_KEY isn't available (offline dev only).
  const mikeAuthId = await ensureContractorAuthUser({
    email: "mike@torresdrywall.com",
    password: "password123",
    fullName: "Mike Torres",
    phone: "(216) 555-0148",
  });
  const mikeId = mikeAuthId || "seed-cp-mike-torres";
  await purgeStaleAccountByEmail(prisma, "mike@torresdrywall.com", mikeId);
  const mike = await prisma.cpAccount.upsert({
    where: { id: mikeId },
    update: {
      email: "mike@torresdrywall.com",
      contactName: "Mike Torres",
      companyName: "Torres Drywall",
      phone: "(216) 555-0148",
      trade: "Drywall",
      planTier: "free",
    },
    create: {
      id: mikeId,
      email: "mike@torresdrywall.com",
      contactName: "Mike Torres",
      companyName: "Torres Drywall",
      phone: "(216) 555-0148",
      trade: "Drywall",
      planTier: "free",
    },
  });

  // ── L3: Southwest Wall Co (D. Howell) ─────────────────────────────────
  const swAuthId = await ensureContractorAuthUser({
    email: "d.howell@swwallco.com",
    password: "password123",
    fullName: "Devin Howell",
    phone: "(216) 555-0220",
  });
  const swId = swAuthId || "seed-cp-southwest-wall";
  await purgeStaleAccountByEmail(prisma, "d.howell@swwallco.com", swId);
  const southwest = await prisma.cpAccount.upsert({
    where: { id: swId },
    update: {
      email: "d.howell@swwallco.com",
      contactName: "Devin Howell",
      companyName: "Southwest Wall Co",
      phone: "(216) 555-0220",
      trade: "Drywall sub",
      planTier: "free",
    },
    create: {
      id: swId,
      email: "d.howell@swwallco.com",
      contactName: "Devin Howell",
      companyName: "Southwest Wall Co",
      phone: "(216) 555-0220",
      trade: "Drywall sub",
      planTier: "free",
    },
  });

  // ── OperatorEdges ─────────────────────────────────────────────────────
  const mikeEdge = await prisma.cpOperatorEdge.findFirst({
    where: { contractorId: mike.id, layer1CompanyId: vestry.id },
  });
  if (!mikeEdge) {
    await prisma.cpOperatorEdge.create({
      data: { contractorId: mike.id, layer1CompanyId: vestry.id, source: "manual" },
    });
  }
  const swEdge = await prisma.cpOperatorEdge.findFirst({
    where: { contractorId: southwest.id, inviterAccountId: mike.id },
  });
  if (!swEdge) {
    await prisma.cpOperatorEdge.create({
      data: { contractorId: southwest.id, inviterAccountId: mike.id, source: "manual" },
    });
  }

  // Wipe & reseed Mike's transactional data (idempotent demo).
  await prisma.cpQuoteLineItem.deleteMany({ where: { quote: { fromAccountId: mike.id } } });
  await prisma.cpQuote.deleteMany({ where: { fromAccountId: mike.id } });
  await prisma.cpInvoice.deleteMany({ where: { fromAccountId: mike.id } });
  await prisma.cpJobPhoto.deleteMany({ where: { job: { contractorId: mike.id } } });
  await prisma.cpJob.deleteMany({ where: { contractorId: mike.id } });
  await prisma.cpComplianceDoc.deleteMany({ where: { accountId: { in: [mike.id, southwest.id] } } });
  await prisma.cpMessage.deleteMany({ where: { thread: { OR: [{ contractorAId: mike.id }, { contractorBId: mike.id }] } } });
  await prisma.cpMessageThread.deleteMany({ where: { OR: [{ contractorAId: mike.id }, { contractorBId: mike.id }] } });
  await prisma.cpBidProposal.deleteMany({ where: { fromAccountId: mike.id } });
  await prisma.cpBidInvitation.deleteMany({ where: { invitedAccountId: mike.id } });
  await prisma.cpBidInvitation.deleteMany({ where: { fromAccountId: mike.id } });
  await prisma.cpQuotaUsage.deleteMany({ where: { accountId: mike.id } });

  // ── Mike's jobs (mix of statuses) ─────────────────────────────────────
  const job1 = await prisma.cpJob.create({
    data: {
      contractorId: mike.id,
      name: "Birchwood Townhomes — Building A",
      subtitle: "12-unit drywall hang & finish",
      trade: "Drywall",
      contractAmount: 48000,
      invoicedAmount: 28800,
      paidAmount: 24000,
      progressPct: 60,
      dueDate: "Jun 15, 2026",
      status: "active",
      photoRequested: true,
      awardedByCompanyId: vestry.id,
    },
  });
  const job2 = await prisma.cpJob.create({
    data: {
      contractorId: mike.id,
      name: "Lakewood SFR Rehab",
      subtitle: "Single-family rehab — full house drywall",
      trade: "Drywall",
      contractAmount: 12500,
      invoicedAmount: 12500,
      paidAmount: 12500,
      progressPct: 100,
      dueDate: "Apr 28, 2026",
      status: "complete",
      awardedByCompanyId: vestry.id,
    },
  });
  await prisma.cpJob.create({
    data: {
      contractorId: mike.id,
      name: "Heritage Apartments — Phase 2",
      subtitle: "Common-area patch & paint",
      trade: "Drywall",
      contractAmount: 18750,
      progressPct: 0,
      dueDate: "Jul 1, 2026",
      status: "upcoming",
      awardedByCompanyId: vestry.id,
    },
  });

  // ── Southwest Wall — one active job awarded by Mike ───────────────────
  await prisma.cpJob.deleteMany({ where: { contractorId: southwest.id } });
  await prisma.cpJob.create({
    data: {
      contractorId: southwest.id,
      name: "Birchwood Townhomes — Bldg A taping (sub)",
      subtitle: "Tape & mud subcontract from Torres Drywall",
      trade: "Drywall",
      contractAmount: 14400,
      invoicedAmount: 7200,
      paidAmount: 7200,
      progressPct: 50,
      dueDate: "Jun 12, 2026",
      status: "active",
      awardedByAccountId: mike.id,
    },
  });

  // ── Quotes from Mike → Vestry ─────────────────────────────────────────
  const q1 = await prisma.cpQuote.create({
    data: {
      number: "QTE-2026-001",
      fromAccountId: mike.id,
      jobName: "Heritage Apartments — Phase 2 patch & paint",
      recipientType: "operator",
      toCompanyId: vestry.id,
      totalAmount: 18750,
      notes: "Includes texture match + 1 coat primer.",
      status: "accepted",
      respondedAt: new Date("2026-04-18T14:00:00Z"),
      lineItems: {
        create: [
          { description: "Drywall patch — common areas", qty: 1, unitPrice: 8400, ord: 0 },
          { description: "Texture match (orange peel)", qty: 1, unitPrice: 3600, ord: 1 },
          { description: "Primer + 2 coats finish", qty: 1, unitPrice: 6750, ord: 2 },
        ],
      },
    },
  });
  await prisma.cpQuote.create({
    data: {
      number: "QTE-2026-002",
      fromAccountId: mike.id,
      jobName: "Maple Triplex — Bldg B drywall",
      recipientType: "operator",
      toCompanyId: vestry.id,
      totalAmount: 22400,
      status: "pending",
      lineItems: { create: [{ description: "Hang & finish — 3 units", qty: 3, unitPrice: 7466.67, ord: 0 }] },
    },
  });

  // ── Invoices from Mike → Vestry ───────────────────────────────────────
  await prisma.cpInvoice.create({
    data: {
      number: "INV-2026-001",
      fromAccountId: mike.id,
      jobId: job2.id,
      jobName: "Lakewood SFR Rehab — final",
      totalAmount: 12500,
      status: "paid",
      toCompanyId: vestry.id,
      submittedAt: new Date("2026-04-25T10:00:00Z"),
      approvedAt: new Date("2026-04-26T10:00:00Z"),
      paidAt: new Date("2026-04-29T10:00:00Z"),
    },
  });
  await prisma.cpInvoice.create({
    data: {
      number: "INV-2026-002",
      fromAccountId: mike.id,
      jobId: job1.id,
      jobName: "Birchwood Bldg A — Draw 3",
      totalAmount: 9600,
      status: "approved",
      toCompanyId: vestry.id,
      submittedAt: new Date("2026-04-28T10:00:00Z"),
      approvedAt: new Date("2026-04-30T10:00:00Z"),
    },
  });
  await prisma.cpInvoice.create({
    data: {
      number: "INV-2026-003",
      fromAccountId: mike.id,
      jobId: job1.id,
      jobName: "Birchwood Bldg A — Draw 4",
      totalAmount: 7200,
      status: "pending",
      toCompanyId: vestry.id,
      submittedAt: new Date("2026-05-01T10:00:00Z"),
    },
  });

  // ── Compliance docs ───────────────────────────────────────────────────
  await prisma.cpComplianceDoc.createMany({
    data: [
      { accountId: mike.id, name: "Certificate of Insurance ($2M GL)", docType: "compliance", fileName: "COI-Torres-2026.pdf", expiresAt: new Date("2026-11-15"), status: "current" },
      { accountId: mike.id, name: "Workers' Comp Certificate", docType: "compliance", fileName: "WC-Torres-2026.pdf", expiresAt: new Date("2026-06-01"), status: "expiring" },
      { accountId: mike.id, name: "W-9", docType: "tax", fileName: "W9-Torres.pdf", status: "current" },
      { accountId: mike.id, name: "OH Drywall License", docType: "compliance", fileName: "License-Torres.pdf", expiresAt: new Date("2027-03-01"), status: "current" },
      { accountId: southwest.id, name: "COI ($1M GL)", docType: "compliance", fileName: "COI-Southwest-2026.pdf", expiresAt: new Date("2026-09-30"), status: "current" },
      { accountId: southwest.id, name: "W-9", docType: "tax", fileName: "W9-Southwest.pdf", status: "current" },
    ],
  });

  // ── Job photos ────────────────────────────────────────────────────────
  await prisma.cpJobPhoto.createMany({
    data: [
      { jobId: job1.id, phase: "Hang", caption: "Bldg A — 1st floor hang complete" },
      { jobId: job1.id, phase: "Hang", caption: "Bldg A — 2nd floor hang in progress" },
      { jobId: job2.id, phase: "Final", caption: "Lakewood — final walk-through" },
    ],
  });

  // ── Bid invitation TO Mike from Vestry ────────────────────────────────
  await prisma.cpBidInvitation.create({
    data: {
      invitedAccountId: mike.id,
      jobName: "Riverside Lofts — Drywall package",
      jobLocation: "Cleveland, OH",
      trade: "Drywall",
      scopeRangeLow: 65000,
      scopeRangeHigh: 85000,
      bidDueAt: new Date("2026-05-15T17:00:00Z"),
      fromCompanyId: vestry.id,
      status: "open",
    },
  });

  // ── Bid invitation FROM Mike to Southwest ─────────────────────────────
  const swBid = await prisma.cpBidInvitation.create({
    data: {
      invitedAccountId: southwest.id,
      jobName: "Birchwood Bldg B — Tape & mud sub",
      jobLocation: "Cleveland, OH",
      trade: "Drywall sub",
      scopeRangeLow: 12000,
      scopeRangeHigh: 16000,
      bidDueAt: new Date("2026-05-10T17:00:00Z"),
      fromAccountId: mike.id,
      status: "open",
    },
  });
  await prisma.cpBidProposal.create({
    data: { invitationId: swBid.id, fromAccountId: southwest.id, amount: 13800, durationDays: 10, notes: "Available May 12 start.", status: "submitted" },
  });

  // ── Messages: Vestry ↔ Mike, Mike ↔ Southwest ─────────────────────────
  const t1 = await prisma.cpMessageThread.create({
    data: {
      jobId: job1.id,
      subject: "Birchwood Bldg A — Draw 4 status",
      contractorAId: mike.id,
      layer1CompanyId: vestry.id,
      lastMessageAt: new Date("2026-05-01T15:30:00Z"),
    },
  });
  await prisma.cpMessage.createMany({
    data: [
      { threadId: t1.id, senderCompanyId: vestry.id, senderName: "Sarah Chen (Vestry)", body: "Hi Mike — draw 4 looks good. Need photos of the 2nd-floor mud finish before approval.", createdAt: new Date("2026-05-01T14:00:00Z"), unread: false },
      { threadId: t1.id, senderAccountId: mike.id, senderName: "Mike Torres", body: "Will get those over by EOD tomorrow.", createdAt: new Date("2026-05-01T15:30:00Z"), unread: true },
    ],
  });

  const t2 = await prisma.cpMessageThread.create({
    data: {
      subject: "Tape & mud — Bldg A",
      contractorAId: mike.id,
      contractorBId: southwest.id,
      lastMessageAt: new Date("2026-05-01T11:00:00Z"),
    },
  });
  await prisma.cpMessage.createMany({
    data: [
      { threadId: t2.id, senderAccountId: mike.id, senderName: "Mike Torres", body: "Devin, when can your crew start the 2nd-floor mud?", createdAt: new Date("2026-05-01T10:00:00Z"), unread: false },
      { threadId: t2.id, senderAccountId: southwest.id, senderName: "Devin Howell", body: "Monday morning, 7am. We'll be 4-deep.", createdAt: new Date("2026-05-01T11:00:00Z"), unread: true },
    ],
  });

  console.log(`[seed:contractor] Vestry → Mike → Southwest seeded (jobs: 4, quotes: 2, invoices: 3, docs: 6, threads: 2)`);
}
