import { prisma } from "@/lib/prisma";
import ScopeSwitcher from "./ScopeSwitcher";

/**
 * Topbar for the (portal) layout. Renders the scope switcher on the left
 * (only when the account has both a "my" scope and downstream invitees,
 * i.e. is L2-with-invitees or sole-with-invitees) plus a right-side slot
 * for plan/upgrade affordances.
 */
export default async function PortalTopBar({
  accountId,
  planTier,
}: {
  accountId: string;
  planTier: string;
}) {
  const [myJobs, myQuotes, opJobs, opQuotes, inviteeCount] = await Promise.all([
    prisma.cpJob.count({ where: { contractorId: accountId } }),
    prisma.cpQuote.count({ where: { fromAccountId: accountId } }),
    prisma.cpJob.count({ where: { awardedByAccountId: accountId } }),
    prisma.cpQuote.count({ where: { toAccountId: accountId } }),
    // Drives whether to show the operator scope switcher: any downstream
    // invitee qualifies the account as an "operator" even before any
    // job/quote activity has happened (per task spec).
    prisma.cpOperatorEdge.count({ where: { inviterAccountId: accountId } }),
  ]);

  const showOperator = inviteeCount > 0 || opJobs + opQuotes > 0;

  return (
    <div className="topbar">
      <ScopeSwitcher
        showOperator={showOperator}
        myCount={{ jobs: myJobs, quotes: myQuotes }}
        operatorCount={{ jobs: opJobs, quotes: opQuotes }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--t2)" }}>
        <span className={`pill ${planTier === "free" ? "p-amber" : "p-teal"}`}>
          {planTier === "free" ? "Free plan" : "Pro plan"}
        </span>
        {planTier === "free" ? (
          <a href="/account/upgrade" className="btn btn-sm btn-p">Upgrade</a>
        ) : null}
      </div>
    </div>
  );
}
