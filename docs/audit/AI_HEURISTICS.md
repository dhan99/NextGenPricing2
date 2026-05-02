# AI Heuristics — Behavioral Spec

This document captures **exactly** what each `/api/ai/*` endpoint does today. Phase 4 of the roadmap replaces these heuristics with LLMs and trained ML models. To A/B test those replacements honestly, we need a precise baseline.

Every entry below is sourced from `server/routes.ts` and `server/dynamics.ts`. Line numbers were re-validated during F0.7 (Day 7 of `PHASE0_RUNBOOK.md`) after the F0.5 pricing extraction shifted line numbers in `routes.ts` by ~219 lines. They will drift again as the refactor progresses; trust the symbol names over the numbers and re-run `python3 scripts/audit/extract_endpoints.py` if you suspect drift.

The phrase **"AI"** in the codebase today means **deterministic heuristic**. No LLM is called; no model is loaded; all outputs are produced by rule-based code paths. This is openly stated in `replit-project-rigor-playbook.md` and in the architecture-chat handler.

---

## UC-1: Deal Similarity

**Endpoint**: `POST /api/ai/deal-similarity`
**Permission**: `runAI`
**Code**: `server/routes.ts:2670-2707`

### Input shape

```ts
{ clientId: number, serviceLine?: string, businessUnit?: string }
```

### Algorithm

1. Query approved deals for the same `clientId`, limit 3, eager-load client.
2. If no same-client matches, fall back to the 5 most-recent approved deals across all clients.
3. Compute the arithmetic mean of `marginPercent` and `totalFee` across the chosen set.

### Output shape

```ts
{
  similarDeals: Array<{
    dealNumber, title, clientName, totalFee, marginPercent, totalHours
  }>,
  insights: {
    averageMargin: string,         // 1 decimal
    averageFee: string,             // integer
    dealCount: number,
    recommendation: string          // canned narrative referencing the means
  }
}
```

### Limitations to call out when comparing to LLM/RAG

- No semantic similarity. A "Cloud migration" deal for the same client matches a "Tax compliance" deal for the same client equally. Service line and business unit on the request are accepted but **never used** in the query (only used in the recommendation string template).
- No vector embedding. `pgvector` is not installed.
- Same-client preference is binary; there's no scoring across multiple signals (industry, segment, complexity, scope items).
- "Similarity" is just "approved deals for this client OR the 5 newest if none."

### Replacement target (F2.1 / F4.1)

`server/services/IntelligenceEngine.ts` will call into a Python embedding service (`text-embedding-3-large`), persist embeddings on `deals.embedding vector(1536)`, and use `pgvector`'s `<=>` operator for cosine similarity. The current heuristic stays available behind a feature flag so we can A/B test on a labeled set.

---

## UC-2: Effort Estimation

**Endpoint**: `POST /api/ai/effort-estimation`
**Permission**: `runAI`
**Code**: `server/routes.ts:2709-2779`

### Input shape

```ts
{
  scopeItems: Array<{ defaultHours?: string, ... }>,
  complexity: "low" | "medium" | "high" | "very_high",
  prompts?: Array<{ impactMultiplier?: string }>,
  startDate?: string,
  endDate?: string
}
```

### Algorithm

1. **Complexity multiplier** — fixed table:
   - `low: 0.8`, `medium: 1.0`, `high: 1.2`, `very_high: 1.5`
   - Unknown values fall back to 1.0.
2. **Prompt multiplier** — multiply all `prompts[].impactMultiplier` values together. Default 1.0.
3. **Total multiplier** = complexity × prompt.
4. For each scope item: `estimatedHours = round(defaultHours × totalMultiplier)`. Default `defaultHours` if missing: 40.
5. **Project duration**: derive from `endDate − startDate` in weeks; fall back to 12 weeks if dates missing or invalid.
6. **FTE math**: 32 billable hrs/wk per FTE (assumes 80% utilization on a 40-hr week).
7. **Role distribution** — fixed percentages:
   - Partner 7%, Managing Director 10%, Senior Manager 17%, Manager 20%, Senior Consultant 26%, Consultant 13%, Analyst 7%.
8. For each role: `hours = round(totalHours × pct/100)`; `fteRaw = hours / fteCapacity`; `headcount = max(1, ceil(fteRaw))` if `fteRaw ≥ 0.05`, else 0.

### Output shape

```ts
{
  estimatedItems: Array<{ ...item, estimatedHours, multiplierApplied }>,
  totalHours: number,
  complexityMultiplier: number,
  promptMultiplier: string,         // 2 decimal
  totalMultiplier: string,          // 2 decimal
  roleDistribution: Array<{ role, percentage, hours, headcount, fte }>,
  projectWeeks: number,
  weeksSource: "dates" | "default",
  billableHrsPerFTEPerWeek: 32,
  totalHeadcount: number,
  totalFTE: number,
  narrative: string                 // canned sentence referencing all inputs
}
```

### Limitations

- Role distribution is **identical** for every engagement — Partner-heavy practices and Analyst-heavy practices look the same.
- `defaultHours` per scope item is taken at face value; no learning from historical actuals.
- Prompt multipliers compound multiplicatively without bound. Five 1.2× prompts produce a 2.49× multiplier; this can produce eyebrow-raising hour estimates on heavily-prompted engagements. Worth a guard rail in the LLM replacement.
- No confidence interval; output is point estimate.

### Replacement target (F4.2)

`services/ml-service/effort_estimator.py` — gradient-boosted regression trained on historical deals (target: actual hours; features: scope item codes, complexity, prompt responses, client segment, industry, service line). Shadow-run alongside the heuristic for 4 weeks before cutover.

---

## UC-3: Margin Advisor

**Endpoint**: `POST /api/ai/margin-advisor`
**Permission**: `runAI`
**Code**: `server/routes.ts:2781-2872`

### Input shape

```ts
{
  pricingLines: Array<{ role: { name }, rate, costRate, ... }>,
  dealId?: number,
  targetMargin?: number             // legacy explicit override
}
```

### Algorithm

1. **Resolve target margin** — priority: explicit override → `resolveTargetForDeal(deal)` (firm → BU → service-line cascade in `shared/policy.ts`) → firm fallback.
2. **Compute current totals** via `computeDealTotalsFromLines` — the **same** helper that pricing grid, Review & Submit, and `deals.totalFee` use. This is intentional and important: the advisor's `currentMargin` matches every other surface in the app.
3. **If `currentMargin < targetMargin`**:
   - **Role-shift suggestion**: if there are senior lines (Senior Consultant / Manager / Senior Manager) AND junior lines (Consultant / Analyst), simulate moving 40 hours from the first senior line to the first junior line. Compute new margin, return as `role_shift` suggestion.
   - **Rate-uplift suggestion**: assert that a 5% uplift would add ~3.5pp of margin. Hard-coded; no actual cost-base check.
4. **If `currentMargin >= targetMargin`**: emit a single `on_target` info suggestion.

### Output shape

```ts
{
  currentMargin: string, targetMargin: number, targetSource: string,
  totalFee: number, totalCost: number,
  isOnTarget: boolean,
  suggestions: Array<{ type, title, description, impact, newMargin?, priority }>
}
```

### Limitations

- Only ever considers two strategies: a single-role-shift and a 5% uplift. No optimization across multiple roles, no scope-item changes, no offshore mix changes.
- The 3.5pp uplift number is arithmetic-magic; the actual margin impact of a 5% rate uplift depends on the cost base, which the advisor knows but doesn't use.
- Senior/junior categorization is hard-coded by role-name string match. A new role added to the rate card is invisible to the advisor.
- `targetSource` is propagated correctly (good — useful for UI).

### Replacement target (F4.3)

`services/ml-service/margin_optimizer.py` — linear program over the rate × hours matrix with constraints (min/max headcount per role, max offshore %, scope item completion). Returns Pareto-frontier of margin-vs-fee tradeoffs. Heuristic stays available for explainability.

---

## UC-4: Scenario Recommendation

**Endpoint**: `POST /api/ai/scenario-recommendation`
**Permission**: `runAI`
**Code**: `server/routes.ts:2874-2904`

### Input shape

```ts
{ dealId: number }
```

### Algorithm

1. Load all `scenarios` rows for the deal.
2. Pick the one with `isRecommended = true`. Fall back to the first row if none are flagged.
3. Return a comparison view across scenarios + the recommended one + a canned narrative.
4. Confidence is **hard-coded** to `0.87` regardless of input.

### Output shape

```ts
{
  recommendation: { scenarioName, reasoning, confidence: 0.87 },
  scenarios: Array<...>,
  narrative: string
}
```

### Limitations

- No actual recommendation logic. The "AI" picks whatever upstream code marked `isRecommended`. Upstream code is in the scenario-generation handler (Standard / Premium / Value variants) which always flags Standard.
- Hard-coded 0.87 confidence is misleading.
- `aiReasoning` field on the scenario is whatever was written when the scenario was generated; it's not synthesized at recommendation time.

### Replacement target (F4.4)

`server/services/llm.ts` — call Anthropic Claude or Azure OpenAI with the full scenario set + deal context, ask for a structured JSON recommendation with grounded reasoning. Confidence becomes a calibrated probability.

---

## UC-5: Risk Summary

**Endpoint**: `POST /api/ai/risk-summary`
**Permission**: `runAI`
**Code**: `server/routes.ts:2906-2957`

### Input shape

```ts
{ dealId: number }
```

### Algorithm

1. Load deal with client + scenarios + pricing lines + roles.
2. Resolve target margin via `resolveTargetForDeal`.
3. **Risk level**:
   - `margin < (target − 10)` → **High**
   - `margin < target` → **Medium**
   - else → **Low**
4. **Risk factors** (each is a canned object with severity + detail):
   - Add "High Complexity" if `complexity ∈ {high, very_high}`.
   - Add "Below Target Margin" if `margin < target` (severity = high if margin < warnThreshold else medium).
   - Add "Large Engagement" if `totalHours > 1000`.
   - Add "Strong Client Relationship" (severity: `positive`) if `client.relationshipYears > 3`.
5. **Narrative** — string template referencing fee, service line, client, margin, hours, complexity, relationship.
6. **Risk score** — fixed lookup: Low=2.5, Medium=5.5, High=8.0.
7. **Approval likelihood** — fixed strings: Low="High (89%)", Medium="Moderate (72%)", High="Requires Review (45%)".

### Output shape

```ts
{
  dealTitle, clientName, riskLevel, riskScore,
  riskFactors: Array<{ factor, severity, detail }>,
  executiveSummary: { totalFee, totalCost, totalHours, marginPercent,
                       blendedRate, dealType, complexity },
  narrative: string,
  approvalLikelihood: string
}
```

### Limitations

- Risk score is a 3-bucket lookup, not a continuous score. Two deals at margin = target − 11 and margin = target − 30 both score 8.0.
- "89% approval rate" in the narrative is a fixed string — there's no actual approval-rate computation.
- Risk factors are additive booleans; no interaction terms (e.g., "High complexity AND large engagement" doesn't compound).
- Relationship years only triggers a positive risk factor at >3 years; nothing for new clients.

### Replacement target (F4.4)

Same path as UC-4 — structured LLM call with deal context, asking for a calibrated risk score (0–10) and a list of grounded risk factors with severity and rationale. The current bucket logic remains as a "sanity check" the LLM output must agree with within a tolerance.

---

## UC-6: Architecture Chat

**Endpoint**: `POST /api/ai/architecture-chat`
**Permission**: `viewArchitecture`
**Code**: `server/routes.ts:3767-3911` — keyword-router with ~150 lines of hardcoded answers (the "~600 lines" in the original audit included ancillary helpers; the handler itself is tighter than that estimate)

### Algorithm

A keyword-matching router. Each topic has an array of keywords; the first array whose keywords match the user's question wins. The answer is a hand-authored markdown blob.

Topics covered (~11):

- Architecture / production target / Azure
- CQRS / event sourcing readiness
- Bounded contexts
- Backend architecture
- Frontend architecture
- Database / Drizzle / schema
- Integrations (Dynamics, Workday, Intapp, Conga)
- RBAC
- Pricing engine
- AI use cases
- Approval state machine

### Limitations

- Keyword router. Anything unanticipated falls through to a generic response.
- Answers are **hand-authored** — they reflect a snapshot in time. They may drift from reality. (Concrete drift caught during the audit: `replit.md` claimed 13 tables when the schema has 42 — fixed in F0.7. The architecture-chat answers may have similar staleness; sweep on next read.)
- No grounding in the live database. Several answers claim live DB stats but those numbers are baked in.

### Replacement target

This is a candidate for an LLM replacement with a tool-call to a `repo_introspect` function that returns live counts (tables, endpoints, file sizes). Phase 4 — but lower priority than UC-1 through UC-5.

---

## UC-7: Autonomous Agent Draft

**Endpoint**: `POST /api/dynamics/opportunities/:id/agent-draft`
**Permission**: `createDeals`
**Code**: `server/routes.ts:2964-` (very large handler — runs to ~line 3580) and reference: `docs/autonomous-agent-sequence.md`

This is the most sophisticated of the agentic flows and the one most likely to feel "AI-like" to a stakeholder. It is **also entirely deterministic**.

### Algorithm (7 steps, each writes an `activity_log` row with `metadata.agentRun`)

1. **Setup** — `pickTemplateForName(opp.name)` returns `{businessUnit, serviceLine, complexity}` from a hand-curated keyword map. Confidence = 0.9 if a template matched, 0.4 otherwise. Insert deal in `pendingReviewAgent` status; link to opportunity.
2. **Prompts** — `createDefaultPrompts(dealId)` populates governed or fallback prompts; for each prompt, `pickContextualAnswer(prompt, ctx)` chooses an option based on a keyword table over (industry, segment, region, complexity, fee tier, close date, prior deal count, service line, BU). Each pick has a per-prompt confidence and `needsReview` flag.
3. **Scope** — keyword-match the opportunity name + service line + BU against the scope catalog, pick 4–8 items, insert `deal_scope_items`.
4. **Pricing** — call the existing `recalcPricingFromScope` helper. Recompute totals.
5. **Scenarios** — generate Standard / Premium / Value via existing scenario generator.
6. **Risk** — call the same logic as UC-5 to produce a risk narrative.
7. **Review** — produce a digestible summary with all 6 prior outputs + per-step confidence.

### Output

A drafted deal in `pendingReviewAgent` status, fully scoped + priced + scenarized, with each step's metadata in `activity_log`.

### What's actually impressive about this

- **It's the right shape for an LLM replacement**: clear step boundaries, structured per-step output, confidence flags, human-in-the-loop review.
- **It already has the audit trail** — every step is logged. When we swap step 1 for an LLM call, we get instant before/after comparability.

### What's not LLM-backed today

- Template picking is keyword matching.
- `pickContextualAnswer` is a long if/else over context attributes.
- Scope item selection is keyword matching.
- Risk narrative is the UC-5 string template.

### Replacement target (F3 / F4)

Step-by-step LLM swap. Start with step 6 (risk narrative — already a string template, lowest risk). Then step 5 (scenarios), then step 1 (setup — template picking is the highest-leverage, since it gates everything downstream). Step 2 (prompts) and step 3 (scope) are last because they require a structured-output LLM with strict JSON schemas to avoid breaking the pricing engine.

Each step's swap should be A/B tested using the existing `activity_log` confidence + `needsReview` data as ground truth on a labeled set of historical opportunities.

---

## A note on confidence values

Several heuristics return confidence scores (0.87 in UC-4, 0.4–0.9 in UC-7 step 1). These are **made up**. They are not calibrated against any outcome, and there's no historical record that says "the heuristic was right 87% of the time on this kind of input."

When LLMs replace these heuristics, **don't carry forward the made-up numbers**. Either:

- Calibrate against an outcome (e.g., did the human reviewer accept the agent's draft?), or
- Output a verbal hedge ("high confidence", "needs review") instead of a fake decimal.

This is a small thing but it's the kind of detail that makes "AI" feel like AI rather than feel like rebranded if/else. The current product has an opportunity here.
