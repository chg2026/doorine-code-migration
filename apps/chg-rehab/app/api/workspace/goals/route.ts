import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const goals = await prisma.wsGoal.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
    },
    take: 200,
  });
  return NextResponse.json({
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      scope: g.scope,
      period: g.period,
      metricMode: g.metricMode,
      current: g.current,
      target: g.target,
      done: g.done,
      owner: g.owner
        ? {
            id: g.owner.id,
            name: [g.owner.firstName, g.owner.lastName].filter(Boolean).join(" ") || g.owner.email || "User",
            initials: (g.owner.initials ||
              [(g.owner.firstName ?? "")[0], (g.owner.lastName ?? "")[0]]
                .filter(Boolean).join("") || "?").toUpperCase(),
          }
        : null,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    scope?: string;
    ownerUserId?: string | null;
    target?: number;
    metricMode?: string;
    period?: string | null;
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const scope = body.scope === "user" ? "user" : "company";
  const metricMode = body.metricMode === "percent" ? "percent" : "count";

  // Tenant-scoped validation: ownerUserId must belong to the same company.
  let ownerUserId: string | null = null;
  if (scope === "user") {
    const candidate = body.ownerUserId ?? user.id;
    const target = await prisma.user.findFirst({
      where: { id: candidate, companyId: user.companyId, active: true },
      select: { id: true },
    });
    ownerUserId = target?.id ?? user.id;
  }

  const g = await prisma.wsGoal.create({
    data: {
      companyId: user.companyId,
      title,
      scope,
      metricMode,
      target: Math.max(1, Math.min(10000, Number(body.target ?? 1))),
      period: body.period ?? null,
      ownerUserId,
    },
  });
  return NextResponse.json({ id: g.id });
}
