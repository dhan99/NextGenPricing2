/**
 * F3.6.1 — rate optimization route integration test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { rateOptimizationRuns } from "../../shared/schema";

const RUN_TAG = `__test_F3_6_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const PO_HEADERS = { "x-user-role": "po", "x-user-name": `vitest-${RUN_TAG}` };
const PDL_HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F3.6.1 — rate optimization routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  const insertedRunIds: number[] = [];

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_optimization_runs (
        id SERIAL PRIMARY KEY,
        scope TEXT NOT NULL,
        scope_key TEXT,
        target_window_start TEXT NOT NULL,
        target_window_end TEXT NOT NULL,
        recommendation JSONB NOT NULL,
        confidence DECIMAL(4,3) NOT NULL DEFAULT 0.500,
        rationale TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT,
        applied_at TIMESTAMP,
        applied_by TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);
  });

  afterAll(async () => {
    try {
      for (const id of insertedRunIds) {
        await db.delete(rateOptimizationRuns).where(eq(rateOptimizationRuns.id, id));
      }
    } catch { /* swallow */ }
  });

  it("POST creates a draft run with recommendation + rationale", async () => {
    const res = await request(app)
      .post("/api/rate-optimization/runs")
      .set(PO_HEADERS)
      .send({
        scope: "firm",
        targetWindowStart: "2026-07-01",
        targetWindowEnd: "2026-09-30",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.recommendation).toBeTruthy();
    expect(typeof res.body.rationale).toBe("string");
    expect(res.body.createdBy).toBe(`vitest-${RUN_TAG}`);
    insertedRunIds.push(res.body.id);
  });

  it("POST validates scope + window dates", async () => {
    const a = await request(app)
      .post("/api/rate-optimization/runs")
      .set(PO_HEADERS)
      .send({ scope: "garbage", targetWindowStart: "2026-07-01", targetWindowEnd: "2026-09-30" });
    expect(a.status).toBe(400);
    const b = await request(app)
      .post("/api/rate-optimization/runs")
      .set(PO_HEADERS)
      .send({ scope: "firm", targetWindowStart: "tomorrow", targetWindowEnd: "later" });
    expect(b.status).toBe(400);
  });

  it("POST is rejected for non-PO personas (403)", async () => {
    const res = await request(app)
      .post("/api/rate-optimization/runs")
      .set(PDL_HEADERS)
      .send({ scope: "firm", targetWindowStart: "2026-07-01", targetWindowEnd: "2026-09-30" });
    expect(res.status).toBe(403);
  });

  it("GET list returns runs newest-first; ?status filter narrows", async () => {
    const all = await request(app)
      .get("/api/rate-optimization/runs")
      .set(PO_HEADERS);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);
    const drafts = await request(app)
      .get("/api/rate-optimization/runs?status=draft")
      .set(PO_HEADERS);
    for (const r of drafts.body) expect(r.status).toBe("draft");
  });

  it("PATCH lifecycle: draft → published → applied (terminal)", async () => {
    const create = await request(app)
      .post("/api/rate-optimization/runs")
      .set(PO_HEADERS)
      .send({ scope: "firm", targetWindowStart: "2026-10-01", targetWindowEnd: "2026-12-31" });
    insertedRunIds.push(create.body.id);
    const pub = await request(app)
      .patch(`/api/rate-optimization/runs/${create.body.id}`)
      .set(PO_HEADERS)
      .send({ status: "published" });
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe("published");
    const apl = await request(app)
      .patch(`/api/rate-optimization/runs/${create.body.id}`)
      .set(PO_HEADERS)
      .send({ status: "applied" });
    expect(apl.status).toBe(200);
    expect(apl.body.appliedBy).toBe(`vitest-${RUN_TAG}`);
    const again = await request(app)
      .patch(`/api/rate-optimization/runs/${create.body.id}`)
      .set(PO_HEADERS)
      .send({ status: "discarded" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("illegal_run_transition");
  });

  it("PATCH 404 on unknown run", async () => {
    const res = await request(app)
      .patch("/api/rate-optimization/runs/999999999")
      .set(PO_HEADERS)
      .send({ status: "published" });
    expect(res.status).toBe(404);
  });
});
