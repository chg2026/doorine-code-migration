import Link from "next/link";
import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function MarketplacePage() {
  return (
    <PortalPage
      title="Marketplace"
      subtitle="Browse open offerings and submit soft commitments"
    >
      <div className="placeholder-card">
        <div className="placeholder-title">Marketplace coming in Phase 4</div>
        New deal browsing, soft &amp; hard commits, and e-signed subscriptions
        will live here. For now you can view your existing investments on the{" "}
        <Link href="/investments" style={{ color: "var(--blue)" }}>
          My investments
        </Link>{" "}
        page.
      </div>
    </PortalPage>
  );
}
