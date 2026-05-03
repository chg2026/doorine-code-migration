import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const investor = await getCurrentInvestor();
  const name = investor?.firstName || investor?.email || "investor";
  return (
    <PortalPage title="Dashboard" subtitle="Portfolio summary">
      <div className="placeholder-card">
        <div className="placeholder-title">Welcome, {name}.</div>
        Your portfolio data will appear here once Phase 3 lights up the
        Dashboard widgets. For now this is just the shell.
      </div>
    </PortalPage>
  );
}
