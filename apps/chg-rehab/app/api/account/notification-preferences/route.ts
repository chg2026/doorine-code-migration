import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFY_EVENT_KEYS, type NotifyEvent } from "@/lib/notifications/events";

export const dynamic = "force-dynamic";

const VALID_EVENTS = new Set<string>(NOTIFY_EVENT_KEYS);

type ChannelOverride = { email: boolean; inApp: boolean };

type PutBody = {
  events?: Partial<Record<NotifyEvent, ChannelOverride | null>>;
  quietHours?: {
    override?: boolean;
    start?: string | null;
    end?: string | null;
  } | null;
};

function parseHHMM(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [prefs, dbUser] = await Promise.all([
    prisma.userNotificationPreference.findMany({
      where: { userId: user.id },
      select: { event: true, email: true, inApp: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        notifyQuietOverride: true,
        notifyQuietStart: true,
        notifyQuietEnd: true,
      },
    }),
  ]);

  return NextResponse.json({
    events: prefs,
    quietHours: {
      override: dbUser?.notifyQuietOverride ?? false,
      start: dbUser?.notifyQuietStart ?? null,
      end: dbUser?.notifyQuietEnd ?? null,
    },
  });
}

/**
 * Replace the caller's notification preferences. The body shape lets a single
 * request both clear individual event overrides (by passing `null`) and
 * update quiet-hours overrides in one round-trip.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Per-event channel overrides ----------------------------------------------
  const eventEntries = Object.entries(body.events ?? {});
  for (const [event] of eventEntries) {
    if (!VALID_EVENTS.has(event)) {
      return NextResponse.json({ error: `unknown_event:${event}` }, { status: 400 });
    }
  }

  // Validate quiet-hour times before opening the transaction so we can return
  // a clean 400 instead of bubbling a transaction error.
  let quietStart: string | null | undefined;
  let quietEnd: string | null | undefined;
  if (body.quietHours && body.quietHours !== null) {
    if (body.quietHours.start !== undefined) {
      quietStart = body.quietHours.start === null ? null : parseHHMM(body.quietHours.start);
      if (body.quietHours.start !== null && quietStart === null) {
        return NextResponse.json({ error: "invalid_time_format" }, { status: 400 });
      }
    }
    if (body.quietHours.end !== undefined) {
      quietEnd = body.quietHours.end === null ? null : parseHHMM(body.quietHours.end);
      if (body.quietHours.end !== null && quietEnd === null) {
        return NextResponse.json({ error: "invalid_time_format" }, { status: 400 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [event, value] of eventEntries) {
      if (value === null) {
        await tx.userNotificationPreference.deleteMany({
          where: { userId: user.id, event },
        });
        continue;
      }
      const email = typeof value?.email === "boolean" ? value.email : true;
      const inApp = typeof value?.inApp === "boolean" ? value.inApp : true;
      await tx.userNotificationPreference.upsert({
        where: { userId_event: { userId: user.id, event } },
        update: { email, inApp },
        create: { userId: user.id, event, email, inApp },
      });
    }

    if (body.quietHours !== undefined) {
      if (body.quietHours === null) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            notifyQuietOverride: false,
            notifyQuietStart: null,
            notifyQuietEnd: null,
          },
        });
      } else {
        const data: {
          notifyQuietOverride?: boolean;
          notifyQuietStart?: string | null;
          notifyQuietEnd?: string | null;
        } = {};
        if (typeof body.quietHours.override === "boolean") {
          data.notifyQuietOverride = body.quietHours.override;
        }
        if (body.quietHours.start !== undefined) data.notifyQuietStart = quietStart ?? null;
        if (body.quietHours.end !== undefined) data.notifyQuietEnd = quietEnd ?? null;
        if (Object.keys(data).length > 0) {
          await tx.user.update({ where: { id: user.id }, data });
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
