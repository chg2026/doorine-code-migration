import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { invalidateCompanySettingsCache } from "@/lib/companySettings";
import {
  STALE_THRESHOLD_BOUNDS_MS,
  STALE_THROTTLE_BOUNDS_MS,
  VALID_RECAP_WEEKDAYS,
} from "@/lib/notifications/sweep";

const ALLOWED_KEYS = new Set([
  "strictPaymentGate",
  "blockAssignmentIfDocsMissing",
  "expiryAlertThresholdDays",
  "projectIdPrefix",
  "defaultProjectMode",
  "timezone",
  "dateFormat",
  "warehouseLowStockThreshold",
  "contractorPortalEnabled",
  "meta",
]);

/**
 * Per-meta-key numeric bounds. The settings UI auto-saves on every keystroke,
 * so any meta key listed here is validated server-side before the row is
 * written. A value outside the bounds aborts the PATCH with a 400 so admins
 * can't silently store an unusable threshold (and so the sweep watchdog never
 * has to defend against them).
 */
const META_NUMERIC_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  notifyStaleAlertThresholdMs: {
    ...STALE_THRESHOLD_BOUNDS_MS,
    label: "Stale alert threshold",
  },
  notifyStaleAlertThrottleMs: {
    ...STALE_THROTTLE_BOUNDS_MS,
    label: "Quiet period between stale alerts",
  },
};

function validateMeta(meta: unknown): { ok: true } | { ok: false; error: string } {
  if (meta == null) return { ok: true };
  if (typeof meta !== "object" || Array.isArray(meta)) {
    return { ok: false, error: "meta must be an object" };
  }
  const m = meta as Record<string, unknown>;
  for (const [key, bounds] of Object.entries(META_NUMERIC_BOUNDS)) {
    if (!(key in m)) continue;
    const raw = m[key];
    // Allow null / undefined to mean "clear the override and fall back to the
    // global default". Anything else must be a finite number inside the
    // declared bounds.
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, error: `${bounds.label} must be a number` };
    }
    if (raw < bounds.min || raw > bounds.max) {
      return {
        ok: false,
        error: `${bounds.label} must be between ${bounds.min} and ${bounds.max} ms`,
      };
    }
  }
  if ("notifyWeeklyAlertRecapWeekday" in m) {
    const raw = m.notifyWeeklyAlertRecapWeekday;
    if (raw !== null && raw !== undefined) {
      if (
        typeof raw !== "string" ||
        !(VALID_RECAP_WEEKDAYS as readonly string[]).includes(raw)
      ) {
        return {
          ok: false,
          error: `Weekly recap weekday must be one of: ${VALID_RECAP_WEEKDAYS.join(", ")}`,
        };
      }
    }
  }
  return { ok: true };
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    data[k] = v;
  }
  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  if ("meta" in data) {
    const check = validateMeta(data.meta);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
  }

  const settings = await prisma.companySetting.upsert({
    where: { companyId: user.companyId },
    update: data,
    create: { companyId: user.companyId, ...data },
  });

  invalidateCompanySettingsCache(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "admin_settings_updated",
      entity: "CompanySetting",
      entityId: settings.id,
      meta: { keys: Object.keys(data) },
    },
  });

  return NextResponse.json({ ok: true });
}
