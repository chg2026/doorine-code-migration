import { prisma } from "./prisma";
import { evaluateAssignmentCompliance } from "./assignmentGate";

export type Action = "view" | "edit" | "approve" | "admin" | "assign";

type LabelRoles = {
  pm: string;
  gc: string;
  sub: string;
  inspector: string;
  adminLock: boolean;
  locked: boolean;
};

// feature/action → PermissionLabelRow.label mapping. Anything not mapped here
// will fall back to the legacy PermissionMatrixRow table (so already-shipped
// features keep working until they migrate). Keep keys lower-snake-ish to match
// existing call sites.
const FEATURE_ACTION_TO_LABEL: Record<string, string> = {
  "documents:view": "View documents",
  "documents:edit": "Upload documents",
  "documents:delete": "Delete documents",
  "documents:promote": "Create document categories",
  "warehouse:view": "View warehouse",
  "warehouse:edit": "Add items to warehouse",
  "warehouse:admin": "Manage warehouse templates",
  "projects:view": "View projects",
  "projects:edit": "Edit projects & SOW",
  "sow:edit": "Add/edit SOW line items",
  "draws:approve": "Approve draw payments",
  "checklist:view": "View checklist",
  "checklist:edit": "Verify checklist items",
  "exception:edit": "File exception",
  "activity:view": "View activity log",
  "team:edit": "Add team members",
  "admin:edit": "Change admin settings",
};

const ROLE_KEY: Record<string, "pm" | "gc" | "sub" | "inspector" | null> = {
  ProjectManager: "pm",
  PM: "pm",
  GeneralContractor: "gc",
  GC: "gc",
  Contractor: "gc",
  Subcontractor: "sub",
  Sub: "sub",
  Inspector: "inspector",
};

type Cached = {
  ts: number;
  labels: Map<string, LabelRoles>;
  legacy: Record<string, Record<string, string[]>>;
};
const memo = new Map<string, Cached>();
const TTL_MS = 30_000;

async function load(companyId: string): Promise<Cached> {
  const cached = memo.get(companyId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached;

  const [labelRows, legacyRows] = await Promise.all([
    prisma.permissionLabelRow.findMany({ where: { companyId } }),
    prisma.permissionMatrixRow.findMany({ where: { companyId } }),
  ]);

  const labels = new Map<string, LabelRoles>();
  for (const r of labelRows) {
    labels.set(r.label, {
      pm: r.pm,
      gc: r.gc,
      sub: r.sub,
      inspector: r.inspector,
      adminLock: r.adminLock,
      locked: r.locked,
    });
  }

  const legacy: Record<string, Record<string, string[]>> = {};
  for (const r of legacyRows) {
    legacy[r.feature] ??= {};
    const roles = (r.roles as Record<string, boolean>) || {};
    legacy[r.feature][r.action] = Object.entries(roles)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  }

  const c = { ts: Date.now(), labels, legacy };
  memo.set(companyId, c);
  return c;
}

function actionRank(a: string): number {
  if (a === "edit") return 2;
  if (a === "view") return 1;
  return 0;
}

export async function can(
  user: { role: string; companyId: string } | null | undefined,
  feature: string,
  action: Action = "view"
): Promise<boolean> {
  if (!user) return false;
  if (user.role === "Admin") return true;

  const cache = await load(user.companyId);

  // Prefer label-row mapping (the source of truth edited in /admin)
  const label = FEATURE_ACTION_TO_LABEL[`${feature}:${action}`];
  if (label) {
    const row = cache.labels.get(label);
    if (row) {
      if (row.locked || row.adminLock) return false;
      const roleKey = ROLE_KEY[user.role];
      if (!roleKey) return false;
      const granted = row[roleKey];
      // "edit" implies "view" — promote view requests when granted edit elsewhere
      const need = actionRank(action === "approve" || action === "admin" ? "edit" : action);
      const have = actionRank(granted);
      return have >= need;
    }
  }

  // Fallback to legacy matrix
  const allowedRoles = cache.legacy[feature]?.[action] || [];
  return allowedRoles.includes(user.role);
}

export function invalidatePermissionsCache(companyId: string) {
  memo.delete(companyId);
}

// ── Compliance: contractor assignment gating ──────────────────────────────
export type ComplianceState = {
  insurance: { present: boolean; expired: boolean; expiringSoon: boolean; expiresAt: Date | null };
  w9:        { present: boolean };
  license:   { present: boolean; expired: boolean; expiringSoon: boolean; expiresAt: Date | null };
  missingRequired: string[]; // human-readable list of missing/expired requirements
};

const SOON_DAYS = 14;

function classify(doc: { expiresAt: Date | null; status: string } | undefined) {
  if (!doc) return { present: false, expired: false, expiringSoon: false, expiresAt: null };
  const expiresAt = doc.expiresAt ?? null;
  const now = Date.now();
  const isExpiredFlag = doc.status === "Expired";
  const isExpiredByDate = expiresAt ? expiresAt.getTime() < now : false;
  const expired = isExpiredFlag || isExpiredByDate;
  const expiringSoon =
    !expired &&
    (doc.status === "Expiring" ||
      (expiresAt ? expiresAt.getTime() - now < SOON_DAYS * 24 * 60 * 60 * 1000 : false));
  return { present: true, expired, expiringSoon, expiresAt };
}

/**
 * Returns the structural compliance state for a contact (presence + expiry of
 * each tracked doc type), plus a `missingRequired` list that respects the
 * company's compliance toggles (W-9 / COI / Trade-license required).
 */
export async function getContractorCompliance(
  contactId: string,
  companyId?: string
): Promise<ComplianceState> {
  const docs = await prisma.contractorComplianceDoc.findMany({ where: { contactId } });
  const ins = docs.find((d) => d.type === "insurance");
  const w9 = docs.find((d) => d.type === "w9");
  const lic = docs.find((d) => d.type === "license");

  const insurance = classify(ins);
  const w9State = { present: !!w9 };
  const license = classify(lic);

  let missingRequired: string[] = [];
  if (companyId) {
    const state = await evaluateAssignmentCompliance(companyId, contactId);
    missingRequired = state.missingRequired;
  } else {
    if (!insurance.present) missingRequired.push("COI missing");
    else if (insurance.expired) missingRequired.push("COI expired");
    if (!w9State.present) missingRequired.push("W-9 missing");
    if (!license.present) missingRequired.push("License missing");
    else if (license.expired) missingRequired.push("License expired");
  }

  return { insurance, w9: w9State, license, missingRequired };
}

/**
 * Returns whether a given contact can be assigned to a project.
 * Delegates to the shared assignment-gate evaluator so the behaviour is
 * identical to what the API route enforces.
 */
export async function canAssign(
  companyId: string,
  contactId: string
): Promise<{ allowed: boolean; reasons: string[]; blockingEnabled: boolean }> {
  const state = await evaluateAssignmentCompliance(companyId, contactId);
  return {
    allowed: state.allowed,
    reasons: state.missingRequired,
    blockingEnabled: state.blockingEnabled,
  };
}
