"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";

export type EditLeaseProps = {
  contactId: string;
  leaseId: string;
  isFormer: boolean;
  initialRent: string;
  initialStartDate: string;
  initialEndDate: string;
  initialDeposit: string;
  initialStatus: string;
  initialLeaseDoc: string;
  initialLeaseDocFileKey: string;
};

export function EditLeaseModal({
  contactId,
  leaseId,
  isFormer,
  initialRent,
  initialStartDate,
  initialEndDate,
  initialDeposit,
  initialStatus,
  initialLeaseDoc,
  initialLeaseDocFileKey,
}: EditLeaseProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmFormer, setConfirmFormer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rent, setRent] = useState(initialRent);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [deposit, setDeposit] = useState(initialDeposit);
  const [status, setStatus] = useState(initialStatus);
  const [file, setFile] = useState<File | null>(null);
  const [clearDoc, setClearDoc] = useState(false);

  function openModal() {
    setRent(initialRent);
    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
    setDeposit(initialDeposit);
    setStatus(initialStatus);
    setFile(null);
    setClearDoc(false);
    setErr(null);
    setOpen(true);
  }

  async function uploadFile(): Promise<{ fileKey: string; leaseDoc: string } | null> {
    if (!file) return null;
    const u = await fetch("/api/uploads", { method: "POST" }).then((r) => r.json());
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

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const uploaded = await uploadFile();

      const body: Record<string, unknown> = {
        rent: rent.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        deposit: deposit.trim() || null,
        status: status.trim() || null,
      };

      if (uploaded) {
        body.leaseDoc = uploaded.leaseDoc;
        body.leaseDocFileKey = uploaded.fileKey;
      } else if (clearDoc) {
        body.leaseDoc = null;
        body.leaseDocFileKey = null;
      }

      const res = await fetch(`/api/leases/${leaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(res.status, j, `Could not save lease (${res.status})`));
      }

      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not save lease");
    } finally {
      setBusy(false);
    }
  }

  async function markFormer() {
    setBusy(true);
    setErr(null);
    try {
      const [leaseRes, contactRes] = await Promise.all([
        fetch(`/api/leases/${leaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Ended" }),
        }),
        fetch(`/api/contacts/${contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meta: { status: "Former" } }),
        }),
      ]);
      if (!leaseRes.ok || !contactRes.ok) {
        const failedRes = leaseRes.ok ? contactRes : leaseRes;
        const j = await failedRes.json().catch(() => ({}));
        throw new Error(billingAwareErrorMessage(failedRes.status, j, "Could not mark as former"));
      }
      setConfirmFormer(false);
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not mark as former");
    } finally {
      setBusy(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: 3,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 11,
    padding: "5px 7px",
    border: "0.5px solid var(--border-lo)",
    borderRadius: 5,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    boxSizing: "border-box",
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn-sm" onClick={openModal} style={{ fontSize: 10 }}>
          ✏ Edit lease
        </button>
        {!isFormer && (
          <button
            className="btn-sm"
            onClick={() => { setConfirmFormer(true); setOpen(true); setErr(null); }}
            style={{ fontSize: 10, color: "var(--text-secondary)" }}
          >
            Mark as Former
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setConfirmFormer(false); } }}
        >
          <div style={{
            background: "var(--bg-primary)", borderRadius: 10,
            width: "min(420px, 95vw)", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{
              padding: "14px 16px 12px",
              borderBottom: "0.5px solid var(--border-lo)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {confirmFormer ? "Mark tenant as Former?" : "Edit lease"}
              </div>
              <button
                onClick={() => { setOpen(false); setConfirmFormer(false); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-secondary)", lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {err && (
                <div style={{
                  fontSize: 10, color: "#791F1F",
                  background: "#FCEBEB", borderRadius: 5,
                  padding: "6px 10px",
                }}>{err}</div>
              )}

              {confirmFormer ? (
                <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  This will set the lease status to <strong>Ended</strong> and mark the tenant as <strong>Former</strong>. This can be reversed by editing the lease again.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Rent (USD/mo)</label>
                      <input
                        type="number"
                        value={rent}
                        onChange={(e) => setRent(e.target.value)}
                        style={inputStyle}
                        placeholder="e.g. 1500"
                        min={0}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Deposit (USD)</label>
                      <input
                        type="number"
                        value={deposit}
                        onChange={(e) => setDeposit(e.target.value)}
                        style={inputStyle}
                        placeholder="e.g. 1500"
                        min={0}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Start date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>End date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Lease status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="Active">Active</option>
                      <option value="Ended">Ended</option>
                      <option value="Pending">Pending</option>
                      <option value="Renewed">Renewed</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Lease document (PDF)</label>
                    {initialLeaseDoc && !clearDoc && !file && (
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        fontSize: 10, color: "var(--text-secondary)",
                        background: "var(--bg-secondary)", borderRadius: 5,
                        padding: "5px 8px", marginBottom: 6,
                      }}>
                        <span>📄 {initialLeaseDoc}</span>
                        <button
                          onClick={() => setClearDoc(true)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 11 }}
                          title="Remove document"
                        >✕</button>
                      </div>
                    )}
                    {clearDoc && !file && (
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6 }}>
                        Document will be removed on save.{" "}
                        <button
                          onClick={() => setClearDoc(false)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 10, padding: 0 }}
                        >Undo</button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => { setFile(e.target.files?.[0] ?? null); setClearDoc(false); }}
                      style={{ fontSize: 10, width: "100%" }}
                    />
                    {file && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                        {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={{
              padding: "10px 16px",
              borderTop: "0.5px solid var(--border-lo)",
              display: "flex", justifyContent: "flex-end", gap: 8,
            }}>
              <button
                className="btn-sm"
                onClick={() => { setOpen(false); setConfirmFormer(false); }}
                disabled={busy}
                style={{ fontSize: 10 }}
              >
                Cancel
              </button>
              {confirmFormer ? (
                <button
                  className="btn-sm"
                  onClick={markFormer}
                  disabled={busy}
                  style={{ fontSize: 10, background: "#791F1F", color: "#fff", borderColor: "transparent" }}
                >
                  {busy ? "Saving…" : "Confirm — Mark as Former"}
                </button>
              ) : (
                <button
                  className="btn-sm"
                  onClick={save}
                  disabled={busy}
                  style={{ fontSize: 10, background: "var(--accent)", color: "#fff", borderColor: "transparent" }}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
