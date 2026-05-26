"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import s from "./styles.module.css";

type Reminder = {
  id: string;
  title: string;
  source: string;
  link: string | null;
  when: string | null;
  urgent: boolean;
  kind: "doc" | "task" | "manual";
};

function whenPill(r: Reminder) {
  if (!r.when) return r.urgent ? { label: "Urgent", cls: s.pillRed } : { label: "—", cls: s.pillGrey };
  const d = new Date(r.when);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { label: "Overdue", cls: s.pillRed };
  if (diffDays === 0) return { label: "Today", cls: s.pillRed };
  if (r.urgent) return { label: `${diffDays}d · Urgent`, cls: s.pillRed };
  return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), cls: s.pillAmber };
}

function statusIcon(r: Reminder) {
  if (r.kind === "doc") return "📄";
  if (r.kind === "task") return "⏰";
  return "🔔";
}

export default function RemindersTab() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/workspace/reminders", { cache: "no-store" });
      const data = await r.json();
      setItems(data.items ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className={s.card}>
      <div className={s.cardTitle}>Active reminders</div>
      {loading ? (
        <div className={s.empty} style={{ padding: 20 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={s.empty} style={{ padding: 20 }}>You&apos;re all caught up. ✨</div>
      ) : items.map((r) => {
        const pill = whenPill(r);
        const content = (
          <div className={s.row} style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>{statusIcon(r)}</span>
            <div className={s.rowMain}>
              <div className={s.rowTitle}>{r.title}</div>
              <div className={s.rowMeta}>{r.source}</div>
            </div>
            <div className={s.rowRight}>
              <span className={`${s.pill} ${pill.cls}`}>{pill.label}</span>
            </div>
          </div>
        );
        return r.link ? (
          <Link key={r.id} href={r.link} style={{ display: "block", textDecoration: "none", color: "inherit" }}>{content}</Link>
        ) : <div key={r.id}>{content}</div>;
      })}
    </div>
  );
}
