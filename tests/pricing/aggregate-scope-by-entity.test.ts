/**
 * F1.1 — pure unit tests for aggregateScopeByEntity().
 *
 * The function is the math-bedrock for entity-aware pricing: per-entity hours
 * rollup that, summed, must equal the legacy flat-reduce total. If this drifts,
 * recalcPricingFromScope's deal-level total drifts with it and calc-parity
 * fails. These tests pin the behavior in isolation, no DB required.
 */

import { describe, it, expect } from "vitest";
import { aggregateScopeByEntity } from "../../server/services/pricing";

const billable = (overrides: any = {}) => ({
  scopeItem: { isAssembly: false, ...overrides.scopeItem },
  ...overrides,
});

describe("aggregateScopeByEntity", () => {
  it("empty input → empty array", () => {
    expect(aggregateScopeByEntity([], 1)).toEqual([]);
  });

  it("filters out assemblies (groupings, not billable)", () => {
    const items = [
      billable({ entityId: 1, adjustedHours: "10", quantity: 1, scopeItem: { isAssembly: true } }),
      billable({ entityId: 1, adjustedHours: "20", quantity: 1 }),
    ];
    const result = aggregateScopeByEntity(items, 1);
    expect(result).toEqual([{ entityId: 1, totalHours: 20 }]);
  });

  it("groups by entityId, sums per-item rounded hours", () => {
    const items = [
      billable({ entityId: 1, adjustedHours: "10", quantity: 2 }),  // 20
      billable({ entityId: 1, adjustedHours: "5", quantity: 3 }),   // 15
      billable({ entityId: 2, adjustedHours: "40", quantity: 1 }),  // 40
    ];
    const result = aggregateScopeByEntity(items, 1);
    expect(result).toEqual([
      { entityId: 1, totalHours: 35 },
      { entityId: 2, totalHours: 40 },
    ]);
  });

  it("applies the multiplier per item before rounding (matches legacy reduce)", () => {
    // Legacy code: Σ Math.round(baseHrs × qty × multiplier)
    // Per-entity rollup must produce the same per-item rounding so
    // ΣΣ entity totals == legacy flat total.
    const items = [
      billable({ entityId: 1, adjustedHours: "10", quantity: 1 }),  // round(10 × 1 × 1.5) = 15
      billable({ entityId: 1, adjustedHours: "7", quantity: 1 }),   // round(7 × 1 × 1.5) = 11 (not 10.5)
      billable({ entityId: 2, adjustedHours: "10", quantity: 1 }),  // round(10 × 1 × 1.5) = 15
    ];
    const result = aggregateScopeByEntity(items, 1.5);
    expect(result).toEqual([
      { entityId: 1, totalHours: 26 },  // 15 + 11
      { entityId: 2, totalHours: 15 },
    ]);
  });

  it("falls back to scopeItem.defaultHours when adjustedHours is missing", () => {
    const items = [
      billable({ entityId: 1, quantity: 2, scopeItem: { isAssembly: false, defaultHours: "8" } }),  // 16
    ];
    expect(aggregateScopeByEntity(items, 1)).toEqual([{ entityId: 1, totalHours: 16 }]);
  });

  it("falls back to 40 hours per item when both adjustedHours and defaultHours are missing", () => {
    const items = [billable({ entityId: 1, quantity: 1 })];
    expect(aggregateScopeByEntity(items, 1)).toEqual([{ entityId: 1, totalHours: 40 }]);
  });

  it("treats quantity ?? not || — explicit zero stays zero", () => {
    // Tax parametric lines can resolve to qty=0 (e.g., 0 international
    // returns). They must NOT silently bill as 1 × baseHrs.
    const items = [
      billable({ entityId: 1, adjustedHours: "100", quantity: 0 }),  // 0
      billable({ entityId: 1, adjustedHours: "10", quantity: 1 }),   // 10
    ];
    expect(aggregateScopeByEntity(items, 1)).toEqual([{ entityId: 1, totalHours: 10 }]);
  });

  it("collects scope rows with null entity_id into the null bucket (sorted last)", () => {
    const items = [
      billable({ entityId: 1, adjustedHours: "10", quantity: 1 }),
      billable({ entityId: null, adjustedHours: "20", quantity: 1 }),
      billable({ entityId: 2, adjustedHours: "30", quantity: 1 }),
    ];
    const result = aggregateScopeByEntity(items, 1);
    expect(result).toEqual([
      { entityId: 1, totalHours: 10 },
      { entityId: 2, totalHours: 30 },
      { entityId: null, totalHours: 20 },
    ]);
  });

  it("sum across entities equals the legacy flat reduce (calc-parity invariant)", () => {
    // The whole point: ΣΣ rollup === Σ legacy. If this property breaks,
    // recalcPricingFromScope's deal totalHours changes and the calc-parity
    // golden test will fail.
    const items = [
      billable({ entityId: 1, adjustedHours: "13", quantity: 7 }),   // round(91 × 1.23) = 112
      billable({ entityId: 2, adjustedHours: "17.5", quantity: 4 }), // round(70 × 1.23) = 86
      billable({ entityId: null, adjustedHours: "9", quantity: 11 }),// round(99 × 1.23) = 122
    ];
    const multiplier = 1.23;

    const rollupSum = aggregateScopeByEntity(items, multiplier)
      .reduce((s, r) => s + r.totalHours, 0);

    const legacy = items
      .filter(i => !i.scopeItem.isAssembly)
      .reduce((s, i) => {
        const baseHrs = parseFloat(i.adjustedHours);
        const qty = i.quantity;
        return s + Math.round(baseHrs * qty * multiplier);
      }, 0);

    expect(rollupSum).toBe(legacy);
  });
});
