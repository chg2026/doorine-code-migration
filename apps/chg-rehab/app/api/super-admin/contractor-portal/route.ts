import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superAdmin";

export const dynamic = "force-dynamic";

/**
 * Super-admin read-only listing of every CpAccount across the platform,
 * with their OperatorEdge graph (upstream + downstream) and rolled-up
 * transactional totals.
 *
 * Server-side gated by `requireSuperAdmin()` — the UI gate in
 * super-admin/page.tsx is defence-in-depth, not the only check.
 */
export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const [accounts, edges, quoteAgg, invoiceAgg, jobCounts, inviteCounts, allQuotes, allInvoices, allJobs] = await Promise.all([
    prisma.cpAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, contactName: true, companyName: true, trade: true,
        planTier: true, status: true, createdAt: true, lastLoginAt: true,
      },
    }),
    prisma.cpOperatorEdge.findMany({
      include: {
        layer1Company: { select: { id: true, name: true } },
        inviter: { select: { id: true, contactName: true, companyName: true } },
        contractor: { select: { id: true, contactName: true, companyName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cpQuote.groupBy({ by: ["fromAccountId", "status"], _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.cpInvoice.groupBy({ by: ["fromAccountId", "status"], _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.cpJob.groupBy({ by: ["contractorId", "status"], _count: { _all: true } }),
    prisma.cpOnboardingInvite.groupBy({ by: ["inviterAccountId"], _count: { _all: true } }),
    prisma.cpQuote.findMany({
      orderBy: { sentAt: "desc" }, take: 500,
      select: {
        id: true, number: true, jobName: true, totalAmount: true, status: true, sentAt: true,
        fromAccount: { select: { id: true, companyName: true } },
        toAccount: { select: { id: true, companyName: true } },
      },
    }),
    prisma.cpInvoice.findMany({
      orderBy: { submittedAt: "desc" }, take: 500,
      select: {
        id: true, number: true, totalAmount: true, status: true, submittedAt: true, paidAt: true,
        fromAccount: { select: { id: true, companyName: true } },
        toAccount: { select: { id: true, companyName: true } },
      },
    }),
    prisma.cpJob.findMany({
      orderBy: { createdAt: "desc" }, take: 500,
      select: {
        id: true, name: true, status: true, createdAt: true,
        contractor: { select: { id: true, companyName: true } },
      },
    }),
  ]);

  const totals = {
    accounts: accounts.length,
    edges: edges.length,
    layer1Edges: edges.filter((e) => e.layer1CompanyId).length,
    layer2Edges: edges.filter((e) => e.inviterAccountId).length,
    pendingQuoteCount: quoteAgg.filter((q) => q.status === "pending").reduce((s, q) => s + q._count._all, 0),
    pendingQuoteAmount: quoteAgg.filter((q) => q.status === "pending").reduce((s, q) => s + Number(q._sum.totalAmount || 0), 0),
    pendingInvoiceCount: invoiceAgg.filter((i) => i.status === "pending").reduce((s, i) => s + i._count._all, 0),
    pendingInvoiceAmount: invoiceAgg.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i._sum.totalAmount || 0), 0),
    activeJobs: jobCounts.filter((j) => j.status === "active").reduce((s, j) => s + j._count._all, 0),
  };

  // Build per-account rollups.
  const byAccount = new Map<string, { quotes: number; quotesAmount: number; invoices: number; invoicesAmount: number; jobs: number; invitesSent: number }>();
  const ensure = (id: string) => {
    let v = byAccount.get(id);
    if (!v) { v = { quotes: 0, quotesAmount: 0, invoices: 0, invoicesAmount: 0, jobs: 0, invitesSent: 0 }; byAccount.set(id, v); }
    return v;
  };
  for (const q of quoteAgg) { const v = ensure(q.fromAccountId); v.quotes += q._count._all; v.quotesAmount += Number(q._sum.totalAmount || 0); }
  for (const i of invoiceAgg) { const v = ensure(i.fromAccountId); v.invoices += i._count._all; v.invoicesAmount += Number(i._sum.totalAmount || 0); }
  for (const j of jobCounts) { ensure(j.contractorId).jobs += j._count._all; }
  for (const inv of inviteCounts) { if (inv.inviterAccountId) ensure(inv.inviterAccountId).invitesSent += inv._count._all; }

  const rows = accounts.map((a) => {
    const r = byAccount.get(a.id) || { quotes: 0, quotesAmount: 0, invoices: 0, invoicesAmount: 0, jobs: 0, invitesSent: 0 };
    const upstream = edges
      .filter((e) => e.contractorId === a.id)
      .map((e) => e.layer1Company ? `L1: ${e.layer1Company.name}` : e.inviter ? `L2: ${e.inviter.companyName}` : "?");
    const downstream = edges
      .filter((e) => e.inviterAccountId === a.id)
      .map((e) => e.contractor.companyName);
    return {
      ...a,
      createdAt: a.createdAt.toISOString(),
      lastLoginAt: a.lastLoginAt?.toISOString() || null,
      upstream, downstream,
      tier: upstream.some((u) => u.startsWith("L1")) ? "L2" : upstream.some((u) => u.startsWith("L2")) ? "L3" : "sole",
      ...r,
    };
  });

  const edgeRows = edges.map((e) => ({
    id: e.id,
    kind: e.layer1CompanyId ? "L1→L2" : "L2→L3",
    upstream: e.layer1Company ? `L1: ${e.layer1Company.name}` : e.inviter ? `L2: ${e.inviter.companyName}` : "—",
    contractor: e.contractor.companyName,
    createdAt: e.createdAt.toISOString(),
  }));
  const quoteRows = allQuotes.map((q) => ({
    id: q.id, number: q.number, jobName: q.jobName,
    from: q.fromAccount.companyName, to: q.toAccount?.companyName ?? "—",
    amount: Number(q.totalAmount), status: q.status, sentAt: q.sentAt.toISOString(),
  }));
  const invoiceRows = allInvoices.map((i) => ({
    id: i.id, number: i.number,
    from: i.fromAccount.companyName, to: i.toAccount?.companyName ?? "—",
    amount: Number(i.totalAmount), status: i.status,
    submittedAt: i.submittedAt.toISOString(), paidAt: i.paidAt?.toISOString() || null,
  }));
  const jobRows = allJobs.map((j) => ({
    id: j.id, name: j.name, contractor: j.contractor.companyName,
    status: j.status, createdAt: j.createdAt.toISOString(),
  }));

  return NextResponse.json({
    totals, accounts: rows,
    edges: edgeRows, quotes: quoteRows, invoices: invoiceRows, jobs: jobRows,
  });
}
