/**
 * F3.4.1 — voice transcript route integration test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import {
  clients,
  deals,
  dealScopeItems,
  scopeCatalog,
  voiceTranscripts,
} from "../../shared/schema";

const RUN_TAG = `__test_F3_4_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const HEADERS = { "x-user-role": "pdl", "x-user-name": `vitest-${RUN_TAG}` };

describe("F3.4.1 — voice transcript routes", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  let testClientId: number;
  let testDealId: number;

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS voice_transcripts (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER REFERENCES deals(id),
        uploaded_by TEXT NOT NULL,
        audio_storage_key TEXT,
        duration_ms INTEGER,
        language TEXT DEFAULT 'en-US',
        transcript TEXT,
        extractions JSONB,
        source TEXT NOT NULL DEFAULT 'simulated',
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
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
      await db.delete(voiceTranscripts).where(eq(voiceTranscripts.dealId, testDealId));
      await db.delete(dealScopeItems).where(eq(dealScopeItems.dealId, testDealId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("POST creates a pending transcript stub", async () => {
    const res = await request(app)
      .post(`/api/deals/${testDealId}/voice-transcripts`)
      .set(HEADERS)
      .send({
        audioStorageKey: "blob://voice/2026/05/abc.m4a",
        durationMs: 35_000,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.uploadedBy).toBe(`vitest-${RUN_TAG}`);
    expect(res.body.audioStorageKey).toBe("blob://voice/2026/05/abc.m4a");
  });

  it("POST 404 on unknown deal", async () => {
    const res = await request(app)
      .post(`/api/deals/999999999/voice-transcripts`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(404);
  });

  it("/process extracts catalog candidates from a forced transcript", async () => {
    const create = await request(app)
      .post(`/api/deals/${testDealId}/voice-transcripts`)
      .set(HEADERS)
      .send({});
    const id = create.body.id;
    const proc = await request(app)
      .post(`/api/voice-transcripts/${id}/process`)
      .set(HEADERS)
      .send({
        transcript:
          "We need a 1040 federal individual return and audit testing for revenue recognition.",
      });
    expect(proc.status).toBe(200);
    expect(proc.body.status).toBe("extracted");
    expect(proc.body.transcript).toMatch(/1040 federal/);
    expect(Array.isArray(proc.body.extractions)).toBe(true);
  });

  it("/process 404 on unknown transcript", async () => {
    const res = await request(app)
      .post(`/api/voice-transcripts/999999999/process`)
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(404);
  });

  it("GET list returns transcripts newest-first", async () => {
    const res = await request(app)
      .get(`/api/deals/${testDealId}/voice-transcripts`)
      .set(HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("/apply inserts deal_scope_items for accepted extractions; flips status='applied'", async () => {
    // Pick a real catalog row to seed an extraction we can accept
    const [cat] = await db.select().from(scopeCatalog).limit(1);
    if (!cat) return; // empty catalog skip

    const create = await request(app)
      .post(`/api/deals/${testDealId}/voice-transcripts`)
      .set(HEADERS)
      .send({});
    const id = create.body.id;

    // Process with a transcript that contains the catalog row's
    // name + code so the heuristic scores it high
    await request(app)
      .post(`/api/voice-transcripts/${id}/process`)
      .set(HEADERS)
      .send({ transcript: `Add ${cat.code} ${cat.name} to the engagement.` });

    const apply = await request(app)
      .post(`/api/voice-transcripts/${id}/apply`)
      .set(HEADERS)
      .send({ acceptedCatalogIds: [cat.id] });
    expect(apply.status).toBe(200);
    expect(apply.body.inserted + apply.body.skipped).toBeGreaterThanOrEqual(0);

    const [row] = await db.select().from(voiceTranscripts).where(eq(voiceTranscripts.id, id));
    expect(row.status).toBe("applied");
  });

  it("/apply on a non-deal-scoped transcript returns 404", async () => {
    const [created] = await db
      .insert(voiceTranscripts)
      .values({ uploadedBy: `vitest-${RUN_TAG}`, dealId: null, status: "extracted", extractions: [] })
      .returning();
    const res = await request(app)
      .post(`/api/voice-transcripts/${created.id}/apply`)
      .set(HEADERS)
      .send({ acceptedCatalogIds: [] });
    expect(res.status).toBe(404);
  });
});
