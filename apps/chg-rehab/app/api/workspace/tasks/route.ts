import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";

type Filter = "all" | "mine" | "assigned-out";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const filter = (url.searchParams.get("filter") || "all") as Filter;
  const includeDone = url.searchParams.get("done") === "1";

  const where: Record<string, unknown> = { companyId: user.companyId };
  if (!includeDone) where.done = false;
  if (filter === "mine") where.assigneeId = user.id;
  if (filter === "assigned-out") {
    where.createdById = user.id;
    where.assigneeId = { not: user.id };
  }

  const tasks = await prisma.wsTask.findMany({
    where,
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() ?? null,
      done: t.done,
      doneAt: t.doneAt?.toISOString() ?? null,
      linkType: t.linkType,
      linkId: t.linkId,
      linkLabel: t.linkLabel,
      assignee: t.assignee
        ? {
            id: t.assignee.id,
            name: [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(" ") ||
              t.assignee.email || "User",
            initials: (t.assignee.initials ||
              [(t.assignee.firstName ?? "")[0], (t.assignee.lastName ?? "")[0]]
                .filter(Boolean).join("") || "?").toUpperCase(),
          }
        : null,
      createdBy: t.createdBy
        ? {
            id: t.createdBy.id,
            name: [t.createdBy.firstName, t.createdBy.lastName].filter(Boolean).join(" ") || "User",
          }
        : null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    priority?: string;
    linkType?: string | null;
    linkId?: string | null;
    linkLabel?: string | null;
    sourceMessageId?: string | null;
  };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // Validate assignee belongs to the same company.
  let assigneeId: string | null = null;
  if (body.assigneeId) {
    const target = await prisma.user.findFirst({
      where: { id: body.assigneeId, companyId: user.companyId, active: true },
      select: { id: true },
    });
    if (target) assigneeId = target.id;
  }

  const priority = ["Urgent", "Medium", "Low"].includes(body.priority ?? "")
    ? (body.priority as string)
    : "Medium";

  // Tenant-scoped validation for source message: must belong to this company,
  // and (for team channels) the user must be a member.
  let sourceMessageId: string | null = null;
  if (body.sourceMessageId) {
    const msg = await prisma.wsMessage.findFirst({
      where: { id: body.sourceMessageId, companyId: user.companyId },
      include: { channel: { select: { id: true, kind: true } } },
    });
    if (msg) {
      if (msg.channel.kind === "team") {
        const member = await prisma.wsChannelMember.findUnique({
          where: { channelId_userId: { channelId: msg.channel.id, userId: user.id } },
        });
        if (member) sourceMessageId = msg.id;
      } else {
        sourceMessageId = msg.id;
      }
    }
  }

  const task = await prisma.wsTask.create({
    data: {
      companyId: user.companyId,
      createdById: user.id,
      assigneeId,
      title,
      priority,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      linkType: body.linkType ?? null,
      linkId: body.linkId ?? null,
      linkLabel: body.linkLabel ?? null,
      sourceMessageId,
    },
  });

  // Mark source message as converted (already tenant-validated above).
  if (sourceMessageId) {
    await prisma.wsMessage.update({
      where: { id: sourceMessageId },
      data: { convertedTaskId: task.id },
    }).catch(() => undefined);
  }

  // Notify assignee (don't self-notify).
  if (assigneeId && assigneeId !== user.id) {
    const creatorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
    await enqueueWorkspaceInApp({
      companyId: user.companyId,
      userId: assigneeId,
      event: "workspace.task.assigned",
      title: `New task: ${title}`,
      body: `${creatorName} assigned you a task${task.dueDate ? ` due ${task.dueDate.toLocaleDateString()}` : ""}.`,
      link: "/command-center",
      urgent: priority === "Urgent",
      dedupeKey: `task:${task.id}:assigned`,
    });
  }

  return NextResponse.json({ id: task.id });
}
