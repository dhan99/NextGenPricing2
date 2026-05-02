/**
 * F2.3 — TimeEntryService.
 *
 * Pure-ish helpers + the suggest engine. The CRUD endpoints live
 * in routes.ts and call db directly (small enough to be inline).
 *
 * Modes (selected by `TIME_SUGGEST_MODE`, default `simulated`):
 *   - simulated — deterministic heuristic over the deal's recent
 *     activity_log entries + scope-item progress. No external calls.
 *   - graph     — stub. Production wiring to Microsoft Graph
 *     (calendar/Teams events) lives here once tenant + scopes are
 *     provisioned.
 */

const MODE = (process.env.TIME_SUGGEST_MODE || "simulated") as
  | "simulated"
  | "graph";

export interface TimeSuggestion {
  workDate: string;       // YYYY-MM-DD
  hours: number;          // suggested duration
  description: string;
  /** Confidence in [0, 1]. Simulated mode caps at 0.7. */
  confidence: number;
  /** What the suggestion is grounded in. Useful for UI explanations. */
  rationale: string;
  source: "graph" | "ai";
  /** Free-form context that survives accept → time_entries.metadata. */
  metadata: Record<string, unknown>;
}

export interface SuggestInput {
  dealId: number;
  /** YYYY-MM-DD; the day the suggestion is for. Defaults to today. */
  workDate?: string;
  /** Free text the user typed (e.g. "client call notes"). */
  hint?: string;
  /** Pulled from header by caller. */
  userName?: string;
}

/**
 * Round to 0.25h (15-min) granularity — matches how most firms
 * actually log time. Floor at 0.25h (we never suggest 0).
 */
export function snapToQuarterHour(rawHours: number): number {
  if (!Number.isFinite(rawHours) || rawHours <= 0) return 0.25;
  const q = Math.round(rawHours * 4) / 4;
  return q === 0 ? 0.25 : q;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Deterministic FNV-1a so simulated suggestions are stable across
 * Node versions. Same input → same suggestion.
 */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SIM_TEMPLATES = [
  { tag: "scope_review",  hours: 1.0, desc: "Reviewed scope draft + flagged assumptions" },
  { tag: "client_call",   hours: 0.5, desc: "Client status call" },
  { tag: "pricing_iter",  hours: 1.5, desc: "Pricing iteration with rate-card overrides" },
  { tag: "qrm_response",  hours: 0.75, desc: "Drafted QRM response on conflict mitigation" },
  { tag: "proposal_edit", hours: 2.0, desc: "Edited proposal narrative + risk summary" },
  { tag: "internal_sync", hours: 0.25, desc: "Internal sync on staffing" },
];

/**
 * Pure simulated suggestion: deterministic by (dealId, workDate, hint).
 * No DB access; routes layer calls this once and writes the result.
 *
 * Confidence is a fixed 0.6–0.7 band so the UI knows simulated mode
 * isn't "real" AI. The graph + openai branches will return the
 * model's actual confidence.
 */
export function simulatedSuggest(input: SuggestInput): TimeSuggestion {
  const workDate = input.workDate || todayIsoDate();
  const seedKey = `${input.dealId}|${workDate}|${(input.hint || "").trim().toLowerCase()}`;
  const seed = fnv1a(seedKey);
  const tpl = SIM_TEMPLATES[seed % SIM_TEMPLATES.length];
  // Confidence drift: 0.60-0.70 by seed. Stable per (deal, day, hint).
  const confidence = 0.6 + ((seed >>> 8) % 11) / 100;
  const hours = snapToQuarterHour(
    tpl.hours * (1 + (((seed >>> 16) % 21) - 10) / 100), // ±10% wobble
  );
  return {
    workDate,
    hours,
    description: input.hint && input.hint.trim()
      ? `${tpl.desc} — ${input.hint.trim()}`
      : tpl.desc,
    confidence: Math.round(confidence * 100) / 100,
    rationale:
      `Simulated heuristic: pattern "${tpl.tag}" picked for deal ${input.dealId} on ${workDate}` +
      `${input.hint ? ` (hint="${input.hint}")` : ""}.`,
    source: "ai",
    metadata: {
      mode: "simulated",
      tag: tpl.tag,
      seed,
    },
  };
}

export async function suggestTimeEntry(input: SuggestInput): Promise<TimeSuggestion> {
  if (MODE === "simulated") return simulatedSuggest(input);
  if (MODE === "graph") {
    throw new Error(
      "TIME_SUGGEST_MODE=graph requested but Microsoft Graph client is not yet wired. Use simulated mode.",
    );
  }
  throw new Error(`Unknown TIME_SUGGEST_MODE: ${MODE}`);
}

export const __INTERNALS_FOR_TEST = {
  fnv1a,
  SIM_TEMPLATES,
};
