/**
 * F1.4.3 — DrizzleDealRepository integration test.
 *
 * Verifies the repository round-trips against the live dev DB:
 *   - findById hydrates a Deal aggregate from a real row
 *   - save persists status + currentStep AND inserts outbox events
 *     in a single transaction
 *   - status changes are visible on subsequent findById
 *
 * Each run creates its own throwaway deal so no live data is harmed,
 * and cleans up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { clients, deals, domainEventsOutbox } from "../../shared/schema";
import {
  Deal,
  dealId,
  type DealEvent,
  dealSubmitted,
} from "@dealpad/domain";
import { DrizzleDealRepository } from "@dealpad/infrastructure";

const RUN_TAG = `__test_F1_4_repo_${Date.now()}`;

describe("F1.4.3 — DrizzleDealRepository", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testDealId: number;
  let testClientId: number;
  const repo = new DrizzleDealRepository(db);

  beforeAll(async () => {
    // The outbox table is added by pushSchema() at server boot. The
    // integration test boots routes in-process — not the full server —
    // so we apply the additive DDL ourselves. Idempotent.
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
      CREATE INDEX IF NOT EXISTS domain_events_outbox_unpublished_idx
        ON domain_events_outbox (published_at) WHERE published_at IS NULL;
      CREATE INDEX IF NOT EXISTS domain_events_outbox_aggregate_idx
        ON domain_events_outbox (aggregate_type, aggregate_id);
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
        status: "draft",
        currentStep: 1,
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

  it("findById returns a hydrated aggregate", async () => {
    const found = await repo.findById(dealId(testDealId));
    expect(found).not.toBeNull();
    expect(found!.id).toBe(testDealId);
    expect(found!.status.value).toBe("draft");
    expect(found!.totalFee.toDecimal()).toBe(10000);
    expect(found!.marginPercent.toPercent()).toBeCloseTo(40);
    expect(found!.currentStep).toBe(1);
  });

  it("findById returns null for unknown id", async () => {
    const result = await repo.findById(dealId(999_999_999));
    expect(result).toBeNull();
  });

  it("getById throws DomainError for unknown id", async () => {
    await expect(repo.getById(dealId(999_999_999))).rejects.toThrow(
      /not found/,
    );
    // Code-level assertion (DomainError.code is the structured contract)
    try {
      await repo.getById(dealId(999_999_999));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("deal_not_found");
    }
  });

  it("save persists status changes and writes outbox events atomically", async () => {
    const deal = await repo.getById(dealId(testDealId));
    deal.submit("Alice");
    deal.advanceWizardTo(6);
    const events = deal.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("DealSubmitted");

    const flushed = await repo.save(deal, events);
    expect(flushed).toEqual(events);

    // Status + currentStep persisted on the deal row
    const [row] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, testDealId));
    expect(row.status).toBe("submitted");
    expect(row.currentStep).toBe(6);

    // Outbox row inserted with the right shape
    const outboxRows = await db
      .select()
      .from(domainEventsOutbox)
      .where(eq(domainEventsOutbox.aggregateId, testDealId));
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    const submittedRow = outboxRows.find((r) => r.type === "DealSubmitted");
    expect(submittedRow).toBeTruthy();
    expect(submittedRow!.version).toBe(1);
    expect(submittedRow!.aggregateType).toBe("Deal");
    expect(submittedRow!.publishedAt).toBeNull();
    const payload = submittedRow!.payload as Record<string, unknown>;
    expect(payload.actor).toBe("Alice");
    expect(payload.previousStatus).toBe("draft");
  });

  it("save with zero events is still a valid status-only update", async () => {
    // Reset the deal to draft for a clean flip; we don't pull events
    // so save() should just patch the row.
    await db
      .update(deals)
      .set({ status: "draft", currentStep: 1 })
      .where(eq(deals.id, testDealId));

    const deal = await repo.getById(dealId(testDealId));
    deal.advanceWizardTo(2);
    // No business method called → no events
    const events = deal.pullEvents();
    expect(events).toHaveLength(0);

    await repo.save(deal, events);

    const [row] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, testDealId));
    expect(row.currentStep).toBe(2);
    expect(row.status).toBe("draft");
  });

  it("rejects unknown-status rows up front", async () => {
    // Direct write of a status the domain doesn't recognize so we
    // confirm hydration fails loudly rather than silently accepting it.
    await db
      .update(deals)
      .set({ status: "frobnicated" })
      .where(eq(deals.id, testDealId));
    await expect(repo.findById(dealId(testDealId))).rejects.toThrow(
      /unknown value/,
    );
    // restore so afterAll sees a clean state
    await db
      .update(deals)
      .set({ status: "draft" })
      .where(eq(deals.id, testDealId));
  });
});

describe("F1.4.3 — outbox sanity", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping", () => {});
    return;
  }

  it("table exists with the expected columns", async () => {
    const probe = await db
      .select()
      .from(domainEventsOutbox)
      .where(isNotNull(domainEventsOutbox.id))
      .limit(1);
    expect(Array.isArray(probe)).toBe(true);
    // We don't assert content — just that the query compiles + runs.
  });
});

// Marker for ESLint: dealSubmitted is intentionally exported but unused
// in the current test surface — kept to document the factory is wired
// through the public re-export.
void dealSubmitted;
void ((): DealEvent | null => null);
