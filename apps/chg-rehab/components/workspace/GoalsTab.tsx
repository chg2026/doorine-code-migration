"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./styles.module.css";

type Goal = {
  id: string;
  title: string;
  scope: "company" | "user" | string;
  period: string | null;
  metricMode: "count" | "percent" | string;
  current: number;
  target: number;
  done: boolean;
  owner: { id: string; name: string; initials: string } | null;
};

function currentQuarter() {
  // Called only from button click handlers (client-only), never during render,
  // so TZ skew here can't cause hydration mismatches.
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export default function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<null | "company" | "user">(null);
  const [draft, setDraft] = useState({ title: "", target: 1, metricMode: "count" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/workspace/goals", { cache: "no-store" });
      const data = await r.json();
      setGoals(data.goals ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createGoal = async () => {
    if (!draft.title.trim() || !adding) return;
    await fetch("/api/workspace/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draft.title.trim(),
        target: draft.target,
        metricMode: draft.metricMode,
        scope: adding,
        period: currentQuarter(),
      }),
    });
    setDraft({ title: "", target: 1, metricMode: "count" });
    setAdding(null);
    load();
  };

  const bump = async (g: Goal, delta: number) => {
    const next = Math.max(0, Math.min(g.target, g.current + delta));
    setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, current: next, done: next >= x.target } : x)));
    await fetch(`/api/workspace/goals/${g.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current: next, done: next >= g.target }),
    });
  };

  const removeGoal = async (id: string) => {
    if (!confirm("Delete this goal?")) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    await fetch(`/api/workspace/goals/${id}`, { method: "DELETE" });
  };

  const company = goals.filter((g) => g.scope === "company");
  const userGoals = goals.filter((g) => g.scope !== "company");
  const byOwner = new Map<string, Goal[]>();
  for (const g of userGoals) {
    const key = g.owner?.id ?? "_";
    const arr = byOwner.get(key) ?? [];
    arr.push(g);
    byOwner.set(key, arr);
  }

  const renderGoal = (g: Goal) => {
    const pct = g.metricMode === "percent" ? g.current : (g.target ? Math.round((g.current / g.target) * 100) : 0);
    const display = g.done ? "Done" : g.metricMode === "percent" ? `${g.current}%` : `${g.current}/${g.target}`;
    return (
      <div key={g.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{g.title}</div>
          <div style={{ fontSize: 12, color: "var(--quill)", whiteSpace: "nowrap" }}>{display}</div>
        </div>
        <div className={s.progress}><div className={s.progressFill} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => bump(g, -1)}>−</button>
          <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => bump(g, 1)}>+</button>
          <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => removeGoal(g.id)} style={{ marginLeft: "auto", color: "var(--danger)" }}>Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div className={s.grid2}>
      <div className={s.card}>
        <div className={s.cardTitle}>
          <span>Company goals — {currentQuarter()}</span>
          <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => setAdding("company")}>+ Goal</button>
        </div>
        {loading ? <div className={s.empty}>Loading…</div> :
          company.length === 0 ? <div className={s.empty} style={{ padding: 20 }}>No company goals yet.</div> :
          company.map(renderGoal)}
      </div>
      <div className={s.card}>
        <div className={s.cardTitle}>
          <span>Individual goals</span>
          <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => setAdding("user")}>+ Goal</button>
        </div>
        {loading ? <div className={s.empty}>Loading…</div> :
          userGoals.length === 0 ? <div className={s.empty} style={{ padding: 20 }}>No individual goals yet.</div> :
          [...byOwner.entries()].map(([key, arr]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--quill)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {arr[0].owner?.name ?? "Unassigned"}
              </div>
              {arr.map(renderGoal)}
            </div>
          ))}
      </div>
      {adding ? (
        <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setAdding(null); }}>
          <div className={s.modal} style={{ width: 380 }}>
            <div className={s.modalHead}>
              <div className={s.modalTitle}>New {adding} goal</div>
              <button type="button" className={s.modalClose} onClick={() => setAdding(null)}>×</button>
            </div>
            <div className={s.modalBody}>
              <div className={s.field}>
                <label className={s.fieldLabel}>Title</label>
                <input className={s.fieldInput} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
              </div>
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.fieldLabel}>Mode</label>
                  <select className={s.fieldSelect} value={draft.metricMode} onChange={(e) => setDraft({ ...draft, metricMode: e.target.value })}>
                    <option value="count">Count (X / Y)</option>
                    <option value="percent">Percent</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.fieldLabel}>{draft.metricMode === "percent" ? "Goal %" : "Target"}</label>
                  <input
                    type="number"
                    className={s.fieldInput}
                    value={draft.target}
                    min={1}
                    max={draft.metricMode === "percent" ? 100 : 10000}
                    onChange={(e) => setDraft({ ...draft, target: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>
            </div>
            <div className={s.modalFoot}>
              <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => setAdding(null)}>Cancel</button>
              <button type="button" className={s.btn} onClick={createGoal} disabled={!draft.title.trim()}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
