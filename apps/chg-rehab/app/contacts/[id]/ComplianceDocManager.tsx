"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadContractorComplianceDoc,
  renewContractorComplianceDoc,
} from "@/lib/contacts/actions";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_TYPES_LABEL,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/fileValidation";

export type DocVersion = {
  id: string;
  name: string;
  expiresAt: string | null;
  fileKey: string | null;
  replacedAt: string;
};

export type ManagedDoc = {
  id: string;
  type: string;
  name: string;
  expiresAt: string | null;
  fileKey: string | null;
  computedStatus: "Active" | "Expiring" | "Expired";
  versions: DocVersion[];
};

const TYPE_OPTIONS: Array<{ value: string; label: string; needsExpiry: boolean }> = [
  { value: "insurance", label: "Certificate of Insurance (COI)", needsExpiry: true },
  { value: "license", label: "Trade license", needsExpiry: true },
  { value: "w9", label: "W-9", needsExpiry: false },
  { value: "other", label: "Other compliance document", needsExpiry: false },
];

/**
 * Maps a stable compliance-requirement key (used by the assignment toast's
 * "Fix now" deep-link, e.g. /contacts/<id>#compliance-w9) onto the doc-type
 * value used by this manager's upload form. Keep in sync with
 * `ComplianceRequirement` in lib/assignmentGate.ts and the type matching
 * sets there.
 */
const REQUIREMENT_TO_DOC_TYPE: Record<string, string> = {
  w9: "w9",
  coi: "insurance",
  license: "license",
};

/**
 * Maps doc-type values (as stored in the DB) back to their compliance
 * requirement key. Handles common synonyms so old records with non-standard
 * type strings still resolve correctly.
 */
const DOC_TYPE_TO_REQUIREMENT: Record<string, string> = {
  insurance: "coi",
  coi: "coi",
  "general-liability": "coi",
  gl: "coi",
  license: "license",
  "trade-license": "license",
  "contractor-license": "license",
  w9: "w9",
  "w-9": "w9",
};

/**
 * Parses the current URL hash for a compliance deep-link.
 * Handles two variants:
 *  - `#compliance-<req>`                → { requirement, renew: false }
 *    (missing doc → Add modal)
 *  - `#compliance-<req>-renew[:<docId>]`→ { requirement, renew: true, docId? }
 *    (expired doc → Renew modal; docId pins to the exact doc row)
 * Returns null when the hash is not a compliance deep-link or the requirement
 * key is unrecognised.
 */
function readFromHash(): {
  requirement: string;
  renew: boolean;
  docId?: string;
} | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith("compliance-")) return null;
  const rest = hash.slice("compliance-".length);

  // Detect the "-renew" marker. It may be followed by ":<docId>".
  const renewMarker = "-renew";
  const markerIdx = rest.indexOf(renewMarker);
  if (markerIdx !== -1) {
    const req = rest.slice(0, markerIdx);
    if (!REQUIREMENT_TO_DOC_TYPE[req]) return null;
    const afterMarker = rest.slice(markerIdx + renewMarker.length);
    const docId =
      afterMarker.startsWith(":") && afterMarker.length > 1
        ? afterMarker.slice(1)
        : undefined;
    return { requirement: req, renew: true, ...(docId ? { docId } : {}) };
  }

  // Plain hash — no renew marker.
  if (!REQUIREMENT_TO_DOC_TYPE[rest]) return null;
  return { requirement: rest, renew: false };
}

async function uploadFileToStorage(file: File): Promise<{ fileKey: string; mimeType: string; size: number }> {
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error(`File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`);
  }
  const initRes = await fetch("/api/uploads/request-url", { method: "POST" });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body?.error ?? `Upload URL request failed (${initRes.status})`);
  }
  const { uploadUrl, objectPath } = (await initRes.json()) as {
    uploadUrl: string;
    objectPath: string;
  };
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }
  return { fileKey: objectPath, mimeType, size: file.size };
}

export function AddComplianceDocButton({
  contactId,
  label = "+ Upload compliance document",
}: {
  contactId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [initialType, setInitialType] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Honour deep-links from the assignment-warning toast for *missing* docs
  // (/contacts/<id>#compliance-<requirement>): scroll the upload control into
  // view, focus it, and pre-open the modal with the right doc type selected.
  // Renew-variant hashes (#compliance-<req>-renew) are handled exclusively by
  // RenewComplianceDocButton and are deliberately ignored here.
  useEffect(() => {
    function syncFromHash() {
      const result = readFromHash();
      if (!result || result.renew) return;
      const docType = REQUIREMENT_TO_DOC_TYPE[result.requirement];
      if (!docType) return;
      buttonRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      buttonRef.current?.focus();
      setInitialType(docType);
      setOpen(true);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn-sm btn-primary"
        onClick={() => {
          setInitialType(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <UploadModal
          contactId={contactId}
          initialType={initialType ?? undefined}
          onClose={() => {
            setOpen(false);
            setInitialType(null);
            // Clear the deep-link fragment so the modal doesn't re-open if the
            // user closes it and refreshes the page. Only strip hashes we
            // actually own so unrelated future anchors aren't disturbed.
            if (typeof window !== "undefined") {
              const h = window.location.hash.replace(/^#/, "");
              if (h === "compliance" || h.startsWith("compliance-")) {
                const url = new URL(window.location.href);
                url.hash = "";
                window.history.replaceState(null, "", url.toString());
              }
            }
          }}
        />
      )}
    </>
  );
}

export function RenewComplianceDocButton({
  doc,
  label,
}: {
  doc: ManagedDoc;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Honour renew deep-links from the assignment-warning toast
  // (/contacts/<id>#compliance-<requirement>-renew): scroll this button into
  // view and auto-open the Renew modal when the hash targets the requirement
  // that matches this document's type.
  const requirement = DOC_TYPE_TO_REQUIREMENT[doc.type.toLowerCase()];
  useEffect(() => {
    if (!requirement) return;
    function syncFromHash() {
      const result = readFromHash();
      if (!result || !result.renew) return;
      // When the hash carries a docId, match exactly on doc.id to avoid
      // opening multiple modals when several expired docs share the same type.
      // Without a docId (legacy / fallback), match by requirement instead.
      if (result.docId ? result.docId !== doc.id : result.requirement !== requirement) return;
      buttonRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      buttonRef.current?.focus();
      setOpen(true);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [requirement, doc.id]);

  function handleClose() {
    setOpen(false);
    // Clear the renew deep-link fragment so the modal doesn't re-open on refresh.
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace(/^#/, "");
      if (h.startsWith("compliance-") && h.endsWith("-renew")) {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState(null, "", url.toString());
      }
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn-xs"
        onClick={() => setOpen(true)}
        title={`Renew ${doc.name}`}
      >
        {label ?? "Renew"}
      </button>
      {open && <RenewModal doc={doc} onClose={handleClose} />}
    </>
  );
}

function UploadModal({
  contactId,
  initialType,
  onClose,
}: {
  contactId: string;
  initialType?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<string>(
    initialType && TYPE_OPTIONS.some((o) => o.value === initialType)
      ? initialType
      : "insurance"
  );
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);

  // When the modal is opened via a "Fix now" deep-link, move keyboard focus
  // to the document-type control so the user lands directly on the upload
  // form they were sent to.
  useEffect(() => {
    if (initialType) typeSelectRef.current?.focus();
  }, [initialType]);

  const opt = TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0];

  function submit() {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    const docName = name.trim() || file?.name || "";
    if (!docName) {
      setError("Choose a file or enter a document name");
      return;
    }
    if (opt.needsExpiry && !expiresAt) {
      setError("Expiry date is required for this document type");
      return;
    }
    startTransition(async () => {
      try {
        let fileKey: string | null = null;
        if (file) {
          const stored = await uploadFileToStorage(file);
          fileKey = stored.fileKey;
        }
        await uploadContractorComplianceDoc(contactId, {
          type,
          name: docName,
          expiresAt: expiresAt || null,
          fileKey,
        });
        router.refresh();
        onClose();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <Modal title="Upload compliance document" onClose={onClose} disabled={pending}>
      <Field label="Document type">
        <select
          ref={typeSelectRef}
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={pending}
          style={inputStyle}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Document name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Defaults to file name"
          disabled={pending}
          style={inputStyle}
        />
      </Field>
      <Field label={`Expires on${opt.needsExpiry ? " *" : " (optional)"}`}>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          disabled={pending}
          style={inputStyle}
        />
      </Field>
      <Field label="File">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          disabled={pending}
          style={{ width: "100%", fontSize: 11 }}
        />
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 3 }}>
          {ALLOWED_UPLOAD_TYPES_LABEL} · max {MAX_UPLOAD_SIZE_LABEL}
        </div>
      </Field>
      {error && (
        <div style={{ fontSize: 11, color: "var(--red-txt)", marginTop: 4 }}>{error}</div>
      )}
      <FooterButtons onCancel={onClose} onSubmit={submit} pending={pending} submitLabel="Save" />
    </Modal>
  );
}

function RenewModal({
  doc,
  onClose,
}: {
  doc: ManagedDoc;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(doc.name);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const expiryRequired =
    doc.type === "insurance" || doc.type === "license" || !!doc.expiresAt;

  function submit() {
    setError(null);
    if (expiryRequired && !expiresAt) {
      setError("New expiry date is required");
      return;
    }
    const file = fileRef.current?.files?.[0] ?? null;
    startTransition(async () => {
      try {
        let fileKey: string | null = null;
        if (file) {
          const stored = await uploadFileToStorage(file);
          fileKey = stored.fileKey;
        }
        await renewContractorComplianceDoc(doc.id, {
          name: name.trim() || doc.name,
          expiresAt,
          fileKey,
        });
        router.refresh();
        onClose();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Renewal failed");
      }
    });
  }

  return (
    <Modal title={`Renew ${doc.name}`} onClose={onClose} disabled={pending}>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 8 }}>
        Current status: <strong>{doc.computedStatus}</strong>
        {doc.expiresAt
          ? ` · Currently expires ${new Date(doc.expiresAt).toLocaleDateString()}`
          : ""}
      </div>
      <Field label="Document name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          style={inputStyle}
        />
      </Field>
      <Field label={`New expiry date${expiryRequired ? " *" : " (optional)"}`}>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          disabled={pending}
          style={inputStyle}
        />
      </Field>
      <Field label="Replace file (optional)">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          disabled={pending}
          style={{ width: "100%", fontSize: 11 }}
        />
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>
          Leave blank to keep the current file on record. {ALLOWED_UPLOAD_TYPES_LABEL} · max {MAX_UPLOAD_SIZE_LABEL}
        </div>
      </Field>
      {error && (
        <div style={{ fontSize: 11, color: "var(--red-txt)", marginTop: 4 }}>{error}</div>
      )}
      <FooterButtons onCancel={onClose} onSubmit={submit} pending={pending} submitLabel="Renew" />
    </Modal>
  );
}

export function ComplianceDocVersions({ versions }: { versions: DocVersion[] }) {
  const [open, setOpen] = useState(false);
  if (versions.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 9,
          color: "var(--text-tertiary)",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {open ? "▾" : "▸"} {versions.length} previous version{versions.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div
          style={{
            marginTop: 4,
            borderLeft: "2px solid var(--border-lo)",
            paddingLeft: 8,
          }}
        >
          {versions.map((v) => (
            <div
              key={v.id}
              style={{
                fontSize: 9,
                color: "var(--text-tertiary)",
                padding: "3px 0",
                borderBottom: "0.5px solid var(--border-lo)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ flexShrink: 0 }}>
                Replaced {new Date(v.replacedAt).toLocaleDateString()} ·{" "}
                {v.expiresAt
                  ? `Exp. ${new Date(v.expiresAt).toLocaleDateString()}`
                  : "No expiry"}
              </span>
              {v.fileKey ? (
                <a
                  href={`/api/objects/${v.fileKey.replace(/^\/?objects\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flexShrink: 0, color: "var(--blue-txt)", textDecoration: "underline" }}
                >
                  Download
                </a>
              ) : (
                <span style={{ flexShrink: 0, fontStyle: "italic" }}>No file</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 11,
  border: "0.5px solid var(--border-mid)",
  borderRadius: 3,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 500, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FooterButtons({
  onCancel,
  onSubmit,
  pending,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}>
      <button type="button" className="btn-sm" onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <button
        type="button"
        className="btn-sm btn-primary"
        onClick={onSubmit}
        disabled={pending}
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function Modal({
  title,
  onClose,
  disabled,
  children,
}: {
  title: string;
  onClose: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={() => !disabled && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 0,
          width: 420,
          maxWidth: "92vw",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--border-lo)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <button
            type="button"
            onClick={() => !disabled && onClose()}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "var(--text-tertiary)",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}
