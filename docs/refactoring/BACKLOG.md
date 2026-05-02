# Refactoring Backlog — NextGenPricing2

This backlog is the operational unit of work for the 32-week Strangler Fig refactor. It is **derived from**:

- `docs/audit/CURRENT_STATE_AUDIT.md` — what's actually in the repo
- `docs/audit/api_inventory.csv` — 154 endpoints
- `docs/audit/schema_inventory.csv` — 42 tables
- `DEALPAD_ULTIMATE_ROADMAP.md` — the 48-week feature roadmap

Every item references **real files** in the repo. If a path is wrong, fix this document — don't invent a new path.

---

## How to read this backlog

- **ID** — used in commit messages and branch names: `feat/F1.1-multi-entity`
- **Touch** — files this item changes. `(NEW)` means create, `(EXTEND)` means add to, `(REPLACE)` means rewrite (rare in P1).
- **Done when** — the merge criterion. If this list isn't satisfied, the PR doesn't ship.
- **Estimate** — calendar weeks for one developer working with full context. Halve for two devs in parallel where the files don't overlap.

The backlog is sequenced. Don't skip ahead — later items depend on earlier ones (e.g., F1.4 DDD refactor depends on the test scaffold from F0.5).

---

## PHASE 0 — Assessment & Preparation (Week 0)

These items are the prerequisite for any code change. Skip them and the rest of the refactor will silently regress demos.

### F0.1 — Audit the existing codebase

- **Touch**: `docs/audit/CURRENT_STATE_AUDIT.md` (NEW), `docs/audit/api_inventory.csv` (NEW), `docs/audit/schema_inventory.csv` (NEW), `scripts/audit/extract_endpoints.py` (NEW), `scripts/audit/extract_schema.py` (NEW)
- **Done when**:
  - Audit document committed to `docs/audit/`
  - The two CSVs are reproducible by re-running the extractor scripts
  - Audit lists every working feature, every gap, and every Replit-specific coupling
- **Estimate**: 3 days

### F0.2 — Set up branch strategy & PR template

- **Touch**: `.github/pull_request_template.md` (NEW), `.github/CODEOWNERS` (NEW), `docs/refactoring/BRANCHING.md` (NEW)
- **Done when**:
  - `develop` branch exists and is protected
  - Each feature branch is named `feat/<id>-<slug>` or `refactor/<id>-<slug>`
  - PR template requires: linked issue, smoke-test pass, test coverage delta, screenshots if UI
- **Estimate**: 0.5 days

### F0.3 — Document Replit-specific couplings

- **Touch**: `docs/audit/REPLIT_COUPLINGS.md` (NEW)
- **Why**: We will eventually deploy to AWS. Every Replit-specific behavior we don't catalog now becomes a surprise later.
- **Done when**:
  - Document lists `.replit`, `scripts/post-merge.sh`, the `pushSchema()`+`seedAll()` boot sequence, the `vite.config.js` proxy, and the `@neondatabase/serverless` driver
  - Each item has a "decision when we move to AWS" note
- **Estimate**: 0.5 days

### F0.4 — Smoke test passes on a fresh clone

- **Touch**: `scripts/audit/smoke_test.sh` (NEW), `.env.example` (EXTEND if missing)
- **Done when**:
  - `bash scripts/audit/smoke_test.sh` exits 0 on a fresh clone with `DATABASE_URL` set
  - Script runs `npm install`, `tsc --noEmit`, boots backend on 3001, boots frontend on 5000, probes 5 read-only endpoints, tears down cleanly
  - Any failure prints the relevant log tail and exits non-zero
- **Estimate**: 1 day

### F0.5 — Stand up a test framework

- **Touch**:
  - `package.json` (EXTEND — add `vitest`, `supertest`, `@vitest/coverage-v8` to devDeps; add `test`, `test:watch`, `test:coverage` scripts)
  - `vitest.config.ts` (NEW)
  - `tests/calc-parity/calc-parity.golden.test.ts` (NEW — scaffold provided)
  - `tests/README.md` (NEW)
  - `server/services/pricing.ts` (NEW — extract `recalcPricingFromScope`, `persistDealTotals`, `backfillDealTotals` from `server/routes.ts` lines 322–565)
  - `server/routes.ts` (EXTEND — re-import the extracted functions; do NOT change their behavior)
- **Why first**: §14 of the audit identifies calc parity as the #1 refactor risk. Without a test, we cannot prove the refactor doesn't break it.
- **Done when**:
  - `npm test` runs Vitest and exits 0
  - Calc parity test exists, passes, and pins down current pricing behavior for at least 3 representative deals from the seed snapshot
  - `recalcPricingFromScope` is importable from `server/services/pricing.ts`
  - `git diff server/routes.ts` shows only import changes — handler bodies are unchanged
- **Estimate**: 3 days
- **Risk**: Pricing behavior changes silently because of a subtle ESM/CJS import. Mitigation: run the smoke test before AND after the extraction, and golden-snapshot the totals.

### F0.6 — Stand up linting & formatting

- **Touch**: `.eslintrc.cjs` (NEW), `.prettierrc.json` (NEW), `package.json` (EXTEND), `.github/workflows/lint.yml` (NEW)
- **Done when**:
  - `npm run lint` exits 0 on the existing codebase (ESLint config has to be permissive enough for the current state — we'll tighten over time)
  - Prettier formats consistently with the existing code style (single quotes, 2-space indent — match what's already there)
  - GitHub Action runs lint on every PR
- **Estimate**: 1 day

### F0.7 — Document the existing autonomous agent and the AI heuristics

- **Touch**: `docs/audit/AI_HEURISTICS.md` (NEW)
- **Why**: When Phase 4 swaps heuristics for LLMs, we need a precise record of what each heuristic does today so we can A/B test the replacement.
- **Done when**:
  - Document covers all 5 `/api/ai/*` endpoints + `/api/ai/architecture-chat` + the autonomous agent
  - For each, lists: input shape, scoring/branching logic in plain English, output shape, where the code lives
- **Estimate**: 1 day

**Phase 0 total: ~7 working days for one engineer.**

---

## PHASE 1 — Foundation (Weeks 1-12)

### F1.1 — Multi-entity worksheets *(2 weeks)*

Tax practice models 4 entities under one engagement (1040 + 1120 + 1065 + 1120S). Today the schema flattens this into the deal.

- **Touch**:
  - `shared/schema.ts` (EXTEND): add `dealEntities` table; add nullable `entityId` column to `dealScopeItems` and `pricingLines`
  - `scripts/migrations/001_multi_entity_backfill.ts` (NEW): for every existing deal, create a default "Primary Entity" and assign all existing scope items to it
  - `server/routes.ts` (EXTEND): add `/api/deals/:dealId/entities` GET/POST + `/api/deal-entities/:id` PATCH/DELETE
  - `server/services/pricing.ts` (EXTEND): make `recalcPricingFromScope` aware of entities — totals roll up entity → deal
  - `client/src/components/entities/EntityTabs.tsx` (NEW)
  - `client/src/pages/DealDetail.tsx` (EXTEND): mount `EntityTabs` above the existing scope step. Do NOT rewrite the wizard.
- **Done when**:
  - All existing deals have at least one entity after migration
  - Existing scope-item endpoints continue to work (backward compat)
  - Adding/removing/switching entities is visible in the UI
  - Calc parity golden test still passes
  - New endpoints have at least integration test coverage
- **Estimate**: 2 weeks

### F1.2 — Assembly expansion engine *(3 weeks)*

`scope_catalog.isAssembly` exists but expansion is implicit. We need explicit `assembly_components` with tier overrides + prompt-driven formulas.

- **Touch**:
  - `shared/schema.ts` (EXTEND): add `assemblyTemplates`, `assemblyComponents` tables (with `ultimateTierOverride`, `enhancedTierOverride`, `essentialTierOverride`, `quantityFormula`, `promptId`)
  - `server/services/AssemblyExpansionService.ts` (NEW): recursive expansion + formula evaluator (math.js, sandboxed)
  - `server/routes.ts` (EXTEND): `/api/assemblies` GET, `/api/assemblies/:id/components` GET, `/api/assemblies/:id/expand` POST
  - `client/src/components/scope/AssemblyPicker.tsx` (NEW)
  - `client/src/pages/DealDetail.tsx` (EXTEND): integrate picker into scope step
  - `package.json` (EXTEND): add `mathjs`
  - `tests/assembly/expansion.test.ts` (NEW): unit tests for formula evaluation incl. malicious input
- **Done when**:
  - Adding an assembly with tier=Ultimate + 3 prompt responses produces N pricing lines that match Excel calculator within $1
  - Formula evaluator rejects anything that isn't pure arithmetic on the allowed identifiers
  - Existing single-item scope adds still work
- **Estimate**: 3 weeks

### F1.3 — Batch renewal processing *(3 weeks)*

Tax season needs 1,000+ renewal deals processed in <2 days. Today there's only a single-deal `POST /api/deals/:id/clone`.

- **Touch**:
  - `shared/schema.ts` (EXTEND): add `batchRenewalJobs`, `batchRenewalItems`, `batchAdjustmentRules`
  - `services/batch-processor/` (NEW): Python + Celery + Redis worker
    - `app.py`, `tasks.py`, `requirements.txt`, `Dockerfile`, `README.md`
  - `server/services/BatchRenewalService.ts` (NEW): job orchestrator (enqueues to Celery via Redis)
  - `server/routes.ts` (EXTEND): `/api/batch-renewals` GET/POST, `/api/batch-renewals/:id/items` GET, `/api/batch-renewals/:id/start` POST
  - `client/src/pages/BatchRenewals.tsx` (NEW)
  - `tests/batch/variance.test.ts` (NEW): variance calculation
- **Done when**:
  - 100-deal batch completes in <10 minutes locally
  - Items above variance threshold are flagged for review (not auto-approved)
  - Failed items have error messages, not silent fails
  - Existing `/clone` endpoint still works
- **Estimate**: 3 weeks

### F1.4 — DDD refactor (Strangler Fig start) *(4 weeks)*

The big one. Extract `Deal` aggregate, value objects, and a thin application-services layer. **Replace one route at a time** — never break `main`.

- **Touch**:
  - `packages/domain/` (NEW workspace)
    - `src/shared/{Money,Percentage}.ts`
    - `src/deal/{Deal,DealStatus,DealStatusTransition}.ts`
    - `src/deal/events.ts` (versioned domain events)
  - `packages/application/` (NEW workspace)
    - `src/services/{SubmitDealService,ApproveDealService,RejectDealService}.ts`
  - `packages/infrastructure/` (NEW workspace)
    - `src/repositories/DealRepository.ts` (wraps existing Drizzle calls)
    - `src/events/EventBus.ts` (in-process for now; outbox pattern wired but no Service Bus yet)
  - `package.json` (EXTEND): convert root to npm workspaces; add `packages/*`
  - `tsconfig.json` (EXTEND): add path mappings for `@dealpad/domain`, `@dealpad/application`, `@dealpad/infrastructure`
  - `server/routes.ts` (EXTEND, then REPLACE handler bodies one at a time):
    - First: `POST /api/deals/:id/submit` calls `SubmitDealService` instead of inline logic
    - Then: `POST /api/deals/:dealId/approvals` calls `ApproveDealService`
    - Then: `PATCH /api/approvals/:id` for accept/reject
  - `server/index.ts` (EXTEND): wire up event bus + outbox flush job
  - `tests/domain/*.test.ts` (NEW): unit tests for `Deal.submit()`, `Deal.approve()`, status transitions
  - `tests/integration/submit-deal.test.ts` (NEW): supertest integration test
- **Done when**:
  - Submit and approve flows go through the domain layer; activity_log still gets the same rows; auto-push to Dynamics/Workday/Intapp/Conga still fires
  - Calc parity golden test still passes
  - At least 80% line coverage on `packages/domain/`
  - All other route handlers are untouched (we'll get to them in P2)
- **Estimate**: 4 weeks
- **Risk**: domain refactor introduces subtle behavior changes. Mitigation: golden tests, supertest integration tests, smoke test on every PR.

**Phase 1 total: ~12 weeks for 1 engineer; can compress to 8 weeks with 2 engineers if F1.1 / F1.2 / F1.3 are parallelized after F0.5 lands.**

---

## PHASE 2 — Intapp Parity (Weeks 13-24)

### F2.1 — DealPad Intelligence Engine (Engagement DNA equivalent) *(4 weeks)*

- **Touch**: `shared/schema.ts` (EXTEND — add `embedding vector(1536)` and `fingerprint jsonb` to `deals`); `server/services/IntelligenceEngine.ts` (NEW); `services/ml-service/embeddings.py` (NEW); migration to install `pgvector` extension; refactor `POST /api/ai/deal-similarity` to use vector search.
- **Done when**: similarity returns 5 results in <500ms; quality is judged better than current heuristic on a labeled set of 50 historical deals.
- **Estimate**: 4 weeks

### F2.2 — Budget-to-actuals monitoring *(4 weeks)*

- **Touch**: `shared/schema.ts` (EXTEND — `budgetActuals`, `budgetAlerts`); `server/services/BudgetMonitorService.ts` (NEW); cron-style alert check via Celery beat; new `Budget` UI on `DealDetail.tsx`.
- **Done when**: alerts fire <1 minute after a time entry breaches threshold.
- **Estimate**: 4 weeks

### F2.3 — Time tracking module *(4 weeks)*

- **Touch**: `shared/schema.ts` (EXTEND — `timeEntries`); new `TimeEntry` page; AI-assisted entry endpoint (`POST /api/time/suggest`) using Microsoft Graph + Azure OpenAI; supertest coverage.
- **Done when**: AI suggestions have >80% acceptance rate on a manual eval set.
- **Estimate**: 4 weeks

### F2.4 — Alternative fee arrangements *(4 weeks, partly parallel with F2.3)*

- **Touch**: `shared/schema.ts` (EXTEND `deals` with `feeArrangement`, `fixedFeeAmount`, `cappedFeeAmount`, `contingentFeePercent`, `contingentFeeBase`, `retainerAmount`, `successFeePercent`); `client/src/components/pricing/FeeArrangementPicker.tsx` (NEW); update pricing engine to handle non-hourly arrangements; update calc parity test to cover all arrangements.
- **Done when**: fixed/capped/contingent/hybrid deals can be created, priced, and approved end-to-end.
- **Estimate**: 4 weeks

---

## PHASE 3 — Moat Builders (Weeks 25-48)

(Briefer here — full specs in `DEALPAD_ULTIMATE_ROADMAP.md` Part 4.)

| ID   | Feature                          | Touch (high level)                                      | Estimate |
|------|----------------------------------|---------------------------------------------------------|----------|
| F3.1 | Real-time collaborative scoping  | Yjs + WebSocket server (new); refactor `DealDetail.tsx` | 8 wk     |
| F3.2 | Client self-service portal       | Magic-link auth; `/portal/*` routes; new client UI      | 6 wk     |
| F3.3 | Predictive scope creep detection | Azure ML training pipeline; weekly cron + Slack alerts  | 10 wk    |
| F3.4 | Voice-to-scope                   | Azure Speech + GPT-4o function calling                  | 4 wk     |
| F3.5 | Slack/Teams native apps          | Bolt.js Slack app + slash commands                      | 6 wk     |
| F3.6 | Dynamic rate optimization        | Capacity + LTV + seasonality model                      | 8 wk     |

---

## PHASE 4 — AI Production (Weeks 25-36, parallel with P3)

| ID   | Feature                                  | Touch                                                | Estimate |
|------|------------------------------------------|-------------------------------------------------------|----------|
| F4.1 | Replace UC-1 with pgvector RAG           | `server/services/IntelligenceEngine.ts`              | 2 wk     |
| F4.2 | Replace UC-2 with trained ML             | `services/ml-service/effort_estimator.py`            | 3 wk     |
| F4.3 | Replace UC-3 with linear program         | `services/ml-service/margin_optimizer.py`            | 2 wk     |
| F4.4 | Replace UC-4 / UC-5 with structured LLM  | `server/services/llm.ts` + Anthropic / Azure OpenAI  | 1 wk     |
| F4.5 | AI observability & token analytics       | `server/middleware/aiTelemetry.ts`                   | 2 wk     |

---

## Out-of-band tasks

These don't block any phase but should land within the first quarter of the refactor:

- Rename `replit.md` → `PROJECT.md` and rewrite to match reality (42 tables, 23 pages, 154 endpoints).
- Move generated artifacts (`exports/*.pptx`, `DealPad_Demo_Driver.pdf`) out of git — they're 38KB+ binaries that bloat clones. Use git-lfs or a release artifact store.
- Add `.github/workflows/ci.yml`: lint + typecheck + test + smoke on every PR.
- Add `.github/dependabot.yml`: weekly security updates.

---

## Tracking

Each item above should become a GitHub Issue with the same ID. PRs should reference the issue with `Closes #<id>`. The audit document is the master reference; this backlog is the operational unit of work.
