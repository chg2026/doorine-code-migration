import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueWorkspaceInApp } from "@/lib/workspace/notify";

async function assertAccess(userId: string, companyId: string, channelId: string) {
  const ch = await prisma.wsChannel.findFirst({
    where: { id: channelId, companyId },
  });
  if (!ch) return null;
  if (ch.kind === "team") {
    const m = await prisma.wsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!m) return null;
  }
  return ch;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ch = await assertAccess(user.id, user.companyId, id);
  if (!ch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const after = url.searchParams.get("after");

  const messages = await prisma.wsMessage.findMany({
    where: {
      channelId: id,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      author: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
      convertedTask: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({
    channel: { id: ch.id, kind: ch.kind, name: ch.name },
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.authorUserId === user.id,
      authorName: m.author
        ? [m.author.firstName, m.author.lastName].filter(Boolean).join(" ") || m.author.email || "User"
        : m.authorLabel || "System",
      authorInitials: m.author
        ? (m.author.initials ||
            [(m.author.firstName ?? "")[0], (m.author.lastName ?? "")[0]]
              .filter(Boolean).join("") || "?").toUpperCase()
        : "·",
      convertedTaskId: m.convertedTaskId,
      convertedTaskTitle: m.convertedTask?.title ?? null,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ch = await assertAccess(user.id, user.companyId, id);
  if (!ch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const msg = await prisma.wsMessage.create({
    data: {
      companyId: user.companyId,
      channelId: id,
      authorUserId: user.id,
      body: text,
    },
  });

  // Notify other members (team) — DM-side notifications for contractors/
  // investors are out of scope per Task #1 (their portals aren't touched here).
  if (ch.kind === "team") {
    const members = await prisma.wsChannelMember.findMany({
      where: { channelId: id, NOT: { userId: user.id } },
      select: { userId: true },
    });
    const senderName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone";
    for (const m of members) {
      await enqueueWorkspaceInApp({
        companyId: user.companyId,
        userId: m.userId,
        event: "workspace.message",
        title: `${senderName} in ${ch.name}`,
        body: text.slice(0, 140),
        link: `/messages?channel=${ch.id}`,
        dedupeKey: `msg:${msg.id}:${m.userId}`,
      });
    }
  }

  return NextResponse.json({ id: msg.id, createdAt: msg.createdAt.toISOString() });
}
