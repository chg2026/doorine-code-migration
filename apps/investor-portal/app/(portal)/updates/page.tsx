import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { getInvestorDealUpdates } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";
import { renderMarkdown } from "@/lib/markdown";
import UpdatesClient from "./UpdatesClient";

export const dynamic = "force-dynamic";

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; deal?: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const sp = await searchParams;
  const updates = await getInvestorDealUpdates(investor.id);

  // Pull unread activity rows + posted-by users in parallel.
  const posterIds = Array.from(
    new Set(updates.map((u) => u.postedById).filter((x): x is string => Boolean(x)))
  );
  const [unreadActivities, posters] = await Promise.all([
    updates.length === 0
      ? Promise.resolve([] as { relatedUpdateId: string | null }[])
      : prisma.investorActivity.findMany({
          where: {
            investorId: investor.id,
            relatedUpdateId: { in: updates.map((u) => u.id) },
            readAt: null,
          },
          select: { relatedUpdateId: true },
        }),
    posterIds.length === 0
      ? Promise.resolve([] as { id: string; firstName: string | null; lastName: string | null; email: string | null }[])
      : prisma.user.findMany({
          where: { id: { in: posterIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        }),
  ]);
  const unreadSet = new Set(
    unreadActivities.map((a) => a.relatedUpdateId).filter((x): x is string => Boolean(x))
  );
  const posterMap = new Map(
    posters.map((p) => [
      p.id,
      [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email || "Operator",
    ])
  );

  // Coerce DealUpdate.metricsJson into a flat list of {label, value} chips.
  function metricsToChips(json: unknown): { label: string; value: string }[] {
    if (!json || typeof json !== "object" || Array.isArray(json)) return [];
    return Object.entries(json as Record<string, unknown>)
      .map(([k, v]) => ({
        label: k,
        value:
          v === null || v === undefined
            ? "—"
            : typeof v === "object"
            ? JSON.stringify(v)
            : String(v),
      }))
      .slice(0, 8);
  }

  const rows = updates.map((u) => ({
    id: u.id,
    offeringId: u.offeringId,
    offeringName: u.offering.name,
    title: u.title,
    updateType: u.updateType,
    postedAt: u.postedAt.toISOString(),
    postedBy: u.postedById ? posterMap.get(u.postedById) || null : null,
    metrics: metricsToChips(u.metricsJson),
    bodyHtml: renderMarkdown(u.body || ""),
    isUnread: unreadSet.has(u.id),
  }));

  return (
    <PortalPage
      title="Reports & updates"
      subtitle="Operator updates from the deals you're invested in"
    >
      {rows.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No updates yet</div>
          When the operator publishes a quarterly letter or property update for
          one of your deals, it will appear here.
        </div>
      ) : (
        <UpdatesClient updates={rows} initialId={sp.id || null} initialDeal={sp.deal || null} />
      )}
    </PortalPage>
  );
}
