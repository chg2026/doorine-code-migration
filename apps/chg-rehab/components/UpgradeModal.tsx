"use client";

import { useEffect, useState } from "react";
import { goldBridgeFetch } from "@/lib/goldBridgeApi";

type Plan = {
  code: "personal" | "team";
  name: string;
  price: string;
  seats: string;
  guests: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    code: "personal",
    name: "Personal",
    price: "$0 / mo",
    seats: "0 team members",
    guests: "2 guests",
    features: [
      "Solo workspace",
      "Core CHG Rehab modules",
      "Up to 2 external collaborators",
    ],
  },
  {
    code: "team",
    name: "Team",
    price: "$49 / mo",
    seats: "5 team members",
    guests: "5 guests",
    features: [
      "Everything in Personal",
      "Invite up to 5 teammates",
      "Up to 5 external collaborators",
      "Shared pipeline & documents",
    ],
  },
];

export default function UpgradeModal({
  open,
  onClose,
  currentPlan,
  successUrl,
  cancelUrl,
}: {
  open: boolean;
  onClose: () => void;
  currentPlan: string | undefined;
  successUrl: string;
  cancelUrl: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentCode = (currentPlan ?? "").toLowerCase();

  async function startCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await goldBridgeFetch<{ url?: string }>(
        "/api/billing/checkout",
        {
          method: "POST",
          body: JSON.stringify({
            product_code: "chg",
            plan: "team",
            success_url: successUrl,
            cancel_url: cancelUrl,
          }),
        },
      );
      if (!res?.url) {
        throw new Error("Checkout did not return a redirect URL.");
      }
      window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message || "Failed to start checkout");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          maxWidth: 720,
          width: "100%",
          padding: 24,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Upgrade your plan</h2>
            <div
              style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}
            >
              Add teammates and more guests to your CHG Rehab workspace.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              color: "var(--text-tertiary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 16,
          }}
        >
          {PLANS.map((p) => {
            const isCurrent = currentCode === p.code;
            const isTarget = p.code === "team";
            return (
              <div
                key={p.code}
                style={{
                  border: isTarget
                    ? "2px solid #111827"
                    : "1px solid var(--border-mid, #e5e7eb)",
                  borderRadius: 8,
                  padding: 16,
                  background: isTarget ? "#fafafa" : "#fff",
                  position: "relative",
                }}
              >
                {isCurrent && (
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      fontSize: 10,
                      textTransform: "uppercase",
                      background: "var(--bg-mid, #f0f0f0)",
                      color: "var(--text-tertiary)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Current
                  </span>
                )}
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    margin: "6px 0 10px",
                  }}
                >
                  {p.price}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginBottom: 4,
                  }}
                >
                  {p.seats}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginBottom: 12,
                  }}
                >
                  {p.guests}
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                  }}
                >
                  {p.features.map((f) => (
                    <li key={f} style={{ marginBottom: 2 }}>
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              borderRadius: 4,
              border: "1px solid var(--border-mid, #e5e7eb)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void startCheckout()}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Redirecting…" : "Upgrade to Team"}
          </button>
        </div>
      </div>
    </div>
  );
}
