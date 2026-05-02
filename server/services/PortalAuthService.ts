/**
 * F3.2.1 — Portal magic-link auth.
 *
 * Two-step lifecycle:
 *   1. createInvite()  — random 32-byte token; SHA-256 stored, raw
 *      returned exactly once. Caller is responsible for delivery
 *      (email, in-app copy, etc.).
 *   2. verifyToken()   — constant-time hash compare against the
 *      stored row. Marks status='active' + consumed_at on first
 *      successful verify; subsequent verifies on the same token
 *      keep working until expiresAt as long as status != 'revoked'.
 *
 * Anti-corruption rules:
 *   - Plaintext tokens are NEVER persisted. The DB stores
 *     `token_hash` (SHA-256 hex) + `token_suffix` (last 6 chars,
 *     for debugging "did the right link arrive?").
 *   - `verifyToken` returns null for any invalid input (unknown
 *     hash, revoked, expired) — same shape so callers can't time
 *     attack between failure modes.
 *   - Token TTL defaults to 7 days; configurable per-invite.
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { clients, deals, portalInvites } from "../../shared/schema";

export interface CreateInviteInput {
  clientId: number;
  dealId?: number | null;
  email: string;
  ttlDays?: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateInviteResult {
  inviteId: number;
  token: string;          // RAW — show once; never logged.
  tokenSuffix: string;
  expiresAt: Date;
  email: string;
}

export interface PortalContext {
  inviteId: number;
  clientId: number;
  dealId: number | null;
  email: string;
  expiresAt: Date;
  status: string;
}

const DEFAULT_TTL_DAYS = 7;

export function generateRawToken(): string {
  // 32 bytes of randomness → 64 hex chars. Plenty against brute force.
  return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time hex compare. Both inputs must already be hex
 * strings of equal length; returns false otherwise.
 */
export function constantTimeHexEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // node's timingSafeEqual requires equal-length buffers
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  // Validate FKs cheaply so we fail fast with a clear message.
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
  if (!client) throw new Error(`Client #${input.clientId} not found`);
  if (input.dealId != null) {
    const [deal] = await db.select({ id: deals.id, clientId: deals.clientId }).from(deals).where(eq(deals.id, input.dealId));
    if (!deal) throw new Error(`Deal #${input.dealId} not found`);
    if (deal.clientId !== input.clientId) {
      throw new Error(`Deal #${input.dealId} does not belong to client #${input.clientId}`);
    }
  }

  const ttlDays = Number.isFinite(input.ttlDays as number) && (input.ttlDays as number) > 0
    ? Math.min(90, Math.floor(input.ttlDays as number))
    : DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  // Loop in case of (extremely unlikely) collision on token_hash.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateRawToken();
    const tokenHash = hashToken(token);
    const tokenSuffix = token.slice(-6);
    try {
      const [row] = await db
        .insert(portalInvites)
        .values({
          clientId: input.clientId,
          dealId: input.dealId ?? null,
          email: input.email.trim().toLowerCase(),
          tokenHash,
          tokenSuffix,
          expiresAt,
          status: "pending",
          createdBy: input.createdBy ?? null,
          metadata: input.metadata ?? null,
        })
        .returning();
      return {
        inviteId: row.id,
        token,
        tokenSuffix,
        expiresAt,
        email: row.email,
      };
    } catch (err: unknown) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e?.code === "23505" || e?.cause?.code === "23505") continue; // unique violation, retry
      throw err;
    }
  }
  throw new Error("Failed to allocate a unique portal token after 3 attempts");
}

/**
 * Verify a raw token. Returns the resolved PortalContext on
 * success, or null if the token is unknown / revoked / expired.
 *
 * Side effects on success:
 *   - status flips from 'pending' → 'active' on first verify
 *   - consumedAt + consumedFromIp set on first verify
 *   - subsequent verifies are no-ops on those fields
 */
export async function verifyToken(rawToken: string, opts?: {
  fromIp?: string | null;
  now?: Date;
}): Promise<PortalContext | null> {
  if (typeof rawToken !== "string" || rawToken.length < 16) return null;
  const tokenHash = hashToken(rawToken);
  const [row] = await db.select().from(portalInvites).where(eq(portalInvites.tokenHash, tokenHash));
  if (!row) return null;
  // Constant-time defense in depth — even though SELECT-by-tokenHash
  // already commits to a row, we still confirm to keep behavior
  // identical to "lookup-then-compare" patterns.
  if (!constantTimeHexEq(row.tokenHash, tokenHash)) return null;
  const now = opts?.now ?? new Date();
  if (row.status === "revoked") return null;
  if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) {
    // mark as expired so reporting can rely on the column
    if (row.status !== "expired") {
      await db.update(portalInvites).set({ status: "expired", updatedAt: now }).where(eq(portalInvites.id, row.id));
    }
    return null;
  }
  if (row.status === "pending") {
    await db
      .update(portalInvites)
      .set({
        status: "active",
        consumedAt: now,
        consumedFromIp: opts?.fromIp ?? null,
        updatedAt: now,
      })
      .where(eq(portalInvites.id, row.id));
  }
  return {
    inviteId: row.id,
    clientId: row.clientId,
    dealId: row.dealId,
    email: row.email,
    expiresAt: row.expiresAt,
    status: row.status === "pending" ? "active" : row.status,
  };
}

export async function revokeInvite(inviteId: number, actor?: string): Promise<boolean> {
  const [updated] = await db
    .update(portalInvites)
    .set({ status: "revoked", updatedAt: new Date(), metadata: actor ? { revokedBy: actor } : undefined })
    .where(eq(portalInvites.id, inviteId))
    .returning();
  return !!updated;
}
