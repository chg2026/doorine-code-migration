import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  return (
    <PortalPage title="Activity feed" subtitle="Distributions, documents, and deal updates">
      <div className="placeholder-card">
        <div className="placeholder-title">Activity timeline</div>
        Coming in Phase 3.
      </div>
    </PortalPage>
  );
}
