import { prisma } from "../prisma";
import { computeGate, type PhaseGateState } from "../paymentGate";
import {
  type Project,
  type Phase,
  type ChecklistItem,
  type Draw,
  type SOWSection,
  type SOWLineItem,
  type ProjectAddendum,
  type ProjectAssignment,
  type Document,
  type ContractorComplianceDoc,
  type Contact,
  type CompanySetting,
  type ActivityLogEntry,
  type User,
} from "@prisma/client";

export type FullProject = Project & {
  property: { code: string; address: string; city: string | null; state: string | null };
  phases: Array<
    Phase & {
      checklistItems: ChecklistItem[];
      draws: Draw[];
    }
  >;
  draws: Draw[];
  sowSections: Array<SOWSection & { lineItems: SOWLineItem[] }>;
  addenda: ProjectAddendum[];
  assignments: Array<ProjectAssignment & { user: User }>;
  documents: Document[];
};

export async function loadProjectByCode(companyId: string, code: string): Promise<FullProject | null> {
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId, code } },
    include: {
      property: { select: { code: true, address: true, city: true, state: true } },
      phases: {
        orderBy: { number: "asc" },
        include: {
          checklistItems: { orderBy: { createdAt: "asc" } },
          draws: { orderBy: { number: "asc" } },
        },
      },
      draws: { orderBy: { number: "asc" } },
      sowSections: {
        orderBy: { order: "asc" },
        include: { lineItems: { orderBy: { description: "asc" } } },
      },
      addenda: { orderBy: { createdAt: "asc" } },
      assignments: { include: { user: true } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  return project as FullProject | null;
}

export async function loadCompanySettings(companyId: string): Promise<CompanySetting | null> {
  return prisma.companySetting.findUnique({ where: { companyId } });
}

export function gatesForProject(project: FullProject): PhaseGateState[] {
  return project.phases.map((p) =>
    computeGate(p, p.checklistItems, p.draws[0] ?? null)
  );
}

export type ContractorComplianceWithContact = ContractorComplianceDoc & {
  contact: Contact;
  /** Computed dynamically from threshold. */
  computedStatus: "Active" | "Expiring" | "Expired";
  daysUntilExpiry: number | null;
};

export async function loadProjectComplianceDocs(
  project: FullProject,
  thresholdDays: number,
  asOf: Date = new Date()
): Promise<ContractorComplianceWithContact[]> {
  // Documents tab contract: contractor compliance is sourced only from the
  // *assigned* contractors on this project. Contacts is the source of truth —
  // we render references with deep links into the Contacts profile.
  const assignedUserIds = project.assignments.map((a) => a.userId);
  if (assignedUserIds.length === 0) return [];
  const assignedUsers = await prisma.user.findMany({
    where: { id: { in: assignedUserIds } },
    select: { email: true, firstName: true, lastName: true },
  });
  const lookupKeys = new Set<string>();
  for (const u of assignedUsers) {
    if (u.email) lookupKeys.add(u.email.toLowerCase());
    const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    if (fullName) lookupKeys.add(fullName.toLowerCase());
  }
  if (lookupKeys.size === 0) return [];
  const candidates = await prisma.contact.findMany({
    where: {
      companyId: project.companyId,
      type: "Contractor",
      OR: [
        { email: { in: assignedUsers.map((u) => u.email).filter((e): e is string => !!e) } },
        { name: { in: assignedUsers.map((u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()).filter((n) => !!n) } },
      ],
    },
    include: { complianceDocs: true },
  });
  // De-dupe contacts (a contractor may match by both email and name)
  const contactMap = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    if (
      (c.email && lookupKeys.has(c.email.toLowerCase())) ||
      lookupKeys.has(c.name.toLowerCase())
    ) {
      contactMap.set(c.id, c);
    }
  }
  const contacts = Array.from(contactMap.values());

  const out: ContractorComplianceWithContact[] = [];
  for (const c of contacts) {
    for (const d of c.complianceDocs) {
      let computedStatus: "Active" | "Expiring" | "Expired" = "Active";
      let daysUntilExpiry: number | null = null;
      if (d.expiresAt) {
        const ms = d.expiresAt.getTime() - asOf.getTime();
        daysUntilExpiry = Math.floor(ms / 86_400_000);
        if (daysUntilExpiry < 0) computedStatus = "Expired";
        else if (daysUntilExpiry < thresholdDays) computedStatus = "Expiring";
      }
      out.push({ ...d, contact: c, computedStatus, daysUntilExpiry });
    }
  }
  return out;
}

export async function loadProjectActivity(
  companyId: string,
  limit = 100
): Promise<Array<ActivityLogEntry & { actor: User | null }>> {
  return prisma.activityLogEntry.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: true },
  });
}

/**
 * Returns the set of Contact IDs for contractors assigned to the given project.
 * Uses the ContractorAssignment table as the source of truth.
 * Used to surface contractor compliance events in the project activity feed.
 */
export async function loadAssignedContactIds(project: FullProject): Promise<Set<string>> {
  const rows = await prisma.contractorAssignment.findMany({
    where: {
      projectId: project.id,
      companyId: project.companyId,
      status: "Active",
    },
    select: { contactId: true },
  });
  return new Set(rows.map((r) => r.contactId));
}
