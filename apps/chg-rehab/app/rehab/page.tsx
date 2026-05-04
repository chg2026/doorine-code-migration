import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import AddProjectButton from "@/components/rehab/AddProjectButton";
import RehabSearchInput from "@/components/rehab/RehabSearchInput";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Planning:    { bg: "#F1F5F9", color: "#475569" },
  Active:      { bg: "#E6F1FB", color: "#0C447C" },
  OnHold:      { bg: "#FEF9EC", color: "#92400E" },
  Complete:    { bg: "#EAF3DE", color: "#27500A" },
};

function fmtMoney(n: number | null | undefined) {
  if (!n) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function RehabIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "rehab", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to the Rehab Manager.</div>;
  }

  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();

  const allProjects = await prisma.project.findMany({
    where: { companyId: user.companyId },
    include: {
      property: { select: { address: true, city: true, state: true, code: true } },
      phases: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const filtered = allProjects.filter((p) => {
    if (!q) return true;
    const hay = `${p.code} ${p.name} ${p.property.address} ${p.property.city ?? ""} ${p.property.code}`.toLowerCase();
    return hay.includes(q);
  });

  const visible = filtered.slice(0, PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" />
            <path d="M4 13V9h6v4" stroke="currentColor" strokeWidth="0.9" />
            <path d="M0.5 6L7 1.5 13.5 6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
          <span className="proj-addr">Rehab Manager</span>
          <AddProjectButton />
        </div>
        <div className="proj-r">
          <span className="proj-ts">{allProjects.length} project{allProjects.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT: project list */}
        <div style={{
          width: 240, flexShrink: 0,
          borderRight: "0.5px solid var(--border-lo)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0 }}>
            <RehabSearchInput initialValue={sp.q || ""} />
          </div>

          <div style={{
            padding: "4px 10px", fontSize: 9, color: "var(--text-tertiary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            {q
              ? `${visible.length} of ${filtered.length} matching · ${allProjects.length} total`
              : `${allProjects.length} project${allProjects.length !== 1 ? "s" : ""}`}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((proj) => {
              const col = STATUS_COLORS[proj.status] ?? STATUS_COLORS.Planning;
              const phaseDone = proj.phases.filter((p) => p.status === "Complete").length;
              const phaseTotal = proj.phases.length;
              const budget = fmtMoney(proj.budget ? Number(proj.budget) : null);
              return (
                <Link
                  key={proj.id}
                  href={`/rehab/${encodeURIComponent(proj.code)}/overview`}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "9px 10px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    textDecoration: "none", color: "inherit",
                    cursor: "pointer",
                  }}
                  className="ln-item"
                >
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                    {proj.property.address.split(",")[0]}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                    {[proj.property.city, proj.property.code].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 500,
                      background: col.bg, color: col.color,
                    }}>
                      {proj.status === "Active" ? "In Progress" : proj.status}
                    </span>
                    {phaseTotal > 0 && (
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {phaseDone}/{phaseTotal} phases
                      </span>
                    )}
                    {budget && (
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{budget}</span>
                    )}
                  </div>
                </Link>
              );
            })}

            {filtered.length > PAGE_SIZE && (
              <div style={{ padding: 10, textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", borderTop: "0.5px solid var(--border-lo)" }}>
                {filtered.length - PAGE_SIZE} more — refine your search
              </div>
            )}

            {filtered.length === 0 && q && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
                No projects match &ldquo;{q}&rdquo;
              </div>
            )}

            {allProjects.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                No projects yet. Use the button above to create one.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: empty state */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          color: "var(--text-tertiary)", gap: 10,
        }}>
          <div style={{ fontSize: 36 }}>🏗️</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
            Select a project
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Choose a project from the list, or create a new one.
          </div>
        </div>
      </div>
    </div>
  );
}
