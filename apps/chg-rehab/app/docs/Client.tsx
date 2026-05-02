"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  statusClass,
  statusLabel,
  formatDateET,
  type EffectiveDocStatus,
} from "@/lib/docStatus";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";

type Doc = {
  id: string;
  name: string;
  level: "Project" | "Property" | "Company" | "Contact";
  category: string;
  status: "Active" | "Expired" | "Pending" | "Archived" | "Staged";
  expiresAt: string | null;
  uploadedAt: string;
  fileKey: string | null;
  meta: string;
  projectId: string | null;
  propertyId: string | null;
  contactId: string | null;
  eff: EffectiveDocStatus;
  /** Synthetic rows surfaced when a contractor lacks a toggled-on
   * required compliance doc (W-9 / COI / Trade-license). */
  requiredMissing?: boolean;
};

type Project = { id: string; code: string; name: string };
type Property = { id: string; code: string; address: string };
type Contact = { id: string; name: string };

const LEVELS: { code: Doc["level"]; label: string }[] = [
  { code: "Project", label: "Project" },
  { code: "Property", label: "Property" },
  { code: "Company", label: "Company" },
  { code: "Contact", label: "Individual" },
];

const STATUSES: { code: "all-status" | EffectiveDocStatus; label: string }[] = [
  { code: "all-status", label: "All" },
  { code: "active", label: "Active" },
  { code: "expiring", label: "Expiring" },
  { code: "expired", label: "Expired" },
];

const CATEGORIES: { code: string; label: string }[] = [
  { code: "cat-all", label: "All categories" },
  { code: "contracts", label: "Contracts" },
  { code: "insurance-coi", label: "Insurance & COI" },
  { code: "permits", label: "Permits & licenses" },
  { code: "financials", label: "Financials" },
  { code: "misc-admin", label: "Misc admin" },
];

export default function DocsClient(props: {
  docs: Doc[];
  thresholdDays: number;
  projects: Project[];
  properties: Property[];
  contacts: Contact[];
  canEdit: boolean;
  filters: {
    level: Doc["level"];
    status: typeof STATUSES[number]["code"];
    cat: string;
    q: string;
  };
  counts: {
    levelCounts: Record<Doc["level"], number>;
    statusCounts: Record<string, number>;
    catCounts: Record<string, number>;
  };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const { level, status: statusFilter, cat: catFilter, q: queryFromUrl } = props.filters;
  const [search, setSearch] = useState(queryFromUrl);
  const [openModal, setOpenModal] = useState<
    | null
    | { kind: "promote"; doc: Doc }
    | { kind: "view"; doc: Doc }
    | { kind: "upload" }
  >(null);

  const gate = useBillingGateProps();

  const pushFilters = (next: Partial<{ level: string; status: string; cat: string; q: string }>) => {
    const params = new URLSearchParams();
    const merged = { level, status: statusFilter, cat: catFilter, q: search, ...next };
    if (merged.level && merged.level !== "Project") params.set("level", merged.level);
    if (merged.status && merged.status !== "all-status") params.set("status", merged.status);
    if (merged.cat && merged.cat !== "cat-all") params.set("cat", merged.cat);
    if (merged.q) params.set("q", merged.q);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/docs?${qs}` : "/docs"));
  };

  const setLevel = (l: Doc["level"]) =>
    pushFilters({ level: l, status: "all-status", cat: "cat-all" });
  const setStatusFilter = (s: typeof STATUSES[number]["code"]) => pushFilters({ status: s });
  const setCatFilter = (c: string) => pushFilters({ cat: c });
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pushFilters({ q: search });
  };

  const { levelCounts, statusCounts, catCounts } = props.counts;
  const filtered = props.docs;

  return (
    <div className="module active">
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">Documents Hub</span>
          <span className="proj-chip">All levels</span>
        </div>
        <div className="proj-r">
          {props.canEdit && (
            <button
              className="btn-sm btn-green"
              onClick={() => setOpenModal({ kind: "upload" })}
              disabled={gate.disabled}
              title={gate.title}
              style={gate.style}
              aria-disabled={gate.disabled || undefined}
            >
              + Upload document
            </button>
          )}
        </div>
      </div>

      <div className="doc-layout" style={{ flex: 1 }}>
        <div className="doc-left">
          <div className="ln-sec">
            <div className="ln-hd">Level</div>
            {LEVELS.map((l) => (
              <div
                key={l.code}
                className={`ln-item${level === l.code ? " active" : ""}`}
                onClick={() => setLevel(l.code)}
              >
                {l.label} docs
                <span className="ln-count">{levelCounts[l.code]}</span>
              </div>
            ))}
          </div>
          <div className="ln-sec">
            <div className="ln-hd">Status</div>
            {STATUSES.map((s) => {
              const warn = s.code === "expiring" || s.code === "expired";
              const c = statusCounts[s.code] ?? 0;
              return (
                <div
                  key={s.code}
                  className={`ln-item${statusFilter === s.code ? " active" : ""}`}
                  style={
                    warn
                      ? { color: s.code === "expired" ? "var(--red-txt)" : "var(--amber-txt)" }
                      : undefined
                  }
                  onClick={() => setStatusFilter(s.code)}
                >
                  {s.label}
                  <span className={warn && c > 0 ? "ln-warn" : "ln-count"}>{c}</span>
                </div>
              );
            })}
          </div>
          <div className="ln-sec">
            <div className="ln-hd">Category</div>
            {CATEGORIES.map((c) => (
              <div
                key={c.code}
                className={`ln-item${catFilter === c.code ? " active" : ""}`}
                onClick={() => setCatFilter(c.code)}
              >
                {c.label}
                <span className="ln-count">{catCounts[c.code] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="doc-main">
          <form className="search-bar" onSubmit={onSearchSubmit}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-primary)",
                minWidth: 120,
              }}
            >
              {LEVELS.find((l) => l.code === level)?.label} docs
            </span>
            <input
              className="search-input"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => {
                if (search !== queryFromUrl) pushFilters({ q: search });
              }}
            />
            {props.canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOpenModal({ kind: "upload" })}
                disabled={gate.disabled}
                title={gate.title}
                style={gate.style}
                aria-disabled={gate.disabled || undefined}
              >
                + Upload
              </button>
            )}
          </form>
          <div className="doc-tbl-hd">
            <span className="col-label">Document</span>
            <span className="col-label">Type</span>
            <span className="col-label">Status</span>
            <span className="col-label">Date (ET)</span>
            <span className="col-label" style={{ textAlign: "right" }}>
              Actions
            </span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                No documents match these filters.
              </div>
            )}
            {filtered.map((d) => {
              if (d.requiredMissing) {
                return (
                  <div
                    key={d.id}
                    className="doc-tbl-row"
                    style={{ background: "#FCEBEB" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="doc-name">{d.name}</div>
                      <div className="doc-meta">{d.meta}</div>
                    </div>
                    <div className="doc-type-cell">{labelForCategory(d.category)}</div>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 7px",
                        borderRadius: 10,
                        fontWeight: 700,
                        background: "#791F1F",
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ⛔ Required
                    </span>
                    <div className="doc-date-cell">—</div>
                    <div className="doc-acts">
                      {props.canEdit && (
                        <button
                          className="view-btn"
                          style={{
                            background: "var(--blue)",
                            color: "#fff",
                            borderColor: "var(--blue)",
                            ...(gate.style ?? {}),
                          }}
                          onClick={() => setOpenModal({ kind: "upload" })}
                          title={gate.title ?? "Upload the required document"}
                          disabled={gate.disabled}
                          aria-disabled={gate.disabled || undefined}
                        >
                          Upload
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              return (
              <div
                key={d.id}
                className="doc-tbl-row"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(".view-btn,.cell-dl")) return;
                  setOpenModal({ kind: "view", doc: d });
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="doc-name">{d.name}</div>
                  <div className="doc-meta">{d.meta}</div>
                </div>
                <div className="doc-type-cell">{labelForCategory(d.category)}</div>
                <span className={statusClass(d.eff)}>{statusLabel(d.eff)}</span>
                <div className="doc-date-cell">
                  {formatDateET(d.expiresAt ?? d.uploadedAt)}
                </div>
                <div className="doc-acts">
                  <button
                    className="view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenModal({ kind: "view", doc: d });
                    }}
                  >
                    View
                  </button>
                  {d.eff === "staged" && props.canEdit && (
                    <button
                      className="view-btn"
                      style={{ background: "var(--blue)", color: "#fff", borderColor: "var(--blue)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenModal({ kind: "promote", doc: d });
                      }}
                    >
                      Promote
                    </button>
                  )}
                  {d.fileKey && (
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="cell-dl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↓
                    </a>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {openModal?.kind === "view" && (
        <DocViewModal doc={openModal.doc} onClose={() => setOpenModal(null)} />
      )}
      {openModal?.kind === "promote" && (
        <PromoteModal
          doc={openModal.doc}
          onClose={() => setOpenModal(null)}
          onSaved={() => {
            setOpenModal(null);
            refresh();
          }}
        />
      )}
      {openModal?.kind === "upload" && (
        <UploadModal
          projects={props.projects}
          properties={props.properties}
          contacts={props.contacts}
          defaultLevel={level}
          onClose={() => setOpenModal(null)}
          onSaved={() => {
            setOpenModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function labelForCategory(c: string) {
  switch (c) {
    case "contracts":
      return "Contract";
    case "insurance-coi":
      return "Insurance";
    case "permits":
      return "Permit";
    case "financials":
      return "Financial";
    case "misc-admin":
      return "Misc";
    default:
      return c;
  }
}

function DocViewModal(props: { doc: Doc; onClose: () => void }) {
  const d = props.doc;
  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">{d.name}</div>
            <div className="modal-sub">{d.meta || labelForCategory(d.category)}</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <div className="form-label">Level</div>
            <div style={{ fontSize: 13 }}>{d.level}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Category</div>
            <div style={{ fontSize: 13 }}>{labelForCategory(d.category)}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Stored status</div>
            <div style={{ fontSize: 13 }}>{d.status}</div>
          </div>
          <div className="form-group">
            <div className="form-label">Uploaded</div>
            <div style={{ fontSize: 13 }}>{formatDateET(d.uploadedAt)}</div>
          </div>
          {d.expiresAt && (
            <div className="form-group">
              <div className="form-label">Expires</div>
              <div style={{ fontSize: 13 }}>{formatDateET(d.expiresAt)}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          {d.fileKey && (
            <a
              href={`/api/documents/${d.id}/download`}
              className="btn-sm btn-primary"
              target="_blank"
              rel="noreferrer"
            >
              Download
            </a>
          )}
          <button className="btn-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoteModal(props: { doc: Doc; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<string>(
    props.doc.category && props.doc.category !== "misc-admin" ? props.doc.category : "permits"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/documents/${props.doc.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(res.status, j, "Promote failed"));
      }
      props.onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Promote staged document</div>
            <div className="modal-sub">{props.doc.name}</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Move to category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.filter((c) => c.code !== "cat-all").map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="form-note">
              The document moves out of &quot;Pending review&quot; and becomes Active.
            </div>
          </div>
          {err && <div className="login-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-sm btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Promote"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadModal(props: {
  projects: Project[];
  properties: Property[];
  contacts: Contact[];
  defaultLevel: Doc["level"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Doc["level"]>(props.defaultLevel);
  const [category, setCategory] = useState("contracts");
  const [refId, setRefId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [staged, setStaged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      let fileKey: string | null = null;
      let mimeType: string | null = null;
      let size: number | null = null;
      if (file) {
        const u = await fetch("/api/uploads", { method: "POST" }).then((r) => r.json());
        if (!u?.uploadURL) throw new Error("No upload URL available");
        const put = await fetch(u.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed");
        fileKey = u.objectName || u.key || null;
        mimeType = file.type;
        size = file.size;
      }

      const body: Record<string, unknown> = {
        name,
        level,
        category,
        status: staged ? "Staged" : "Active",
        fileKey,
        mimeType,
        size,
        expiresAt: expiresAt || null,
      };
      if (level === "Project") body.projectId = refId || null;
      if (level === "Property") body.propertyId = refId || null;
      if (level === "Contact") body.contactId = refId || null;

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(res.status, j, "Save failed"));
      }
      props.onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={props.onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Upload document</div>
            <div className="modal-sub">Attach a file and tag its level + category</div>
          </div>
          <button className="modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">
              Document name<span className="form-req">*</span>
            </label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Level</label>
              <select
                className="form-select"
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value as Doc["level"]);
                  setRefId("");
                }}
              >
                {LEVELS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.filter((c) => c.code !== "cat-all").map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {level !== "Company" && (
            <div className="form-group">
              <label className="form-label">
                {level === "Project"
                  ? "Project"
                  : level === "Property"
                  ? "Property"
                  : "Contact"}
              </label>
              <select
                className="form-select"
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
              >
                <option value="">— Select —</option>
                {level === "Project" &&
                  props.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                {level === "Property" &&
                  props.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.address}
                    </option>
                  ))}
                {level === "Contact" &&
                  props.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Expires</label>
              <input
                className="form-input"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">File</label>
              <input
                className="form-input"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="form-group">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={staged}
                onChange={(e) => setStaged(e.target.checked)}
              />{" "}
              Mark as Staged (pending review)
            </label>
          </div>
          {err && <div className="login-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-sm" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-sm btn-green"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {busy ? "Uploading…" : "Save document"}
          </button>
        </div>
      </div>
    </div>
  );
}
