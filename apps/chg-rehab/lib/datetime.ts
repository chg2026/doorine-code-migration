/**
 * Eastern Time helpers. All timestamps are stored in UTC; these helpers format
 * them as ET (America/New_York) the way the prototype displays them
 * (e.g., "Mar 5, 2026 · 10:22 AM ET").
 */
const ET_TZ = "America/New_York";

export function formatET(d: Date | string | null | undefined, includeTime = true): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  if (!includeTime) return datePart;

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${datePart} · ${timePart} ET`;
}

export function nowET(): Date {
  return new Date();
}
