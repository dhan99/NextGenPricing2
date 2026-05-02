/**
 * F2.2.3 — Budget routes integration test.
 *
 * Pins the REST surface for budget snapshots, alerts, recompute,
 * monitor-all, and acknowledge/resolve transitions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import {
  budgetActuals,
  budgetAlerts,
  clients,
  deals,
  pricingLines,
  roles as rolesTable,
} from "../../shared/schema";

const RUN_TAG = `__test_F2_2_3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const PDL_HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}-pdl` };
const PO_HEADERS = { "x-user-role": "po", "x-user-name": `vitest-${RUN_TAG}-po` };

describe("F2.2.3 — Budget routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS budget_actuals (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        hours_budgeted DECIMAL(10,2) DEFAULT 0,
        hours_actual DECIMAL(10,2) DEFAULT 0,
        hours_var_pct DECIMAL(6,2),
        cost_budgeted DECIMAL(14,2) DEFAULT 0,
        cost_actual DECIMAL(14,2) DEFAULT 0,
        cost_var_pct DECIMAL(6,2),
        fee_budgeted DECIMAL(14,2) DEFAULT 0,
        fee_actual DECIMAL(14,2) DEFAULT 0,
        fee_var_pct DECIMAL(6,2),
        captured_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS budget_alerts (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        kind TEXT NOT NULL,
        metric TEXT NOT NULL,
        threshold DECIMAL(8,2) NOT NULL,
        observed DECIMAL(8,2) NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        acknowledged_by TEXT,
        acknowledged_at TIMESTAMP,
        resolved_by TEXT,
        resolved_at TIMESTAMP,
        metadata JSONB,
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
        endDate: "2026-04-15",
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
        hours: "100",
        cost: "10000",
        fee: "20000",
      });
    }
  });

  afterAll(async () => {
    try {
      await db.delete(budgetAlerts).where(eq(budgetAlerts.dealId, testDealId));
      await db.delete(budgetActuals).where(eq(budgetActuals.dealId, testDealId));
      await db.delete(pricingLines).where(eq(pricingLines.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("POST /api/deals/:id/budget/recompute writes a snapshot + fires alerts", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/budget/recompute`)
      .set(PDL_HEADERS)
      .send({
        periodStart: "2026-04-01",
        periodEnd: "2026-05-01",
        usageFactor: 1.2,
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshot).toBeTruthy();
    expect(res.body.snapshot.hoursActual).toBeCloseTo(120, 1);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.alerts.length).toBeGreaterThan(0);
    expect(res.body.actualsRowId).toBeGreaterThan(0);
  });

  it("POST returns 404 for unknown deal", async () => {
    const res = await request(app)
      .post(`/api/deals/999999999/budget/recompute`)
      .set(PDL_HEADERS)
      .send({});
    expect(res.status).toBe(404);
  });

  it("GET /api/deals/:id/budget-actuals returns recent snapshots newest-first", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/budget-actuals?limit=5`)
      .set(PDL_HEADERS);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /api/deals/:id/budget-alerts returns alerts; ?status filter narrows", async () => {
    const all = await request(app)
      .get(`/api/deals/${testDealId}/budget-alerts`)
      .set(PDL_HEADERS);
    expect(all.status).toBe(200);
    const open = await request(app)
      .get(`/api/deals/${testDealId}/budget-alerts?status=open`)
      .set(PDL_HEADERS);
    expect(open.status).toBe(200);
    for (const a of open.body) expect(a.status).toBe("open");
  });

  it("GET /api/budget-alerts/open-count returns a numeric count", async () => {
    const res = await request(app)
      .get(`/api/budget-alerts/open-count`)
      .set(PDL_HEADERS);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.count).toBeGreaterThanOrEqual(0);
  });

  it("PATCH /api/budget-alerts/:id acknowledge → resolved", async () => {
    // Find one of our open alerts
    const list = await request(app)
      .get(`/api/deals/${testDealId}/budget-alerts?status=open`)
      .set(PDL_HEADERS);
    expect(list.body.length).toBeGreaterThan(0);
    const alertId = list.body[0].id;

    const ack = await request(app)
      .patch(`/api/budget-alerts/${alertId}`)
      .set(PDL_HEADERS)
      .send({ status: "acknowledged" });
    expect(ack.status).toBe(200);
    expect(ack.body.status).toBe("acknowledged");
    expect(ack.body.acknowledgedBy).toBe(`vitest-${RUN_TAG}-pdl`);

    const resolve = await request(app)
      .patch(`/api/budget-alerts/${alertId}`)
      .set(PDL_HEADERS)
      .send({ status: "resolved" });
    expect(resolve.status).toBe(200);
    expect(resolve.body.status).toBe("resolved");
    expect(resolve.body.resolvedBy).toBe(`vitest-${RUN_TAG}-pdl`);

    // Resolved is terminal — further PATCH returns 409
    const again = await request(app)
      .patch(`/api/budget-alerts/${alertId}`)
      .set(PDL_HEADERS)
      .send({ status: "open" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("illegal_alert_transition");
  });

  it("POST /api/admin/budget/monitor-all returns counts (po-gated)", async () => {
    const res = await request(app)
      .post(`/api/admin/budget/monitor-all`)
      .set(PO_HEADERS)
      .send({ usageFactor: 1.0 });
    expect(res.status).toBe(200);
    expect(typeof res.body.scanned).toBe("number");
    expect(typeof res.body.snapshots).toBe("number");
    expect(typeof res.body.alertsFired).toBe("number");
  });

  it("POST /api/admin/budget/monitor-all is rejected for non-PO personas", async () => {
    const res = await request(app)
      .post(`/api/admin/budget/monitor-all`)
      .set(PDL_HEADERS)
      .send({});
    expect(res.status).toBe(403);
  });
});
