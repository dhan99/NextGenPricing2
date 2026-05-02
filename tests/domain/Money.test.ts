/**
 * F1.4.1 — Money value object unit tests.
 *
 * Pins immutability + currency-tagged arithmetic semantics. The DB
 * boundary uses `numeric(18,2)` strings; round-tripping via
 * `fromDecimalString` / `toDecimalString` must be exact.
 */
import { describe, it, expect } from "vitest";
import { Money } from "@dealpad/domain";

describe("Money construction", () => {
  it("zero defaults to USD", () => {
    const m = Money.zero();
    expect(m.minorUnits).toBe(0);
    expect(m.currency).toBe("USD");
  });

  it("zero with explicit currency", () => {
    expect(Money.zero("EUR").currency).toBe("EUR");
  });

  it("fromDecimal rounds to nearest cent", () => {
    expect(Money.fromDecimal(12.5).minorUnits).toBe(1250);
    expect(Money.fromDecimal(12.005).minorUnits).toBe(1201);
    expect(Money.fromDecimal(0.1 + 0.2).minorUnits).toBe(30); // float trap
  });

  it("fromDecimalString parses numeric() output shapes", () => {
    expect(Money.fromDecimalString("100.00").minorUnits).toBe(10000);
    expect(Money.fromDecimalString("100").minorUnits).toBe(10000);
    expect(Money.fromDecimalString("").minorUnits).toBe(0);
    expect(Money.fromDecimalString(null).minorUnits).toBe(0);
    expect(Money.fromDecimalString(undefined).minorUnits).toBe(0);
  });

  it("fromMinorUnits accepts integers directly", () => {
    expect(Money.fromMinorUnits(7777).minorUnits).toBe(7777);
  });

  it("uppercases currency code", () => {
    expect(Money.fromDecimal(1, "usd").currency).toBe("USD");
  });

  it("rejects non-finite or non-integer minor units", () => {
    expect(() => Money.fromMinorUnits(Number.NaN)).toThrow(/finite/);
    expect(() => Money.fromMinorUnits(1.5)).toThrow(/integer/);
    expect(() => Money.fromDecimal(Number.POSITIVE_INFINITY)).toThrow(
      /finite/,
    );
  });

  it("rejects empty currency", () => {
    expect(() => Money.fromMinorUnits(0, "")).toThrow(/currency/);
  });
});

describe("Money round-trip", () => {
  it("decimal-string round-trip is exact", () => {
    const cases = ["0.00", "1.00", "100.00", "12345.67", "0.01"];
    for (const c of cases) {
      expect(Money.fromDecimalString(c).toDecimalString()).toBe(c);
    }
  });

  it("toDecimal and toDecimalString agree", () => {
    const m = Money.fromDecimal(99.99);
    expect(m.toDecimal()).toBe(99.99);
    expect(m.toDecimalString()).toBe("99.99");
  });

  it("toString includes currency", () => {
    expect(Money.fromDecimal(50, "USD").toString()).toBe("USD 50.00");
  });
});

describe("Money arithmetic", () => {
  it("add", () => {
    const a = Money.fromDecimal(10);
    const b = Money.fromDecimal(2.5);
    expect(a.add(b).toDecimal()).toBe(12.5);
  });

  it("subtract", () => {
    const a = Money.fromDecimal(10);
    const b = Money.fromDecimal(2.5);
    expect(a.subtract(b).toDecimal()).toBe(7.5);
  });

  it("multiply by unitless factor", () => {
    expect(Money.fromDecimal(100).multiply(1.05).toDecimal()).toBe(105);
    expect(Money.fromDecimal(100).multiply(0.5).toDecimal()).toBe(50);
  });

  it("multiply rounds half-up to a cent", () => {
    // $0.33 × 3 should NOT silently lose a cent. Math.round(33*3) = 99
    expect(Money.fromDecimal(0.33).multiply(3).toDecimal()).toBe(0.99);
  });

  it("rejects mixed-currency add/subtract", () => {
    const usd = Money.fromDecimal(1, "USD");
    const eur = Money.fromDecimal(1, "EUR");
    expect(() => usd.add(eur)).toThrow(/Currency mismatch/);
    expect(() => usd.subtract(eur)).toThrow(/Currency mismatch/);
  });

  it("multiplication by NaN throws", () => {
    expect(() => Money.fromDecimal(1).multiply(Number.NaN)).toThrow(/finite/);
  });
});

describe("Money predicates and equality", () => {
  it("isZero / isPositive / isNegative", () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.fromDecimal(1).isPositive()).toBe(true);
    expect(Money.fromDecimal(-1).isNegative()).toBe(true);
    expect(Money.fromDecimal(1).isZero()).toBe(false);
  });

  it("equals matches on amount + currency", () => {
    expect(Money.fromDecimal(1).equals(Money.fromDecimal(1))).toBe(true);
    expect(Money.fromDecimal(1, "USD").equals(Money.fromDecimal(1, "EUR"))).toBe(
      false,
    );
  });

  it("compare returns -1 / 0 / 1", () => {
    const a = Money.fromDecimal(10);
    const b = Money.fromDecimal(20);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(Money.fromDecimal(10))).toBe(0);
  });

  it("compare rejects mixed currencies", () => {
    expect(() =>
      Money.fromDecimal(1, "USD").compare(Money.fromDecimal(1, "EUR")),
    ).toThrow(/Currency mismatch/);
  });
});

describe("Money immutability", () => {
  it("operations never mutate the receiver", () => {
    const a = Money.fromDecimal(10);
    const before = a.minorUnits;
    a.add(Money.fromDecimal(5));
    a.subtract(Money.fromDecimal(5));
    a.multiply(2);
    expect(a.minorUnits).toBe(before);
  });
});
