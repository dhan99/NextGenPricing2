/**
 * F1.2 — assembly route integration tests.
 *
 * Boots the route layer in-process. Creates a minimal assembly
 * template + components against the live dev DB, exercises the four
 * endpoints, and cleans up after itself. Same shape as
 * tests/integration/multi-entity.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { db } from "../../server/db";
import {
  deals, dealEntities, dealScopeItems,
  assemblyTemplates, assemblyComponents,
  scopeCatalog,
} from "../../shared/schema";

const RUN_TAG = `__test_F1_2_${Date.now()}`;
const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F1.2 — assembly routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let dealId: number;
  let assemblyScopeId: number;
  let leafIds: number[] = [];
  let templateId: number;
  let componentIds: number[] = [];
  const createdScopeRowIds: number[] = [];

  beforeAll(async () => {
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);

    const [first] = await db.select({ id: deals.id }).from(deals).limit(1);
    if (!first) throw new Error("No deals in DB — run the seed first");
    dealId = first.id;

    // Need a scope_catalog "assembly" row to attach the template to,
    // plus 3 leaves the template will reference. Reuse whatever the
    // seed has — if none of the leaves are unused on this deal we
    // pick three at random; the (deal_id, scope_item_id) unique guard
    // means we just see "skipped: duplicate" for any that collide.
    const allCatalog = await db.select().from(scopeCatalog);
    const assemblyRow = allCatalog.find((c) => c.isAssembly);
    if (!assemblyRow) throw new Error("Seed has no isAssembly scope_catalog row");
    assemblyScopeId = assemblyRow.id;

    const usedOnDeal = new Set(
      (await db.select({ id: dealScopeItems.scopeItemId })
        .from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId)))
        .map((r) => r.id),
    );
    const candidateLeaves = allCatalog
      .filter((c) => !c.isAssembly && c.isActive !== false && !usedOnDeal.has(c.id))
      .slice(0, 3);
    if (candidateLeaves.length < 3) {
      // Fall back to any 3 active non-assembly rows — duplicates will be
      // surfaced as `skipped` in the apply test.
      const fallback = allCatalog.filter((c) => !c.isAssembly && c.isActive !== false).slice(0, 3);
      leafIds = fallback.map((c) => c.id);
    } else {
      leafIds = candidateLeaves.map((c) => c.id);
    }

    // Seed a template + 3 components. The template must be unique per
    // scope_item_id (DB unique constraint); if a previous run left a
    // template on assemblyScopeId, reuse it.
    const [existing] = await db.select().from(assemblyTemplates)
      .where(eq(assemblyTemplates.scopeItemId, assemblyScopeId));
    if (existing) {
      templateId = existing.id;
    } else {
      const [t] = await db.insert(assemblyTemplates).values({
        scopeItemId: assemblyScopeId,
        name: `${RUN_TAG}-tpl`,
        description: "F1.2 integration test template",
        serviceLine: "Tax-PHB",
        version: 1,
        isActive: true,
      }).returning();
      templateId = t.id;
    }

    // Wipe any prior components for this template so the test starts clean.
    await db.delete(assemblyComponents).where(eq(assemblyComponents.templateId, templateId));

    const inserted = await db.insert(assemblyComponents).values([
      {
        templateId, scopeItemId: leafIds[0],
        ultimateTierOverride: "12.5", enhancedTierOverride: "10", essentialTierOverride: "8",
        // Constant formula — the integration test should be independent
        // of whatever engagementInputs the test deal has. The math.js
        // sandbox covers identifier-bound formulas in tests/assembly/.
        quantityFormula: "3", sortOrder: 1,
      },
      {
        templateId, scopeItemId: leafIds[1],
        ultimateTierOverride: null, enhancedTierOverride: null, essentialTierOverride: null,
        quantityFormula: "1 + 1", sortOrder: 2,  // constant formula = 2
      },
      {
        templateId, scopeItemId: leafIds[2],
        ultimateTierOverride: null, enhancedTierOverride: null, essentialTierOverride: null,
        quantityFormula: null, sortOrder: 3,  // null formula = 1
      },
    ]).returning();
    componentIds = inserted.map((r) => r.id);
  });

  afterAll(async () => {
    try {
      // Order matters: components → template → scope rows we inserted.
      await db.delete(assemblyComponents).where(inArray(assemblyComponents.id, componentIds));
      await db.delete(assemblyTemplates).where(eq(assemblyTemplates.id, templateId));
      for (const id of createdScopeRowIds) {
        await db.delete(dealScopeItems).where(eq(dealScopeItems.id, id));
      }
    } catch { /* swallow */ }
  });

  it("GET /api/assemblies lists active templates", async () => {
    const res = await request(app).get("/api/assemblies").set(HEADERS);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ours = res.body.find((r: any) => r.id === templateId);
    expect(ours).toBeTruthy();
    expect(ours.name).toBe(`${RUN_TAG}-tpl`);
    expect(ours.assemblyCode).toBeTruthy(); // joined from scope_catalog
  });

  it("GET /api/assemblies/:id/components returns components for the template", async () => {
    const res = await request(app).get(`/api/assemblies/${templateId}/components`).set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe(templateId);
    expect(res.body.components.length).toBe(3);
    // Sorted by sortOrder.
    expect(res.body.components[0].sortOrder).toBe(1);
    expect(res.body.components[2].sortOrder).toBe(3);
  });

  it("GET /api/assemblies/:id/components 404s for unknown id", async () => {
    const res = await request(app).get("/api/assemblies/999999999/components").set(HEADERS);
    expect(res.status).toBe(404);
  });

  it("POST /api/assemblies/:id/expand previews without inserting", async () => {
    const before = await db.select({ c: dealScopeItems.id }).from(dealScopeItems)
      .where(eq(dealScopeItems.dealId, dealId));
    const res = await request(app).post(`/api/assemblies/${templateId}/expand`).set(HEADERS).send({
      dealId, tier: "ultimate",
    });
    expect(res.status).toBe(200);
    expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.totalHours).toBe("number");

    // No DB writes should have happened.
    const after = await db.select({ c: dealScopeItems.id }).from(dealScopeItems)
      .where(eq(dealScopeItems.dealId, dealId));
    expect(after.length).toBe(before.length);
  });

  it("POST /api/assemblies/:id/expand requires dealId", async () => {
    const res = await request(app).post(`/api/assemblies/${templateId}/expand`).set(HEADERS).send({});
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("dealId");
  });

  it("POST /api/deals/:dealId/scope-items/from-assembly inserts + recalcs", async () => {
    const res = await request(app)
      .post(`/api/deals/${dealId}/scope-items/from-assembly`)
      .set(HEADERS)
      .send({ assemblyTemplateId: templateId, tier: "ultimate" });
    expect(res.status).toBe(201);
    // Some rows may collide with existing deal_scope_items (the unique
    // index on deal_id+scope_item_id); collisions get reported as
    // skipped, the rest are inserted.
    const totalReported = res.body.inserted.length + res.body.skipped.length;
    expect(totalReported).toBe(res.body.expanded.length);
    for (const row of res.body.inserted) {
      createdScopeRowIds.push(row.id);
      // Notes should reference the source assembly.
      expect(row.notes).toMatch(new RegExp(`From assembly ${RUN_TAG}-tpl`));
    }
  });

  it("POST /api/deals/:dealId/scope-items/from-assembly rejects unknown template", async () => {
    const res = await request(app)
      .post(`/api/deals/${dealId}/scope-items/from-assembly`)
      .set(HEADERS)
      .send({ assemblyTemplateId: 999999999, tier: "ultimate" });
    expect(res.status).toBe(404);
  });

  it("POST /from-assembly rejects entityId from a different deal", async () => {
    const others = await db.select().from(dealEntities);
    const foreign = others.find((e) => e.dealId !== dealId);
    if (!foreign) return; // single-deal DB, skip
    const res = await request(app)
      .post(`/api/deals/${dealId}/scope-items/from-assembly`)
      .set(HEADERS)
      .send({ assemblyTemplateId: templateId, entityId: foreign.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("entity_deal_mismatch");
  });

  it("expand 400s with code:expansion_error when a component formula is malicious", async () => {
    // Patch one component to a bad formula, run expand, restore.
    await db.update(assemblyComponents)
      .set({ quantityFormula: "evaluate('1+1')" })
      .where(eq(assemblyComponents.id, componentIds[1]));
    try {
      const res = await request(app)
        .post(`/api/assemblies/${templateId}/expand`)
        .set(HEADERS)
        .send({ dealId, tier: "ultimate" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("expansion_error");
    } finally {
      await db.update(assemblyComponents)
        .set({ quantityFormula: "1 + 1" })
        .where(eq(assemblyComponents.id, componentIds[1]));
    }
  });
});
