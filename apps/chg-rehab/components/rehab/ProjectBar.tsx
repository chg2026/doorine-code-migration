import Link from "next/link";
import { formatET } from "@/lib/datetime";
import type { FullProject } from "@/lib/rehab/queries";
import { parseProjectMeta } from "@/lib/rehab/types";
import PmLedToggle from "./PmLedToggle";

export default function ProjectBar({ project }: { project: FullProject }) {
  const meta = parseProjectMeta(project.meta);
  const mode = meta.mode || "Internally Managed";
  const statusLabel = meta.statusLabel || "In Progress";
  const last = meta.lastUpdated || project.updatedAt;
  const cityState = [project.property.city, project.property.state].filter(Boolean).join(" ");
  return (
    <div className="proj-bar">
      <div className="proj-l">
        <Link
          href="/rehab"
          style={{
            fontSize: 10, color: "var(--text-tertiary)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
          }}
        >
          ← Projects
        </Link>
        <span style={{ color: "var(--border-mid)", fontSize: 12 }}>/</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" />
          <path d="M4 13V9h6v4" stroke="currentColor" strokeWidth="0.9" />
          <path d="M0.5 6L7 1.5 13.5 6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        </svg>
        <span className="proj-addr">
          {project.property.address}
          {cityState ? `, ${cityState}` : ""}
        </span>
        <span className="proj-chip">{project.property.code}</span>
      </div>
      <div className="proj-r">
        <span className="proj-mode">
          {statusLabel} · {mode}
        </span>
        <PmLedToggle projectCode={project.code} pmLed={meta.pmLed} />
        <span className="proj-ts">{formatET(new Date(last))}</span>
      </div>
    </div>
  );
}
