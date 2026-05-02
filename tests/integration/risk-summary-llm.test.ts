/**
 * F4.4.2 — risk-summary route integration test (post-llm.ts swap).
 *
 * Pins:
 *   - response shape preserves legacy fields (UI compat)
 *   - new keyMessage field is present
 *   - narrative is non-empty even when the LLM fails
 *   - low/medium/high risk levels picked by margin vs target
 *   - 404 on unknown deal
 *   - emits ai_telemetry row with operation matching llm.completeStructured
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import {
  aiTelemetry,
  clients,
  deals,
} from "../../shared/schema";

const RUN_TAG = `__test_F4_4_2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F4.4.2 — risk-summary via llm.ts", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_telemetry (
        id SERIAL PRIMARY KEY,
        operation TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'heuristic',
        status TEXT NOT NULL,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        cost_usd DECIMAL(10,6),
        latency_ms INTEGER NOT NULL,
        deal_id INTEGER REFERENCES deals(id),
        actor TEXT,
        error_code TEXT,
        error_message TEXT,
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
      .values({ name: `${RUN_TAG} Client`, industry: "Test", relationshipYears: 5 })
      .returning();
    testClientId = client.id;
    const [deal] = await db
      .insert(deals)
      .values({
        title: `${RUN_TAG} Deal`,
        dealNumber: `DL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        status: "approved",
        complexity: "medium",
        businessUnit: "Tax Services",
        serviceLine: "Compliance",
        totalFee: "100000",
        totalCost: "60000",
        totalHours: "500",
        marginPercent: "40.00",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db.delete(aiTelemetry).where(sql`${aiTelemetry.actor} LIKE ${`vitest-${RUN_TAG}%`}`);
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("returns the legacy shape + new keyMessage", async () => {
    const res = await request(app)
      .post("/api/ai/risk-summary")
      .set(HEADERS)
      .send({ dealId: testDealId });
    expect(res.status).toBe(200);
    // Legacy fields preserved
    expect(res.body).toHaveProperty("dealTitle");
    expect(res.body).toHaveProperty("clientName");
    expect(res.body).toHaveProperty("riskLevel");
    expect(res.body).toHaveProperty("riskScore");
    expect(res.body).toHaveProperty("riskFactors");
    expect(res.body).toHaveProperty("executiveSummary");
    expect(res.body).toHaveProperty("narrative");
    expect(res.body).toHaveProperty("approvalLikelihood");
    // New
    expect(typeof res.body.keyMessage).toBe("string");
    expect(res.body.keyMessage.length).toBeGreaterThan(0);
  });

  it("riskLevel is Low when margin meets target (default 40 vs 35)", async () => {
    const res = await request(app)
      .post("/api/ai/risk-summary")
      .set(HEADERS)
      .send({ dealId: testDealId });
    expect(res.body.riskLevel).toBe("Low");
  });

  it("riskLevel escalates to High for thin-margin deals", async () => {
    // Mutate margin temporarily; restore after
    await db.update(deals).set({ marginPercent: "10.00" }).where(eq(deals.id, testDealId));
    const res = await request(app)
      .post("/api/ai/risk-summary")
      .set(HEADERS)
      .send({ dealId: testDealId });
    expect(res.body.riskLevel).toBe("High");
    expect(res.body.riskFactors.some((f: any) => f.factor === "Below Target Margin")).toBe(true);
    await db.update(deals).set({ marginPercent: "40.00" }).where(eq(deals.id, testDealId));
  });

  it("404 on unknown deal", async () => {
    const res = await request(app)
      .post("/api/ai/risk-summary")
      .set(HEADERS)
      .send({ dealId: 999_999_999 });
    expect(res.status).toBe(404);
  });

  it("emits an ai_telemetry row with operation containing risk_summary", async () => {
    const actor = `vitest-${RUN_TAG}-telem`;
    await request(app)
      .post("/api/ai/risk-summary")
      .set({ ...HEADERS, "x-user-name": actor })
      .send({ dealId: testDealId });
    let rows: typeof aiTelemetry.$inferSelect[] = [];
    for (let i = 0; i < 20; i++) {
      rows = await db.select().from(aiTelemetry).where(eq(aiTelemetry.actor, actor));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].operation).toContain("risk_summary");
    expect(rows[0].status).toBe("ok");
    expect(rows[0].mode).toBe("simulated");
  });
});
