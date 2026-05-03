import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  InvestorAccreditedStatus,
  InvestorStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const investor = await prisma.investor.findFirst({
    where: { id, companyId: me.companyId },
    include: {
      subscriptions: { include: { offering: true } },
      communications: { orderBy: { loggedAt: "desc" }, take: 50 },
      notes: { orderBy: { createdAt: "desc" }, take: 50 },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ investor });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await prisma.investor.findFirst({
    where: { id, companyId: me.companyId },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.firstName === "string") data.firstName = body.firstName.trim() || null;
  if (typeof body.lastName === "string") data.lastName = body.lastName.trim() || null;
  if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
  if (
    typeof body.status === "string" &&
    (Object.values(InvestorStatus) as string[]).includes(body.status)
  ) {
    data.status = body.status as InvestorStatus;
  }
  if (
    typeof body.accreditedStatus === "string" &&
    (Object.values(InvestorAccreditedStatus) as string[]).includes(
      body.accreditedStatus
    )
  ) {
    data.accreditedStatus = body.accreditedStatus as InvestorAccreditedStatus;
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  await prisma.investor.update({ where: { id }, data });
  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "investor_updated",
      entity: "Investor",
      entityId: id,
      meta: { keys: Object.keys(data) },
    },
  });
  return NextResponse.json({ ok: true });
}
