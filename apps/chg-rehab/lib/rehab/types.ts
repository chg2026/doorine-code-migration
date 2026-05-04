import type {
  ChecklistStatus,
  DrawStatus,
  PhaseStatus,
  ContactType,
  Prisma,
} from "@prisma/client";

/**
 * Strongly-typed Prisma JSON metadata payloads used by the Rehab module. All
 * `meta` columns are stored as JSON, but the application writes them with a
 * fixed shape — these types make the shape explicit so callers don't need to
 * reach for `as any`.
 *
 * Use the parser helpers (`parseProjectMeta`, etc.) to read JSON cells
 * defensively — they return a fully-populated, defaulted object rather than
 * `unknown`.
 */

export type ProjectMeta = {
  mode: string;
  pmLed: boolean;
  statusLabel: string;
  lastUpdated: string | null;
  penaltyPerDiem: number;
  penaltyStatus: "Active" | "Paused" | "Resolved";
  penaltyAccrued: number;
  originalEndDate: string | null;
};

export const DEFAULT_PROJECT_META: ProjectMeta = {
  mode: "Contractor-Led",
  pmLed: false,
  statusLabel: "In Progress",
  lastUpdated: null,
  penaltyPerDiem: 0,
  penaltyStatus: "Active",
  penaltyAccrued: 0,
  originalEndDate: null,
};

export function parseProjectMeta(raw: Prisma.JsonValue | null | undefined): ProjectMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PROJECT_META };
  const r = raw as Record<string, unknown>;
  return {
    mode: typeof r.mode === "string" ? r.mode : DEFAULT_PROJECT_META.mode,
    pmLed: typeof r.pmLed === "boolean" ? r.pmLed : DEFAULT_PROJECT_META.pmLed,
    statusLabel: typeof r.statusLabel === "string" ? r.statusLabel : DEFAULT_PROJECT_META.statusLabel,
    lastUpdated: typeof r.lastUpdated === "string" ? r.lastUpdated : null,
    penaltyPerDiem: typeof r.penaltyPerDiem === "number" ? r.penaltyPerDiem : 0,
    penaltyStatus:
      r.penaltyStatus === "Active" || r.penaltyStatus === "Paused" || r.penaltyStatus === "Resolved"
        ? r.penaltyStatus
        : "Active",
    penaltyAccrued: typeof r.penaltyAccrued === "number" ? r.penaltyAccrued : 0,
    originalEndDate: typeof r.originalEndDate === "string" ? r.originalEndDate : null,
  };
}

export type ChecklistItemMeta = {
  requirement: string | null;
};

export function parseChecklistItemMeta(raw: Prisma.JsonValue | null | undefined): ChecklistItemMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { requirement: null };
  const r = raw as Record<string, unknown>;
  return { requirement: typeof r.requirement === "string" ? r.requirement : null };
}

export type DocumentMeta = {
  signed: boolean;
  signedAt: string | null;
  staged: boolean;
  issuedAt: string | null;
};

export function parseDocumentMeta(raw: Prisma.JsonValue | null | undefined): DocumentMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { signed: false, signedAt: null, staged: false, issuedAt: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    signed: typeof r.signed === "boolean" ? r.signed : false,
    signedAt: typeof r.signedAt === "string" ? r.signedAt : null,
    staged: typeof r.staged === "boolean" ? r.staged : false,
    issuedAt: typeof r.issuedAt === "string" ? r.issuedAt : null,
  };
}

export type ActivityMetaType =
  | "system"
  | "note"
  | "payment"
  | "document"
  | "task"
  | "flag"
  | "changeOrder";

export const ACTIVITY_TYPES: readonly ActivityMetaType[] = [
  "system",
  "note",
  "payment",
  "document",
  "task",
  "flag",
  "changeOrder",
];

export function isActivityMetaType(v: unknown): v is ActivityMetaType {
  return typeof v === "string" && (ACTIVITY_TYPES as readonly string[]).includes(v);
}

export type CoStatus = "pending" | "approved" | "rejected";

export type ActivityMeta = {
  type: ActivityMetaType;
  projectId: string | null;
  phaseId: string | null;
  phaseNumber: number | null;
  drawNumber: number | null;
  advisory: boolean;
  coStatus: CoStatus | null;
  coScope: string | null;
  coEstimate: string | null;
  coRejectionReason: string | null;
};

export function parseActivityMeta(raw: Prisma.JsonValue | null | undefined): ActivityMeta {
  const fallback: ActivityMeta = {
    type: "system",
    projectId: null,
    phaseId: null,
    phaseNumber: null,
    drawNumber: null,
    advisory: false,
    coStatus: null,
    coScope: null,
    coEstimate: null,
    coRejectionReason: null,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const r = raw as Record<string, unknown>;
  const rawCoStatus = r.coStatus;
  const coStatus: CoStatus | null =
    rawCoStatus === "pending" || rawCoStatus === "approved" || rawCoStatus === "rejected"
      ? rawCoStatus
      : null;
  return {
    type: isActivityMetaType(r.type) ? r.type : "system",
    projectId: typeof r.projectId === "string" ? r.projectId : null,
    phaseId: typeof r.phaseId === "string" ? r.phaseId : null,
    phaseNumber: typeof r.phaseNumber === "number" ? r.phaseNumber : null,
    drawNumber: typeof r.drawNumber === "number" ? r.drawNumber : null,
    advisory: typeof r.advisory === "boolean" ? r.advisory : false,
    coStatus,
    coScope: typeof r.scope === "string" ? r.scope : null,
    coEstimate: typeof r.estimate === "string" ? r.estimate : null,
    coRejectionReason: typeof r.coRejectionReason === "string" ? r.coRejectionReason : null,
  };
}

// ── Re-export the Prisma enums under stable names so client components don't
//    need to depend on the Prisma client package directly ───────────────────
export type ChecklistStatusValue = ChecklistStatus;
export type DrawStatusValue = DrawStatus;
export type PhaseStatusValue = PhaseStatus;
export type ContactTypeValue = ContactType;
