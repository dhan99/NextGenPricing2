/**
 * F2.3.1 — time_entries schema smoke test.
 *
 * Pins the column shape after pushSchema runs. CRUD + AI suggest
 * land in F2.3.2.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { clients, deals, timeEntries } from "../../shared/schema";

const RUN_TAG = `__test_F2_3_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("F2.3.1 — time_entries schema", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testDealId: number;
  let testClientId: number;

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

  it("inserts a manual entry with required fields", async () => {
    const [row] = await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-04-15",
      hours: "3.50",
      description: "Reviewed scope draft",
    }).returning();
    expect(row.id).toBeGreaterThan(0);
    expect(row.source).toBe("manual"); // default
    expect(parseFloat(row.hours)).toBe(3.5);
    expect(row.workDate).toBe("2026-04-15");
  });

  it("source enum accepts manual / graph / ai / import", async () => {
    for (const source of ["manual", "graph", "ai", "import"]) {
      const [row] = await db.insert(timeEntries).values({
        dealId: testDealId,
        userName: `vitest-${RUN_TAG}`,
        workDate: "2026-04-16",
        hours: "1.00",
        source,
      }).returning();
      expect(row.source).toBe(source);
    }
  });

  it("metadata jsonb round-trips", async () => {
    const meta = { meetingId: "abc-123", aiPromptHash: "0xfeed", durationMin: 30 };
    const [row] = await db.insert(timeEntries).values({
      dealId: testDealId,
      userName: `vitest-${RUN_TAG}`,
      workDate: "2026-04-17",
      hours: "0.50",
      source: "graph",
      metadata: meta,
    }).returning();
    expect(row.metadata).toEqual(meta);
  });

  it("aggregates over (deal, period) — schema supports the BudgetMonitor swap", async () => {
    // The actual swap lands in F2.3.2; here we just assert the
    // SQL shape that BudgetMonitorService will use is queryable.
    const result = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(hours), 0)::text AS total
       FROM time_entries
       WHERE deal_id = $1
         AND work_date >= $2
         AND work_date <  $3`,
      [testDealId, "2026-04-01", "2026-05-01"],
    );
    expect(parseFloat(result.rows[0].total)).toBeGreaterThan(0);
  });
});
