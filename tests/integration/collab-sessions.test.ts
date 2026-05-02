/**
 * F3.1.1 — Collaboration sessions integration test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import { clients, collaborationSessions, deals } from "../../shared/schema";

const RUN_TAG = `__test_F3_1_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F3.1.1 — collaboration sessions", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collaboration_sessions (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        document_key TEXT NOT NULL,
        document_state JSONB,
        room_id TEXT NOT NULL,
        presence JSONB,
        last_edited_by TEXT,
        last_edited_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS collab_sessions_deal_key_uniq
        ON collaboration_sessions (deal_id, document_key);
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
        title: `${RUN_TAG} Deal`,
        dealNumber: `DL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        status: "draft",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      await db.delete(collaborationSessions).where(eq(collaborationSessions.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("GET /api/collab/document-keys returns canonical list", async () => {
    const res = await request(app).get("/api/collab/document-keys").set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining(["scope_v1", "pricing_notes_v1"]));
  });

  it("POST /api/deals/:id/collab/sessions allocates a room (first call)", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "scope_v1" });
    expect(res.status).toBe(201);
    expect(res.body.dealId).toBe(testDealId);
    expect(res.body.documentKey).toBe("scope_v1");
    expect(res.body.roomId).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.documentState).toBeNull();
  });

  it("second POST returns the same room (idempotent)", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "scope_v1" });
    const b = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "scope_v1" });
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.roomId).toBe(a.body.roomId);
  });

  it("rejects unknown documentKey + 404 on unknown deal", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "garbage_v1" });
    expect(a.status).toBe(400);
    const b = await request(app)
      .post(`/api/deals/999999999/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "scope_v1" });
    expect(b.status).toBe(404);
  });

  it("POST snapshot persists base64 payload + tags lastEditedBy", async () => {
    const payload = Buffer.from("hello yjs").toString("base64");
    const res = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions/scope_v1/snapshot`)
      .set(HEADERS)
      .send({ payload });
    expect(res.status).toBe(200);
    expect(res.body.documentState.format).toBe("y-update-v1");
    expect(res.body.documentState.payload).toBe(payload);
    expect(res.body.lastEditedBy).toBe(`vitest-${RUN_TAG}`);
    expect(res.body.lastEditedAt).not.toBeNull();
  });

  it("snapshot rejects non-base64 + oversized payloads", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions/scope_v1/snapshot`)
      .set(HEADERS)
      .send({ payload: "not-base64!!" });
    expect(a.status).toBe(400);
    // Body parser cuts in around 100kb (express default), then our
    // route's 4MB cap above that. Either rejection (413 from parser
    // or 400 from us) is acceptable — both are "no, too big".
    const big = "A".repeat(5 * 1024 * 1024); // 5MB
    const b = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions/scope_v1/snapshot`)
      .set(HEADERS)
      .send({ payload: big });
    expect([400, 413]).toContain(b.status);
  });

  it("GET session returns the latest snapshot + presence", async () => {
    await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions/scope_v1/presence`)
      .set(HEADERS)
      .send({ presence: { users: [{ name: "Alice", cursor: 42 }] } });
    const res = await request(app)
      .get(`/api/deals/${testDealId}/collab/sessions/scope_v1`)
      .set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.presence.users[0].name).toBe("Alice");
  });

  it("GET on never-seen documentKey returns 404", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/collab/sessions/approval_thread_v1`)
      .set(HEADERS);
    expect(res.status).toBe(404);
  });

  it("different documentKeys get different rooms on the same deal", async () => {
    const a = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "scope_v1" });
    const b = await request(app)
      .post(`/api/deals/${testDealId}/collab/sessions`)
      .set(HEADERS)
      .send({ documentKey: "pricing_notes_v1" });
    expect(b.body.roomId).not.toBe(a.body.roomId);
    expect(b.body.id).not.toBe(a.body.id);
  });
});
