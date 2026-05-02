"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";

const ALLOWED_STAGES = ["Underwriting", "OfferOut", "UnderContract"] as const;
type AllowedStage = (typeof ALLOWED_STAGES)[number];

function isAllowedStage(s: string | null): s is AllowedStage {
  return ALLOWED_STAGES.includes(s as AllowedStage);
}

const EMPTY_FORM = {
  address: "",
  arv: "",
  rehab: "",
  type: "Single family",
  beds: "3",
  source: "Wholesaler",
  stage: "Underwriting" as string,
};

export default function AddDealButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");

  const [form, setForm] = useState(EMPTY_FORM);

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  useEffect(() => {
    if (newParam === "1") {
      const stageParam = searchParams.get("stage");
      setOpen(true);
      if (isAllowedStage(stageParam)) {
        setForm((f) => ({ ...f, stage: stageParam }));
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      next.delete("stage");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [newParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const gate = useBillingGateProps();
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/pipeline/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: form.address,
        arv: form.arv ? Number(form.arv) : null,
        rehab: form.rehab ? Number(form.rehab) : null,
        stage: form.stage,
        meta: {
          type: form.type,
          beds: Number(form.beds) || undefined,
          source: form.source,
        },
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(billingAwareErrorMessage(res.status, j, `Failed (${res.status})`));
      return;
    }
    setOpen(false);
    resetForm();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        className={compact ? "btn-sm btn-primary" : "btn-sm btn-primary"}
        onClick={() => setOpen(true)}
        disabled={gate.disabled}
        title={gate.title}
        style={gate.style}
        aria-disabled={gate.disabled || undefined}
      >
        + Add deal
      </button>
      {open && (
        <ModalShell title="Add new deal" onClose={() => { setOpen(false); resetForm(); }}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Property address" required>
              <input
                className="search-input"
                style={{ width: "100%" }}
                placeholder="e.g. 514 Lakewood Ave., Cleveland"
                value={form.address}
                required
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Property type">
                <select
                  className="filter-sel"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  style={{ width: "100%" }}
                >
                  <option>Single family</option>
                  <option>Multi-family</option>
                  <option>Condo</option>
                  <option>Townhome</option>
                </select>
              </Field>
              <Field label="Bedrooms">
                <input
                  className="search-input"
                  type="number"
                  min={0}
                  value={form.beds}
                  onChange={(e) => setForm({ ...form, beds: e.target.value })}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Estimated ARV ($)">
                <input
                  className="search-input"
                  type="number"
                  value={form.arv}
                  onChange={(e) => setForm({ ...form, arv: e.target.value })}
                  style={{ width: "100%" }}
                />
              </Field>
              <Field label="Rehab estimate ($)">
                <input
                  className="search-input"
                  type="number"
                  value={form.rehab}
                  onChange={(e) => setForm({ ...form, rehab: e.target.value })}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
            <Field label="Source">
              <select
                className="filter-sel"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                style={{ width: "100%" }}
              >
                <option>Wholesaler</option>
                <option>MLS</option>
                <option>Direct mail</option>
                <option>Driving for dollars</option>
                <option>Auction</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Stage">
              <select
                className="filter-sel"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
                style={{ width: "100%" }}
              >
                <option value="Underwriting">Lead / Underwriting</option>
                <option value="OfferOut">Offer Submitted</option>
                <option value="UnderContract">Under Contract</option>
              </select>
            </Field>
            {form.arv && form.rehab && (
              <div style={{ padding: 10, background: "#EAF3DE", borderRadius: 6, border: "0.5px solid rgba(29,158,117,0.3)" }}>
                <div style={{ fontSize: 10, color: "#27500A" }}>Maximum Allowable Offer (preview)</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#1D9E75" }}>
                  ${Math.round(Number(form.arv) * 0.7 - Number(form.rehab)).toLocaleString()}
                </div>
                <div style={{ fontSize: 9, color: "#3B6D11", marginTop: 2 }}>
                  ${Number(form.arv).toLocaleString()} × 70% − ${Number(form.rehab).toLocaleString()}
                </div>
              </div>
            )}
            {err && <div style={{ color: "#791F1F", fontSize: 11 }}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" className="btn" onClick={() => { setOpen(false); resetForm(); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Add deal"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)" }}>
      <div style={{ marginBottom: 4 }}>{label}{required && <span style={{ color: "#A32D2D" }}> *</span>}</div>
      {children}
    </label>
  );
}

export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 8, width: 480, maxWidth: "100%",
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}
