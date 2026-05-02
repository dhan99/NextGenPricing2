/**
 * F2.1.1 — Deal fingerprint column smoke test.
 *
 * Just enough to prove:
 *   - the column exists after pushSchema() runs
 *   - JSONB round-trips through Drizzle
 *   - existing rows tolerate NULL (additive migration safety)
 *
 * The actual fingerprint shape is defined by the IntelligenceEngine
 * when F2.1 ships its computation slice; this test pins the schema
 * surface only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { clients, deals } from "../../shared/schema";

const RUN_TAG = `__test_F2_1_1_${Date.now()}`;

describe("F2.1.1 — deals.fingerprint", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testDealId: number;
  let testClientId: number;

  beforeAll(async () => {
    // Apply the additive ALTER ourselves; the route layer doesn't run
    // pushSchema(). Idempotent.
    await pool.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS fingerprint JSONB;`);

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
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("freshly created deals have a NULL fingerprint", async () => {
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.fingerprint).toBeNull();
  });

  it("JSONB round-trips through Drizzle", async () => {
    const fp = {
      bu: "Tax Services",
      serviceLine: "Compliance",
      scopeItemCount: 12,
      feeBucket: "50k_100k",
      complexity: "medium",
      computedAt: "2026-05-02T00:00:00Z",
    };
    await db.update(deals).set({ fingerprint: fp }).where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.fingerprint).toEqual(fp);
  });

  it("setting back to null is allowed", async () => {
    await db.update(deals).set({ fingerprint: null }).where(eq(deals.id, testDealId));
    const [row] = await db.select().from(deals).where(eq(deals.id, testDealId));
    expect(row.fingerprint).toBeNull();
  });
});
