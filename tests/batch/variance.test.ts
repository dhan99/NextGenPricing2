/**
 * F1.3 — BatchRenewalService pure-function tests.
 *
 * Pins the variance math + adjustment-rule semantics. The orchestrator
 * (createBatchRenewalJob, runBatchRenewalJob) gets integration coverage
 * in slice 3's route tests; this file is unit-test territory.
 */

import { describe, it, expect } from "vitest";
import {
  computeVariance,
  exceedsThreshold,
  applyAdjustmentRule,
  composeEffects,
  type AdjustmentRule,
} from "../../server/services/BatchRenewalService";

describe("computeVariance", () => {
  it("flat-out zero variance for identical totals", () => {
    const v = computeVariance(
      { totalFee: 100, totalCost: 50, totalHours: 10 },
      { totalFee: 100, totalCost: 50, totalHours: 10 },
    );
    expect(v.feePct).toBe(0);
    expect(v.costPct).toBe(0);
    expect(v.hoursPct).toBe(0);
    expect(v.worstPct).toBe(0);
  });

  it("computes positive percentages for increases", () => {
    const v = computeVariance(
      { totalFee: 100, totalCost: 50, totalHours: 10 },
      { totalFee: 110, totalCost: 55, totalHours: 11 },
    );
    expect(v.feePct).toBeCloseTo(10, 5);
    expect(v.costPct).toBeCloseTo(10, 5);
    expect(v.hoursPct).toBeCloseTo(10, 5);
    expect(v.worstPct).toBeCloseTo(10, 5);
  });

  it("computes negative percentages for decreases", () => {
    const v = computeVariance(
      { totalFee: 100, totalCost: 50, totalHours: 10 },
      { totalFee: 80, totalCost: 40, totalHours: 8 },
    );
    expect(v.feePct).toBeCloseTo(-20, 5);
    expect(v.worstPct).toBeCloseTo(-20, 5);
  });

  it("worstPct is the absolute-largest signed percentage", () => {
    const v = computeVariance(
      { totalFee: 100, totalCost: 100, totalHours: 100 },
      { totalFee: 105, totalCost: 60, totalHours: 102 },
    );
    expect(v.feePct).toBeCloseTo(5, 5);
    expect(v.costPct).toBeCloseTo(-40, 5);
    expect(v.hoursPct).toBeCloseTo(2, 5);
    // -40 has the largest absolute value, sign preserved
    expect(v.worstPct).toBeCloseTo(-40, 5);
  });

  it("returns 0% when source totals are zero (no division by zero)", () => {
    const v = computeVariance(
      { totalFee: 0, totalCost: 0, totalHours: 0 },
      { totalFee: 1000, totalCost: 500, totalHours: 100 },
    );
    expect(v.feePct).toBe(0);
    expect(v.costPct).toBe(0);
    expect(v.hoursPct).toBe(0);
    expect(v.worstPct).toBe(0);
  });

  it("includes a human-readable reason summary", () => {
    const v = computeVariance(
      { totalFee: 100, totalCost: 50, totalHours: 10 },
      { totalFee: 110, totalCost: 55, totalHours: 11 },
    );
    expect(v.reason).toMatch(/fee Δ 10\.0%/);
    expect(v.reason).toMatch(/100 → 110/);
  });
});

describe("exceedsThreshold", () => {
  const v = (worst: number) => ({ worstPct: worst, feePct: worst, costPct: 0, hoursPct: 0, reason: "" });

  it("flags when |worstPct| >= threshold", () => {
    expect(exceedsThreshold(v(15), 10)).toBe(true);
    expect(exceedsThreshold(v(-15), 10)).toBe(true);
    expect(exceedsThreshold(v(10), 10)).toBe(true); // boundary: >= flags
  });

  it("does not flag below threshold", () => {
    expect(exceedsThreshold(v(9.99), 10)).toBe(false);
    expect(exceedsThreshold(v(0), 10)).toBe(false);
    expect(exceedsThreshold(v(-9.99), 10)).toBe(false);
  });
});

describe("applyAdjustmentRule", () => {
  const rule = (ruleType: any, parameters: any, isActive = true): AdjustmentRule => ({
    id: 1, name: "test", ruleType, parameters, isActive,
  });

  it("rate_uplift sets ratesMultiplier", () => {
    const e = applyAdjustmentRule(rule("rate_uplift", { factor: 1.05 }));
    expect(e.ratesMultiplier).toBe(1.05);
    expect(e.hoursMultiplier).toBeUndefined();
  });

  it("hour_adjustment sets hoursMultiplier", () => {
    const e = applyAdjustmentRule(rule("hour_adjustment", { factor: 0.95 }));
    expect(e.hoursMultiplier).toBe(0.95);
    expect(e.ratesMultiplier).toBeUndefined();
  });

  it("margin_target_override sets targetMarginPercent", () => {
    const e = applyAdjustmentRule(rule("margin_target_override", { percent: 38 }));
    expect(e.targetMarginPercent).toBe(38);
  });

  it("tech_admin_fee_override patches engagement_inputs", () => {
    const e = applyAdjustmentRule(rule("tech_admin_fee_override", { percent: 7 }));
    expect(e.engagementInputsPatch).toEqual({ techAdminFeePct: "7" });
  });

  it("inactive rule resolves to a no-op effect", () => {
    const e = applyAdjustmentRule(rule("rate_uplift", { factor: 1.5 }, false));
    expect(e.ratesMultiplier).toBeUndefined();
    expect(e.description).toMatch(/inactive/i);
  });

  it("unknown rule type is treated as no-op (doesn't throw)", () => {
    const e = applyAdjustmentRule(rule("not_a_real_rule" as any, {}));
    expect(e.description).toMatch(/unknown rule type/i);
  });

  it("malformed parameters fall back to safe defaults", () => {
    // factor missing → fallback 1.0 (no-op)
    const e = applyAdjustmentRule(rule("rate_uplift", {}));
    expect(e.ratesMultiplier).toBe(1.0);
    // garbage string factor → fallback 1.0
    const e2 = applyAdjustmentRule(rule("rate_uplift", { factor: "not-a-number" }));
    expect(e2.ratesMultiplier).toBe(1.0);
  });
});

describe("composeEffects", () => {
  it("composes empty array into an explicit no-op", () => {
    const e = composeEffects([]);
    expect(e.ratesMultiplier).toBeUndefined();
    expect(e.hoursMultiplier).toBeUndefined();
    expect(e.description).toBe("no-op");
  });

  it("multipliers compound", () => {
    const e = composeEffects([
      { ratesMultiplier: 1.05, description: "+5% rates" },
      { ratesMultiplier: 1.10, description: "+10% rates again" },
      { hoursMultiplier: 0.90, description: "-10% hours" },
    ]);
    expect(e.ratesMultiplier).toBeCloseTo(1.155, 5);
    expect(e.hoursMultiplier).toBe(0.90);
  });

  it("trailing rule wins for deal-level overrides", () => {
    const e = composeEffects([
      { targetMarginPercent: 35, description: "first" },
      { targetMarginPercent: 40, description: "second" },
    ]);
    expect(e.targetMarginPercent).toBe(40);
  });

  it("engagement-inputs patches merge later-wins", () => {
    const e = composeEffects([
      { engagementInputsPatch: { techAdminFeePct: "5", lineItemRounding: "0" }, description: "a" },
      { engagementInputsPatch: { techAdminFeePct: "7" }, description: "b" },
    ]);
    expect(e.engagementInputsPatch).toEqual({
      techAdminFeePct: "7",
      lineItemRounding: "0",
    });
  });

  it("multipliers of exactly 1 collapse to undefined (no-op)", () => {
    const e = composeEffects([
      { ratesMultiplier: 1.0, description: "no-op" },
    ]);
    expect(e.ratesMultiplier).toBeUndefined();
  });

  it("description joins per-rule descriptions", () => {
    const e = composeEffects([
      { ratesMultiplier: 1.05, description: "rate uplift × 1.05" },
      { hoursMultiplier: 0.95, description: "hours × 0.95" },
    ]);
    expect(e.description).toBe("rate uplift × 1.05; hours × 0.95");
  });
});

describe("real-world: rate-uplift + hour-adjustment compose", () => {
  it("a 5% uplift + 5% hour cut applied to a 100h $10k deal", () => {
    const rules: AdjustmentRule[] = [
      { id: 1, name: "annual uplift", ruleType: "rate_uplift", parameters: { factor: 1.05 } },
      { id: 2, name: "efficiency", ruleType: "hour_adjustment", parameters: { factor: 0.95 } },
    ];
    const composed = composeEffects(rules.map(applyAdjustmentRule));
    expect(composed.ratesMultiplier).toBe(1.05);
    expect(composed.hoursMultiplier).toBe(0.95);
    // Source: 100h at $100/h → fee $10,000.
    // After: 95h at $105/h → fee $9,975.
    const oldFee = 100 * 100;
    const newFee = (100 * 0.95) * (100 * 1.05);
    expect(newFee).toBeCloseTo(9975, 5);
    const variance = computeVariance(
      { totalFee: oldFee, totalCost: 0, totalHours: 100 },
      { totalFee: newFee, totalCost: 0, totalHours: 95 },
    );
    expect(variance.feePct).toBeCloseTo(-0.25, 2);
    // Hours dropped 5% → worst is hours
    expect(variance.worstPct).toBeCloseTo(-5, 5);
    expect(exceedsThreshold(variance, 10)).toBe(false);
    expect(exceedsThreshold(variance, 4)).toBe(true);
  });
});
