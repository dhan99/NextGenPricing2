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
import { eq } from "drizzle-orm";
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

    // Use any existing seeded deal — these tests don't need a private deal,
    // they just need a valid deal_id to scope entity rows under. We never
    // mutate the deal itself.
    const [first] = await db.select({ id: deals.id }).from(deals).limit(1);
    if (!first) {
      throw new Error("No deals in DB — run the seed before running F1.1 integration tests.");
    }
    dealId = first.id;
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
});
