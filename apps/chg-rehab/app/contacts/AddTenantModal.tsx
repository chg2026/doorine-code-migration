"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";

export type PropertyOpt = {
  id: string;
  code: string;
  address: string;
};

export type LeaseOpt = {
  id: string;
  propertyId: string;
  tenantName: string;
  rent: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
};

type Props = {
  properties: PropertyOpt[];
  leases: LeaseOpt[];
};

type LeaseMode = "new" | "existing" | "none";

/**
 * "Add tenant" affordance for the Tenants tab. Lets the user create a Contact
 * (type Tenant) and either:
 *   - link it to an existing Lease on the chosen property, or
 *   - create a brand-new Lease (with optional rent/dates/deposit), or
 *   - skip the lease entirely.
 *
 * In all create/link modes the user can attach a lease PDF, which is uploaded
 * to object storage and persisted as `leaseDocFileKey` in the Lease's meta so
 * `DocViewModal` can render the download link.
 */
export function AddTenantModal({ properties, leases }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  // Tenant fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Lease selection
  const [propertyId, setPropertyId] = useState<string>("");
  const [leaseMode, setLeaseMode] = useState<LeaseMode>("new");
  const [leaseId, setLeaseId] = useState<string>("");
  const [rent, setRent] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [deposit, setDeposit] = useState<string>("");

  // Lease PDF
  const [file, setFile] = useState<File | null>(null);

  const propertyLeases = useMemo(
    () => leases.filter((l) => l.propertyId === propertyId),
    [leases, propertyId]
  );

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setPropertyId("");
    setLeaseMode("new");
    setLeaseId("");
    setRent("");
    setStartDate("");
    setEndDate("");
    setDeposit("");
    setFile(null);
    setErr(null);
  }

  async function uploadFile(): Promise<{
    fileKey: string;
    leaseDoc: string;
  } | null> {
    if (!file) return null;
    const u = await fetch("/api/uploads", { method: "POST" }).then((r) =>
      r.json()
    );
    if (!u?.uploadURL) throw new Error("No upload URL available");
    const put = await fetch(u.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error("Lease PDF upload failed");
    const fileKey = (u.objectName || u.objectPath || "") as string;
    return { fileKey, leaseDoc: file.name };
  }

  async function submit() {
    if (!name.trim()) {
      setErr("Tenant name is required");
      return;
    }
    if (leaseMode !== "none" && !propertyId) {
      setErr("Choose a property for the lease");
      return;
    }
    if (leaseMode === "existing" && !leaseId) {
      setErr("Choose a lease to link");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const uploaded = await uploadFile();

      const lease =
        leaseMode === "none"
          ? null
          : leaseMode === "existing"
          ? {
              leaseId,
              ...(uploaded
                ? {
                    leaseDoc: uploaded.leaseDoc,
                    leaseDocFileKey: uploaded.fileKey,
                  }
                : {}),
            }
          : {
              propertyId,
              rent: rent.trim() || null,
              startDate: startDate || null,
              endDate: endDate || null,
              deposit: deposit.trim() || null,
              ...(uploaded
                ? {
                    leaseDoc: uploaded.leaseDoc,
                    leaseDocFileKey: uploaded.fileKey,
                  }
                : {}),
            };

      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "Tenant",
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          lease,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          billingAwareErrorMessage(
            res.status,
            j,
            `Could not add tenant (${res.status})`
          )
        );
      }
      const data = (await res.json()) as { contact?: { id?: string } };
      reset();
      setOpen(false);
      const newId = data.contact?.id;
      router.push(
        newId ? `/contacts?tab=tenants&id=${newId}` : "/contacts?tab=tenants"
      );
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not add tenant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-sm btn-primary"
        onClick={() => setOpen(true)}
      >
        + Add tenant
      </button>

      {open && (
        <div
          onClick={() => !busy && setOpen(false)}
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
              width: 480,
              maxWidth: "94vw",
              maxHeight: "92vh",
              overflow: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "0.5px solid var(--border-lo)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>Add tenant</div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
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

            <div
              style={{
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <Field label="Tenant name *">
                <input
                  className="input-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  style={inputStyle}
                />
              </Field>
              <div style={{ display: "flex", gap: 10 }}>
                <Field label="Email">
                  <input
                    className="input-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="input-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555-555-5555"
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div
                style={{
                  borderTop: "0.5px solid var(--border-lo)",
                  paddingTop: 12,
                }}
              >
                <Field label="Property">
                  <select
                    value={propertyId}
                    onChange={(e) => {
                      setPropertyId(e.target.value);
                      setLeaseId("");
                    }}
                    style={inputStyle}
                  >
                    <option value="">— Select a property —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.address}
                      </option>
                    ))}
                  </select>
                </Field>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 10,
                    fontSize: 11,
                  }}
                >
                  <ModeRadio
                    label="New lease"
                    value="new"
                    current={leaseMode}
                    onChange={setLeaseMode}
                  />
                  <ModeRadio
                    label={`Link existing${
                      propertyId
                        ? ` (${propertyLeases.length})`
                        : ""
                    }`}
                    value="existing"
                    current={leaseMode}
                    onChange={setLeaseMode}
                    disabled={!propertyId || propertyLeases.length === 0}
                  />
                  <ModeRadio
                    label="No lease yet"
                    value="none"
                    current={leaseMode}
                    onChange={setLeaseMode}
                  />
                </div>

                {leaseMode === "existing" && (
                  <div style={{ marginTop: 10 }}>
                    <Field label="Existing lease">
                      <select
                        value={leaseId}
                        onChange={(e) => setLeaseId(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">— Select a lease —</option>
                        {propertyLeases.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.tenantName}
                            {l.rent ? ` · $${l.rent}/mo` : ""}
                            {l.endDate
                              ? ` · ends ${new Date(
                                  l.endDate
                                ).toLocaleDateString()}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        marginTop: 4,
                      }}
                    >
                      Linking will overwrite the lease&rsquo;s tenant name with the
                      one above.
                    </div>
                  </div>
                )}

                {leaseMode === "new" && (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10 }}>
                      <Field label="Rent (USD/mo)">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={rent}
                          onChange={(e) => setRent(e.target.value)}
                          placeholder="1500"
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Deposit (USD)">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={deposit}
                          onChange={(e) => setDeposit(e.target.value)}
                          placeholder="1500"
                          style={inputStyle}
                        />
                      </Field>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Field label="Start date">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="End date">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {leaseMode !== "none" && (
                <div
                  style={{
                    borderTop: "0.5px solid var(--border-lo)",
                    paddingTop: 12,
                  }}
                >
                  <Field label="Lease document (PDF, optional)">
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      style={{ fontSize: 11 }}
                    />
                  </Field>
                  {file && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        marginTop: 4,
                      }}
                    >
                      {file.name} · {Math.round(file.size / 1024)} KB
                    </div>
                  )}
                </div>
              )}

              {err && (
                <div
                  style={{
                    padding: "8px 10px",
                    background: "#FCEBEB",
                    color: "#791F1F",
                    fontSize: 11,
                    borderRadius: 5,
                    border: "0.5px solid rgba(121,31,31,0.3)",
                  }}
                >
                  {err}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "0.5px solid var(--border-lo)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="btn-sm"
                disabled={busy}
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-sm btn-primary"
                disabled={busy}
                onClick={submit}
              >
                {busy ? "Saving…" : "Add tenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function ModeRadio({
  label,
  value,
  current,
  onChange,
  disabled,
}: {
  label: string;
  value: LeaseMode;
  current: LeaseMode;
  onChange: (v: LeaseMode) => void;
  disabled?: boolean;
}) {
  const active = current === value && !disabled;
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "6px 8px",
        fontSize: 11,
        background: active ? "#E8EFF1" : "var(--bg-secondary)",
        color: disabled
          ? "var(--text-tertiary)"
          : active
          ? "#143641"
          : "var(--text-secondary)",
        border: `0.5px solid ${active ? "#143641" : "var(--border-lo)"}`,
        borderRadius: 5,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 11,
  border: "0.5px solid var(--border-lo)",
  borderRadius: 5,
  background: "#fff",
};
