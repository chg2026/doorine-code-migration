"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";

type Modal =
  | null
  | { kind: "add" }
  | { kind: "edit-fin" }
  | { kind: "add-asset" }
  | { kind: "edit-asset"; id: string; name: string; category: string; cost?: number }
  | { kind: "view-asset"; id: string; name: string; category: string; notes?: string | null; installed?: string | null; warrantyEnd?: string | null }
  | { kind: "upload-doc" }
  | { kind: "view-doc"; id: string; name: string; category: string; status: string; expiresAt?: string | null; objectKey?: string | null }
  | { kind: "start-project" }
  | { kind: "to-rental" };

type PropertyLite = {
  id: string;
  status: string | null;
  meta: {
    purchasePrice?: number;
    closingCosts?: number;
    rehabSpent?: number;
    rehabBudget?: number;
    arv?: number;
    projectedRoi?: number;
  };
};

type StartRehabSeed = {
  propertyId: string;
  address: string;
  purchasePrice?: number | null;
  acquisitionDate?: string | null;     // ISO yyyy-mm-dd
  defaultMode?: string | null;         // server-provided default
  defaultBudget?: number | null;
};

export function AddPropertyButton() {
  const [open, setOpen] = useState(false);
  const gate = useBillingGateProps();
  return (
    <>
      <button
        className="btn-sm"
        onClick={() => setOpen(true)}
        disabled={gate.disabled}
        title={gate.title}
        style={{ whiteSpace: "nowrap", ...gate.style }}
        aria-disabled={gate.disabled || undefined}
      >
        + Add property
      </button>
      {open && <AddPropertyModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function ChangeToRentalButton({ property }: { property: PropertyLite }) {
  const [open, setOpen] = useState(false);
  const isRehab = (property.status || "").toLowerCase().includes("rehab");
  const isAcquired = (property.status || "").toLowerCase().includes("acquired");
  if (!isRehab && !isAcquired) return null;
  return (
    <>
      <button className="btn-sm" onClick={() => setOpen(true)} title="Switch this property to Rental status">
        Change status to Rental →
      </button>
      {open && <ChangeStatusModal propertyId={property.id} onClose={() => setOpen(false)} />}
    </>
  );
}

export function StartRehabButton({ seed }: { seed: StartRehabSeed }) {
  const [open, setOpen] = useState(false);
  const gate = useBillingGateProps();
  return (
    <>
      <button
        className="btn-sm btn-primary"
        onClick={() => setOpen(true)}
        disabled={gate.disabled}
        title={gate.title}
        style={gate.style}
        aria-disabled={gate.disabled || undefined}
      >
        Start rehab project →
      </button>
      {open && <StartRehabModal seed={seed} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditFinancialsButton({ property }: { property: PropertyLite }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-sm" onClick={() => setOpen(true)}>✎ Edit inputs</button>
      {open && <EditFinancialsModal property={property} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AddAssetButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const gate = useBillingGateProps();
  return (
    <>
      <button
        className="btn-sm btn-primary"
        onClick={() => setOpen(true)}
        disabled={gate.disabled}
        title={gate.title}
        style={gate.style}
        aria-disabled={gate.disabled || undefined}
      >
        + Add asset
      </button>
      {open && <AssetModal propertyId={propertyId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AssetRowActions({
  propertyId,
  asset,
}: {
  propertyId: string;
  asset: { id: string; name: string; category: string; notes: string | null; installed: string | null; warrantyEnd: string | null };
}) {
  const [modal, setModal] = useState<Modal>(null);
  return (
    <>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          className="btn-xs"
          onClick={() => setModal({ kind: "view-asset", id: asset.id, name: asset.name, category: asset.category, notes: asset.notes, installed: asset.installed, warrantyEnd: asset.warrantyEnd })}
        >
          View
        </button>
        <button
          className="btn-xs"
          onClick={() => {
            const cost = asset.notes ? Number((asset.notes.match(/\$([\d,]+)/) || [])[1]?.replace(/,/g, "") || 0) : undefined;
            setModal({ kind: "edit-asset", id: asset.id, name: asset.name, category: asset.category, cost });
          }}
        >
          Edit
        </button>
      </div>
      {modal?.kind === "view-asset" && <ViewAssetModal asset={modal} onClose={() => setModal(null)} />}
      {modal?.kind === "edit-asset" && <AssetModal propertyId={propertyId} asset={modal} onClose={() => setModal(null)} />}
    </>
  );
}

export function UploadDocButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const gate = useBillingGateProps();
  return (
    <>
      <button
        className="btn-sm btn-primary"
        onClick={() => setOpen(true)}
        disabled={gate.disabled}
        title={gate.title}
        style={gate.style}
        aria-disabled={gate.disabled || undefined}
      >
        + Upload document
      </button>
      {open && <UploadDocModal propertyId={propertyId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DocRowActions({
  doc,
}: {
  doc: { id: string; name: string; category: string; status: string; expiresAt: string | null; objectKey: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button className="btn-xs" onClick={() => setOpen(true)}>View</button>
        {doc.objectKey && (
          <a className="btn-xs" href={`/api/objects/${doc.objectKey}`} target="_blank" rel="noreferrer">
            Download
          </a>
        )}
      </div>
      {open && <ViewDocModal doc={doc} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Modals ────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 8, width: width ?? 480, maxWidth: "92vw",
          maxHeight: "85vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{
          padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return { width: "100%", padding: "6px 8px", fontSize: 12, border: "0.5px solid var(--border-lo)", borderRadius: 4, fontFamily: "inherit" };
}

function FormButtons({ onCancel, submitting, submitLabel }: { onCancel: () => void; submitting: boolean; submitLabel?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
      <button type="button" className="btn-sm" onClick={onCancel} disabled={submitting}>Cancel</button>
      <button type="submit" className="btn-sm btn-primary" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel ?? "Save"}
      </button>
    </div>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div style={{ padding: 8, background: "#FEE", border: "0.5px solid #F4B7B7", color: "#A32D2D", borderRadius: 4, fontSize: 11, marginBottom: 10 }}>
      {error}
    </div>
  );
}

// ── Add property ─────────────────────────────────────────────────────
function AddPropertyModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title="Add property" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: fd.get("address"),
            city: fd.get("city"),
            state: fd.get("state"),
            zip: fd.get("zip"),
            status: fd.get("status"),
            purchasePrice: Number(fd.get("purchasePrice") || 0) || null,
          }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to create property"));
          return;
        }
        const { id } = await res.json();
        router.push(`/property?id=${id}&tab=overview`);
        router.refresh();
      }}>
        <ErrorBanner error={error} />
        <Field label="Address"><input name="address" required style={inputStyle()} placeholder="2247 Meadowbrook Blvd." /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 90px", gap: 8 }}>
          <Field label="City"><input name="city" required defaultValue="Cleveland" style={inputStyle()} /></Field>
          <Field label="State"><input name="state" required defaultValue="OH" maxLength={2} style={inputStyle()} /></Field>
          <Field label="ZIP"><input name="zip" required defaultValue="44106" style={inputStyle()} /></Field>
        </div>
        <Field label="Status">
          <select name="status" defaultValue="Acquired" style={inputStyle()}>
            <option>Acquired</option>
            <option>Active rehab</option>
            <option>Rental</option>
            <option>Listed</option>
            <option>Sold</option>
          </select>
        </Field>
        <Field label="Purchase price (optional)"><input name="purchasePrice" type="number" min={0} style={inputStyle()} placeholder="0" /></Field>
        <FormButtons onCancel={onClose} submitting={submitting} submitLabel="Create property" />
      </form>
    </ModalShell>
  );
}

// ── Change status ────────────────────────────────────────────────────
function ChangeStatusModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title="Change status to Rental" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const res = await fetch(`/api/properties/${propertyId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Rental · Tenanted" }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to update status"));
          return;
        }
        onClose();
        router.refresh();
      }}>
        <ErrorBanner error={error} />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
          This converts the property from rehab/acquired to <strong>Rental · Tenanted</strong>. The Tenants tab will become editable and you’ll be able to add a lease in Contacts → Tenants.
        </div>
        <FormButtons onCancel={onClose} submitting={submitting} submitLabel="Convert to Rental" />
      </form>
    </ModalShell>
  );
}

// ── Start rehab project ──────────────────────────────────────────────
function StartRehabModal({ seed, onClose }: { seed: StartRehabSeed; onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultName = `${seed.address} — Rehab project`;
  const defaultBudget = seed.defaultBudget
    ?? (seed.purchasePrice ? Math.round(seed.purchasePrice * 0.18) : null);
  const defaultMode = seed.defaultMode || "rehab-then-rent";

  return (
    <ModalShell title="Start rehab project" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch(`/api/properties/${seed.propertyId}/start-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name") || undefined,
            budget: Number(fd.get("budget") || 0) || null,
            mode: fd.get("mode"),
          }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to start project"));
          return;
        }
        const created = (await res.json().catch(() => ({}))) as { code?: string };
        onClose();
        const target = created.code ? `/rehab?project=${encodeURIComponent(created.code)}` : "/rehab";
        router.push(target);
        router.refresh();
      }}>
        <ErrorBanner error={error} />

        <Field label="Property">
          <input
            value={seed.address}
            readOnly
            style={{ ...inputStyle(), background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Purchase price">
            <input
              value={seed.purchasePrice != null ? `$${seed.purchasePrice.toLocaleString()}` : "—"}
              readOnly
              style={{ ...inputStyle(), background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
            />
          </Field>
          <Field label="Acquired">
            <input
              value={seed.acquisitionDate ?? "—"}
              readOnly
              style={{ ...inputStyle(), background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
            />
          </Field>
        </div>

        <Field label="Project name">
          <input name="name" defaultValue={defaultName} style={inputStyle()} />
        </Field>

        <Field label="Rehab budget (USD)">
          <input
            name="budget"
            type="number"
            min={0}
            defaultValue={defaultBudget ?? ""}
            placeholder={defaultBudget ? `Suggested $${defaultBudget.toLocaleString()}` : ""}
            style={inputStyle()}
          />
        </Field>

        <Field label="Mode (company default pre-selected)">
          <select name="mode" defaultValue={defaultMode} style={inputStyle()}>
            <option value="rehab-then-rent">Rehab then rent</option>
            <option value="rehab-then-flip">Rehab then flip</option>
            <option value="brrrr">BRRRR</option>
          </select>
        </Field>

        <FormButtons onCancel={onClose} submitting={submitting} submitLabel="Start project →" />
      </form>
    </ModalShell>
  );
}

// ── Edit financials ──────────────────────────────────────────────────
function EditFinancialsModal({ property, onClose }: { property: PropertyLite; onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = property.meta;
  return (
    <ModalShell title="Edit financial inputs" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch(`/api/properties/${property.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meta: {
              purchasePrice: numOrNull(fd.get("purchasePrice")),
              closingCosts: numOrNull(fd.get("closingCosts")),
              rehabBudget: numOrNull(fd.get("rehabBudget")),
              rehabSpent: numOrNull(fd.get("rehabSpent")),
              arv: numOrNull(fd.get("arv")),
              projectedRoi: numOrNull(fd.get("projectedRoi")),
            },
          }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to save"));
          return;
        }
        onClose();
        router.refresh();
      }}>
        <ErrorBanner error={error} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Purchase price"><input name="purchasePrice" type="number" defaultValue={m.purchasePrice ?? ""} style={inputStyle()} /></Field>
          <Field label="Closing costs"><input name="closingCosts" type="number" defaultValue={m.closingCosts ?? ""} style={inputStyle()} /></Field>
          <Field label="Rehab budget"><input name="rehabBudget" type="number" defaultValue={m.rehabBudget ?? ""} style={inputStyle()} /></Field>
          <Field label="Rehab spent"><input name="rehabSpent" type="number" defaultValue={m.rehabSpent ?? ""} style={inputStyle()} /></Field>
          <Field label="ARV"><input name="arv" type="number" defaultValue={m.arv ?? ""} style={inputStyle()} /></Field>
          <Field label="Projected ROI %"><input name="projectedRoi" type="number" step="0.1" defaultValue={m.projectedRoi ?? ""} style={inputStyle()} /></Field>
        </div>
        <FormButtons onCancel={onClose} submitting={submitting} />
      </form>
    </ModalShell>
  );
}

// ── Asset modal (add/edit) ───────────────────────────────────────────
function AssetModal({
  propertyId,
  asset,
  onClose,
}: {
  propertyId: string;
  asset?: { id: string; name: string; category: string; cost?: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!asset;
  return (
    <ModalShell title={isEdit ? "Edit asset" : "Add asset"} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const url = isEdit ? `/api/properties/${propertyId}/assets/${asset!.id}` : `/api/properties/${propertyId}/assets`;
        const res = await fetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name"),
            category: fd.get("category"),
            cost: Number(fd.get("cost") || 0) || null,
            installedDate: fd.get("installedDate") || null,
            warrantyMonths: Number(fd.get("warrantyMonths") || 0) || null,
          }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to save"));
          return;
        }
        onClose();
        router.refresh();
      }}>
        <ErrorBanner error={error} />
        <Field label="Name"><input name="name" required defaultValue={asset?.name ?? ""} style={inputStyle()} /></Field>
        <Field label="Category">
          <select name="category" defaultValue={asset?.category ?? "Appliances"} style={inputStyle()}>
            <option>Appliances</option><option>HVAC</option><option>Plumbing</option><option>Electrical</option><option>Doors & windows</option><option>Flooring</option>
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Field label="Cost"><input name="cost" type="number" defaultValue={asset?.cost ?? ""} style={inputStyle()} /></Field>
          <Field label="Installed"><input name="installedDate" type="date" style={inputStyle()} /></Field>
          <Field label="Warranty (mo)"><input name="warrantyMonths" type="number" min={0} style={inputStyle()} /></Field>
        </div>
        <FormButtons onCancel={onClose} submitting={submitting} />
      </form>
    </ModalShell>
  );
}

function ViewAssetModal({ asset, onClose }: {
  asset: { name: string; category: string; notes?: string | null; installed?: string | null; warrantyEnd?: string | null };
  onClose: () => void;
}) {
  return (
    <ModalShell title={asset.name} onClose={onClose}>
      <div style={{ fontSize: 11, lineHeight: 1.7 }}>
        <Row k="Category" v={asset.category} />
        <Row k="Installed" v={asset.installed ? new Date(asset.installed).toLocaleDateString() : "—"} />
        <Row k="Warranty" v={asset.warrantyEnd ? new Date(asset.warrantyEnd).toLocaleDateString() : "—"} />
        {asset.notes && <Row k="Notes" v={asset.notes} />}
      </div>
    </ModalShell>
  );
}

// ── Document upload + view ───────────────────────────────────────────
function UploadDocModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title="Upload document" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch(`/api/properties/${propertyId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name"),
            category: fd.get("category"),
            expiresAt: fd.get("expiresAt") || null,
            objectKey: fd.get("objectKey") || null,
          }),
        });
        if (!res.ok) {
          setSubmitting(false);
          const j = await res.json().catch(() => ({}));
          setError(billingAwareErrorMessage(res.status, j, "Failed to upload"));
          return;
        }
        onClose();
        router.refresh();
      }}>
        <ErrorBanner error={error} />
        <Field label="Name"><input name="name" required style={inputStyle()} placeholder="Roof inspection report" /></Field>
        <Field label="Category">
          <select name="category" defaultValue="Title" style={inputStyle()}>
            <option>Title</option><option>Permit</option><option>Inspection</option><option>Insurance</option><option>Survey</option><option>Other</option>
          </select>
        </Field>
        <Field label="Expires (optional)"><input name="expiresAt" type="date" style={inputStyle()} /></Field>
        <Field label="Object key (optional)"><input name="objectKey" style={inputStyle()} placeholder="uploads/abc123.pdf" /></Field>
        <FormButtons onCancel={onClose} submitting={submitting} submitLabel="Save document" />
      </form>
    </ModalShell>
  );
}

function ViewDocModal({ doc, onClose }: {
  doc: { id: string; name: string; category: string; status: string; expiresAt: string | null; objectKey: string | null };
  onClose: () => void;
}) {
  return (
    <ModalShell title={doc.name} onClose={onClose}>
      <div style={{ fontSize: 11, lineHeight: 1.7 }}>
        <Row k="Category" v={doc.category} />
        <Row k="Status" v={doc.status} />
        <Row k="Expires" v={doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : "—"} />
        <div style={{
          marginTop: 10, padding: "8px 10px",
          background: "var(--bg-secondary)", borderRadius: 5,
          fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5,
        }}>
          Also visible in <a href={`/docs?id=${encodeURIComponent(doc.id)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>Documents Hub →</a>
        </div>
        {doc.objectKey && (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <a className="btn-sm btn-primary" href={`/api/objects/${doc.objectKey}`} target="_blank" rel="noreferrer">Download file</a>
            <a className="btn-sm" href={`/docs?id=${encodeURIComponent(doc.id)}`}>Open in Documents Hub →</a>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
