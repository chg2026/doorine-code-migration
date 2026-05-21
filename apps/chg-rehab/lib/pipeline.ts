import { DealStage } from "@prisma/client";

export type DealMeta = {
  type?: string;
  beds?: number;
  source?: string;
  arv?: number;
  rehab?: number;
  offer?: number;
  purchase?: number;
  daysInStage?: number;
  closingDate?: string;
  badge?: string;
  badgeColor?: "green" | "blue" | "amber";
  askingOrPurchase?: { kind: "asking" | "offer" | "purchase"; value: number } | null;
  notes?: string;
};

export const STAGE_COLUMNS: { key: string; stages: DealStage[]; title: string; subtitle: string; chipColor: string }[] = [
  { key: "uw",  stages: [DealStage.Sourced, DealStage.Underwriting], title: "Lead / Underwriting", subtitle: "Numbers being run",          chipColor: "#EEEDFE|#3C3489" },
  { key: "off", stages: [DealStage.OfferOut],                         title: "Offer Submitted",     subtitle: "Awaiting seller response",   chipColor: "#FAEEDA|#633806" },
  { key: "uc",  stages: [DealStage.UnderContract],                    title: "Under Contract",      subtitle: "Due diligence in progress", chipColor: "#E8EFF1|#143641" },
  { key: "cl",  stages: [DealStage.Closed],                           title: "Closed / Acquired",   subtitle: "Property owned",            chipColor: "#EAF3DE|#27500A" },
];

export function stageColumnFor(stage: DealStage): number {
  return STAGE_COLUMNS.findIndex((c) => c.stages.includes(stage));
}

export function stageLabel(stage: DealStage): string {
  switch (stage) {
    case DealStage.Sourced:       return "Lead / UW";
    case DealStage.Underwriting:  return "Lead / UW";
    case DealStage.OfferOut:      return "Offer sent";
    case DealStage.UnderContract: return "Under contract";
    case DealStage.Closed:        return "✓ Closed";
    case DealStage.Lost:          return "Lost";
  }
}

export function stageBadgeColor(stage: DealStage): { bg: string; fg: string } {
  switch (stage) {
    case DealStage.Sourced:
    case DealStage.Underwriting:  return { bg: "#EEEDFE", fg: "#3C3489" };
    case DealStage.OfferOut:      return { bg: "#FAEEDA", fg: "#633806" };
    case DealStage.UnderContract: return { bg: "#E8EFF1", fg: "#143641" };
    case DealStage.Closed:        return { bg: "#EAF3DE", fg: "#27500A" };
    case DealStage.Lost:          return { bg: "#FCEBEB", fg: "#791F1F" };
  }
}

/** MAO formula: ARV × 0.70 − rehab. Returns null if inputs missing. */
export function computeMao(arv?: number | null, rehab?: number | null): number | null {
  if (arv == null || rehab == null) return null;
  return Math.round(arv * 0.7 - rehab);
}

export function formatMoney(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (opts.compact) {
    if (Math.abs(n) >= 1000) {
      const v = n / 1000;
      return "$" + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + "K";
    }
    return "$" + n.toLocaleString("en-US");
  }
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Project ID prefix is configurable; we follow the prototype convention CHG-####. */
export function nextProjectCode(addressOrIndex: string | number): string {
  // Use a stable suffix derived from the address (numeric chars) when possible,
  // else fall back to a 4-digit random suffix.
  if (typeof addressOrIndex === "number") {
    return `CHG-${addressOrIndex}`;
  }
  const digits = (addressOrIndex.match(/\d+/g) || [])[0];
  if (digits && digits.length >= 3) return `CHG-${digits.slice(0, 4)}`;
  return `CHG-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

/** Property code follows PROP-#### unless a project-specific deal already maps. */
export function nextPropertyCode(addressOrIndex: string | number): string {
  if (typeof addressOrIndex === "number") return `PROP-${addressOrIndex}`;
  const digits = (addressOrIndex.match(/\d+/g) || [])[0];
  if (digits && digits.length >= 3) return `PROP-${digits.slice(0, 4)}`;
  return `PROP-${String(Math.floor(1000 + Math.random() * 9000))}`;
}
