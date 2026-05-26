"use client";

import { useCallback, useEffect, useState } from "react";
import s from "@/components/workspace/styles.module.css";
import TodoTab from "@/components/workspace/TodoTab";
import CalendarTab from "@/components/workspace/CalendarTab";
import GoalsTab from "@/components/workspace/GoalsTab";
import RemindersTab from "@/components/workspace/RemindersTab";
import CreateTaskModal from "@/components/workspace/CreateTaskModal";

const TABS = [
  { id: "todo", label: "To-do list" },
  { id: "calendar", label: "Calendar" },
  { id: "goals", label: "Goals" },
  { id: "reminders", label: "Reminders" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CommandCenterPage() {
  const [tab, setTab] = useState<TabId>("todo");
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dismiss the NEW pill once the user lands here.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workspace_new_seen");
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (!seen.includes("command-center")) {
        seen.push("command-center");
        localStorage.setItem("workspace_new_seen", JSON.stringify(seen));
        window.dispatchEvent(new Event("workspace-new-seen"));
      }
    } catch { /* ignore */ }
  }, []);

  const onTaskCreated = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Command Center</h1>
          <div className={s.subtitle}>Your daily operations hub: tasks, calendar, goals, reminders.</div>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={() => setModalOpen(true)}>+ New task</button>
        </div>
      </div>
      <div className={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${s.tab} ${tab === t.id ? s.active : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.body}>
        {tab === "todo" ? <TodoTab refreshKey={refreshKey} /> : null}
        {tab === "calendar" ? <CalendarTab /> : null}
        {tab === "goals" ? <GoalsTab /> : null}
        {tab === "reminders" ? <RemindersTab /> : null}
      </div>
      <CreateTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onTaskCreated} />
    </div>
  );
}
