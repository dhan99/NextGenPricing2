/**
 * Percentage — immutable value object that disambiguates "37" (37%)
 * from "0.37" (also 37%). The codebase historically mixes both — see
 * `marginPercent` (numeric percent) vs. `complexityMultiplier` (decimal).
 *
 * Internal representation is always decimal (0.37). Constructors and
 * accessors make the unit explicit.
 */
export class Percentage {
  readonly decimal: number;

  private constructor(decimal: number) {
    if (!Number.isFinite(decimal)) {
      throw new Error("Percentage.decimal must be finite");
    }
    this.decimal = decimal;
  }

  /** "37" → 0.37 (a.k.a. "thirty-seven percent"). */
  static fromPercent(percent: number): Percentage {
    if (!Number.isFinite(percent)) {
      throw new Error(`Percentage.fromPercent: non-finite ${percent}`);
    }
    return new Percentage(percent / 100);
  }

  /** Already-decimal input (0.37). */
  static fromDecimal(decimal: number): Percentage {
    return new Percentage(decimal);
  }

  /**
   * Numeric/string column → percent value. Empty string tolerated
   * (returns 0%). Drizzle hands back strings for `numeric` columns.
   */
  static fromPercentString(value: string | null | undefined): Percentage {
    if (value == null || value === "") return Percentage.zero();
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      throw new Error(`Percentage.fromPercentString: cannot parse "${value}"`);
    }
    return Percentage.fromPercent(n);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  /** "37%" face value, e.g. for display or comparing to a target. */
  toPercent(): number {
    return this.decimal * 100;
  }

  /** Multiplier face value (0.37). */
  toDecimal(): number {
    return this.decimal;
  }

  /** Storage shape for `numeric(5,2)` percent columns. */
  toPercentString(digits = 2): string {
    return this.toPercent().toFixed(digits);
  }

  toString(): string {
    return `${this.toPercent().toFixed(2)}%`;
  }

  add(other: Percentage): Percentage {
    return new Percentage(this.decimal + other.decimal);
  }

  subtract(other: Percentage): Percentage {
    return new Percentage(this.decimal - other.decimal);
  }

  /** Used for compounding: (1 + a) × (1 + b) − 1. */
  compound(other: Percentage): Percentage {
    return new Percentage((1 + this.decimal) * (1 + other.decimal) - 1);
  }

  isZero(): boolean {
    return this.decimal === 0;
  }
  isPositive(): boolean {
    return this.decimal > 0;
  }
  isNegative(): boolean {
    return this.decimal < 0;
  }

  /**
   * Approximate equality — percentage math chains floats, so callers
   * compare with a tolerance (default 1e-9).
   */
  equals(other: Percentage, epsilon = 1e-9): boolean {
    return Math.abs(this.decimal - other.decimal) < epsilon;
  }

  compare(other: Percentage): -1 | 0 | 1 {
    if (this.decimal < other.decimal) return -1;
    if (this.decimal > other.decimal) return 1;
    return 0;
  }
}
