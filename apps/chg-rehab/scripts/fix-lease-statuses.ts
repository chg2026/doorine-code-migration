/**
 * One-off data-fix script: normalise legacy lease status values to the
 * current canonical enum (Active | Expired | Terminated | Pending).
 *
 * Run once against any environment that may contain pre-validation data:
 *
 *   npx tsx scripts/fix-lease-statuses.ts
 *
 * The script is idempotent — rows already carrying a valid status are
 * skipped.  Every row that IS updated is recorded in the ActivityLog so
 * there is a permanent audit trail.
 *
 * The update and its matching ActivityLog entry are written in a single
 * Prisma transaction so they always succeed or fail together — no lease
 * can be updated without a corresponding audit record.
 *
 * Exit codes:
 *   0  All done (including "nothing to do")
 *   1  One or more rows could not be updated (partial failure)
 */

import { PrismaClient } from "@prisma/client";
import { normaliseLeaseStatus, VALID_LEASE_STATUSES } from "../lib/normalise-lease-status";

const prisma = new PrismaClient();

async function main() {
  console.log("=== fix-lease-statuses starting ===");
  console.log(`Valid statuses: ${VALID_LEASE_STATUSES.join(", ")}`);

  // Fetch all leases whose status is NOT already one of the valid values.
  const staleLeases = await prisma.lease.findMany({
    where: {
      status: { notIn: [...VALID_LEASE_STATUSES] },
    },
    select: {
      id: true,
      companyId: true,
      tenantName: true,
      status: true,
    },
  });

  if (staleLeases.length === 0) {
    console.log("No stale lease statuses found. Nothing to do.");
    return;
  }

  console.log(`Found ${staleLeases.length} lease(s) with non-canonical status values:`);

  let updated = 0;
  let failed = 0;

  for (const lease of staleLeases) {
    const { normalised } = normaliseLeaseStatus(lease.status);
    console.log(
      `  [${lease.id}] tenant="${lease.tenantName}" status="${lease.status}" → "${normalised}"`
    );

    try {
      // Wrap both operations in a transaction so the lease update and its
      // audit log entry are always committed together or rolled back together.
      await prisma.$transaction([
        prisma.lease.update({
          where: { id: lease.id },
          data: { status: normalised },
        }),
        prisma.activityLogEntry.create({
          data: {
            companyId: lease.companyId,
            actorId: null,
            action: "lease.status_normalised",
            entity: "Lease",
            entityId: lease.id,
            message: `Lease status normalised from "${lease.status}" to "${normalised}" by fix-lease-statuses script`,
            meta: {
              previousStatus: lease.status,
              normalisedStatus: normalised,
              script: "scripts/fix-lease-statuses.ts",
            },
          },
        }),
      ]);

      updated++;
    } catch (err) {
      console.error(`  ERROR updating lease ${lease.id}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}  Failed: ${failed}`);

  if (failed > 0) {
    console.error(`${failed} lease(s) could not be updated.`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
