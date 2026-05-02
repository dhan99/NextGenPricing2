/**
 * F2.2.1 — budget_actuals + budget_alerts schema smoke test.
 *
 * Pins the column shape after pushSchema runs. The actual computation
 * + alert firing logic lands in F2.2.2.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { budgetActuals, budgetAlerts, clients, deals } from "../../shared/schema";

const RUN_TAG = `__test_F2_2_1_${Date.now()}`;

describe("F2.2.1 — budget schema", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testDealId: number;
  let testClientId: number;
  const insertedActuals: number[] = [];
  const insertedAlerts: number[] = [];

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
        status: "approved",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      if (insertedActuals.length) {
        await db.delete(budgetActuals).where(inArray(budgetActuals.id, insertedActuals));
      }
      if (insertedAlerts.length) {
        await db.delete(budgetAlerts).where(inArray(budgetAlerts.id, insertedAlerts));
      }
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("budgetActuals row round-trips with all variance columns", async () => {
    const [row] = await db.insert(budgetActuals).values({
      dealId: testDealId,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
      hoursBudgeted: "100.00",
      hoursActual: "115.00",
      hoursVarPct: "15.00",
      costBudgeted: "10000.00",
      costActual: "11500.00",
      costVarPct: "15.00",
      feeBudgeted: "20000.00",
      feeActual: "22000.00",
      feeVarPct: "10.00",
    }).returning();
    insertedActuals.push(row.id);
    expect(row.dealId).toBe(testDealId);
    expect(parseFloat(row.hoursActual!)).toBe(115);
    expect(parseFloat(row.hoursVarPct!)).toBe(15);
  });

  it("budgetActuals tolerates null variance percents (zero-budget case)", async () => {
    const [row] = await db.insert(budgetActuals).values({
      dealId: testDealId,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-06-01"),
      hoursBudgeted: "0.00",
      hoursActual: "5.00",
      hoursVarPct: null,
      costBudgeted: "0.00",
      costActual: "0.00",
    }).returning();
    insertedActuals.push(row.id);
    expect(row.hoursVarPct).toBeNull();
    expect(row.costVarPct).toBeNull();
  });

  it("budgetAlerts row round-trips and defaults status='open'", async () => {
    const [row] = await db.insert(budgetAlerts).values({
      dealId: testDealId,
      kind: "over_budget",
      metric: "hours",
      threshold: "110.00",
      observed: "115.00",
      message: "Hours exceeded budget by 15%",
    }).returning();
    insertedAlerts.push(row.id);
    expect(row.status).toBe("open");
    expect(row.acknowledgedAt).toBeNull();
    expect(parseFloat(row.observed)).toBe(115);
  });

  it("budgetAlerts metadata jsonb round-trips", async () => {
    const meta = { window: "30d", periodId: 42, actorRole: "po" };
    const [row] = await db.insert(budgetAlerts).values({
      dealId: testDealId,
      kind: "burn_rate",
      metric: "cost",
      threshold: "100.00",
      observed: "120.00",
      message: "Burning 20% faster than expected",
      metadata: meta,
    }).returning();
    insertedAlerts.push(row.id);
    expect(row.metadata).toEqual(meta);
  });

  it("budgetAlerts can be acknowledged", async () => {
    const [row] = await db.insert(budgetAlerts).values({
      dealId: testDealId,
      kind: "near_budget",
      metric: "hours",
      threshold: "90.00",
      observed: "92.00",
      message: "Approaching budget",
    }).returning();
    insertedAlerts.push(row.id);
    const [updated] = await db
      .update(budgetAlerts)
      .set({ status: "acknowledged", acknowledgedBy: "po-test", acknowledgedAt: new Date() })
      .where(eq(budgetAlerts.id, row.id))
      .returning();
    expect(updated.status).toBe("acknowledged");
    expect(updated.acknowledgedBy).toBe("po-test");
    expect(updated.acknowledgedAt).not.toBeNull();
  });
});
