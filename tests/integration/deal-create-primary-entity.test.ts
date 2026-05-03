/**
 * Regression: every deal-create path must leave a Primary Entity row
 * behind. Without this, deals created mid-server-life (CRM import,
 * agent draft, manual create, clone) had no entity until the next
 * server restart fired the F1.1 backfill — and the EntityTabs UI
 * showed an empty tab strip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, deals, dealEntities, dynamicsOpportunities } from "../../shared/schema";

const RUN_TAG = `__test_entity_seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("deal-create paths auto-seed a Primary Entity", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  const ownedDealIds: number[] = [];
  const ownedOppIds: number[] = [];

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    try {
      if (ownedOppIds.length) {
        await db.delete(dynamicsOpportunities).where(inArray(dynamicsOpportunities.id, ownedOppIds));
      }
      if (ownedDealIds.length) {
        await db.delete(dealEntities).where(inArray(dealEntities.dealId, ownedDealIds));
        await db.delete(deals).where(inArray(deals.id, ownedDealIds));
      }
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  async function expectPrimaryEntity(dealId: number) {
    const rows = await db
      .select()
      .from(dealEntities)
      .where(eq(dealEntities.dealId, dealId));
    const primary = rows.find((r) => r.isPrimary);
    expect(primary).toBeTruthy();
    expect(primary!.name).toBe("Primary Entity");
    expect(primary!.dealId).toBe(dealId);
  }

  it("POST /api/deals seeds Primary Entity", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set(HEADERS)
      .send({
        title: `${RUN_TAG} Manual Deal`,
        clientId: testClientId,
        status: "draft",
        dealType: "new",
      });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const dealId = res.body.id;
    ownedDealIds.push(dealId);
    await expectPrimaryEntity(dealId);
  });

  it("POST /api/deals/:id/clone seeds Primary Entity on the clone", async () => {
    // Create the source first
    const src = await request(app)
      .post("/api/deals")
      .set(HEADERS)
      .send({
        title: `${RUN_TAG} Source Deal`,
        clientId: testClientId,
        status: "approved",
        dealType: "new",
      });
    ownedDealIds.push(src.body.id);

    const cloned = await request(app)
      .post(`/api/deals/${src.body.id}/clone`)
      .set(HEADERS)
      .send({ mode: "renewal" });
    expect(cloned.status).toBeGreaterThanOrEqual(200);
    expect(cloned.status).toBeLessThan(300);
    ownedDealIds.push(cloned.body.id);
    await expectPrimaryEntity(cloned.body.id);
  });

  it("POST /api/dynamics/opportunities/:id/import seeds Primary Entity on the new deal", async () => {
    // Build a synthetic opportunity row pointing at our test client.
    // The Dynamics seed needs an account row to exist for clientId lookup;
    // we sidestep that path by using accountName-based fallback in import.
    const [opp] = await db
      .insert(dynamicsOpportunities)
      .values({
        dynamicsId: `dyn-${RUN_TAG}`,
        opportunityNumber: `OPP-${RUN_TAG.slice(0, 12)}`,
        name: `${RUN_TAG} Imported Opp`,
        accountName: `${RUN_TAG} Client`,
        estimatedValue: "50000",
        stage: "Develop",
        probability: 40,
      })
      .returning();
    ownedOppIds.push(opp.id);

    const imported = await request(app)
      .post(`/api/dynamics/opportunities/${opp.id}/import`)
      .set({ ...HEADERS, "x-user-role": "pdl" })
      .send({});
    expect(imported.status).toBeGreaterThanOrEqual(200);
    expect(imported.status).toBeLessThan(300);
    // Import endpoint returns { success, dealId, dealNumber } — flat shape
    const dealId = imported.body.dealId;
    expect(dealId).toBeTruthy();
    ownedDealIds.push(dealId);
    await expectPrimaryEntity(dealId);
  });

  it("ensurePrimaryEntity is idempotent", async () => {
    const { ensurePrimaryEntity } = await import("../../server/lib/dealEntityHelpers");
    // Pick the first deal we made
    const dealId = ownedDealIds[0];
    const a = await ensurePrimaryEntity(dealId);
    const b = await ensurePrimaryEntity(dealId);
    expect(a.created).toBe(false); // already seeded by the route
    expect(b.created).toBe(false);
    expect(a.id).toBe(b.id);
    // And exactly one primary remains
    const rows = await db
      .select()
      .from(dealEntities)
      .where(eq(dealEntities.dealId, dealId));
    expect(rows.filter((r) => r.isPrimary).length).toBe(1);
  });
});
