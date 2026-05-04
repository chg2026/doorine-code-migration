import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const n = await prisma.notification.findFirst({
    where: { id, userId: user.id, channel: "inApp" },
    select: { id: true },
  });
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.notification.update({
    where: { id: n.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
