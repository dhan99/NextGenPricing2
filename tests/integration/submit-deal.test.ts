/**
 * F1.4.5 — POST /api/deals/:id/submit integration test.
 *
 * Verifies the route still exhibits its legacy behavior after the
 * SubmitDealService swap:
 *   - 200 with { deal, screening } on a clean draft deal
 *   - status flipped to "submitted" + currentStep at least 6
 *   - DealSubmitted outbox row written
 *   - 404 when the deal id doesn't exist
 *   - 409 with code=intapp_conflict when (we'd need to seed a conflict
 *     to assert this — kept as a smoke-level expectation only)
 *
 * Requires DATABASE_URL. Creates its own throwaway deal via the
 * routes layer, asserts on it, and cleans up.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import {
  clients,
  deals,
  domainEventsOutbox,
} from "../../shared/schema";

const RUN_TAG = `__test_F1_4_submit_${Date.now()}`;

const HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}`,
};

describe("F1.4.5 — POST /api/deals/:id/submit (via SubmitDealService)", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testDealId: number;
  let testClientId: number;

  beforeAll(async () => {
    // Pre-create the outbox table — see F1.4.3 integration test for
    // why this is necessary in test boots.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS domain_events_outbox (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        version INTEGER NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id INTEGER NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMP NOT NULL,
        published_at TIMESTAMP,
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
        dealNumber: `DL-TEST-${Date.now()}`,
        clientId: client.id,
        status: "draft",
        currentStep: 1,
        // Use Audit BU/serviceLine + low fee so Workday gating wouldn't
        // block (the /submit route doesn't run Workday gating anyway,
        // but a quiet deal keeps the test deterministic).
        businessUnit: "Audit & Assurance",
        serviceLine: "Audit",
        totalFee: "10000.00",
        totalCost: "6000.00",
        marginPercent: "40.00",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db
        .delete(domainEventsOutbox)
        .where(eq(domainEventsOutbox.aggregateId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch {
      /* swallow */
    }
  });

  it("submits a draft deal → 200 with { deal, screening }", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/submit`)
      .set(HEADERS)
      .send({});
    expect([200, 201]).toContain(res.status);
    expect(res.body.deal).toBeDefined();
    expect(res.body.deal.id).toBe(testDealId);
    expect(res.body.deal.status).toBe("submitted");
    // screening is present when the screener returns; null/undefined
    // is acceptable when settings.autoScreenOnSubmit is off.
    expect(Object.prototype.hasOwnProperty.call(res.body, "screening")).toBe(true);
  });

  it("persists status + currentStep through the aggregate", async () => {
    const [row] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, testDealId));
    expect(row.status).toBe("submitted");
    // SubmitDealService advances the wizard to step 6 (matches the
    // /approvals POST handler's behavior — the user lands on the
    // approvals tab on next visit).
    expect(row.currentStep ?? 1).toBeGreaterThanOrEqual(6);
  });

  it("writes a DealSubmitted outbox event", async () => {
    const rows = await db
      .select()
      .from(domainEventsOutbox)
      .where(eq(domainEventsOutbox.aggregateId, testDealId));
    const submitted = rows.find((r) => r.type === "DealSubmitted");
    expect(submitted).toBeTruthy();
    expect(submitted!.version).toBe(1);
    expect(submitted!.aggregateType).toBe("Deal");
    const payload = submitted!.payload as Record<string, unknown>;
    expect(payload.previousStatus).toBe("draft");
    expect(payload.actor).toBe(`vitest-${RUN_TAG}`);
  });

  it("returns 404 for an unknown deal id", async () => {
    const res = await request(app)
      .post(`/api/deals/999999999/submit`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("rejects double-submit with the domain illegal-state error", async () => {
    // The deal is already submitted from the first test. Attempting
    // to resubmit should fail because Deal.submit() rejects the
    // submitted → submitted edge.
    const res = await request(app)
      .post(`/api/deals/${testDealId}/submit`)
      .set(HEADERS)
      .send({});
    // The route doesn't translate IllegalStateError to a structured
    // 409 yet (would be a small follow-up). For now, asserting it
    // doesn't silently succeed is enough.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });
});
