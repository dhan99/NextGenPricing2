/**
 * F2.4.2 — Pricing engine fork for non-T&M fee arrangements.
 *
 * Layered on top of the legacy `computeDealTotalsFromLines` so the
 * existing T&M code paths stay byte-identical. Callers that have
 * the deal row (with `feeArrangement` + the F2.4.1 columns) pass it
 * through `applyFeeArrangement(baseTotals, deal)` to get the final
 * adjusted projection.
 *
 * The transform table:
 *
 *   time_and_materials   adjustedTotals = baseTotals (no change)
 *   fixed                totalFee = fixedFeeAmount; margin recomputed
 *                         (totalCost from labor stays; blendedRate
 *                         recomputed against fixed fee)
 *   capped               totalFee = min(baseTotals.totalFee, cap)
 *                         capApplied + capSlack metadata flagged
 *   contingent           totalFee preserved as labor projection
 *                         (the contingent % is not realizable at
 *                         quote time; UI surfaces the projection as
 *                         "labor effort" + the contingent terms)
 *   retainer             totalFee = retainerAmount (per-period); the
 *                         labor projection is preserved as
 *                         baseTotals so margin commentary still works
 *   hybrid               totalFee = baseTotals.totalFee × (1 + successFeePercent/100)
 *                         successFeeAmount surfaced in metadata
 *
 * Margin/blendedRate are always recomputed against the adjusted
 * totalFee + the unchanged totalCost — the cost of the work doesn't
 * change just because the fee model does.
 */
import type { DealTotals } from "./pricing";

export type FeeArrangement =
  | "time_and_materials"
  | "fixed"
  | "capped"
  | "contingent"
  | "retainer"
  | "hybrid";

export const ALL_FEE_ARRANGEMENTS: FeeArrangement[] = [
  "time_and_materials",
  "fixed",
  "capped",
  "contingent",
  "retainer",
  "hybrid",
];

export function isFeeArrangement(raw: unknown): raw is FeeArrangement {
  return typeof raw === "string" && (ALL_FEE_ARRANGEMENTS as string[]).includes(raw);
}

/**
 * Subset of the deal row this module needs. Keeps the dependency
 * shape narrow so unit tests don't need a full Drizzle row.
 */
export interface DealFeeShape {
  feeArrangement?: string | null;
  fixedFeeAmount?: string | number | null;
  cappedFeeAmount?: string | number | null;
  contingentFeePercent?: string | number | null;
  contingentFeeBase?: string | null;
  retainerAmount?: string | number | null;
  successFeePercent?: string | number | null;
}

export interface FeeArrangementMeta {
  fixedFeeAmount?: number;
  cappedFeeAmount?: number;
  contingentFeePercent?: number;
  contingentFeeBase?: string | null;
  retainerAmount?: number;
  successFeePercent?: number;
  /** True if the cap clipped the T&M total. */
  capApplied?: boolean;
  /** Headroom remaining under the cap (>= 0; 0 when capped). */
  capSlack?: number;
  /** For `hybrid`: the absolute success fee added on top. */
  successFeeAmount?: number;
}

export interface FeeArrangementProjection {
  arrangement: FeeArrangement;
  baseTotals: DealTotals;
  adjustedTotals: DealTotals;
  meta: FeeArrangementMeta;
}

function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Recompute margin + blendedRate from a candidate totalFee while
 * keeping totalCost / totalHours / line subtotals from the base.
 */
function deriveAdjusted(base: DealTotals, totalFee: number): DealTotals {
  const safeFee = round2(totalFee);
  const margin = safeFee > 0 ? ((safeFee - base.totalCost) / safeFee) * 100 : 0;
  const blended = base.totalHours > 0 ? safeFee / base.totalHours : 0;
  return {
    ...base,
    totalFee: safeFee,
    marginPercent: round2(margin),
    blendedRate: round2(blended),
  };
}

export function applyFeeArrangement(
  baseTotals: DealTotals,
  deal: DealFeeShape | null | undefined,
): FeeArrangementProjection {
  const arrangement = isFeeArrangement(deal?.feeArrangement)
    ? (deal!.feeArrangement as FeeArrangement)
    : "time_and_materials";

  switch (arrangement) {
    case "time_and_materials": {
      return { arrangement, baseTotals, adjustedTotals: baseTotals, meta: {} };
    }
    case "fixed": {
      const fixed = num(deal?.fixedFeeAmount);
      return {
        arrangement,
        baseTotals,
        adjustedTotals: deriveAdjusted(baseTotals, fixed),
        meta: { fixedFeeAmount: fixed },
      };
    }
    case "capped": {
      const cap = num(deal?.cappedFeeAmount);
      const capped = cap > 0 && baseTotals.totalFee > cap ? cap : baseTotals.totalFee;
      const capApplied = capped < baseTotals.totalFee;
      return {
        arrangement,
        baseTotals,
        adjustedTotals: deriveAdjusted(baseTotals, capped),
        meta: {
          cappedFeeAmount: cap,
          capApplied,
          capSlack: capApplied ? 0 : round2(cap - baseTotals.totalFee),
        },
      };
    }
    case "contingent": {
      // Quote-time totalFee preserves the labor projection so margin
      // analysis still works; the contingent percent + base are
      // surfaced as metadata for the UI.
      return {
        arrangement,
        baseTotals,
        adjustedTotals: baseTotals,
        meta: {
          contingentFeePercent: num(deal?.contingentFeePercent),
          contingentFeeBase: deal?.contingentFeeBase ?? null,
        },
      };
    }
    case "retainer": {
      const retainer = num(deal?.retainerAmount);
      return {
        arrangement,
        baseTotals,
        adjustedTotals: deriveAdjusted(baseTotals, retainer),
        meta: { retainerAmount: retainer },
      };
    }
    case "hybrid": {
      const successPct = num(deal?.successFeePercent);
      const successFee = baseTotals.totalFee * (successPct / 100);
      return {
        arrangement,
        baseTotals,
        adjustedTotals: deriveAdjusted(baseTotals, baseTotals.totalFee + successFee),
        meta: { successFeePercent: successPct, successFeeAmount: round2(successFee) },
      };
    }
  }
}
