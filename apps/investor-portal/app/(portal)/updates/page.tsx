import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { fmtDate, getInvestorDealUpdates } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const UPDATE_TYPE_LABEL: Record<string, string> = {
  Quarterly: "Quarterly",
  Annual: "Annual",
  Distribution: "Distribution",
  Operations: "Operations",
  Other: "Update",
};

const UPDATE_PILL: Record<string, string> = {
  Quarterly: "pill-b",
  Annual: "pill-p",
  Distribution: "pill-g",
  Operations: "pill-a",
  Other: "pill-gray",
};

export default async function UpdatesPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const updates = await getInvestorDealUpdates(investor.id);

  return (
    <PortalPage
      title="Reports & updates"
      subtitle="Operator updates from the deals you're invested in"
    >
      {updates.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No updates yet</div>
          When the operator publishes a quarterly letter or property update for
          one of your deals, it will appear here.
        </div>
      ) : (
        updates.map((u) => (
          <div key={u.id} className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">{u.title}</div>
                <div className="card-sub">
                  {u.offering.name} · posted {fmtDate(u.postedAt)}
                </div>
              </div>
              <span className={`pill ${UPDATE_PILL[u.updateType] || "pill-gray"}`}>
                {UPDATE_TYPE_LABEL[u.updateType] || u.updateType}
              </span>
            </div>
            {u.body ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {u.body}
              </div>
            ) : null}
          </div>
        ))
      )}
    </PortalPage>
  );
}
