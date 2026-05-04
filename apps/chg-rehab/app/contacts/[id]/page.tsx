import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import {
  AddComplianceDocButton,
  RenewComplianceDocButton,
  ComplianceDocVersions,
  type ManagedDoc,
  type DocVersion,
} from "./ComplianceDocManager";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Active: { bg: "var(--green-bg)", fg: "var(--green-txt)" },
  Expiring: { bg: "var(--amber-bg)", fg: "var(--amber-txt)" },
  Expired: { bg: "var(--red-bg)", fg: "var(--red-txt)" },
};

export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      complianceDocs: {
        orderBy: { expiresAt: "asc" },
        include: {
          versions: { orderBy: { replacedAt: "desc" } },
        },
      },
    },
  });
  if (!contact || contact.companyId !== user.companyId) notFound();

  const settings = await prisma.companySetting.findUnique({
    where: { companyId: user.companyId },
  });
  const thresholdDays = settings?.coiThresholdDays ?? 60;
  const now = new Date();
  const docsWithStatus = contact.complianceDocs.map((d) => {
    let computed: "Active" | "Expiring" | "Expired" = "Active";
    let daysLeft: number | null = null;
    if (d.expiresAt) {
      const ms = d.expiresAt.getTime() - now.getTime();
      daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) computed = "Expired";
      else if (daysLeft <= thresholdDays) computed = "Expiring";
    }
    return { ...d, computedStatus: computed, daysLeft };
  });

  const canEditDocs = await can(user, "documents", "edit");

  return (
    <div className="tab-panel active">
      <div className="proj-bar">
        <div className="proj-l">
          <div className="proj-addr">{contact.name}</div>
          {contact.company && <span className="proj-chip">{contact.company}</span>}
          <span className="proj-chip">{contact.type}</span>
        </div>
        <div className="proj-r">
          <Link href="/contacts" className="btn-sm">← Back to contacts</Link>
        </div>
      </div>

      <div className="body-split">
        <div className="body-main">
          <div className="sec-hd">Contact info</div>
          <div style={{ padding: 14, fontSize: 11, lineHeight: 1.7 }}>
            {contact.trade && <div><strong>Trade:</strong> {contact.trade}</div>}
            {contact.email && <div><strong>Email:</strong> {contact.email}</div>}
            {contact.phone && <div><strong>Phone:</strong> {contact.phone}</div>}
            {contact.address && <div><strong>Address:</strong> {contact.address}</div>}
            {contact.rating !== null && contact.rating !== undefined && (
              <div><strong>Rating:</strong> {"★".repeat(contact.rating)}{"☆".repeat(5 - contact.rating)}</div>
            )}
            {contact.notes && (
              <div style={{ marginTop: 8 }}>
                <strong>Notes:</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>{contact.notes}</div>
              </div>
            )}
          </div>

          <div
            id="compliance"
            className="sec-hd"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span>Compliance documents ({docsWithStatus.length})</span>
            {canEditDocs && <AddComplianceDocButton contactId={contact.id} />}
          </div>
          {docsWithStatus.length === 0 && (
            <div style={{ padding: 14, fontSize: 11, color: "var(--text-tertiary)" }}>
              No compliance documents on file.
              {canEditDocs && " Use “Upload compliance document” above to add one."}
            </div>
          )}
          {docsWithStatus.length > 0 && (
            <>
              <div
                className="data-hd"
                style={{ gridTemplateColumns: "minmax(0,1fr) 110px 100px 80px 80px" }}
              >
                <span className="col-label">Document</span>
                <span className="col-label">Expires</span>
                <span className="col-label">Status</span>
                <span className="col-label">Days</span>
                <span className="col-label">Actions</span>
              </div>
              {docsWithStatus.map((d) => {
                const tone = STATUS_TONE[d.computedStatus] ?? STATUS_TONE.Active;
                const docVersions: DocVersion[] = d.versions.map((v) => ({
                  id: v.id,
                  name: v.name,
                  expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
                  fileKey: v.fileKey,
                  replacedAt: v.replacedAt.toISOString(),
                }));
                const managed: ManagedDoc = {
                  id: d.id,
                  type: d.type,
                  name: d.name,
                  expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
                  fileKey: d.fileKey,
                  computedStatus: d.computedStatus,
                  versions: docVersions,
                };
                return (
                  <div
                    className="data-row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 110px 100px 80px 80px" }}
                    key={d.id}
                  >
                    <div>
                      <div className="cell-name">{d.name}</div>
                      <div className="cell-meta">{d.type}</div>
                      <ComplianceDocVersions versions={docVersions} />
                    </div>
                    <div style={{ fontSize: 10 }}>
                      {d.expiresAt ? formatET(d.expiresAt, false) : "—"}
                    </div>
                    <span
                      className="cell-tag"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {d.computedStatus}
                    </span>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {d.daysLeft === null
                        ? "—"
                        : d.daysLeft < 0
                        ? `${Math.abs(d.daysLeft)} ago`
                        : `${d.daysLeft} left`}
                    </div>
                    <div>
                      {canEditDocs ? (
                        <RenewComplianceDocButton doc={managed} />
                      ) : (
                        <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <aside className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>Compliance source of truth</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              {canEditDocs
                ? "Upload new compliance documents and renew expiring ones here. Changes appear in every project's Documents tab automatically and are recorded in the activity log."
                : "Compliance references on project Documents tabs deep-link here. Ask an admin or PM with upload rights to renew expiring docs."}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
