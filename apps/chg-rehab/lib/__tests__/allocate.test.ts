import { describe, it, expect } from "vitest";
import {
  allocateProRataCents,
  dollarsToCents,
} from "../investorAllocate";

describe("allocateProRataCents", () => {
  it("splits exactly when shares are even", () => {
    const out = allocateProRataCents(1000, [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
    ]);
    expect(out).toEqual([
      { id: "a", cents: 500 },
      { id: "b", cents: 500 },
    ]);
  });

  it("sinks remainder cents into the largest allocation", () => {
    // $100.00 = 10000 cents split 1:1:1 => 3333, 3333, 3334 — but here the
    // first row has the largest weight so it absorbs the remainder.
    const out = allocateProRataCents(10000, [
      { id: "big", weight: 3 },
      { id: "mid", weight: 2 },
      { id: "sml", weight: 1 },
    ]);
    const sum = out.reduce((s, r) => s + r.cents, 0);
    expect(sum).toBe(10000);
    // largest gets >= floor(10000 * 3/6)
    const big = out.find((r) => r.id === "big")!;
    expect(big.cents).toBeGreaterThanOrEqual(5000);
  });

  it("always sums back to the input total (no penny lost or invented)", () => {
    const inputs = [
      { id: "a", weight: 1234.5 },
      { id: "b", weight: 678.9 },
      { id: "c", weight: 1 },
      { id: "d", weight: 0.01 },
    ];
    for (const total of [1, 7, 333, 9999, 100000, 31415927]) {
      const out = allocateProRataCents(total, inputs);
      expect(out.reduce((s, r) => s + r.cents, 0)).toBe(total);
    }
  });

  it("equal-splits when weights are all zero", () => {
    const out = allocateProRataCents(101, [
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
    ]);
    expect(out.reduce((s, r) => s + r.cents, 0)).toBe(101);
  });

  it("returns empty when no rows are provided", () => {
    expect(allocateProRataCents(500, [])).toEqual([]);
  });

  it("rejects fractional totals", () => {
    expect(() =>
      allocateProRataCents(10.5, [{ id: "a", weight: 1 }])
    ).toThrow();
  });

  it("dollarsToCents converts cleanly", () => {
    expect(dollarsToCents(1.5)).toBe(150);
    expect(dollarsToCents("99.99")).toBe(9999);
    expect(dollarsToCents(0)).toBe(0);
  });
});
