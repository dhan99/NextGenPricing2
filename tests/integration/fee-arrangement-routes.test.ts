/**
 * F2.4.2 — fee-arrangement route integration test.
 *
 * Pins the projection endpoint + PATCH for arrangement + amount
 * fields. Pure unit coverage of applyFeeArrangement lives in
 * tests/pricing/feeArrangements.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, deals, pricingLines, roles as rolesTable } from "../../shared/schema";

const RUN_TAG = `__test_F2_4_2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}`,
};

describe("F2.4.2 — fee-arrangement routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

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

    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);

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

    const [role] = await db.select().from(rolesTable).limit(1);
    if (role) {
      await db.insert(pricingLines).values({
        dealId: deal.id,
        roleId: role.id,
        rate: "200",
        costRate: "100",
        hours: "500",
        cost: "50000",
        fee: "100000",
      });
    }
  });

  afterAll(async () => {
    try {
      await db.delete(pricingLines).where(eq(pricingLines.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("GET /api/fee-arrangements returns the canonical list", async () => {
    const res = await request(app).get("/api/fee-arrangements").set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining(["time_and_materials", "fixed", "capped", "contingent", "retainer", "hybrid"]),
    );
  });

  it("GET projection returns base + adjusted = base for default T&M", async () => {
    const res = await request(app).get(`/api/deals/${testDealId}/fee-projection`).set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.arrangement).toBe("time_and_materials");
    expect(res.body.adjustedTotals.totalFee).toBe(res.body.baseTotals.totalFee);
  });

  it("GET projection 404 on unknown deal", async () => {
    const res = await request(app).get(`/api/deals/999999999/fee-projection`).set(HEADERS);
    expect(res.status).toBe(404);
  });

  it("PATCH to fixed → projection uses fixed amount", async () => {
    const patch = await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "fixed", fixedFeeAmount: 80000 });
    expect(patch.status).toBe(200);
    expect(patch.body.feeArrangement).toBe("fixed");
    expect(parseFloat(patch.body.fixedFeeAmount)).toBe(80000);

    const proj = await request(app).get(`/api/deals/${testDealId}/fee-projection`).set(HEADERS);
    expect(proj.body.arrangement).toBe("fixed");
    expect(proj.body.adjustedTotals.totalFee).toBe(80000);
    // margin = (80k - 50k) / 80k * 100 = 37.5
    expect(proj.body.adjustedTotals.marginPercent).toBeCloseTo(37.5, 2);
  });

  it("PATCH to capped → projection clips when over cap", async () => {
    await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "capped", cappedFeeAmount: 75000 });
    const proj = await request(app).get(`/api/deals/${testDealId}/fee-projection`).set(HEADERS);
    expect(proj.body.adjustedTotals.totalFee).toBe(75000);
    expect(proj.body.meta.capApplied).toBe(true);
  });

  it("PATCH to hybrid → success fee added on top", async () => {
    await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "hybrid", successFeePercent: 5 });
    const proj = await request(app).get(`/api/deals/${testDealId}/fee-projection`).set(HEADERS);
    // Base T&M = 100k, +5% = 105k
    expect(proj.body.adjustedTotals.totalFee).toBe(105000);
    expect(proj.body.meta.successFeeAmount).toBe(5000);
  });

  it("PATCH rejects unknown feeArrangement", async () => {
    const res = await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "garbage" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("feeArrangement");
  });

  it("PATCH rejects negative amounts", async () => {
    const res = await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "fixed", fixedFeeAmount: -1 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("fixedFeeAmount");
  });

  it("PATCH allows null amount fields (clears prior value)", async () => {
    const res = await request(app)
      .patch(`/api/deals/${testDealId}/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "fixed", fixedFeeAmount: null });
    expect(res.status).toBe(200);
    expect(res.body.fixedFeeAmount).toBeNull();
  });

  it("PATCH 404 on unknown deal", async () => {
    const res = await request(app)
      .patch(`/api/deals/999999999/fee-arrangement`)
      .set(HEADERS)
      .send({ feeArrangement: "time_and_materials" });
    expect(res.status).toBe(404);
  });
});
