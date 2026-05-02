/**
 * F3.2.1 — PortalAuthService integration test.
 *
 * Pins create / verify / revoke / expiry behaviors against the
 * live DB. Constant-time hex compare + plaintext-never-stored
 * are unit-tested in tests/portal/.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { clients, deals, portalInvites } from "../../shared/schema";
import {
  createInvite,
  verifyToken,
  revokeInvite,
  hashToken,
} from "../../server/services/PortalAuthService";

const RUN_TAG = `__test_F3_2_1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("F3.2.1 — PortalAuthService (DB integration)", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let testClientId: number;
  let testDealId: number;
  const inviteIds: number[] = [];

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
        status: "approved",
      })
      .returning();
    testDealId = deal.id;
  });

  afterAll(async () => {
    try {
      if (inviteIds.length) {
        await db.delete(portalInvites).where(inArray(portalInvites.id, inviteIds));
      }
      await db.delete(portalInvites).where(eq(portalInvites.clientId, testClientId));
      await db.delete(deals).where(eq(deals.id, testDealId));
      await db.delete(clients).where(eq(clients.id, testClientId));
    } catch { /* swallow */ }
  });

  it("createInvite stores hash, NOT plaintext; returns raw token once", async () => {
    const r = await createInvite({
      clientId: testClientId,
      dealId: testDealId,
      email: "client@example.com",
      ttlDays: 1,
      createdBy: `vitest-${RUN_TAG}`,
    });
    inviteIds.push(r.inviteId);
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r.tokenSuffix).toBe(r.token.slice(-6));
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // The plaintext is NEVER in the DB row
    const [row] = await db.select().from(portalInvites).where(eq(portalInvites.id, r.inviteId));
    expect(row.tokenHash).toBe(hashToken(r.token));
    expect(JSON.stringify(row)).not.toContain(r.token);
    expect(row.email).toBe("client@example.com");
    expect(row.status).toBe("pending");
  });

  it("verifyToken flips pending → active on first verify; returns context", async () => {
    const r = await createInvite({
      clientId: testClientId,
      dealId: testDealId,
      email: "VERIFY@EXAMPLE.com",
      ttlDays: 7,
    });
    inviteIds.push(r.inviteId);

    const ctx = await verifyToken(r.token, { fromIp: "203.0.113.7" });
    expect(ctx).not.toBeNull();
    expect(ctx!.clientId).toBe(testClientId);
    expect(ctx!.dealId).toBe(testDealId);
    expect(ctx!.email).toBe("verify@example.com"); // lowercased
    expect(ctx!.status).toBe("active");

    const [row] = await db.select().from(portalInvites).where(eq(portalInvites.id, r.inviteId));
    expect(row.status).toBe("active");
    expect(row.consumedAt).not.toBeNull();
    expect(row.consumedFromIp).toBe("203.0.113.7");

    // Second verify: still works, status stays active, consumedAt unchanged
    const ctx2 = await verifyToken(r.token, { fromIp: "203.0.113.99" });
    expect(ctx2).not.toBeNull();
    const [row2] = await db.select().from(portalInvites).where(eq(portalInvites.id, r.inviteId));
    expect(row2.consumedFromIp).toBe("203.0.113.7"); // unchanged
  });

  it("verifyToken rejects unknown / revoked / malformed tokens with null", async () => {
    expect(await verifyToken("not-a-token")).toBeNull();
    expect(await verifyToken("")).toBeNull();
    expect(await verifyToken("a".repeat(64))).toBeNull();

    const r = await createInvite({
      clientId: testClientId,
      dealId: testDealId,
      email: "revoke@example.com",
      ttlDays: 7,
    });
    inviteIds.push(r.inviteId);
    await revokeInvite(r.inviteId, `vitest-${RUN_TAG}`);
    expect(await verifyToken(r.token)).toBeNull();
  });

  it("verifyToken treats expired invites as null AND marks them expired", async () => {
    const r = await createInvite({
      clientId: testClientId,
      dealId: testDealId,
      email: "expired@example.com",
      ttlDays: 1,
    });
    inviteIds.push(r.inviteId);
    // Backdate expires_at directly so we don't have to wait
    await db
      .update(portalInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(portalInvites.id, r.inviteId));
    const ctx = await verifyToken(r.token);
    expect(ctx).toBeNull();
    const [row] = await db.select().from(portalInvites).where(eq(portalInvites.id, r.inviteId));
    expect(row.status).toBe("expired");
  });

  it("createInvite rejects mismatched client/deal", async () => {
    // Create a second client + deal so we can construct a mismatch
    const [otherClient] = await db
      .insert(clients)
      .values({ name: `${RUN_TAG} Other Client`, industry: "Test" })
      .returning();
    try {
      await expect(
        createInvite({
          clientId: otherClient.id,
          dealId: testDealId, // belongs to testClientId, not otherClient
          email: "mismatch@example.com",
        }),
      ).rejects.toThrow(/does not belong/);
    } finally {
      await db.delete(clients).where(eq(clients.id, otherClient.id));
    }
  });
});
