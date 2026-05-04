import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Operator-lens Messages: every thread the operator (this CpAccount)
 * is participating in with one of their invited subs (or their L1
 * upstream operator). Read-only listing — composing happens inside
 * an individual thread.
 */
export default async function OperatorMessagesPage() {
  const c = (await getCurrentContractor())!;
  // Graph-scope: only threads the current operator is a direct
  // participant in. Listing every thread that involves any of the
  // operator's invited subs would leak the subs' conversations with
  // other upstream operators.
  const threads = await prisma.cpMessageThread.findMany({
    where: {
      OR: [
        { contractorAId: c.id },
        { contractorBId: c.id },
      ],
    },
    include: {
      contractorA: { select: { id: true, companyName: true } },
      contractorB: { select: { id: true, companyName: true } },
      layer1Company: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return (
    <PortalPage title="Operator messages" subtitle={`${threads.length} active conversations across your network`}>
      <div className="card" style={{ padding: 0 }}>
        <table className="tbl">
          <thead>
            <tr><th>Subject</th><th>With</th><th>Last message</th><th>When</th></tr>
          </thead>
          <tbody>
            {threads.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No conversations yet.</td></tr>
            ) : threads.map((t) => {
              const other = t.contractorAId === c.id
                ? (t.contractorB?.companyName || t.layer1Company?.name || "—")
                : t.contractorA.companyName;
              const last = t.messages[0];
              return (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.subject}</td>
                  <td>{other}</td>
                  <td className="muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {last ? `${last.senderName}: ${last.body}` : "—"}
                  </td>
                  <td className="muted">{t.lastMessageAt.toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}
