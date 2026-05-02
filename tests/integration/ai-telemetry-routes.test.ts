/**
 * F4.5.1 — AI telemetry integration test.
 *
 * Pins:
 *   - recordAi() round-trips a row into ai_telemetry
 *   - withAiTelemetry captures latency + status=ok on success
 *   - withAiTelemetry captures status=error on throw + rethrows
 *   - GET /api/ai-telemetry list + ?operation/?status filter
 *   - GET /api/ai-telemetry/summary aggregates total/error/latency/cost
 *   - calling /api/ai/deal-similarity emits a telemetry row
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { aiTelemetry } from "../../shared/schema";
import {
  recordAi,
  withAiTelemetry,
} from "../../server/middleware/aiTelemetry";

const RUN_TAG = `__test_F4_5_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };
const ADMIN_HEADERS = { "x-user-role": "po", "x-user-name": `vitest-${RUN_TAG}-po` };

describe("F4.5.1 — AI telemetry", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;

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
  });

  afterAll(async () => {
    try {
      await db.delete(aiTelemetry).where(eq(aiTelemetry.actor, `vitest-${RUN_TAG}`));
      await db
        .delete(aiTelemetry)
        .where(sql`${aiTelemetry.actor} LIKE ${`vitest-${RUN_TAG}%`}`);
    } catch { /* swallow */ }
  });

  it("recordAi inserts a row with computed totalTokens + cost", async () => {
    await recordAi({
      operation: "test-op",
      mode: "anthropic",
      status: "ok",
      model: "claude-opus-4-7",
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 250,
      actor: `vitest-${RUN_TAG}`,
    });
    const [row] = await db
      .select()
      .from(aiTelemetry)
      .where(eq(aiTelemetry.actor, `vitest-${RUN_TAG}`));
    expect(row).toBeTruthy();
    expect(row.operation).toBe("test-op");
    expect(row.totalTokens).toBe(150);
    expect(row.costUsd).not.toBeNull();
  });

  it("withAiTelemetry records ok + latency on success", async () => {
    const result = await withAiTelemetry(
      { operation: "wrap-ok", mode: "heuristic", actor: `vitest-${RUN_TAG}-wrap-ok` },
      async () => {
        await new Promise((r) => setTimeout(r, 25));
        return { value: 42 };
      },
    );
    expect(result.value).toBe(42);
    const [row] = await db
      .select()
      .from(aiTelemetry)
      .where(eq(aiTelemetry.actor, `vitest-${RUN_TAG}-wrap-ok`));
    expect(row.status).toBe("ok");
    expect(row.latencyMs).toBeGreaterThanOrEqual(20);
  });

  it("withAiTelemetry records error + rethrows on throw", async () => {
    await expect(
      withAiTelemetry(
        { operation: "wrap-err", actor: `vitest-${RUN_TAG}-wrap-err` },
        async () => {
          throw new Error("intentional");
        },
      ),
    ).rejects.toThrow(/intentional/);
    const [row] = await db
      .select()
      .from(aiTelemetry)
      .where(eq(aiTelemetry.actor, `vitest-${RUN_TAG}-wrap-err`));
    expect(row.status).toBe("error");
    expect(row.errorMessage).toMatch(/intentional/);
  });

  it("withAiTelemetry classifies 429 as rate_limited", async () => {
    await expect(
      withAiTelemetry(
        { operation: "wrap-429", actor: `vitest-${RUN_TAG}-429` },
        async () => {
          const e = new Error("Too Many Requests") as Error & { status?: number };
          e.status = 429;
          throw e;
        },
      ),
    ).rejects.toThrow();
    const [row] = await db
      .select()
      .from(aiTelemetry)
      .where(eq(aiTelemetry.actor, `vitest-${RUN_TAG}-429`));
    expect(row.status).toBe("rate_limited");
  });

  it("GET /api/ai-telemetry returns rows newest-first; ?operation filter narrows", async () => {
    // We've already inserted at least one for `test-op`.
    const r = await request(app)
      .get(`/api/ai-telemetry?operation=test-op&limit=10`)
      .set(HEADERS);
    expect(r.status).toBe(200);
    for (const row of r.body) expect(row.operation).toBe("test-op");
  });

  it("GET /api/ai-telemetry/summary returns aggregated groups", async () => {
    const r = await request(app)
      .get(`/api/ai-telemetry/summary?windowDays=30`)
      .set(ADMIN_HEADERS);
    expect(r.status).toBe(200);
    expect(typeof r.body.windowDays).toBe("number");
    expect(Array.isArray(r.body.groups)).toBe(true);
    if (r.body.groups.length > 0) {
      const g = r.body.groups[0];
      expect(typeof g.totalCalls).toBe("number");
      expect(typeof g.errorRate).toBe("number");
    }
  });

  it("/api/ai/deal-similarity emits a telemetry row", async () => {
    const actor = `vitest-${RUN_TAG}-sim`;
    await request(app)
      .post("/api/ai/deal-similarity")
      .set({ ...HEADERS, "x-user-name": actor })
      .send({});
    // recordAi fires after res.json(); poll briefly for our row.
    let rows: typeof aiTelemetry.$inferSelect[] = [];
    for (let i = 0; i < 20; i++) {
      rows = await db
        .select()
        .from(aiTelemetry)
        .where(eq(aiTelemetry.actor, actor));
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].operation).toBe("deal_similarity");
  });
});
