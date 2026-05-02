/**
 * F1.4.1 — Percentage value object unit tests.
 *
 * Pins the percent ↔ decimal disambiguation. The pricing engine
 * historically mixes both ("37" for marginPercent vs. "0.37" for
 * complexityMultiplier); Percentage is the anti-corruption layer.
 */
import { describe, it, expect } from "vitest";
import { Percentage } from "@dealpad/domain";

describe("Percentage construction", () => {
  it("fromPercent: 37 → 0.37", () => {
    const p = Percentage.fromPercent(37);
    expect(p.toDecimal()).toBeCloseTo(0.37, 10);
    expect(p.toPercent()).toBeCloseTo(37, 10);
  });

  it("fromDecimal: 0.37 → 0.37", () => {
    const p = Percentage.fromDecimal(0.37);
    expect(p.toDecimal()).toBe(0.37);
    expect(p.toPercent()).toBe(37);
  });

  it("zero", () => {
    expect(Percentage.zero().toDecimal()).toBe(0);
    expect(Percentage.zero().isZero()).toBe(true);
  });

  it("fromPercentString tolerates empty/null", () => {
    expect(Percentage.fromPercentString("").toDecimal()).toBe(0);
    expect(Percentage.fromPercentString(null).toDecimal()).toBe(0);
    expect(Percentage.fromPercentString(undefined).toDecimal()).toBe(0);
    expect(Percentage.fromPercentString("37.5").toPercent()).toBeCloseTo(37.5);
  });

  it("rejects non-finite", () => {
    expect(() => Percentage.fromPercent(Number.NaN)).toThrow(/finite/);
    expect(() => Percentage.fromDecimal(Number.POSITIVE_INFINITY)).toThrow(
      /finite/,
    );
    expect(() => Percentage.fromPercentString("not-a-number")).toThrow(
      /cannot parse/,
    );
  });
});

describe("Percentage round-trip", () => {
  it("toPercentString rounds to 2 digits by default", () => {
    expect(Percentage.fromPercent(37).toPercentString()).toBe("37.00");
    // toFixed delegates to platform float rounding; pin a value that
    // doesn't sit exactly on a rounding boundary.
    expect(Percentage.fromPercent(37.5).toPercentString()).toBe("37.50");
  });

  it("toPercentString digit override", () => {
    expect(Percentage.fromPercent(37).toPercentString(0)).toBe("37");
    expect(Percentage.fromPercent(37.5).toPercentString(1)).toBe("37.5");
  });

  it("toString uses %", () => {
    expect(Percentage.fromPercent(37).toString()).toBe("37.00%");
  });
});

describe("Percentage arithmetic", () => {
  it("add", () => {
    const a = Percentage.fromPercent(10);
    const b = Percentage.fromPercent(5);
    expect(a.add(b).toPercent()).toBeCloseTo(15);
  });

  it("subtract can go negative", () => {
    const a = Percentage.fromPercent(10);
    const b = Percentage.fromPercent(15);
    const r = a.subtract(b);
    expect(r.toPercent()).toBeCloseTo(-5);
    expect(r.isNegative()).toBe(true);
  });

  it("compound: (1 + 5%) × (1 + 10%) − 1 = 15.5%", () => {
    const r = Percentage.fromPercent(5).compound(Percentage.fromPercent(10));
    expect(r.toPercent()).toBeCloseTo(15.5, 5);
  });

  it("compound is symmetric", () => {
    const a = Percentage.fromPercent(5).compound(Percentage.fromPercent(10));
    const b = Percentage.fromPercent(10).compound(Percentage.fromPercent(5));
    expect(a.equals(b)).toBe(true);
  });
});

describe("Percentage predicates and equality", () => {
  it("equals uses tolerance", () => {
    const a = Percentage.fromPercent(0.1).add(Percentage.fromPercent(0.2));
    const b = Percentage.fromPercent(0.3);
    expect(a.equals(b)).toBe(true);
  });

  it("compare", () => {
    expect(
      Percentage.fromPercent(10).compare(Percentage.fromPercent(20)),
    ).toBe(-1);
    expect(
      Percentage.fromPercent(20).compare(Percentage.fromPercent(10)),
    ).toBe(1);
    expect(
      Percentage.fromPercent(10).compare(Percentage.fromPercent(10)),
    ).toBe(0);
  });
});

describe("Percentage immutability", () => {
  it("operations never mutate the receiver", () => {
    const a = Percentage.fromPercent(37);
    const before = a.decimal;
    a.add(Percentage.fromPercent(5));
    a.subtract(Percentage.fromPercent(5));
    a.compound(Percentage.fromPercent(2));
    expect(a.decimal).toBe(before);
  });
});
