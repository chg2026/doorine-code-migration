"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DealStage } from "@prisma/client";
import { ModalShell, Field } from "./AddDealButton";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";

const STAGE_DISPLAY: Record<string, string> = {
  Sourced: "Lead / Underwriting",
  Underwriting: "Underwriting",
  OfferOut: "Offer Submitted",
  UnderContract: "Under Contract",
  Closed: "Closed",
};

const ADVANCE_LABEL: Record<string, string> = {
  Sourced: "Advance to Underwriting →",
  Underwriting: "Advance stage →",
  OfferOut: "Mark accepted →",
  UnderContract: "Close deal →",
};

const NEXT_STAGE: Record<string, DealStage> = {
  Sourced: DealStage.Underwriting,
  Underwriting: DealStage.OfferOut,
  OfferOut: DealStage.UnderContract,
};

export default function DealActions({
  deal,
}: {
  deal: { id: string; code: string; stage: DealStage; address: string; propertyId: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isClosed = deal.stage === DealStage.Closed;

  if (isClosed) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {deal.propertyId ? (
          <Link href={`/property?id=${deal.propertyId}`} className="btn-sm">Property →</Link>
        ) : null}
      </div>
    );
  }

  const isUC = deal.stage === DealStage.UnderContract;

  async function doAdvance() {
    setErr(null);
    const next = NEXT_STAGE[deal.stage];
    if (!next) return;
    const res = await fetch(`/api/pipeline/deals/${deal.id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(billingAwareErrorMessage(res.status, j, `Failed (${res.status})`));
      return;
    }
    setAdvanceOpen(false);
    startTransition(() => router.refresh());
  }

  async function doClose(formData: { purchasePrice: string; closingDate: string; rehabBudget: string }) {
    setErr(null);
    const res = await fetch(`/api/pipeline/deals/${deal.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchasePrice: Number(formData.purchasePrice) || null,
        closingDate: formData.closingDate || null,
        rehabBudget: Number(formData.rehabBudget) || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(billingAwareErrorMessage(res.status, j, `Failed (${res.status})`));
      return;
    }
    const result = await res.json();
    setCloseOpen(false);
    if (result.propertyId) {
      router.push(`/property?id=${result.propertyId}`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn-sm">Edit</button>
        <button type="button" className="btn-sm">+ Note</button>
        {isUC ? (
          <button
            type="button"
            className="btn-sm btn-primary"
            style={{ background: "#1D9E75", borderColor: "#1D9E75" }}
            onClick={() => setCloseOpen(true)}
          >
            Close deal →
          </button>
        ) : (
          <button
            type="button"
            className="btn-sm btn-primary"
            style={{ background: "var(--navy)", color: "#fff", borderColor: "var(--navy)" }}
            onClick={() => setAdvanceOpen(true)}
          >
            {ADVANCE_LABEL[deal.stage] || "Advance stage →"}
          </button>
        )}
      </div>
      {err && <div style={{ color: "#791F1F", fontSize: 11, marginTop: 4 }}>{err}</div>}

      {advanceOpen && (
        <ModalShell title={`Advance ${deal.address}`} onClose={() => setAdvanceOpen(false)}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Move this deal from <strong>{STAGE_DISPLAY[deal.stage] ?? deal.stage}</strong> to <strong>{STAGE_DISPLAY[NEXT_STAGE[deal.stage]] ?? NEXT_STAGE[deal.stage]}</strong>?
          </div>
          {err && <div style={{ color: "#791F1F", fontSize: 11, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={() => setAdvanceOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={doAdvance} disabled={pending}>
              {pending ? "Advancing…" : "Advance"}
            </button>
          </div>
        </ModalShell>
      )}

      {closeOpen && (
        <CloseModal
          deal={deal}
          err={err}
          onCancel={() => setCloseOpen(false)}
          onSubmit={doClose}
          pending={pending}
        />
      )}
    </>
  );
}

function CloseModal({
  deal,
  err,
  onCancel,
  onSubmit,
  pending,
}: {
  deal: { address: string };
  err: string | null;
  onCancel: () => void;
  onSubmit: (f: { purchasePrice: string; closingDate: string; rehabBudget: string }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ purchasePrice: "", closingDate: "", rehabBudget: "" });
  return (
    <ModalShell title={`Close deal — ${deal.address}`} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
          Closing this deal creates a new property record and an empty rehab project (Planning).
          The deal moves to Closed and links to the new property.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Purchase price ($)" required>
            <input
              className="search-input"
              type="number"
              required
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Closing date">
            <input
              className="search-input"
              type="date"
              value={form.closingDate}
              onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
              style={{ width: "100%" }}
            />
          </Field>
        </div>
        <Field label="Rehab budget ($)">
          <input
            className="search-input"
            type="number"
            value={form.rehabBudget}
            onChange={(e) => setForm({ ...form, rehabBudget: e.target.value })}
            style={{ width: "100%" }}
          />
        </Field>
        {err && <div style={{ color: "#791F1F", fontSize: 11 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            className="btn-primary"
            style={{ background: "#1D9E75", borderColor: "#1D9E75" }}
            disabled={pending}
          >
            {pending ? "Closing…" : "Close & create property"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
