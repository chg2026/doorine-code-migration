"use client";

import Link from "next/link";

export default function ScheduleViewToggle({
  projectCode,
  view,
}: {
  projectCode: string;
  view: "gantt" | "list";
}) {
  const base = `/rehab/${projectCode}/schedule`;
  return (
    <div className="toggle-group">
      <Link
        href={base}
        className={`tg-btn ${view === "gantt" ? "active" : ""}`}
        scroll={false}
      >
        Gantt
      </Link>
      <Link
        href={`${base}?view=list`}
        className={`tg-btn ${view === "list" ? "active" : ""}`}
        scroll={false}
      >
        List view
      </Link>
    </div>
  );
}
