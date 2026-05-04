"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 4-step subscribe flow:
 *   amount  → review (e-sign)  → wire (instructions + "I've sent the wire")  → done
 *
 * Notes
 * - "Review" is where the investor reviews the commitment + types the e-sign
 *   name. Submitting it calls POST /api/subscribe/[offeringId], which records
 *   the SubscriptionDocument and (server-side) flips the Soft → Hard commitment.
 * - "Wire" displays the operator-configured wire/ACH instructions and offers
 *   an "I've sent the wire" action which calls POST /api/subscriptions/[id]/
 *   confirm-funding. That endpoint flags the operator to verify receipt.
 */
type Step = "amount" | "review" | "wire" | "done";

type WireFields = {
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  beneficiary?: string;
  swift?: string;
  memo?: string;
  notes?: string;
};

export default function SubscribeModal({
  offeringId,
  offeringName,
  minInvestment,
  wireInstructions,
  onClose,
}: {
  offeringId: string;
  offeringName: string;
  minInvestment: number | null;
  wireInstructions: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState<string>(
    minInvestment ? String(minInvestment) : ""
  );
  const [signedName, setSignedName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState<"wire" | "ach">("wire");
  const [result, setResult] = useState<{
    subscriptionId: string;
    receiptDocumentId: string | null;
    commitmentType: string;
  } | null>(null);

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const meetsMin = !minInvestment || numericAmount >= minInvestment;
  const wf = (wireInstructions || {}) as WireFields;

  async function submitSubscription() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscribe/${offeringId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committedAmount: numericAmount,
          signedName: signedName.trim(),
          acceptedDisclaimer: accepted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `failed (${res.status})`);
      setResult({
        subscriptionId: data.subscriptionId,
        receiptDocumentId: data.receiptDocumentId,
        commitmentType: "Hard",
      });
      setStep("wire");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "submission failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWireSent() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/subscriptions/${result.subscriptionId}/confirm-funding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            reference: reference.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `failed (${res.status})`);
      setStep("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "confirmation failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadReceipt() {
    if (!result?.receiptDocumentId) return;
    const r = await fetch(`/api/documents/${result.receiptDocumentId}/url`);
    if (!r.ok) return;
    const { url } = (await r.json()) as { url: string };
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-primary)",
          borderRadius: 10,
          width: "100%",
          maxWidth: 560,
          padding: 24,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Subscribe</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{offeringName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: 0, fontSize: 18, cursor: "pointer", color: "var(--text-secondary)" }}
          >
            ×
          </button>
        </div>

        <Stepper step={step} />

        {step === "amount" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Commitment amount (USD)
              </label>
              <input
                type="number"
                min={minInvestment || undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={inputStyle}
                placeholder={minInvestment ? `Minimum $${minInvestment.toLocaleString()}` : "$50,000"}
              />
              {minInvestment ? (
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Minimum investment ${minInvestment.toLocaleString()}.
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              You will create a soft commit, e-sign to convert it to a hard commit, then
              receive wire/ACH instructions. The operator will confirm receipt of funds.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
              <button
                type="button"
                onClick={() => setStep("review")}
                disabled={!amountValid || !meetsMin}
                className="btn btn-sm btn-p"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "0.5px solid var(--border-light)",
                borderRadius: 6,
                padding: 12,
                fontSize: 11,
                lineHeight: 1.55,
                color: "var(--text-primary)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Review &amp; e-sign — Soft → Hard
              </div>
              You are about to convert a soft indication into a{" "}
              <strong>hard commitment</strong> of{" "}
              <strong>${numericAmount.toLocaleString()}</strong> in{" "}
              <strong>{offeringName}</strong>. By typing your full legal name and
              submitting, you acknowledge your intent to fund. The operator will
              counter-sign the formal subscription agreement and confirm receipt
              of your wire/ACH separately.
            </div>

            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Type your full legal name
              </label>
              <input
                type="text"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                style={{ ...inputStyle, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 16 }}
                placeholder="e.g. Jane A. Investor"
                autoFocus
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                I acknowledge this is a placeholder e-signature and that the
                operator will provide the formal agreement separately.
              </span>
            </label>

            {error ? (
              <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setStep("amount")} className="btn btn-sm">← Back</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
                <button
                  type="button"
                  onClick={submitSubscription}
                  disabled={busy || !signedName.trim() || !accepted}
                  className="btn btn-sm btn-p"
                >
                  {busy ? "Submitting…" : "Sign &amp; submit"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "wire" && result && (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                background: "var(--teal-light)",
                color: "var(--teal-dark)",
                borderRadius: 6,
                padding: 10,
                fontSize: 11,
              }}
            >
              Hard commitment of <strong>${numericAmount.toLocaleString()}</strong> recorded.
              Send your funds using the instructions below, then confirm.
            </div>

            <WireBox wf={wf} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as "wire" | "ach")}
                  style={inputStyle}
                >
                  <option value="wire">Wire</option>
                  <option value="ach">ACH</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Reference / confirmation # (optional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. FED202605030123"
                />
              </div>
            </div>

            {error ? (
              <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                onClick={downloadReceipt}
                disabled={!result.receiptDocumentId}
                className="btn btn-sm"
              >
                Download PDF receipt
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} className="btn btn-sm">Close, send later</button>
                <button
                  type="button"
                  onClick={confirmWireSent}
                  disabled={busy}
                  className="btn btn-sm btn-p"
                >
                  {busy ? "Confirming…" : "I've sent the wire →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                background: "var(--teal-light)",
                color: "var(--teal-dark)",
                borderRadius: 6,
                padding: 14,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                All set — funding reported
              </div>
              {"We've notified the operator that you've sent funds for "}
              <strong>${numericAmount.toLocaleString()}</strong>. They will verify
              receipt and update your investment status.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                onClick={downloadReceipt}
                disabled={!result.receiptDocumentId}
                className="btn btn-sm"
              >
                Download PDF receipt
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} className="btn btn-sm">Close</button>
                <a
                  href={`/investments/${offeringId}/funding`}
                  className="btn btn-sm btn-p"
                >
                  See funding page →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WireBox({ wf }: { wf: WireFields }) {
  const empty =
    !wf.bankName && !wf.routingNumber && !wf.accountNumber && !wf.beneficiary;
  if (empty) {
    return (
      <div
        style={{
          background: "var(--amber-light)",
          color: "var(--amber)",
          padding: 10,
          borderRadius: 6,
          fontSize: 11,
        }}
      >
        Wire instructions have not been configured yet — the operator will
        email them to you separately.
      </div>
    );
  }
  const Row = ({ k, v }: { k: string; v?: string }) =>
    v ? (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--border-light)", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{v}</span>
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(v).catch(() => undefined);
              }
            }}
            title="Copy"
            style={{ background: "none", border: 0, cursor: "pointer", color: "var(--text-tertiary)", fontSize: 11, padding: "0 4px" }}
          >
            ⧉
          </button>
        </span>
      </div>
    ) : null;
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "0.5px solid var(--border-light)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Wire / ACH instructions</div>
      <Row k="Bank" v={wf.bankName} />
      <Row k="Beneficiary" v={wf.beneficiary} />
      <Row k="Routing #" v={wf.routingNumber} />
      <Row k="Account #" v={wf.accountNumber} />
      <Row k="SWIFT" v={wf.swift} />
      <Row k="Memo" v={wf.memo} />
      {wf.notes ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{wf.notes}</div>
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "amount", label: "Amount" },
    { key: "review", label: "Review" },
    { key: "wire", label: "Wire" },
    { key: "done", label: "Done" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "12px 0 18px" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: i <= idx ? "var(--teal)" : "var(--bg-tertiary)",
              color: i <= idx ? "#fff" : "var(--text-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {i + 1}
          </div>
          <div style={{ fontSize: 11, color: i <= idx ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {s.label}
          </div>
          {i < steps.length - 1 ? (
            <div style={{ width: 24, height: 1, background: "var(--border-light)", margin: "0 4px" }} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "0.5px solid var(--border-mid)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};
