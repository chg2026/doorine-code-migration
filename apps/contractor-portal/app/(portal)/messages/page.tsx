import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const c = (await getCurrentContractor())!;
  const threads = await prisma.cpMessageThread.findMany({
    where: { OR: [{ contractorAId: c.id }, { contractorBId: c.id }] },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      job: { select: { name: true } },
      contractorA: { select: { contactName: true, companyName: true, id: true } },
      contractorB: { select: { contactName: true, companyName: true, id: true } },
      layer1Company: { select: { name: true } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return (
    <PortalPage title="Messages" subtitle="Conversations with operators, subs, and clients">
      <div className="card">
        {threads.length === 0 ? <div className="empty-state">No messages yet.</div> : threads.map((t) => {
          const last = t.messages[0];
          const otherName =
            t.layer1Company?.name ||
            (t.contractorAId === c.id ? t.contractorB?.companyName : t.contractorA?.companyName) ||
            "Someone";
          return (
            <div key={t.id} className="fi" style={{ cursor: "pointer" }}>
              <div className="av av-s a-blue">{otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div className="fi-title">{t.subject}</div>
                <div className="fi-sub">{otherName}{t.job ? ` · ${t.job.name}` : ""}</div>
                {last && <div className="fi-sub" style={{ marginTop: 4, fontStyle: "italic" }}>“{last.body.slice(0, 120)}{last.body.length > 120 ? "…" : ""}”</div>}
              </div>
              <div className="fi-time">{fmtDate(t.lastMessageAt)}</div>
            </div>
          );
        })}
      </div>
    </PortalPage>
  );
}
