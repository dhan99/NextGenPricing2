/**
 * F3.2.2 — /api/portal/* + admin invite routes integration test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, deals, portalInvites, dealScopeItems, scopeCatalog } from "../../shared/schema";

const RUN_TAG = `__test_F3_2_2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const PDL_HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F3.2.2 — portal routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_invites (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        deal_id INTEGER REFERENCES deals(id),
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        token_suffix TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by TEXT,
        consumed_at TIMESTAMP,
        consumed_from_ip TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS portal_invites_token_hash_uniq ON portal_invites (token_hash);
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
    const [deal] = await db
      .insert(deals)
      .values({
        title: `${RUN_TAG} Portal Deal`,
        dealNumber: `DL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        status: "approved",
        businessUnit: "Tax Services",
        serviceLine: "Compliance",
      })
      .returning();
    testDealId = deal.id;

    // Add one scope item so /api/portal/scope returns data
    const [anyCatalog] = await db.select().from(scopeCatalog).limit(1);
    if (anyCatalog) {
      await db.insert(dealScopeItems).values({
        dealId: deal.id,
        scopeItemId: anyCatalog.id,
        adjustedHours: "8",
        quantity: 1,
        complexityMultiplier: "1.0",
      });
    }
  });

  afterAll(async () => {
    try {
      await db.delete(portalInvites).where(eq(portalInvites.clientId, testClientId));
      await db.delete(dealScopeItems).where(eq(dealScopeItems.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("POST /api/deals/:id/portal-invites returns the raw token once", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "client@example.com", ttlDays: 7 });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.email).toBe("client@example.com");
    expect(res.body.tokenSuffix.length).toBe(6);
  });

  it("POST rejects bad email + 404 on unknown deal", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "not-an-email" });
    expect(a.status).toBe(400);
    const b = await request(app)
      .post(`/api/deals/999999999/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "x@y.com" });
    expect(b.status).toBe(404);
  });

  it("GET /api/deals/:id/portal-invites lists invites without leaking token_hash", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const r of res.body) {
      expect(r).not.toHaveProperty("tokenHash");
      expect(r).not.toHaveProperty("token");
      expect(r.tokenSuffix.length).toBe(6);
    }
  });

  it("portal endpoints reject missing or invalid token with 401", async () => {
    const a = await request(app).get("/api/portal/me");
    expect(a.status).toBe(401);
    expect(a.body.code).toBe("portal_token_missing");
    const b = await request(app).get("/api/portal/me?token=garbage-not-a-real-token");
    expect(b.status).toBe(401);
    expect(b.body.code).toBe("portal_token_invalid");
  });

  it("portal/me returns clientId + dealId scope from a valid token", async () => {
    const create = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "valid@example.com" });
    const token = create.body.token;
    const res = await request(app).get("/api/portal/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBe(testClientId);
    expect(res.body.dealId).toBe(testDealId);
    expect(res.body.email).toBe("valid@example.com");
  });

  it("portal/deal returns scoped deal facts", async () => {
    const create = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "deal@example.com" });
    const token = create.body.token;
    const res = await request(app).get("/api/portal/deal").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testDealId);
    expect(res.body.businessUnit).toBe("Tax Services");
    // No internal-only fields
    expect(res.body.engagementInputs).toBeUndefined();
    expect(res.body.embedding).toBeUndefined();
  });

  it("portal/scope returns the scope list scoped to the invite", async () => {
    const create = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "scope@example.com" });
    const token = create.body.token;
    const res = await request(app).get(`/api/portal/scope?token=${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("DELETE invite revokes; subsequent token use returns 401", async () => {
    const create = await request(app)
      .post(`/api/deals/${testDealId}/portal-invites`)
      .set(PDL_HEADERS)
      .send({ email: "revoke@example.com" });
    const inviteId = create.body.inviteId;
    const token = create.body.token;
    const del = await request(app).delete(`/api/portal-invites/${inviteId}`).set(PDL_HEADERS);
    expect(del.status).toBe(200);
    expect(del.body.revoked).toBe(true);
    const ping = await request(app).get("/api/portal/me").set("Authorization", `Bearer ${token}`);
    expect(ping.status).toBe(401);
  });

  it("DELETE 404 on unknown invite", async () => {
    const res = await request(app).delete(`/api/portal-invites/999999999`).set(PDL_HEADERS);
    expect(res.status).toBe(404);
  });
});
