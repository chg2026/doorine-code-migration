import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMtdCounters, num } from "@/lib/portfolio";
import ActivityClient from "./ActivityClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page || "1", 10) || 1);
  const skip = (pageNum - 1) * PAGE_SIZE;

  // MTD counters reflect the *current calendar month*, not just the page
  // slice — otherwise navigating to older pages would zero them out.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [activities, totalCount, mtdActivities, mtdAllocs, prefs] = await Promise.all([
    prisma.investorActivity.findMany({
      where: { investorId: investor.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.investorActivity.count({ where: { investorId: investor.id } }),
    prisma.investorActivity.findMany({
      where: { investorId: investor.id, createdAt: { gte: monthStart } },
    }),
    // MTD distribution dollars come from real allocations (Sent only) so
    // they match portfolio numbers exactly — string-parsing the activity
    // description was approximate and could drift.
    prisma.distributionAllocation.findMany({
      where: {
        subscription: { investorId: investor.id },
        status: "Sent",
        distribution: { paidOn: { gte: monthStart } },
      },
      select: { amount: true },
    }),
    prisma.investorNotificationPreference.findMany({
      where: { investorId: investor.id },
      select: { event: true, email: true, inApp: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const mtd = computeMtdCounters(mtdActivities);
  // Override the dollar figure with the authoritative allocation total.
  mtd.distributionsAmount = mtdAllocs.reduce((s, a) => s + num(a.amount), 0);

  const rows = activities.map((a) => {
    let link: string | null = null;
    if (a.relatedDocumentId) link = `/documents?doc=${a.relatedDocumentId}`;
    else if (a.relatedUpdateId) link = `/updates?id=${a.relatedUpdateId}`;
    else if (a.eventType === "Distribution") {
      // Finance Hub lands in Phase 4 — for now route the investor to their
      // My-investments page (anchored at the related subscription if we
      // happen to know the offering, otherwise just the list).
      link = a.relatedSubscriptionId
        ? `/investments#sub-${a.relatedSubscriptionId}`
        : `/investments`;
    }
    return {
      id: a.id,
      eventType: a.eventType,
      title: a.title,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
      readAt: a.readAt ? a.readAt.toISOString() : null,
      link,
    };
  });

  return (
    <PortalPage
      title="Activity feed"
      subtitle="Distributions, documents, and deal updates"
    >
      {rows.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No activity yet</div>
          As distributions are paid, documents uploaded, and updates posted,
          they&apos;ll stream into your activity feed.
        </div>
      ) : (
        <>
          <ActivityClient activities={rows} initialPrefs={prefs} mtd={mtd} />
          {totalPages > 1 ? (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-secondary)" }}>
              <span>
                Showing {skip + 1}–{Math.min(skip + rows.length, totalCount)} of {totalCount}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                {pageNum > 1 ? (
                  <a href={`/activity?page=${pageNum - 1}`} className="btn btn-sm">← Newer</a>
                ) : null}
                <span style={{ alignSelf: "center" }}>Page {pageNum} of {totalPages}</span>
                {pageNum < totalPages ? (
                  <a href={`/activity?page=${pageNum + 1}`} className="btn btn-sm">Older →</a>
                ) : null}
              </span>
            </div>
          ) : null}
        </>
      )}
    </PortalPage>
  );
}
