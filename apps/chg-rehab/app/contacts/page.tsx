import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can, getContractorCompliance, canAssign } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import { formatMoney } from "@/lib/pipeline";
import type { ContactType } from "@prisma/client";
import { ContractorComplianceModal } from "./ComplianceModal";
import { DocViewButton } from "./DocViewModal";
import { FilterBar } from "./FilterBar";
import { EmailOptOutToggle } from "./EmailOptOutToggle";
import { UnsubscribedTable, type UnsubscribedRow } from "./UnsubscribedTable";
import { AddTenantModal } from "./AddTenantModal";
import { AddContactModal } from "./AddContactModal";
import { EditLeaseModal } from "./EditLeaseModal";

export const dynamic = "force-dynamic";

type Tab = "contractors" | "vendors" | "inspectors" | "tenants" | "unsubscribed";
type SP = { tab?: Tab; id?: string; q?: string; trade?: string; category?: string; status?: string };

type ContactMeta = {
  avatarBg?: string;
  avatarFg?: string;
  initials?: string;
  status?: "Preferred" | "Standard" | "DoNotUse" | "Active" | "Former";
  license?: string;
  roleLabel?: string;
  totalEarned?: number;
  projects?: { code: string; address: string; role?: string; status?: string }[];
  rating?: number;
  notes?: string;
  serviceArea?: string;
  paymentTerms?: string;
  account?: string;
  tags?: string[];
  emergency?: string;
  propertyCode?: string;
  leasePeriod?: string;
  priorRent?: string;
  depositReturned?: string;
  // Vendor-specific
  category?: string;
  supplierLink?: string;
  spendHistory?: { period: string; total: number; orders?: number }[];
  // Inspector-specific
  platformAccess?: string;        // e.g. "Cleveland.gov BIS – Read-only"
  assignedProjects?: { code: string; address: string; type: string; status?: string }[];
};

type LeaseMeta = {
  deposit?: number;
  autoRenew?: string;
  contactKey?: string;
  contactId?: string;
  leaseDoc?: string;
  leaseDocFileKey?: string;
};

const TAB_TYPES: Record<Exclude<Tab, "unsubscribed">, ContactType[]> = {
  contractors: ["Contractor", "Subcontractor"],
  vendors:     ["Vendor"],
  inspectors:  ["Inspector"],
  tenants:     ["Tenant"],
};

// Maps a contact type to its detail tab. Unmapped types (e.g. `Other`) fall
// back to the read-only `/contacts/[id]` profile route.
const TYPE_TO_TAB: Partial<Record<ContactType, Exclude<Tab, "unsubscribed">>> = {
  Contractor:    "contractors",
  Subcontractor: "contractors",
  Vendor:        "vendors",
  Inspector:     "inspectors",
  Tenant:        "tenants",
};

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "contacts", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to contacts.</div>;
  }
  const sp = await searchParams;
  const tab: Tab = sp.tab || "contractors";

  // Counts per tab
  const allContacts = await prisma.contact.findMany({
    where: { companyId: user.companyId },
    orderBy: { name: "asc" },
  });
  const counts = {
    contractors: allContacts.filter((c) => TAB_TYPES.contractors.includes(c.type)).length,
    vendors:     allContacts.filter((c) => TAB_TYPES.vendors.includes(c.type)).length,
    inspectors:  allContacts.filter((c) => TAB_TYPES.inspectors.includes(c.type)).length,
    tenants:     allContacts.filter((c) => TAB_TYPES.tenants.includes(c.type)).length,
  };

  // Compliance count for top-bar chip
  let complianceIssues = 0;
  for (const c of allContacts.filter((x) => TAB_TYPES.contractors.includes(x.type))) {
    const comp = await getContractorCompliance(c.id, user.companyId);
    if (comp.missingRequired.length > 0) complianceIssues++;
  }

  const isAdmin = user.role === "Admin";
  const unsubscribedContacts = allContacts.filter((c) => c.emailOptOut);
  const tabContacts = tab === "unsubscribed"
    ? (isAdmin ? unsubscribedContacts : [])
    : allContacts.filter((c) => TAB_TYPES[tab].includes(c.type));

  // Apply text search across name/company/email/phone/trade
  const q = (sp.q ?? "").trim().toLowerCase();
  const trade = (sp.trade ?? "").trim();
  const category = (sp.category ?? "").trim();
  const status = (sp.status ?? "").trim();
  const filteredContacts = tabContacts.filter((c) => {
    const m = (c.meta || {}) as ContactMeta;
    if (q) {
      const hay = [c.name, c.company, c.email, c.phone, c.trade, m.category]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (trade && c.trade !== trade) return false;
    if (category && (m.category ?? "") !== category) return false;
    if (status && (m.status ?? "") !== status) return false;
    return true;
  });

  const vendorCategories = Array.from(new Set(
    tabContacts
      .filter(() => tab === "vendors")
      .map((c) => ((c.meta || {}) as ContactMeta).category)
      .filter((x): x is string => !!x)
  )).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">Contacts</span>
          <span className="proj-chip">{allContacts.length} total</span>
          {complianceIssues > 0 && (
            <span className="proj-chip" style={{ background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #791F1F" }}>
              {complianceIssues} compliance issue{complianceIssues > 1 ? "s" : ""}
            </span>
          )}
          {isAdmin && (
            <AddContactModal defaultType={
              tab === "vendors"    ? "Vendor"    :
              tab === "inspectors" ? "Inspector" :
              tab === "tenants"    ? "Tenant"    :
              tab === "unsubscribed" ? "Other"   :
              "Contractor"
            } />
          )}
        </div>
        <div className="proj-r">
          <Link href="/admin" className="btn-sm">⚙ Compliance settings</Link>
        </div>
      </div>

      <div className="tab-nav">
        {(
          [
            ["contractors", "Contractors", counts.contractors],
            ["vendors",     "Vendors & Suppliers", counts.vendors],
            ["inspectors",  "Inspectors", counts.inspectors],
            ["tenants",     "Tenants", counts.tenants],
            ...(isAdmin
              ? ([["unsubscribed", "Unsubscribed", unsubscribedContacts.length]] as [Tab, string, number][])
              : []),
          ] as [Tab, string, number][]
        ).map(([t, label, count]) => (
          <Link key={t} href={`/contacts?tab=${t}`} className={`tab-btn ${tab === t ? "active" : ""}`}>
            {label}{" "}
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 8,
              background: tab === t ? "#E6F1FB" : "var(--bg-secondary)",
              color: tab === t ? "#0C447C" : "var(--text-tertiary)",
              marginLeft: 3,
            }}>{count}</span>
          </Link>
        ))}
      </div>

      <div className="tab-panel active">
        {tab === "contractors" ? (
          <ContractorsTab companyId={user.companyId} contacts={filteredContacts} selectedId={sp.id} isAdmin={isAdmin} />
        ) : tab === "vendors" ? (
          <VendorsTab contacts={filteredContacts} selectedId={sp.id} isAdmin={isAdmin} categories={vendorCategories} />
        ) : tab === "inspectors" ? (
          <InspectorsTab companyId={user.companyId} contacts={filteredContacts} selectedId={sp.id} isAdmin={isAdmin} />
        ) : tab === "tenants" ? (
          <TenantsTab
            companyId={user.companyId}
            contacts={filteredContacts}
            selectedId={sp.id}
            isAdmin={isAdmin}
            canEdit={isAdmin || user.role === "ProjectManager"}
          />
        ) : isAdmin ? (
          <UnsubscribedTab contacts={filteredContacts} />
        ) : (
          <div style={{ padding: 20, fontSize: 11, color: "var(--text-tertiary)" }}>
            You do not have access to this list.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contractors tab ───────────────────────────────────────────────────
async function ContractorsTab({
  companyId, contacts, selectedId, isAdmin,
}: { companyId: string; contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>; selectedId?: string; isAdmin: boolean }) {

  const compliance = await Promise.all(
    contacts.map(async (c) => ({ id: c.id, comp: await getContractorCompliance(c.id, companyId) }))
  );
  const compMap = new Map(compliance.map((x) => [x.id, x.comp]));

  const selected = selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null;
  let assignState: { allowed: boolean; reasons: string[]; blockingEnabled: boolean } | null = null;
  if (selected) assignState = await canAssign(companyId, selected.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <FilterBar
        tab="contractors"
        showTrade
        showStatus
        placeholder="Search contractors…"
        trades={["General Contractor", "Electrical", "Plumbing", "HVAC", "Flooring"]}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--border-lo)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 110px 100px",
            padding: "5px 12px", background: "var(--bg-secondary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            <span className="col-lbl">Name / company</span>
            <span className="col-lbl">Trade</span>
            <span className="col-lbl">Compliance</span>
            <span className="col-lbl">Status</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {contacts.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
                No contractors on file.
              </div>
            )}
            {contacts.map((c) => {
              const meta = (c.meta || {}) as ContactMeta;
              const comp = compMap.get(c.id)!;
              const active = c.id === selectedId;
              const statusLabel = meta.status === "Preferred" ? "⭐ Preferred"
                : meta.status === "DoNotUse" ? "⛔ Do not use"
                : "Standard";
              const statusStyle = meta.status === "Preferred"
                ? { background: "#E6F1FB", color: "#0C447C" }
                : meta.status === "DoNotUse"
                ? { background: "#FCEBEB", color: "#791F1F" }
                : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" };

              return (
                <Link
                  key={c.id}
                  href={`/contacts?tab=contractors&id=${c.id}`}
                  scroll={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 110px 110px 100px",
                    padding: "9px 12px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    alignItems: "center",
                    cursor: "pointer",
                    background: active ? "#EFF6FF" : undefined,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {c.company ? `${c.company} · ` : ""}{c.phone ?? c.email ?? ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.trade ?? "—"}</div>
                  <div style={{ display: "flex", gap: 3 }}>
                    <ComplianceChip label="COI" state={comp.insurance} />
                    <ComplianceChip label="W-9" state={{ ...comp.w9, expired: false, expiringSoon: false }} />
                    <ComplianceChip label="LIC" state={comp.license} />
                  </div>
                  <span style={{
                    fontSize: 9, padding: "2px 7px", borderRadius: 10,
                    fontWeight: 500, whiteSpace: "nowrap", ...statusStyle,
                  }}>{statusLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* DETAIL PANEL */}
        <div style={{ width: 320, flexShrink: 0, overflowY: "auto", background: "#fff" }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                Select a contractor from the list to view their full profile, compliance status, project history, and internal notes.
              </div>
            </div>
          ) : (
            <ContractorDetail
              companyId={companyId}
              contact={selected}
              compliance={compMap.get(selected.id)!}
              assignState={assignState!}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ComplianceChip({ label, state }: { label: string; state: { present: boolean; expired?: boolean; expiringSoon?: boolean } }) {
  let bg = "#EAF3DE", fg = "#27500A", icon = "✓";
  if (!state.present || state.expired) { bg = "#FCEBEB"; fg = "#791F1F"; icon = "✗"; }
  else if (state.expiringSoon)         { bg = "#FAEEDA"; fg = "#633806"; icon = "⚠"; }
  return (
    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, background: bg, color: fg }}>
      {label} {icon}
    </span>
  );
}

async function ContractorDetail({
  companyId, contact, compliance, assignState, isAdmin,
}: {
  companyId: string;
  contact: Awaited<ReturnType<typeof prisma.contact.findFirst>>;
  compliance: Awaited<ReturnType<typeof getContractorCompliance>>;
  assignState: { allowed: boolean; reasons: string[]; blockingEnabled: boolean };
  isAdmin: boolean;
}) {
  if (!contact) return null;
  const meta = (contact.meta || {}) as ContactMeta;
  const docs = await prisma.contractorComplianceDoc.findMany({
    where: { contactId: contact.id },
    orderBy: { type: "asc" },
  });

  const assignments = await prisma.contractorAssignment.findMany({
    where: { companyId, contactId: contact.id },
    include: { project: { include: { property: true } } },
    orderBy: { assignedAt: "desc" },
  });

  const initials = meta.initials
    || contact.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const expiringInsurance = compliance.insurance.expiringSoon || compliance.insurance.expired;

  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border-lo)" }}>
        {isAdmin && contact.emailOptOut && (
          <EmailOptOutToggle
            contactId={contact.id}
            contactName={contact.name}
            emailOptOut={contact.emailOptOut}
            emailOptOutAt={contact.emailOptOutAt ? contact.emailOptOutAt.toISOString() : null}
          />
        )}
        {expiringInsurance && (
          <div style={{
            padding: "8px 10px",
            background: compliance.insurance.expired ? "#FCEBEB" : "#FFFBEB",
            borderRadius: 6,
            fontSize: 10,
            color: compliance.insurance.expired ? "#791F1F" : "#92400E",
            marginBottom: 10,
            border: `0.5px solid ${compliance.insurance.expired ? "#791F1F" : "rgba(186,117,23,0.3)"}`,
          }}>
            ⚠ COI {compliance.insurance.expired ? "expired" : "expires"}
            {compliance.insurance.expiresAt ? ` ${formatET(compliance.insurance.expiresAt, false)}` : ""} —
            upload renewal before assigning to new projects.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: meta.avatarBg ?? "#9FE1CB",
            color: meta.avatarFg ?? "#085041",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.name}</div>
            {contact.company && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{contact.company}</div>}
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              {meta.roleLabel ?? contact.trade ?? ""}{meta.license ? ` · ${meta.license}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {contact.phone && <a className="btn-sm" href={`tel:${contact.phone}`}>📞 Call</a>}
          {contact.email && <a className="btn-sm" href={`mailto:${contact.email}`}>✉ Email</a>}
          <Link className="btn-sm" href={`/contacts?tab=contractors&id=${contact.id}&edit=1`} title="Edit contractor record">
            ✎ Edit
          </Link>
          <ContractorComplianceModal
            contactId={contact.id}
            contactName={contact.name}
            assignState={assignState}
            companyId={companyId}
          />
          {isAdmin && !contact.emailOptOut && contact.email && (
            <EmailOptOutToggle
              contactId={contact.id}
              contactName={contact.name}
              emailOptOut={false}
              emailOptOutAt={null}
            />
          )}
        </div>

        {isAdmin && meta.tags && meta.tags.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {meta.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  background: "#FAEEDA", color: "#633806", fontWeight: 500,
                }}
                title="Admin-only internal tag"
              >
                {t}
              </span>
            ))}
            <span style={{ fontSize: 8, color: "var(--text-tertiary)", alignSelf: "center" }}>
              · Admin-only
            </span>
          </div>
        )}
      </div>

      <DetailSection title="Contact info">
        <KV label="Phone"        value={contact.phone ?? "—"} />
        <KV label="Email"        value={contact.email ?? "—"} />
        <KV label="Service area" value={meta.serviceArea ?? contact.address ?? "—"} />
        <KV label="Status"
          value={
            <span style={{
              fontSize: 9, padding: "2px 7px", borderRadius: 10, fontWeight: 500,
              ...(meta.status === "Preferred" ? { background: "#E6F1FB", color: "#0C447C" }
                : meta.status === "DoNotUse" ? { background: "#FCEBEB", color: "#791F1F" }
                : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" }),
            }}>
              {meta.status === "Preferred" ? "⭐ Preferred"
                : meta.status === "DoNotUse" ? "⛔ Do not use"
                : "Standard"}
            </span>
          }
          last
        />
      </DetailSection>

      <DetailSection title="Compliance documents">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ComplianceRow type="insurance" label="Certificate of Insurance" doc={docs.find((d) => d.type === "insurance")} state={compliance.insurance} />
          <ComplianceRow type="w9"        label="W-9"                      doc={docs.find((d) => d.type === "w9")}        state={{ present: compliance.w9.present, expired: false, expiringSoon: false, expiresAt: null }} />
          <ComplianceRow type="license"   label="License"                  doc={docs.find((d) => d.type === "license")}   state={compliance.license} />
        </div>
      </DetailSection>

      <DetailSection title="Projects">
        {assignments.length === 0 ? (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            No project assignments yet.
          </div>
        ) : (
          assignments.map((a, i) => {
            const isActive = a.status === "Active" && a.project.status !== "Complete";
            const addr = a.project.property?.address ?? a.project.name;
            return (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 0", borderBottom: i < assignments.length - 1 ? "0.5px solid var(--border-lo)" : undefined,
              }}>
                <div>
                  <Link
                    href={`/property?id=${a.project.propertyId}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 500 }}>{a.project.code} — {addr}</div>
                  </Link>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                    {a.project.status}{a.role ? ` · ${a.role}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, padding: "2px 5px", borderRadius: 3,
                  background: isActive ? "#E6F1FB" : "#EAF3DE",
                  color: isActive ? "#0C447C" : "#27500A",
                }}>
                  {isActive ? "Active →" : "Done"}
                </span>
              </div>
            );
          })
        )}
        {meta.totalEarned != null && assignments.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-tertiary)" }}>
            Total earned: <strong style={{ color: "var(--text-primary)" }}>{formatMoney(meta.totalEarned)}</strong> across {assignments.length} project{assignments.length > 1 ? "s" : ""}
          </div>
        )}
      </DetailSection>

      {meta.rating != null && (
        <DetailSection title="Performance rating — internal only">
          <div style={{ display: "flex", gap: 2, fontSize: 16 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} style={{ color: n <= (meta.rating ?? 0) ? "#EF9F27" : "#E2E8F0" }}>★</span>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>
            {meta.rating} / 5
          </div>
        </DetailSection>
      )}

      {(meta.notes || contact.notes) && (
        <DetailSection title="Internal notes" last>
          <div style={{
            fontSize: 10, color: "var(--text-secondary)", padding: "8px 10px",
            background: "var(--bg-secondary)", borderRadius: 5, lineHeight: 1.5,
          }}>
            {meta.notes ?? contact.notes}
          </div>
        </DetailSection>
      )}
    </>
  );
}

function DetailSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ padding: "10px 14px", borderBottom: last ? undefined : "0.5px solid var(--border-lo)" }}>
      <div style={{
        fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
      }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      padding: "4px 0", borderBottom: last ? undefined : "0.5px solid var(--border-lo)",
    }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ComplianceRow({
  type, label, doc, state,
}: {
  type: string;
  label: string;
  doc?: { id?: string; name: string; expiresAt: Date | null; status: string; fileKey: string | null };
  state: { present: boolean; expired: boolean; expiringSoon: boolean; expiresAt: Date | null };
}) {
  const tone =
    !state.present || state.expired ? "bad" :
    state.expiringSoon ? "warn" : "ok";

  const sty = tone === "bad"
    ? { bg: "#FCEBEB", border: "rgba(121,31,31,0.3)", icon: "✗", iconBg: "#FCEBEB", iconFg: "#791F1F", subColor: "#791F1F" }
    : tone === "warn"
    ? { bg: "#FFFBEB", border: "rgba(186,117,23,0.4)", icon: "⚠", iconBg: "#FAEEDA", iconFg: "#633806", subColor: "#92400E" }
    : { bg: "var(--bg-secondary)", border: "var(--border-lo)", icon: "✓", iconBg: "#EAF3DE", iconFg: "#27500A", subColor: "var(--text-tertiary)" };

  const sub = !state.present
    ? `${label} not on file`
    : type === "w9"
    ? `On file${doc?.name ? ` · ${doc.name}` : ""}`
    : state.expiresAt
    ? `${state.expired ? "Expired" : "Expires"} ${formatET(state.expiresAt, false)}`
    : "On file";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px", background: sty.bg, borderRadius: 6,
      border: `0.5px solid ${sty.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 4,
          background: sty.iconBg, color: sty.iconFg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700,
        }}>{sty.icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 500 }}>{doc?.name ?? label}</div>
          <div style={{ fontSize: 9, color: sty.subColor }}>{sub}</div>
        </div>
      </div>
      {state.present && doc && (
        <DocViewButton
          doc={{
            type,
            label,
            name: doc.name,
            status: doc.status,
            expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
            fileKey: doc.fileKey,
          }}
        />
      )}
    </div>
  );
}

// ── Vendors tab (list + detail) ───────────────────────────────────────
function VendorsTab({
  contacts, selectedId, isAdmin, categories,
}: { contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>; selectedId?: string; isAdmin: boolean; categories: string[] }) {
  const selected = selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <FilterBar tab="vendors" placeholder="Search vendors…" categories={categories} showCategory />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--border-lo)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 90px",
            padding: "5px 12px", background: "var(--bg-secondary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            <span className="col-lbl">Company / contact</span>
            <span className="col-lbl">Trade</span>
            <span className="col-lbl">Account</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {contacts.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
                No vendors on file.
              </div>
            )}
            {contacts.map((c) => {
              const meta = (c.meta || {}) as ContactMeta;
              const active = c.id === selectedId;
              return (
                <Link
                  key={c.id}
                  href={`/contacts?tab=vendors&id=${c.id}`}
                  scroll={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 110px 90px",
                    padding: "9px 12px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    alignItems: "center",
                    cursor: "pointer",
                    background: active ? "#EFF6FF" : undefined,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.company ?? c.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {c.name !== c.company ? c.name : ""}{c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.trade ?? "—"}</div>
                  <div>
                    {meta.account && (
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#EEEDFE", color: "#3C3489" }}>
                        {meta.account}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, overflowY: "auto", background: "#fff" }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                Select a vendor to view account details, payment terms, and contact info.
              </div>
            </div>
          ) : (
            <VendorDetail contact={selected} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </div>
  );
}

function VendorDetail({ contact, isAdmin }: { contact: NonNullable<Awaited<ReturnType<typeof prisma.contact.findFirst>>>; isAdmin: boolean }) {
  const meta = (contact.meta || {}) as ContactMeta;
  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border-lo)" }}>
        {isAdmin && contact.emailOptOut && (
          <EmailOptOutToggle
            contactId={contact.id}
            contactName={contact.name}
            emailOptOut={contact.emailOptOut}
            emailOptOutAt={contact.emailOptOutAt ? contact.emailOptOutAt.toISOString() : null}
          />
        )}
        <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.company ?? contact.name}</div>
        {contact.company && contact.name !== contact.company && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Contact: {contact.name}</div>
        )}
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{contact.trade ?? ""}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {contact.phone && <a className="btn-sm" href={`tel:${contact.phone}`}>📞 Call</a>}
          {contact.email && <a className="btn-sm" href={`mailto:${contact.email}`}>✉ Email</a>}
          {meta.supplierLink && (
            <a
              className="btn-sm"
              href={meta.supplierLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open supplier ordering portal"
            >
              ↗ Supplier portal
            </a>
          )}
          {isAdmin && !contact.emailOptOut && contact.email && (
            <EmailOptOutToggle
              contactId={contact.id}
              contactName={contact.name}
              emailOptOut={false}
              emailOptOutAt={null}
            />
          )}
        </div>
      </div>
      <DetailSection title="Contact info">
        <KV label="Phone"   value={contact.phone ?? "—"} />
        <KV label="Email"   value={contact.email ?? "—"} />
        <KV label="Address" value={contact.address ?? "—"} last />
      </DetailSection>
      <DetailSection title="Account">
        <KV label="Account"      value={meta.account ?? "—"} />
        <KV label="Terms"        value={meta.paymentTerms ?? "—"} />
        <KV label="Service area" value={meta.serviceArea ?? "—"} />
        <KV
          label="Supplier link"
          value={meta.supplierLink
            ? <a href={meta.supplierLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{meta.supplierLink}</a>
            : "—"}
          last
        />
      </DetailSection>
      {meta.spendHistory && meta.spendHistory.length > 0 && (
        <DetailSection title="Spend history">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {meta.spendHistory.map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "5px 0",
                borderBottom: i < meta.spendHistory!.length - 1 ? "0.5px solid var(--border-lo)" : undefined,
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500 }}>{row.period}</div>
                  {row.orders != null && (
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                      {row.orders} order{row.orders === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500 }}>{formatMoney(row.total)}</div>
              </div>
            ))}
            <div style={{
              marginTop: 4, paddingTop: 6, borderTop: "0.5px solid var(--border-lo)",
              display: "flex", justifyContent: "space-between", fontSize: 10,
            }}>
              <span style={{ color: "var(--text-tertiary)" }}>Total</span>
              <strong>{formatMoney(meta.spendHistory.reduce((s, r) => s + r.total, 0))}</strong>
            </div>
          </div>
        </DetailSection>
      )}
      {(meta.notes || contact.notes) && (
        <DetailSection title="Notes" last>
          <div style={{
            fontSize: 10, color: "var(--text-secondary)", padding: "8px 10px",
            background: "var(--bg-secondary)", borderRadius: 5, lineHeight: 1.5,
          }}>{meta.notes ?? contact.notes}</div>
        </DetailSection>
      )}
    </>
  );
}

// ── Inspectors tab (list + detail) ────────────────────────────────────
function InspectorsTab({
  contacts, selectedId, isAdmin,
}: { companyId: string; contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>; selectedId?: string; isAdmin: boolean }) {
  const selected = selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <FilterBar tab="inspectors" placeholder="Search inspectors…" />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--border-lo)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 130px",
            padding: "5px 12px", background: "var(--bg-secondary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            <span className="col-lbl">Name</span>
            <span className="col-lbl">Discipline</span>
            <span className="col-lbl">Jurisdiction</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {contacts.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
                No inspectors on file.
              </div>
            )}
            {contacts.map((c) => {
              const active = c.id === selectedId;
              return (
                <Link
                  key={c.id}
                  href={`/contacts?tab=inspectors&id=${c.id}`}
                  scroll={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 130px 130px",
                    padding: "9px 12px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    alignItems: "center",
                    cursor: "pointer",
                    background: active ? "#EFF6FF" : undefined,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {c.company ?? ""}{c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.trade ?? "—"}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.address ?? "—"}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, overflowY: "auto", background: "#fff" }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                Select an inspector to view discipline, jurisdiction, and contact info.
              </div>
            </div>
          ) : (
            <InspectorDetail contact={selected} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </div>
  );
}

function InspectorDetail({ contact, isAdmin }: { contact: NonNullable<Awaited<ReturnType<typeof prisma.contact.findFirst>>>; isAdmin: boolean }) {
  const meta = (contact.meta || {}) as ContactMeta;
  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border-lo)" }}>
        {isAdmin && contact.emailOptOut && (
          <EmailOptOutToggle
            contactId={contact.id}
            contactName={contact.name}
            emailOptOut={contact.emailOptOut}
            emailOptOutAt={contact.emailOptOutAt ? contact.emailOptOutAt.toISOString() : null}
          />
        )}
        <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{contact.company ?? ""}</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{contact.trade ?? ""}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {contact.phone && <a className="btn-sm" href={`tel:${contact.phone}`}>📞 Call</a>}
          {contact.email && <a className="btn-sm" href={`mailto:${contact.email}`}>✉ Email</a>}
          {isAdmin && !contact.emailOptOut && contact.email && (
            <EmailOptOutToggle
              contactId={contact.id}
              contactName={contact.name}
              emailOptOut={false}
              emailOptOutAt={null}
            />
          )}
        </div>
      </div>
      <DetailSection title="Contact info">
        <KV label="Phone"        value={contact.phone ?? "—"} />
        <KV label="Email"        value={contact.email ?? "—"} />
        <KV label="Discipline"   value={contact.trade ?? "—"} />
        <KV label="Jurisdiction" value={contact.address ?? "—"} last />
      </DetailSection>
      <DetailSection title="Platform access">
        {meta.platformAccess ? (
          <div style={{
            fontSize: 10, color: "var(--text-secondary)", padding: "8px 10px",
            background: "var(--bg-secondary)", borderRadius: 5, lineHeight: 1.5,
          }}>{meta.platformAccess}</div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            No external platform access on file. Inspector receives reports via email only.
          </div>
        )}
      </DetailSection>
      <DetailSection title="Assigned projects">
        {meta.assignedProjects && meta.assignedProjects.length > 0 ? (
          meta.assignedProjects.map((p, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: i < meta.assignedProjects!.length - 1 ? "0.5px solid var(--border-lo)" : undefined,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 500 }}>{p.code} — {p.address}</div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{p.type}</div>
              </div>
              <span style={{
                fontSize: 9, padding: "2px 5px", borderRadius: 3,
                background: p.status === "Scheduled" ? "#FFFBEB"
                  : p.status === "Passed" ? "#EAF3DE"
                  : p.status === "Failed" ? "#FCEBEB"
                  : "var(--bg-secondary)",
                color: p.status === "Scheduled" ? "#92400E"
                  : p.status === "Passed" ? "#27500A"
                  : p.status === "Failed" ? "#791F1F"
                  : "var(--text-secondary)",
              }}>
                {p.status ?? "—"}
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            No projects currently assigned.
          </div>
        )}
      </DetailSection>
      {(meta.notes || contact.notes) && (
        <DetailSection title="Notes" last>
          <div style={{
            fontSize: 10, color: "var(--text-secondary)", padding: "8px 10px",
            background: "var(--bg-secondary)", borderRadius: 5, lineHeight: 1.5,
          }}>{meta.notes ?? contact.notes}</div>
        </DetailSection>
      )}
    </>
  );
}

// ── Tenants tab (list + detail with full lease) ───────────────────────
async function TenantsTab({
  companyId, contacts, selectedId, isAdmin, canEdit,
}: { companyId: string; contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>; selectedId?: string; isAdmin: boolean; canEdit: boolean }) {
  const [leases, properties] = await Promise.all([
    prisma.lease.findMany({
      where: { companyId },
      include: { property: true },
    }),
    prisma.property.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, address: true },
    }),
  ]);

  function leaseFor(contactId: string, contactName: string) {
    return leases.find((l) => {
      const lm = (l.meta as LeaseMeta | null) ?? {};
      return l.tenantName === contactName || lm.contactId === contactId;
    }) ?? null;
  }

  const selected = selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null;
  const selectedLease = selected ? leaseFor(selected.id, selected.name) : null;

  const leaseOptions = leases.map((l) => ({
    id: l.id,
    propertyId: l.propertyId,
    tenantName: l.tenantName,
    rent: l.rent ? l.rent.toString() : null,
    startDate: l.startDate ? l.startDate.toISOString() : null,
    endDate: l.endDate ? l.endDate.toISOString() : null,
    status: l.status,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <FilterBar tab="tenants" placeholder="Search tenants…" />
        {canEdit && (
          <div style={{
            position: "absolute", top: 0, right: 12, bottom: 0,
            display: "flex", alignItems: "center",
          }}>
            <AddTenantModal properties={properties} leases={leaseOptions} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--border-lo)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 100px 90px",
            padding: "5px 12px", background: "var(--bg-secondary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            <span className="col-lbl">Tenant / property</span>
            <span className="col-lbl">Lease end</span>
            <span className="col-lbl">Rent</span>
            <span className="col-lbl">Status</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {contacts.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
                No tenants on file.
              </div>
            )}
            {contacts.map((c) => {
              const meta = (c.meta || {}) as ContactMeta;
              const lease = leaseFor(c.id, c.name);
              const active = c.id === selectedId;
              const isFormer = meta.status === "Former";
              return (
                <Link
                  key={c.id}
                  href={`/contacts?tab=tenants&id=${c.id}`}
                  scroll={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 130px 100px 90px",
                    padding: "9px 12px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    alignItems: "center",
                    cursor: "pointer",
                    background: active ? "#EFF6FF" : undefined,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {lease?.property ? `${lease.property.code} · ${lease.property.address}` : "No active lease"}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    {lease?.endDate ? formatET(lease.endDate, false) : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    {lease?.rent ? `${formatMoney(Number(lease.rent))}/mo` : "—"}
                  </div>
                  <span style={{
                    fontSize: 9, padding: "2px 7px", borderRadius: 10, fontWeight: 500, whiteSpace: "nowrap",
                    background: isFormer ? "var(--bg-secondary)" : "#EAF3DE",
                    color: isFormer ? "var(--text-tertiary)" : "#27500A",
                  }}>{isFormer ? "Former" : "● Active"}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, overflowY: "auto", background: "#fff" }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                Select a tenant to view lease, emergency contact, and the linked property.
              </div>
            </div>
          ) : (
            <TenantDetail contact={selected} lease={selectedLease} isAdmin={isAdmin} canEdit={canEdit} />
          )}
        </div>
      </div>
    </div>
  );
}

function TenantDetail({
  contact, lease, isAdmin, canEdit,
}: {
  contact: NonNullable<Awaited<ReturnType<typeof prisma.contact.findFirst>>>;
  lease:
    | (Awaited<ReturnType<typeof prisma.lease.findMany>>[number] & {
        property: Awaited<ReturnType<typeof prisma.property.findFirst>>;
      })
    | null;
  isAdmin: boolean;
  canEdit: boolean;
}) {
  const meta = (contact.meta || {}) as ContactMeta;
  const leaseMeta = (lease?.meta as LeaseMeta | null) ?? {};
  const initials = meta.initials
    || contact.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const isFormer = meta.status === "Former";
  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: "0.5px solid var(--border-lo)" }}>
        {isAdmin && contact.emailOptOut && (
          <EmailOptOutToggle
            contactId={contact.id}
            contactName={contact.name}
            emailOptOut={contact.emailOptOut}
            emailOptOutAt={contact.emailOptOutAt ? contact.emailOptOutAt.toISOString() : null}
          />
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: meta.avatarBg ?? "#E6F1FB", color: meta.avatarFg ?? "#0C447C",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.name}</div>
              <span style={{
                fontSize: 9, padding: "2px 7px", borderRadius: 10, fontWeight: 500, whiteSpace: "nowrap",
                background: isFormer ? "var(--bg-secondary)" : "#EAF3DE",
                color: isFormer ? "var(--text-tertiary)" : "#27500A",
              }}>{isFormer ? "Former" : "● Active"}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              {lease?.property ? `${lease.property.address}${lease.property.city ? `, ${lease.property.city}` : ""}` : "No active lease"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {contact.phone && <a className="btn-sm" href={`tel:${contact.phone}`}>📞 Call</a>}
          {contact.email && <a className="btn-sm" href={`mailto:${contact.email}`}>✉ Email</a>}
          {isAdmin && !contact.emailOptOut && contact.email && (
            <EmailOptOutToggle
              contactId={contact.id}
              contactName={contact.name}
              emailOptOut={false}
              emailOptOutAt={null}
            />
          )}
        </div>
        {canEdit && lease && (
          <EditLeaseModal
            contactId={contact.id}
            leaseId={lease.id}
            isFormer={isFormer}
            initialRent={lease.rent ? String(Number(lease.rent)) : ""}
            initialStartDate={lease.startDate ? lease.startDate.toISOString().slice(0, 10) : ""}
            initialEndDate={lease.endDate ? lease.endDate.toISOString().slice(0, 10) : ""}
            initialDeposit={leaseMeta.deposit != null ? String(leaseMeta.deposit) : ""}
            initialStatus={lease.status ?? "Active"}
            initialLeaseDoc={leaseMeta.leaseDoc ?? ""}
            initialLeaseDocFileKey={leaseMeta.leaseDocFileKey ?? ""}
          />
        )}
      </div>

      <DetailSection title="Contact info">
        <KV label="Phone" value={contact.phone ?? "—"} />
        <KV label="Email" value={contact.email ?? "—"} last />
      </DetailSection>

      <DetailSection title="Lease">
        <KV label="Property"   value={lease?.property ? `${lease.property.code}` : "—"} />
        <KV label="Rent"       value={lease?.rent ? `${formatMoney(Number(lease.rent))}/mo` : (meta.priorRent ?? "—")} />
        <KV label="Start"      value={lease?.startDate ? formatET(lease.startDate, false) : "—"} />
        <KV label="End"        value={lease?.endDate ? formatET(lease.endDate, false) : (meta.leasePeriod ?? "—")} />
        <KV label="Deposit"    value={leaseMeta.deposit != null ? formatMoney(leaseMeta.deposit) : "—"} />
        <KV label="Renewal"    value={leaseMeta.autoRenew ?? "—"} last={!leaseMeta.leaseDoc} />
        {leaseMeta.leaseDoc && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0", marginTop: 4,
          }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>📄 {leaseMeta.leaseDoc}</span>
            <DocViewButton
              doc={{
                type: "lease",
                label: "Lease document",
                name: leaseMeta.leaseDoc,
                status: "Active",
                expiresAt: lease?.endDate ? lease.endDate.toISOString() : null,
                fileKey: leaseMeta.leaseDocFileKey ?? null,
              }}
            />
          </div>
        )}
      </DetailSection>

      {meta.emergency && (
        <DetailSection title="Emergency contact">
          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{meta.emergency}</div>
        </DetailSection>
      )}

      {lease?.property && (
        <DetailSection title="Linked property">
          <Link
            href={`/property?id=${lease.property.id}`}
            style={{
              display: "block", padding: "8px 10px",
              border: "0.5px solid var(--border-lo)", borderRadius: 6,
              textDecoration: "none", color: "inherit", background: "var(--bg-secondary)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 500 }}>{lease.property.code}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              {lease.property.address}{lease.property.city ? `, ${lease.property.city}` : ""}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>
              Status: {lease.property.status} · Open property →
            </div>
          </Link>
        </DetailSection>
      )}

      {isFormer && (meta.priorRent || meta.leasePeriod || meta.depositReturned) && (
        <DetailSection title="Prior tenancy">
          {meta.leasePeriod   && <KV label="Lease period"     value={meta.leasePeriod} />}
          {meta.priorRent     && <KV label="Prior rent"       value={meta.priorRent} />}
          {meta.depositReturned && <KV label="Deposit returned" value={meta.depositReturned} last />}
        </DetailSection>
      )}

      {(meta.notes || contact.notes) && (
        <DetailSection title="Notes" last>
          <div style={{
            fontSize: 10, color: "var(--text-secondary)", padding: "8px 10px",
            background: "var(--bg-secondary)", borderRadius: 5, lineHeight: 1.5,
          }}>{meta.notes ?? contact.notes}</div>
        </DetailSection>
      )}
    </>
  );
}

// ── Unsubscribed tab (admin-only roll-up across all contact types) ────
function UnsubscribedTab({
  contacts,
}: { contacts: Awaited<ReturnType<typeof prisma.contact.findMany>> }) {
  const typeLabel: Record<ContactType, string> = {
    Contractor:    "Contractor",
    Subcontractor: "Subcontractor",
    Vendor:        "Vendor",
    Inspector:     "Inspector",
    Tenant:        "Tenant",
    Other:         "Other",
  };

  const sorted = [...contacts].sort((a, b) => {
    const ad = a.emailOptOutAt ? a.emailOptOutAt.getTime() : 0;
    const bd = b.emailOptOutAt ? b.emailOptOutAt.getTime() : 0;
    if (bd !== ad) return bd - ad;
    return a.name.localeCompare(b.name);
  });

  const rows: UnsubscribedRow[] = sorted.map((c) => {
    const destTab = TYPE_TO_TAB[c.type];
    const href = destTab
      ? `/contacts?tab=${destTab}&id=${c.id}`
      : `/contacts/${c.id}`;
    const linkTitle = destTab
      ? "Open profile to view details or re-enable emails"
      : "Open read-only profile (use ↺ Re-enable to restore emails)";
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      typeLabel: typeLabel[c.type],
      email: c.email,
      emailOptOutAtLabel: c.emailOptOutAt ? formatET(c.emailOptOutAt, false) : "—",
      href,
      linkTitle,
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <FilterBar tab="unsubscribed" placeholder="Search unsubscribed contacts…" />

      <div style={{
        padding: "8px 12px",
        background: "#FFFBEB",
        borderBottom: "0.5px solid rgba(186,117,23,0.3)",
        fontSize: 10,
        color: "#633806",
        flexShrink: 0,
      }}>
        These contacts won&rsquo;t receive notification emails until re-enabled. Tick the rows you
        want and click <strong>Re-enable emails</strong>, or use the ↺ Re-enable button on a single row.
      </div>

      <UnsubscribedTable rows={rows} />
    </div>
  );
}
