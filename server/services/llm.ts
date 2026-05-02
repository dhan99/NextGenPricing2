/**
 * F4.4 — LLM client abstraction.
 *
 * Single seam for every LLM-backed call. Modes:
 *
 *   - simulated    deterministic, key-free; canned outputs keyed by
 *                  hash of prompt + schema. Used by default + by CI.
 *   - anthropic    real Anthropic Messages API. Requires
 *                  ANTHROPIC_API_KEY; throws "client not configured"
 *                  until a project's anthropic SDK ships.
 *   - openai       OpenAI Chat Completions / Responses API. Same
 *                  contract; OPENAI_API_KEY required.
 *   - azure_openai Azure OpenAI flavor; AZURE_OPENAI_ENDPOINT +
 *                  AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT.
 *
 * Two flavors of call:
 *   complete(req)        free-form text completion
 *   completeStructured   structured JSON output validated against a
 *                        zod schema. Caller never has to parse JSON
 *                        from a string blob; bad JSON re-prompts via
 *                        the simulated/live retry policy.
 *
 * Telemetry is recorded automatically via withAiTelemetry — caller
 * just supplies operation + dealId/actor.
 */
import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";
import { withAiTelemetry, type TelemetryMode } from "../middleware/aiTelemetry";

export type LlmProvider = "simulated" | "anthropic" | "openai" | "azure_openai";

const MODE: LlmProvider = (process.env.LLM_PROVIDER || "simulated") as LlmProvider;

/**
 * Default model per provider. Override per-call via opts.model.
 *
 * Production note: when wiring real providers, keep these aligned
 * with the cost table in `server/middleware/aiTelemetry.ts` so the
 * dashboard's totalCostUsd math stays accurate.
 */
const DEFAULT_MODEL: Record<LlmProvider, string> = {
  simulated: "simulated-v1",
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  azure_openai: "gpt-4o-mini",
};

export function activeProvider(): LlmProvider {
  return MODE;
}

export interface LlmRequest {
  /** What we're calling on behalf of — used for telemetry operation. */
  operation: string;
  /** System / instruction prompt — what role + constraints. */
  systemPrompt: string;
  /** User / payload prompt — the actual input. */
  userPrompt: string;
  /** Optional model override. */
  model?: string;
  /** Stop generation past this many output tokens. */
  maxTokens?: number;
  /** 0..2; 0 = greedy, 1 = balanced, 2 = wild. */
  temperature?: number;
  /** Telemetry hook — surfaces in ai_telemetry. */
  dealId?: number | null;
  actor?: string | null;
}

export interface LlmResponse {
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * Hash-based deterministic stub. Same (system, user, schema) → same
 * output. Lets tests + CI exercise the full LLM-routing path
 * without keys.
 */
function deterministicHash(parts: string[]): number {
  const h = createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 8);
  return parseInt(h, 16);
}

const SIMULATED_TEXT_FIXTURES = [
  "Based on the inputs supplied, the recommendation is to keep the current arrangement and re-evaluate after one billing cycle.",
  "The provided context indicates a moderate-risk profile; consider an additional quality review before approval.",
  "Margin trajectory looks healthy; no rate adjustment is suggested at this time.",
  "Two contributing factors stand out: scope volatility and a high services-to-product mix. Mitigations should target both.",
  "Overall summary: solid foundation, two minor risks worth flagging to the practice lead before the SOW is sent.",
];

function simulatedText(req: LlmRequest): string {
  const seed = deterministicHash([req.systemPrompt, req.userPrompt]);
  return SIMULATED_TEXT_FIXTURES[seed % SIMULATED_TEXT_FIXTURES.length];
}

/**
 * Free-form text completion.
 */
export async function complete(req: LlmRequest): Promise<LlmResponse> {
  const model = req.model ?? DEFAULT_MODEL[MODE];
  const telemetryMode: TelemetryMode = MODE === "simulated" ? "simulated" : MODE;

  return withAiTelemetry(
    {
      operation: `llm.complete:${req.operation}`,
      mode: telemetryMode,
      model,
      dealId: req.dealId ?? null,
      actor: req.actor ?? null,
    },
    async () => {
      if (MODE === "simulated") {
        const text = simulatedText(req);
        // Approximate token counts — useful enough for cost panels
        const promptTokens = Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4);
        const completionTokens = Math.ceil(text.length / 4);
        return { text, model, promptTokens, completionTokens };
      }
      throw new Error(
        `LLM_PROVIDER=${MODE} is not yet wired. Use 'simulated' until the provider SDK is added.`,
      );
    },
    (result) => ({
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    }),
  );
}

export interface StructuredRequest<T> extends LlmRequest {
  /** Zod schema for the expected JSON shape. */
  schema: ZodType<T>;
  /**
   * Hint to the model about the JSON shape. The simulated mode
   * uses this to construct a deterministic stub matching the
   * shape; live providers use this in the system prompt.
   */
  schemaHint: string;
  /** Stub object for simulated mode. Required so the simulated
   *  branch returns something that validates without each caller
   *  having to parse JSON. */
  simulatedStub: T;
  /** Retry on malformed JSON (live providers). */
  maxJsonRetries?: number;
}

export interface StructuredResponse<T> {
  data: T;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  retries: number;
}

/**
 * Structured JSON completion. Caller defines the zod shape +
 * supplies a simulated stub for the deterministic path. Real
 * providers will JSON-mode + parse + validate; on validation
 * failure, retry up to `maxJsonRetries` times with the parser
 * error attached to the next prompt.
 */
export async function completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>> {
  const model = req.model ?? DEFAULT_MODEL[MODE];
  const telemetryMode: TelemetryMode = MODE === "simulated" ? "simulated" : MODE;

  return withAiTelemetry(
    {
      operation: `llm.completeStructured:${req.operation}`,
      mode: telemetryMode,
      model,
      dealId: req.dealId ?? null,
      actor: req.actor ?? null,
    },
    async () => {
      if (MODE === "simulated") {
        // Validate the caller's stub against their schema — catches
        // drift early. The stub is what we'll return.
        const parsed = req.schema.parse(req.simulatedStub);
        const promptTokens = Math.ceil(
          (req.systemPrompt.length + req.userPrompt.length + req.schemaHint.length) / 4,
        );
        const stubJson = JSON.stringify(parsed);
        const completionTokens = Math.ceil(stubJson.length / 4);
        return {
          data: parsed,
          model,
          promptTokens,
          completionTokens,
          retries: 0,
        };
      }
      throw new Error(
        `LLM_PROVIDER=${MODE} is not yet wired for structured output. Use 'simulated' until the provider SDK is added.`,
      );
    },
    (result) => ({
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    }),
  );
}

// Re-export zod for callers that want to define schemas inline.
export { z };
