"use client";

import { useMemo, useState } from "react";
import type { InvestorRow } from "./types";
import { fmtDate, fmtMoney } from "./utils";

const ACCRED = ["Verified", "SelfAttested", "Unverified"];
const STATUS = ["Lead", "Prospect", "Active", "Inactive"];

export default function InvestorsTab({
  initialInvestors,
}: {
  initialInvestors: InvestorRow[];
}) {
  const [investors, setInvestors] = useState(initialInvestors);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<InvestorRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    investorId: string;
    joinUrl: string;
    expiresAt: string;
    delivery: { channel: string; delivered: boolean; reason?: string };
  } | null>(null);
  const [logBox, setLogBox] = useState<{
    investorId: string;
    type: "comm" | "note";
    channel: string;
    body: string;
    subject: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return investors;
    return investors.filter((i) =>
      [i.email, i.firstName, i.lastName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(s))
    );
  }, [q, investors]);

  async function refresh() {
    const r = await fetch("/api/admin/investors", { credentials: "include" });
    if (!r.ok) return;
    const d = await r.json();
    setInvestors(d.investors);
    if (selected) {
      const next = (d.investors as InvestorRow[]).find((x) => x.id === selected.id);
      if (next) setSelected(next);
    }
  }

  async function addInvestor(form: HTMLFormElement) {
    setBusy(true);
    const fd = new FormData(form);
    const res = await fetch("/api/admin/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd.entries())),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to add investor");
      return;
    }
    setShowAdd(false);
    form.reset();
    await refresh();
  }

  async function patchInvestor(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/investors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Update failed");
      return;
    }
    await refresh();
  }

  async function sendInvite(id: string) {
    setBusy(true);
    setInviteResult(null);
    const res = await fetch(`/api/admin/investors/${id}/invite`, {
      method: "POST",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Invite failed");
      return;
    }
    const d = await res.json();
    setInviteResult({
      investorId: id,
      joinUrl: d.joinUrl,
      expiresAt: d.expiresAt,
      delivery: d.delivery,
    });
  }

  async function submitLog() {
    if (!logBox) return;
    setBusy(true);
    const url =
      logBox.type === "comm"
        ? `/api/admin/investors/${logBox.investorId}/communications`
        : `/api/admin/investors/${logBox.investorId}/notes`;
    const body =
      logBox.type === "comm"
        ? {
            channel: logBox.channel,
            subject: logBox.subject,
            body: logBox.body,
          }
        : { body: logBox.body };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Log failed");
      return;
    }
    setLogBox(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search by name or email…"
          className="admin-input"
          style={{ width: 280 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-p"
          onClick={() => setShowAdd((v) => !v)}
        >
          + Add investor
        </button>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          {filtered.length} investor{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addInvestor(e.currentTarget);
          }}
          style={{
            background: "var(--bg-secondary)",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr) auto",
            gap: 8,
          }}
        >
          <input name="email" type="email" required placeholder="email@example.com" className="admin-input" style={{ width: "100%" }} />
          <input name="firstName" placeholder="First name" className="admin-input" style={{ width: "100%" }} />
          <input name="lastName" placeholder="Last name" className="admin-input" style={{ width: "100%" }} />
          <button disabled={busy} className="btn btn-p" type="submit">
            Save
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th style={th}>Investor</th>
                <th style={th}>Status</th>
                <th style={th}>Committed</th>
                <th style={th}>Funded</th>
                <th style={th}>Last login</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const name =
                  [i.firstName, i.lastName].filter(Boolean).join(" ") ||
                  i.email ||
                  "—";
                const isSel = selected?.id === i.id;
                return (
                  <tr
                    key={i.id}
                    onClick={() => setSelected(i)}
                    style={{
                      cursor: "pointer",
                      background: isSel ? "#E8EFF1" : "#fff",
                      borderTop: "0.5px solid var(--border-lo)",
                    }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {i.email}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={pill}>{i.status}</span>
                    </td>
                    <td style={td}>{fmtMoney(i.committedTotal)}</td>
                    <td style={td}>{fmtMoney(i.fundedTotal)}</td>
                    <td style={td}>{fmtDate(i.portalLastLoginAt)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>
                    No investors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            background: "#fff",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 6,
            padding: 16,
            minHeight: 320,
          }}
        >
          {!selected ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              Select an investor on the left to see and edit details.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {[selected.firstName, selected.lastName].filter(Boolean).join(" ") || selected.email}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{selected.email}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn"
                    onClick={() =>
                      setLogBox({
                        investorId: selected.id,
                        type: "comm",
                        channel: "Email",
                        body: "",
                        subject: "",
                      })
                    }
                  >
                    + Communication
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      setLogBox({
                        investorId: selected.id,
                        type: "note",
                        channel: "Note",
                        body: "",
                        subject: "",
                      })
                    }
                  >
                    + Note
                  </button>
                  <button className="btn btn-p" disabled={busy} onClick={() => sendInvite(selected.id)}>
                    Send invite
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <Field label="Status">
                  <select
                    className="admin-select"
                    value={selected.status}
                    onChange={(e) => patchInvestor(selected.id, { status: e.target.value })}
                  >
                    {STATUS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Accredited">
                  <select
                    className="admin-select"
                    value={selected.accreditedStatus}
                    onChange={(e) =>
                      patchInvestor(selected.id, { accreditedStatus: e.target.value })
                    }
                  >
                    {ACCRED.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <input
                    className="admin-input"
                    style={{ width: "100%" }}
                    defaultValue={selected.phone || ""}
                    onBlur={(e) => {
                      if ((e.target.value || "") !== (selected.phone || ""))
                        patchInvestor(selected.id, { phone: e.target.value });
                    }}
                  />
                </Field>
                <Field label="Subscriptions">
                  <div style={{ fontSize: 12 }}>
                    {selected.subscriptionCount} • {fmtMoney(selected.committedTotal)} committed
                  </div>
                </Field>
              </div>

              {inviteResult && inviteResult.investorId === selected.id && (
                <div
                  style={{
                    border: "0.5px solid var(--border-mid)",
                    background: "var(--teal-light, #e1f5ee)",
                    padding: 10,
                    borderRadius: 6,
                    marginBottom: 12,
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    Invite sent ({inviteResult.delivery.channel}
                    {inviteResult.delivery.delivered ? " ✓" : " — not delivered"})
                  </div>
                  <div>Expires {fmtDate(inviteResult.expiresAt)}</div>
                  <div style={{ marginTop: 4, wordBreak: "break-all" }}>
                    Join URL: <a href={inviteResult.joinUrl} target="_blank" rel="noreferrer">{inviteResult.joinUrl}</a>
                  </div>
                </div>
              )}

              {logBox && logBox.investorId === selected.id && (
                <div
                  style={{
                    border: "0.5px solid var(--border-mid)",
                    background: "var(--bg-secondary)",
                    padding: 12,
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                    {logBox.type === "comm" ? "Log communication" : "Add note"}
                  </div>
                  {logBox.type === "comm" && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select
                        className="admin-select"
                        value={logBox.channel}
                        onChange={(e) => setLogBox({ ...logBox, channel: e.target.value })}
                      >
                        {["Email", "Phone", "Meeting", "Note"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        className="admin-input"
                        style={{ flex: 1 }}
                        placeholder="Subject (optional)"
                        value={logBox.subject}
                        onChange={(e) => setLogBox({ ...logBox, subject: e.target.value })}
                      />
                    </div>
                  )}
                  <textarea
                    style={{
                      width: "100%",
                      minHeight: 80,
                      padding: 8,
                      fontSize: 12,
                      border: "0.5px solid var(--border-mid)",
                      borderRadius: 5,
                      fontFamily: "var(--font)",
                    }}
                    placeholder={logBox.type === "comm" ? "What did you discuss?" : "Internal note…"}
                    value={logBox.body}
                    onChange={(e) => setLogBox({ ...logBox, body: e.target.value })}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="btn btn-p" disabled={busy || !logBox.body.trim()} onClick={submitLog}>
                      Save
                    </button>
                    <button className="btn" onClick={() => setLogBox(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  verticalAlign: "top",
};
const pill: React.CSSProperties = {
  padding: "2px 7px",
  fontSize: 10,
  borderRadius: 999,
  background: "var(--bg-secondary)",
  border: "0.5px solid var(--border-mid)",
};
