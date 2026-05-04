/**
 * Valid lease status values accepted everywhere in the app.
 */
export const VALID_LEASE_STATUSES = [
  "Active",
  "Expired",
  "Terminated",
  "Pending",
] as const;

export type LeaseStatus = (typeof VALID_LEASE_STATUSES)[number];

/**
 * Best-effort mapping from legacy / free-text status strings to the canonical
 * enum values.  The map is intentionally conservative — only well-known
 * synonyms are mapped; anything truly unrecognised falls back to "Expired"
 * (the safest neutral value for an old, unknown lease).
 */
const STATUS_MAP: Record<string, LeaseStatus> = {
  // already-valid values (identity)
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
  pending: "Pending",

  // legacy / common alternatives
  ended: "Expired",
  finished: "Expired",
  complete: "Expired",
  completed: "Expired",
  closed: "Expired",
  lapsed: "Expired",

  cancelled: "Terminated",
  canceled: "Terminated",
  cancelled_by_tenant: "Terminated",
  voided: "Terminated",
  void: "Terminated",
  broken: "Terminated",

  draft: "Pending",
  inactive: "Pending",
  new: "Pending",
  upcoming: "Pending",
};

const FALLBACK: LeaseStatus = "Expired";

/**
 * Normalise an arbitrary status string to one of the four canonical values.
 *
 * @returns `{ normalised, changed }` — `changed` is `true` when the input was
 *   not already canonical and was remapped (useful for audit logging).
 */
export function normaliseLeaseStatus(raw: string | null | undefined): {
  normalised: LeaseStatus;
  changed: boolean;
} {
  if (!raw) {
    return { normalised: FALLBACK, changed: true };
  }

  const trimmed = raw.trim();

  // If it's already a valid canonical value, return as-is.
  if ((VALID_LEASE_STATUSES as readonly string[]).includes(trimmed)) {
    return { normalised: trimmed as LeaseStatus, changed: false };
  }

  // Try the synonyms map (case-insensitive).
  const mapped = STATUS_MAP[trimmed.toLowerCase().replace(/\s+/g, "_")];
  if (mapped) {
    return { normalised: mapped, changed: true };
  }

  // Unknown value — fall back to Expired and flag it as changed.
  return { normalised: FALLBACK, changed: true };
}
