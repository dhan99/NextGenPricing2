/**
 * Money — currency-tagged immutable value object.
 *
 * Stored as integer minor units (cents) so we never round during
 * arithmetic. The DB still keeps `numeric(18,2)` strings; the boundary
 * marshals via `Money.fromDecimalString` / `toDecimalString`.
 *
 * Anti-corruption rules:
 *   - cannot add/subtract two Moneys with different currencies
 *   - multiplication is by a unitless number (rates, multipliers, %)
 *   - never mutates — every operation returns a new instance
 */
export class Money {
  readonly minorUnits: number;
  readonly currency: string;

  private constructor(minorUnits: number, currency: string) {
    if (!Number.isFinite(minorUnits)) {
      throw new Error("Money.minorUnits must be finite");
    }
    if (!Number.isInteger(minorUnits)) {
      throw new Error(`Money.minorUnits must be integer, got ${minorUnits}`);
    }
    if (!currency || typeof currency !== "string") {
      throw new Error("Money.currency required");
    }
    this.minorUnits = minorUnits;
    this.currency = currency.toUpperCase();
  }

  static zero(currency = "USD"): Money {
    return new Money(0, currency);
  }

  /**
   * Construct from a decimal value (e.g. 12.50). Floats are dangerous
   * for money — the caller is asserting the value is exact.
   */
  static fromDecimal(value: number, currency = "USD"): Money {
    if (!Number.isFinite(value)) {
      throw new Error(`Money.fromDecimal: non-finite value ${value}`);
    }
    return new Money(Math.round(value * 100), currency);
  }

  /**
   * Construct from a string (the shape Drizzle hands back for
   * `numeric` columns). Empty/null tolerated → zero.
   */
  static fromDecimalString(value: string | null | undefined, currency = "USD"): Money {
    if (value == null || value === "") return Money.zero(currency);
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      throw new Error(`Money.fromDecimalString: cannot parse "${value}"`);
    }
    return Money.fromDecimal(n, currency);
  }

  static fromMinorUnits(minorUnits: number, currency = "USD"): Money {
    return new Money(minorUnits, currency);
  }

  /**
   * Decimal value (12.50 for $12.50). Use only at boundaries —
   * keep math in `Money` instances internally.
   */
  toDecimal(): number {
    return this.minorUnits / 100;
  }

  /** Decimal-string representation aligned with `numeric(18,2)` storage. */
  toDecimalString(): string {
    return this.toDecimal().toFixed(2);
  }

  toString(): string {
    return `${this.currency} ${this.toDecimalString()}`;
  }

  /** Strict currency check — caller must reconcile mismatched currencies. */
  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  /** Scale by a unitless factor (rate × hours, fee × multiplier, …). */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new Error(`Money.multiply: non-finite factor ${factor}`);
    }
    return new Money(Math.round(this.minorUnits * factor), this.currency);
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }
  isPositive(): boolean {
    return this.minorUnits > 0;
  }
  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  equals(other: Money): boolean {
    return (
      this.currency === other.currency && this.minorUnits === other.minorUnits
    );
  }

  /** Strict ordering. Same-currency only. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minorUnits < other.minorUnits) return -1;
    if (this.minorUnits > other.minorUnits) return 1;
    return 0;
  }
}
