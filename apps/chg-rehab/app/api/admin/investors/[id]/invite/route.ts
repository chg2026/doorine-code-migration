import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendInvestorInviteEmail } from "@/lib/investorInviteEmail";

export const dynamic = "force-dynamic";

const INVITE_TTL_DAYS = 14;

export async function POST(
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
  });
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!investor.email)
    return NextResponse.json(
      { error: "Investor has no email on file" },
      { status: 400 }
    );

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000);

  const company = await prisma.company.findUnique({
    where: { id: me.companyId },
    select: { name: true },
  });

  // One open invite at a time per investor — invalidate previous unconsumed
  // invites for the same email so the link in their inbox always matches
  // the live token in our DB.
  await prisma.investorInvite.deleteMany({
    where: {
      companyId: me.companyId,
      email: investor.email,
      consumedAt: null,
    },
  });

  const invite = await prisma.investorInvite.create({
    data: {
      companyId: me.companyId,
      email: investor.email,
      firstName: investor.firstName,
      lastName: investor.lastName,
      token,
      invitedById: me.id,
      expiresAt,
    },
  });

  const base = (
    process.env.INVESTOR_PORTAL_BASE_URL ||
    process.env.NEXT_PUBLIC_INVESTOR_PORTAL_BASE_URL ||
    "http://localhost:3002"
  ).replace(/\/+$/, "");
  const joinUrl = `${base}/signup?token=${encodeURIComponent(token)}`;

  if (
    !process.env.INVESTOR_PORTAL_BASE_URL &&
    !process.env.NEXT_PUBLIC_INVESTOR_PORTAL_BASE_URL
  ) {
    console.warn(
      "[invite] INVESTOR_PORTAL_BASE_URL not set; falling back to http://localhost:3002"
    );
  }

  const inviterName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") ||
    me.email ||
    "Your portal admin";

  const result = await sendInvestorInviteEmail({
    to: investor.email,
    inviterName,
    companyName: company?.name || "Investor Portal",
    joinUrl,
    expiresAt,
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "investor_invite_sent",
      entity: "Investor",
      entityId: id,
      message: `Sent portal invite to ${investor.email}`,
      meta: {
        inviteId: invite.id,
        delivery: result,
      },
    },
  });

  await prisma.investorCommunication.create({
    data: {
      investorId: id,
      loggedById: me.id,
      channel: "Email",
      subject: "Investor portal invite sent",
      body: `Invite link delivered via ${result.channel}: ${joinUrl}`,
      loggedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    joinUrl,
    expiresAt: expiresAt.toISOString(),
    delivery: result,
  });
}
