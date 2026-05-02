/**
 * F1.1 — Multi-entity routes integration test.
 *
 * Boots the route layer in-process against the live dev DB (no separate test
 * fixture wiring yet — that's slated for F1.4). Every test uses a unique
 * entity name keyed off Date.now() and cleans up after itself, so it
 * doesn't pollute long-lived dev state.
 *
 * Requires DATABASE_URL to be set; if it isn't, the test exits early with
 * a clear message rather than failing on connection refused.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, asc, isNotNull } from "drizzle-orm";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { db } from "../../server/db";
import { deals, dealEntities } from "../../shared/schema";

// Identify our test rows by a unique prefix so cleanup never deletes
// real dev data even if a test crashes mid-run.
const RUN_TAG = `__test_F1_1_${Date.now()}`;

const HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}`,
};

describe("F1.1 — multi-entity routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let dealId: number;

  beforeAll(async () => {
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);

    // Use the lowest-id deal that has at least one entity row. F1.4
    // tests now create their own throwaway deals without entities,
    // and an unordered LIMIT 1 was nondeterministically picking those
    // up. Ordering by id ASC + filtering for an existing entity ties
    // us back to a long-lived seeded deal.
    const seeded = await db
      .select({ id: deals.id })
      .from(deals)
      .innerJoin(dealEntities, eq(dealEntities.dealId, deals.id))
      .where(isNotNull(dealEntities.id))
      .orderBy(asc(deals.id))
      .limit(1);
    if (seeded.length === 0) {
      throw new Error("No deals with entities in DB — run the seed + multi-entity backfill before running F1.1 integration tests.");
    }
    dealId = seeded[0].id;
  });

  afterAll(async () => {
    // Best-effort cleanup: any entity created with our RUN_TAG prefix is
    // ours. Don't fail the suite on cleanup errors.
    try {
      const ours = await db.select({ id: dealEntities.id }).from(dealEntities);
      for (const e of ours) {
        const [row] = await db.select().from(dealEntities).where(eq(dealEntities.id, e.id));
        if (row && row.name.startsWith(RUN_TAG)) {
          await db.delete(dealEntities).where(eq(dealEntities.id, e.id));
        }
      }
    } catch { /* swallow */ }
  });

  it("GET /api/deals/:dealId/entities returns the deal's primary entity (post-backfill)", async () => {
    const res = await request(app).get(`/api/deals/${dealId}/entities`).set(HEADERS);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const primary = res.body.find((e: any) => e.isPrimary);
    expect(primary).toBeTruthy();
    expect(primary.dealId).toBe(dealId);
  });

  it("GET on an unknown deal returns 404", async () => {
    const res = await request(app).get("/api/deals/999999999/entities").set(HEADERS);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("POST /api/deals/:dealId/entities creates a new non-primary entity", async () => {
    const name = `${RUN_TAG}-create`;
    const res = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
      name,
      entityType: "1120",
      jurisdiction: "US-DE",
      sortOrder: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.entityType).toBe("1120");
    expect(res.body.jurisdiction).toBe("US-DE");
    expect(res.body.isPrimary).toBe(false);
    expect(res.body.dealId).toBe(dealId);
  });

  it("POST with duplicate name on same deal returns 409", async () => {
    const name = `${RUN_TAG}-dup`;
    const first = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({ name });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({ name });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("duplicate_entity_name");
  });

  it("POST with empty name returns 400", async () => {
    const res = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("name");
  });

  it("POST with isPrimary=true demotes the previous primary", async () => {
    const name = `${RUN_TAG}-newprimary`;
    const res = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
      name,
      isPrimary: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isPrimary).toBe(true);

    // Old primary should now be demoted.
    const list = await request(app).get(`/api/deals/${dealId}/entities`).set(HEADERS);
    const primaries = list.body.filter((e: any) => e.isPrimary);
    expect(primaries.length).toBe(1);
    expect(primaries[0].id).toBe(res.body.id);

    // Restore the original Primary Entity so later tests + dev see the seed
    // state. Promote whichever non-test entity has the literal name we use
    // in the backfill.
    const seedPrimary = list.body.find((e: any) => e.name === "Primary Entity");
    if (seedPrimary) {
      await request(app).patch(`/api/deal-entities/${seedPrimary.id}`).set(HEADERS).send({ isPrimary: true });
    }
  });

  it("PATCH updates name, type, jurisdiction", async () => {
    const created = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
      name: `${RUN_TAG}-patchme`,
    });
    expect(created.status).toBe(201);

    const renamed = `${RUN_TAG}-patched`;
    const upd = await request(app).patch(`/api/deal-entities/${created.body.id}`).set(HEADERS).send({
      name: renamed,
      entityType: "1065",
      jurisdiction: "UK-LDN",
    });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe(renamed);
    expect(upd.body.entityType).toBe("1065");
    expect(upd.body.jurisdiction).toBe("UK-LDN");
  });

  it("PATCH with empty body returns 400", async () => {
    const created = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
      name: `${RUN_TAG}-emptypatch`,
    });
    const res = await request(app).patch(`/api/deal-entities/${created.body.id}`).set(HEADERS).send({});
    expect(res.status).toBe(400);
  });

  it("DELETE on a primary entity returns 409 (primary_entity_protected)", async () => {
    const list = await request(app).get(`/api/deals/${dealId}/entities`).set(HEADERS);
    const primary = list.body.find((e: any) => e.isPrimary);
    expect(primary).toBeTruthy();
    const res = await request(app).delete(`/api/deal-entities/${primary.id}`).set(HEADERS);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("primary_entity_protected");
  });

  it("DELETE on an unknown entity returns 404", async () => {
    const res = await request(app).delete(`/api/deal-entities/999999999`).set(HEADERS);
    expect(res.status).toBe(404);
  });

  it("DELETE on a clean (no children, non-primary) entity succeeds with 204", async () => {
    const created = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
      name: `${RUN_TAG}-deleteme`,
    });
    expect(created.status).toBe(201);
    const res = await request(app).delete(`/api/deal-entities/${created.body.id}`).set(HEADERS);
    expect(res.status).toBe(204);
    // Confirm gone.
    const after = await db.select().from(dealEntities).where(eq(dealEntities.id, created.body.id));
    expect(after.length).toBe(0);
  });

  it("missing x-user-role header returns 401", async () => {
    const res = await request(app).get(`/api/deals/${dealId}/entities`).set({ "x-user-name": "no-role" });
    expect(res.status).toBe(401);
  });

  it("insufficient role returns 403", async () => {
    const res = await request(app).post(`/api/deals/${dealId}/entities`)
      .set({ "x-user-role": "it", "x-user-name": "it-tester" })
      .send({ name: `${RUN_TAG}-rbac-blocked` });
    expect(res.status).toBe(403);
  });

  // F1.1 slice 3: per-entity hours rollup endpoint.
  describe("GET /api/deals/:dealId/entity-totals", () => {
    it("returns the deal's entities with their hours rollup + a deal total", async () => {
      const res = await request(app).get(`/api/deals/${dealId}/entity-totals`).set(HEADERS);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        entities: expect.any(Array),
        unassignedHours: expect.any(Number),
        totalHours: expect.any(Number),
      });
      // Σ entity hours + unassigned = deal total. Calc-parity invariant.
      const sumOfEntities = res.body.entities.reduce((s: number, e: any) => s + e.totalHours, 0);
      expect(sumOfEntities + res.body.unassignedHours).toBe(res.body.totalHours);
    });

    it("each entity row carries the labels the UI tab strip needs", async () => {
      const res = await request(app).get(`/api/deals/${dealId}/entity-totals`).set(HEADERS);
      expect(res.status).toBe(200);
      // After the F1.1 backfill there's at least one Primary Entity per deal
      // with scope, so the rollup is non-empty as long as the deal has scope.
      if (res.body.entities.length > 0) {
        const e = res.body.entities[0];
        expect(e).toMatchObject({
          entityId: expect.any(Number),
          name: expect.any(String),
          isPrimary: expect.any(Boolean),
          sortOrder: expect.any(Number),
          totalHours: expect.any(Number),
        });
        // entityType + jurisdiction can be null on backfilled rows
        expect("entityType" in e).toBe(true);
        expect("jurisdiction" in e).toBe(true);
      }
    });

    it("entities are ordered primary-first (matches the GET .../entities ordering)", async () => {
      const res = await request(app).get(`/api/deals/${dealId}/entity-totals`).set(HEADERS);
      const entities: any[] = res.body.entities;
      // Once we hit the first non-primary, no later entity may be primary.
      let seenNonPrimary = false;
      for (const e of entities) {
        if (!e.isPrimary) seenNonPrimary = true;
        else expect(seenNonPrimary).toBe(false);
      }
    });

    it("unknown deal returns 404", async () => {
      const res = await request(app).get("/api/deals/999999999/entity-totals").set(HEADERS);
      expect(res.status).toBe(404);
    });
  });

  // F1.1.1 — scope-item routes are now entity-aware: POST accepts an
  // entityId (defaulting to the deal's primary entity), GET accepts
  // ?entityId=N to filter. Validation rejects entity_ids that belong
  // to a different deal.
  describe("F1.1.1 — scope-item entity awareness", () => {
    const createdScopeRowIds: number[] = [];
    let secondaryEntityId: number | null = null;
    let availableScopeItemIds: number[] = [];

    beforeAll(async () => {
      // Find scope-catalog items NOT yet on the test deal. We need fresh
      // ones because dealScopeItems has a unique index on (deal_id,
      // scope_item_id), so re-adding an existing combo just returns the
      // existing row.
      const { scopeCatalog, dealScopeItems } = await import("../../shared/schema");
      const allCatalog = await db.select({ id: scopeCatalog.id, isActive: scopeCatalog.isActive })
        .from(scopeCatalog);
      const onDeal = await db.select({ scopeItemId: dealScopeItems.scopeItemId })
        .from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
      const used = new Set(onDeal.map(r => r.scopeItemId));
      availableScopeItemIds = allCatalog
        .filter(c => c.isActive !== false && !used.has(c.id))
        .map(c => c.id);

      // Create a secondary entity on the test deal — needed so we can
      // verify the POST routes the row to the right one and the GET
      // filter actually filters something.
      const res = await request(app).post(`/api/deals/${dealId}/entities`).set(HEADERS).send({
        name: `${RUN_TAG}-scope-target`,
      });
      if (res.status === 201) secondaryEntityId = res.body.id;
    });

    afterAll(async () => {
      const { dealScopeItems } = await import("../../shared/schema");
      for (const id of createdScopeRowIds) {
        try { await db.delete(dealScopeItems).where(eq(dealScopeItems.id, id)); } catch {}
      }
    });

    it("POST /scope-items defaults entity_id to the deal's primary entity when omitted", async () => {
      if (availableScopeItemIds.length === 0) return; // no fresh catalog ids — skip
      const scopeItemId = availableScopeItemIds.shift()!;
      const res = await request(app).post(`/api/deals/${dealId}/scope-items`).set(HEADERS).send({
        scopeItemId, quantity: 1, complexityMultiplier: "1.0", cascade: false,
      });
      expect(res.status).toBe(201);
      expect(res.body.entityId).toBeTruthy();
      createdScopeRowIds.push(res.body.id);

      // The default should match the primary entity for this deal.
      const list = await request(app).get(`/api/deals/${dealId}/entities`).set(HEADERS);
      const primary = list.body.find((e: any) => e.isPrimary);
      expect(res.body.entityId).toBe(primary.id);
    });

    it("POST /scope-items honors a supplied entityId", async () => {
      if (availableScopeItemIds.length === 0 || !secondaryEntityId) return;
      const scopeItemId = availableScopeItemIds.shift()!;
      const res = await request(app).post(`/api/deals/${dealId}/scope-items`).set(HEADERS).send({
        scopeItemId, quantity: 1, complexityMultiplier: "1.0", cascade: false,
        entityId: secondaryEntityId,
      });
      expect(res.status).toBe(201);
      expect(res.body.entityId).toBe(secondaryEntityId);
      createdScopeRowIds.push(res.body.id);
    });

    it("POST /scope-items rejects an entityId from a different deal (entity_deal_mismatch)", async () => {
      if (availableScopeItemIds.length === 0) return;
      // Find any entity whose deal_id is NOT our test deal.
      const others = await db.select().from(dealEntities);
      const foreign = others.find(e => e.dealId !== dealId);
      if (!foreign) return; // single-deal DB; nothing to assert

      const scopeItemId = availableScopeItemIds[0];
      const res = await request(app).post(`/api/deals/${dealId}/scope-items`).set(HEADERS).send({
        scopeItemId, quantity: 1, complexityMultiplier: "1.0", cascade: false,
        entityId: foreign.id,
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("entity_deal_mismatch");
    });

    it("POST /scope-items rejects malformed entityId", async () => {
      const res = await request(app).post(`/api/deals/${dealId}/scope-items`).set(HEADERS).send({
        scopeItemId: 1, entityId: "not-a-number",
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("entityId");
    });

    it("GET /scope-items?entityId=N filters to that entity only", async () => {
      if (!secondaryEntityId) return;
      const res = await request(app)
        .get(`/api/deals/${dealId}/scope-items?entityId=${secondaryEntityId}`)
        .set(HEADERS);
      expect(res.status).toBe(200);
      // Every returned row must belong to the secondary entity.
      for (const row of res.body) {
        expect(row.entityId).toBe(secondaryEntityId);
      }
    });

    it("GET /scope-items rejects garbage entityId", async () => {
      const res = await request(app)
        .get(`/api/deals/${dealId}/scope-items?entityId=oops`)
        .set(HEADERS);
      expect(res.status).toBe(400);
    });

    it("GET /scope-items without entityId returns the full deal list (legacy behavior)", async () => {
      const filtered = await request(app)
        .get(`/api/deals/${dealId}/scope-items?entityId=${secondaryEntityId ?? 0}`)
        .set(HEADERS);
      const all = await request(app).get(`/api/deals/${dealId}/scope-items`).set(HEADERS);
      expect(all.status).toBe(200);
      expect(filtered.body.length).toBeLessThanOrEqual(all.body.length);
    });
  });
});
