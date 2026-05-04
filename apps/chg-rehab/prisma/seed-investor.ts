/**
 * Standalone investor-portal seed. Idempotent — safe to re-run.
 *
 *   npm run db:seed:investor --workspace=apps/chg-rehab
 *
 * The full chg-rehab seed (`npm run db:seed --workspace=apps/chg-rehab`) also
 * invokes `seedInvestorPortal()` at the end of `main()` in `seed.ts`. This
 * file lets you re-seed just the investor side without re-running the (much
 * larger and currently fragile) chg-rehab seed.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Make sure the seed company exists; the chg-rehab seed normally creates
  // it, but it's cheap to upsert here so the standalone script also works
  // on a fresh DB.
  const company = await prisma.company.upsert({
    where: { id: "seed-company-chg" },
    update: { name: "Cleveland Holding Group" },
    create: {
      id: "seed-company-chg",
      name: "Cleveland Holding Group",
      legalName: "Cleveland Holding Group LLC",
      ein: "82-1234567",
    },
  });

  const { seedInvestorPortal } = await import("./seed-investor-shared");
  await seedInvestorPortal(prisma, company.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
