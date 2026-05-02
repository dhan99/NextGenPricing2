/**
 * F4.5.1 — aiTelemetry pure-function tests.
 *
 * The DB-bound recordAi + dashboard routes are exercised in
 * tests/integration/ai-telemetry-routes.test.ts.
 */
import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../../server/middleware/aiTelemetry";

describe("estimateCostUsd", () => {
  it("returns null when model is unknown", () => {
    expect(estimateCostUsd("unknown-model", 1000, 500)).toBeNull();
  });

  it("returns null when model is null/undefined", () => {
    expect(estimateCostUsd(null, 1000, 500)).toBeNull();
    expect(estimateCostUsd(undefined, 1000, 500)).toBeNull();
  });

  it("computes Anthropic Opus 4.7 pricing", () => {
    // 15 in / 75 out per 1M
    // 1000 prompt + 500 completion = 1000*15/1e6 + 500*75/1e6
    //                              = 0.000015k + 0.0000375k
    //                              = 0.000015 + 0.0000375 = 0.0000525
    // wait: per million: 1000*15/1_000_000 = 0.015; 500*75/1_000_000 = 0.0375
    // total = 0.0525
    const c = estimateCostUsd("claude-opus-4-7", 1000, 500);
    expect(c).toBeCloseTo(0.0525, 6);
  });

  it("computes embedding-only models (output rate 0)", () => {
    // text-embedding-3-small: 0.02 / 0
    // 1000 prompt = 0.00002
    const c = estimateCostUsd("text-embedding-3-small", 1000, 0);
    expect(c).toBeCloseTo(0.00002, 8);
  });

  it("treats null token counts as 0", () => {
    expect(estimateCostUsd("gpt-4o-mini", null, null)).toBe(0);
    expect(estimateCostUsd("gpt-4o-mini", 1000, null)).toBeCloseTo(0.00015, 8);
  });

  it("rounds to 6 decimal places", () => {
    const c = estimateCostUsd("claude-haiku-4-5-20251001", 1, 1);
    expect(c).not.toBeNull();
    // 1*0.8/1e6 + 1*4.0/1e6 = 0.0000008 + 0.000004 = 0.0000048
    expect(c).toBeCloseTo(0.0000048, 6);
  });
});
