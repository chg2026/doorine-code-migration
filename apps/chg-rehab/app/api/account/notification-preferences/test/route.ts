import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { NOTIFY_EVENT_KEYS, type NotifyEvent } from "@/lib/notifications/events";

export const dynamic = "force-dynamic";

const VALID_EVENTS = new Set<string>(NOTIFY_EVENT_KEYS);

const TEST_CONTENT: Record<NotifyEvent, { title: string; body: string }> = {
  drawApprovals: {
    title: "Test · Draw request approved",
    body: "Sample Draw #42 on Test Project has been approved. This is a test notification.",
  },
  docExpiry: {
    title: "Test · Document expiry alert",
    body: "Certificate of Insurance for Sample Contractor expires in 7 days. This is a test notification.",
  },
  allocations: {
    title: "Test · Warehouse allocation",
    body: "5 units of Sample Item have been allocated to Test Project. This is a test notification.",
  },
  missingUpdates: {
    title: "Test · Missing contractor update",
    body: "Sample Contractor has not submitted their weekly update. This is a test notification.",
  },
  exceptions: {
    title: "Test · Exception filed",
    body: "A checklist exception was filed on Test Project: Sample exception. This is a test notification.",
  },
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { event?: unknown };
  try {
    body = (await req.json()) as { event?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = body.event;
  if (typeof event !== "string" || !VALID_EVENTS.has(event)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const ev = event as NotifyEvent;
  const content = TEST_CONTENT[ev];

  const result = await dispatchNotification({
    companyId: user.companyId,
    event: ev,
    userIds: [user.id],
    title: content.title,
    body: content.body,
    urgent: true,
  });

  if (result.skipped.event) {
    return NextResponse.json({
      sent: false,
      reason: "Both email and in-app are turned off for this event company-wide. Ask your admin to enable at least one channel.",
    });
  }

  const channels: string[] = [];
  if (result.inAppCreated > 0) channels.push("in-app");
  if (result.emailsSent > 0 || result.emailsQueued > 0) channels.push("email");

  if (channels.length === 0) {
    return NextResponse.json({
      sent: false,
      reason: "Both channels are muted for you on this event. Enable email or in-app to receive notifications.",
    });
  }

  return NextResponse.json({ sent: true, channels });
}
