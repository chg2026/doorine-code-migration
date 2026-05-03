import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { InvestorCommunicationChannel } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const investor = await prisma.investor.findFirst({
    where: { id, companyId: me.companyId },
  });
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const channel =
    typeof body.channel === "string" &&
    (Object.values(InvestorCommunicationChannel) as string[]).includes(body.channel)
      ? (body.channel as InvestorCommunicationChannel)
      : InvestorCommunicationChannel.Note;
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!text)
    return NextResponse.json({ error: "Body is required" }, { status: 400 });

  const comm = await prisma.investorCommunication.create({
    data: {
      investorId: id,
      loggedById: me.id,
      channel,
      subject: subject || null,
      body: text,
      loggedAt: new Date(),
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "investor_communication_logged",
      entity: "Investor",
      entityId: id,
      meta: { commId: comm.id, channel },
    },
  });
  return NextResponse.json({ ok: true, id: comm.id });
}
