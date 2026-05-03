import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function DocumentsPage() {
  return (
    <PortalPage title="Documents" subtitle="PPMs, agreements, statements, K-1s">
      <div className="placeholder-card">
        <div className="placeholder-title">Document vault</div>
        Coming in Phase 3 — your secure document library lives here.
      </div>
    </PortalPage>
  );
}
