import { prisma } from "@/lib/prisma";

const TEAM_SEEDS = [
  { slug: "general", name: "#general" },
  { slug: "acquisitions", name: "#acquisitions" },
  { slug: "rehab-updates", name: "#rehab-updates" },
];

/**
 * Ensure the three default team channels exist for this company and that
 * every active user in the company is a member. Idempotent.
 */
export async function ensureTeamChannels(companyId: string): Promise<void> {
  const existing = await prisma.wsChannel.findMany({
    where: { companyId, kind: "team" },
    select: { id: true, slug: true },
  });
  const haveSlugs = new Set(existing.map((c) => c.slug));
  for (const seed of TEAM_SEEDS) {
    if (!haveSlugs.has(seed.slug)) {
      await prisma.wsChannel.create({
        data: { companyId, kind: "team", slug: seed.slug, name: seed.name },
      });
    }
  }

  // Refresh and ensure all active users are members.
  const channels = await prisma.wsChannel.findMany({
    where: { companyId, kind: "team" },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { companyId, active: true },
    select: { id: true },
  });
  for (const ch of channels) {
    for (const u of users) {
      await prisma.wsChannelMember.upsert({
        where: { channelId_userId: { channelId: ch.id, userId: u.id } },
        update: {},
        create: { channelId: ch.id, userId: u.id },
      });
    }
  }
}
