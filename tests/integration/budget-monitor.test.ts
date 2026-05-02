/**
 * F2.2.2 — BudgetMonitorService DB-bound integration test.
 *
 * Pins persistAndAlert + monitorAll:
 *   - snapshot row written
 *   - alerts inserted on first breach
 *   - alerts deduped on subsequent breach (no row explosion)
 *   - acknowledged alerts don't dedup against (re-fires as a new row
 *     once status transitions out of 'open')
 *   - monitorAll counts scanned/snapshots/fired
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, and } from "drizzle-orm";
import { db, pool } from "../../server/db";
import {
  budgetActuals,
  budgetAlerts,
  clients,
  deals,
  pricingLines,
  roles,
} from "../../shared/schema";
import {
  monitorAll,
  persistAndAlert,
} from "../../server/services/BudgetMonitorService";

const RUN_TAG = `__test_F2_2_2_${Date.now()}`;

describe("F2.2.2 — BudgetMonitorService (DB integration)", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testClientId: number;
  let testDealId: number;
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

    // Approved deal with end date in the past so the heuristic
    // marks it as "fully consumed" → actuals = budget × usageFactor.
    const [deal] = await db
      .insert(deals)
      .values({
        title: `${RUN_TAG} Deal`,
        dealNumber: `DL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        status: "approved",
        endDate: "2026-04-15",
        totalFee: "20000",
        totalCost: "10000",
      })
      .returning();
    testDealId = deal.id;

    // Seed pricing lines so the budget rollup has something to sum.
    const allRoles = await db.select().from(roles).limit(1);
    if (allRoles.length > 0) {
      await db.insert(pricingLines).values({
        dealId: deal.id,
        roleId: allRoles[0].id,
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
      if (insertedAlerts.length) {
        await db.delete(budgetAlerts).where(inArray(budgetAlerts.id, insertedAlerts));
      }
      // Clean any extra alerts the service inserted for our test deal
      await db.delete(budgetAlerts).where(eq(budgetAlerts.dealId, testDealId));
      if (insertedActuals.length) {
        await db.delete(budgetActuals).where(inArray(budgetActuals.id, insertedActuals));
      }
      await db.delete(budgetActuals).where(eq(budgetActuals.dealId, testDealId));
      await db.delete(pricingLines).where(eq(pricingLines.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("persistAndAlert writes a snapshot + fires over_budget at usage=1.20", async () => {
    const result = await persistAndAlert({
      dealId: testDealId,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
      usageFactor: 1.2, // 20% over budget on every metric
    });
    expect(result).not.toBeNull();
    expect(result!.snapshot.hoursActual).toBeCloseTo(120, 1);
    expect(result!.snapshot.hoursVarPct).toBeCloseTo(20, 1);
    expect(result!.actualsRowId).toBeGreaterThan(0);
    insertedActuals.push(result!.actualsRowId);
    const overBudget = result!.alerts.filter((a) => a.kind === "over_budget");
    expect(overBudget.length).toBeGreaterThan(0);
    for (const a of result!.alerts) insertedAlerts.push(a.id);
  });

  it("persistAndAlert dedups: re-firing the same alert updates the existing row", async () => {
    const second = await persistAndAlert({
      dealId: testDealId,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-06-01"),
      usageFactor: 1.5, // 50% over now
    });
    expect(second).not.toBeNull();
    insertedActuals.push(second!.actualsRowId);
    const overBudget = second!.alerts.filter((a) => a.kind === "over_budget");
    expect(overBudget.length).toBeGreaterThan(0);
    expect(overBudget.every((a) => a.deduped)).toBe(true);
    // Observed bumped to 150
    expect(overBudget[0].observed).toBeCloseTo(150, 0);
    // Only one open alert per (kind, metric)
    const openHours = await db
      .select()
      .from(budgetAlerts)
      .where(
        and(
          eq(budgetAlerts.dealId, testDealId),
          eq(budgetAlerts.kind, "over_budget"),
          eq(budgetAlerts.metric, "hours"),
          eq(budgetAlerts.status, "open"),
        ),
      );
    expect(openHours).toHaveLength(1);
  });

  it("acknowledged alerts no longer dedup → next breach inserts a fresh row", async () => {
    // Acknowledge any open over_budget hours alert for our deal
    await db
      .update(budgetAlerts)
      .set({ status: "acknowledged", acknowledgedBy: "po-test", acknowledgedAt: new Date() })
      .where(
        and(
          eq(budgetAlerts.dealId, testDealId),
          eq(budgetAlerts.kind, "over_budget"),
          eq(budgetAlerts.metric, "hours"),
          eq(budgetAlerts.status, "open"),
        ),
      );

    const third = await persistAndAlert({
      dealId: testDealId,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-07-01"),
      usageFactor: 1.3,
    });
    expect(third).not.toBeNull();
    insertedActuals.push(third!.actualsRowId);
    const fresh = third!.alerts.find((a) => a.kind === "over_budget" && a.metric === "hours");
    expect(fresh).toBeTruthy();
    expect(fresh!.deduped).toBe(false);
    insertedAlerts.push(fresh!.id);
  });

  it("monitorAll returns counts across approved deals", async () => {
    const r = await monitorAll({
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
      usageFactor: 1.0,
      statusFilter: ["approved"],
    });
    expect(r.scanned).toBeGreaterThan(0);
    // Snapshots may be < scanned if a parallel test file deletes a
    // deal between scan and per-deal compute. Bound both directions
    // generously rather than asserting equality.
    expect(r.snapshots).toBeLessThanOrEqual(r.scanned);
    expect(r.snapshots).toBeGreaterThan(0);
    expect(typeof r.alertsFired).toBe("number");
    expect(typeof r.alertsDeduped).toBe("number");
  });
});
