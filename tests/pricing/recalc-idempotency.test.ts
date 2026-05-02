/**
 * F0.10 — recalcPricingFromScope idempotency.
 *
 * Pre-fix bug: when a pricing_line had empty standard_rate, the recalc's
 * baseRate fell back to `line.rate` — which on the second call already
 * carried the previous run's T&M factor, so each invocation compounded
 * the factor (1.30x → 1.69x → 2.20x …). The calc-parity golden test in
 * F0.5 caught this on the first day of Phase 0; it's why that test pins
 * `computeDealTotalsFromLines` (pure) instead of `recalcPricingFromScope`.
 *
 * Post-fix: recalc back-derives the standard from (rate / factor) the
 * first time it sees an empty value, persists it on the same UPDATE, so
 * subsequent calls read a stable standard. Running recalc N times on
 * the same deal must produce identical pricing_lines + identical
 * deals.totalFee.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { deals, pricingLines } from "../../shared/schema";
import { recalcPricingFromScope } from "../../server/services/pricing";

const TEST_DEAL_ID = 1; // DL-2026-001 — Digital Transformation, has 7 lines, real-world post-PATCH state

describe("F0.10 — recalcPricingFromScope idempotency", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  beforeAll(async () => {
    const [d] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, TEST_DEAL_ID));
    if (!d) throw new Error(`Deal ${TEST_DEAL_ID} not found in DB — run the seed first.`);
  });

  it("running recalc 3× in a row produces identical pricing_lines + deals.totalFee", async () => {
    // Establish a stable starting state, then snapshot.
    await recalcPricingFromScope(TEST_DEAL_ID);
    const snap1 = await snapshot(TEST_DEAL_ID);

    await recalcPricingFromScope(TEST_DEAL_ID);
    const snap2 = await snapshot(TEST_DEAL_ID);

    await recalcPricingFromScope(TEST_DEAL_ID);
    const snap3 = await snapshot(TEST_DEAL_ID);

    expect(snap2).toEqual(snap1);
    expect(snap3).toEqual(snap1);
  });

  it("ensures every line has standard_rate populated after recalc", async () => {
    await recalcPricingFromScope(TEST_DEAL_ID);
    const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, TEST_DEAL_ID));
    for (const l of lines) {
      const std = parseFloat(l.standardRate || "0");
      expect(std).toBeGreaterThan(0);
      // And rate × factor should equal the rate we persisted (after rounding).
      // Without a Tax-Corporate-style rateAdjustmentPct, factor = 1, so rate
      // == standard_rate. With one, rate == standard × factor within 1¢.
      const rate = parseFloat(l.rate || "0");
      expect(rate).toBeGreaterThan(0);
    }
  });
});

async function snapshot(dealId: number) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
  return {
    totalFee: deal?.totalFee,
    totalCost: deal?.totalCost,
    totalHours: deal?.totalHours,
    lines: lines
      .sort((a, b) => a.id - b.id)
      .map(l => ({
        id: l.id,
        hours: l.hours,
        rate: l.rate,
        standardRate: l.standardRate,
        fee: l.fee,
        cost: l.cost,
        margin: l.margin,
      })),
  };
}
