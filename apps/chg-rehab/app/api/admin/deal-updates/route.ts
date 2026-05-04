import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { DealUpdateType } from "@prisma/client";
import { dispatchInvestorNotifications } from "@/lib/notifications/investor";

export const dynamic = "force-dynamic";

/**
 * Publish a `DealUpdate` for an offering and fan-out an `update`
 * notification to every investor subscribed to that offering. Each
 * investor's portal-saved channel preferences (email / in-app) are honored
 * by the emitter.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const offeringId = typeof body.offeringId === "string" ? body.offeringId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body : null;
  const updateType =
    typeof body.updateType === "string" &&
    (Object.values(DealUpdateType) as string[]).includes(body.updateType)
      ? (body.updateType as DealUpdateType)
      : DealUpdateType.Quarterly;
  // Default to publishing immediately. Drafts can pass `published: false`.
  const published = body.published === false ? false : true;

  if (!offeringId || !title)
    return NextResponse.json(
      { error: "offeringId and title required" },
      { status: 400 }
    );

  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, companyId: me.companyId },
    select: { id: true, name: true },
  });
  if (!offering)
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });

  const update = await prisma.dealUpdate.create({
    data: {
      offeringId,
      title,
      body: text,
      updateType,
      published,
      postedById: me.id,
    },
  });

  if (published) {
    const subs = await prisma.investorSubscription.findMany({
      where: { offeringId, status: { in: ["Pending", "Active", "Closed"] } },
      select: { investorId: true },
    });
    const recipientIds = Array.from(new Set(subs.map((s) => s.investorId)));
    if (recipientIds.length > 0) {
      await dispatchInvestorNotifications(
        recipientIds.map((id) => ({
          investorId: id,
          event: "update" as const,
          title: `New update — ${offering.name}: ${title}`,
          description: text,
          relatedUpdateId: update.id,
        }))
      );
    }
  }

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "deal_update_published",
      entity: "DealUpdate",
      entityId: update.id,
      meta: { offeringId, updateType, published },
    },
  });

  return NextResponse.json({ ok: true, id: update.id });
}
