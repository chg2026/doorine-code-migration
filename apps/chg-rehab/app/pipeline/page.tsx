import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import PipelineView from "@/components/pipeline/PipelineView";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user) {
    console.log("[auth:diag] pipeline/page | getCurrentUser()=null | action=redirect_login | reason=no_session_or_no_profile_row");
    redirect("/login");
  }

  const canView = await can(user, "pipeline", "view");
  if (!canView) {
    return <div style={{ padding: 20 }}>You do not have access to the pipeline.</div>;
  }

  const deals = await prisma.pipelineDeal.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ stage: "asc" }, { createdAt: "desc" }],
  });

  const serialized = deals.map((d) => ({
    id: d.id,
    code: d.code,
    address: d.address,
    stage: d.stage,
    askingPrice: d.askingPrice?.toString() ?? null,
    estimatedRoi: d.estimatedRoi?.toString() ?? null,
    closedAt: d.closedAt,
    createdAt: d.createdAt,
    meta: (d.meta ?? null) as Record<string, unknown> | null,
  }));

  return <PipelineView deals={serialized} />;
}
