import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { getQuotaStatus, FREE_TIER_EXTERNAL_QUOTES } from "@/lib/quota";
import { getOperators, getInvitees } from "@/lib/scope";
import QuoteBuilderClient from "./QuoteBuilderClient";

export const dynamic = "force-dynamic";

export default async function QuoteBuilderPage() {
  const c = (await getCurrentContractor())!;
  const [quota, operators, invitees] = await Promise.all([
    getQuotaStatus(c.id),
    getOperators(c.id),
    getInvitees(c.id),
  ]);

  const recipients = [
    ...operators
      .filter((e) => e.layer1Company)
      .map((e) => ({ kind: "operator" as const, id: e.layer1Company!.id, name: e.layer1Company!.name, isExternal: false })),
    ...operators
      .filter((e) => e.inviter)
      .map((e) => ({ kind: "contractor" as const, id: e.inviter!.id, name: `${e.inviter!.companyName} (operator)`, isExternal: false })),
    ...invitees.map((e) => ({ kind: "contractor" as const, id: e.contractor.id, name: `${e.contractor.companyName} (sub)`, isExternal: false })),
  ];

  return (
    <PortalPage title="Quote builder" subtitle="Build a polished quote in minutes">
      <QuoteBuilderClient
        recipients={recipients}
        quotaUsed={quota.used}
        quotaMax={c.planTier === "free" ? FREE_TIER_EXTERNAL_QUOTES : null}
      />
    </PortalPage>
  );
}
