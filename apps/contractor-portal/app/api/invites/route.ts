import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentContractor, publicOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  contactName: z.string().optional(),
  companyName: z.string().optional(),
  trade: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const c = await getCurrentContractor();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid" }, { status: 400 });
  const { email, contactName, companyName, trade } = parsed.data;

  const token = crypto.randomBytes(24).toString("base64url");
  const invite = await prisma.cpOnboardingInvite.create({
    data: {
      email: email.toLowerCase(),
      contactName: contactName || null,
      companyName: companyName || null,
      trade: trade || null,
      token,
      inviterAccountId: c.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const base = publicOrigin(req);
  const link = `${base}/signup?token=${token}`;

  await prisma.cpSentMessage.create({
    data: {
      channel: "email",
      toAddress: email,
      subject: `${c.companyName} invited you to the CHG Contractor Portal`,
      body: `Hi ${contactName || "there"},\n\n${c.companyName} invited you to join the CHG Contractor Portal — a free place to manage your jobs, quotes, and invoices.\n\nClaim your account here:\n${link}\n\nThis link expires in 14 days.`,
      meta: { inviteId: invite.id },
    },
  });

  return NextResponse.json({ ok: true, id: invite.id, link });
}
