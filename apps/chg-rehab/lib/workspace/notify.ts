import { prisma } from "@/lib/prisma";

/**
 * Workspace in-app notification helper. Writes directly to the existing
 * `Notification` table with `channel="inApp"` so the existing NotificationBell
 * surfaces workspace events without any UI changes.
 *
 * Event identifiers are namespaced under `workspace.*`.
 */
export type WorkspaceEvent =
  | "workspace.task.assigned"
  | "workspace.task.completed"
  | "workspace.message"
  | "workspace.document.expiring";

export async function enqueueWorkspaceInApp(args: {
  companyId: string;
  userId: string;
  event: WorkspaceEvent;
  title: string;
  body?: string | null;
  link?: string | null;
  urgent?: boolean;
  dedupeKey?: string | null;
}): Promise<void> {
  const { companyId, userId, event, title, body, link, urgent, dedupeKey } = args;
  const key = dedupeKey ?? `${event}:${Date.now()}:${Math.random()}`;
  try {
    await prisma.notification.upsert({
      where: { userId_channel_dedupeKey: { userId, channel: "inApp", dedupeKey: key } },
      update: {},
      create: {
        companyId,
        userId,
        event,
        channel: "inApp",
        title,
        body: body ?? null,
        link: link ?? null,
        urgent: urgent ?? false,
        status: "Sent",
        sentAt: new Date(),
        dedupeKey: key,
      },
    });
  } catch {
    /* best-effort — never block the caller */
  }
}
