"use client";

import { useCallback, useEffect, useState } from "react";
import { goldBridgeFetch } from "@/lib/goldBridgeApi";
import UpgradeModal from "@/components/UpgradeModal";

type Billing = {
  plan?: string;
  seats_used?: number;
  seat_limit?: number;
  guests_used?: number;
  guest_limit?: number;
  status?: string;
  renews_at?: string | null;
};

type MeResponse = {
  billing?: Billing;
};

const PLAN_FEATURES: Record<string, { name: string; features: string[] }> = {
  personal: {
    name: "Personal",
    features: [
      "Solo workspace",
      "Core CHG Platform modules",
      "Up to 2 external guests",
    ],
  },
  team: {
    name: "Team",
    features: [
      "Everything in Personal",
      "Up to 5 team members",
      "Up to 5 external guests",
      "Shared pipeline & documents",
    ],
  },
};

export default function BillingClient({
  userName,
  userEmail,
  role,
}: {
  userName: string;
  userEmail: string | null;
  role: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>({});
  const [opening, setOpening] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await goldBridgeFetch<MeResponse>("/api/auth/me");
      setBilling(me.billing ?? {});
    } catch (e) {
      setError((e as Error).message || "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function openPortal() {
    setOpening(true);
    setError(null);
    try {
      const res = await goldBridgeFetch<{ url?: string }>(
        "/api/billing/portal",
        {
          method: "POST",
          body: JSON.stringify({
            return_url: "https://chg.neuroaios.ai/billing",
          }),
        },
      );
      if (!res?.url) throw new Error("Portal did not return a redirect URL.");
      window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message || "Failed to open billing portal");
      setOpening(false);
    }
  }

  const planCode = (billing.plan ?? "").toLowerCase();
  const planMeta = PLAN_FEATURES[planCode] ?? {
    name: billing.plan ?? "Unknown",
    features: [],
  };

  const canUpgrade = planCode === "personal" || planCode === "free" || planCode === "";

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Billing</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        {userName}
        {userEmail ? ` · ${userEmail}` : ""} · {role}
      </div>

      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}{" "}
          <button
            onClick={() => void loadAll()}
            style={{
              marginLeft: 8,
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #991b1b",
              background: "transparent",
              color: "#991b1b",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="admin-panel active">
        <div className="admin-group">
          <div className="admin-group-title">Current plan</div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              Loading…
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
                  {planMeta.name}
                </div>
                {billing.status && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    Status: {billing.status}
                  </div>
                )}
                {billing.renews_at && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>
                    Renews: {new Date(billing.renews_at).toLocaleDateString()}
                  </div>
                )}
                <ul
                  style={{
                    listStyle: "none",
                    margin: "8px 0 0",
                    padding: 0,
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "var(--text-primary)",
                  }}
                >
                  {planMeta.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>

              <div style={{ minWidth: 240 }}>
                <div
                  style={{
                    border: "1px solid var(--border-mid, #e5e7eb)",
                    borderRadius: 6,
                    padding: 14,
                    background: "var(--bg-soft, #fafafa)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    Seats
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 10 }}>
                    {billing.seats_used ?? 0} / {billing.seat_limit ?? 0}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    Guests
                  </div>
                  <div style={{ fontSize: 14 }}>
                    {billing.guests_used ?? 0} / {billing.guest_limit ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="admin-group">
          <div className="admin-group-title">Manage subscription</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            Update payment methods, download invoices, or cancel from the secure
            Stripe portal.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={opening || loading}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: opening || loading ? "not-allowed" : "pointer",
                opacity: opening || loading ? 0.7 : 1,
              }}
            >
              {opening ? "Opening…" : "Manage subscription"}
            </button>
            {canUpgrade && (
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "1px solid var(--border-mid, #e5e7eb)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Upgrade to Team
              </button>
            )}
          </div>
        </div>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlan={billing.plan}
        successUrl="https://chg.neuroaios.ai/billing/success?session_id={CHECKOUT_SESSION_ID}"
        cancelUrl="https://chg.neuroaios.ai/billing"
      />
    </div>
  );
}
