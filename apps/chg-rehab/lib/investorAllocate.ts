/**
 * Pro-rata allocation of an integer cents amount across weights, with
 * deterministic rounding. The largest-weight allocation absorbs the
 * leftover cents so the parts always sum exactly to `totalCents`.
 *
 * Used for both Distributions (split totalAmount across subscriptions
 * weighted by funded $) and Capital Calls (weighted by committed $).
 */
export type AllocationInput = { id: string; weight: number };
export type AllocationOutput = { id: string; cents: number };

export function allocateProRataCents(
  totalCents: number,
  rows: AllocationInput[]
): AllocationOutput[] {
  if (!Number.isFinite(totalCents)) {
    throw new Error("totalCents must be a finite number");
  }
  if (!Number.isInteger(totalCents)) {
    throw new Error("totalCents must be an integer (cents)");
  }
  if (totalCents < 0) throw new Error("totalCents must be >= 0");
  if (rows.length === 0) return [];

  const cleaned = rows.map((r) => ({
    id: r.id,
    weight: Number(r.weight) || 0,
  }));
  const totalWeight = cleaned.reduce((s, r) => s + r.weight, 0);

  if (totalWeight <= 0) {
    // Equal split fallback so we never silently send zero to everyone
    // when weights are missing.
    const equal = Math.floor(totalCents / cleaned.length);
    const rem = totalCents - equal * cleaned.length;
    return cleaned.map((r, i) => ({
      id: r.id,
      cents: equal + (i === 0 ? rem : 0),
    }));
  }

  let allocated = 0;
  let largestIdx = 0;
  let largestWeight = -Infinity;
  const out: AllocationOutput[] = cleaned.map((r, i) => {
    const exact = (totalCents * r.weight) / totalWeight;
    const cents = Math.floor(exact);
    allocated += cents;
    if (r.weight > largestWeight) {
      largestWeight = r.weight;
      largestIdx = i;
    }
    return { id: r.id, cents };
  });

  const remainder = totalCents - allocated;
  if (remainder !== 0) {
    out[largestIdx].cents += remainder;
  }
  return out;
}

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) throw new Error("amount must be a finite number");
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}
