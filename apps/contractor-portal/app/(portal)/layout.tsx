import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";
import { getQuotaStatus, FREE_TIER_EXTERNAL_QUOTES } from "@/lib/quota";
import PortalSidebar from "@/components/PortalSidebar";
import PortalTopBar from "@/components/PortalTopBar";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const c = await getCurrentContractor();
  if (!c) redirect("/login");

  const [invitees, quota] = await Promise.all([getInvitees(c.id), getQuotaStatus(c.id)]);

  const init = c.contactName.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || c.email[0].toUpperCase();
  // The operator lens (sidebar group + topbar pill) is meaningful only when
  // this account has at least one downstream invitee. Pure L3s and pure sole
  // accounts get the simpler single-scope shell.
  const showOperatorLens = invitees.length > 0;

  return (
    <div className="portal">
      <PortalSidebar
        initials={init}
        displayName={c.contactName}
        companyName={c.companyName}
        planTier={c.planTier}
        quotaUsed={quota.used}
        quotaMax={c.planTier === "free" ? FREE_TIER_EXTERNAL_QUOTES : null}
        showOperatorLens={showOperatorLens}
      />
      <div className="main">
        <PortalTopBar accountId={c.id} planTier={c.planTier} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
