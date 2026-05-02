/**
 * F3.4 — Voice-to-scope.
 *
 * Modes (selected by `VOICE_MODE`, default `simulated`):
 *   - simulated  — accepts a pre-typed transcript (or generates a
 *     deterministic stub if absent). Extracts scope candidates by
 *     fuzzy-matching the transcript against scope_catalog rows.
 *   - azure      — stub. Production wiring uses Azure Speech for
 *     STT + GPT-4o function calling for structured extraction.
 *
 * Anti-corruption:
 *   - audio bytes never persist in the DB; only the storage key
 *   - extraction confidence is bounded [0, 1]
 *   - identical transcripts → identical extractions (deterministic
 *     simulated mode)
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { dealScopeItems, scopeCatalog, voiceTranscripts } from "../../shared/schema";

const MODE = (process.env.VOICE_MODE || "simulated") as "simulated" | "azure";

export interface VoiceExtraction {
  catalogCode: string | null;       // null when no high-confidence catalog match
  catalogId: number | null;
  name: string;
  defaultHours: number;
  confidence: number;               // 0..1
  rationale: string;
}

export interface TranscribeAndExtractInput {
  transcriptId: number;
  /** When set, used directly. When omitted in simulated mode, we
   * generate a deterministic stub so end-to-end can run without
   * needing a real audio sample. */
  forceTranscript?: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Pure: rank scope_catalog rows against a transcript by token
 * overlap. No DB access — caller supplies catalog rows so this
 * can be unit-tested.
 */
export function rankCatalogMatches(
  transcript: string,
  catalog: Array<{ id: number; code: string; name: string; defaultHours: string | null }>,
  topK = 5,
): VoiceExtraction[] {
  const tokens = new Set(tokenize(transcript));
  if (tokens.size === 0 || catalog.length === 0) return [];
  const scored = catalog.map((c) => {
    const itemTokens = tokenize(`${c.code} ${c.name}`);
    let hits = 0;
    for (const t of itemTokens) if (tokens.has(t)) hits++;
    const denom = Math.max(itemTokens.length, 1);
    const score = hits / denom;
    return { catalog: c, score, hits };
  });
  scored.sort((a, b) => b.score - a.score || b.hits - a.hits);
  return scored
    .filter((s) => s.score >= 0.34) // need at least ~one third token overlap
    .slice(0, topK)
    .map((s) => ({
      catalogCode: s.catalog.code,
      catalogId: s.catalog.id,
      name: s.catalog.name,
      defaultHours: parseFloat(s.catalog.defaultHours || "0") || 0,
      confidence: clamp01(s.score),
      rationale: `Matched ${s.hits} token(s) against "${s.catalog.code} ${s.catalog.name}"`,
    }));
}

/**
 * Deterministic simulated transcript. Same dealId → same text.
 * Useful when no audio is uploaded yet but the routes need to
 * exercise the full pipeline.
 */
export function simulatedTranscript(seed: string): string {
  // Pick from a small fixture set keyed by hash of seed.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const FIXTURES = [
    "We need to scope a 1040 federal return plus a state return for California. Estimated 8 hours.",
    "Add audit testing for revenue recognition and accounts receivable confirmations. About 40 hours total.",
    "Client wants tax compliance support including 1120 corporate return and Schedule K-1 preparation.",
    "Risk consulting engagement covering SOX 404 controls testing and remediation roadmap.",
    "Advisory work for technology assessment and ERP implementation readiness.",
  ];
  return FIXTURES[h % FIXTURES.length];
}

export async function transcribeAndExtract(input: TranscribeAndExtractInput): Promise<typeof voiceTranscripts.$inferSelect | null> {
  const [row] = await db.select().from(voiceTranscripts).where(eq(voiceTranscripts.id, input.transcriptId));
  if (!row) return null;
  if (row.status === "applied") return row; // terminal — don't reprocess

  if (MODE === "azure") {
    throw new Error("VOICE_MODE=azure requested but the Azure Speech client is not yet wired. Use simulated mode.");
  }

  const transcript = input.forceTranscript ?? row.transcript ?? simulatedTranscript(`deal-${row.dealId ?? 0}-tx-${row.id}`);
  // Score against the catalog (whole catalog; in F3.4.2 this could
  // narrow by service-line first).
  const catalog = await db
    .select({
      id: scopeCatalog.id,
      code: scopeCatalog.code,
      name: scopeCatalog.name,
      defaultHours: scopeCatalog.defaultHours,
    })
    .from(scopeCatalog);
  const extractions = rankCatalogMatches(transcript, catalog);

  const [updated] = await db
    .update(voiceTranscripts)
    .set({
      transcript,
      extractions,
      status: "extracted",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(voiceTranscripts.id, input.transcriptId))
    .returning();
  return updated;
}

/**
 * Apply selected extractions to the deal — inserts deal_scope_items
 * for catalog matches the user accepted. Skips any (deal, scope_item)
 * pair already present (same unique-index guard as POST /scope-items).
 *
 * Returns counts. The transcript row flips to status='applied' on
 * success.
 */
export async function applyExtractions(input: {
  transcriptId: number;
  acceptedCatalogIds: number[];
}): Promise<{ inserted: number; skipped: number } | null> {
  const [row] = await db.select().from(voiceTranscripts).where(eq(voiceTranscripts.id, input.transcriptId));
  if (!row) return null;
  if (row.dealId == null) return null;
  const accepted = new Set(input.acceptedCatalogIds.filter((n) => Number.isFinite(n) && n > 0));
  const extractions = (row.extractions as VoiceExtraction[] | null) || [];
  const candidates = extractions.filter((e) => e.catalogId != null && accepted.has(e.catalogId));

  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (c.catalogId == null) continue;
    // Dedup: skip if (deal, scope_item) already exists
    const [existing] = await db
      .select({ id: dealScopeItems.id })
      .from(dealScopeItems)
      .where(and(eq(dealScopeItems.dealId, row.dealId), eq(dealScopeItems.scopeItemId, c.catalogId)));
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(dealScopeItems).values({
      dealId: row.dealId,
      scopeItemId: c.catalogId,
      quantity: 1,
      adjustedHours: String(c.defaultHours || 0),
      complexityMultiplier: "1.0",
      notes: `From voice transcript #${row.id} (confidence ${(c.confidence * 100).toFixed(0)}%)`,
    });
    inserted++;
  }
  await db
    .update(voiceTranscripts)
    .set({ status: "applied", updatedAt: new Date() })
    .where(eq(voiceTranscripts.id, input.transcriptId));
  return { inserted, skipped };
}
