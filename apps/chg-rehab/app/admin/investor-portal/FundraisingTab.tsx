"use client";

import { useMemo, useState } from "react";
import type { InvestorRow, OfferingRow } from "./types";
import { fmtMoney, fmtPct } from "./utils";

export default function FundraisingTab({
  initialOfferings,
  investors,
}: {
  initialOfferings: OfferingRow[];
  investors: InvestorRow[];
}) {
  const [offerings, setOfferings] = useState(initialOfferings);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useMemo(
    () => offerings.filter((o) => o.stage !== "Closed"),
    [offerings]
  );

  async function refresh() {
    const r = await fetch("/api/admin/offerings", { credentials: "include" });
    if (!r.ok) return;
    const d = await r.json();
    setOfferings(d.offerings);
  }

  async function addCommit(offeringId: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    const investorId = String(fd.get("investorId") || "");
    const committedAmount = Number(fd.get("committedAmount") || 0);
    const fundedAmount = Number(fd.get("fundedAmount") || 0);
    const commitmentType = String(fd.get("commitmentType") || "Soft");
    if (!investorId || !Number.isFinite(committedAmount) || committedAmount <= 0) {
      alert("Pick an investor and enter a committed amount.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offeringId,
        investorId,
        committedAmount,
        fundedAmount,
        commitmentType,
      }),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to add commitment");
      return;
    }
    form.reset();
    await refresh();
  }

  async function patchSub(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      alert("Update failed");
      return;
    }
    await refresh();
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
        {active.length} live raise{active.length === 1 ? "" : "s"}.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {offerings.map((o) => {
          const target = Number(o.raiseTarget) || 0;
          const hard = Number(o.raisedToHard) || 0;
          const soft = Number(o.raisedToSoft) || 0;
          const hardPct = target > 0 ? (hard / target) * 100 : 0;
          const softPct = target > 0 ? (soft / target) * 100 : 0;
          const isOpen = open === o.id;
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{o.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {o.stage} • {o.marketCity}{o.marketState ? `, ${o.marketState}` : ""}
                  </div>
                </div>
                <button className="btn" onClick={() => setOpen(isOpen ? null : o.id)}>
                  {isOpen ? "Hide cap-table" : "Cap-table"}
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, marginBottom: 4 }}>
                  Hard {fmtMoney(hard)} ({fmtPct(hardPct)}) · Soft {fmtMoney(soft)} ({fmtPct(softPct)}) · Target {fmtMoney(target)}
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 10,
                    background: "var(--bg-tertiary, #f0ede8)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${Math.min(softPct, 100)}%`,
                      background: "rgba(15,110,86,0.25)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${Math.min(hardPct, 100)}%`,
                      background: "var(--teal, #0f6e56)",
                    }}
                  />
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 14 }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)" }}>
                        <th style={th}>Investor</th>
                        <th style={th}>Type</th>
                        <th style={th}>Committed</th>
                        <th style={th}>Funded</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.subscriptions.map((s) => (
                        <tr key={s.id} style={{ borderTop: "0.5px solid var(--border-lo)" }}>
                          <td style={td}>{s.investorName}</td>
                          <td style={td}>
                            <select
                              className="admin-select"
                              defaultValue={s.commitmentType}
                              onChange={(e) => patchSub(s.id, { commitmentType: e.target.value })}
                            >
                              <option value="Soft">Soft</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </td>
                          <td style={td}>
                            <input
                              type="number"
                              className="admin-input"
                              style={{ width: 90 }}
                              defaultValue={s.committedAmount}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (n !== s.committedAmount)
                                  patchSub(s.id, { committedAmount: n });
                              }}
                            />
                          </td>
                          <td style={td}>
                            <input
                              type="number"
                              className="admin-input"
                              style={{ width: 90 }}
                              defaultValue={s.fundedAmount}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (n !== s.fundedAmount)
                                  patchSub(s.id, { fundedAmount: n });
                              }}
                            />
                          </td>
                          <td style={td}>
                            <select
                              className="admin-select"
                              defaultValue={s.status}
                              onChange={(e) => patchSub(s.id, { status: e.target.value })}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Active">Active</option>
                              <option value="Closed">Closed</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {o.subscriptions.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)" }}>
                            No commitments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addCommit(o.id, e.currentTarget);
                    }}
                    style={{ display: "flex", gap: 6, marginTop: 10 }}
                  >
                    <select name="investorId" className="admin-select" required>
                      <option value="">Add investor…</option>
                      {investors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {[i.firstName, i.lastName].filter(Boolean).join(" ") || i.email}
                        </option>
                      ))}
                    </select>
                    <select name="commitmentType" className="admin-select" defaultValue="Soft">
                      <option value="Soft">Soft</option>
                      <option value="Hard">Hard</option>
                    </select>
                    <input
                      name="committedAmount"
                      type="number"
                      placeholder="Committed $"
                      className="admin-input"
                      style={{ width: 110 }}
                      required
                    />
                    <input
                      name="fundedAmount"
                      type="number"
                      placeholder="Funded $"
                      className="admin-input"
                      style={{ width: 110 }}
                      defaultValue={0}
                    />
                    <button className="btn btn-p" disabled={busy} type="submit">+ Commit</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
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
