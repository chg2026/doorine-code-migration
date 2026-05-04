import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OperatorLensClient from "./Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contractor Portal · CHG Rehab" };

/**
 * The "Operator Lens" inside chg-rehab. This is the L1 view — what the CHG
 * operator sees about every L2 contractor (and the L3 subs they've invited)
 * that has an OperatorEdge into their company.
 *
 * Tabs (rendered client-side via Client.tsx): Overview · Contractors ·
 * Quotes · Invoices · Jobs · Bids · Compliance · Onboarding.
 */
export default async function ContractorPortalModule({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/contractor-portal");
  const { tab } = await searchParams;

  // Pull the full graph in one shot — the operator lens is a low-volume
  // back-office view, so we don't bother paginating until the dataset grows.
  const edges = await prisma.cpOperatorEdge.findMany({
    where: { layer1CompanyId: user.companyId },
    orderBy: { createdAt: "desc" },
    include: {
      contractor: {
        include: {
          quotesSent: { where: { toCompanyId: user.companyId }, orderBy: { sentAt: "desc" } },
          invoicesSent: { where: { toCompanyId: user.companyId }, orderBy: { submittedAt: "desc" } },
          jobsAsContractor: { where: { awardedByCompanyId: user.companyId }, orderBy: { createdAt: "desc" } },
          complianceDocs: true,
          bidsInvited: { where: { fromCompanyId: user.companyId }, orderBy: { createdAt: "desc" } },
          // Note: L1 operators MUST NOT see the L2→L3 relationship graph.
          // The downstream subs an L2 has invited are private to the L2.
        },
      },
    },
  });

  const invites = await prisma.cpOnboardingInvite.findMany({
    where: { inviterCompanyId: user.companyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Operator-lens "Messages" tab — every CpMessageThread where THIS L1
  // company is a participant (contractorB-or-A is a CpAccount linked to
  // us by an OperatorEdge, OR layer1CompanyId === ours).
  const threads = await prisma.cpMessageThread.findMany({
    where: { layer1CompanyId: user.companyId },
    include: {
      contractorA: { select: { companyName: true } },
      contractorB: { select: { companyName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  // Flatten everything once on the server; the client component just slices.
  const data = {
    contractors: edges.map((e) => {
      const c = e.contractor;
      return {
        id: c.id,
        contactName: c.contactName,
        companyName: c.companyName,
        email: c.email,
        trade: c.trade,
        planTier: c.planTier,
        status: c.status,
        invitedSubs: [] as { id: string; contactName: string; companyName: string; email: string; trade: string | null }[],
        activeJobs: c.jobsAsContractor.filter((j) => j.status === "active").length,
        completeJobs: c.jobsAsContractor.filter((j) => j.status === "complete").length,
        pendingQuoteCount: c.quotesSent.filter((q) => q.status === "pending").length,
        pendingInvoiceTotal: c.invoicesSent.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.totalAmount), 0),
        complianceFlags: c.complianceDocs.filter((d) => d.status === "expiring" || d.status === "expired").length,
      };
    }),
    quotes: edges.flatMap((e) =>
      e.contractor.quotesSent.map((q) => ({
        id: q.id, number: q.number, jobName: q.jobName, totalAmount: Number(q.totalAmount),
        status: q.status, sentAt: q.sentAt?.toISOString() || null,
        contractorName: e.contractor.companyName, contractorId: e.contractor.id,
      }))
    ),
    invoices: edges.flatMap((e) =>
      e.contractor.invoicesSent.map((i) => ({
        id: i.id, number: i.number, jobName: i.jobName, totalAmount: Number(i.totalAmount),
        status: i.status, submittedAt: i.submittedAt?.toISOString() || null,
        contractorName: e.contractor.companyName, contractorId: e.contractor.id,
      }))
    ),
    jobs: edges.flatMap((e) =>
      e.contractor.jobsAsContractor.map((j) => ({
        id: j.id, name: j.name, subtitle: j.subtitle, trade: j.trade,
        status: j.status, progressPct: j.progressPct,
        contractAmount: Number(j.contractAmount || 0),
        invoicedAmount: Number(j.invoicedAmount || 0),
        paidAmount: Number(j.paidAmount || 0),
        dueDate: j.dueDate, contractorName: e.contractor.companyName, contractorId: e.contractor.id,
      }))
    ),
    bids: edges.flatMap((e) =>
      e.contractor.bidsInvited.map((b) => ({
        id: b.id, jobName: b.jobName, trade: b.trade, status: b.status,
        bidDueAt: b.bidDueAt?.toISOString() || null,
        scopeRangeLow: b.scopeRangeLow ? Number(b.scopeRangeLow) : null,
        scopeRangeHigh: b.scopeRangeHigh ? Number(b.scopeRangeHigh) : null,
        contractorName: e.contractor.companyName, contractorId: e.contractor.id,
      }))
    ),
    compliance: edges.flatMap((e) =>
      e.contractor.complianceDocs.map((d) => ({
        id: d.id, name: d.name, docType: d.docType, fileName: d.fileName,
        status: d.status, expiresAt: d.expiresAt?.toISOString() || null,
        contractorName: e.contractor.companyName, contractorId: e.contractor.id,
      }))
    ),
    invites: invites.map((i) => ({
      id: i.id, email: i.email, contactName: i.contactName, companyName: i.companyName,
      trade: i.trade, createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(), consumedAt: i.consumedAt?.toISOString() || null,
    })),
    threads: threads.map((t) => ({
      id: t.id, subject: t.subject,
      with: t.contractorA?.companyName || t.contractorB?.companyName || "—",
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastBody: t.messages[0]?.body || null,
      lastSender: t.messages[0]?.senderName || null,
    })),
    settings: {
      companyId: user.companyId,
      planTier: "operator",
      defaultInviteExpiryDays: 14,
      operatorBrandLine: "CHG Rehab — managed contractor network",
    },
  };

  return <OperatorLensClient initialTab={tab || "overview"} data={data} />;
}
