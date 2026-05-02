/**
 * F2.4.1 — fee-arrangement column smoke test.
 *
 * Pin: columns exist after pushSchema, default is
 * 'time_and_materials', amount/percent columns are NULL by default,
 * all columns round-trip via Drizzle.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { clients, deals } from "../../shared/schema";

const RUN_TAG = `__test_F2_4_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("F2.4.1 — deals fee-arrangement columns", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testDealId: number;
  let testClientId: number;

  beforeAll(async () => {
    await pool.query(`
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS fee_arrangement TEXT DEFAULT 'time_and_materials';
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS fixed_fee_amount DECIMAL(14,2);
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS capped_fee_amount DECIMAL(14,2);
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS contingent_fee_percent DECIMAL(5,2);
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS contingent_fee_base TEXT;
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS retainer_amount DECIMAL(14,2);
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS success_fee_percent DECIMAL(5,2);
    `);
    const [client] = await db
      .insert(clients)
      .values({ name: `${RUN_TAG} Client`, industry: "Test" })
      .returning();
    testClientId = client.id;
    const [deal] = await db
      .insert(deals)
      .values({
        title: `${RUN_TAG} Deal`,
        dealNumber: `DL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        status: "draft",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("new deal defaults feeArrangement to 'time_and_materials'", async () => {
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.feeArrangement).toBe("time_and_materials");
    expect(row.fixedFeeAmount).toBeNull();
    expect(row.cappedFeeAmount).toBeNull();
    expect(row.contingentFeePercent).toBeNull();
    expect(row.contingentFeeBase).toBeNull();
    expect(row.retainerAmount).toBeNull();
    expect(row.successFeePercent).toBeNull();
  });

  it("fixed fee round-trip", async () => {
    await db
      .update(deals)
      .set({ feeArrangement: "fixed", fixedFeeAmount: "75000.00" })
      .where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.feeArrangement).toBe("fixed");
    expect(parseFloat(row.fixedFeeAmount!)).toBe(75000);
  });

  it("capped fee round-trip", async () => {
    await db
      .update(deals)
      .set({ feeArrangement: "capped", cappedFeeAmount: "120000.00" })
      .where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.feeArrangement).toBe("capped");
    expect(parseFloat(row.cappedFeeAmount!)).toBe(120000);
  });

  it("contingent fee round-trip with base", async () => {
    await db
      .update(deals)
      .set({
        feeArrangement: "contingent",
        contingentFeePercent: "33.33",
        contingentFeeBase: "savings_realized",
      })
      .where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.feeArrangement).toBe("contingent");
    expect(parseFloat(row.contingentFeePercent!)).toBeCloseTo(33.33);
    expect(row.contingentFeeBase).toBe("savings_realized");
  });

  it("retainer + hybrid round-trip", async () => {
    await db
      .update(deals)
      .set({
        feeArrangement: "hybrid",
        retainerAmount: "10000.00",
        successFeePercent: "5.00",
      })
      .where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.feeArrangement).toBe("hybrid");
    expect(parseFloat(row.retainerAmount!)).toBe(10000);
    expect(parseFloat(row.successFeePercent!)).toBe(5);
  });
});
