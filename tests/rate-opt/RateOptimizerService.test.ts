/**
 * F3.6.1 — RateOptimizerService unit tests.
 */
import { describe, it, expect } from "vitest";
import { evaluate } from "../../server/services/RateOptimizerService";

const baseRates = new Map([
  [1, { roleName: "Partner", currentRate: 500 }],
  [2, { roleName: "Senior Manager", currentRate: 300 }],
  [3, { roleName: "Senior Associate", currentRate: 175 }],
]);

describe("RateOptimizer evaluate — utilization signal", () => {
  it("≥95% utilization → +8% uplift", () => {
    const r = evaluate({
      utilization: 0.97,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.recommendation["1"].deltaPct).toBe(8);
    expect(r.recommendation["1"].recommendedRate).toBe(540); // 500 * 1.08
  });

  it("85–95% → +4%", () => {
    const r = evaluate({
      utilization: 0.88,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.recommendation["2"].deltaPct).toBe(4);
  });

  it("<60% → −3% downtick", () => {
    const r = evaluate({
      utilization: 0.5,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.recommendation["1"].deltaPct).toBe(-3);
  });
});

describe("RateOptimizer evaluate — velocity + margin signals", () => {
  it("≥20 approved deals → +2pt extra", () => {
    const r = evaluate({
      utilization: 0.7, // no util signal
      recentApprovedCount: 25,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.recommendation["1"].deltaPct).toBe(2);
  });

  it("≤3 approved deals → −1pt", () => {
    const r = evaluate({
      utilization: 0.7,
      recentApprovedCount: 2,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.recommendation["1"].deltaPct).toBe(-1);
  });

  it("margin gap >5pt → uplift to recover", () => {
    const r = evaluate({
      utilization: 0.7,
      recentApprovedCount: 10,
      observedMargin: 0.30,
      targetMargin: 0.40,        // 10pt gap
      rates: baseRates,
    });
    expect(r.recommendation["1"].deltaPct).toBeGreaterThan(0);
  });
});

describe("RateOptimizer evaluate — caps + driver text", () => {
  it("uplift caps at +15%", () => {
    const r = evaluate({
      utilization: 0.99,
      recentApprovedCount: 100,
      observedMargin: 0.10,
      targetMargin: 0.50,
      rates: baseRates,
    });
    for (const rec of Object.values(r.recommendation)) {
      expect(rec.deltaPct).toBeLessThanOrEqual(15);
    }
  });

  it("downtick caps at −10%", () => {
    const r = evaluate({
      utilization: 0.3,
      recentApprovedCount: 0,
      observedMargin: 0.6,        // way above target
      targetMargin: 0.4,
      rates: baseRates,
    });
    for (const rec of Object.values(r.recommendation)) {
      expect(rec.deltaPct).toBeGreaterThanOrEqual(-10);
    }
  });

  it("rationale mentions direction (increase/decrease/hold)", () => {
    const up = evaluate({
      utilization: 0.95,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(up.rationale.toLowerCase()).toContain("increase");

    const down = evaluate({
      utilization: 0.4,
      recentApprovedCount: 0,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(down.rationale.toLowerCase()).toContain("decrease");

    const flat = evaluate({
      utilization: 0.7,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(flat.rationale.toLowerCase()).toContain("hold");
  });

  it("confidence bounded [0, 0.85]", () => {
    const r = evaluate({
      utilization: 0.97,
      recentApprovedCount: 25,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: baseRates,
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(0.85);
  });

  it("empty rates produces empty recommendation but valid output", () => {
    const r = evaluate({
      utilization: 0.95,
      recentApprovedCount: 10,
      observedMargin: 0.4,
      targetMargin: 0.4,
      rates: new Map(),
    });
    expect(r.recommendation).toEqual({});
    expect(typeof r.confidence).toBe("number");
    expect(typeof r.rationale).toBe("string");
  });
});
