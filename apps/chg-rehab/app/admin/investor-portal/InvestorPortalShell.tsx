"use client";

import InvestorsTab from "./InvestorsTab";
import DealsTab from "./DealsTab";
import FundraisingTab from "./FundraisingTab";
import FinanceTab from "./FinanceTab";
import type {
  CapitalCallRow,
  DistributionRow,
  InvestorRow,
  OfferingRow,
} from "./types";

export default function InvestorPortalShell({
  tab,
  investors,
  offerings,
  distributions,
  capitalCalls,
}: {
  tab: "investors" | "deals" | "fundraising" | "finance";
  investors: InvestorRow[];
  offerings: OfferingRow[];
  distributions: DistributionRow[];
  capitalCalls: CapitalCallRow[];
}) {
  return (
    <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
      {tab === "investors" && <InvestorsTab initialInvestors={investors} />}
      {tab === "deals" && <DealsTab initialOfferings={offerings} />}
      {tab === "fundraising" && (
        <FundraisingTab initialOfferings={offerings} investors={investors} />
      )}
      {tab === "finance" && (
        <FinanceTab
          initialOfferings={offerings}
          initialDistributions={distributions}
          initialCapitalCalls={capitalCalls}
        />
      )}
    </div>
  );
}
