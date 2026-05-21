"use client";

import { useState } from "react";
import type {
  InvestorRow,
  OfferingRow,
  DistributionRow,
  CapitalCallRow,
} from "../admin/investor-portal/types";
import InvestorsTab from "../admin/investor-portal/InvestorsTab";
import DealsTab from "../admin/investor-portal/DealsTab";
import FundraisingTab from "../admin/investor-portal/FundraisingTab";
import FinanceTab from "../admin/investor-portal/FinanceTab";

type TabId = "overview" | "investors" | "deals" | "fundraising" | "finance";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "investors", label: "Investors" },
  { id: "deals", label: "Deals" },
  { id: "fundraising", label: "Fundraising" },
  { id: "finance", label: "Finance" },
];

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

export default function InvestorPortalClient({
  initialTab,
  investors,
  offerings,
  distributions,
  capitalCalls,
}: {
  initialTab: string;
  investors: InvestorRow[];
  offerings: OfferingRow[];
  distributions: DistributionRow[];
  capitalCalls: CapitalCallRow[];
}) {
  const [tab, setTab] = useState<TabId>(
    (TABS.find((t) => t.id === initialTab)?.id ?? "overview")
  );

  const totalCommitted = investors.reduce((s, i) => s + i.committedTotal, 0);
  const totalFunded = investors.reduce((s, i) => s + i.fundedTotal, 0);
  const totalDistributions = distributions
    .filter((d) => d.status === "Sent")
    .reduce((s, d) => s + d.totalAmount, 0);
  const activeDeals = offerings.filter((o) => o.stage !== "Closed").length;
  const openCalls = capitalCalls.filter(
    (c) => c.status === "Open" || c.status === "Pending"
  ).length;

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1280 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600 }}>
          Investor Portal
        </h1>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Operator lens — manage investors, deals, fundraising, and
          distributions.
        </div>
      </div>

      {/* Tab strip */}
      <div
        style={{
          display: "flex",
          borderBottom: "0.5px solid var(--border-lo)",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "10px 16px",
              fontSize: 13,
              cursor: "pointer",
              color:
                tab === t.id
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              fontWeight: tab === t.id ? 500 : 400,
              borderBottom:
                tab === t.id
                  ? "2px solid var(--marine, #1F4D5C)"
                  : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard label="Total investors" value={String(investors.length)} />
            <StatCard label="Committed capital" value={fmt(totalCommitted)} />
            <StatCard label="Funded capital" value={fmt(totalFunded)} />
            <StatCard
              label="Distributions paid"
              value={fmt(totalDistributions)}
            />
            <StatCard label="Active deals" value={String(activeDeals)} />
          </div>

          {openCalls > 0 && (
            <div
              style={{
                background: "#fef3c7",
                border: "0.5px solid #d97706",
                borderRadius: 6,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              <strong>
                {openCalls} open capital call{openCalls === 1 ? "" : "s"}
              </strong>{" "}
              —{" "}
              <button
                type="button"
                onClick={() => setTab("finance")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#92400e",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: 13,
                }}
              >
                Finance → Capital Calls
              </button>{" "}
              to review.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <Card title="Investors by status">
              {(["Lead", "Prospect", "Active", "Inactive"] as const).map(
                (status) => {
                  const group = investors.filter((i) => i.status === status);
                  const committed = group.reduce(
                    (s, i) => s + i.committedTotal,
                    0
                  );
                  return (
                    <div
                      key={status}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderTop: "0.5px solid var(--border-lo)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        {status}
                      </span>
                      <span>
                        <strong>{group.length}</strong>
                        {committed > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              marginLeft: 8,
                            }}
                          >
                            {fmt(committed)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                }
              )}
            </Card>

            <Card title="Deals by stage">
              {[
                "Prospecting",
                "Diligence",
                "Raise",
                "Closing",
                "Closed",
              ].map((stage) => {
                const group = offerings.filter((o) => o.stage === stage);
                const raised = group.reduce(
                  (s, o) => s + (o.raisedToHard ?? 0),
                  0
                );
                return (
                  <div
                    key={stage}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderTop: "0.5px solid var(--border-lo)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {stage}{" "}
                      <span
                        style={{ fontSize: 11, color: "var(--text-tertiary)" }}
                      >
                        ({group.length})
                      </span>
                    </span>
                    <span style={{ fontWeight: 500 }}>{fmt(raised)}</span>
                  </div>
                );
              })}
            </Card>
          </div>

          <Card title="Recent distributions">
            {distributions.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  padding: "8px 0",
                }}
              >
                No distributions yet. Create one in the Finance tab.
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    {["Deal", "Period", "Type", "Total", "Status"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "6px 10px",
                          textAlign: "left",
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          color: "var(--text-tertiary)",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distributions.slice(0, 6).map((d) => (
                    <tr
                      key={d.id}
                      style={{ borderTop: "0.5px solid var(--border-lo)" }}
                    >
                      <td style={{ padding: "8px 10px" }}>{d.offeringName}</td>
                      <td style={{ padding: "8px 10px" }}>{d.periodLabel}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {d.distributionType}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {fmt(d.totalAmount)}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <Pill status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* ── Investors ── */}
      {tab === "investors" && (
        <InvestorsTab initialInvestors={investors} />
      )}

      {/* ── Deals ── */}
      {tab === "deals" && <DealsTab initialOfferings={offerings} />}

      {/* ── Fundraising ── */}
      {tab === "fundraising" && (
        <FundraisingTab initialOfferings={offerings} investors={investors} />
      )}

      {/* ── Finance ── */}
      {tab === "finance" && (
        <FinanceTab
          initialOfferings={offerings}
          initialDistributions={distributions}
          initialCapitalCalls={capitalCalls}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "0.5px solid var(--border-lo)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "0.5px solid var(--border-lo)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Pill({ status }: { status: string }) {
  const palette: Record<string, [string, string]> = {
    Pending: ["#fef3c7", "#854f0b"],
    Sent: ["#dcfce7", "#166534"],
    Open: ["#dbeafe", "#1e40af"],
    Closed: ["#f3f4f6", "#374151"],
  };
  const [bg, fg] = palette[status] ?? ["#f3f4f6", "#374151"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background: bg,
        color: fg,
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}
