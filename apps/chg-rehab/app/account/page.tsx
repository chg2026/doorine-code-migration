import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanySettings } from "@/lib/companySettings";
import {
  NOTIFY_EVENT_KEYS,
  type EventChannels,
  type NotifyEvent,
} from "@/lib/notifications/events";
import AccountClient, {
  type CompanyDefaults,
  type EventOverride,
  type QuietOverride,
} from "./Client";

export const dynamic = "force-dynamic";

function readCompanyChannels(meta: unknown): Record<NotifyEvent, EventChannels> {
  const root = (meta && typeof meta === "object"
    ? (meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const events = (root.notifyEvents as Record<string, unknown> | undefined) ?? {};
  const out = {} as Record<NotifyEvent, EventChannels>;
  for (const key of NOTIFY_EVENT_KEYS) {
    const node = (events?.[key] ?? {}) as Record<string, unknown>;
    const legacyKey = "notify" + key[0].toUpperCase() + key.slice(1);
    const legacy = root[legacyKey];
    const def = typeof legacy === "boolean" ? legacy : true;
    out[key] = {
      email: typeof node.email === "boolean" ? (node.email as boolean) : def,
      inApp: typeof node.inApp === "boolean" ? (node.inApp as boolean) : def,
    };
  }
  return out;
}

function readCompanyQuietHours(meta: unknown): { start: string; end: string } {
  const m = (meta && typeof meta === "object"
    ? (meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  return {
    start: typeof m.notifyQuietStart === "string" ? m.notifyQuietStart : "20:00",
    end: typeof m.notifyQuietEnd === "string" ? m.notifyQuietEnd : "07:00",
  };
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/login");

  const [settings, prefs, dbUser] = await Promise.all([
    getCompanySettings(user.companyId),
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

  const companyChannels = readCompanyChannels(settings.meta);
  const companyQuiet = readCompanyQuietHours(settings.meta);

  const companyDefaults: CompanyDefaults = {
    channels: companyChannels,
    quiet: companyQuiet,
  };

  const overrideMap = new Map(prefs.map((p) => [p.event, p]));
  const initialOverrides: Partial<Record<NotifyEvent, EventOverride>> = {};
  for (const ev of NOTIFY_EVENT_KEYS) {
    const row = overrideMap.get(ev);
    initialOverrides[ev] = row
      ? { override: true, email: row.email, inApp: row.inApp }
      : { override: false, email: companyChannels[ev].email, inApp: companyChannels[ev].inApp };
  }

  const initialQuiet: QuietOverride = {
    override: dbUser?.notifyQuietOverride ?? false,
    start: dbUser?.notifyQuietStart ?? companyQuiet.start,
    end: dbUser?.notifyQuietEnd ?? companyQuiet.end,
  };

  return (
    <AccountClient
      userName={
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email ||
        "Your account"
      }
      userEmail={user.email ?? null}
      role={user.role}
      companyDefaults={companyDefaults}
      initialOverrides={initialOverrides}
      initialQuiet={initialQuiet}
    />
  );
}
