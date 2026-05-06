import PortalPage from "@/components/PortalPage";
import EmptyState from "@/components/EmptyState";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpJobsPage() {
  const c = (await getCurrentContractor())!;
  // Graph-scope: only jobs the current operator personally awarded
  // (`awardedByAccountId == c.id`). Filtering merely by `contractorId in
  // <my invitees>` would leak a sub's work for other upstream operators.
  const jobs = await prisma.cpJob.findMany({
    where: { awardedByAccountId: c.id },
    include: { contractor: { select: { companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
  const cols: Record<string, typeof jobs> = { bid: [], upcoming: [], active: [], complete: [] };
  for (const j of jobs) (cols[j.status] ?? cols.active).push(j);

  return (
    <PortalPage title="Job pipeline" subtitle="Jobs awarded across your network">
      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🏗️"
            title="No jobs in pipeline"
            description="Award jobs to your subs and they'll move through the pipeline stages here."
          />
        </div>
      ) : (
        <div className="kanban">
          {(["bid", "upcoming", "active", "complete"] as const).map((k) => (
            <div key={k} className="kcol">
              <div className="kch"><span style={{ textTransform: "capitalize" }}>{k}</span><span>{cols[k].length}</span></div>
              {cols[k].map((j) => (
                <div key={j.id} className="kc">
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{j.name}</div>
                  <div style={{ fontSize: 10, color: "#6b6a66" }}>{j.contractor.companyName}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6 }}>{fmtC(j.contractAmount)}</div>
                </div>
              ))}
              {cols[k].length === 0 && (
                <div style={{ fontSize: 10, color: "#a09e99", padding: "6px 2px", textAlign: "center" }}>Empty</div>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalPage>
  );
}
