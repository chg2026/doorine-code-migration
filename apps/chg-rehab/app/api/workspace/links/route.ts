import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/workspace/links — returns active deals + projects for the "Link to"
 * picker in the task modal.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [deals, projects] = await Promise.all([
    prisma.pipelineDeal.findMany({
      where: { companyId: user.companyId, closedAt: null },
      select: { id: true, address: true, code: true, stage: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.project.findMany({
      where: { companyId: user.companyId, status: { not: "Complete" } },
      select: { id: true, name: true, code: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    deals: deals.map((d) => ({
      id: d.id,
      label: `${d.address} (Deal)`,
      sublabel: d.code,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      label: `${p.name} (Rehab)`,
      sublabel: p.code,
    })),
  });
}
