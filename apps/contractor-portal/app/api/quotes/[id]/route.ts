import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentContractor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Quote action endpoint for the operator-lens "Review" button.
 * Only the recipient (`toAccountId`) can accept/decline.
 * On accept we also auto-spawn a CpJob so the operator-lens Jobs board
 * stays in sync without a second click.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentContractor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const quote = await prisma.cpQuote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (quote.toAccountId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (quote.status !== "pending") {
    return NextResponse.json({ error: `already ${quote.status}` }, { status: 409 });
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  const updated = await prisma.cpQuote.update({
    where: { id },
    data: { status: newStatus, respondedAt: new Date() },
  });

  if (action === "accept") {
    await prisma.cpJob.create({
      data: {
        name: quote.jobName,
        contractorId: quote.fromAccountId,
        awardedByAccountId: quote.toAccountId,
        contractAmount: quote.totalAmount,
        status: "active",
      },
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, quote: updated });
}
