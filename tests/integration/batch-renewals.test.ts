/**
 * F1.3 — batch renewal route integration tests.
 *
 * In-process route layer + live dev DB. Each test uses a unique RUN_TAG
 * to avoid collisions and cleans up its inserted rows in afterAll.
 * Pinning: the route layer correctly creates jobs, runs them
 * synchronously, and the BatchRenewalService produces deals + variance.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { inArray, sql } from "drizzle-orm";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { db } from "../../server/db";
import {
  deals, dealEntities, dealScopeItems, pricingLines,
  batchRenewalJobs, batchRenewalItems, batchAdjustmentRules,
} from "../../shared/schema";

const RUN_TAG = `__test_F1_3_${Date.now()}`;
const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };
// Pricing Ops persona for routes that require manageRateCards
// (POST /api/batch-adjustment-rules).
const PO_HEADERS = { "x-user-role": "po", "x-user-name": `vitest-${RUN_TAG}-po` };

describe("F1.3 — batch renewal routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let sourceDealIds: number[];
  const createdJobIds: number[] = [];
  const createdRuleIds: number[] = [];

  beforeAll(async () => {
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);

    // Pick 3 source deals with non-zero totals so variance math is meaningful.
    // Filter on stored total_fee > 0 (some seeded deals are stub rows).
    const candidates = await db.select({ id: deals.id })
      .from(deals)
      .where(sql`CAST(${deals.totalFee} AS NUMERIC) > 0`)
      .limit(3);
    if (candidates.length < 1) {
      throw new Error("Need at least 1 deal with totalFee > 0 in dev DB");
    }
    sourceDealIds = candidates.map((d) => d.id);
  });

  afterAll(async () => {
    try {
      // Order: items → jobs → cloned deals (the renewals we created) → rules.
      if (createdJobIds.length > 0) {
        const items = await db.select().from(batchRenewalItems).where(inArray(batchRenewalItems.jobId, createdJobIds));
        const newDealIds = items.map((i) => i.newDealId).filter((x): x is number => x != null);
        await db.delete(batchRenewalItems).where(inArray(batchRenewalItems.jobId, createdJobIds));
        await db.delete(batchRenewalJobs).where(inArray(batchRenewalJobs.id, createdJobIds));
        if (newDealIds.length > 0) {
          await db.delete(pricingLines).where(inArray(pricingLines.dealId, newDealIds));
          await db.delete(dealScopeItems).where(inArray(dealScopeItems.dealId, newDealIds));
          await db.delete(dealEntities).where(inArray(dealEntities.dealId, newDealIds));
          await db.delete(deals).where(inArray(deals.id, newDealIds));
        }
      }
      if (createdRuleIds.length > 0) {
        await db.delete(batchAdjustmentRules).where(inArray(batchAdjustmentRules.id, createdRuleIds));
      }
    } catch { /* swallow */ }
  });

  it("POST /api/batch-renewals creates a job + items", async () => {
    const res = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-job-create`,
      sourceDealIds,
      varianceThresholdPct: 25,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${RUN_TAG}-job-create`);
    expect(res.body.totalItems).toBe(sourceDealIds.length);
    expect(res.body.status).toBe("pending");
    createdJobIds.push(res.body.id);

    const items = await request(app).get(`/api/batch-renewals/${res.body.id}/items`).set(HEADERS);
    expect(items.status).toBe(200);
    expect(items.body.length).toBe(sourceDealIds.length);
    for (const i of items.body) expect(i.status).toBe("pending");
  });

  it("POST rejects empty sourceDealIds", async () => {
    const res = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-empty`,
      sourceDealIds: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("sourceDealIds");
  });

  it("POST rejects unknown source deal ids with code:unknown_deal_ids", async () => {
    const res = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-unknown`,
      sourceDealIds: [999999999],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("unknown_deal_ids");
  });

  it("POST rejects empty name + bad varianceThresholdPct", async () => {
    let res = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: "   ", sourceDealIds,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("name");

    res = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-thr`, sourceDealIds, varianceThresholdPct: 200,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("varianceThresholdPct");
  });

  it("POST /:id/start runs synchronously and returns summary; items get newDealId", async () => {
    // Create a job with just one source deal so the test is fast.
    const create = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-job-run`,
      sourceDealIds: [sourceDealIds[0]],
      varianceThresholdPct: 25,
    });
    expect(create.status).toBe(201);
    createdJobIds.push(create.body.id);

    const start = await request(app).post(`/api/batch-renewals/${create.body.id}/start`).set(HEADERS).send({});
    expect(start.status).toBe(200);
    expect(start.body.processed + start.body.flagged + start.body.failed).toBeGreaterThan(0);
    expect(["completed", "failed"]).toContain(start.body.job.status);

    // Item must be 'completed' or 'flagged' or 'failed' (not 'pending').
    const items = await request(app).get(`/api/batch-renewals/${create.body.id}/items`).set(HEADERS);
    expect(items.body.length).toBe(1);
    expect(["completed", "flagged", "failed"]).toContain(items.body[0].status);
    if (items.body[0].status !== "failed") {
      expect(typeof items.body[0].newDealId).toBe("number");
    }
  });

  it("starting an already-completed job returns 409 with code:already_completed", async () => {
    const create = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-double-start`,
      sourceDealIds: [sourceDealIds[0]],
    });
    createdJobIds.push(create.body.id);
    await request(app).post(`/api/batch-renewals/${create.body.id}/start`).set(HEADERS).send({});
    const second = await request(app).post(`/api/batch-renewals/${create.body.id}/start`).set(HEADERS).send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("already_completed");
  });

  it("running a job with adjustment rules applies them — fee changes by ~factor", async () => {
    // Create a 5% rate-uplift rule.
    const ruleRes = await request(app).post("/api/batch-adjustment-rules").set(PO_HEADERS).send({
      name: `${RUN_TAG}-uplift-5`,
      ruleType: "rate_uplift",
      parameters: { factor: 1.05 },
    });
    expect(ruleRes.status).toBe(201);
    createdRuleIds.push(ruleRes.body.id);

    const job = await request(app).post("/api/batch-renewals").set(HEADERS).send({
      name: `${RUN_TAG}-uplift-job`,
      sourceDealIds: [sourceDealIds[0]],
      varianceThresholdPct: 25,
      adjustmentRuleIds: [ruleRes.body.id],
    });
    createdJobIds.push(job.body.id);

    const start = await request(app).post(`/api/batch-renewals/${job.body.id}/start`).set(HEADERS).send({});
    expect(start.status).toBe(200);

    // Variance on the new deal vs source should reflect the rate uplift.
    // The orchestrator applies factor to per-line rates, so totalFee
    // should grow by ~5% (within rounding).
    const items = await request(app).get(`/api/batch-renewals/${job.body.id}/items`).set(HEADERS);
    const item = items.body[0];
    if (item.status !== "failed") {
      expect(typeof item.variancePct).toBe("string"); // Drizzle decimal serializes as string
      const v = parseFloat(item.variancePct);
      // Expect close to +5% with some tolerance (rounding + scope-driven recompute).
      expect(v).toBeGreaterThan(2);
      expect(v).toBeLessThan(15);
    }
  });

  it("GET /api/batch-renewals lists jobs sorted by createdAt desc", async () => {
    const res = await request(app).get("/api/batch-renewals").set(HEADERS);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ours = res.body.filter((j: any) => j.name.startsWith(RUN_TAG));
    expect(ours.length).toBeGreaterThan(0);
  });

  it("GET /api/batch-renewals/:id 404s for unknown id", async () => {
    const res = await request(app).get("/api/batch-renewals/999999999").set(HEADERS);
    expect(res.status).toBe(404);
  });

  it("POST /api/batch-adjustment-rules validates ruleType + parameters", async () => {
    let res = await request(app).post("/api/batch-adjustment-rules").set(PO_HEADERS).send({
      name: `${RUN_TAG}-bad-type`,
      ruleType: "not_a_real_type",
      parameters: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("ruleType");

    res = await request(app).post("/api/batch-adjustment-rules").set(PO_HEADERS).send({
      name: `${RUN_TAG}-no-params`,
      ruleType: "rate_uplift",
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("parameters");
  });

  it("starting a non-existent job returns 404", async () => {
    const res = await request(app).post("/api/batch-renewals/999999999/start").set(HEADERS).send({});
    expect(res.status).toBe(404);
  });
});
