import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ProjectStatus } from "@prisma/client";

/**
 * Lightweight list of in-flight projects for the current user's company.
 * Used by selectors (e.g. the contractor assignment modal) so users can pick
 * a project from a dropdown instead of typing the code by hand.
 *
 * Returns projects that are not Complete, ordered by most recently updated,
 * with the underlying property's address for disambiguation.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: {
      companyId: user.companyId,
      status: { not: ProjectStatus.Complete },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      property: { select: { address: true } },
    },
  });

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      address: p.property?.address ?? "",
    })),
  });
}
