export type InvestorRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  accreditedStatus: string;
  status: string;
  portalLastLoginAt: string | null;
  committedTotal: number;
  fundedTotal: number;
  subscriptionCount: number;
};

export type OfferingRow = {
  id: string;
  name: string;
  propertyType: string;
  marketCity: string | null;
  marketState: string | null;
  description: string | null;
  targetIrrLow: number | null;
  targetIrrHigh: number | null;
  prefReturnPct: number | null;
  holdMonths: number | null;
  minInvestment: number | null;
  raiseTarget: number | null;
  raisedToHard: number | null;
  raisedToSoft: number | null;
  stage: string;
  status: string;
  closeDate: string | null;
  coverImageUrl: string | null;
  coverImageObjectPath: string | null;
  documentObjectPaths: string[];
  wireInstructions: {
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    beneficiary?: string;
    swift?: string;
    memo?: string;
  } | null;
  subscriptions: {
    id: string;
    investorId: string;
    investorName: string;
    investorEmail: string | null;
    committedAmount: number;
    fundedAmount: number;
    commitmentType: string;
    status: string;
    ownershipPct: number | null;
    lifetimeDistributions: number;
  }[];
};

export type DistributionRow = {
  id: string;
  offeringId: string;
  offeringName: string;
  periodLabel: string;
  distributionType: string;
  totalAmount: number;
  paidOn: string | null;
  status: string;
  allocations: {
    id: string;
    subscriptionId: string;
    investorName: string;
    amount: number;
    status: string;
  }[];
};

export type CapitalCallRow = {
  id: string;
  offeringId: string;
  offeringName: string;
  noticeNumber: string;
  totalAmount: number;
  dueDate: string | null;
  status: string;
  allocations: {
    id: string;
    subscriptionId: string;
    investorName: string;
    amountDue: number;
    amountReceived: number;
  }[];
};

export type InvestorPortalData = {
  investors: InvestorRow[];
  offerings: OfferingRow[];
  distributions: DistributionRow[];
  capitalCalls: CapitalCallRow[];
};

export const STAGE_OPTIONS = [
  "Prospecting",
  "Diligence",
  "Raise",
  "Closing",
  "Closed",
] as const;
