import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await prisma.notification.updateMany({
    where: { userId: user.id, channel: "inApp", readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updated: res.count });
}
