import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadCompanySettings,
  loadProjectByCode,
  loadProjectComplianceDocs,
} from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { DocStatus } from "@prisma/client";
import { parseDocumentMeta } from "@/lib/rehab/types";
import DocUploadButton from "@/components/rehab/DocUploadButton";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowed = await can(user, "documents", "view");
  if (!allowed) {
    return (
      <div className="tab-panel active" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Permission required</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          You don&apos;t have permission to view documents on this project. Ask an
          administrator to grant the <code>documents.view</code> permission.
        </p>
      </div>
    );
  }
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const settings = await loadCompanySettings(user.companyId);
  const thresholdDays = settings?.coiThresholdDays ?? 60;
  const compliance = await loadProjectComplianceDocs(project, thresholdDays);
  const canEdit = await can(user, "documents", "edit");

  const projectDocs = project.documents.filter((d) => d.level === "Project");

  return (
    <div className="tab-panel active">
      <div className="proj-bar" style={{ borderTop: "0.5px solid var(--border-lo)", position: "relative" }}>
        <div className="proj-l">
          <span className="proj-addr" style={{ fontSize: 11 }}>
            {project.code} · {project.property.address}
          </span>
        </div>
        <div className="proj-r">
          {canEdit && <DocUploadButton projectCode={project.code} />}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="doc-tbl-hd">
            <span className="col-label">Document</span>
            <span className="col-label">Type</span>
            <span className="col-label">Status</span>
            <span className="col-label">Date (ET)</span>
            <span className="col-label" style={{ textAlign: "right" }}>Actions</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* SECTION 1 — Project docs (CRUD) */}
            <div className="doc-section-hd">
              Job contracts &amp; addenda — {project.code}
            </div>
            {projectDocs.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
                No project documents uploaded yet.
              </div>
            )}
            {projectDocs.map((doc) => {
              const meta = parseDocumentMeta(doc.meta);
              const isStaged = meta.staged || doc.status === DocStatus.Pending;
              const dateStr = meta.signedAt
                ? formatET(new Date(meta.signedAt), false)
                : meta.issuedAt
                ? formatET(new Date(meta.issuedAt), false)
                : formatET(doc.uploadedAt, false);
              return (
                <div className="doc-tbl-row" key={doc.id}>
                  <div>
                    <div className="doc-name">{doc.name}</div>
                    <div className="doc-meta">
                      {doc.category} · {project.code} specific
                      {isStaged && <span className="mapped-pill" style={{ background: "#F1EFE8", color: "#5F5E5A", marginLeft: 6 }}>Staged</span>}
                    </div>
                  </div>
                  <div className="doc-type-cell">{doc.category}</div>
                  {isStaged ? (
                    <span className="s-staged">Pending review</span>
                  ) : (
                    <span className="s-ok">✓ {meta.signed ? "Signed" : "Active"}</span>
                  )}
                  <div className="doc-date-cell">{dateStr} ET</div>
                  <div className="doc-acts">
                    <button className="view-btn">View</button>
                    {isStaged && canEdit ? (
                      <button className="view-btn" style={{ background: "var(--blue)", color: "#fff", borderColor: "var(--blue)" }}>
                        Promote
                      </button>
                    ) : (
                      <span className="cell-dl">↓</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* SECTION 2 — Contractor compliance (READ-ONLY, deep-links to Contacts) */}
            <div className="doc-section-hd" style={{ marginTop: 4 }}>
              Contractor compliance — linked from Contacts{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 9, color: "var(--text-tertiary)" }}>
                (read-only · source of truth lives in the contractor profile)
              </span>
            </div>
            {compliance.map((d) => {
              const expiringSoon = d.computedStatus === "Expiring";
              const expired = d.computedStatus === "Expired";
              return (
                <div className="doc-tbl-row" key={d.id}>
                  <div>
                    <div className="doc-name">{d.contact.name} — {d.name}</div>
                    <div className="doc-meta">
                      Insurance · expires {formatET(d.expiresAt, false)}{" "}
                      {expiringSoon && (
                        <span className="mapped-pill" style={{ background: "#FCEAEA", color: "#791F1F", marginLeft: 4 }}>
                          ⏰ Expiring in {d.daysUntilExpiry} days
                        </span>
                      )}
                      {expired && (
                        <span className="mapped-pill" style={{ background: "#FCEAEA", color: "#791F1F", marginLeft: 4 }}>
                          Expired
                        </span>
                      )}
                      <span className="mapped-pill" style={{ marginLeft: 4 }}>Contacts → {d.contact.name}</span>
                    </div>
                  </div>
                  <div className="doc-type-cell">{d.type === "insurance" ? "COI" : d.type}</div>
                  {expired ? (
                    <span className="s-warn">Expired</span>
                  ) : expiringSoon ? (
                    <span className="s-warn">⏰ Expiring</span>
                  ) : (
                    <span className="s-ok">✓ Active</span>
                  )}
                  <div className="doc-date-cell">{formatET(d.expiresAt, false)} ET</div>
                  <div className="doc-acts" style={{ justifyContent: "flex-end" }}>
                    <Link
                      className="view-btn"
                      href={`/contacts/${d.contact.id}`}
                      title="Manage compliance docs in the contractor profile"
                    >
                      Go to profile →
                    </Link>
                  </div>
                </div>
              );
            })}
            {compliance.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
                No contractor compliance docs on file for assigned contractors.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
