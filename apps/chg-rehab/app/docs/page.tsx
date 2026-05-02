import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/companySettings";
import { can } from "@/lib/permissions";
import { effectiveDocStatus } from "@/lib/docStatus";
import { evaluateAssignmentCompliance } from "@/lib/assignmentGate";
import DocsClient from "./Client";

export const dynamic = "force-dynamic";

type Level = "Project" | "Property" | "Company" | "Contact";
const LEVEL_VALUES: Level[] = ["Project", "Property", "Company", "Contact"];
const STATUS_VALUES = ["all-status", "active", "expiring", "expired", "staged"] as const;
const CATEGORY_VALUES = [
  "cat-all",
  "contracts",
  "insurance-coi",
  "permits",
  "financials",
  "misc-admin",
] as const;

function normalizeCategory(raw: string): string {
  const c = (raw || "").toLowerCase();
  if (["contract", "contracts", "sow", "msa"].includes(c)) return "contracts";
  if (["insurance", "insurance-coi", "coi", "license", "w9", "w-9"].includes(c))
    return "insurance-coi";
  if (["permit", "permits", "inspection"].includes(c)) return "permits";
  if (["draw", "invoice", "tax", "banking", "financial", "financials"].includes(c))
    return "financials";
  return "misc-admin";
}

export default async function DocsPage(props: {
  searchParams: Promise<{ level?: string; status?: string; cat?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/login");
  if (!(await can(user, "documents", "view"))) redirect("/");

  const sp = await props.searchParams;
  const level: Level = (LEVEL_VALUES as string[]).includes(sp.level ?? "")
    ? (sp.level as Level)
    : "Project";
  const status = (STATUS_VALUES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUS_VALUES)[number])
    : "all-status";
  const cat = (CATEGORY_VALUES as readonly string[]).includes(sp.cat ?? "")
    ? (sp.cat as (typeof CATEGORY_VALUES)[number])
    : "cat-all";
  const q = (sp.q ?? "").trim();

  const [docs, settings, projects, properties, contacts, canEdit] = await Promise.all([
    prisma.document.findMany({
      where: { companyId: user.companyId },
      orderBy: { uploadedAt: "desc" },
      include: {
        project: { select: { code: true, name: true } },
        property: { select: { code: true, address: true } },
      },
    }),
    getCompanySettings(user.companyId),
    prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.property.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, address: true },
      orderBy: { code: "asc" },
    }),
    prisma.contact.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    can(user, "documents", "edit"),
  ]);

  const contactLookup = new Map(contacts.map((c) => [c.id, c.name]));
  const threshold = settings.expiryAlertThresholdDays;

  const annotated = docs.map((d) => {
    const eff = effectiveDocStatus(d.status, d.expiresAt, threshold);
    const meta =
      ((d.meta as { description?: string } | null)?.description) ||
      [
        d.project ? d.project.code : null,
        d.property ? d.property.code : null,
        d.contactId ? contactLookup.get(d.contactId) : null,
      ]
        .filter(Boolean)
        .join(" · ") ||
      "";
    return {
      id: d.id,
      name: d.name,
      level: d.level as Level,
      category: normalizeCategory(d.category),
      status: d.status,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
      uploadedAt: d.uploadedAt.toISOString(),
      fileKey: d.fileKey ?? null,
      meta,
      projectId: d.projectId,
      propertyId: d.propertyId,
      contactId: d.contactId,
      eff,
      requiredMissing: false as boolean,
    };
  });

  // ── Required-but-missing synthetic rows (Contact level) ────────────────
  // For every contractor-type contact, compute which compliance docs the
  // company requires (per the toggles in the Compliance panel) but the
  // contact lacks. We surface each missing requirement as a synthetic
  // "Required — missing" entry in the Contact-level list so PMs can see
  // exactly what is outstanding without leaving the Documents Hub.
  const contractorContacts = await prisma.contact.findMany({
    where: {
      companyId: user.companyId,
      type: { in: ["Contractor", "Subcontractor", "Inspector"] },
    },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  const REASON_TO_TYPE: Record<string, { name: string; category: string }> = {
    "COI missing":            { name: "Certificate of Insurance", category: "insurance-coi" },
    "COI expired":            { name: "Certificate of Insurance", category: "insurance-coi" },
    "W-9 missing":            { name: "W-9",                       category: "insurance-coi" },
    "Trade license missing":  { name: "Trade license",             category: "permits" },
    "Trade license expired":  { name: "Trade license",             category: "permits" },
  };

  type AnnotatedDoc = (typeof annotated)[number];
  const requiredRows: AnnotatedDoc[] = [];
  for (const c of contractorContacts) {
    const state = await evaluateAssignmentCompliance(user.companyId, c.id);
    for (const reason of state.missingRequired) {
      const cfg = REASON_TO_TYPE[reason];
      if (!cfg) continue;
      const isExpired = reason.endsWith("expired");
      requiredRows.push({
        id: `req:${c.id}:${reason}`,
        name: `${cfg.name} — Required`,
        level: "Contact" as Level,
        category: cfg.category,
        status: "Pending",
        expiresAt: null,
        uploadedAt: new Date(0).toISOString(),
        fileKey: null,
        meta: `${c.name} · ${reason}`,
        projectId: null,
        propertyId: null,
        contactId: c.id,
        eff: isExpired ? "expired" : "pending",
        requiredMissing: true,
      });
    }
  }
  // Required rows surface at the top of the Contact level.
  annotated.unshift(...requiredRows);

  // Counts (always derived from the *unfiltered* set so the left-nav reflects
  // what is available, not what is currently selected).
  const levelCounts: Record<Level, number> = {
    Project: 0,
    Property: 0,
    Company: 0,
    Contact: 0,
  };
  for (const d of annotated) levelCounts[d.level]++;

  const atLevel = annotated.filter((d) => d.level === level);
  const statusCounts: Record<string, number> = {
    "all-status": atLevel.length,
    active: 0,
    expiring: 0,
    expired: 0,
    staged: 0,
  };
  for (const d of atLevel) {
    if (d.eff in statusCounts) statusCounts[d.eff]++;
  }

  const catCounts: Record<string, number> = { "cat-all": atLevel.length };
  for (const d of atLevel) catCounts[d.category] = (catCounts[d.category] ?? 0) + 1;

  // Server-side filter combine: level → status → category → search.
  const ql = q.toLowerCase();
  const filtered = atLevel.filter((d) => {
    if (status !== "all-status" && d.eff !== status) return false;
    if (cat !== "cat-all" && d.category !== cat) return false;
    if (ql && !d.name.toLowerCase().includes(ql) && !d.meta.toLowerCase().includes(ql))
      return false;
    return true;
  });

  return (
    <DocsClient
      docs={filtered.map(({ eff, ...rest }) => ({ ...rest, eff }))}
      thresholdDays={threshold}
      projects={projects}
      properties={properties.map((p) => ({ id: p.id, code: p.code, address: p.address }))}
      contacts={contacts}
      canEdit={canEdit}
      filters={{ level, status, cat, q }}
      counts={{ levelCounts, statusCounts, catCounts }}
    />
  );
}
