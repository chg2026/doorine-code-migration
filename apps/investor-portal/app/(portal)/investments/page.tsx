import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function InvestmentsPage() {
  return (
    <PortalPage title="My investments" subtitle="All deals you have committed to">
      <div className="placeholder-card">
        <div className="placeholder-title">Investments list</div>
        Coming in Phase 3 — your subscriptions, current values, IRR, and
        cash-on-cash will render here.
      </div>
    </PortalPage>
  );
}
