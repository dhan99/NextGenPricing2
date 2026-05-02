/**
 * F2.3.2 — Time entry route integration test.
 *
 * Pins CRUD + suggest + summary against the live DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, deals, timeEntries } from "../../shared/schema";

const RUN_TAG = `__test_F2_3_2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}`,
};

describe("F2.3.2 — time entry routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        user_name TEXT NOT NULL,
        work_date TEXT NOT NULL,
        hours DECIMAL(6,2) NOT NULL,
        role_id INTEGER REFERENCES roles(id),
        description TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
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
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db.delete(timeEntries).where(eq(timeEntries.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("POST /api/deals/:id/time-entries creates a manual entry; hours snap to 0.25", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({
        workDate: "2026-04-15",
        hours: 1.4, // should snap to 1.5
        description: "Reviewed scope draft",
      });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.hours)).toBe(1.5);
    expect(res.body.source).toBe("manual");
    expect(res.body.userName).toBe(`vitest-${RUN_TAG}`);
  });

  it("rejects bad workDate / hours", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "yesterday", hours: 1 });
    expect(a.status).toBe(400);
    const b = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-15", hours: 0 });
    expect(b.status).toBe(400);
    const c = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-15", hours: 1, source: "bogus" });
    expect(c.status).toBe(400);
  });

  it("GET list returns entries newest-first; ?from / ?to / ?source narrow", async () => {
    await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-16", hours: 0.5, source: "ai" });
    const list = await request(app)
      .get(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const aiOnly = await request(app)
      .get(`/api/deals/${testDealId}/time-entries?source=ai`)
      .set(HEADERS);
    expect(aiOnly.status).toBe(200);
    for (const r of aiOnly.body) expect(r.source).toBe("ai");
    const windowed = await request(app)
      .get(`/api/deals/${testDealId}/time-entries?from=2026-04-16&to=2026-04-16`)
      .set(HEADERS);
    for (const r of windowed.body) expect(r.workDate).toBe("2026-04-16");
  });

  it("GET summary returns total hours + entry count", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/time-entries/summary`)
      .set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.totalHours).toBeGreaterThan(0);
    expect(res.body.entryCount).toBeGreaterThan(0);
  });

  it("PATCH /api/time-entries/:id updates hours + description", async () => {
    const created = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-17", hours: 2 });
    const id = created.body.id;
    const patch = await request(app)
      .patch(`/api/time-entries/${id}`)
      .set(HEADERS)
      .send({ hours: 3.1, description: "Updated note" });
    expect(patch.status).toBe(200);
    expect(parseFloat(patch.body.hours)).toBe(3.0);
    expect(patch.body.description).toBe("Updated note");
  });

  it("PATCH 404 + 400 paths", async () => {
    const a = await request(app).patch(`/api/time-entries/999999999`).set(HEADERS).send({ hours: 1 });
    expect(a.status).toBe(404);
    const created = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-18", hours: 1 });
    const b = await request(app)
      .patch(`/api/time-entries/${created.body.id}`)
      .set(HEADERS)
      .send({ hours: -2 });
    expect(b.status).toBe(400);
  });

  it("DELETE removes the entry", async () => {
    const created = await request(app)
      .post(`/api/deals/${testDealId}/time-entries`)
      .set(HEADERS)
      .send({ workDate: "2026-04-19", hours: 0.25 });
    const del = await request(app)
      .delete(`/api/time-entries/${created.body.id}`)
      .set(HEADERS);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
  });

  it("POST /api/time/suggest returns a candidate without writing", async () => {
    const before = await request(app)
      .get(`/api/deals/${testDealId}/time-entries/summary`)
      .set(HEADERS);
    const res = await request(app)
      .post(`/api/time/suggest`)
      .set(HEADERS)
      .send({ dealId: testDealId, workDate: "2026-04-20", hint: "kickoff" });
    expect(res.status).toBe(200);
    expect(res.body.workDate).toBe("2026-04-20");
    expect(res.body.hours).toBeGreaterThan(0);
    expect(res.body.confidence).toBeGreaterThanOrEqual(0.6);
    expect(res.body.confidence).toBeLessThanOrEqual(0.7);
    expect(res.body.source).toBe("ai");
    // No write: summary unchanged
    const after = await request(app)
      .get(`/api/deals/${testDealId}/time-entries/summary`)
      .set(HEADERS);
    expect(after.body.totalHours).toBe(before.body.totalHours);
    expect(after.body.entryCount).toBe(before.body.entryCount);
  });

  it("POST /api/time/suggest validates dealId + 404 unknown", async () => {
    const a = await request(app).post(`/api/time/suggest`).set(HEADERS).send({});
    expect(a.status).toBe(400);
    const b = await request(app)
      .post(`/api/time/suggest`)
      .set(HEADERS)
      .send({ dealId: 999999999 });
    expect(b.status).toBe(404);
  });
});
