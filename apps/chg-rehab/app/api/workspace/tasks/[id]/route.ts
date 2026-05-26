import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { done?: boolean; title?: string; priority?: string };

  const existing = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    data.done = body.done;
    data.doneAt = body.done ? new Date() : null;
  }
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.priority && ["Urgent", "Medium", "Low"].includes(body.priority)) data.priority = body.priority;

  const updated = await prisma.wsTask.update({ where: { id }, data });

  // Notify creator when a task they assigned to someone else gets completed.
  if (
    typeof body.done === "boolean" &&
    body.done &&
    !existing.done &&
    existing.assigneeId &&
    existing.assigneeId !== existing.createdById &&
    user.id === existing.assigneeId
  ) {
    const closerName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
    await enqueueWorkspaceInApp({
      companyId: user.companyId,
      userId: existing.createdById,
      event: "workspace.task.completed",
      title: `Task completed: ${existing.title}`,
      body: `${closerName} marked your assigned task as done.`,
      link: "/command-center",
      dedupeKey: `task:${existing.id}:completed`,
    });
  }

  return NextResponse.json({ id: updated.id, done: updated.done });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.wsTask.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.wsTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
