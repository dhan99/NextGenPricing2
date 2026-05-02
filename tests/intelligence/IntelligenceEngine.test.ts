/**
 * F2.1.3 — IntelligenceEngine unit tests.
 *
 * Pin the simulated embedding's contracts:
 *   - 1536-d unit vector
 *   - deterministic by input
 *   - sortable by cosine: deals sharing tokens are closer than
 *     unrelated deals
 *   - empty input still produces a valid unit vector
 *   - fingerprint buckets boundary correctly
 */
import { describe, it, expect } from "vitest";
import {
  buildDealText,
  computeEmbedding,
  computeFingerprint,
  __INTERNALS_FOR_TEST,
} from "../../server/services/IntelligenceEngine";

const { simulatedEmbedding, seededUnitVector, EMBEDDING_DIM } =
  __INTERNALS_FOR_TEST;

function magnitude(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // pre-normalized inputs
}

describe("seededUnitVector", () => {
  it("produces 1536-d unit vectors", () => {
    const v = seededUnitVector(42, EMBEDDING_DIM);
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });

  it("is deterministic by seed", () => {
    const a = seededUnitVector(7, EMBEDDING_DIM);
    const b = seededUnitVector(7, EMBEDDING_DIM);
    expect(a).toEqual(b);
  });

  it("different seeds → different vectors", () => {
    const a = seededUnitVector(7, EMBEDDING_DIM);
    const b = seededUnitVector(8, EMBEDDING_DIM);
    expect(a).not.toEqual(b);
  });

  it("seed=0 still produces a unit vector (not all zeros)", () => {
    const v = seededUnitVector(0, EMBEDDING_DIM);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });
});

describe("simulatedEmbedding", () => {
  it("produces 1536-d unit vectors", () => {
    const v = simulatedEmbedding("acme tax compliance");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });

  it("is deterministic by input text", () => {
    const a = simulatedEmbedding("acme tax compliance");
    const b = simulatedEmbedding("acme tax compliance");
    expect(a).toEqual(b);
  });

  it("token order does not change the vector", () => {
    const a = simulatedEmbedding("acme tax compliance");
    const b = simulatedEmbedding("compliance tax acme");
    // Token-bag → averaged: order-independent
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-9);
    }
  });

  it("similar tokens → higher cosine than dissimilar", () => {
    const a = simulatedEmbedding("acme tax compliance audit");
    const b = simulatedEmbedding("acme tax compliance quarterly");
    const c = simulatedEmbedding("widgets manufacturing inventory");
    const sim_ab = cosine(a, b);
    const sim_ac = cosine(a, c);
    expect(sim_ab).toBeGreaterThan(sim_ac);
  });

  it("empty input produces a valid unit vector", () => {
    const v = simulatedEmbedding("");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });

  it("strips short / non-alphanumeric tokens", () => {
    // A single-letter token below the length=2 threshold; output
    // should be the zero-token fallback (deterministic seed).
    const a = simulatedEmbedding("a");
    const fallback = seededUnitVector(0xdeadbeef, EMBEDDING_DIM);
    expect(a).toEqual(fallback);
  });
});

describe("buildDealText", () => {
  it("joins title + bu + serviceLine + sorted scope names", () => {
    const t = buildDealText({
      title: "Acme Renewal",
      businessUnit: "Tax Services",
      serviceLine: "Compliance",
      scopeNames: ["zebra", "alpha", "delta"],
    });
    expect(t).toBe("Acme Renewal Tax Services Compliance alpha delta zebra");
  });

  it("scope-name order does not affect the result", () => {
    const a = buildDealText({
      title: "X",
      scopeNames: ["a", "b", "c"],
    });
    const b = buildDealText({
      title: "X",
      scopeNames: ["c", "a", "b"],
    });
    expect(a).toBe(b);
  });

  it("tolerates missing optional fields", () => {
    const t = buildDealText({ title: "Solo", scopeNames: [] });
    expect(t).toBe("Solo");
  });
});

describe("computeFingerprint", () => {
  it("buckets fee into the right bucket on boundary values", () => {
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "24999" }).feeBucket).toBe("under_25k");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "25000" }).feeBucket).toBe("25k_50k");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "499999" }).feeBucket).toBe("250k_500k");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "500000" }).feeBucket).toBe("over_500k");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: null }).feeBucket).toBe("unknown");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "" }).feeBucket).toBe("unknown");
    expect(computeFingerprint({ scopeItemCount: 0, totalFee: "garbage" }).feeBucket).toBe("unknown");
  });

  it("buckets margin", () => {
    expect(computeFingerprint({ scopeItemCount: 0, marginPercent: "19.99" }).marginBucket).toBe("under_20");
    expect(computeFingerprint({ scopeItemCount: 0, marginPercent: "20" }).marginBucket).toBe("20_30");
    expect(computeFingerprint({ scopeItemCount: 0, marginPercent: "55" }).marginBucket).toBe("over_50");
    expect(computeFingerprint({ scopeItemCount: 0, marginPercent: null }).marginBucket).toBe("unknown");
  });

  it("includes mode + computedAt", () => {
    const fp = computeFingerprint({ scopeItemCount: 5, businessUnit: "Tax" });
    expect(fp.mode).toMatch(/simulated|openai/);
    expect(typeof fp.computedAt).toBe("string");
    expect(new Date(fp.computedAt).toString()).not.toBe("Invalid Date");
    expect(fp.bu).toBe("Tax");
    expect(fp.scopeItemCount).toBe(5);
  });
});

describe("computeEmbedding (integration with mode dispatch)", () => {
  it("simulated mode returns a 1536-d unit vector", async () => {
    const v = await computeEmbedding("test text");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });
});
