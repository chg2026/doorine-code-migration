import { seedInvestorPortal as _seedInvestorPortal } from "./seed-investor-shared";
import {
  PrismaClient,
  Prisma,
  UserRole,
  ContactType,
  DealStage,
  ProjectStatus,
  PhaseStatus,
  ChecklistStatus,
  DrawStatus,
  DocLevel,
  DocStatus,
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

async function main() {
  console.log("[seed] starting");

  // ── Company ──────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { id: "seed-company-chg" },
    update: {
      name: "Cleveland Holding Group",
      legalName: "Cleveland Holding Group LLC",
      ein: "82-1234567",
    },
    create: {
      id: "seed-company-chg",
      name: "Cleveland Holding Group",
      legalName: "Cleveland Holding Group LLC",
      ein: "82-1234567",
    },
  });

  // CompanySetting — explicit Task-4 fields plus HEAD's meta bag
  const companySettingPayload = {
    strictGate: true,
    coiThresholdDays: 60,
    strictPaymentGate: true,
    blockAssignmentIfDocsMissing: true,
    expiryAlertThresholdDays: 60,
    companyName: "Cleveland Holding Group",
    projectIdPrefix: "CHG",
    defaultProjectMode: "Internally Managed",
    timezone: "America/New_York",
    dateFormat: "MMM d, yyyy",
    currency: "USD",
    fiscalYearStart: "January",
    warehouseLowStockThreshold: 10,
    warehouseValueRoundingMode: "nearest",
    contractorPortalEnabled: false,
    meta: {
      coiRequired: true,
      w9Required: true,
      licenseRequired: true,
      defaultExitStrategy: "Rent after rehab",
    },
  };
  await prisma.companySetting.upsert({
    where: { companyId: company.id },
    update: companySettingPayload,
    create: { companyId: company.id, ...companySettingPayload },
  });

  // ── Users ────────────────────────────────────────────────────────────
  const users = [
    { id: "seed-user-roey", email: "office@goldbridgerei.com", firstName: "Roey", lastName: "G.", role: UserRole.Admin, initials: "RG" },
    { id: "seed-user-pm", email: "pm@chg.example", firstName: "Marcus", lastName: "L.", role: UserRole.ProjectManager, initials: "ML" },
    { id: "seed-user-mike", email: "mike@chg.example", firstName: "Mike", lastName: "K.", role: UserRole.GeneralContractor, initials: "MK" },
    { id: "seed-user-carlos", email: "carlos@chg.example", firstName: "Carlos", lastName: "M.", role: UserRole.GeneralContractor, initials: "CM" },
    { id: "seed-user-jake", email: "jake@chg.example", firstName: "Jake", lastName: "S.", role: UserRole.Subcontractor, initials: "JS" },
    { id: "seed-user-tom", email: "tom@chg.example", firstName: "Tom", lastName: "R.", role: UserRole.Subcontractor, initials: "TR" },
    { id: "seed-user-lisa", email: "lisa@chg.example", firstName: "Lisa", lastName: "D.", role: UserRole.Inspector, initials: "LD" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { ...u, companyId: company.id },
      create: { ...u, companyId: company.id },
    });
  }

  // ── Properties (Cleveland) ───────────────────────────────────────────
  const propertiesData = [
    {
      code: "CHG-2247",
      address: "2247 Meadowbrook Dr",
      city: "Cleveland",
      state: "OH",
      zip: "44106",
      status: "Active rehab",
      acquired: new Date("2026-01-15"),
      baseline: "145000",
      currentRoi: "8.1",
      meta: {
        type: "Single family",
        beds: 3,
        baths: 2,
        sqft: 1420,
        yearBuilt: 1962,
        parcel: "101-23-456-000",
        zoning: "R-1 Residential",
        flood: "Zone X (minimal)",
        hoa: "None",
        purchasePrice: 87500,
        closingCosts: 2900,
        rehabSpent: 18400,
        rehabBudget: 42000,
        arv: 145000,
        projectedRoi: 8.1,
        spec: "Single family · 3 bed · 2 bath · 1,420 SF",
        openItems: [
          { id: "oi-1", label: "Permit signoff overdue (electrical rough-in)", severity: "high", since: "2026-04-22" },
          { id: "oi-2", label: "Insurance binder expires 2026-05-15", severity: "med", since: "2026-04-25" },
          { id: "oi-3", label: "Awaiting countertop selection from owner", severity: "low", since: "2026-04-28" },
        ],
      },
    },
    {
      code: "PROP-2231",
      address: "1804 W 41st St",
      city: "Cleveland",
      state: "OH",
      zip: "44113",
      status: "Rental",
      acquired: new Date("2025-06-12"),
      baseline: "105000",
      currentRoi: "22.0",
      meta: {
        type: "Single family",
        beds: 3,
        baths: 1,
        sqft: 1180,
        yearBuilt: 1948,
        parcel: "104-15-022-000",
        zoning: "R-1 Residential",
        flood: "Zone X (minimal)",
        hoa: "None",
        purchasePrice: 55000,
        closingCosts: 1800,
        rehabSpent: 28000,
        arv: 105000,
        projectedRoi: 22.0,
        spec: "Single family · 3 bed · 1 bath",
        monthlyRent: 1450,
        monthlyExpenses: 520,
        cashInvested: 84800,
        openItems: [
          { id: "oi-r1", label: "Tenant work order #1142 — kitchen faucet leak", severity: "med", since: "2026-04-26" },
          { id: "oi-r2", label: "Annual insurance renewal due 2026-06-12", severity: "low", since: "2026-04-15" },
        ],
      },
    },
    {
      code: "PROP-814",
      address: "814 Euclid Ave",
      city: "Cleveland",
      state: "OH",
      zip: "44114",
      status: "Sold",
      acquired: new Date("2024-08-20"),
      baseline: "118000",
      currentRoi: "39.0",
      meta: {
        type: "Single family",
        beds: 2,
        baths: 1,
        sqft: 980,
        yearBuilt: 1955,
        parcel: "108-44-019-000",
        zoning: "R-1 Residential",
        flood: "Zone X",
        hoa: "None",
        purchasePrice: 62000,
        closingCosts: 1500,
        rehabSpent: 31000,
        arv: 118000,
        projectedRoi: 39.0,
        soldOn: "2025-10-03",
        spec: "Single family · 2 bed · 1 bath",
      },
    },
    { code: "CHG-2248", address: "2248 Edgewood Ave", city: "Norfolk", state: "VA", zip: "23509", status: "Active rehab", baseline: "212000", currentRoi: "17.2" },
    { code: "CHG-2249", address: "2249 Glenwood Pl", city: "Norfolk", state: "VA", zip: "23508", status: "Active rehab", baseline: "228000", currentRoi: "16.5" },
    { code: "CHG-514", address: "514 Lakewood Ave", city: "Norfolk", state: "VA", zip: "23508", status: "Tenanted", baseline: "189000", currentRoi: "22.1" },
    { code: "CHG-1804", address: "1804 W 41st St", city: "Norfolk", state: "VA", zip: "23508", status: "Listed", baseline: "298000", currentRoi: "15.7" },
  ];
  const properties: Record<string, string> = {};
  for (const p of propertiesData) {
    const created = await prisma.property.upsert({
      where: { companyId_code: { companyId: company.id, code: p.code } },
      update: {
        status: p.status,
        acquired: p.acquired,
        baseline: p.baseline,
        currentRoi: p.currentRoi,
        meta: p.meta,
      },
      create: { ...p, companyId: company.id, baseline: p.baseline, currentRoi: p.currentRoi },
    });
    properties[p.code] = created.id;
  }

  // ── Pipeline (4 active + 1 closed linked to CHG-2247) ────────────────
  // MAO formula: ARV × 0.70 − rehab
  const deals = [
    {
      code: "d1",
      address: "514 Lakewood Ave., Cleveland",
      askingPrice: null,
      estimatedRoi: "43",
      stage: DealStage.Underwriting,
      meta: {
        type: "Single family",
        beds: 3,
        source: "Wholesaler",
        arv: 135000,
        rehab: 38000,
        daysInStage: 3,
        badge: "Strong deal",
        badgeColor: "green",
        askingOrPurchase: null,
      },
    },
    {
      code: "d2",
      address: "3301 Euclid Heights Blvd., Cleveland",
      askingPrice: null,
      estimatedRoi: "18",
      stage: DealStage.Underwriting,
      meta: {
        type: "Single family",
        beds: 4,
        source: "MLS",
        arv: 160000,
        rehab: 55000,
        daysInStage: 1,
        badge: "Worth pursuing",
        badgeColor: "blue",
        askingOrPurchase: null,
        notes:
          "Larger 4-bed with renovation upside. ROI conservative at 18% — worth pursuing if rehab comes in under $50K. Walk scheduled.",
      },
    },
    {
      code: "d3",
      address: "1142 West 85th St., Cleveland",
      askingPrice: "62000",
      estimatedRoi: "28",
      stage: DealStage.OfferOut,
      meta: {
        type: "Single family",
        beds: 3,
        source: "Wholesaler",
        arv: 128000,
        rehab: 35000,
        offer: 62000,
        daysInStage: 4,
        badge: "Strong",
        badgeColor: "green",
        askingOrPurchase: { kind: "offer", value: 62000 },
      },
    },
    {
      code: "d4",
      address: "719 E 105th St., Cleveland",
      askingPrice: "58000",
      estimatedRoi: "26",
      stage: DealStage.UnderContract,
      meta: {
        type: "Single family",
        beds: 3,
        source: "MLS",
        arv: 118000,
        rehab: 32000,
        purchase: 58000,
        daysInStage: 12,
        closingDate: "2026-05-15",
        badge: "Strong",
        badgeColor: "green",
        askingOrPurchase: { kind: "purchase", value: 58000 },
      },
    },
    {
      code: "d8",
      address: "2247 Meadowbrook Dr., Cleveland",
      askingPrice: "87500",
      estimatedRoi: "37",
      stage: DealStage.Closed,
      closedAt: new Date("2026-01-15"),
      propertyCode: "CHG-2247",
      meta: {
        type: "Single family",
        beds: 3,
        source: "Wholesaler",
        arv: 145000,
        rehab: 42000,
        purchase: 87500,
        daysInStage: 0,
        badge: "✓ Acquired",
        badgeColor: "green",
        askingOrPurchase: { kind: "purchase", value: 87500 },
      },
    },
  ];

  for (const d of deals) {
    const existing = await prisma.pipelineDeal.findFirst({
      where: { companyId: company.id, code: d.code },
    });
    const data: Prisma.PipelineDealUncheckedCreateInput = {
      companyId: company.id,
      code: d.code,
      address: d.address,
      askingPrice: d.askingPrice,
      estimatedRoi: d.estimatedRoi,
      stage: d.stage,
      meta: d.meta as Prisma.InputJsonValue,
      closedAt: d.closedAt ?? null,
      propertyId: d.propertyCode ? properties[d.propertyCode] : null,
    };
    if (existing) {
      await prisma.pipelineDeal.update({ where: { id: existing.id }, data });
    } else {
      await prisma.pipelineDeal.create({ data });
    }
  }

  // ── Project: CHG-2247 with phases, draws ─────────────────────────────
  const project = await prisma.project.upsert({
    where: { companyId_code: { companyId: company.id, code: "CHG-2247" } },
    update: {
      meta: {
        mode: "Contractor-Led",
        pmLed: false,
        statusLabel: "In Progress",
        lastUpdated: new Date("2026-04-26T14:14:00Z").toISOString(),
        penaltyPerDiem: 100,
        penaltyStatus: "Paused",
        penaltyAccrued: 0,
        originalEndDate: "2026-04-27",
      },
    },
    create: {
      companyId: company.id,
      propertyId: properties["CHG-2247"],
      code: "CHG-2247",
      name: "2247 Meadowbrook — Full interior renovation",
      status: ProjectStatus.Active,
      budget: "42000",
      currentPhase: 5,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-05-03"),
      meta: {
        mode: "Contractor-Led",
        pmLed: false,
        statusLabel: "In Progress",
        lastUpdated: new Date("2026-04-26T14:14:00Z").toISOString(),
        penaltyPerDiem: 100,
        penaltyStatus: "Paused",
        penaltyAccrued: 0,
        originalEndDate: "2026-04-27",
      },
    },
  });

  // Phases — refined per task spec
  const phaseData: Array<{
    number: number;
    name: string;
    status: PhaseStatus;
    budget: string;
    actual: string;
    startDate: string;
    endDate: string;
    drawNote: string;
    items: Array<{ label: string; status: ChecklistStatus; req?: string }>;
  }> = [
    {
      number: 1, name: "Demolition", status: PhaseStatus.Complete,
      budget: "3200", actual: "3200", startDate: "2026-03-01", endDate: "2026-03-10",
      drawNote: "Draw #1 paid",
      items: [
        { label: "Full interior demolition complete", status: ChecklistStatus.Done, req: "Photos required · 6 uploaded" },
        { label: "Debris haul-off and disposal complete", status: ChecklistStatus.Done, req: "Receipts attached" },
        { label: "Site secured for next phase", status: ChecklistStatus.Done, req: "Walk-through signed" },
      ],
    },
    {
      number: 2, name: "Framing & rough-in", status: PhaseStatus.Complete,
      budget: "4800", actual: "4800", startDate: "2026-03-11", endDate: "2026-03-25",
      drawNote: "Draw #2 paid",
      items: [
        { label: "Framing inspection passed", status: ChecklistStatus.Done, req: "Inspector sign-off attached" },
        { label: "Rough plumbing in walls", status: ChecklistStatus.Done, req: "Photos required · 5 uploaded" },
        { label: "Rough electrical in walls", status: ChecklistStatus.Done, req: "Photos required · 4 uploaded" },
        { label: "Insulation installed", status: ChecklistStatus.Done, req: "Photos required · 3 uploaded" },
      ],
    },
    {
      number: 3, name: "Plumbing & electrical", status: PhaseStatus.Complete,
      budget: "6400", actual: "6400", startDate: "2026-03-26", endDate: "2026-04-10",
      drawNote: "Draw #3 paid",
      items: [
        { label: "Plumbing supply lines pressure-tested", status: ChecklistStatus.Done, req: "Test report attached" },
        { label: "Electrical panel installed and labeled", status: ChecklistStatus.Done, req: "Photos required · 4 uploaded" },
        { label: "Outlets and switches installed", status: ChecklistStatus.Done, req: "Photos required · 6 uploaded" },
        { label: "Final electrical inspection passed", status: ChecklistStatus.Done, req: "Inspector sign-off attached" },
      ],
    },
    {
      number: 4, name: "Drywall hang & mud", status: PhaseStatus.Complete,
      budget: "4000", actual: "4000", startDate: "2026-04-11", endDate: "2026-04-22",
      drawNote: "Draw #4 paid",
      items: [
        { label: "Drywall hung — all rooms including closets", status: ChecklistStatus.Done, req: "Photos required · 6 uploaded" },
        { label: "First mud coat applied and sanded", status: ChecklistStatus.Done, req: "Photos required · 4 uploaded" },
        { label: "HVAC access restored — exception resolved", status: ChecklistStatus.Done, req: "Exception documentation attached" },
        { label: "Final mud coat and texture complete", status: ChecklistStatus.Done, req: "Photos required · 5 uploaded" },
      ],
    },
    {
      number: 5, name: "Flooring", status: PhaseStatus.Active,
      budget: "8000", actual: "9760", startDate: "2026-04-23", endDate: "2026-05-01",
      drawNote: "Draw #5 pending",
      items: [
        { label: "Subfloor inspection — no soft spots", status: ChecklistStatus.Done, req: "Photos required · 3 uploaded" },
        { label: "Bedroom 2 & 3 flooring installed", status: ChecklistStatus.Done, req: "Photos required · 4 uploaded" },
        { label: "Living room flooring — transition strips installed", status: ChecklistStatus.Pending, req: "Photos required · Supplier ETA pending" },
        { label: "Kitchen flooring installed", status: ChecklistStatus.Pending, req: "Photos required" },
      ],
    },
    {
      number: 6, name: "Finishes & closeout", status: PhaseStatus.NotStarted,
      budget: "15600", actual: "0", startDate: "2026-05-02", endDate: "2026-05-03",
      drawNote: "Final release",
      items: [
        { label: "Trim & baseboards installed", status: ChecklistStatus.Pending, req: "Photos required" },
        { label: "Paint touch-up complete", status: ChecklistStatus.Pending, req: "Photos required" },
        { label: "Fixtures (toilets, vanities, lights) installed", status: ChecklistStatus.Pending, req: "Photos required" },
        { label: "Appliances delivered and installed", status: ChecklistStatus.Pending, req: "Receipts attached" },
        { label: "Professional cleaning complete", status: ChecklistStatus.Pending, req: "Vendor invoice" },
        { label: "Final walk-through with city inspector", status: ChecklistStatus.Pending, req: "Certificate of Occupancy" },
      ],
    },
  ];
  for (const p of phaseData) {
    const phase = await prisma.phase.upsert({
      where: { projectId_number: { projectId: project.id, number: p.number } },
      update: {
        status: p.status,
        budget: p.budget,
        actual: p.actual,
        drawNote: p.drawNote,
      },
      create: {
        projectId: project.id,
        number: p.number,
        name: p.name,
        status: p.status,
        budget: p.budget,
        actual: p.actual,
        startDate: new Date(p.startDate),
        endDate: new Date(p.endDate),
        drawNote: p.drawNote,
      },
    });
    await prisma.checklistItem.deleteMany({ where: { phaseId: phase.id } });
    for (const it of p.items) {
      await prisma.checklistItem.create({
        data: {
          phaseId: phase.id,
          label: it.label,
          status: it.status,
          meta: it.req ? { requirement: it.req } : undefined,
          doneBy: it.status === ChecklistStatus.Done ? "Roey G." : null,
          doneAt: it.status === ChecklistStatus.Done ? new Date(p.endDate) : null,
        },
      });
    }
  }

  // ── Contacts ─────────────────────────────────────────────────────────
  const contactsData: {
    legacyKey: string;
    type: ContactType;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string;
    trade?: string;
    rating?: number;
    notes?: string;
    meta: Record<string, unknown>;
  }[] = [
    // Contractors
    {
      legacyKey: "mike",
      type: ContactType.Contractor,
      name: "Mike K.",
      company: "Mike K. Construction LLC",
      email: "mike@mkconstruction.com",
      phone: "(216) 555-0184",
      trade: "General Contractor",
      rating: 4,
      notes:
        "Reliable GC for full renovations. Give 2-week notice for scheduling. Does not sub out drywall. Prefers draw releases by wire transfer. Contact Friday afternoons for best response.",
      meta: {
        avatarBg: "#9FE1CB",
        avatarFg: "#085041",
        initials: "MK",
        status: "Preferred",
        serviceArea: "Cleveland + suburbs",
        license: "GC-OH-2021-4481",
        roleLabel: "GC",
        tags: ["Scheduling delay"],
        totalEarned: 62400,
        projects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", status: "Active", role: "GC role" },
          { code: "CHG-2241", address: "814 Euclid Ave.", status: "Completed", role: "GC role" },
        ],
      },
    },
    {
      legacyKey: "jake",
      type: ContactType.Contractor,
      name: "Jake S.",
      company: "Rivera Electric",
      email: "jake@riveraelectric.com",
      phone: "(216) 555-0291",
      trade: "Electrical",
      rating: 4,
      notes: "Sharp electrician. COI renewal must be uploaded before any new project assignments.",
      meta: {
        avatarBg: "#FAC775",
        avatarFg: "#633806",
        initials: "JS",
        status: "Preferred",
        serviceArea: "Cleveland",
        license: "EL-OH-2019-8821",
        roleLabel: "Electrician",
        tags: [],
        totalEarned: 18900,
        projects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", status: "Active", role: "Electrical sub" },
        ],
      },
    },
    {
      legacyKey: "tom",
      type: ContactType.Contractor,
      name: "Tom R.",
      company: "Riverside Plumbing",
      email: "tom@riversideplumbing.com",
      phone: "(216) 555-0377",
      trade: "Plumbing",
      rating: 4,
      notes: "Solid plumber. Available for next project.",
      meta: {
        avatarBg: "#F5C4B3",
        avatarFg: "#7A2E11",
        initials: "TR",
        status: "Standard",
        serviceArea: "Cleveland + suburbs",
        license: "PL-OH-2018-5512",
        roleLabel: "Plumber",
        tags: [],
        totalEarned: 12400,
        projects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", status: "Active", role: "Plumbing sub" },
        ],
      },
    },
    {
      legacyKey: "dan",
      type: ContactType.Contractor,
      name: "Dan W.",
      company: "Williams HVAC Services",
      email: "dan@williamshvac.com",
      phone: "(216) 555-0412",
      trade: "HVAC",
      rating: 1,
      notes:
        "Do not use. COI lapsed during prior project, W-9 never returned. Removed from active assignment pool.",
      meta: {
        avatarBg: "#FCEBEB",
        avatarFg: "#791F1F",
        initials: "DW",
        status: "DoNotUse",
        serviceArea: "Northeast Ohio",
        license: "HV-OH-2017-3304",
        roleLabel: "HVAC",
        tags: ["Compliance lapse"],
        totalEarned: 8200,
        projects: [],
      },
    },
    {
      legacyKey: "greg",
      type: ContactType.Contractor,
      name: "Greg S.",
      company: "Sullivan Flooring",
      email: "greg@sullivanflooring.com",
      phone: "(216) 555-0551",
      trade: "Flooring",
      rating: 4,
      notes: "Flooring specialist. Backlog through May.",
      meta: {
        avatarBg: "#CECBF6",
        avatarFg: "#3C3489",
        initials: "GS",
        status: "Standard",
        serviceArea: "Cleveland + suburbs",
        license: "FL-OH-2020-6671",
        roleLabel: "Flooring",
        tags: [],
        totalEarned: 9760,
        projects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", status: "Active", role: "Flooring sub" },
        ],
      },
    },
    // Vendors
    {
      legacyKey: "v-homedepot",
      type: ContactType.Vendor,
      name: "Home Depot — Cleveland",
      company: "Home Depot",
      phone: "(216) 555-0201",
      address: "Steelyard Commons, Cleveland OH",
      trade: "Materials & supplies",
      rating: 4,
      meta: {
        avatarBg: "#F5C4B3",
        avatarFg: "#7A2E11",
        initials: "HD",
        status: "Preferred",
        category: "Big-box supply",
        account: "Pro Xtra #4421",
        paymentTerms: "Net 30",
        serviceArea: "Greater Cleveland",
        supplierLink: "https://www.homedepot.com/c/Pro_Xtra",
        spendHistory: [
          { period: "Q1 2026", total: 12480, orders: 14 },
          { period: "Q4 2025", total:  9210, orders: 11 },
          { period: "Q3 2025", total:  6740, orders:  8 },
        ],
      },
    },
    {
      legacyKey: "v-bestlam",
      type: ContactType.Vendor,
      name: "Best Laminate",
      company: "Best Laminate Co.",
      phone: "(216) 555-0202",
      address: "Cleveland OH",
      trade: "Flooring (LVP, laminate)",
      rating: 4,
      meta: {
        avatarBg: "#9FE1CB",
        avatarFg: "#085041",
        initials: "BL",
        status: "Preferred",
        category: "Specialty supplier",
        account: "CHG-Wholesale",
        paymentTerms: "Net 15",
        serviceArea: "OH / PA",
        supplierLink: "https://www.bestlaminate.com/account",
        spendHistory: [
          { period: "Q1 2026", total: 8420, orders: 6 },
          { period: "Q4 2025", total: 5180, orders: 4 },
        ],
      },
    },
    {
      legacyKey: "v-redbox",
      type: ContactType.Vendor,
      name: "RedBox+ Dumpsters",
      company: "RedBox+",
      phone: "(216) 555-0203",
      address: "Cleveland OH",
      trade: "Dumpster rental & haul-off",
      rating: 4,
      meta: {
        avatarBg: "#FAC775",
        avatarFg: "#633806",
        initials: "RB",
        status: "Standard",
        category: "Site services",
        account: "CHG-216",
        paymentTerms: "Due on delivery",
        serviceArea: "Cleveland metro",
        supplierLink: "https://www.redboxplus.com/locations/cleveland/",
        spendHistory: [
          { period: "Q1 2026", total: 2640, orders: 6 },
          { period: "Q4 2025", total: 1980, orders: 5 },
        ],
      },
    },
    // Inspectors
    {
      legacyKey: "i-lisa",
      type: ContactType.Inspector,
      name: "Lisa D.",
      company: "Cleveland Home Inspectors LLC",
      phone: "(216) 555-0901",
      email: "lisa@clehomeinspectors.com",
      trade: "General building inspector",
      rating: 5,
      meta: {
        avatarBg: "#CECBF6",
        avatarFg: "#3C3489",
        initials: "LD",
        status: "Preferred",
        license: "OBI-2018-2241",
        platformAccess:
          "ASHI-certified inspector portal · Lead-paint endorsement OH-LD-118 · Reports delivered as PDF + photo set within 48h.",
        assignedProjects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", type: "Pre-purchase + 11-month",  status: "Scheduled" },
          { code: "CHG-2118", address: "2118 W. 32nd St.",      type: "Final walk-through",       status: "Passed"    },
          { code: "CHG-1989", address: "1989 E. 79th St.",      type: "Pre-purchase",             status: "Passed"    },
        ],
      },
    },
    {
      legacyKey: "i-paul",
      type: ContactType.Inspector,
      name: "Paul M.",
      company: "City of Cleveland Bldg Dept",
      phone: "(216) 664-2000",
      email: "pmunoz@city.cleveland.oh.us",
      trade: "Permit / electrical inspector",
      rating: 4,
      meta: {
        avatarBg: "#9FE1CB",
        avatarFg: "#085041",
        initials: "PM",
        status: "Standard",
        platformAccess:
          "Cleveland.gov Building & Housing Information System (BIS) — Read-only contractor view. Permit decisions issued via BIS notifications.",
        assignedProjects: [
          { code: "CHG-2247", address: "2247 Meadowbrook Dr.", type: "Electrical rough-in", status: "Scheduled" },
          { code: "CHG-2118", address: "2118 W. 32nd St.",     type: "Final electrical",     status: "Passed"    },
        ],
      },
    },
    // Tenants
    {
      legacyKey: "t-johnson",
      type: ContactType.Tenant,
      name: "Marcus & Diana Johnson",
      phone: "(216) 555-4821",
      email: "mdj.rental@gmail.com",
      trade: undefined,
      rating: 5,
      notes:
        "Long-term tenants. Excellent payment history. No maintenance issues. Auto-renew clause included.",
      meta: {
        avatarBg: "#E6F1FB",
        avatarFg: "#0C447C",
        initials: "MJ",
        status: "Active",
        propertyCode: "PROP-2231",
        emergency: "Diana's mother · (216) 555-9012",
      },
    },
    {
      legacyKey: "t-hayes",
      type: ContactType.Tenant,
      name: "Robert & Linda Hayes",
      phone: "(216) 555-3309",
      email: "hayes.renter@yahoo.com",
      meta: {
        avatarBg: "#E2E8F0",
        avatarFg: "#374151",
        initials: "RH",
        status: "Former",
        propertyCode: "PROP-2231",
        leasePeriod: "Apr 2022 – Mar 2024",
        priorRent: "$1,050/mo",
        depositReturned: "Apr 1, 2024",
      },
    },
  ];

  const renamedAway = ["Dan F.", "Greg T."];
  await prisma.contractorAssignment.deleteMany({
    where: { companyId: company.id, contact: { name: { in: renamedAway } } },
  });
  await prisma.contractorComplianceDoc.deleteMany({
    where: { contact: { name: { in: renamedAway } } },
  });
  await prisma.contact.deleteMany({
    where: { companyId: company.id, name: { in: renamedAway } },
  });

  const contactIds: Record<string, string> = {};
  for (const c of contactsData) {
    const existing = await prisma.contact.findFirst({
      where: { companyId: company.id, name: c.name, type: c.type },
    });
    const data = {
      companyId: company.id,
      type: c.type,
      name: c.name,
      company: c.company ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      address: c.address ?? null,
      trade: c.trade ?? null,
      rating: c.rating ?? null,
      notes: c.notes ?? null,
      meta: c.meta as Prisma.InputJsonValue,
    };
    const result = existing
      ? await prisma.contact.update({ where: { id: existing.id }, data })
      : await prisma.contact.create({ data });
    contactIds[c.legacyKey] = result.id;
  }

  // ── Compliance docs ──────────────────────────────────────────────────
  await prisma.contractorComplianceDoc.deleteMany({
    where: {
      contactId: { in: ["mike", "jake", "tom", "dan", "greg"].map((k) => contactIds[k]) },
    },
  });

  type Doc = { type: string; name: string; expiresAt?: Date | null; status?: string };
  const compliancePlan: Record<string, Doc[]> = {
    mike: [
      { type: "insurance", name: "Certificate of Insurance", expiresAt: new Date("2026-12-01"), status: "Active" },
      { type: "w9", name: "W-9", status: "Active" },
      { type: "license", name: "GC License — OH (#GC-OH-2021-4481)", expiresAt: new Date("2027-04-30"), status: "Active" },
    ],
    jake: [
      // Expiring COI — within 5 days of "today" in prototype (Apr 26 → May 1, 2026)
      { type: "insurance", name: "Certificate of Insurance", expiresAt: new Date("2026-05-01"), status: "Expiring" },
      { type: "w9", name: "W-9", status: "Active" },
      { type: "license", name: "Electrical License — OH (#EL-OH-2019-8821)", expiresAt: new Date("2027-02-28"), status: "Active" },
    ],
    tom: [
      { type: "insurance", name: "Certificate of Insurance", expiresAt: new Date("2026-09-15"), status: "Active" },
      { type: "w9", name: "W-9", status: "Active" },
      { type: "license", name: "Plumbing License — OH (#PL-OH-2018-5512)", expiresAt: new Date("2026-12-31"), status: "Active" },
    ],
    dan: [
      // Missing/expired COI + W-9 → blocks assignment
      { type: "insurance", name: "Certificate of Insurance", expiresAt: new Date("2026-01-10"), status: "Expired" },
      { type: "license", name: "HVAC License — OH (#HV-OH-2017-3304)", expiresAt: new Date("2026-08-31"), status: "Active" },
    ],
    greg: [
      { type: "insurance", name: "Certificate of Insurance", expiresAt: new Date("2026-11-30"), status: "Active" },
      { type: "w9", name: "W-9", status: "Active" },
      { type: "license", name: "Flooring Contractor License — OH (#FL-OH-2020-6671)", expiresAt: new Date("2027-06-30"), status: "Active" },
    ],
  };

  for (const [key, docs] of Object.entries(compliancePlan)) {
    for (const d of docs) {
      await prisma.contractorComplianceDoc.create({
        data: {
          contactId: contactIds[key],
          type: d.type,
          name: d.name,
          expiresAt: d.expiresAt ?? null,
          status: d.status ?? "Active",
        },
      });
    }
  }

  // ── Contractor assignments ──────────────────────────────────────────
  await prisma.contractorAssignment.deleteMany({ where: { projectId: project.id } });
  // dan (HVAC) intentionally not pre-assigned — expired COI/missing W-9 makes canAssign() block.
  const assignmentPlan: { key: string; role: string; status: string }[] = [
    { key: "mike",  role: "GC",            status: "Active" },
    { key: "jake",  role: "Electrical sub", status: "Active" },
    { key: "tom",   role: "Plumbing sub",   status: "Active" },
    { key: "greg",  role: "Flooring sub",   status: "Active" },
  ];
  for (const a of assignmentPlan) {
    await prisma.contractorAssignment.create({
      data: {
        companyId: company.id,
        contactId: contactIds[a.key],
        projectId: project.id,
        role: a.role,
        status: a.status,
        assignedBy: "seed-user-roey",
      },
    });
  }

  // ── Lease for active rental (Marcus & Diana Johnson @ PROP-2231) ─────
  const existingLease = await prisma.lease.findFirst({
    where: { companyId: company.id, propertyId: properties["PROP-2231"], status: "Active" },
  });
  if (!existingLease) {
    await prisma.lease.create({
      data: {
        companyId: company.id,
        propertyId: properties["PROP-2231"],
        tenantName: "Marcus & Diana Johnson",
        rent: "1150",
        startDate: new Date("2024-04-01"),
        endDate: new Date("2027-03-31"),
        status: "Active",
        meta: {
          deposit: 1150,
          autoRenew: "Month-to-month",
          contactKey: "t-johnson",
          leaseDoc: "Lease Agreement — Johnson · Apr 2024",
        },
      },
    });
  }

  // ── Property assets, financial sections, draws (kept lean) ──────────
  const drawData = [
    { number: 1, title: "Draw #1 — Demolition", amount: "3200", status: DrawStatus.Paid, approvedAt: "2026-03-05T14:22:00Z", paidAt: "2026-03-06T15:00:00Z" },
    { number: 2, title: "Draw #2 — Framing & rough-in", amount: "4800", status: DrawStatus.Paid, approvedAt: "2026-03-22T18:15:00Z", paidAt: "2026-03-23T15:00:00Z" },
    { number: 3, title: "Draw #3 — Plumbing & electrical", amount: "6400", status: DrawStatus.Paid, approvedAt: "2026-04-08T15:47:00Z", paidAt: "2026-04-09T15:00:00Z" },
    { number: 4, title: "Draw #4 — Drywall hang & mud", amount: "4000", status: DrawStatus.Paid, approvedAt: "2026-04-22T12:28:00Z", paidAt: "2026-04-23T15:00:00Z" },
    { number: 5, title: "Draw #5 — Flooring", amount: "8000", status: DrawStatus.Pending },
  ];
  for (const d of drawData) {
    const existing = await prisma.draw.findFirst({ where: { projectId: project.id, number: d.number } });
    if (!existing) {
      await prisma.draw.create({
        data: {
          projectId: project.id,
          number: d.number,
          title: d.title,
          amount: d.amount,
          status: d.status,
          approvedAt: d.approvedAt ? new Date(d.approvedAt) : null,
          approvedById: d.approvedAt ? "seed-user-roey" : null,
          paidAt: d.paidAt ? new Date(d.paidAt) : null,
        },
      });
    }
  }

  // Property assets for CHG-2247
  await prisma.propertyAsset.deleteMany({ where: { propertyId: properties["CHG-2247"] } });
  const assets = [
    { category: "Appliances", name: "GE Profile Refrigerator", installed: "2026-04-22", warrantyEnd: "2027-04-22", notes: "Model: PFE28KYNFS · Serial: GEA2024-88421 · $1,290 · 1 yr parts & labor" },
    { category: "Plumbing", name: "Rheem 50-Gal Water Heater", installed: "2026-03-28", warrantyEnd: "2032-03-28", notes: "Model: PROG50-40N RH60 · Serial: RH2026-11204 · $620 · 6 yr tank warranty" },
    { category: "HVAC", name: "Carrier 2-Ton HVAC System", installed: "2026-04-18", warrantyEnd: "2036-04-18", notes: "Model: 24ACC636A003 · Serial: CAR2026-55012 · $4,200 · 10 yr compressor · Added via HVAC exception addendum" },
    { category: "Electrical", name: "Siemens 200A Main Panel", installed: "2026-04-05", warrantyEnd: null, notes: "Model: P2040B1200CU · $1,800 · Upgraded from 100A — permit on file" },
    { category: "Doors & windows", name: "Andersen 400-Series Windows (8)", installed: "2026-04-12", warrantyEnd: "2046-04-12", notes: "Double-hung, double-pane, vinyl frame · 8 units installed · $6,400 · 20 yr glass unit" },
    { category: "Flooring", name: "Best Laminate LVP — Oak (340 SF)", installed: null, warrantyEnd: null, notes: "Pending install · $2,890 · 30 yr wear warranty · Sourced from warehouse CHG stock" },
  ];
  for (const a of assets) {
    await prisma.propertyAsset.create({
      data: {
        propertyId: properties["CHG-2247"],
        category: a.category,
        name: a.name,
        installed: a.installed ? new Date(a.installed) : null,
        warrantyEnd: a.warrantyEnd ? new Date(a.warrantyEnd) : null,
        notes: a.notes,
      },
    });
  }

  // ── Add CHG-2248 + CHG-2249 projects (warehouse references them) ─────
  const extraProjects = [
    { code: "CHG-2248", name: "2248 Edgewood — Bath & kitchen", budget: "38000", status: ProjectStatus.Active },
    { code: "CHG-2249", name: "2249 Glenwood — Cosmetic flip",  budget: "29000", status: ProjectStatus.Active },
  ];
  const projectsByCode: Record<string, string> = { "CHG-2247": project.id };
  for (const ep of extraProjects) {
    const ex = await prisma.project.upsert({
      where: { companyId_code: { companyId: company.id, code: ep.code } },
      update: {},
      create: {
        companyId: company.id,
        propertyId: properties[ep.code],
        code: ep.code,
        name: ep.name,
        status: ep.status,
        budget: ep.budget,
        startDate: new Date("2026-03-15"),
        endDate: new Date("2026-06-15"),
      },
    });
    projectsByCode[ep.code] = ex.id;
  }

  // ── Warehouse: 8 prototype departments × 24 subcategories × ~180 items
  const WH_DEPARTMENTS: { code: string; name: string; icon: string; subs: { code: string; name: string }[] }[] = [
    { code: "flooring", name: "Flooring", icon: "🪵", subs: [
      { code: "gen-flooring", name: "General flooring" },
      { code: "hardwood", name: "Hardwood" },
      { code: "tile", name: "Tile" },
      { code: "lvp", name: "LVP / LVT" },
    ]},
    { code: "drywall", name: "Drywall & plaster", icon: "🧱", subs: [
      { code: "drywall-sheet", name: "Drywall sheets" },
      { code: "joint-compound", name: "Joint compound" },
    ]},
    { code: "electrical", name: "Electrical", icon: "💡", subs: [
      { code: "wire", name: "Wire — Romex / THHN" },
      { code: "outlets", name: "Outlets & switches" },
      { code: "panels", name: "Panels & breakers" },
    ]},
    { code: "plumbing", name: "Plumbing", icon: "🚰", subs: [
      { code: "pipe", name: "PVC / copper pipe" },
      { code: "fixtures", name: "Fixtures" },
    ]},
    { code: "paint", name: "Paint & coatings", icon: "🎨", subs: [
      { code: "paint-int", name: "Interior paint" },
      { code: "paint-ext", name: "Exterior paint" },
    ]},
    { code: "tools", name: "Tools & equipment", icon: "🔧", subs: [
      { code: "power-tools", name: "Power tools" },
      { code: "hand-tools", name: "Hand tools" },
      { code: "safety-equip", name: "Safety equipment" },
      { code: "ladders", name: "Ladders & scaffolding" },
    ]},
    { code: "mechanical", name: "Mechanical / HVAC", icon: "❄", subs: [
      { code: "hvac-systems", name: "HVAC systems" },
      { code: "ductwork", name: "Ductwork & vents" },
      { code: "thermostats", name: "Thermostats & controls" },
      { code: "filters", name: "Filters & maintenance" },
    ]},
    { code: "appliances", name: "Appliances", icon: "🧊", subs: [
      { code: "kitchen-appl", name: "Kitchen appliances" },
      { code: "laundry", name: "Laundry appliances" },
      { code: "water-heaters", name: "Water heaters" },
    ]},
  ];

  // Items keyed by sub code: { name, meta, qty, cond, proj, val }
  const WH_INVENTORY: Record<string, { name: string; meta: string; qty: string; cond: string; proj: string; val: number }[]> = {
    "gen-flooring": [
      { name: "Best Laminate — Oak 340 SQ FT", meta: "LVP · Tier 1 — Bulk", qty: "340 SQ FT", cond: "New", proj: "CHG-2247", val: 2890 },
      { name: 'Subfloor sheathing 3/4"', meta: "OSB · Tier 1 — Bulk", qty: "22 sheets", cond: "New", proj: "General stock", val: 660 },
      { name: "Transition strips — T-bar aluminum", meta: "Tier 2 — Spec variant", qty: "18 pcs", cond: "New", proj: "CHG-2247", val: 126 },
      { name: 'Tile spacers 1/8"', meta: "Plastic · Tier 1 — Bulk", qty: "4 bags", cond: "New", proj: "General stock", val: 48 },
      { name: "Underlayment foam roll 6mm", meta: "Tier 1 — Bulk", qty: "800 SQ FT", cond: "New", proj: "CHG-2248", val: 320 },
      { name: "Flooring adhesive — premium", meta: "Tier 2 · Multi-surface", qty: "12 gal", cond: "New", proj: "General stock", val: 216 },
      { name: "Moisture barrier 3mm", meta: "Tier 1 — Bulk", qty: "2,400 SQ FT", cond: "New", proj: "CHG-2249", val: 480 },
      { name: "Floor leveling compound", meta: "Ardex · Tier 1", qty: "8 bags", cond: "New", proj: "General stock", val: 144 },
    ],
    hardwood: [
      { name: 'White Oak 3/4" Solid — 500 SQ FT', meta: "Prefinished · Tier 1", qty: "500 SQ FT", cond: "New", proj: "CHG-2247", val: 3750 },
      { name: 'Red Oak 5" Engineered', meta: "Unfinished · Tier 2", qty: "320 SQ FT", cond: "New", proj: "General stock", val: 1920 },
      { name: 'Maple 2.25" Strip Flooring', meta: "Tier 1 — Bulk", qty: "200 SQ FT", cond: "New", proj: "General stock", val: 700 },
      { name: "Hardwood stain — Dark Walnut", meta: "Minwax · Tier 1", qty: "6 qts", cond: "New", proj: "CHG-2247", val: 84 },
      { name: "Wood filler — natural oak", meta: "Tier 1", qty: "4 tubes", cond: "New", proj: "General stock", val: 36 },
      { name: 'Flooring nailer nails 2"', meta: "Cleat nails · Bulk", qty: "5,000 ct", cond: "New", proj: "General stock", val: 95 },
    ],
    tile: [
      { name: "Ceramic floor tile 12x12", meta: "White matte · Tier 1 — Bulk", qty: "450 SQ FT", cond: "New", proj: "CHG-2248", val: 1350 },
      { name: "Porcelain wall tile 4x12", meta: "Subway · Tier 2", qty: "180 SQ FT", cond: "New", proj: "CHG-2248", val: 720 },
      { name: "Sanded grout — Charcoal", meta: "Custom Building Products", qty: "8 bags", cond: "New", proj: "CHG-2248", val: 128 },
      { name: "Unsanded grout — White", meta: "Mapei · Tier 1", qty: "4 bags", cond: "New", proj: "General stock", val: 52 },
      { name: "Large format tile adhesive", meta: "Schluter · Tier 2", qty: "6 bags", cond: "New", proj: "General stock", val: 174 },
      { name: 'Cement backer board 3/4"', meta: "HardieBacker · Tier 1", qty: "24 sheets", cond: "New", proj: "CHG-2248", val: 384 },
      { name: "Grout sealer", meta: "Tier 1", qty: "3 qts", cond: "New", proj: "General stock", val: 57 },
      { name: "Tile edge trim — brushed nickel", meta: "Schluter Jolly · Tier 2", qty: "40 LF", cond: "New", proj: "CHG-2248", val: 160 },
    ],
    lvp: [
      { name: "LVP Click-lock Plank — Grey Oak", meta: "12 mil wear · Tier 1", qty: "600 SQ FT", cond: "New", proj: "CHG-2249", val: 1800 },
      { name: "LVT Stone-look Plank", meta: "Tier 2 — Premium", qty: "250 SQ FT", cond: "New", proj: "General stock", val: 1000 },
      { name: "Underlayment 3-in-1", meta: "With vapor barrier · Tier 1", qty: "1,000 SQ FT", cond: "New", proj: "CHG-2249", val: 300 },
      { name: "Stair nosing — oak", meta: "Matching LVP · Tier 1", qty: "12 LF", cond: "New", proj: "CHG-2249", val: 84 },
      { name: "T-molding transition", meta: "Tier 1 — Bulk", qty: "24 LF", cond: "New", proj: "General stock", val: 96 },
      { name: "Reducer strip", meta: "Tier 1", qty: "16 LF", cond: "New", proj: "General stock", val: 48 },
      { name: "Quarter round — white", meta: "PVC · Tier 1", qty: "120 LF", cond: "New", proj: "CHG-2249", val: 72 },
      { name: "Flooring pull bar kit", meta: "Installation kit", qty: "2 kits", cond: "New", proj: "General stock", val: 38 },
      { name: "LVP floor adhesive", meta: "Pressure-sensitive · Tier 2", qty: "4 gal", cond: "New", proj: "General stock", val: 120 },
    ],
    "drywall-sheet": [
      { name: '4x8 1/2" Standard drywall', meta: "USG · Tier 1 — Bulk", qty: "84 sheets", cond: "New", proj: "CHG-2247", val: 1176 },
      { name: '4x12 5/8" Type X fire-rated', meta: "Georgia-Pacific · Tier 1", qty: "36 sheets", cond: "New", proj: "General stock", val: 720 },
      { name: '4x8 5/8" Moisture resistant', meta: "Green board · Tier 1", qty: "24 sheets", cond: "New", proj: "CHG-2248", val: 480 },
      { name: "Corner bead — metal", meta: "Tier 1 — Bulk", qty: "60 pcs", cond: "New", proj: "General stock", val: 90 },
      { name: 'Drywall screws 1-5/8"', meta: "Coarse thread · Bulk", qty: "5 lbs", cond: "New", proj: "General stock", val: 35 },
      { name: "Fiberglass drywall tape", meta: "Self-adhesive · Tier 1", qty: "12 rolls", cond: "New", proj: "General stock", val: 60 },
      { name: "Ceiling texture spray", meta: "Orange peel · Tier 2", qty: "6 cans", cond: "New", proj: "CHG-2247", val: 54 },
    ],
    "joint-compound": [
      { name: "Pre-mixed all-purpose compound", meta: "USG · 5 gal · Tier 1", qty: "8 buckets", cond: "New", proj: "CHG-2247", val: 200 },
      { name: "Setting compound 45-min", meta: "USG Durabond · Tier 1", qty: "4 bags", cond: "New", proj: "General stock", val: 72 },
      { name: "Lightweight topping compound", meta: "Sheetrock Plus 3 · Tier 2", qty: "3 buckets", cond: "New", proj: "General stock", val: 105 },
      { name: "Patching plaster", meta: "DAP · Tier 1", qty: "6 containers", cond: "New", proj: "General stock", val: 48 },
      { name: "Skim coat compound", meta: "USG · Tier 2", qty: "2 bags", cond: "New", proj: "CHG-2248", val: 44 },
      { name: "Bonding primer", meta: "Zinsser · Tier 1", qty: "4 gal", cond: "New", proj: "General stock", val: 96 },
      { name: "Texture spray — knockdown", meta: "Tier 1", qty: "4 cans", cond: "New", proj: "CHG-2247", val: 36 },
      { name: "Mud pan & knife set", meta: "Hyde Tools", qty: "3 sets", cond: "New", proj: "General stock", val: 90 },
    ],
    wire: [
      { name: "12/2 Romex NM-B 250ft", meta: "Southwire · Tier 1", qty: "8 rolls", cond: "New", proj: "CHG-2247", val: 1040 },
      { name: "14/2 Romex NM-B 250ft", meta: "Southwire · Tier 1", qty: "5 rolls", cond: "New", proj: "General stock", val: 450 },
      { name: "10/2 Romex NM-B 100ft", meta: "Tier 1", qty: "3 rolls", cond: "New", proj: "CHG-2247", val: 270 },
      { name: "12 AWG THHN — Black 500ft", meta: "Tier 1", qty: "2 spools", cond: "New", proj: "General stock", val: 180 },
      { name: '1/2" EMT conduit 10ft', meta: "Tier 1 — Bulk", qty: "20 sticks", cond: "New", proj: "General stock", val: 140 },
    ],
    outlets: [
      { name: "15A duplex outlet — white", meta: "Leviton · Tier 1 — Bulk", qty: "48 pcs", cond: "New", proj: "CHG-2247", val: 96 },
      { name: "20A outlet — white", meta: "Leviton · Tier 1", qty: "24 pcs", cond: "New", proj: "General stock", val: 72 },
      { name: "GFCI outlet 15A — white", meta: "Leviton · Tier 1", qty: "18 pcs", cond: "New", proj: "CHG-2247", val: 198 },
      { name: "AFCI breaker outlet", meta: "Square D · Tier 2", qty: "6 pcs", cond: "New", proj: "General stock", val: 180 },
      { name: "Single pole switch — white", meta: "Leviton · Bulk", qty: "36 pcs", cond: "New", proj: "CHG-2247", val: 54 },
      { name: "3-way switch — white", meta: "Leviton · Tier 1", qty: "12 pcs", cond: "New", proj: "General stock", val: 36 },
      { name: "Dimmer switch — white", meta: "Lutron · Tier 2", qty: "8 pcs", cond: "New", proj: "CHG-2248", val: 120 },
      { name: "Decora outlet covers — white", meta: "Tier 1 — Bulk", qty: "60 pcs", cond: "New", proj: "General stock", val: 30 },
    ],
    panels: [
      { name: "200A main panel — Square D", meta: "QO series · Tier 1", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 285 },
      { name: "100A subpanel — Square D", meta: "QO series · Tier 2", qty: "1 unit", cond: "New", proj: "General stock", val: 145 },
      { name: "20A single-pole breaker", meta: "Square D QO · Tier 1", qty: "12 pcs", cond: "New", proj: "CHG-2247", val: 144 },
    ],
    pipe: [
      { name: '3/4" PVC Schedule 40 — 10ft', meta: "Tier 1 — Bulk", qty: "20 sticks", cond: "New", proj: "CHG-2247", val: 120 },
      { name: '1/2" PVC Schedule 40 — 10ft', meta: "Tier 1 — Bulk", qty: "15 sticks", cond: "New", proj: "General stock", val: 60 },
      { name: '3/4" Type L copper — 10ft', meta: "Mueller · Tier 2", qty: "8 sticks", cond: "New", proj: "CHG-2248", val: 280 },
      { name: '1/2" Type M copper — 10ft', meta: "Mueller · Tier 2", qty: "6 sticks", cond: "New", proj: "CHG-2248", val: 156 },
      { name: '4" ABS drain pipe — 10ft', meta: "Tier 1", qty: "4 sticks", cond: "New", proj: "General stock", val: 60 },
      { name: 'P-trap 1.5"', meta: "Chrome · Tier 1", qty: "8 pcs", cond: "New", proj: "General stock", val: 64 },
      { name: "PVC cement & primer kit", meta: "Tier 1", qty: "6 kits", cond: "New", proj: "General stock", val: 54 },
      { name: "Teflon tape — bulk", meta: "Tier 1", qty: "24 rolls", cond: "New", proj: "General stock", val: 24 },
      { name: "SharkBite push fittings assorted", meta: "Tier 2", qty: "30 pcs", cond: "New", proj: "CHG-2247", val: 270 },
      { name: 'Ball valve 3/4"', meta: "Tier 1", qty: "6 pcs", cond: "New", proj: "General stock", val: 72 },
      { name: 'Gate valve 1"', meta: "Tier 2", qty: "3 pcs", cond: "New", proj: "General stock", val: 90 },
      { name: "Pressure reducing valve", meta: "Watts · Tier 2", qty: "2 pcs", cond: "New", proj: "CHG-2248", val: 130 },
    ],
    fixtures: [
      { name: "Kitchen faucet — brushed nickel", meta: "Moen Arbor · Tier 2", qty: "2 units", cond: "New", proj: "CHG-2247", val: 580 },
      { name: "Bathroom faucet — chrome", meta: "Delta · Tier 1", qty: "3 units", cond: "New", proj: "CHG-2248", val: 330 },
      { name: "Showerhead — rain + handheld", meta: "Kohler · Tier 2", qty: "2 units", cond: "New", proj: "CHG-2247", val: 420 },
      { name: "Toilet — elongated 1.28gpf", meta: "Kohler Cimarron · Tier 1", qty: "3 units", cond: "New", proj: "CHG-2249", val: 870 },
      { name: 'Bathtub — 60" alcove white', meta: "American Standard · Tier 1", qty: "1 unit", cond: "New", proj: "CHG-2248", val: 480 },
      { name: 'Vanity — 36" white shaker', meta: "Tier 2", qty: "2 units", cond: "New", proj: "CHG-2247", val: 960 },
      { name: "Utility sink — laundry", meta: "Tier 1", qty: "1 unit", cond: "New", proj: "General stock", val: 125 },
    ],
    "paint-int": [
      { name: "SW Emerald Eggshell — Extra White", meta: "Sherwin-Williams · Tier 2", qty: "12 gal", cond: "New", proj: "CHG-2247", val: 768 },
      { name: "BM Regal Select Flat — White Dove", meta: "Benjamin Moore · Tier 2", qty: "8 gal", cond: "New", proj: "CHG-2248", val: 560 },
      { name: "Zinsser BIN primer — white", meta: "Shellac-based · Tier 1", qty: "4 gal", cond: "New", proj: "General stock", val: 180 },
      { name: "Drywall primer — PVA", meta: "Glidden · Tier 1", qty: "5 gal", cond: "New", proj: "CHG-2247", val: 110 },
      { name: 'Paint roller covers 9" — bulk', meta: "3/8\" nap · Tier 1", qty: "24 pcs", cond: "New", proj: "General stock", val: 72 },
      { name: '9" roller frame', meta: "Wooster · Tier 1", qty: "6 pcs", cond: "New", proj: "General stock", val: 42 },
      { name: '2.5" angled sash brush', meta: "Purdy · Tier 2", qty: "8 pcs", cond: "New", proj: "General stock", val: 96 },
      { name: "Canvas drop cloth 9x12", meta: "Tier 1 — Bulk", qty: "10 pcs", cond: "New", proj: "General stock", val: 90 },
      { name: "Painters tape 2in blue", meta: "3M ScotchBlue · Tier 1", qty: "24 rolls", cond: "New", proj: "General stock", val: 96 },
      { name: "Paint tray liners", meta: "Tier 1 — Bulk", qty: "50 pcs", cond: "New", proj: "General stock", val: 25 },
      { name: "5-in-1 painter tool", meta: "Red Devil · Tier 1", qty: "6 pcs", cond: "New", proj: "General stock", val: 48 },
      { name: "Caulk — paintable white", meta: "DAP Alex Plus · Tier 1", qty: "24 tubes", cond: "New", proj: "CHG-2247", val: 72 },
      { name: "Corner roller — foam", meta: "Tier 1", qty: "4 pcs", cond: "New", proj: "General stock", val: 16 },
      { name: "Extension pole 4-8ft", meta: "Shur-Line · Tier 1", qty: "4 pcs", cond: "New", proj: "General stock", val: 60 },
      { name: "TSP cleaner — pre-paint", meta: "Tier 1", qty: "4 boxes", cond: "New", proj: "General stock", val: 32 },
      { name: "Stir sticks — bulk", meta: "Tier 1", qty: "100 pcs", cond: "New", proj: "General stock", val: 15 },
    ],
    "paint-ext": [
      { name: "SW Duration Exterior Satin — Off White", meta: "Sherwin-Williams · Tier 2", qty: "5 gal", cond: "New", proj: "CHG-2249", val: 425 },
      { name: "Exterior primer — oil-based", meta: "Tier 2", qty: "2 gal", cond: "New", proj: "General stock", val: 110 },
      { name: "Deck & porch enamel — grey", meta: "Behr Premium · Tier 2", qty: "2 gal", cond: "New", proj: "CHG-2249", val: 130 },
      { name: "Solid wood stain — cedar tone", meta: "Cabot · Tier 2", qty: "2 gal", cond: "New", proj: "General stock", val: 90 },
    ],
    "power-tools": [
      { name: 'Circular saw 7.25" — DEWALT', meta: "DWE575 · Company owned", qty: "3 units", cond: "Good", proj: "General stock", val: 540 },
      { name: "Cordless drill/driver — DEWALT", meta: "20V MAX · Company owned", qty: "4 units", cond: "Good", proj: "CHG-2247", val: 600 },
      { name: "Reciprocating saw — Milwaukee", meta: "FUEL · Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 480 },
      { name: "Jigsaw — Bosch", meta: "JS470E · Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 260 },
      { name: 'Angle grinder 4.5" — DEWALT', meta: "Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 180 },
      { name: "Brad nailer 18ga — DEWALT", meta: "Company owned", qty: "2 units", cond: "Good", proj: "CHG-2247", val: 300 },
      { name: "Finish nailer 15ga — Bostitch", meta: "Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 380 },
      { name: "Shop vac 16gal — Ridgid", meta: "Company owned", qty: "3 units", cond: "Good", proj: "General stock", val: 450 },
      { name: "Air compressor 6gal — Bostitch", meta: "Pancake · Company owned", qty: "2 units", cond: "Good", proj: "CHG-2248", val: 360 },
      { name: "Wet tile saw — QEP", meta: "Company owned", qty: "1 unit", cond: "Good", proj: "CHG-2248", val: 350 },
      { name: "Router — DEWALT", meta: "DWP611PK · Company owned", qty: "1 unit", cond: "Good", proj: "General stock", val: 200 },
      { name: "Oscillating multi-tool — Milwaukee", meta: "Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 320 },
    ],
    "hand-tools": [
      { name: "Framing hammer 22oz — Estwing", meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", proj: "General stock", val: 240 },
      { name: 'Pry bar 24" — Stanley', meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 80 },
      { name: "Utility knife — Milwaukee", meta: "Company owned · Bulk", qty: "12 pcs", cond: "Good", proj: "General stock", val: 120 },
      { name: "4ft level — Empire", meta: "Company owned", qty: "3 pcs", cond: "Good", proj: "General stock", val: 135 },
      { name: "2ft torpedo level", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", proj: "General stock", val: 90 },
      { name: "Tape measure 25ft — DEWALT", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", proj: "General stock", val: 90 },
      { name: "Speed square — Swanson", meta: "Company owned · Bulk", qty: "4 pcs", cond: "Good", proj: "General stock", val: 40 },
      { name: "Chalk line — Stanley", meta: "Company owned", qty: "3 pcs", cond: "Good", proj: "General stock", val: 30 },
      { name: "Claw hammer 16oz — Stanley", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", proj: "General stock", val: 90 },
      { name: "Chisels set — Irwin", meta: "Company owned", qty: "3 sets", cond: "Good", proj: "General stock", val: 75 },
      { name: 'Drywall knife 6" — Rigid', meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", proj: "General stock", val: 64 },
      { name: "Tin snips — DEWALT", meta: "Company owned", qty: "3 pcs", cond: "Good", proj: "General stock", val: 75 },
      { name: "Wire stripper — Klein", meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 100 },
      { name: "Lineman pliers — Klein", meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 120 },
      { name: "Needle-nose pliers — Klein", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", proj: "General stock", val: 90 },
      { name: "Hacksaw — Stanley", meta: "Company owned", qty: "3 pcs", cond: "Good", proj: "General stock", val: 45 },
      { name: "Miter box", meta: "Company owned", qty: "2 pcs", cond: "Good", proj: "General stock", val: 50 },
      { name: "Rubber mallet 32oz", meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 60 },
      { name: "Floor scraper", meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 80 },
      { name: "Caulk gun — Newborn", meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", proj: "General stock", val: 80 },
      { name: 'Putty knife 3" — Hyde', meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", proj: "General stock", val: 40 },
      { name: "Brick trowel — Marshalltown", meta: "Company owned", qty: "3 pcs", cond: "Good", proj: "General stock", val: 75 },
      { name: "Notched trowel 1/4x3/8", meta: "Company owned · Tiling", qty: "4 pcs", cond: "Good", proj: "General stock", val: 48 },
      { name: "Grout float", meta: "Company owned", qty: "4 pcs", cond: "Good", proj: "General stock", val: 40 },
      { name: "Sponge & bucket set", meta: "Tiling · Bulk", qty: "6 sets", cond: "Good", proj: "General stock", val: 48 },
      { name: "Mud mixing paddle", meta: "Company owned", qty: "2 pcs", cond: "Good", proj: "General stock", val: 30 },
      { name: "Staple gun — Arrow", meta: "Company owned", qty: "2 pcs", cond: "Good", proj: "General stock", val: 60 },
      { name: "Punch set — Irwin", meta: "Company owned", qty: "2 sets", cond: "Good", proj: "General stock", val: 30 },
    ],
    "safety-equip": [
      { name: "Safety glasses — bulk pack", meta: "ANSI Z87.1 · Tier 1", qty: "24 pcs", cond: "New", proj: "General stock", val: 48 },
      { name: "Ear protection — foam plugs", meta: "3M · NRR 33 · Bulk", qty: "200 pairs", cond: "New", proj: "General stock", val: 40 },
      { name: "N95 respirator — 3M 8210", meta: "NIOSH · Tier 1", qty: "40 pcs", cond: "New", proj: "General stock", val: 80 },
      { name: "Hard hat — white", meta: "MSA · Tier 1", qty: "8 pcs", cond: "New", proj: "General stock", val: 120 },
      { name: "Work gloves — leather palm", meta: "Mechanix · Tier 1 · Bulk", qty: "20 pairs", cond: "New", proj: "General stock", val: 200 },
      { name: "High-vis safety vest — orange", meta: "ANSI Class 2 · Bulk", qty: "12 pcs", cond: "New", proj: "General stock", val: 96 },
      { name: "Knee pads — ProKnee", meta: "Tier 2", qty: "6 pairs", cond: "New", proj: "General stock", val: 180 },
      { name: "First aid kit — 200 piece", meta: "OSHA compliant", qty: "2 kits", cond: "New", proj: "General stock", val: 90 },
      { name: "Caution tape — yellow", meta: "Bulk", qty: "10 rolls", cond: "New", proj: "General stock", val: 30 },
    ],
    ladders: [
      { name: "6ft fiberglass step ladder — Werner", meta: "Type IA · Company owned", qty: "3 units", cond: "Good", proj: "General stock", val: 480 },
      { name: "8ft aluminum step ladder — Louisville", meta: "Type I · Company owned", qty: "2 units", cond: "Good", proj: "CHG-2247", val: 360 },
      { name: "24ft extension ladder — Werner", meta: "Type IA · Company owned", qty: "2 units", cond: "Good", proj: "General stock", val: 740 },
      { name: "Pump jack scaffolding set", meta: "Company owned · Full set", qty: "1 set", cond: "Good", proj: "CHG-2249", val: 850 },
    ],
    "hvac-systems": [
      { name: "3-ton central AC unit — Carrier", meta: "16 SEER · Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 2400 },
      { name: "2-ton central AC unit — Carrier", meta: "16 SEER · Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2249", val: 1950 },
      { name: "80k BTU gas furnace — Lennox", meta: "80% AFUE · Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 1200 },
      { name: "Heat pump 3-ton — Trane", meta: "18 SEER · Tier 2", qty: "1 unit", cond: "New", proj: "General stock", val: 3100 },
    ],
    ductwork: [
      { name: '6" flex duct 25ft', meta: "Tier 1 — Bulk", qty: "8 rolls", cond: "New", proj: "CHG-2247", val: 320 },
      { name: '8" flex duct 25ft', meta: "Tier 1", qty: "4 rolls", cond: "New", proj: "CHG-2247", val: 240 },
      { name: '10" rigid duct 5ft', meta: "Galvanized · Tier 1", qty: "6 pcs", cond: "New", proj: "General stock", val: 150 },
      { name: "HVAC duct tape — silver", meta: "3M · Foil tape · Bulk", qty: "12 rolls", cond: "New", proj: "General stock", val: 120 },
      { name: "Duct insulation wrap R-6", meta: "Tier 1", qty: "4 rolls", cond: "New", proj: "CHG-2247", val: 200 },
      { name: "Floor register 4x12 — white", meta: "Tier 1 — Bulk", qty: "16 pcs", cond: "New", proj: "CHG-2247", val: 96 },
      { name: "Return air grille 14x20 — white", meta: "Tier 1", qty: "6 pcs", cond: "New", proj: "General stock", val: 90 },
      { name: 'Plenum box 12" round', meta: "Tier 1", qty: "4 pcs", cond: "New", proj: "General stock", val: 80 },
    ],
    thermostats: [
      { name: "Smart thermostat — Nest 4th gen", meta: "Google · Tier 2", qty: "3 units", cond: "New", proj: "CHG-2247", val: 450 },
      { name: "Programmable thermostat — Honeywell", meta: "T6 Pro · Tier 1", qty: "2 units", cond: "New", proj: "CHG-2249", val: 130 },
      { name: "Manual thermostat — Honeywell", meta: "T87 Round · Tier 1", qty: "1 unit", cond: "New", proj: "General stock", val: 35 },
      { name: "Thermostat wire 18/5 — 50ft", meta: "Tier 1", qty: "4 rolls", cond: "New", proj: "General stock", val: 80 },
      { name: "Thermostat sub-base", meta: "Tier 1", qty: "3 pcs", cond: "New", proj: "General stock", val: 30 },
      { name: "Thermostat cover plate", meta: "White · Tier 1 · Bulk", qty: "6 pcs", cond: "New", proj: "General stock", val: 18 },
    ],
    filters: [
      { name: "16x25x1 MERV 8 filter", meta: "Tier 1 — Bulk", qty: "24 pcs", cond: "New", proj: "General stock", val: 120 },
      { name: "20x20x1 MERV 8 filter", meta: "Tier 1 — Bulk", qty: "12 pcs", cond: "New", proj: "General stock", val: 72 },
      { name: "16x20x1 MERV 11 filter", meta: "Tier 2", qty: "12 pcs", cond: "New", proj: "CHG-2247", val: 108 },
      { name: "20x25x4 MERV 11 — thick", meta: "Tier 2", qty: "6 pcs", cond: "New", proj: "General stock", val: 90 },
      { name: "Refrigerant R-410A — 25lb jug", meta: "Tier 2 · Licensed use only", qty: "2 jugs", cond: "New", proj: "General stock", val: 450 },
      { name: "Condensate drain pan tabs", meta: "Tier 1 — Bulk", qty: "100 pcs", cond: "New", proj: "General stock", val: 40 },
      { name: "HVAC coil cleaner spray", meta: "Nu-Calgon · Tier 1", qty: "6 cans", cond: "New", proj: "General stock", val: 60 },
      { name: "Blower motor lubricant", meta: "3-in-1 · Tier 1", qty: "6 tubes", cond: "New", proj: "General stock", val: 36 },
      { name: "Condensate pump — Little Giant", meta: "Tier 1", qty: "2 units", cond: "New", proj: "General stock", val: 80 },
      { name: "Duct sealant — mastic", meta: "Hardcast · Tier 1", qty: "4 gal", cond: "New", proj: "CHG-2247", val: 120 },
      { name: "Drain line clear tabs", meta: "Tier 1 — Bulk", qty: "50 pcs", cond: "New", proj: "General stock", val: 25 },
      { name: "Wire brushes — HVAC", meta: "Assorted · Tier 1", qty: "4 sets", cond: "New", proj: "General stock", val: 48 },
    ],
    "kitchen-appl": [
      { name: 'Refrigerator 36" French door — Samsung', meta: "Tier 2 · SS finish", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 1850 },
      { name: 'Gas range 30" — GE', meta: "5-burner · Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2248", val: 1200 },
      { name: "Dishwasher built-in — Bosch", meta: "300 series · Tier 2", qty: "2 units", cond: "New", proj: "CHG-2247", val: 1800 },
      { name: "Over-range microwave — GE", meta: "1.7 cu ft · Tier 1", qty: "2 units", cond: "New", proj: "CHG-2249", val: 700 },
      { name: 'Range hood 30" — Broan', meta: "Tier 1", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 180 },
      { name: "Garbage disposal 1/2HP — InSinkErator", meta: "Badger 5 · Tier 1", qty: "3 units", cond: "New", proj: "General stock", val: 330 },
    ],
    laundry: [
      { name: "Washer top-load 4.5cu ft — Samsung", meta: "Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 850 },
      { name: "Dryer electric 7.4cu ft — Samsung", meta: "Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 800 },
      { name: 'Laundry tub sink — Fiat', meta: "24\" · Tier 1", qty: "1 unit", cond: "New", proj: "General stock", val: 145 },
    ],
    "water-heaters": [
      { name: "40gal water heater gas — Rheem", meta: "Performance Plus · Tier 1", qty: "1 unit", cond: "New", proj: "CHG-2249", val: 680 },
      { name: "Tankless water heater — Rinnai", meta: "V65eN natural gas · Tier 2", qty: "1 unit", cond: "New", proj: "CHG-2247", val: 1100 },
    ],
  };

  // Wipe + reseed warehouse so prototype layout always matches.
  await prisma.warehouseItem.deleteMany({
    where: { subcategory: { department: { companyId: company.id } } },
  });
  await prisma.warehouseSubcategory.deleteMany({
    where: { department: { companyId: company.id } },
  });
  await prisma.warehouseDepartment.deleteMany({ where: { companyId: company.id } });

  let depOrder = 0;
  for (const d of WH_DEPARTMENTS) {
    const dep = await prisma.warehouseDepartment.create({
      data: { companyId: company.id, code: d.code, name: d.name, icon: d.icon, order: depOrder++ },
    });
    let subOrder = 0;
    for (const s of d.subs) {
      const sub = await prisma.warehouseSubcategory.create({
        data: { departmentId: dep.id, code: s.code, name: s.name, order: subOrder++ },
      });
      const items = WH_INVENTORY[s.code] || [];
      for (const it of items) {
        const projectId =
          it.proj && it.proj !== "General stock" && projectsByCode[it.proj]
            ? projectsByCode[it.proj]
            : null;
        await prisma.warehouseItem.create({
          data: {
            subcategoryId: sub.id,
            name: it.name,
            notes: it.meta,
            unit: it.qty,
            condition: it.cond,
            value: String(it.val),
            qty: String(it.val), // placeholder; qty string parsed for display
            defaultCost: String(it.val),
            projectId,
          },
        });
      }
    }
  }

  // ── Warehouse templates (system + sample) ────────────────────────────
  type SeedTemplateField = {
    name: string;
    type: "text" | "select" | "money" | "number";
    required: boolean;
    options?: string[];
  };
  type SeedTemplate = {
    name: string;
    isLocked: boolean;
    isDefault: boolean;
    scope: string;
    data: { fields: SeedTemplateField[] };
  };
  const templateSeed: SeedTemplate[] = [
    { name: "Standard kitchen appliance", isLocked: true, isDefault: false, scope: "kitchen-appl",
      data: { fields: [
        { name: "Brand",   type: "text",   required: true },
        { name: "Model",   type: "text",   required: true },
        { name: "Serial",  type: "text",   required: false },
        { name: "Tier",    type: "select", required: true, options: ["Tier 1", "Tier 2"] },
        { name: "Value",   type: "money",  required: true },
      ]}},
    { name: "Bulk material",  isLocked: true,  isDefault: true,  scope: "gen-flooring",
      data: { fields: [
        { name: "Description", type: "text",   required: true },
        { name: "Quantity",    type: "text",   required: true },
        { name: "Tier",        type: "select", required: true, options: ["Tier 1 — Bulk", "Tier 2 — Spec variant"] },
        { name: "Value",       type: "money",  required: true },
      ]}},
    { name: "Tool / equipment", isLocked: true, isDefault: false, scope: "power-tools",
      data: { fields: [
        { name: "Brand",         type: "text",   required: true },
        { name: "Model",         type: "text",   required: true },
        { name: "Condition",     type: "select", required: true, options: ["New", "Good", "Fair", "Damaged"] },
        { name: "Replacement $", type: "money",  required: true },
      ]}},
  ];
  for (const t of templateSeed) {
    const exists = await prisma.warehouseTemplate.findFirst({
      where: { companyId: company.id, name: t.name },
    });
    if (!exists) {
      await prisma.warehouseTemplate.create({
        data: {
          companyId: company.id,
          name: t.name,
          isLocked: t.isLocked,
          isDefault: t.isDefault,
          scope: t.scope,
          data: t.data as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ── Documents Hub (~44 docs split across 4 levels) ───────────────────
  const docCategories: {
    level: DocLevel;
    category: string;
    name: string;
    status?: DocStatus;
    meta?: Prisma.InputJsonValue;
  }[] = [
    { level: DocLevel.Company, category: "legal", name: "Articles of Organization" },
    { level: DocLevel.Company, category: "legal", name: "Operating Agreement" },
    { level: DocLevel.Company, category: "tax", name: "EIN Confirmation Letter" },
    { level: DocLevel.Company, category: "insurance", name: "General Liability Policy 2026" },
    { level: DocLevel.Company, category: "banking", name: "Operating Account Resolution" },
    { level: DocLevel.Company, category: "policy", name: "Subcontractor Onboarding Policy" },
    { level: DocLevel.Company, category: "policy", name: "Draw Approval Policy" },
    { level: DocLevel.Company, category: "policy", name: "COI Compliance Policy" },
    { level: DocLevel.Company, category: "templates", name: "Standard MSA Template" },
    { level: DocLevel.Company, category: "templates", name: "Standard SOW Template" },
  ];
  for (const propCode of Object.keys(properties)) {
    docCategories.push(
      { level: DocLevel.Property, category: "deed", name: `${propCode} — Deed` },
      { level: DocLevel.Property, category: "title", name: `${propCode} — Title Insurance` },
      { level: DocLevel.Property, category: "appraisal", name: `${propCode} — Appraisal` },
      { level: DocLevel.Property, category: "insurance", name: `${propCode} — Property Insurance` },
      { level: DocLevel.Property, category: "tax", name: `${propCode} — Tax Assessment` },
      { level: DocLevel.Property, category: "inspection", name: `${propCode} — Pre-purchase Inspection` }
    );
  }
  // Project docs — match prototype Documents tab listings
  docCategories.push(
    { level: DocLevel.Project, category: "Contract", name: "General Contractor SOW Agreement", meta: { signed: true, signedAt: "2026-03-01" } },
    { level: DocLevel.Project, category: "Addendum", name: "SOW Addendum #2 — +6 days extension", meta: { signed: true, signedAt: "2026-04-24" } },
    { level: DocLevel.Project, category: "Permit", name: "Building Permit — CHG-2247", meta: { issuedAt: "2026-02-28" } },
    { level: DocLevel.Project, category: "Misc Admin", name: "City fine — illegal dumping notice", status: DocStatus.Pending, meta: { staged: true, issuedAt: "2026-04-14" } },
    { level: DocLevel.Project, category: "permit", name: "CHG-2247 — Electrical Permit" },
    { level: DocLevel.Project, category: "permit", name: "CHG-2247 — Plumbing Permit" },
    { level: DocLevel.Project, category: "draw", name: "CHG-2247 — Draw #1 Invoice" },
    { level: DocLevel.Project, category: "draw", name: "CHG-2247 — Draw #2 Invoice" },
    { level: DocLevel.Project, category: "draw", name: "CHG-2247 — Draw #3 Invoice" },
    { level: DocLevel.Project, category: "draw", name: "CHG-2247 — Draw #4 Invoice" }
  );
  // Contact-level docs
  docCategories.push(
    { level: DocLevel.Contact, category: "insurance", name: "Mike K. — COI" },
    { level: DocLevel.Contact, category: "insurance", name: "Carlos M. — COI (expiring)" },
    { level: DocLevel.Contact, category: "insurance", name: "Diego Ramirez — COI" },
    { level: DocLevel.Contact, category: "license", name: "Diego Ramirez — Class A License" },
    { level: DocLevel.Contact, category: "w9", name: "Diego Ramirez — W-9" },
    { level: DocLevel.Contact, category: "insurance", name: "Tasha Brooks — COI" },
    { level: DocLevel.Contact, category: "license", name: "Tasha Brooks — Master Plumber License" },
    { level: DocLevel.Contact, category: "insurance", name: "Mike O'Connor — COI" },
    { level: DocLevel.Contact, category: "license", name: "Mike O'Connor — Master Electrician" },
    { level: DocLevel.Contact, category: "insurance", name: "Aisha Patel — COI" },
    { level: DocLevel.Contact, category: "insurance", name: "Wesley Tran — COI" },
    { level: DocLevel.Contact, category: "license", name: "Wesley Tran — Contractor License" }
  );

  for (const d of docCategories) {
    const existing = await prisma.document.findFirst({
      where: { companyId: company.id, level: d.level, name: d.name },
    });
    if (!existing) {
      const baseProp =
        d.level === DocLevel.Property
          ? properties[d.name.split(" ")[0]]
          : d.level === DocLevel.Project
          ? properties["CHG-2247"]
          : null;
      await prisma.document.create({
        data: {
          companyId: company.id,
          level: d.level,
          category: d.category,
          name: d.name,
          status: d.status ?? DocStatus.Active,
          uploadedById: "seed-user-roey",
          propertyId: baseProp,
          projectId: d.level === DocLevel.Project ? project.id : null,
          meta: d.meta,
        },
      });
    }
  }

  // ── Permission matrix ───────────────────────────────────────────────
  const matrix: { feature: string; action: string; roles: Record<string, boolean>; notes?: string }[] = [
    { feature: "pipeline", action: "view",    roles: { Admin: true, ProjectManager: true } },
    { feature: "pipeline", action: "edit",    roles: { Admin: true, ProjectManager: true } },
    { feature: "pipeline", action: "approve", roles: { Admin: true } },
    { feature: "rehab",    action: "view",    roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Subcontractor: true, Inspector: true } },
    { feature: "rehab",    action: "edit",    roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
    { feature: "rehab",    action: "approve", roles: { Admin: true, ProjectManager: true } },
    { feature: "checklist",action: "edit",    roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Inspector: true }, notes: "Inspector + GC can verify checklist items" },
    { feature: "draws",    action: "view",    roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
    { feature: "draws",    action: "edit",    roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
    { feature: "draws",    action: "approve", roles: { Admin: true, ProjectManager: true }, notes: "Draws require PM/Admin approval" },
    { feature: "warehouse", action: "view",   roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Subcontractor: true } },
    { feature: "warehouse", action: "edit",   roles: { Admin: true, ProjectManager: true } },
    { feature: "property",  action: "view",   roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
    { feature: "property",  action: "edit",   roles: { Admin: true, ProjectManager: true } },
    { feature: "contacts",  action: "view",   roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
    { feature: "contacts",  action: "edit",   roles: { Admin: true, ProjectManager: true } },
    { feature: "contacts",  action: "assign", roles: { Admin: true, ProjectManager: true }, notes: "Assign contractor to project" },
    { feature: "documents", action: "view",   roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Inspector: true } },
    { feature: "documents", action: "edit",   roles: { Admin: true, ProjectManager: true } },
    { feature: "admin",     action: "admin",  roles: { Admin: true }, notes: "Admin Settings is Admin-only" },
  ];
  for (const m of matrix) {
    await prisma.permissionMatrixRow.upsert({
      where: { companyId_feature_action: { companyId: company.id, feature: m.feature, action: m.action } },
      update: { roles: m.roles, notes: m.notes },
      create: { companyId: company.id, ...m },
    });
  }

  // ── PermissionLabelRow (18 prototype rows) ───────────────────────────
  const PERM_ROWS: { label: string; adminLock: boolean; pm: string; gc: string; sub: string; inspector: string; locked?: boolean }[] = [
    { label: "Approve draw payments",      adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
    { label: "View projects",              adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
    { label: "Edit projects & SOW",        adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
    { label: "Upload documents",           adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "none" },
    { label: "Delete documents",           adminLock: true,  pm: "none", gc: "none", sub: "none", inspector: "none" },
    { label: "View documents",             adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
    { label: "File exception",             adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
    { label: "Verify checklist items",     adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "edit" },
    { label: "View checklist",             adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
    { label: "Add/edit SOW line items",    adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
    { label: "Create document categories", adminLock: true,  pm: "none", gc: "none", sub: "none", inspector: "none" },
    { label: "Manage warehouse templates", adminLock: true,  pm: "edit", gc: "none", sub: "none", inspector: "none" },
    { label: "Add items to warehouse",     adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "none" },
    { label: "View warehouse",             adminLock: false, pm: "view", gc: "view", sub: "none", inspector: "none" },
    { label: "View activity log",          adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
    { label: "Edit system log entries",    adminLock: true,  pm: "none", gc: "none", sub: "none", inspector: "none", locked: true },
    { label: "Change admin settings",      adminLock: true,  pm: "none", gc: "none", sub: "none", inspector: "none" },
    { label: "Add team members",           adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  ];
  let permOrd = 0;
  for (const p of PERM_ROWS) {
    await prisma.permissionLabelRow.upsert({
      where: { companyId_label: { companyId: company.id, label: p.label } },
      update: {
        ord: permOrd,
        pm: p.pm, gc: p.gc, sub: p.sub, inspector: p.inspector,
        adminLock: p.adminLock, locked: !!p.locked,
      },
      create: {
        companyId: company.id, label: p.label, ord: permOrd,
        pm: p.pm, gc: p.gc, sub: p.sub, inspector: p.inspector,
        adminLock: p.adminLock, locked: !!p.locked,
      },
    });
    permOrd++;
  }

  // ── Documents Hub: prototype rows that drive expiry / staged behavior
  const DOCS_HUB: { name: string; level: DocLevel; category: string; status: DocStatus; expiresAt?: string; meta?: string; projectCode?: string; propertyCode?: string }[] = [
    // Project-level extras for the doc hub demo
    { name: "Carlos M. — Certificate of Insurance", level: DocLevel.Project, category: "insurance-coi", status: DocStatus.Active, expiresAt: "2026-05-01", projectCode: "CHG-2247", meta: "Insurance · Rivera Electric" },
    { name: "Mike K. — Certificate of Insurance",   level: DocLevel.Project, category: "insurance-coi", status: DocStatus.Active, expiresAt: "2026-12-01", projectCode: "CHG-2247", meta: "Insurance · GC" },
    { name: "Building Permit — CHG-2247",           level: DocLevel.Project, category: "permits",       status: DocStatus.Active, projectCode: "CHG-2247", meta: "City of Cleveland" },
    { name: "City fine — illegal dumping notice",   level: DocLevel.Project, category: "misc-admin",    status: DocStatus.Staged, projectCode: "CHG-2247", meta: "City-issued penalty notice — needs categorization" },
    { name: "Phase 4 verification photos",          level: DocLevel.Project, category: "misc-admin",    status: DocStatus.Active, projectCode: "CHG-2247", meta: "6 photos · all items covered" },
    // Individual / contact docs
    { name: "Tom R. — Plumbing license", level: DocLevel.Contact, category: "permits", status: DocStatus.Expired, expiresAt: "2026-03-01", meta: "Ohio license #PL-3391 — EXPIRED" },
    { name: "Carlos M. — Electrical license", level: DocLevel.Contact, category: "permits", status: DocStatus.Active, expiresAt: "2026-06-01", meta: "Ohio license #EL-7734" },
    { name: "Jake M. — Electrician license",  level: DocLevel.Contact, category: "permits", status: DocStatus.Active, expiresAt: "2027-08-01", meta: "Ohio license #EL-5521" },
    // Company-level
    { name: "State contractor license — Ohio", level: DocLevel.Company, category: "permits", status: DocStatus.Active, expiresAt: "2027-06-01", meta: "License #OH-2847623" },
  ];
  for (const d of DOCS_HUB) {
    const exists = await prisma.document.findFirst({
      where: { companyId: company.id, level: d.level, name: d.name },
    });
    if (!exists) {
      await prisma.document.create({
        data: {
          companyId: company.id,
          level: d.level,
          category: d.category,
          name: d.name,
          status: d.status,
          uploadedById: "seed-user-roey",
          expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
          projectId: d.projectCode ? projectsByCode[d.projectCode] : null,
          propertyId: d.projectCode ? properties[d.projectCode] : (d.propertyCode ? properties[d.propertyCode] : null),
          meta: d.meta ? { description: d.meta } : undefined,
        },
      });
    }
  }

  // ── Activity entries (richer, Rehab Manager-focused + pipeline) ─────
  await prisma.activityLogEntry.deleteMany({ where: { companyId: company.id } });
  const acts = [
    { actorId: "seed-user-roey", action: "document.uploaded", entity: "Document", message: "Draw #5 Invoice — Flooring uploaded · Category: Financial · Project: CHG-2247.", meta: { type: "document" }, createdAt: new Date("2026-04-26T14:31:00Z") },
    { actorId: "seed-user-roey", action: "checklist.verified", entity: "ChecklistItem", message: "Phase 5 — Flooring. Item 2 of 4 verified: Bedroom 2 & 3 flooring complete. 2 items remaining before Draw #5 gate opens.", meta: { type: "system" }, createdAt: new Date("2026-04-26T14:14:00Z") },
    { actorId: "seed-user-roey", action: "draw.approved", entity: "Draw", message: "Draw #4 approved — $4,000 to Mike K. (GC). Phase 4: Drywall hang & mud. All 4 checklist items verified.", meta: { type: "payment", drawNumber: 4 }, createdAt: new Date("2026-04-25T13:58:00Z") },
    { actorId: "seed-user-roey", action: "note.posted", entity: "Note", message: "City inspector confirmed final walkthrough passed. CO expected 5–7 business days. Mike to schedule professional cleaning before handoff.", meta: { type: "note" }, createdAt: new Date("2026-04-25T13:44:00Z") },
    { actorId: "seed-user-roey", action: "exception.filed", entity: "Phase", message: "Phase 4 — Drywall hang & mud. HVAC access blocked by subcontractor materials. Penalty clock paused.", meta: { type: "flag" }, createdAt: new Date("2026-04-24T20:33:00Z") },
    { actorId: "seed-user-roey", action: "addendum.signed", entity: "Addendum", message: "Addendum #2 signed by all parties. Timeline extended +6 days. Revised deadline: May 3, 2026 ET. Penalty anchored to revised deadline.", meta: { type: "system" }, createdAt: new Date("2026-04-24T15:02:00Z") },
    { actorId: "seed-user-roey", action: "draw.approved", entity: "Draw", message: "Draw #3 approved — $6,400 to Mike K. (GC). Phase 3: Plumbing & electrical. All checklist items verified.", meta: { type: "payment", drawNumber: 3 }, createdAt: new Date("2026-04-22T12:28:00Z") },
    { actorId: "seed-user-pm",   action: "deal.advanced", entity: "PipelineDeal", message: "Underwriting started — walk completed for 514 Lakewood Ave.", meta: { type: "system" }, createdAt: new Date("2026-04-15T10:00:00Z") },
    { actorId: "seed-user-roey", action: "deal.created", entity: "PipelineDeal", message: "Deal submitted — Marcus L.", meta: { type: "system" }, createdAt: new Date("2026-04-14T09:30:00Z") },
    { actorId: "seed-user-roey", action: "contact.created", entity: "Contact", message: "Added vendor: Best Laminate.", meta: { type: "system" }, createdAt: new Date("2026-04-12T10:00:00Z") },
    { actorId: "seed-user-pm",   action: "phase.advanced", entity: "Phase", message: "Phase 5 — Flooring marked Active.", meta: { type: "system" }, createdAt: new Date("2026-04-23T13:00:00Z") },
    { actorId: "seed-user-roey", action: "draw.approved", entity: "Draw", message: "Draw #2 approved — $4,800 to Mike K. (GC). Phase 2: Framing & rough-in.", meta: { type: "payment", drawNumber: 2 }, createdAt: new Date("2026-03-22T18:15:00Z") },
    { actorId: "seed-user-roey", action: "draw.approved", entity: "Draw", message: "Draw #1 approved — $3,200 to Mike K. (GC). Phase 1: Demolition.", meta: { type: "payment", drawNumber: 1 }, createdAt: new Date("2026-03-05T14:22:00Z") },
  ];
  for (const a of acts) {
    await prisma.activityLogEntry.create({ data: { companyId: company.id, ...a } });
  }

  // ── Investor portal seed (shared module) ────────────────────────────
  await _seedInvestorPortal(prisma, company.id);

  // ── Contractor portal seed (Task 23) ───────────────────────────────
  const { seedContractorPortal } = await import("./seed-contractor-shared");
  await seedContractorPortal(prisma);

  console.log("[seed] done");
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
