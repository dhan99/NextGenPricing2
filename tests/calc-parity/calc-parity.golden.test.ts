/**
 * Phase 0 — Calc parity golden-snapshot tests
 *
 * Why this file exists
 * --------------------
 * The audit (docs/audit/CURRENT_STATE_AUDIT.md, §10.1 and §14) flagged calc
 * parity as the highest-risk regression vector during the refactor. The
 * pricing engine (`recalcPricingFromScope`, `persistDealTotals`,
 * `computeDealTotalsFromLines`) enforces `Σ line fees → deal.totalFee` at
 * runtime; this test pins the behavior so the strangler-fig refactor can't
 * silently drift it.
 *
 * What this test does
 * -------------------
 * 1. SELECTs pricing_lines + engagement_inputs for each test deal (read-only).
 * 2. Runs `computeDealTotalsFromLines(lines, ei)` — the pure function that
 *    every persistence path (`persistDealTotals`, the Pricing Grid, the AI
 *    handler) ultimately calls.
 * 3. Compares the result against `pricing-golden.json`.
 * 4. Fails if any total drifts by more than $0.01.
 *
 * Why this targets `computeDealTotalsFromLines` and NOT `recalcPricingFromScope`:
 * `recalcPricingFromScope` mutates pricing_lines and is not idempotent on
 * deals with empty `standard_rate` (it falls back to `line.rate`, which
 * already carries the previous run's T&M uplift, so each call compounds the
 * factor). That's a pre-existing bug worth its own ticket — for THIS test
 * we pin the pure invariant function instead. The audit's actual concern
 * (§10.1: "Σ line fees → deal.totalFee within $1") is `computeDealTotalsFromLines`'s
 * contract, not `recalcPricingFromScope`'s.
 *
 * Generating / regenerating the golden
 * ------------------------------------
 *     WRITE_GOLDEN=1 npx vitest run tests/calc-parity
 *     # or via the npm alias once F0.5 lands:
 *     npm run test:golden:write
 *
 * The first run on `develop` after F0.5 captures the baseline. Commit the
 * golden file. Any pricing-touching PR that changes the numbers must
 * regenerate the golden in the same PR and call out the diff.
 *
 * Test selection (server/seed-snapshot.json — IDs are stable across reseeds)
 * -------------------------------------------------------------------------
 *   - Deal 4  (DL-2026-004, "Digital Transformation"):
 *       The "vanilla" path — empty engagement_inputs, so subtotal == totalFee
 *       (no T&M / Tech & Admin / rounding involvement). Pins the base
 *       Σ-fees-Σ-cost-Σ-hours math.
 *   - Deal 27 (DL-2026-027, "Financial Audit"):
 *       Rich engagement inputs (rateYear, tmRateAdjustmentPct,
 *       techAdminFeePct, lineItemRounding, grossMarginBenchmarkPct). Pins
 *       the Tech & Admin uplift + line-item-rounding paths in
 *       computeDealTotalsFromLines.
 *
 * NOT covered yet (intentional gaps):
 *   - Per-line rate override (`rate_overridden = TRUE`): the seed ships
 *     no overridden rows; covered when we add a backfill test.
 *   - `recalcPricingFromScope` itself: it has a known idempotency bug on
 *     deals with empty `standard_rate` (compounds the T&M factor each call).
 *     Tracked separately; needs `standard_rate` backfill before recalc can
 *     be safely golden-pinned.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { deals, pricingLines } from "../../shared/schema";
import { computeDealTotalsFromLines } from "../../server/services/pricing";

const TOLERANCE_DOLLARS = 0.01;
const GOLDEN_PATH = join(import.meta.dirname, "pricing-golden.json");
const TEST_DEAL_IDS = [4, 27] as const;

type GoldenEntry = {
  dealId: number;
  dealNumber: string;
  serviceLine: string | null;
  totalFee: number;
  totalCost: number;
  totalHours: number;
  marginPercent: number;
  blendedRate: number;
  lineCount: number;
  lineSubtotalFee: number;       // Σ pricing_lines.fee — calc-parity invariant LHS
  computedSubtotalFee: number;   // computeDealTotalsFromLines(lines, ei).lineSubtotalFee — invariant RHS
  techAdminFeePct: number;       // pinned engagement-input slice (deal 28 only)
  rateAdjustmentPct: number;
  lineItemRounding: number;
};

async function captureDeal(dealId: number): Promise<GoldenEntry> {
  // SELECT-only — no DB mutation. computeDealTotalsFromLines is pure, so
  // re-running this against the same DB state always yields the same result.
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error(`Deal ${dealId} not found in DB — is the seed loaded?`);
  const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
  const ei = (deal as any).engagementInputs || {};
  const computed = computeDealTotalsFromLines(lines, ei);

  return {
    dealId: deal.id,
    dealNumber: deal.dealNumber,
    serviceLine: deal.serviceLine,
    totalFee: computed.totalFee,
    totalCost: computed.totalCost,
    totalHours: computed.totalHours,
    marginPercent: computed.marginPercent,
    blendedRate: computed.blendedRate,
    lineCount: lines.length,
    lineSubtotalFee: lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0),
    computedSubtotalFee: computed.lineSubtotalFee,
    techAdminFeePct: parseFloat(ei.techAdminFeePct ?? "0") || 0,
    rateAdjustmentPct: parseFloat(ei.tmRateAdjustmentPct ?? "0") || 0,
    lineItemRounding: parseFloat(ei.lineItemRounding ?? "0") || 0,
  };
}

describe("calc parity — golden snapshot", () => {
  let actuals: Record<number, GoldenEntry> = {};

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set; this test requires the dev/CI DB.");
    }
    for (const id of TEST_DEAL_IDS) actuals[id] = await captureDeal(id);

    if (process.env.WRITE_GOLDEN === "1") {
      const golden = TEST_DEAL_IDS.map((id) => actuals[id]);
      writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + "\n");
      // eslint-disable-next-line no-console
      console.log(`[calc-parity] wrote ${golden.length} entries to ${GOLDEN_PATH}`);
    }
  });

  it("golden file exists (run with WRITE_GOLDEN=1 once to generate)", () => {
    expect(
      existsSync(GOLDEN_PATH),
      `Missing ${GOLDEN_PATH}. Generate with:\n  WRITE_GOLDEN=1 npx vitest run tests/calc-parity`,
    ).toBe(true);
  });

  for (const id of TEST_DEAL_IDS) {
    it(`deal ${id} matches golden within $${TOLERANCE_DOLLARS}`, () => {
      if (!existsSync(GOLDEN_PATH)) return; // first sub-test already failed loudly
      const golden: GoldenEntry[] = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
      const expected = golden.find((g) => g.dealId === id);
      if (!expected) {
        throw new Error(`No golden entry for deal ${id}; regenerate with WRITE_GOLDEN=1`);
      }
      const actual = actuals[id];

      expect(actual.totalFee).toBeCloseTo(expected.totalFee, 2);
      expect(actual.totalCost).toBeCloseTo(expected.totalCost, 2);
      expect(actual.totalHours).toBeCloseTo(expected.totalHours, 2);
      expect(actual.marginPercent).toBeCloseTo(expected.marginPercent, 1);
      expect(actual.blendedRate).toBeCloseTo(expected.blendedRate, 2);
      expect(actual.lineCount).toBe(expected.lineCount);

      // Σ pricing_lines.fee should equal what computeDealTotalsFromLines
      // reports as the subtotal — both are independent reductions over the
      // same line set, so any drift means the engine and the persistence
      // layer disagree.
      expect(
        Math.abs(actual.lineSubtotalFee - actual.computedSubtotalFee),
      ).toBeLessThan(TOLERANCE_DOLLARS);
    });
  }
});
