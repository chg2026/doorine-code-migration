import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ch = await prisma.wsChannel.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!ch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.wsChannelMember.upsert({
    where: { channelId_userId: { channelId: id, userId: user.id } },
    update: { lastReadAt: new Date() },
    create: { channelId: id, userId: user.id, lastReadAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
