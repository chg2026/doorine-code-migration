import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Mark all of the current investor's `InvestorActivity` rows that point at
 * `relatedUpdateId == :id` as read. Called when the Updates two-pane opens
 * a specific update detail.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const investor = await getCurrentInvestor();
  if (!investor)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Confirm the update is actually one this investor can see
  const update = await prisma.dealUpdate.findFirst({
    where: {
      id,
      published: true,
      offering: { subscriptions: { some: { investorId: investor.id } } },
    },
    select: { id: true },
  });
  if (!update) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.investorActivity.updateMany({
    where: {
      investorId: investor.id,
      relatedUpdateId: id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
