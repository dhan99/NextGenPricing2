/**
 * Regression: a scope_item can appear once *per entity* on a deal.
 * Before this fix, the unique index (deal_id, scope_item_id) blocked
 * a second entity from carrying the same scope_item.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, dealEntities, deals, dealScopeItems, scopeCatalog } from "../../shared/schema";

const RUN_TAG = `__test_scope_per_entity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("scope items can repeat per-entity", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;
  let entityAId: number;
  let entityBId: number;
  let scopeCatalogId: number;

  beforeAll(async () => {
    // Apply the migration locally (idempotent in case pushSchema hasn't run since)
    await pool.query(`
      DROP INDEX IF EXISTS deal_scope_items_deal_item_uniq;
      CREATE UNIQUE INDEX IF NOT EXISTS deal_scope_items_deal_entity_item_uniq
        ON deal_scope_items (deal_id, entity_id, scope_item_id);
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

    const dealRes = await request(app)
      .post("/api/deals")
      .set(HEADERS)
      .send({
        title: `${RUN_TAG} Deal`,
        clientId: testClientId,
        status: "draft",
        dealType: "new",
      });
    testDealId = dealRes.body.id;

    // Add a second entity (PR #52 already auto-seeded the primary)
    const entRes = await request(app)
      .post(`/api/deals/${testDealId}/entities`)
      .set(HEADERS)
      .send({ name: "Entity B" });
    entityBId = entRes.body.id;

    const [primary] = await db
      .select()
      .from(dealEntities)
      .where(eq(dealEntities.dealId, testDealId));
    entityAId = primary.id;

    // Pick any active catalog row
    const [cat] = await db.select().from(scopeCatalog).limit(1);
    if (!cat) throw new Error("scope_catalog is empty — seed needed");
    scopeCatalogId = cat.id;
  });

  afterAll(async () => {
    try {
      await db.delete(dealScopeItems).where(eq(dealScopeItems.dealId, testDealId));
      await db.delete(dealEntities).where(eq(dealEntities.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("adds the same scope item once to each entity (no duplicate flag)", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/scope-items`)
      .set(HEADERS)
      .send({
        scopeItemId: scopeCatalogId,
        adjustedHours: "8",
        complexityMultiplier: "1.0",
        entityId: entityAId,
        cascade: false,
      });
    expect(a.status).toBeGreaterThanOrEqual(200);
    expect(a.body.duplicate).toBeFalsy();
    expect(a.body.entityId).toBe(entityAId);

    const b = await request(app)
      .post(`/api/deals/${testDealId}/scope-items`)
      .set(HEADERS)
      .send({
        scopeItemId: scopeCatalogId,
        adjustedHours: "12",
        complexityMultiplier: "1.0",
        entityId: entityBId,
        cascade: false,
      });
    expect(b.status).toBeGreaterThanOrEqual(200);
    expect(b.body.duplicate).toBeFalsy();
    expect(b.body.entityId).toBe(entityBId);
    expect(b.body.id).not.toBe(a.body.id);
  });

  it("re-adding to the same entity is detected as duplicate", async () => {
    const dup = await request(app)
      .post(`/api/deals/${testDealId}/scope-items`)
      .set(HEADERS)
      .send({
        scopeItemId: scopeCatalogId,
        adjustedHours: "999",
        complexityMultiplier: "1.0",
        entityId: entityAId,
        cascade: false,
      });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);
    expect(dup.body.entityId).toBe(entityAId);
  });

  it("GET /scope-items?entityId narrows correctly", async () => {
    const aOnly = await request(app)
      .get(`/api/deals/${testDealId}/scope-items?entityId=${entityAId}`)
      .set(HEADERS);
    expect(aOnly.status).toBe(200);
    for (const r of aOnly.body) expect(r.entityId).toBe(entityAId);

    const bOnly = await request(app)
      .get(`/api/deals/${testDealId}/scope-items?entityId=${entityBId}`)
      .set(HEADERS);
    for (const r of bOnly.body) expect(r.entityId).toBe(entityBId);

    // Both entities have at least one row each
    expect(aOnly.body.length).toBeGreaterThanOrEqual(1);
    expect(bOnly.body.length).toBeGreaterThanOrEqual(1);
  });

  it("DB-level: the new index allows the same scope_item across entities", async () => {
    const rows = await db
      .select()
      .from(dealScopeItems)
      .where(eq(dealScopeItems.dealId, testDealId));
    const sameItemRows = rows.filter((r) => r.scopeItemId === scopeCatalogId);
    expect(sameItemRows.length).toBe(2);
    const entityIds = sameItemRows.map((r) => r.entityId).sort();
    expect(entityIds).toEqual([entityAId, entityBId].sort());
  });
});
