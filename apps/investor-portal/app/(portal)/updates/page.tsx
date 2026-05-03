import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function UpdatesPage() {
  return (
    <PortalPage title="Reports & updates" subtitle="Quarterly letters and deal-specific updates">
      <div className="placeholder-card">
        <div className="placeholder-title">Operator updates</div>
        Coming in Phase 3.
      </div>
    </PortalPage>
  );
}
