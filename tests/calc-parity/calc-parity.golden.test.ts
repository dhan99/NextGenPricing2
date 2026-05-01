/**
 * Phase 0 — Calc parity golden-snapshot tests
 *
 * Why this file exists
 * --------------------
 * The audit (docs/audit/CURRENT_STATE_AUDIT.md, §10.1 and §14) flagged calc
 * parity as the highest-risk regression vector during the refactor. The
 * pricing engine (`recalcPricingFromScope` in server/routes.ts) is enforced
 * at runtime — `Σ line fees − deal.totalFee` must be < $1 — but there is no
 * automated test that pins this behavior down today.
 *
 * What this scaffold does
 * -----------------------
 * 1. Loads a deterministic snapshot of input deals (from server/seed-snapshot.json)
 * 2. Calls the pricing engine for each deal
 * 3. Compares the totals against a `pricing-golden.json` snapshot
 * 4. Fails the test if any deal drifts by more than $0.01 OR if calc parity
 *    breaks (Σ lines vs deal totals)
 *
 * To use:
 *   1. Run `npm run test:golden:write` once on the **current main** to generate
 *      `pricing-golden.json` (the "before refactor" baseline).
 *   2. Commit the golden file.
 *   3. Run `npm run test:golden` in CI on every PR. If the refactor changes
 *      pricing behavior, this test fails loudly.
 *   4. When pricing behavior intentionally changes, regenerate the golden
 *      and call out the diff in the PR description.
 *
 * Status
 * ------
 * SCAFFOLD ONLY. The actual import paths below depend on Phase 1 introducing
 * Vitest and exporting `recalcPricingFromScope` from a stable path. Today
 * that function is defined inside `server/routes.ts` and not exported. The
 * first refactor task (Phase 0 Step 0.5) is to (a) install Vitest and (b)
 * extract `recalcPricingFromScope` into `server/services/pricing.ts` so it
 * is callable from a test.
 */

// import { describe, it, expect, beforeAll } from "vitest";
// import { db } from "../../server/db";
// import { recalcPricingFromScope, persistDealTotals } from "../../server/services/pricing";
// import goldenSnapshot from "./pricing-golden.json";
// import seedSnapshot from "../../server/seed-snapshot.json";
//
// const TOLERANCE_DOLLARS = 0.01; // tighter than the runtime $1 parity check
//
// describe("calc parity — golden snapshot", () => {
//   beforeAll(async () => {
//     // Restore DB to the snapshot state. This relies on a `loadSnapshot`
//     // helper that the existing snapshot-loader already implements; we just
//     // wrap it for tests.
//     // await loadSnapshotForTest(seedSnapshot);
//   });
//
//   for (const expected of (goldenSnapshot as Array<any>)) {
//     it(`deal ${expected.dealNumber} — totals within tolerance`, async () => {
//       await recalcPricingFromScope(expected.dealId);
//       await persistDealTotals(expected.dealId);
//
//       const [actual] = await db
//         .select()
//         .from(/* deals */ undefined as any)
//         .where(/* eq(deals.id, expected.dealId) */ undefined as any);
//
//       expect(parseFloat(actual.totalFee)).toBeCloseTo(expected.totalFee, 2);
//       expect(parseFloat(actual.totalCost)).toBeCloseTo(expected.totalCost, 2);
//       expect(parseFloat(actual.totalHours)).toBeCloseTo(expected.totalHours, 2);
//       expect(parseFloat(actual.marginPercent)).toBeCloseTo(expected.marginPercent, 2);
//
//       // Σ line fees vs deal total (the "calc parity" invariant)
//       const lines = await db
//         .select()
//         .from(/* pricingLines */ undefined as any)
//         .where(/* eq(pricingLines.dealId, expected.dealId) */ undefined as any);
//       const sumLineFees = lines.reduce(
//         (s: number, l: any) => s + parseFloat(l.fee || "0"),
//         0,
//       );
//       expect(Math.abs(sumLineFees - parseFloat(actual.totalFee))).toBeLessThan(
//         TOLERANCE_DOLLARS,
//       );
//     });
//   }
// });

export {};
