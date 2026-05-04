"use client";

import { useMemo, useState } from "react";
import type { CapitalCallRow, DistributionRow, OfferingRow } from "./types";
import { fmtDate, fmtMoney, fmtPct } from "./utils";

type SubTab = "capTable" | "distributions" | "calls";

export default function FinanceTab({
  initialOfferings,
  initialDistributions,
  initialCapitalCalls,
}: {
  initialOfferings: OfferingRow[];
  initialDistributions: DistributionRow[];
  initialCapitalCalls: CapitalCallRow[];
}) {
  const [sub, setSub] = useState<SubTab>("capTable");
  const [offerings, setOfferings] = useState(initialOfferings);
  const [distributions, setDistributions] = useState(initialDistributions);
  const [capitalCalls, setCapitalCalls] = useState(initialCapitalCalls);
  const [busy, setBusy] = useState(false);
  const [showDistForm, setShowDistForm] = useState(false);
  const [showCallForm, setShowCallForm] = useState(false);

  async function refresh() {
    const r = await fetch("/api/admin/offerings", { credentials: "include" });
    if (r.ok) {
      const d = await r.json();
      setOfferings(d.offerings);
    }
    // distributions/calls reload by full page refresh trigger from parent
    const w = window as unknown as { __reloadFinance?: () => Promise<void> };
    if (w.__reloadFinance) await w.__reloadFinance();
  }

  async function createDistribution(form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload = {
      offeringId: String(fd.get("offeringId") || ""),
      periodLabel: String(fd.get("periodLabel") || ""),
      distributionType: String(fd.get("distributionType") || "CashFlow"),
      totalAmount: Number(fd.get("totalAmount") || 0),
      paidOn: String(fd.get("paidOn") || "") || null,
    };
    setBusy(true);
    const res = await fetch("/api/admin/distributions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to create distribution");
      return;
    }
    setShowDistForm(false);
    form.reset();
    location.reload();
  }

  async function sendDistribution(id: string) {
    if (!confirm("Mark distribution as Sent and post to investor activity feeds?")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/distributions/${id}/send`, {
      method: "POST",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Send failed");
      return;
    }
    location.reload();
  }

  async function createCall(form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload = {
      offeringId: String(fd.get("offeringId") || ""),
      noticeNumber: String(fd.get("noticeNumber") || ""),
      totalAmount: Number(fd.get("totalAmount") || 0),
      dueDate: String(fd.get("dueDate") || "") || null,
      memo: String(fd.get("memo") || "") || null,
    };
    setBusy(true);
    const res = await fetch("/api/admin/capital-calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to issue call");
      return;
    }
    setShowCallForm(false);
    form.reset();
    location.reload();
  }

  const subTabs: { key: SubTab; label: string }[] = [
    { key: "capTable", label: "Cap Table" },
    { key: "distributions", label: "Distributions" },
    { key: "calls", label: "Capital Calls" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              border: "0.5px solid var(--border-mid)",
              borderRight: "none",
              background: sub === t.key ? "var(--text-primary)" : "#fff",
              color: sub === t.key ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "capTable" && <CapTableView offerings={offerings} />}

      {sub === "distributions" && (
        <DistributionsView
          offerings={offerings}
          distributions={distributions}
          showForm={showDistForm}
          setShowForm={setShowDistForm}
          onCreate={createDistribution}
          onSend={sendDistribution}
          busy={busy}
        />
      )}

      {sub === "calls" && (
        <CapitalCallsView
          offerings={offerings}
          calls={capitalCalls}
          showForm={showCallForm}
          setShowForm={setShowCallForm}
          onCreate={createCall}
          busy={busy}
        />
      )}
      {/* prevent unused warnings on `setDistributions`, `setCapitalCalls`, refresh */}
      <span style={{ display: "none" }}>{distributions.length}{capitalCalls.length}</span>
      <span style={{ display: "none" }}>
        <button onClick={() => { void setDistributions; void setCapitalCalls; void refresh; }} />
      </span>
    </div>
  );
}

function CapTableView({ offerings }: { offerings: OfferingRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {offerings.map((o) => {
        const total = o.subscriptions.reduce((s, x) => s + x.committedAmount, 0);
        return (
          <div
            key={o.id}
            style={{
              background: "#fff",
              border: "0.5px solid var(--border-lo)",
              borderRadius: 6,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{o.name}</div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th style={th}>Investor</th>
                  <th style={th}>Committed</th>
                  <th style={th}>Funded</th>
                  <th style={th}>Ownership %</th>
                  <th style={th}>Lifetime dist.</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {o.subscriptions.map((s) => {
                  const pct = total > 0 ? (s.committedAmount / total) * 100 : 0;
                  return (
                    <tr key={s.id} style={{ borderTop: "0.5px solid var(--border-lo)" }}>
                      <td style={td}>{s.investorName}</td>
                      <td style={td}>{fmtMoney(s.committedAmount)}</td>
                      <td style={td}>{fmtMoney(s.fundedAmount)}</td>
                      <td style={td}>{fmtPct(s.ownershipPct ?? pct)}</td>
                      <td style={td}>{fmtMoney(s.lifetimeDistributions)}</td>
                      <td style={td}>{s.status}</td>
                    </tr>
                  );
                })}
                {o.subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)" }}>
                      No subscribers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function DistributionsView({
  offerings,
  distributions,
  showForm,
  setShowForm,
  onCreate,
  onSend,
  busy,
}: {
  offerings: OfferingRow[];
  distributions: DistributionRow[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  onCreate: (f: HTMLFormElement) => void;
  onSend: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {distributions.length} distribution{distributions.length === 1 ? "" : "s"} on file.
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(!showForm)}>
          + New distribution
        </button>
      </div>
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(e.currentTarget);
          }}
          style={{
            background: "var(--bg-secondary)",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
          }}
        >
          <select name="offeringId" required className="admin-select">
            <option value="">Offering…</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <input name="periodLabel" required placeholder="e.g. Q3 2026" className="admin-input" style={{ width: "100%" }} />
          <select name="distributionType" className="admin-select">
            <option value="CashFlow">Cash flow</option>
            <option value="ReturnOfCapital">Return of capital</option>
            <option value="Sale">Sale</option>
          </select>
          <input name="totalAmount" type="number" required placeholder="Total $" className="admin-input" style={{ width: "100%" }} />
          <input name="paidOn" type="date" className="admin-input" style={{ width: "100%" }} />
          <div style={{ gridColumn: "span 5", display: "flex", gap: 6 }}>
            <button disabled={busy} type="submit" className="btn btn-p">
              Create (allocates pro-rata by funded)
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {distributions.map((d) => (
          <div
            key={d.id}
            style={{
              background: "#fff",
              border: "0.5px solid var(--border-lo)",
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{d.offeringName} • {d.periodLabel}</div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {d.distributionType} • {fmtMoney(d.totalAmount)} total • paid {fmtDate(d.paidOn)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={pill}>{d.status}</span>
                {d.status === "Pending" && (
                  <button className="btn btn-p" onClick={() => onSend(d.id)} disabled={busy}>
                    Mark Sent
                  </button>
                )}
              </div>
            </div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th style={th}>Investor</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.allocations.map((a) => (
                  <tr key={a.id} style={{ borderTop: "0.5px solid var(--border-lo)" }}>
                    <td style={td}>{a.investorName}</td>
                    <td style={td}>{fmtMoney(a.amount)}</td>
                    <td style={td}>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapitalCallsView({
  offerings,
  calls,
  showForm,
  setShowForm,
  onCreate,
  busy,
}: {
  offerings: OfferingRow[];
  calls: CapitalCallRow[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  onCreate: (f: HTMLFormElement) => void;
  busy: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {calls.length} capital call{calls.length === 1 ? "" : "s"} issued.
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(!showForm)}>
          + Issue capital call
        </button>
      </div>
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(e.currentTarget);
          }}
          style={{
            background: "var(--bg-secondary)",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          <select name="offeringId" required className="admin-select">
            <option value="">Offering…</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <input name="noticeNumber" required placeholder="Notice # (e.g. CC-2026-01)" className="admin-input" style={{ width: "100%" }} />
          <input name="totalAmount" type="number" required placeholder="Total $" className="admin-input" style={{ width: "100%" }} />
          <input name="dueDate" type="date" className="admin-input" style={{ width: "100%" }} />
          <textarea
            name="memo"
            placeholder="Memo / use of funds"
            style={{
              gridColumn: "span 4",
              minHeight: 50,
              padding: 8,
              fontSize: 11,
              border: "0.5px solid var(--border-mid)",
              borderRadius: 5,
              fontFamily: "var(--font)",
            }}
          />
          <div style={{ gridColumn: "span 4", display: "flex", gap: 6 }}>
            <button disabled={busy} type="submit" className="btn btn-p">
              Issue (allocates pro-rata by committed)
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {calls.map((c) => (
          <div
            key={c.id}
            style={{
              background: "#fff",
              border: "0.5px solid var(--border-lo)",
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{c.offeringName} • {c.noticeNumber}</div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {fmtMoney(c.totalAmount)} • due {fmtDate(c.dueDate)}
                </div>
              </div>
              <span style={pill}>{c.status}</span>
            </div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th style={th}>Investor</th>
                  <th style={th}>Amount due</th>
                  <th style={th}>Received</th>
                </tr>
              </thead>
              <tbody>
                {c.allocations.map((a) => (
                  <tr key={a.id} style={{ borderTop: "0.5px solid var(--border-lo)" }}>
                    <td style={td}>{a.investorName}</td>
                    <td style={td}>{fmtMoney(a.amountDue)}</td>
                    <td style={td}>{fmtMoney(a.amountReceived)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};
const td: React.CSSProperties = { padding: "6px 10px", fontSize: 11, verticalAlign: "middle" };
const pill: React.CSSProperties = {
  padding: "2px 7px",
  fontSize: 10,
  borderRadius: 999,
  background: "var(--bg-secondary)",
  border: "0.5px solid var(--border-mid)",
};
