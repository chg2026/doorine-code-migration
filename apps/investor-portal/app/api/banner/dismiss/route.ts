import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Persist that the investor dismissed a portal banner (capital call,
 * unread K-1, etc). We store an ISO timestamp keyed by `bannerKey` on
 * `Investor.bannerDismissedAt` (Json) so dismissals survive across sessions
 * AND can be invalidated by re-issuing a newer event (the page compares
 * the dismissed-at against the event's createdAt).
 *
 * Body: { key: string }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentInvestor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key || key.length > 200)
    return NextResponse.json({ error: "invalid key" }, { status: 400 });

  const investor = await prisma.investor.findUnique({
    where: { id: me.id },
    select: { bannerDismissedAt: true },
  });
  const current =
    (investor?.bannerDismissedAt as Record<string, string> | null) || {};
  const next = { ...current, [key]: new Date().toISOString() };

  await prisma.investor.update({
    where: { id: me.id },
    data: { bannerDismissedAt: next },
  });

  return NextResponse.json({ ok: true });
}
