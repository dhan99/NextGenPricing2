/**
 * F4.4.3 — margin-advisor route integration test (post-llm.ts swap).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { aiTelemetry, clients, deals } from "../../shared/schema";

const RUN_TAG = `__test_F4_4_3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F4.4.3 — margin-advisor via llm.ts", () => {
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

    const [client] = await db.insert(clients).values({ name: `${RUN_TAG} Client`, industry: "Test" }).returning();
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
      await db.delete(aiTelemetry).where(sql`${aiTelemetry.actor} LIKE ${`vitest-${RUN_TAG}%`}`);
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  const onTargetLines = [
    {
      role: { name: "Manager" },
      hours: "100",
      rate: "200",
      costRate: "100",
      cost: "10000",
      fee: "20000",
    },
  ];
  const offTargetLines = [
    {
      role: { name: "Manager" },
      hours: "100",
      rate: "120",
      costRate: "100",
      cost: "10000",
      fee: "12000",
    },
    {
      role: { name: "Senior Manager" },
      hours: "50",
      rate: "300",
      costRate: "200",
      cost: "10000",
      fee: "15000",
    },
    {
      role: { name: "Consultant" },
      hours: "80",
      rate: "100",
      costRate: "60",
      cost: "4800",
      fee: "8000",
    },
  ];

  it("on-target deals → 'Margin On Target' suggestion + narrative", async () => {
    const res = await request(app)
      .post("/api/ai/margin-advisor")
      .set(HEADERS)
      .send({ pricingLines: onTargetLines, dealId: testDealId, targetMargin: 40 });
    expect(res.status).toBe(200);
    expect(res.body.isOnTarget).toBe(true);
    expect(res.body.suggestions[0].type).toBe("on_target");
    expect(typeof res.body.narrative).toBe("string");
    expect(typeof res.body.callToAction).toBe("string");
  });

  it("off-target deals → role_shift + rate_adjustment suggestions", async () => {
    const res = await request(app)
      .post("/api/ai/margin-advisor")
      .set(HEADERS)
      .send({ pricingLines: offTargetLines, dealId: testDealId, targetMargin: 50 });
    expect(res.status).toBe(200);
    expect(res.body.isOnTarget).toBe(false);
    const types = res.body.suggestions.map((s: any) => s.type);
    expect(types).toContain("rate_adjustment");
    // role_shift only fires when both senior + junior bands are present
    expect(types).toContain("role_shift");
  });

  it("missing pricingLines returns empty suggestions", async () => {
    const res = await request(app)
      .post("/api/ai/margin-advisor")
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("emits ai_telemetry row for the LLM enrichment", async () => {
    const actor = `vitest-${RUN_TAG}-telem`;
    await request(app)
      .post("/api/ai/margin-advisor")
      .set({ ...HEADERS, "x-user-name": actor })
      .send({ pricingLines: onTargetLines, dealId: testDealId, targetMargin: 40 });
    let rows: typeof aiTelemetry.$inferSelect[] = [];
    for (let i = 0; i < 20; i++) {
      rows = await db.select().from(aiTelemetry).where(eq(aiTelemetry.actor, actor));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].operation).toContain("margin_advisor");
    expect(rows[0].status).toBe("ok");
  });
});
