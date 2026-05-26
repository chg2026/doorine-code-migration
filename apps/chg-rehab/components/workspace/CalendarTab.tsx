"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "./styles.module.css";

type Ev = { id: string; title: string; when: string; kind: string; link: string | null };

const KIND_LABELS: Record<string, string> = {
  task: "Task due",
  deal: "Pipeline",
  project: "Rehab",
  doc: "Document",
  distribution: "Distribution",
  event: "Event",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarTab() {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1 };
  });
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/workspace/calendar?month=${cursor.y}-${String(cursor.m).padStart(2, "0")}`, { cache: "no-store" });
      const data = await r.json();
      setEvents(data.events ?? []);
    } finally { setLoading(false); }
  }, [cursor]);
  useEffect(() => { load(); }, [load]);

  const { cells, byDay } = useMemo(() => {
    const first = new Date(cursor.y, cursor.m - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, -(startDow - 1 - i)), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, daysInMonth + (cells.length - startDow - daysInMonth + 1)), inMonth: false });
    }
    const byDay = new Map<string, Ev[]>();
    for (const e of events) {
      const d = new Date(e.when);
      const key = ymd(d);
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }
    return { cells, byDay };
  }, [cursor, events]);

  const monthLabel = useMemo(() => {
    return new Date(cursor.y, cursor.m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [cursor]);
  const todayKey = ymd(new Date());

  const upcoming = useMemo(() => {
    const now = new Date();
    return events.filter((e) => new Date(e.when) >= now).slice(0, 8);
  }, [events]);

  return (
    <div className={s.calWrap}>
      <div>
        <div className={s.calGrid}>
          <div className={s.calNav}>
            <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => {
              setCursor((c) => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 });
            }}>‹</button>
            <span className={s.calMonth}>{monthLabel}</span>
            <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => {
              setCursor((c) => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 });
            }}>›</button>
          </div>
          <div className={s.calHead}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className={s.calBody}>
            {cells.map((c, i) => {
              const key = ymd(c.date);
              const dayEvents = byDay.get(key) ?? [];
              return (
                <div
                  key={i}
                  className={`${s.calCell} ${c.inMonth ? "" : s.muted} ${key === todayKey ? s.today : ""}`}
                >
                  <div>{c.date.getDate()}</div>
                  {dayEvents.length > 0 ? (
                    <div className={s.calDots}>
                      {dayEvents.slice(0, 4).map((e) => <span key={e.id} className={s.calDot} title={e.title} />)}
                      {dayEvents.length > 4 ? <span style={{ fontSize: 9, color: "var(--quill)" }}>+{dayEvents.length - 4}</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div>
        <div className={s.card}>
          <div className={s.cardTitle}>Upcoming events</div>
          {loading ? (
            <div className={s.empty} style={{ padding: 20 }}>Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className={s.empty} style={{ padding: 20 }}>Nothing scheduled.</div>
          ) : upcoming.map((e) => {
            const d = new Date(e.when);
            const content = (
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border-1)" }}>
                <div style={{ fontSize: 12, color: "var(--quill)" }}>
                  {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {KIND_LABELS[e.kind] ?? e.kind}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 2 }}>{e.title}</div>
              </div>
            );
            return e.link ? (
              <Link key={e.id} href={e.link} style={{ display: "block", textDecoration: "none", color: "inherit" }}>{content}</Link>
            ) : <div key={e.id}>{content}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
