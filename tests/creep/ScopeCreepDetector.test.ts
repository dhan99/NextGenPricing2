/**
 * F3.3.1 — ScopeCreepDetector pure-function tests.
 */
import { describe, it, expect } from "vitest";
import {
  evaluate,
  DEFAULT_THRESHOLDS,
  type DetectorInput,
} from "../../server/services/ScopeCreepDetector";

const NOW = new Date("2026-05-02T00:00:00Z");

const baseInput: DetectorInput = {
  deal: {
    id: 1,
    status: "approved",
    submittedAt: null,
    targetMarginPercent: "40",
    marginPercent: "40",
    totalHours: "100",
    baselineHours: "100",
  },
  changeOrders: [],
  latestBudget: null,
  now: NOW,
};

describe("ScopeCreepDetector — scope_growth", () => {
  it("fires when totalHours grew >= threshold", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, totalHours: "140", baselineHours: "100" }, // +40%
    });
    const sig = r.find((s) => s.kind === "scope_growth");
    expect(sig).toBeTruthy();
    // 40% / 25% = 1.6x — over 1.5x threshold, under 2x → medium
    expect(sig!.severity).toBe("medium");
    expect(sig!.evidence.growthPct).toBe(40);
  });

  it("severity = high when growth ≥ 2× threshold", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, totalHours: "150", baselineHours: "100" }, // +50% = 2x of 25%
    });
    expect(r.find((s) => s.kind === "scope_growth")?.severity).toBe("high");
  });

  it("does not fire when below threshold", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, totalHours: "120", baselineHours: "100" }, // +20% < 25
    });
    expect(r.find((s) => s.kind === "scope_growth")).toBeUndefined();
  });

  it("does not fire when baseline=0 (no signal)", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, totalHours: "100", baselineHours: "0" },
    });
    expect(r.find((s) => s.kind === "scope_growth")).toBeUndefined();
  });
});

describe("ScopeCreepDetector — change_order_density", () => {
  it("fires when N change orders fall within the window", () => {
    const co = (daysAgo: number) => ({
      id: daysAgo,
      createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      status: "approved",
    });
    const r = evaluate({
      ...baseInput,
      changeOrders: [co(1), co(5), co(15)], // 3 in 30 days
    });
    expect(r.find((s) => s.kind === "change_order_density")).toBeTruthy();
  });

  it("does not fire when COs are outside the window", () => {
    const co = (daysAgo: number) => ({
      id: daysAgo,
      createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      status: "approved",
    });
    const r = evaluate({
      ...baseInput,
      changeOrders: [co(50), co(60), co(70)], // all > 30 days ago
    });
    expect(r.find((s) => s.kind === "change_order_density")).toBeUndefined();
  });
});

describe("ScopeCreepDetector — burn_rate", () => {
  it("fires when fee actual >= 110% of budget", () => {
    const r = evaluate({
      ...baseInput,
      latestBudget: { feeBudgeted: "10000", feeActual: "12000", feeVarPct: "20" },
    });
    const sig = r.find((s) => s.kind === "burn_rate");
    expect(sig).toBeTruthy();
    expect(sig!.evidence.pct).toBe(120);
  });

  it("does not fire below threshold", () => {
    const r = evaluate({
      ...baseInput,
      latestBudget: { feeBudgeted: "10000", feeActual: "10500", feeVarPct: "5" },
    });
    expect(r.find((s) => s.kind === "burn_rate")).toBeUndefined();
  });

  it("does not fire when budget is 0 (no signal)", () => {
    const r = evaluate({
      ...baseInput,
      latestBudget: { feeBudgeted: "0", feeActual: "5000", feeVarPct: null },
    });
    expect(r.find((s) => s.kind === "burn_rate")).toBeUndefined();
  });
});

describe("ScopeCreepDetector — margin_drift", () => {
  it("fires when margin is at least 5 points below target", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, targetMarginPercent: "40", marginPercent: "32" },
    });
    expect(r.find((s) => s.kind === "margin_drift")).toBeTruthy();
  });

  it("severity scales with drop magnitude", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, targetMarginPercent: "40", marginPercent: "20" }, // 20pt drop = 4x
    });
    expect(r.find((s) => s.kind === "margin_drift")?.severity).toBe("high");
  });

  it("does not fire when margin meets target", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, targetMarginPercent: "40", marginPercent: "40" },
    });
    expect(r.find((s) => s.kind === "margin_drift")).toBeUndefined();
  });

  it("does not fire when target=0 (no signal)", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, targetMarginPercent: "0", marginPercent: "10" },
    });
    expect(r.find((s) => s.kind === "margin_drift")).toBeUndefined();
  });
});

describe("ScopeCreepDetector — stale_no_progress", () => {
  it("fires when submitted > 30 days ago and no decision", () => {
    const r = evaluate({
      ...baseInput,
      deal: {
        ...baseInput.deal,
        status: "submitted",
        submittedAt: new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000),
      },
    });
    expect(r.find((s) => s.kind === "stale_no_progress")).toBeTruthy();
  });

  it("does not fire when status is not submitted", () => {
    const r = evaluate({
      ...baseInput,
      deal: {
        ...baseInput.deal,
        status: "approved",
        submittedAt: new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000),
      },
    });
    expect(r.find((s) => s.kind === "stale_no_progress")).toBeUndefined();
  });

  it("does not fire if just submitted", () => {
    const r = evaluate({
      ...baseInput,
      deal: {
        ...baseInput.deal,
        status: "submitted",
        submittedAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(r.find((s) => s.kind === "stale_no_progress")).toBeUndefined();
  });
});

describe("ScopeCreepDetector — confidence bounds + custom thresholds", () => {
  it("confidence is always in [0, 1]", () => {
    const r = evaluate({
      ...baseInput,
      deal: { ...baseInput.deal, totalHours: "10000", baselineHours: "100" },
      latestBudget: { feeBudgeted: "1000", feeActual: "100000", feeVarPct: "9900" },
    });
    for (const s of r) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("respects custom thresholds", () => {
    const t = { ...DEFAULT_THRESHOLDS, scopeGrowthPct: 5 };
    const r = evaluate(
      { ...baseInput, deal: { ...baseInput.deal, totalHours: "110", baselineHours: "100" } },
      t,
    );
    expect(r.find((s) => s.kind === "scope_growth")).toBeTruthy();
  });

  it("returns [] for a healthy deal", () => {
    const r = evaluate(baseInput);
    expect(r).toEqual([]);
  });
});
