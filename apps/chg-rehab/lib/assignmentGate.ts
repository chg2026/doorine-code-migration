import { prisma } from "./prisma";
import { getCompanySettings } from "./companySettings";

/**
 * Centralised contractor-assignment gate driven by the Compliance panel
 * toggles in CompanySetting:
 *   - meta.w9Required
 *   - meta.coiRequired
 *   - meta.tradeLicenseRequired
 *   - blockAssignmentIfDocsMissing (column)
 *
 * Compliance lives on `ContractorComplianceDoc` (the canonical source for
 * COI / W-9 / Trade-license records). We evaluate which requirement is
 * missing or expired, then either:
 *   - throw AssignmentGateError (blocking mode)
 *   - return the warnings (warning mode) so callers can surface them
 *
 * If a doc type's requirement toggle is OFF, it is not enforced and never
 * appears in `missingRequired`.
 *
 * Trade-license is only enforced for Contractor / Subcontractor / Inspector
 * contact types (vendors and tenants don't carry trade licenses).
 */

export class AssignmentGateError extends Error {
  status = 412;
  reasons: string[];
  constructor(reasons: string[]) {
    super("Assignment blocked by compliance gate: " + reasons.join("; "));
    this.reasons = reasons;
  }
}

export type ComplianceRequirement = "w9" | "coi" | "license";

/**
 * Structured form of a single compliance gap. `requirement` is a stable key
 * the UI can use to deep-link straight to the upload control for that doc
 * type (see app/contacts/[id]). `message` is the same human-readable string
 * that appears in `missingRequired`. `expired` is true when the contractor
 * already has a doc on file but it has lapsed — the UI should route to the
 * Renew flow rather than the Add-new-doc flow.
 */
export type AssignmentWarning = {
  requirement: ComplianceRequirement;
  message: string;
  /** True when the doc exists but is expired; false/absent when it is missing entirely. */
  expired: boolean;
  /**
   * When `expired` is true, the ID of the specific doc that should be renewed.
   * Included so the UI deep-link can target a single row when multiple docs of
   * the same type exist (prevents stacked modals).
   */
  docId?: string;
};

export type AssignmentGateState = {
  blockingEnabled: boolean;
  requirements: Record<ComplianceRequirement, boolean>;
  missingRequired: string[];
  /**
   * Structured counterpart of `missingRequired` — same set of gaps tagged
   * with the requirement key so callers can render deep-links. Does not
   * include sentinel entries (e.g. "contact not found") that have no
   * matching requirement.
   */
  warnings: AssignmentWarning[];
  /** Whether assignment should be allowed given blocking mode + missing list. */
  allowed: boolean;
};

const COI_TYPES = new Set(["coi", "insurance", "general-liability", "gl"]);
const W9_TYPES = new Set(["w9", "w-9"]);
const LICENSE_TYPES = new Set([
  "license",
  "trade-license",
  "contractor-license",
]);

function isValid(d: { status: string; expiresAt: Date | null }): boolean {
  const s = (d.status || "").toLowerCase();
  if (s === "expired" || s === "archived" || s === "revoked") return false;
  if (d.expiresAt && d.expiresAt.getTime() < Date.now()) return false;
  return true;
}

function isPresent(d: { status: string }): boolean {
  const s = (d.status || "").toLowerCase();
  return s !== "archived" && s !== "revoked";
}

function readRequirements(
  meta: Record<string, unknown> | null | undefined
): Record<ComplianceRequirement, boolean> {
  const m = meta ?? {};
  const get = (k: string, def = true): boolean =>
    typeof m[k] === "boolean" ? (m[k] as boolean) : def;
  return {
    w9: get("w9Required"),
    coi: get("coiRequired"),
    // Admin UI uses "tradeLicenseRequired"; legacy seed used "licenseRequired".
    // Honour either.
    license:
      typeof m["tradeLicenseRequired"] === "boolean"
        ? (m["tradeLicenseRequired"] as boolean)
        : typeof m["licenseRequired"] === "boolean"
        ? (m["licenseRequired"] as boolean)
        : true,
  };
}

/**
 * Evaluate the compliance gate for a contact. Does not throw.
 * Returns structured state callers can use for either rejection or warnings.
 */
export async function evaluateAssignmentCompliance(
  companyId: string,
  contactId: string
): Promise<AssignmentGateState> {
  const settings = await getCompanySettings(companyId);
  const meta = (settings.meta as Record<string, unknown> | null) ?? {};
  const requirements = readRequirements(meta);
  const blockingEnabled = settings.blockAssignmentIfDocsMissing;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId },
    select: { type: true },
  });
  if (!contact) {
    return {
      blockingEnabled,
      requirements,
      missingRequired: ["contact not found"],
      warnings: [],
      allowed: false,
    };
  }

  const docs = await prisma.contractorComplianceDoc.findMany({
    where: { contactId },
    select: { id: true, type: true, status: true, expiresAt: true },
  });

  const findAny = (typeMatch: Set<string>) =>
    docs.filter((d) => typeMatch.has((d.type || "").toLowerCase()));

  /** Pick the doc the PM should renew: prefer one that expired most recently. */
  function bestExpiredDocId(
    matches: typeof docs
  ): string | undefined {
    const invalid = matches.filter((d) => !isValid(d));
    if (invalid.length === 0) return undefined;
    // Sort descending by expiresAt so the most-recently-expired doc comes first.
    // Docs with no expiresAt (status-only expiry) come last.
    const sorted = [...invalid].sort((a, b) => {
      if (!a.expiresAt && !b.expiresAt) return 0;
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return b.expiresAt.getTime() - a.expiresAt.getTime();
    });
    return sorted[0].id;
  }

  const warnings: AssignmentWarning[] = [];
  const push = (
    requirement: ComplianceRequirement,
    message: string,
    expired = false,
    docId?: string
  ) => {
    warnings.push({ requirement, message, expired, ...(docId ? { docId } : {}) });
  };

  if (requirements.coi) {
    const matches = findAny(COI_TYPES);
    if (matches.length === 0) push("coi", "COI missing");
    else if (!matches.some(isValid))
      push("coi", "COI expired", true, bestExpiredDocId(matches));
  }

  if (requirements.w9) {
    const matches = findAny(W9_TYPES);
    if (matches.length === 0 || !matches.some(isPresent))
      push("w9", "W-9 missing");
  }

  // Trade-license only applies to roles that carry one.
  const needsLicense =
    contact.type === "Contractor" ||
    contact.type === "Subcontractor" ||
    contact.type === "Inspector";
  if (requirements.license && needsLicense) {
    const matches = findAny(LICENSE_TYPES);
    if (matches.length === 0) push("license", "Trade license missing");
    else if (!matches.some(isValid))
      push("license", "Trade license expired", true, bestExpiredDocId(matches));
  }

  const reasons = warnings.map((w) => w.message);
  const allowed = blockingEnabled ? reasons.length === 0 : true;
  return {
    blockingEnabled,
    requirements,
    missingRequired: reasons,
    warnings,
    allowed,
  };
}

/**
 * Throws AssignmentGateError when blockAssignmentIfDocsMissing is on AND
 * any required, toggled-on doc type is missing/expired. No-op otherwise.
 */
export async function assertContractorAssignable(
  companyId: string,
  contactId: string
): Promise<AssignmentGateState> {
  const state = await evaluateAssignmentCompliance(companyId, contactId);
  if (!state.allowed) throw new AssignmentGateError(state.missingRequired);
  return state;
}
