/**
 * F3.3.1 — scope creep route integration test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { changeOrders, clients, deals, scopeCreepSignals } from "../../shared/schema";

const RUN_TAG = `__test_F3_3_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F3.3.1 — scope creep routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scope_creep_signals (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        kind TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        confidence DECIMAL(4,3) NOT NULL DEFAULT 0.500,
        message TEXT NOT NULL,
        evidence JSONB,
        status TEXT NOT NULL DEFAULT 'open',
        acknowledged_by TEXT,
        acknowledged_at TIMESTAMP,
        resolved_by TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
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
        status: "approved",
        targetMarginPercent: "40",
        marginPercent: "20", // 20pt drop → margin_drift fires high
        totalHours: "200",
      })
      .returning();
    testDealId = deal.id;

    // Add a few change orders within the 30-day window so density fires
    for (let i = 0; i < 3; i++) {
      await db.insert(changeOrders).values({
        dealId: deal.id,
        title: `CO ${i + 1}`,
        description: `Test ${i + 1}`,
      });
    }
  });

  afterAll(async () => {
    try {
      await db.delete(scopeCreepSignals).where(eq(scopeCreepSignals.dealId, testDealId));
      await db.delete(changeOrders).where(eq(changeOrders.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("POST /scope-creep/scan fires signals + persists rows", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/scope-creep/scan`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.signals.length).toBeGreaterThan(0);
    // margin_drift is the most likely to fire given the fixture
    expect(res.body.signals.find((s: { kind: string }) => s.kind === "margin_drift")).toBeTruthy();
    expect(typeof res.body.inserted).toBe("number");
    expect(typeof res.body.deduped).toBe("number");
  });

  it("running scan twice dedups against open signals", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/scope-creep/scan`)
      .set(HEADERS)
      .send({});
    const b = await request(app)
      .post(`/api/deals/${testDealId}/scope-creep/scan`)
      .set(HEADERS)
      .send({});
    // Second run: every open signal should be deduped, not inserted
    expect(b.body.inserted).toBe(0);
    expect(b.body.deduped).toBe(a.body.signals.length);
  });

  it("GET /scope-creep returns the signals", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/scope-creep`)
      .set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /scope-creep ?status=open narrows", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/scope-creep?status=open`)
      .set(HEADERS);
    for (const r of res.body) expect(r.status).toBe("open");
  });

  it("PATCH transitions: open → acknowledged → resolved (terminal)", async () => {
    const list = await request(app)
      .get(`/api/deals/${testDealId}/scope-creep?status=open`)
      .set(HEADERS);
    const id = list.body[0].id;
    const ack = await request(app).patch(`/api/scope-creep/${id}`).set(HEADERS).send({ status: "acknowledged" });
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedBy).toBe(`vitest-${RUN_TAG}`);
    const res = await request(app).patch(`/api/scope-creep/${id}`).set(HEADERS).send({ status: "resolved" });
    expect(res.status).toBe(200);
    const again = await request(app).patch(`/api/scope-creep/${id}`).set(HEADERS).send({ status: "open" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("illegal_signal_transition");
  });

  it("scan 404 + PATCH 404 paths", async () => {
    const a = await request(app).post(`/api/deals/999999999/scope-creep/scan`).set(HEADERS).send({});
    expect(a.status).toBe(404);
    const b = await request(app).patch(`/api/scope-creep/999999999`).set(HEADERS).send({ status: "open" });
    expect(b.status).toBe(404);
  });
});
