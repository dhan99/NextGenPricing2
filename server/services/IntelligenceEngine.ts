/**
 * F2.1.3 — DealPad Intelligence Engine.
 *
 * Computes deal fingerprints + embeddings and runs k-NN similarity
 * search against the `deals.embedding` column added in F2.1.2.
 *
 * Modes (selected by `INTELLIGENCE_MODE`, default `simulated`):
 *
 *   - `simulated` — fully local, deterministic. Hashes each token of
 *     a deal's text representation into a 1536-d vector and averages.
 *     Same input → same vector; overlapping tokens → higher cosine
 *     similarity. Good enough for the wiring to be exercised end-to-
 *     end without an API key.
 *
 *   - `openai` — calls the OpenAI embeddings API. Requires
 *     OPENAI_API_KEY. Stub here; production wiring lands in the slice
 *     that swaps to a real Python ml-service.
 *
 * Anti-corruption: this module is the only place that knows how to
 * derive a fingerprint or embedding for a deal. Routes call into it;
 * never hand-roll the math elsewhere.
 */
import { eq, sql, and, ne, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { deals, dealScopeItems, scopeCatalog } from "../../shared/schema";

const EMBEDDING_DIM = 1536;
const MODE = (process.env.INTELLIGENCE_MODE || "simulated") as
  | "simulated"
  | "openai";

export type DealFingerprint = {
  bu: string | null;
  serviceLine: string | null;
  region: string | null;
  complexity: string | null;
  scopeItemCount: number;
  feeBucket:
    | "under_25k"
    | "25k_50k"
    | "50k_100k"
    | "100k_250k"
    | "250k_500k"
    | "over_500k"
    | "unknown";
  marginBucket:
    | "under_20"
    | "20_30"
    | "30_40"
    | "40_50"
    | "over_50"
    | "unknown";
  computedAt: string;
  mode: "simulated" | "openai";
};

function bucketFee(totalFee: string | null | undefined): DealFingerprint["feeBucket"] {
  if (totalFee == null || totalFee === "") return "unknown";
  const n = parseFloat(totalFee);
  if (!Number.isFinite(n)) return "unknown";
  if (n < 25_000) return "under_25k";
  if (n < 50_000) return "25k_50k";
  if (n < 100_000) return "50k_100k";
  if (n < 250_000) return "100k_250k";
  if (n < 500_000) return "250k_500k";
  return "over_500k";
}

function bucketMargin(marginPercent: string | null | undefined): DealFingerprint["marginBucket"] {
  if (marginPercent == null || marginPercent === "") return "unknown";
  const n = parseFloat(marginPercent);
  if (!Number.isFinite(n)) return "unknown";
  if (n < 20) return "under_20";
  if (n < 30) return "20_30";
  if (n < 40) return "30_40";
  if (n < 50) return "40_50";
  return "over_50";
}

/**
 * 32-bit FNV-1a hash for a string. Stable across Node versions and
 * platforms — what we need for "same input → same vector".
 */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Seeded LCG → unit vector of given dimension. Deterministic by seed.
 */
function seededUnitVector(seed: number, dim: number): number[] {
  const out = new Array<number>(dim);
  let s = seed >>> 0;
  if (s === 0) s = 1;
  let mag2 = 0;
  for (let i = 0; i < dim; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const x = (s / 0xffffffff) * 2 - 1;
    out[i] = x;
    mag2 += x * x;
  }
  const mag = Math.sqrt(mag2) || 1;
  for (let i = 0; i < dim; i++) out[i] = out[i] / mag;
  return out;
}

/**
 * Simulated embedding: token-bag → averaged hash-seeded vectors,
 * normalized. Deals with overlapping tokens cluster together; the
 * geometry is meaningless but the *order* is reasonable for tests.
 */
function simulatedEmbedding(text: string): number[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) {
    return seededUnitVector(0xdeadbeef, EMBEDDING_DIM);
  }
  const acc = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const t of tokens) {
    const v = seededUnitVector(fnv1a(t), EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] += v[i];
  }
  let mag2 = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) mag2 += acc[i] * acc[i];
  const mag = Math.sqrt(mag2) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] = acc[i] / mag;
  return acc;
}

export async function computeEmbedding(text: string): Promise<number[]> {
  if (MODE === "simulated") return simulatedEmbedding(text);
  if (MODE === "openai") {
    // Stub. F2.1.5 wires the real call (or a Python ml-service).
    throw new Error(
      "INTELLIGENCE_MODE=openai requested but the OpenAI client is not yet wired. Use simulated mode or land F2.1.5.",
    );
  }
  throw new Error(`Unknown INTELLIGENCE_MODE: ${MODE}`);
}

/**
 * Build the canonical deal text — what we feed to the embedder.
 * Includes title + serviceLine + a flat list of scope item names.
 * Order-independent within scope items so re-arrangement doesn't
 * change the vector.
 */
export function buildDealText(input: {
  title: string;
  businessUnit?: string | null;
  serviceLine?: string | null;
  scopeNames: string[];
}): string {
  const parts: string[] = [];
  if (input.title) parts.push(input.title);
  if (input.businessUnit) parts.push(input.businessUnit);
  if (input.serviceLine) parts.push(input.serviceLine);
  // Sort scope names so order doesn't matter
  const sortedScope = [...input.scopeNames].sort();
  parts.push(...sortedScope);
  return parts.join(" ");
}

export function computeFingerprint(input: {
  businessUnit?: string | null;
  serviceLine?: string | null;
  region?: string | null;
  complexity?: string | null;
  scopeItemCount: number;
  totalFee?: string | null;
  marginPercent?: string | null;
}): DealFingerprint {
  return {
    bu: input.businessUnit ?? null,
    serviceLine: input.serviceLine ?? null,
    region: input.region ?? null,
    complexity: input.complexity ?? null,
    scopeItemCount: input.scopeItemCount,
    feeBucket: bucketFee(input.totalFee),
    marginBucket: bucketMargin(input.marginPercent),
    computedAt: new Date().toISOString(),
    mode: MODE,
  };
}

/**
 * Recompute fingerprint + embedding for one deal. Idempotent: fetches
 * the current deal + scope, builds the canonical text, computes both
 * outputs, writes back. Skips silently if the deal does not exist
 * (caller's responsibility to 404 if that matters).
 */
export async function recomputeForDeal(dealId: number): Promise<{
  updated: boolean;
  fingerprint: DealFingerprint | null;
}> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return { updated: false, fingerprint: null };

  // Pull scope item names (joined to scope_catalog so we have human text)
  const scopeRows = await db
    .select({ name: scopeCatalog.name, code: scopeCatalog.code })
    .from(dealScopeItems)
    .innerJoin(scopeCatalog, eq(scopeCatalog.id, dealScopeItems.scopeItemId))
    .where(eq(dealScopeItems.dealId, dealId));

  const fingerprint = computeFingerprint({
    businessUnit: deal.businessUnit,
    serviceLine: deal.serviceLine,
    region: deal.region,
    complexity: deal.complexity,
    scopeItemCount: scopeRows.length,
    totalFee: deal.totalFee,
    marginPercent: deal.marginPercent,
  });

  const text = buildDealText({
    title: deal.title,
    businessUnit: deal.businessUnit,
    serviceLine: deal.serviceLine,
    scopeNames: scopeRows.map((r) => `${r.code} ${r.name}`),
  });
  const embedding = await computeEmbedding(text);

  await db
    .update(deals)
    .set({ fingerprint, embedding })
    .where(eq(deals.id, dealId));

  return { updated: true, fingerprint };
}

export interface SimilarDeal {
  dealId: number;
  dealNumber: string;
  title: string;
  clientId: number;
  status: string;
  totalFee: string | null;
  marginPercent: string | null;
  distance: number;
}

/**
 * k-NN similarity search anchored on `dealId`. Uses pgvector's
 * `<->` (L2) operator. Returns up to `k` results, excluding the
 * anchor itself and (by default) only over deals with a populated
 * embedding column. If the anchor has no embedding, computes one
 * lazily so the first /similarity request after a back-fill works
 * without an explicit recompute step.
 */
export async function findSimilar(
  anchorDealId: number,
  k = 5,
  opts?: { onlyApproved?: boolean },
): Promise<SimilarDeal[]> {
  const [anchor] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, anchorDealId));
  if (!anchor) return [];

  let anchorEmbedding = (anchor as { embedding?: number[] | null }).embedding;
  if (!anchorEmbedding || anchorEmbedding.length !== EMBEDDING_DIM) {
    await recomputeForDeal(anchorDealId);
    const [refreshed] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, anchorDealId));
    anchorEmbedding = (refreshed as { embedding?: number[] | null }).embedding ?? undefined;
  }
  if (!anchorEmbedding) return [];

  const literal = `[${anchorEmbedding.join(",")}]`;
  const baseConds = [
    isNotNull(deals.embedding),
    ne(deals.id, anchorDealId),
  ];
  if (opts?.onlyApproved) baseConds.push(eq(deals.status, "approved"));

  const rows = await db
    .select({
      id: deals.id,
      dealNumber: deals.dealNumber,
      title: deals.title,
      clientId: deals.clientId,
      status: deals.status,
      totalFee: deals.totalFee,
      marginPercent: deals.marginPercent,
      distance: sql<number>`(${deals.embedding} <-> ${literal}::vector)`,
    })
    .from(deals)
    .where(and(...baseConds))
    .orderBy(sql`(${deals.embedding} <-> ${literal}::vector) ASC`)
    .limit(k);

  return rows.map((r) => ({
    dealId: r.id,
    dealNumber: r.dealNumber,
    title: r.title,
    clientId: r.clientId,
    status: r.status,
    totalFee: r.totalFee,
    marginPercent: r.marginPercent,
    distance: Number(r.distance),
  }));
}

/**
 * Bulk back-fill embeddings/fingerprints for every deal that's
 * missing one. Returns counts. Cheap — one row per deal — but skip
 * rows that already have both populated.
 */
export async function backfillIntelligence(): Promise<{
  scanned: number;
  updated: number;
}> {
  const rows = await db.select({ id: deals.id, embedding: deals.embedding, fingerprint: deals.fingerprint }).from(deals);
  let updated = 0;
  for (const r of rows) {
    const hasEmbedding =
      Array.isArray((r as { embedding?: number[] | null }).embedding) &&
      ((r as { embedding?: number[] | null }).embedding as number[]).length === EMBEDDING_DIM;
    const hasFingerprint = (r as { fingerprint?: unknown }).fingerprint != null;
    if (hasEmbedding && hasFingerprint) continue;
    await recomputeForDeal(r.id);
    updated++;
  }
  return { scanned: rows.length, updated };
}

export const __INTERNALS_FOR_TEST = {
  fnv1a,
  seededUnitVector,
  simulatedEmbedding,
  EMBEDDING_DIM,
};
