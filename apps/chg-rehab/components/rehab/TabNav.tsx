"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "overview", label: "Overview" },
  { slug: "sow", label: "Scope of Work" },
  { slug: "budget", label: "Budget & Costs" },
  { slug: "schedule", label: "Schedule" },
  { slug: "checklist", label: "Checklist & Payments" },
  { slug: "documents", label: "Documents" },
  { slug: "activity", label: "Activity" },
];

export default function TabNav({ projectCode }: { projectCode: string }) {
  const pathname = usePathname();
  const base = `/rehab/${encodeURIComponent(projectCode)}`;
  return (
    <div className="tab-nav">
      {TABS.map((t) => {
        const href = `${base}/${t.slug}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={t.slug} href={href} className={active ? "tab-btn active" : "tab-btn"}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
