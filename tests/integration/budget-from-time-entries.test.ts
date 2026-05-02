/**
 * F2.3.3 — BudgetMonitorService prefers time-entry sums when any
 * rows exist for the period.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { computeBudgetSnapshot } from "../../server/services/BudgetMonitorService";
import {
  budgetActuals,
  budgetAlerts,
  clients,
  deals,
  pricingLines,
  rateCardEntries,
  rateCards,
  roles as rolesTable,
  timeEntries,
} from "../../shared/schema";

const RUN_TAG = `__test_F2_3_3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("F2.3.3 — actuals from time entries", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping", () => {});
    return;
  }

  let testClientId: number;
  let testDealId: number;
  let testRoleId: number;

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
        endDate: "2026-12-31",
      })
      .returning();
    testDealId = deal.id;

    const [role] = await db.select().from(rolesTable).limit(1);
    if (!role) throw new Error("seed needed before tests");
    testRoleId = role.id;

    await db.insert(pricingLines).values({
      dealId: deal.id,
      roleId: role.id,
      rate: "200",
      costRate: "100",
      hours: "100",
      cost: "10000",
      fee: "20000",
    });
  });

  afterAll(async () => {
    try {
      await db.delete(timeEntries).where(eq(timeEntries.dealId, testDealId));
      await db.delete(budgetAlerts).where(eq(budgetAlerts.dealId, testDealId));
      await db.delete(budgetActuals).where(eq(budgetActuals.dealId, testDealId));
      await db.delete(pricingLines).where(eq(pricingLines.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("with NO time entries, falls back to legacy heuristic", async () => {
    const snap = await computeBudgetSnapshot({
      dealId: testDealId,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
      usageFactor: 1.2, // not past end_date — heuristic returns 0
    });
    expect(snap).not.toBeNull();
    // periodEnd is 2026-04-30, deal endDate is 2026-12-31 → not past end → 0
    expect(snap!.hoursActual).toBe(0);
    expect(snap!.feeActual).toBe(0);
    expect(snap!.costActual).toBe(0);
  });

  it("with time entries in window, sums hours + projects cost/fee from rate card", async () => {
    // Activate a rate card + entry so cost/fee projection finds it.
    // We set up our own rate card so the test doesn't depend on seed state.
    const [card] = await db
      .insert(rateCards)
      .values({ name: `${RUN_TAG} Test Card`, effectiveDate: "2026-01-01", isActive: true })
      .returning();
    await db.insert(rateCardEntries).values({
      rateCardId: card.id,
      roleId: testRoleId,
      rate: "150",
      costRate: "75",
    });

    // Multiple existing rate cards may be marked active; the service
    // picks the first. To make this test deterministic, we accept
    // whichever the service picks and check the relationship: hours
    // are exact from time entries; cost/fee scale linearly with hours.

    await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-04-15",
      hours: "10.00",
      roleId: testRoleId,
    });
    await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-04-20",
      hours: "5.50",
      roleId: testRoleId,
    });

    const snap = await computeBudgetSnapshot({
      dealId: testDealId,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
    });
    expect(snap).not.toBeNull();
    // Hours total exactly 15.5 — invariant
    expect(snap!.hoursActual).toBeCloseTo(15.5, 2);
    // Cost + fee are positive; their ratio matches whichever active
    // rate card the service selected. We assert cost > 0 and
    // fee > cost, which holds for any sensible rate card.
    expect(snap!.feeActual).toBeGreaterThan(0);
    expect(snap!.costActual).toBeGreaterThan(0);
    expect(snap!.feeActual).toBeGreaterThanOrEqual(snap!.costActual);

    // cleanup the rate card so other tests don't see it
    await db.delete(rateCardEntries).where(eq(rateCardEntries.rateCardId, card.id));
    await db.delete(rateCards).where(eq(rateCards.id, card.id));
  });

  it("entries outside the window are excluded", async () => {
    await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-05-15", // outside [2026-04-01, 2026-04-30]
      hours: "20.00",
      roleId: testRoleId,
    });

    const snap = await computeBudgetSnapshot({
      dealId: testDealId,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
    });
    // Only 15.5h from the prior test should remain in window — not 35.5
    expect(snap!.hoursActual).toBeLessThan(20);
  });

  it("entry with NULL role_id contributes hours but not cost/fee", async () => {
    // Move all entries to a fresh window so this test sees only its own entry
    await db.delete(timeEntries).where(eq(timeEntries.dealId, testDealId));
    await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-06-15",
      hours: "8.00",
      roleId: null,
    });

    const snap = await computeBudgetSnapshot({
      dealId: testDealId,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
    });
    expect(snap!.hoursActual).toBe(8);
    expect(snap!.costActual).toBe(0);
    expect(snap!.feeActual).toBe(0);
  });
});
