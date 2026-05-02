/**
 * F2.1.4 — POST /api/ai/deal-similarity integration test.
 *
 * Verifies the route still returns the legacy { similarDeals, insights }
 * shape after wiring through pgvector, and adds coverage for the new
 * dealId-anchored path + the heuristic fallback.
 *
 * Skips if pgvector isn't installed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, deals } from "../../shared/schema";
import { recomputeForDeal } from "../../server/services/IntelligenceEngine";

const RUN_TAG = `__test_F2_1_4_${Date.now()}`;

const HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}`,
};
const ADMIN_HEADERS = {
  "x-user-role": "po",
  "x-user-name": `vitest-${RUN_TAG}-po`,
};

describe("F2.1.4 — POST /api/ai/deal-similarity (kNN swap)", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let hasVector = false;
  let app: express.Express;
  let testClientId: number;
  const testDealIds: number[] = [];

  beforeAll(async () => {
    const probe = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    hasVector = probe.rowCount === 1;
    if (!hasVector) return;

    await pool.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS fingerprint JSONB;`);
    await pool.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS embedding vector(1536);`);

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

    const fixtures = [
      { title: `${RUN_TAG} Acme tax compliance audit`, businessUnit: "Tax Services", serviceLine: "Compliance" },
      { title: `${RUN_TAG} Beta tax compliance review`, businessUnit: "Tax Services", serviceLine: "Compliance" },
      { title: `${RUN_TAG} Widgets manufacturing inventory`, businessUnit: "Audit & Assurance", serviceLine: "Inventory" },
    ];
    for (const f of fixtures) {
      const [d] = await db
        .insert(deals)
        .values({
          ...f,
          dealNumber: `DL-TEST-${Date.now()}-${testDealIds.length}`,
          clientId: client.id,
          status: "approved",
          totalFee: "75000.00",
          marginPercent: "35.00",
        })
        .returning();
      testDealIds.push(d.id);
      await recomputeForDeal(d.id);
    }
  });

  afterAll(async () => {
    if (!hasVector) return;
    try {
      if (testDealIds.length) {
        await db.delete(deals).where(inArray(deals.id, testDealIds));
      }
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("dealId-anchored: returns kNN-mode results, anchor excluded", async () => {
    if (!hasVector) return;
    const res = await request(app)
      .post("/api/ai/deal-similarity")
      .set(HEADERS)
      .send({ dealId: testDealIds[0], k: 10 });
    expect(res.status).toBe(200);
    expect(res.body.insights.mode).toBe("knn");
    // Anchor should not be in the results
    const numbers = res.body.similarDeals.map((d: { dealNumber: string }) => d.dealNumber);
    const anchorNumber = (await db.select({ n: deals.dealNumber }).from(deals).where(eq(deals.id, testDealIds[0])))[0].n;
    expect(numbers).not.toContain(anchorNumber);
    // Each result has the legacy shape + new distance field
    for (const d of res.body.similarDeals) {
      expect(d.dealNumber).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(typeof d.distance === "number" || d.distance === null).toBe(true);
    }
  });

  it("legacy field-anchored: clientId/serviceLine/businessUnit still works", async () => {
    if (!hasVector) return;
    const res = await request(app)
      .post("/api/ai/deal-similarity")
      .set(HEADERS)
      .send({
        clientId: testClientId,
        serviceLine: "Compliance",
        businessUnit: "Tax Services",
        k: 10,
      });
    expect(res.status).toBe(200);
    // Either knn (because we have embeddings) or heuristic — both are valid
    expect(["knn", "heuristic"]).toContain(res.body.insights.mode);
    expect(Array.isArray(res.body.similarDeals)).toBe(true);
    expect(res.body.similarDeals.length).toBeGreaterThan(0);
    expect(typeof res.body.insights.recommendation).toBe("string");
    expect(typeof res.body.insights.averageMargin).toBe("string");
  });

  it("with no inputs falls back to heuristic top-k", async () => {
    if (!hasVector) return;
    const res = await request(app)
      .post("/api/ai/deal-similarity")
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.insights.mode).toBe("heuristic");
    expect(res.body.similarDeals.length).toBeGreaterThan(0);
  });

  it("response shape preserves legacy fields the UI reads", async () => {
    if (!hasVector) return;
    const res = await request(app)
      .post("/api/ai/deal-similarity")
      .set(HEADERS)
      .send({ dealId: testDealIds[0] });
    expect(res.body).toHaveProperty("similarDeals");
    expect(res.body).toHaveProperty("insights.recommendation");
    expect(res.body).toHaveProperty("insights.averageMargin");
    expect(res.body).toHaveProperty("insights.averageFee");
    expect(res.body).toHaveProperty("insights.dealCount");
  });

  it("POST /api/admin/intelligence/backfill returns scan + update counts", async () => {
    if (!hasVector) return;
    // Don't assert second-run.updated === 0; parallel test files may
    // race in new deals with NULL embedding. Convergence is the
    // contract, not strict idempotency under concurrent writes.
    const first = await request(app)
      .post("/api/admin/intelligence/backfill")
      .set(ADMIN_HEADERS)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body).toHaveProperty("scanned");
    expect(first.body).toHaveProperty("updated");
    expect(typeof first.body.scanned).toBe("number");
    expect(typeof first.body.updated).toBe("number");
    expect(first.body.updated).toBeLessThanOrEqual(first.body.scanned);
  });

  it("POST /api/deals/:id/intelligence/recompute updates one deal", async () => {
    if (!hasVector) return;
    // Null out, then recompute
    await db
      .update(deals)
      .set({ embedding: null, fingerprint: null })
      .where(eq(deals.id, testDealIds[0]));
    const res = await request(app)
      .post(`/api/deals/${testDealIds[0]}/intelligence/recompute`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.fingerprint).toBeTruthy();
  });

  it("POST /api/deals/:id/intelligence/recompute returns 404 for unknown deal", async () => {
    if (!hasVector) return;
    const res = await request(app)
      .post(`/api/deals/999999999/intelligence/recompute`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(404);
  });
});
