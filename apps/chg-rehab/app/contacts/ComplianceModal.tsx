"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";
import type { ComplianceRequirement } from "@/lib/assignmentGate";
import { ProjectPicker } from "@/app/components/ProjectPicker";
import type { ProjectOption } from "@/app/components/ProjectPicker";

type Props = {
  contactId: string;
  contactName: string;
  companyId: string;
  assignState: { allowed: boolean; reasons: string[]; blockingEnabled: boolean };
};

/** Toast row — `requirement` may be absent for legacy string-only payloads. */
type ToastWarning = {
  message: string;
  requirement?: ComplianceRequirement;
  /** True when the doc exists but has lapsed — links to the Renew flow. */
  expired?: boolean;
  /** ID of the specific doc to renew (present when `expired` is true). */
  docId?: string;
};

type SuccessNotice = {
  projectCode: string;
  warnings: ToastWarning[];
};

const VALID_REQUIREMENTS: ReadonlySet<ComplianceRequirement> = new Set([
  "w9",
  "coi",
  "license",
]);

function parseWarnings(raw: unknown): ToastWarning[] {
  if (!Array.isArray(raw)) return [];
  const out: ToastWarning[] = [];
  for (const w of raw) {
    if (typeof w === "string") {
      // Backwards-compat: older payloads sent plain strings. Render the
      // message but skip the deep-link.
      out.push({ message: w });
      continue;
    }
    if (
      w &&
      typeof w === "object" &&
      typeof (w as { message?: unknown }).message === "string"
    ) {
      const reqRaw = (w as { requirement?: unknown }).requirement;
      const requirement =
        typeof reqRaw === "string" &&
        VALID_REQUIREMENTS.has(reqRaw as ComplianceRequirement)
          ? (reqRaw as ComplianceRequirement)
          : undefined;
      const expiredRaw = (w as { expired?: unknown }).expired;
      const docIdRaw = (w as { docId?: unknown }).docId;
      out.push({
        message: (w as { message: string }).message,
        requirement,
        expired: expiredRaw === true,
        ...(typeof docIdRaw === "string" && docIdRaw ? { docId: docIdRaw } : {}),
      });
    }
  }
  return out;
}

/**
 * Path to the contractor's compliance section with a fragment that the `[id]`
 * page reads on mount to auto-open the correct modal:
 *  - `#compliance-<req>`              → Add-new-doc modal (doc is missing)
 *  - `#compliance-<req>-renew:<docId>`→ Renew modal for the specific expired doc
 *
 * Including the doc ID in the renew hash guarantees a single-row target even
 * when a contractor has multiple expired docs of the same type.
 */
function complianceFixHref(
  contactId: string,
  requirement: ComplianceRequirement,
  expired?: boolean,
  docId?: string
): string {
  if (expired) {
    const docSuffix = docId ? `:${docId}` : "";
    return `/contacts/${contactId}#compliance-${requirement}-renew${docSuffix}`;
  }
  return `/contacts/${contactId}#compliance-${requirement}`;
}

export function ContractorComplianceModal({ contactId, contactName, assignState }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<SuccessNotice | null>(null);
  const router = useRouter();

  const blocked = !assignState.allowed;
  const billingGate = useBillingGateProps();

  // Reset transient state every time the modal closes.
  useEffect(() => {
    if (!open) {
      setSelectedId("");
      setSelectedProject(null);
      setErr(null);
    }
  }, [open]);

  async function submit() {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: selectedId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        warnings?: unknown;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(
          billingAwareErrorMessage(res.status, body, `Assignment failed (${res.status})`)
        );
      }
      const warnings = parseWarnings(body.warnings);
      setOpen(false);
      setNotice({ projectCode: selectedProject?.code ?? "", warnings });
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {blocked ? (
        // When compliance gating blocks assignment, the Assign button is DISABLED with a
        // tooltip listing the reasons. The user must clear compliance items before assigning.
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
          <button
            type="button"
            className="btn-sm"
            disabled
            title={`Assignment blocked: ${assignState.reasons.join(" · ")}`}
            style={{ opacity: 0.55, cursor: "not-allowed" }}
          >
            ⛔ Assign to project
          </button>
          <span style={{ fontSize: 9, color: "#791F1F", fontWeight: 500 }}>
            Blocked — {assignState.reasons.join(" · ")}
          </span>
        </span>
      ) : (
        <button
          type="button"
          className="btn-sm btn-primary"
          onClick={() => setOpen(true)}
          disabled={billingGate.disabled}
          aria-disabled={billingGate.disabled || undefined}
          style={billingGate.style}
          title={
            billingGate.title ??
            (assignState.reasons.length > 0
              ? `Allowed with warnings: ${assignState.reasons.join(" · ")}`
              : "Assign to a project")
          }
        >
          {assignState.reasons.length > 0 ? "⚠ Assign to project" : "Assign to project"}
        </button>
      )}

      {open && (
        <div
          onClick={() => !busy && setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 8, padding: 0,
              width: 460, maxWidth: "92vw", maxHeight: "90vh", overflow: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--border-lo)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Assign {contactName} to a project</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  Compliance gating is {assignState.blockingEnabled ? "ENABLED" : "DISABLED"} company-wide
                </div>
              </div>
              <button onClick={() => !busy && setOpen(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-tertiary)" }}>✕</button>
            </div>

            <div style={{ padding: 18 }}>
              {blocked && (
                <div style={{
                  padding: "10px 12px", background: "#FCEBEB",
                  border: "0.5px solid rgba(121,31,31,0.3)",
                  borderRadius: 6, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#791F1F", marginBottom: 4 }}>
                    ⛔ Assignment blocked
                  </div>
                  <ul style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 11, color: "#791F1F", lineHeight: 1.7 }}>
                    {assignState.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  <div style={{ fontSize: 10, color: "#791F1F", marginTop: 6 }}>
                    Upload the missing or renewed documents in this contractor&rsquo;s record before re-attempting assignment.
                  </div>
                </div>
              )}

              {!blocked && assignState.reasons.length > 0 && (
                <div style={{
                  padding: "10px 12px", background: "#FFFBEB",
                  border: "0.5px solid rgba(186,117,23,0.3)",
                  borderRadius: 6, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#92400E" }}>⚠ Assignment allowed with warnings</div>
                  <div style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>
                    {assignState.reasons.join(" · ")}
                  </div>
                </div>
              )}

              <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 6 }}>
                Project
              </label>
              <ProjectPicker
                value={selectedId}
                onChange={(id, opt) => {
                  setSelectedId(id);
                  setSelectedProject(opt);
                }}
                disabled={blocked || busy}
                autoFocus
              />

              {err && <div style={{ marginTop: 8, fontSize: 11, color: "#791F1F" }}>{err}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  onClick={submit}
                  disabled={blocked || busy || !selectedId}
                >
                  {busy ? "Assigning..." : "Confirm assignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <AssignmentNotice
          contactId={contactId}
          contactName={contactName}
          projectCode={notice.projectCode}
          warnings={notice.warnings}
          onDone={() => setNotice(null)}
        />
      )}
    </>
  );
}

function AssignmentNotice({
  contactId,
  contactName,
  projectCode,
  warnings,
  onDone,
}: {
  contactId: string;
  contactName: string;
  projectCode: string;
  warnings: ToastWarning[];
  onDone: () => void;
}) {
  const hasWarnings = warnings.length > 0;
  // Plain successes auto-dismiss; warnings stay until the PM closes them so
  // the compliance reasons aren't missed.
  useEffect(() => {
    if (hasWarnings) return;
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [hasWarnings, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 360,
        background: hasWarnings ? "#FFFBEB" : "#111827",
        color: hasWarnings ? "#92400E" : "#fff",
        border: hasWarnings ? "0.5px solid rgba(186,117,23,0.4)" : "none",
        borderRadius: 6,
        padding: "12px 14px",
        fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ fontWeight: 600 }}>
          {hasWarnings ? "⚠ Assigned with compliance warnings" : "Assignment created"}
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ marginTop: 4, opacity: hasWarnings ? 1 : 0.85 }}>
        {contactName}
        {projectCode ? <> → <strong>{projectCode}</strong></> : null}
      </div>
      {hasWarnings && (
        <ul style={{ margin: "8px 0 0 18px", padding: 0, lineHeight: 1.6 }}>
          {warnings.map((w, i) => (
            <li
              key={`${w.requirement ?? "warn"}-${i}`}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span>{w.message}</span>
              {w.requirement && (
                <Link
                  href={complianceFixHref(contactId, w.requirement, w.expired, w.docId)}
                  onClick={onDone}
                  style={{
                    color: "#92400E",
                    fontWeight: 600,
                    textDecoration: "underline",
                    flex: "0 0 auto",
                  }}
                >
                  Fix now →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
