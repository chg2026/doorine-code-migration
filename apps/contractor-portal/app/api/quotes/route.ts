import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentContractor, publicOrigin } from "@/lib/auth";
import { consumeQuota, getQuotaStatus } from "@/lib/quota";

export const dynamic = "force-dynamic";

const Body = z.object({
  jobName: z.string().min(1),
  notes: z.string().optional().nullable(),
  recipientType: z.enum(["operator", "contractor"]),
  toCompanyId: z.string().nullable().optional(),
  toAccountId: z.string().nullable().optional(),
  isExternal: z.boolean().default(false),
  externalEmail: z.string().email().nullable().optional(),
  externalName: z.string().nullable().optional(),
  lines: z.array(z.object({
    desc: z.string(),
    qty: z.number(),
    unit: z.number(),
  })).min(1),
});

/**
 * Concurrency-safe quote number: derive a sequential prefix from the
 * year + count, then append a short random suffix so two requests
 * landing in the same millisecond can't collide on the @unique
 * constraint. We retry once on the (extremely unlikely) collision.
 */
async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    const count = await prisma.cpQuote.count({ where: { number: { startsWith: `QTE-${year}-` } } });
    const seq = String(count + 1 + attempt).padStart(3, "0");
    const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
    const number = `QTE-${year}-${seq}-${suffix}`;
    const exists = await prisma.cpQuote.findUnique({ where: { number }, select: { id: true } });
    if (!exists) return number;
  }
  return `QTE-${year}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function POST(req: NextRequest) {
  const c = await getCurrentContractor();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Invalid" }, { status: 400 });
  const b = body.data;

  // External quotes MUST carry an email — that's the only way the
  // recipient can later claim the quote via the magic-link invite.
  if (b.isExternal && !b.externalEmail) {
    return NextResponse.json({ error: "External quotes require an email address." }, { status: 400 });
  }

  // In-network quotes MUST land on a real recipient that the sender
  // can actually see in the operator graph — otherwise a malicious
  // user could target an arbitrary CpAccountId and skip the
  // free-tier quota by flipping `isExternal=false`.
  if (!b.isExternal) {
    if (b.recipientType === "operator") {
      if (!b.toCompanyId) {
        return NextResponse.json({ error: "Operator recipient required." }, { status: 400 });
      }
      // The sender must have an OperatorEdge with this L1 Company
      // (i.e. it is one of their upstream operators).
      const edge = await prisma.cpOperatorEdge.findFirst({
        where: { contractorId: c.id, layer1CompanyId: b.toCompanyId },
        select: { id: true },
      });
      if (!edge) return NextResponse.json({ error: "That operator is not in your network." }, { status: 403 });
    } else {
      if (!b.toAccountId) {
        return NextResponse.json({ error: "Contractor recipient required." }, { status: 400 });
      }
      // The sender must be tied to the recipient by an OperatorEdge:
      // either they invited the recipient (downstream), or the
      // recipient invited them (upstream).
      const edge = await prisma.cpOperatorEdge.findFirst({
        where: {
          OR: [
            { inviterAccountId: c.id, contractorId: b.toAccountId },
            { inviterAccountId: b.toAccountId, contractorId: c.id },
          ],
        },
        select: { id: true },
      });
      if (!edge) return NextResponse.json({ error: "That contractor is not in your network." }, { status: 403 });
    }
  }

  if (b.isExternal) {
    const ok = await consumeQuota(c.id);
    if (!ok) {
      const q = await getQuotaStatus(c.id);
      return NextResponse.json({ error: `Free-tier limit reached (${q.used}/${q.max} external quotes this month). Upgrade to Pro for unlimited.` }, { status: 402 });
    }
  }

  const number = await nextNumber();
  const total = b.lines.reduce((s, l) => s + l.qty * l.unit, 0);

  const quote = await prisma.cpQuote.create({
    data: {
      number,
      fromAccountId: c.id,
      jobName: b.jobName,
      notes: b.notes ?? undefined,
      recipientType: b.recipientType,
      toCompanyId: b.isExternal ? null : b.toCompanyId ?? null,
      toAccountId: b.isExternal ? null : b.toAccountId ?? null,
      totalAmount: total,
      isExternal: b.isExternal,
      lineItems: { create: b.lines.map((l, i) => ({ description: l.desc, qty: l.qty, unitPrice: l.unit, ord: i })) },
    },
  });

  // External recipients (no CpAccount yet) get a magic-link onboarding
  // invite alongside the quote, so accepting the quote also creates their
  // contractor account and wires the OperatorEdge back to the sender.
  let inviteLink: string | null = null;
  if (b.isExternal && b.externalEmail) {
    const email = b.externalEmail.toLowerCase();

    const existing = await prisma.cpOnboardingInvite.findFirst({
      where: { email, inviterAccountId: c.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    let token = existing?.token;
    let inviteId = existing?.id;
    if (!existing) {
      token = crypto.randomBytes(24).toString("base64url");
      const created = await prisma.cpOnboardingInvite.create({
        data: {
          email,
          contactName: b.externalName || null,
          token,
          inviterAccountId: c.id,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      inviteId = created.id;
    }

    inviteLink = `${publicOrigin(req)}/signup?token=${token}`;

    await prisma.cpSentMessage.create({
      data: {
        channel: "email",
        toAddress: email,
        subject: `${c.companyName} sent you a quote (${number})`,
        body:
          `Hi ${b.externalName || "there"},\n\n` +
          `${c.companyName} sent you a quote for ${b.jobName}.\n` +
          `Total: $${total.toLocaleString()}.\n\n` +
          `Claim your free CHG Contractor Portal account and accept it here:\n${inviteLink}\n\n` +
          `This link expires in 14 days.`,
        meta: { quoteId: quote.id, fromAccountId: c.id, inviteId, link: inviteLink },
      },
    });
  }

  return NextResponse.json({ ok: true, number, id: quote.id, inviteLink });
}
