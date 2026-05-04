"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";

type ContactType = "Contractor" | "Vendor" | "Inspector" | "Tenant" | "Other";

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "Contractor",  label: "Contractor" },
  { value: "Vendor",      label: "Vendor & Supplier" },
  { value: "Inspector",   label: "Inspector" },
  { value: "Tenant",      label: "Tenant" },
  { value: "Other",       label: "Other" },
];

const EXTRA_LABEL: Partial<Record<ContactType, string>> = {
  Contractor: "Trade / specialty",
  Vendor:     "Category",
  Inspector:  "Discipline",
};

const EXTRA_PLACEHOLDER: Partial<Record<ContactType, string>> = {
  Contractor: "e.g. Electrical, Plumbing, HVAC…",
  Vendor:     "e.g. Lumber, Hardware, Paint…",
  Inspector:  "e.g. Structural, Electrical, Plumbing…",
};

export function AddContactModal({ defaultType = "Contractor" }: { defaultType?: ContactType }) {
  const [open, setOpen]           = useState(false);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [contactType, setContactType] = useState<ContactType>(defaultType);
  const router = useRouter();

  const [name,    setName]    = useState("");
  const [company, setCompany] = useState("");
  const [email,   setEmail]   = useState("");
  const [phone,   setPhone]   = useState("");
  const [trade,   setTrade]   = useState("");
  const [notes,   setNotes]   = useState("");

  function reset() {
    setContactType(defaultType);
    setName(""); setCompany(""); setEmail("");
    setPhone(""); setTrade(""); setNotes(""); setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: contactType,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          meta: {
            ...(company.trim() ? { company: company.trim() } : {}),
            ...(trade.trim()   ? { trade:   trade.trim()   } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(billingAwareErrorMessage(res.status, data, data.error ?? "Failed to create contact."));
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const extraLabel       = EXTRA_LABEL[contactType];
  const extraPlaceholder = EXTRA_PLACEHOLDER[contactType];

  return (
    <>
      <button
        className="btn-sm"
        onClick={() => { reset(); setOpen(true); }}
        style={{ whiteSpace: "nowrap" }}
      >
        + Add contact
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset(); } }}
        >
          <div style={{
            background: "#fff", borderRadius: 8, width: 420, maxWidth: "95vw",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{
              padding: "14px 18px 12px",
              borderBottom: "0.5px solid var(--border-lo)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Add contact</div>
              <button
                onClick={() => { setOpen(false); reset(); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)" }}
              >✕</button>
            </div>

            <form onSubmit={submit} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Contact type <span style={{ color: "#c00" }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={contactType}
                  onChange={(e) => { setContactType(e.target.value as ContactType); setTrade(""); }}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Name <span style={{ color: "#c00" }}>*</span>
                </label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Company</label>
                <input
                  className="form-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company or business name"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone</label>
                  <input
                    className="form-input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {extraLabel && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    {extraLabel}
                  </label>
                  <input
                    className="form-input"
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder={extraPlaceholder}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Notes</label>
                <textarea
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes…"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
                />
              </div>

              {err && (
                <div style={{ fontSize: 11, color: "#c00", background: "#fff5f5", border: "0.5px solid #f8b4b4", borderRadius: 4, padding: "6px 10px" }}>
                  {err}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => { setOpen(false); reset(); }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !name.trim()}
                  style={{ minWidth: 100 }}
                >
                  {busy ? "Saving…" : "Add contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
