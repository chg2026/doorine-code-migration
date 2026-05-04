import { DocStatus } from "@prisma/client";
import { getCompanySettings } from "./companySettings";

export type EffectiveDocStatus = "active" | "expiring" | "expired" | "staged" | "archived" | "pending";

export function effectiveDocStatus(
  storedStatus: DocStatus | string,
  expiresAt: Date | null | undefined,
  expiryThresholdDays: number,
  now: Date = new Date()
): EffectiveDocStatus {
  if (storedStatus === "Staged") return "staged";
  if (storedStatus === "Archived") return "archived";
  if (storedStatus === "Pending") return "pending";
  if (storedStatus === "Expired") return "expired";
  if (!expiresAt) return "active";
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  const day = 86400 * 1000;
  if (diffMs < 0) return "expired";
  if (diffMs <= expiryThresholdDays * day) return "expiring";
  return "active";
}

export function statusClass(s: EffectiveDocStatus): string {
  switch (s) {
    case "active":   return "s-ok";
    case "expiring": return "s-warn";
    case "expired":  return "s-err";
    case "staged":   return "s-staged";
    case "pending":  return "s-warn";
    case "archived": return "s-staged";
  }
}

export function statusLabel(s: EffectiveDocStatus): string {
  switch (s) {
    case "active":   return "✓ Active";
    case "expiring": return "⏰ Expiring";
    case "expired":  return "✗ Expired";
    case "staged":   return "Pending review";
    case "pending":  return "Pending";
    case "archived": return "Archived";
  }
}

/**
 * Resolve the effective status of a document using the company's configured
 * `expiryAlertThresholdDays`. This is the single source of truth used by
 * Documents Hub, Rehab Manager, and any other module that displays document
 * compliance.
 */
export async function getEffectiveDocStatusForCompany(
  companyId: string,
  doc: { status: DocStatus | string; expiresAt: Date | null | undefined },
  now: Date = new Date()
): Promise<EffectiveDocStatus> {
  const s = await getCompanySettings(companyId);
  return effectiveDocStatus(doc.status, doc.expiresAt, s.expiryAlertThresholdDays, now);
}

export function formatDateET(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }) + " ET";
}
