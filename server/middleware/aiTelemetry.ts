/**
 * F4.5 — AI telemetry.
 *
 * Two surfaces:
 *   1. `recordAi(meta)` — fire-and-forget INSERT. Used by services
 *      (LLM client, IntelligenceEngine, heuristic AI endpoints).
 *      Never throws; bad telemetry must not break the call.
 *   2. `withAiTelemetry(operation, fn)` — wraps an async function,
 *      records latency + status automatically, and surfaces the
 *      result. Errors are recorded with status='error' and
 *      re-thrown.
 *
 * Cost estimation table is bundled here so dashboards don't need
 * to know per-model rates. Edit the table when models/prices
 * change. Cost = (promptTokens × promptRate + completionTokens ×
 * completionRate) per 1M tokens.
 */
import { db } from "../db";
import { aiTelemetry } from "../../shared/schema";

export type TelemetryMode =
  | "heuristic"
  | "simulated"
  | "anthropic"
  | "openai"
  | "azure_openai"
  | "pgvector";

export type TelemetryStatus = "ok" | "error" | "timeout" | "rate_limited";

export interface AiTelemetryRecord {
  operation: string;
  mode?: TelemetryMode;
  status: TelemetryStatus;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  latencyMs: number;
  dealId?: number | null;
  actor?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** USD per 1M input/output tokens. Conservative estimates. */
const COST_TABLE: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7": { in: 15.0, out: 75.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4.0 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "text-embedding-3-small": { in: 0.02, out: 0.0 },
  "text-embedding-3-large": { in: 0.13, out: 0.0 },
};

export function estimateCostUsd(
  model: string | null | undefined,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  if (!model) return null;
  const rates = COST_TABLE[model];
  if (!rates) return null;
  const pIn = (promptTokens ?? 0) / 1_000_000;
  const pOut = (completionTokens ?? 0) / 1_000_000;
  const cost = pIn * rates.in + pOut * rates.out;
  if (!Number.isFinite(cost)) return null;
  // 6 decimals — enough resolution for sub-cent operations
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Truncate metadata payloads so a verbose request body can't fill
 * up jsonb storage. ~32KB cap.
 */
function safeMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const json = JSON.stringify(meta);
    if (json.length <= 32_000) return meta;
    return { _truncated: true, _bytes: json.length, sample: json.slice(0, 30_000) + "…" };
  } catch {
    return { _serializationError: true };
  }
}

export async function recordAi(record: AiTelemetryRecord): Promise<void> {
  try {
    const total =
      record.totalTokens != null
        ? record.totalTokens
        : record.promptTokens != null && record.completionTokens != null
          ? record.promptTokens + record.completionTokens
          : null;
    const cost = estimateCostUsd(record.model, record.promptTokens, record.completionTokens);
    await db.insert(aiTelemetry).values({
      operation: record.operation,
      mode: record.mode ?? "heuristic",
      status: record.status,
      model: record.model ?? null,
      promptTokens: record.promptTokens ?? null,
      completionTokens: record.completionTokens ?? null,
      totalTokens: total,
      costUsd: cost == null ? null : String(cost),
      latencyMs: Math.max(0, Math.round(record.latencyMs)),
      dealId: record.dealId ?? null,
      actor: record.actor ?? null,
      errorCode: record.errorCode ?? null,
      errorMessage: record.errorMessage ?? null,
      metadata: safeMetadata(record.metadata),
    });
  } catch (err) {
    // Telemetry never breaks the call. Surface to stderr so dev
    // notices but don't reject the user's request.
    // eslint-disable-next-line no-console
    console.error("[aiTelemetry] insert failed:", err);
  }
}

/**
 * Wraps an async function, records latency + status. The wrapped
 * function should throw on errors; we catch + record + rethrow.
 *
 * `enrich` runs on the resolved value to pull token counts /
 * model id out of provider responses.
 */
export async function withAiTelemetry<T>(
  baseRecord: Omit<AiTelemetryRecord, "status" | "latencyMs">,
  fn: () => Promise<T>,
  enrich?: (result: T) => Partial<AiTelemetryRecord>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const enriched = enrich ? enrich(result) : {};
    await recordAi({
      ...baseRecord,
      status: "ok",
      latencyMs: Date.now() - start,
      ...enriched,
    });
    return result;
  } catch (err) {
    const e = err as { code?: string; message?: string; status?: number };
    const status: TelemetryStatus =
      e?.status === 408 || /timeout/i.test(e?.message ?? "")
        ? "timeout"
        : e?.status === 429
          ? "rate_limited"
          : "error";
    await recordAi({
      ...baseRecord,
      status,
      latencyMs: Date.now() - start,
      errorCode: e?.code ?? (e?.status ? `http_${e.status}` : "unknown"),
      errorMessage: e?.message ?? "Unknown error",
    });
    throw err;
  }
}
