/**
 * F2.4.2 — applyFeeArrangement unit tests.
 *
 * Pin the transform table for every supported arrangement against
 * a fixed baseTotals fixture so future schema changes don't drift
 * the projections silently.
 */
import { describe, it, expect } from "vitest";
import {
  applyFeeArrangement,
  ALL_FEE_ARRANGEMENTS,
  isFeeArrangement,
} from "../../server/services/feeArrangements";
import type { DealTotals } from "../../server/services/pricing";

const BASE: DealTotals = {
  lineSubtotalFee: 100_000,
  totalCost: 60_000,
  totalHours: 500,
  rateAdjustmentPct: 0,
  lineItemRounding: 0,
  roundedSubtotal: 100_000,
  roundingAdjustment: 0,
  techAdminFeePct: 0,
  techAdminFee: 0,
  totalFee: 100_000,
  marginPercent: 40,
  blendedRate: 200,
};

describe("isFeeArrangement", () => {
  it("accepts canonical values", () => {
    for (const a of ALL_FEE_ARRANGEMENTS) expect(isFeeArrangement(a)).toBe(true);
  });
  it("rejects unknown / non-strings", () => {
    expect(isFeeArrangement("flat")).toBe(false);
    expect(isFeeArrangement(null)).toBe(false);
    expect(isFeeArrangement(42)).toBe(false);
    expect(isFeeArrangement(undefined)).toBe(false);
  });
});

describe("applyFeeArrangement — time_and_materials (default)", () => {
  it("returns baseTotals unchanged when arrangement is missing", () => {
    const r = applyFeeArrangement(BASE, null);
    expect(r.arrangement).toBe("time_and_materials");
    expect(r.adjustedTotals).toBe(BASE);
    expect(r.meta).toEqual({});
  });
  it("returns baseTotals unchanged when arrangement is t&m", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "time_and_materials" });
    expect(r.adjustedTotals.totalFee).toBe(100_000);
    expect(r.adjustedTotals.marginPercent).toBe(40);
  });
  it("falls back to t&m when arrangement is unknown", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "garbage" });
    expect(r.arrangement).toBe("time_and_materials");
  });
});

describe("applyFeeArrangement — fixed", () => {
  it("totalFee = fixedFeeAmount; margin recomputed", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "fixed", fixedFeeAmount: "80000" });
    expect(r.adjustedTotals.totalFee).toBe(80_000);
    // margin = (80k - 60k) / 80k * 100 = 25
    expect(r.adjustedTotals.marginPercent).toBeCloseTo(25, 2);
    // blended = 80k / 500 = 160
    expect(r.adjustedTotals.blendedRate).toBeCloseTo(160, 2);
    expect(r.meta.fixedFeeAmount).toBe(80_000);
    // baseTotals untouched
    expect(r.baseTotals.totalFee).toBe(100_000);
  });

  it("fixed = 0 produces zero margin / blended (no divide by zero)", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "fixed", fixedFeeAmount: "0" });
    expect(r.adjustedTotals.totalFee).toBe(0);
    expect(r.adjustedTotals.marginPercent).toBe(0);
    expect(r.adjustedTotals.blendedRate).toBe(0);
  });

  it("fixed > base T&M can produce >baseline margin", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "fixed", fixedFeeAmount: "150000" });
    expect(r.adjustedTotals.totalFee).toBe(150_000);
    // margin = (150k - 60k)/150k = 60%
    expect(r.adjustedTotals.marginPercent).toBeCloseTo(60, 2);
  });
});

describe("applyFeeArrangement — capped", () => {
  it("clips when T&M exceeds cap", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "capped", cappedFeeAmount: "75000" });
    expect(r.adjustedTotals.totalFee).toBe(75_000);
    expect(r.meta.capApplied).toBe(true);
    expect(r.meta.capSlack).toBe(0);
    // margin = (75k - 60k)/75k = 20
    expect(r.adjustedTotals.marginPercent).toBeCloseTo(20, 2);
  });

  it("preserves T&M when cap is above projection", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "capped", cappedFeeAmount: "150000" });
    expect(r.adjustedTotals.totalFee).toBe(100_000);
    expect(r.meta.capApplied).toBe(false);
    expect(r.meta.capSlack).toBe(50_000);
  });

  it("cap = 0 is treated as 'no cap'", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "capped", cappedFeeAmount: "0" });
    expect(r.adjustedTotals.totalFee).toBe(100_000);
    expect(r.meta.capApplied).toBe(false);
  });
});

describe("applyFeeArrangement — contingent", () => {
  it("preserves base T&M as labor projection + surfaces percent + base", () => {
    const r = applyFeeArrangement(BASE, {
      feeArrangement: "contingent",
      contingentFeePercent: "33.33",
      contingentFeeBase: "savings_realized",
    });
    expect(r.adjustedTotals.totalFee).toBe(100_000);
    expect(r.meta.contingentFeePercent).toBeCloseTo(33.33);
    expect(r.meta.contingentFeeBase).toBe("savings_realized");
  });

  it("tolerates missing percent + base", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "contingent" });
    expect(r.meta.contingentFeePercent).toBe(0);
    expect(r.meta.contingentFeeBase).toBeNull();
  });
});

describe("applyFeeArrangement — retainer", () => {
  it("totalFee = retainerAmount; labor projection preserved on baseTotals", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "retainer", retainerAmount: "12000" });
    expect(r.adjustedTotals.totalFee).toBe(12_000);
    expect(r.baseTotals.totalFee).toBe(100_000);
    expect(r.meta.retainerAmount).toBe(12_000);
  });
});

describe("applyFeeArrangement — hybrid", () => {
  it("totalFee = T&M + (T&M × successFee%)", () => {
    const r = applyFeeArrangement(BASE, {
      feeArrangement: "hybrid",
      successFeePercent: "5",
    });
    // 100k + 5% = 105k
    expect(r.adjustedTotals.totalFee).toBe(105_000);
    expect(r.meta.successFeeAmount).toBe(5_000);
    expect(r.meta.successFeePercent).toBe(5);
    // margin = (105k - 60k)/105k ≈ 42.86
    expect(r.adjustedTotals.marginPercent).toBeCloseTo(42.86, 1);
  });

  it("successFeePercent = 0 leaves T&M total unchanged", () => {
    const r = applyFeeArrangement(BASE, { feeArrangement: "hybrid", successFeePercent: "0" });
    expect(r.adjustedTotals.totalFee).toBe(100_000);
    expect(r.meta.successFeeAmount).toBe(0);
  });
});

describe("applyFeeArrangement — invariants", () => {
  it("totalCost is preserved across every arrangement", () => {
    for (const a of ALL_FEE_ARRANGEMENTS) {
      const r = applyFeeArrangement(BASE, {
        feeArrangement: a,
        fixedFeeAmount: "50000",
        cappedFeeAmount: "75000",
        retainerAmount: "12000",
        successFeePercent: "5",
        contingentFeePercent: "20",
        contingentFeeBase: "savings_realized",
      });
      expect(r.adjustedTotals.totalCost).toBe(BASE.totalCost);
    }
  });

  it("totalHours is preserved across every arrangement", () => {
    for (const a of ALL_FEE_ARRANGEMENTS) {
      const r = applyFeeArrangement(BASE, {
        feeArrangement: a,
        fixedFeeAmount: "50000",
        cappedFeeAmount: "75000",
        retainerAmount: "12000",
        successFeePercent: "5",
      });
      expect(r.adjustedTotals.totalHours).toBe(BASE.totalHours);
    }
  });

  it("baseTotals object identity is preserved (not mutated)", () => {
    const before = { ...BASE };
    applyFeeArrangement(BASE, { feeArrangement: "fixed", fixedFeeAmount: "50000" });
    expect(BASE).toEqual(before);
  });
});
