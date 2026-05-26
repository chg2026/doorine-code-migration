import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureTeamChannels } from "@/lib/workspace/channels";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure team channels exist + user is a member.
  await ensureTeamChannels(user.companyId);

  // Team channels (membership-based).
  const memberships = await prisma.wsChannelMember.findMany({
    where: { userId: user.id, channel: { companyId: user.companyId, kind: "team" } },
    include: { channel: true },
  });

  // Contractor channels: one per linked CpAccount in the operator's edges.
  const contractorEdges = await prisma.cpOperatorEdge.findMany({
    where: { layer1CompanyId: user.companyId },
    include: { contractor: { select: { id: true, contactName: true, companyName: true, email: true } } },
  });

  // Investor channels: one per Investor row.
  const investorsRaw = await prisma.investor.findMany({
    where: { companyId: user.companyId },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const investors = investorsRaw.map((i) => ({
    id: i.id,
    displayName: [i.firstName, i.lastName].filter(Boolean).join(" ") || i.email || "Investor",
    primaryEmail: i.email,
  }));

  // Lazily ensure WsChannel rows exist for each contractor and investor DM.
  const dmChannels: { id: string; kind: string; name: string; partyType: string; partyId: string }[] = [];
  const seenContractor = new Set<string>();
  for (const e of contractorEdges) {
    if (seenContractor.has(e.contractor.id)) continue;
    seenContractor.add(e.contractor.id);
    const ch = await prisma.wsChannel.upsert({
      where: {
        companyId_kind_partyType_partyId: {
          companyId: user.companyId,
          kind: "contractor",
          partyType: "CpAccount",
          partyId: e.contractor.id,
        },
      },
      update: {},
      create: {
        companyId: user.companyId,
        kind: "contractor",
        partyType: "CpAccount",
        partyId: e.contractor.id,
        name: e.contractor.contactName || e.contractor.companyName || e.contractor.email || "Contractor",
      },
    });
    dmChannels.push({ id: ch.id, kind: "contractor", name: ch.name, partyType: "CpAccount", partyId: e.contractor.id });
  }
  for (const inv of investors) {
    const ch = await prisma.wsChannel.upsert({
      where: {
        companyId_kind_partyType_partyId: {
          companyId: user.companyId,
          kind: "investor",
          partyType: "Investor",
          partyId: inv.id,
        },
      },
      update: {},
      create: {
        companyId: user.companyId,
        kind: "investor",
        partyType: "Investor",
        partyId: inv.id,
        name: inv.displayName,
      },
    });
    dmChannels.push({ id: ch.id, kind: "investor", name: ch.name, partyType: "Investor", partyId: inv.id });
  }

  // Latest message preview + unread count per channel.
  const allChannelIds = [
    ...memberships.map((m) => m.channelId),
    ...dmChannels.map((c) => c.id),
  ];
  const latest = await prisma.wsMessage.findMany({
    where: { channelId: { in: allChannelIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["channelId"],
    select: { channelId: true, body: true, createdAt: true, authorLabel: true, authorUserId: true },
  });
  const latestByCh = new Map(latest.map((m) => [m.channelId, m]));

  // Unread counts: messages newer than the member's lastReadAt.
  const memberRows = await prisma.wsChannelMember.findMany({
    where: { userId: user.id, channelId: { in: allChannelIds } },
    select: { channelId: true, lastReadAt: true },
  });
  const lastReadByCh = new Map(memberRows.map((m) => [m.channelId, m.lastReadAt]));
  const unreadCounts = new Map<string, number>();
  for (const chId of allChannelIds) {
    const last = lastReadByCh.get(chId) ?? null;
    const count = await prisma.wsMessage.count({
      where: {
        channelId: chId,
        ...(last ? { createdAt: { gt: last } } : {}),
        NOT: { authorUserId: user.id },
      },
    });
    unreadCounts.set(chId, count);
  }

  const team = memberships.map((m) => ({
    id: m.channelId,
    kind: "team" as const,
    name: m.channel.name,
    preview: latestByCh.get(m.channelId)?.body ?? null,
    previewAt: latestByCh.get(m.channelId)?.createdAt?.toISOString() ?? null,
    unread: unreadCounts.get(m.channelId) ?? 0,
  }));
  const contractors = dmChannels
    .filter((c) => c.kind === "contractor")
    .map((c) => ({
      id: c.id,
      kind: "contractor" as const,
      name: c.name,
      preview: latestByCh.get(c.id)?.body ?? null,
      previewAt: latestByCh.get(c.id)?.createdAt?.toISOString() ?? null,
      unread: unreadCounts.get(c.id) ?? 0,
    }));
  const investorsList = dmChannels
    .filter((c) => c.kind === "investor")
    .map((c) => ({
      id: c.id,
      kind: "investor" as const,
      name: c.name,
      preview: latestByCh.get(c.id)?.body ?? null,
      previewAt: latestByCh.get(c.id)?.createdAt?.toISOString() ?? null,
      unread: unreadCounts.get(c.id) ?? 0,
    }));

  return NextResponse.json({ team, contractors, investors: investorsList });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { name?: string };
  const raw = (body.name ?? "").trim().replace(/^#/, "");
  if (!raw) return NextResponse.json({ error: "Channel name required" }, { status: 400 });
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 48);
  if (!slug) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const existing = await prisma.wsChannel.findFirst({
    where: { companyId: user.companyId, kind: "team", slug },
  });
  if (existing) return NextResponse.json({ id: existing.id, name: existing.name });

  const ch = await prisma.wsChannel.create({
    data: { companyId: user.companyId, kind: "team", slug, name: `#${slug}` },
  });
  // Add all active team users as members.
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId, active: true },
    select: { id: true },
  });
  await prisma.wsChannelMember.createMany({
    data: users.map((u) => ({ channelId: ch.id, userId: u.id })),
    skipDuplicates: true,
  });
  return NextResponse.json({ id: ch.id, name: ch.name });
}
