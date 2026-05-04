"use client";

import { useState } from "react";
import type { OfferingRow } from "./types";
import { STAGE_OPTIONS } from "./types";
import { fmtDate, fmtMoney, fmtPct } from "./utils";

export default function DealsTab({
  initialOfferings,
}: {
  initialOfferings: OfferingRow[];
}) {
  const [offerings, setOfferings] = useState(initialOfferings);
  const [showNew, setShowNew] = useState(false);
  const [drawer, setDrawer] = useState<OfferingRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch("/api/admin/offerings", { credentials: "include" });
    if (!r.ok) return;
    const d = await r.json();
    setOfferings(d.offerings);
    if (drawer) {
      const next = (d.offerings as OfferingRow[]).find((o) => o.id === drawer.id);
      if (next) setDrawer(next);
    }
  }

  async function changeStage(id: string, stage: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/offerings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      alert("Failed to update stage");
      return;
    }
    await refresh();
  }

  async function createOffering(form: HTMLFormElement) {
    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      if (k === "holdMonths") {
        const n = Number(v);
        if (Number.isFinite(n)) data[k] = n;
      } else if (
        k === "targetIrrLow" ||
        k === "targetIrrHigh" ||
        k === "minInvestment" ||
        k === "raiseTarget" ||
        k === "prefReturnPct"
      ) {
        if (v) data[k] = Number(v);
      } else if (v) {
        data[k] = v;
      }
    }
    setBusy(true);
    const res = await fetch("/api/admin/offerings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to create offering");
      return;
    }
    setShowNew(false);
    form.reset();
    await refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {offerings.length} deal{offerings.length === 1 ? "" : "s"} across the pipeline
        </div>
        <button className="btn btn-p" onClick={() => setShowNew(true)}>
          + New deal
        </button>
      </div>

      {showNew && (
        <NewDealForm onSubmit={createOffering} onCancel={() => setShowNew(false)} busy={busy} />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STAGE_OPTIONS.length}, 1fr)`,
          gap: 8,
          minHeight: 400,
        }}
      >
        {STAGE_OPTIONS.map((stage) => {
          const cards = offerings.filter((o) => o.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) changeStage(id, stage);
              }}
              style={{
                background: "var(--bg-secondary)",
                border: "0.5px solid var(--border-lo)",
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                  padding: "0 4px 8px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{stage}</span>
                <span>{cards.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cards.map((o) => (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)}
                    onClick={() => setDrawer(o)}
                    style={{
                      background: "#fff",
                      border: "0.5px solid var(--border-lo)",
                      borderRadius: 5,
                      padding: 8,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>{o.name}</div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                      {o.marketCity ? `${o.marketCity}, ${o.marketState ?? ""}` : o.propertyType}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10 }}>
                      Raise {fmtMoney(o.raisedToHard)} / {fmtMoney(o.raiseTarget)}
                    </div>
                    <select
                      value={o.stage}
                      onChange={(e) => {
                        e.stopPropagation();
                        changeStage(o.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        padding: 2,
                        border: "0.5px solid var(--border-mid)",
                        borderRadius: 3,
                        width: "100%",
                      }}
                    >
                      {STAGE_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {drawer && (
        <DealDrawer
          offering={drawer}
          onClose={() => setDrawer(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function NewDealForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (form: HTMLFormElement) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
      style={{
        background: "var(--bg-secondary)",
        border: "0.5px solid var(--border-lo)",
        borderRadius: 6,
        padding: 12,
        marginBottom: 16,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}
    >
      <input name="name" required placeholder="Deal name" className="admin-input" style={{ width: "100%", gridColumn: "span 2" }} />
      <select name="propertyType" className="admin-select">
        <option value="MF">Multifamily</option>
        <option value="SF">Single family</option>
        <option value="MX">Mixed use</option>
        <option value="Other">Other</option>
      </select>
      <select name="stage" className="admin-select" defaultValue="Prospecting">
        {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input name="marketCity" placeholder="City" className="admin-input" style={{ width: "100%" }} />
      <input name="marketState" placeholder="State" className="admin-input" style={{ width: "100%" }} />
      <input name="raiseTarget" type="number" placeholder="Raise target ($)" className="admin-input" style={{ width: "100%" }} />
      <input name="minInvestment" type="number" placeholder="Min investment ($)" className="admin-input" style={{ width: "100%" }} />
      <input name="targetIrrLow" type="number" step="0.1" placeholder="IRR low %" className="admin-input" style={{ width: "100%" }} />
      <input name="targetIrrHigh" type="number" step="0.1" placeholder="IRR high %" className="admin-input" style={{ width: "100%" }} />
      <input name="holdMonths" type="number" placeholder="Hold (months)" className="admin-input" style={{ width: "100%" }} />
      <input name="closeDate" type="date" className="admin-input" style={{ width: "100%" }} />
      <textarea
        name="description"
        placeholder="Short description"
        style={{
          gridColumn: "span 4",
          minHeight: 60,
          padding: 8,
          fontSize: 11,
          border: "0.5px solid var(--border-mid)",
          borderRadius: 5,
          fontFamily: "var(--font)",
        }}
      />
      <div style={{ gridColumn: "span 4", display: "flex", gap: 6 }}>
        <button disabled={busy} type="submit" className="btn btn-p">Create deal</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function DealDrawer({
  offering,
  onClose,
  onSaved,
}: {
  offering: OfferingRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/offerings/${offering.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      alert("Save failed");
      return;
    }
    await onSaved();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.18)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          background: "#fff",
          padding: 20,
          overflowY: "auto",
          borderLeft: "0.5px solid var(--border-lo)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{offering.name}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Row label="Description">
            <textarea
              defaultValue={offering.description || ""}
              onBlur={(e) => {
                if (e.target.value !== (offering.description || ""))
                  save({ description: e.target.value });
              }}
              style={{
                width: "100%",
                minHeight: 70,
                padding: 8,
                fontSize: 12,
                border: "0.5px solid var(--border-mid)",
                borderRadius: 5,
                fontFamily: "var(--font)",
              }}
            />
          </Row>
          <Row label="Stage">
            <select
              className="admin-select"
              defaultValue={offering.stage}
              onChange={(e) => save({ stage: e.target.value })}
            >
              {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Row>
          <Row label="Raise target">
            <input
              type="number"
              className="admin-input"
              style={{ width: "100%" }}
              defaultValue={offering.raiseTarget ?? ""}
              onBlur={(e) =>
                save({ raiseTarget: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Row>
          <Row label="Hard / Soft">
            <div style={{ fontSize: 12 }}>
              {fmtMoney(offering.raisedToHard)} hard • {fmtMoney(offering.raisedToSoft)} soft
            </div>
          </Row>
          <Row label="IRR target">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                style={{ width: 80 }}
                defaultValue={offering.targetIrrLow ?? ""}
                onBlur={(e) =>
                  save({ targetIrrLow: e.target.value ? Number(e.target.value) : null })
                }
              />
              <span>—</span>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                style={{ width: 80 }}
                defaultValue={offering.targetIrrHigh ?? ""}
                onBlur={(e) =>
                  save({ targetIrrHigh: e.target.value ? Number(e.target.value) : null })
                }
              />
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>%</span>
            </div>
          </Row>
          <Row label="Close date">
            <input
              type="date"
              className="admin-input"
              defaultValue={offering.closeDate ? offering.closeDate.slice(0, 10) : ""}
              onBlur={(e) => save({ closeDate: e.target.value || null })}
            />
          </Row>
          <Row label="Cap-table">
            <div style={{ fontSize: 11 }}>
              {offering.subscriptions.length} subscriptions •{" "}
              {fmtMoney(offering.subscriptions.reduce((s, x) => s + x.committedAmount, 0))} committed
            </div>
          </Row>
          <WireInstructionsCard offering={offering} save={save} />
          {busy && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Saving…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WireInstructionsCard({
  offering,
  save,
}: {
  offering: OfferingRow;
  save: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const wi = offering.wireInstructions || {};
  const [draft, setDraft] = useState({
    bankName: wi.bankName || "",
    routingNumber: wi.routingNumber || "",
    accountNumber: wi.accountNumber || "",
    beneficiary: wi.beneficiary || "",
    swift: wi.swift || "",
    memo: wi.memo || "",
  });
  const set = (k: keyof typeof draft, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Row label="Wire / ACH instructions">
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "0.5px solid var(--border-lo)",
          borderRadius: 5,
          padding: 8,
          display: "grid",
          gap: 6,
        }}
      >
        <input className="admin-input" placeholder="Bank name" value={draft.bankName} onChange={(e) => set("bankName", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input className="admin-input" placeholder="Routing #" value={draft.routingNumber} onChange={(e) => set("routingNumber", e.target.value)} />
          <input className="admin-input" placeholder="Account #" value={draft.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
        </div>
        <input className="admin-input" placeholder="Beneficiary / FBO" value={draft.beneficiary} onChange={(e) => set("beneficiary", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 6 }}>
          <input className="admin-input" placeholder="SWIFT (optional)" value={draft.swift} onChange={(e) => set("swift", e.target.value)} />
          <input className="admin-input" placeholder="Reference / memo" value={draft.memo} onChange={(e) => set("memo", e.target.value)} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            Investors see these on the funding page after they commit.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => save({ wireInstructions: null })}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-sm btn-p"
              onClick={() => save({ wireInstructions: draft })}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// avoid unused-import warning
void fmtPct;
void fmtDate;
