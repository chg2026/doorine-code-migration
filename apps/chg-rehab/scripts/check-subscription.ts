import { prisma } from "../lib/prisma";

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${companies.length} companies\n`);

  for (const c of companies) {
    const sub = await prisma.subscription.findUnique({ where: { companyId: c.id } });
    const seats = await prisma.user.count({ where: { companyId: c.id, active: true } });
    const pending = await prisma.invite.count({ where: { companyId: c.id, status: "Pending" } });
    console.log(`Company: ${c.name} (${c.id})`);
    console.log("  Subscription:", sub);
    console.log("  Active users:", seats);
    console.log("  Pending invites:", pending);
    console.log("");
  }

  await prisma.$disconnect();
}

main();
