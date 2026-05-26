import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/workspace/reminders — returns a unified, derived feed:
 *  - documents expiring within 30 days
 *  - tasks overdue (dueDate < now and not done)
 *  - user-created WsReminder rows
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [expDocs, overdueTasks, manual] = await Promise.all([
    prisma.document.findMany({
      where: {
        companyId: user.companyId,
        status: "Active",
        expiresAt: { not: null, gte: now, lte: horizon },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
    }),
    prisma.wsTask.findMany({
      where: { companyId: user.companyId, done: false, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    prisma.wsReminder.findMany({
      where: { companyId: user.companyId, done: false },
      orderBy: { remindAt: "asc" },
      take: 50,
    }),
  ]);

  type Item = {
    id: string;
    title: string;
    source: string;
    link: string | null;
    when: string | null;
    urgent: boolean;
    kind: "doc" | "task" | "manual";
  };
  const items: Item[] = [];
  for (const d of expDocs) {
    const days = Math.ceil((d.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    items.push({
      id: `doc:${d.id}`,
      title: `${d.name} expires in ${days} day${days === 1 ? "" : "s"}`,
      source: `Documents hub · ${d.category}`,
      link: "/docs",
      when: d.expiresAt!.toISOString(),
      urgent: days <= 7,
      kind: "doc",
    });
  }
  for (const t of overdueTasks) {
    items.push({
      id: `task:${t.id}`,
      title: `Overdue: ${t.title}`,
      source: "Command Center · To-do list",
      link: "/command-center",
      when: t.dueDate?.toISOString() ?? null,
      urgent: true,
      kind: "task",
    });
  }
  for (const r of manual) {
    items.push({
      id: `manual:${r.id}`,
      title: r.title,
      source: r.source ?? "Reminder",
      link: r.link,
      when: r.remindAt?.toISOString() ?? null,
      urgent: r.urgent,
      kind: "manual",
    });
  }
  items.sort((a, b) => (a.when ?? "9999").localeCompare(b.when ?? "9999"));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    remindAt?: string | null;
    urgent?: boolean;
    source?: string | null;
    link?: string | null;
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const r = await prisma.wsReminder.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      title,
      remindAt: body.remindAt ? new Date(body.remindAt) : null,
      urgent: Boolean(body.urgent),
      source: body.source ?? null,
      link: body.link ?? null,
    },
  });
  return NextResponse.json({ id: r.id });
}
