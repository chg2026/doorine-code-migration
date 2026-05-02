import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runNotificationSweep } from "@/lib/notifications/sweep";

/**
 * GET /api/notifications
 *
 * Returns the recent in-app notifications for the current user (newest first,
 * up to 50) plus an `unreadCount`. Also kicks off a fire-and-forget
 * notification sweep, throttled to ~5 min per company, as a backstop in case
 * the scheduled cron at `/api/cron/notifications-sweep` is misconfigured.
 * The scheduled job is the primary trigger so delivery does not depend on
 * traffic.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Backstop sweep (throttled internally to ~5 min/company). The scheduled
  // cron is the primary trigger; this only runs if a user happens to open the
  // bell in between scheduled invocations.
  runNotificationSweep(user.companyId).catch(() => undefined);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, channel: "inApp" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: user.id, channel: "inApp", readAt: null },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    items: items.map((n) => ({
      id: n.id,
      event: n.event,
      title: n.title,
      body: n.body,
      link: n.link,
      meta: n.meta,
      urgent: n.urgent,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
