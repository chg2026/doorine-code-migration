/**
 * Standalone contractor-portal seed.
 *   npm run db:seed-contractor --workspace=apps/chg-rehab
 *
 * Mirrors `seed-investor.ts`. The full chg-rehab seed also calls
 * `seedContractorPortal()` at the end of `main()` in `seed.ts`.
 */
import { PrismaClient } from "@prisma/client";
import { seedContractorPortal } from "./seed-contractor-shared";

const prisma = new PrismaClient();

async function main() { await seedContractorPortal(prisma); }

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
