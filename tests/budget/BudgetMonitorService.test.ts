/**
 * F2.2.2 — BudgetMonitorService pure-function tests.
 *
 * Pin variancePct + evaluateAlerts. The DB-bound orchestrator
 * (persistAndAlert / monitorAll) is exercised in F2.2.3's
 * integration suite.
 */
import { describe, it, expect } from "vitest";
import {
  variancePct,
  evaluateAlerts,
  DEFAULT_THRESHOLDS,
  type BudgetSnapshot,
} from "../../server/services/BudgetMonitorService";

const baseSnap = (over: Partial<BudgetSnapshot> = {}): BudgetSnapshot => ({
  dealId: 1,
  periodStart: new Date("2026-04-01"),
  periodEnd: new Date("2026-05-01"),
  hoursBudgeted: 100,
  hoursActual: 50,
  hoursVarPct: -50,
  costBudgeted: 10000,
  costActual: 5000,
  costVarPct: -50,
  feeBudgeted: 20000,
  feeActual: 10000,
  feeVarPct: -50,
  ...over,
});

describe("variancePct", () => {
  it("zero variance for identical values", () => {
    expect(variancePct(100, 100)).toBe(0);
  });
  it("positive for over-budget", () => {
    expect(variancePct(110, 100)).toBeCloseTo(10);
  });
  it("negative for under-budget", () => {
    expect(variancePct(50, 100)).toBeCloseTo(-50);
  });
  it("null when budgeted=0 (no divide-by-zero)", () => {
    expect(variancePct(50, 0)).toBeNull();
  });
  it("null when inputs are not finite", () => {
    expect(variancePct(Number.NaN, 100)).toBeNull();
    expect(variancePct(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("evaluateAlerts — over_budget", () => {
  it("fires when actual >= 110% of budget on hours", () => {
    const a = evaluateAlerts(baseSnap({ hoursActual: 110, hoursVarPct: 10 }));
    const hoursAlert = a.find((x) => x.metric === "hours");
    expect(hoursAlert?.kind).toBe("over_budget");
    expect(hoursAlert?.threshold).toBe(110);
    expect(hoursAlert?.observed).toBe(110);
  });

  it("fires across hours, cost, fee independently", () => {
    const a = evaluateAlerts(
      baseSnap({
        hoursActual: 200,
        costActual: 20000,
        feeActual: 40000,
        hoursVarPct: 100,
        costVarPct: 100,
        feeVarPct: 100,
      }),
    );
    const kinds = new Set(a.map((x) => `${x.kind}:${x.metric}`));
    expect(kinds.has("over_budget:hours")).toBe(true);
    expect(kinds.has("over_budget:cost")).toBe(true);
    expect(kinds.has("over_budget:fee")).toBe(true);
  });

  it("does NOT fire when budget is zero (no signal)", () => {
    const a = evaluateAlerts(
      baseSnap({
        hoursBudgeted: 0,
        hoursActual: 50,
        hoursVarPct: null,
      }),
    );
    expect(a.find((x) => x.metric === "hours")).toBeUndefined();
  });
});

describe("evaluateAlerts — near_budget", () => {
  it("fires at 90% but not yet at 110%", () => {
    const a = evaluateAlerts(
      baseSnap({ hoursActual: 95, hoursVarPct: -5 }),
    );
    const h = a.find((x) => x.metric === "hours");
    expect(h?.kind).toBe("near_budget");
    expect(h?.threshold).toBe(90);
  });

  it("does NOT fire below 90%", () => {
    const a = evaluateAlerts(
      baseSnap({ hoursActual: 89, hoursVarPct: -11 }),
    );
    expect(a.find((x) => x.metric === "hours")).toBeUndefined();
  });

  it("near precedes over: only one fires per metric (not both)", () => {
    const a = evaluateAlerts(
      baseSnap({ hoursActual: 95, hoursVarPct: -5 }),
    );
    const hours = a.filter((x) => x.metric === "hours");
    expect(hours).toHaveLength(1);
  });
});

describe("evaluateAlerts — burn_rate (fee variance over threshold)", () => {
  it("fires when feeVarPct >= 15% AND fee actual exceeds budget", () => {
    const a = evaluateAlerts(
      baseSnap({ feeActual: 25000, feeVarPct: 25 }),
    );
    const burn = a.find((x) => x.kind === "burn_rate");
    expect(burn).toBeTruthy();
    expect(burn?.observed).toBe(25);
  });

  it("does NOT fire when variance is negative (under budget = good)", () => {
    const a = evaluateAlerts(
      baseSnap({ feeActual: 5000, feeVarPct: -75 }),
    );
    expect(a.find((x) => x.kind === "burn_rate")).toBeUndefined();
  });

  it("does NOT fire below threshold", () => {
    const a = evaluateAlerts(
      baseSnap({ feeActual: 22000, feeVarPct: 10 }),
    );
    expect(a.find((x) => x.kind === "burn_rate")).toBeUndefined();
  });
});

describe("evaluateAlerts — custom thresholds", () => {
  it("respects caller overrides", () => {
    const a = evaluateAlerts(
      baseSnap({ hoursActual: 105, hoursVarPct: 5 }),
      { ...DEFAULT_THRESHOLDS, overBudgetPct: 100, nearBudgetPct: 80 },
    );
    expect(a.find((x) => x.metric === "hours")?.kind).toBe("over_budget");
  });
});
