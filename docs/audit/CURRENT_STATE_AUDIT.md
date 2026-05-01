# Current State Audit — NextGenPricing2

**Repository**: https://github.com/dhan99/NextGenPricing2
**Audit Date**: May 1, 2026
**Auditor**: Phase 0 Assessment
**Total commits**: 275
**Total LOC** (TS/TSX, server + shared + client/pages): ~41,800 lines

This is a **factual audit** of the actual code in `dhan99/NextGenPricing2` at the time of cloning, not a description of what was assumed to be there.

---

## 1. Headline Finding

This repository is **substantially more mature than a typical Replit-built POC**. It is a working full-stack application with:

- 42 database tables (not 13 as `replit.md` claims — schema has grown significantly)
- 154 REST endpoints across 6 server files
- 23 frontend pages with deep functionality (some pages exceed 4,000 LOC)
- 5 simulated AI use cases + an architecture chat
- 4 bi-directional integration adapters (Dynamics 365, Workday, Intapp Risk, Conga CLM)
- 6-role RBAC with per-feature permissions
- A 1,900-line architecture document and a ~530-line policy/playbook

**Implication for the refactor**: the Strangler Fig approach is the correct call. Replacing this codebase wholesale would discard a very large amount of working business logic that has already been validated in stakeholder demos.

---

## 2. Repository Layout (Actual)

```
NextGenPricing2/
├── .agents/                              # Replit Agent metadata
├── .replit                               # Replit config (Node 22, Postgres 16, Python 3.11)
├── attached_assets/                      # Requirements docs, user stories, technical outline
├── client/
│   └── src/
│       ├── components/
│       │   ├── AskDealPadAI.tsx
│       │   ├── GlobalAskAI.tsx
│       │   ├── ReadOnlyAdminBanner.tsx
│       │   ├── SortableHeader.tsx
│       │   └── layout/{AppLayout,Sidebar,Topbar}.tsx
│       ├── context/                      # AuthContext (persona/RBAC)
│       ├── hooks/                        # use-api.ts (React Query)
│       ├── lib/                          # utils
│       └── pages/                        # 23 page components
├── docs/
│   ├── autonomous-agent-sequence.md      # Mermaid sequence for autonomous agent
│   ├── integrations/
│   └── strategy/
├── exports/                              # Generated PPTX/PDF artifacts
├── public/
├── scripts/                              # Seeding, snapshots, build scripts
│   ├── apply-rbac.ts
│   ├── build-demo-driver.ts
│   ├── build_d365_workday_summary.py
│   ├── build_dealpad_integrations_deck.py
│   ├── build_integrations_deck.py
│   ├── integrations_samples.py
│   ├── post-merge.sh
│   ├── regen-snapshot.ts
│   ├── render-cots-vs-build-pdf.ts
│   └── seed-audit-scope.ts
├── server/
│   ├── conga.ts          (689 LOC)  Conga CLM adapter + routes
│   ├── db.ts             ( 10 LOC)  Drizzle client
│   ├── dynamics.ts       (909 LOC)  Dynamics 365 adapter + routes
│   ├── erp-scaling.ts    (310 LOC)  ERP scaling utilities
│   ├── index.ts          (798 LOC)  Server entry, schema push, seedAll
│   ├── intake.ts         (648 LOC)  Intake/extraction adapter + routes
│   ├── intapp.ts        (1,447 LOC) Intapp Risk adapter + routes
│   ├── rbac.ts           (153 LOC)  Role -> permission matrix + middleware
│   ├── routes.ts        (5,069 LOC) Primary REST surface (THE BIG ONE)
│   ├── seed-snapshot.json           Deterministic demo data
│   ├── seed.ts           (366 LOC)  seedAll() orchestrator
│   ├── snapshot-loader.ts (120 LOC) Snapshot replay
│   ├── tax-template.ts   (303 LOC)  Tax-specific scope template logic
│   └── workday.ts        (906 LOC)  Workday adapter + routes
├── shared/
│   ├── policy.ts         (151 LOC)  Approval gating policy (single source of truth)
│   └── schema.ts         (711 LOC)  Drizzle schema — 42 tables
├── DealPad_Architecture_Document.md     # 1,900-line architecture document
├── DealPad_Demo_Driver.pdf              # Demo script
├── replit-project-rigor-playbook.md     # ~530 lines on engineering rigor
├── replit.md                            # Project overview (slightly stale)
├── package.json                         # Express 5, React 19, Drizzle 0.45
├── drizzle.config.ts
├── tsconfig.json
└── vite.config.js
```

---

## 3. Tech Stack (Verified from package.json)

| Layer        | Technology                                    | Version       |
|--------------|-----------------------------------------------|---------------|
| Runtime      | Node.js (Replit Nix)                          | 22            |
| Backend      | Express                                       | 5.2.1         |
| ORM          | Drizzle ORM                                   | 0.45.2        |
| DB driver    | pg (node-postgres) + @neondatabase/serverless | 8.20.0 / 1.0.2|
| Frontend     | React + Vite                                  | 19 / 8.0.8    |
| Styling      | Tailwind CSS v4 (via @tailwindcss/vite)       | 4.2.2         |
| UI primitives| Radix UI (15 packages)                        | latest        |
| State / data | @tanstack/react-query                         | 5.99.0        |
| Routing      | wouter                                        | 3.9.0         |
| Charts       | recharts                                      | 3.8.1         |
| Animation    | framer-motion                                 | 12.38.0       |
| Validation   | zod                                           | 4.3.6         |
| PDF          | pdfkit                                        | 0.18.0        |
| Build/dev    | tsx, concurrently                             | 4.21.0 / 9.2.1|
| TypeScript   | TypeScript                                    | 5.6.3         |

**Notes**:
- `@neondatabase/serverless` is present alongside `pg`. Drizzle is configured against `DATABASE_URL`.
- No test framework is installed (no Vitest, Jest, Playwright, supertest). **This is a major gap.**
- No linter/formatter is installed (no ESLint, Prettier). **Another gap.**
- Tailwind v4 is non-trivial — ensure any new packages we add are compatible.

---

## 4. Database Schema (Actual — 42 tables)

Verified against `shared/schema.ts` (711 LOC):

### Core domain (10 tables)
- `clients`
- `deals`  ← **central aggregate** — has `engagementInputs jsonb` and `targetMarginPercent`
- `scope_catalog`  ← supports `isAssembly` + `parent_id` (self-referential)
- `scope_templates`, `scope_template_items`
- `deal_scope_items` ← unique index on (`deal_id`, `scope_item_id`)
- `roles`, `rate_cards`, `rate_card_entries`
- `pricing_lines` ← supports per-line rate override (`standardRate`, `rateOverridden`, `overrideReason`, `overrideBy`, `overrideAt`)

### Pricing & approvals (5 tables)
- `scenarios`
- `approvals`
- `prompt_responses`
- `prompt_sets`, `prompt_set_items`  ← governed prompts per BU + service line

### Operations & governance (4 tables)
- `margin_targets` ← firm / BU / service-line scope, resolved via `shared/policy.ts`
- `activity_log` ← seed of a future event stream
- `change_orders`
- `engagement_letters`

### Dynamics 365 integration (5 tables)
- `dynamics_owners`, `dynamics_accounts`, `dynamics_opportunities`
- `dynamics_sync_log`, `dynamics_settings`

### Intapp Risk integration (5 tables)
- `intapp_settings`, `intapp_screenings`, `intapp_hits`
- `intapp_mitigations`, `intapp_events`

### Intake (4 tables)
- `intake_requests`, `intake_extractions`
- `intake_approvals`, `intake_events`

### Workday integration (7 tables)
- `workday_settings`, `workday_cost_centers`, `workday_workers`
- `workday_rate_cards`
- `workday_validations`, `workday_validation_findings`, `workday_events`

### Conga CLM integration (2 tables)
- `conga_settings`, `conga_templates`

### Drizzle relations (8 declared)
`dealsRelations`, `clientsRelations`, `dealScopeItemsRelations`, `pricingLinesRelations`, `scenariosRelations`, `approvalsRelations`, `promptResponsesRelations`, `activityLogRelations`, `changeOrdersRelations`.

---

## 5. API Surface (Actual — 154 endpoints)

| File              | Endpoints | Notes |
|-------------------|-----------|-------|
| `server/routes.ts`  |  80       | Primary REST surface — deals, pricing, scope, scenarios, approvals, prompts, AI, dashboard, analytics, change orders, proposals |
| `server/intapp.ts`  |  16       | Intapp Risk screening, hits, mitigations, outcome push |
| `server/dynamics.ts`|  19       | Dynamics 365 accounts/opportunities, sync log, autonomous-agent draft |
| `server/workday.ts` |  21       | Cost centers, workers, validations, project push |
| `server/conga.ts`   |   7       | Templates, letter generation, delivery push |
| `server/intake.ts`  |  11       | Intake requests, extractions, approvals |
| **Total**           | **154**   |       |

Every mutating endpoint is gated by `requirePerm()` or `requireAnyPerm()` middleware from `server/rbac.ts`. The RBAC matrix has 6 personas: PDL, SLL, PO, FIN, QRM, IT.

---

## 6. AI Surface (Actual)

All five "AI" use cases are implemented as **deterministic heuristics** in `server/routes.ts`. No LLM is called today. This is verified in `replit-project-rigor-playbook.md` and visible in the route handler bodies.

| Endpoint                              | Type             | Status |
|---------------------------------------|------------------|--------|
| `POST /api/ai/deal-similarity`        | Heuristic        | ✅ Working |
| `POST /api/ai/effort-estimation`      | Heuristic        | ✅ Working |
| `POST /api/ai/margin-advisor`         | Heuristic        | ✅ Working |
| `POST /api/ai/scenario-recommendation`| Heuristic        | ✅ Working |
| `POST /api/ai/risk-summary`           | Heuristic        | ✅ Working |
| `POST /api/ai/architecture-chat`      | Keyword router   | ✅ Working — answers ~11 architecture topics |
| `GET  /api/ai/dashboard-insights`     | Heuristic        | ✅ Working |
| `POST /api/ai/ask`                    | Keyword router   | ✅ Working |

**Autonomous Agent** lives at `POST /api/dynamics/opportunities/:id/agent-draft` (in `server/dynamics.ts`). The full sequence is documented in `docs/autonomous-agent-sequence.md` and produces a deal in 7 deterministic steps with per-step confidence scores and `needsReview` flags. The agent is **prompt-aware** but **not LLM-backed**.

---

## 7. Frontend Inventory (23 pages)

| Page                              | LOC   | Purpose |
|-----------------------------------|-------|---------|
| `Login.tsx`                       |   203 | Persona selection |
| `Dashboard.tsx`                   |   747 | KPIs + recent deals + activity feed |
| `DealsList.tsx`                   |   543 | Deal list with search/filter, table+card view |
| `DealDetail.tsx`                  | 4,479 | **8-step wizard** — Setup → Scope → Assumptions → Pricing → Scenarios → Review → Approval → Summary |
| `NewDeal.tsx`                     |   339 | Create deal |
| `Analytics.tsx`                   |   260 | Trends, win rates, margins, service-line breakdown |
| `ChangeOrders.tsx`                |   416 | Change order management |
| `RenewalLeadsheet.tsx`            |   635 | Renewal leadsheet |
| `RateCards.tsx`                   |   100 | Rate card admin |
| `ScopeCatalogAdmin.tsx`           |   458 | Scope catalog browser/editor |
| `MarginTargetsAdmin.tsx`          |   456 | Firm/BU/service-line margin targets |
| `PromptSetsAdmin.tsx`             |   390 | Governed prompt sets |
| `CongaTemplatesAdmin.tsx`         |   164 | Conga templates |
| `DynamicsCRM.tsx`                 | 1,253 | Dynamics opportunity list + autonomous-agent trigger |
| `Intapp.tsx`                      |   954 | Intapp screenings, hits, mitigations |
| `WorkdayIntegration.tsx`          |   588 | Workday cost centers, workers, validations |
| `ArchitectureHub.tsx`             |   407 | 4-tab hub |
| `Architecture.tsx`                |   812 | Architecture overview |
| `ArchitectureInteractive.tsx`     |   557 | Interactive diagram |
| `ArchitectureDDD.tsx`             | 1,164 | DDD perspective |
| `ArchitectureCotsVsBuild.tsx`     |   220 | COTS vs build comparison |
| `ArchitectureIntegrations.tsx`    |   966 | Integrations overview |
| `ArchitectureIntappFederated.tsx` |   566 | Intapp federated model deep-dive |

**Observation**: `DealDetail.tsx` at 4,479 LOC is the largest page and is one of the highest-priority refactor candidates.

---

## 8. Integrations (Actual — Bi-directional, simulated)

All four integrations are **simulated** (no live API calls) but follow realistic DTOs and are wired bi-directionally. Auto-push fires on final approval transitions in `server/routes.ts`.

| Integration | Inbound                                 | Outbound (push)                                                |
|-------------|------------------------------------------|----------------------------------------------------------------|
| Dynamics 365| Accounts, opportunities, owners (sync)  | `autoPushDeal()` — status/owner/amount on deal change         |
| Workday     | Cost centers, workers, rate cards       | `autoPushWorkdayProject()` — project record + committed inc.  |
| Intapp Risk | Screenings, hits                        | `autoPushIntappOutcome()` — outcome + mitigation push          |
| Conga CLM   | Templates                               | `pushDelivery()` — letter delivery via email/esign/portal     |

The autonomous-agent draft in `server/dynamics.ts` calls back into Dynamics to write `dealpadDealId` onto the linked opportunity.

---

## 9. What Works ✅

Verified by code inspection (not runtime — full smoke test is part of Step 0.4 in this Phase 0 plan):

- 8-step deal wizard end-to-end (Setup → Summary)
- Deal CRUD with permission gating
- Scope catalog with assemblies (`isAssembly` flag) and parent/child hierarchy
- Pricing engine — `recalcPricingFromScope()` deterministically recomputes from scope × complexity × prompt multipliers across 7 roles
- Per-line rate override with audit fields (`standardRate`, `rateOverridden`, `overrideReason`, `overrideBy`, `overrideAt`)
- Scenario generation (Standard / Premium / Value)
- Approval state machine — `draft → submitted → approved/rejected`, server-enforced (cannot bypass via direct PATCH)
- Intapp pre-submission screening gate
- Margin target resolution (firm → BU → service line) via `shared/policy.ts` — single source of truth shared between client and server
- Per-deal margin target override (`targetMarginPercent`)
- Practice Lead approval triggers (margin below target, fee > $500K, scope ≥ 8 items)
- Activity log on every domain mutation
- Change orders
- PDF proposal generation (pdfkit)
- 5 AI heuristic endpoints + architecture chat
- Autonomous agent draft from Dynamics opportunity → deal in 7 steps
- 4 simulated bi-directional integrations
- Tax-specific rescaling (`server/tax-template.ts`)
- Engagement input presets per service line with validation + clamping

---

## 10. Technical Debt 🔧

These are the constraints the 48-week roadmap has to work around. Each is a real, observed issue — not a theoretical concern.

### 10.1 Anemic domain model
- All business logic lives in `server/routes.ts` (5,069 LOC) plus integration files.
- `Deal`, `PricingLine`, `Scenario`, `Approval` are **rows**, not aggregates. There is no `Deal` class with `addScopeItem()`, `submit()`, `approve()` methods that enforce invariants.
- Helpers like `recalcPricingFromScope`, `persistDealTotals`, `backfillDealTotals` are **pure functions** that operate on rows — close to a service layer, but procedural.
- Invariants (status transitions, calc parity, margin floors) are enforced via `if/else` in route handlers, not via aggregate methods.
- **Refactor pattern**: extract command handlers + rich aggregates without breaking the existing route handlers (Strangler Fig).

### 10.2 No domain events
- `activity_log` is the de-facto event stream — every mutation writes a row.
- But these are **strings**, not versioned events. There's no `DealSubmitted v1`, `PricingRecalculated v1`, etc.
- `replit.md` and the architecture chat both call this out as the seed of a future event stream — the gap is acknowledged.
- Auto-push to Dynamics/Workday/Intapp/Conga is fired **inline** from the approval handler. No outbox, no event bus.

### 10.3 No repository abstraction
- Every handler does `db.select().from(...)` directly via Drizzle.
- This is fine for a POC but means every test or refactor has to mock the DB.
- **Refactor pattern**: introduce `DealRepository`, `ScopeRepository`, etc. as thin wrappers, migrate one handler at a time.

### 10.4 No automated tests
- Zero test files. No Vitest, no Jest, no Playwright, no supertest. No CI workflow under `.github/workflows/`.
- Calc parity is enforced at runtime in `shared/policy.ts` (`calcParityToleranceDollars: 1`), not in tests.
- **This is the single biggest risk to the refactor.** Any change to `recalcPricingFromScope` or the approval state machine could silently break demos.
- **Action**: Step 0.5 of this plan stands up Vitest + supertest + Playwright before touching domain code.

### 10.5 No multi-entity model
- The Excel tax calculator models 4 entities under one engagement. The current schema has `deals → deal_scope_items` directly. There is no `deal_entities` table.
- All hours/revenue/cost roll up to the deal, not to individual entities.
- **This is feature 1.1 in the roadmap.**

### 10.6 Assembly metadata is incomplete
- `scope_catalog.isAssembly` exists with `parent_id` self-reference, **but**:
  - No `assembly_components` table with tier overrides (`ultimate_tier_override`, `enhanced_tier_override`, `essential_tier_override`).
  - No `quantity_formula` field for prompt-driven multipliers.
  - The expansion happens implicitly when scope items are added — no recursive expansion service.
- **This is feature 1.2 in the roadmap.**

### 10.7 No batch processing infrastructure
- `POST /api/deals/:id/clone` exists for single-deal cloning.
- No queue, no worker, no batch jobs table. Tax season renewals (1,000+ deals) would have to be done sequentially.
- **This is feature 1.3 in the roadmap.**

### 10.8 No vector / embedding infrastructure
- Deal similarity is a SQL aggregation by client + service line + complexity bucket. No `pgvector`, no embeddings.
- **This is feature 2.1 in the roadmap (DealPad Intelligence Engine).**

### 10.9 No real-time / WebSocket infrastructure
- All endpoints are synchronous REST. No WebSocket server, no Yjs, no presence.
- **This is feature 3.1 in the roadmap.**

### 10.10 No time-tracking, no budget-to-actuals
- No `time_entries` table. No `budget_actuals` table. No alerts.
- **These are features 2.2 and 2.3 in the roadmap.**

### 10.11 Hourly fees only
- `deals.totalFee` is computed from hours × rate. There are no `feeArrangement`, `fixedFeeAmount`, `cappedFeeAmount`, `contingentFeePercent` columns.
- **This is feature 2.4 in the roadmap (AFAs).**

### 10.12 Replit-specific coupling
- `.replit` defines workflows that run `npx tsx server/index.ts` and `npx vite` directly.
- `server/index.ts` runs `pushSchema()` + `seedAll()` on every boot — fine for Replit autoscale, **dangerous in production** (would re-seed on every container start).
- `vite.config.js` proxies `/api` to `localhost:3001` — needs adjustment for AWS deployment.
- `scripts/post-merge.sh` is Replit-specific.

### 10.13 `routes.ts` is a monolith
- 5,069 lines, 80 endpoints, helper functions inlined inside `registerRoutes()`. The architecture-chat endpoint alone embeds ~600 lines of hardcoded answer text.
- This is the file the Strangler Fig will spend the most time on.

### 10.14 Documentation drift
- `replit.md` says "13 tables". Schema has 42.
- `replit.md` describes `client/src/pages/` as having 13 pages. Actual count is 23.
- This is a small thing, but it means new contributors will be misled by `replit.md`.

---

## 11. What to Keep As-Is ✅

These are working well and the refactor should **not** touch them in the first pass:

| Asset                                          | Why keep |
|------------------------------------------------|----------|
| `client/src/components/layout/{AppLayout,Sidebar,Topbar}.tsx` | Solid layout; no business logic |
| `client/src/hooks/use-api.ts`                  | React Query setup is clean |
| `client/src/context/AuthContext`               | Persona/RBAC client state |
| `client/src/components/AskDealPadAI.tsx`, `GlobalAskAI.tsx` | UI components for AI chat |
| `shared/policy.ts`                             | Already extracted — single source of truth for approval gating, used by both client and server |
| `server/rbac.ts`                               | Clean role → permission matrix |
| `server/db.ts`                                 | 10 lines, just a Drizzle client |
| `drizzle.config.ts`                            | Migration config |
| `vite.config.js`                               | Functional (will need AWS-ready variant later) |
| `tsconfig.json`                                | Will need to extend, not replace |
| `DealPad_Architecture_Document.md`             | 1,900-line reference — preserve |
| `docs/autonomous-agent-sequence.md`            | Sequence diagram for agent flow — preserve |
| `replit-project-rigor-playbook.md`             | Engineering rigor checklist — preserve |
| `.agents/agent_assets_metadata.toml`           | Metadata for generated decks — preserve |
| `attached_assets/*`                            | Source-of-truth requirements docs — preserve |

---

## 12. What to Refactor 🔧

Priority order. Each is its own branch / PR:

| # | Target                                | Action                                                                 | Phase |
|---|---------------------------------------|------------------------------------------------------------------------|-------|
| 1 | `shared/schema.ts`                    | **Extend** with `deal_entities` table; `ALTER TABLE deal_scope_items ADD entity_id NULLABLE`; backfill | P1.1 |
| 2 | `server/routes.ts` deal endpoints     | **Add** `/api/deals/:id/entities` routes; do **not** modify existing scope-items routes yet | P1.1 |
| 3 | `client/src/pages/DealDetail.tsx`     | **Add** `EntityTabs` component above the existing scope step; do not rewrite the wizard | P1.1 |
| 4 | `shared/schema.ts`                    | **Add** `assembly_templates`, `assembly_components` tables (with tier overrides + `quantity_formula`) | P1.2 |
| 5 | `server/services/AssemblyExpansionService.ts` (NEW) | Recursive expansion + math.js formula evaluator | P1.2 |
| 6 | `shared/schema.ts`                    | **Add** `batch_renewal_jobs`, `batch_renewal_items`, `batch_adjustment_rules` tables | P1.3 |
| 7 | `services/batch-processor/` (NEW)     | Python + Celery + Redis worker for batch renewals | P1.3 |
| 8 | `packages/domain/` (NEW)              | Extract `Deal` aggregate, value objects (`Money`, `Percentage`, `DealStatus`) | P1.4 |
| 9 | `packages/application/` (NEW)         | Extract command handlers — `SubmitDealService`, `ApproveDealService` | P1.4 |
| 10| `server/routes.ts` submit/approve     | **Replace** handler bodies with calls to application services (one route at a time) | P1.4 |
| 11| `activity_log` consumers              | **Add** event bus + outbox; promote activity rows to versioned domain events | P1.4 |

After P1, the refactor moves into Phase 2 (Intapp parity — Intelligence Engine, budget tracking, time tracking, AFAs) and Phase 3 (moat builders — collaboration, client portal, predictive scope creep, voice, Slack/Teams, dynamic pricing).

---

## 13. What to Delete (Eventually, Not Now)

Nothing should be deleted in Phase 0. The Strangler Fig pattern requires the old code to keep working until the new code has fully replaced it.

Candidates for **eventual** deletion (after replacement is proven and tests pass):

- `STANDARD_PROMPTS` constant in `server/routes.ts` (lines 33–47) — once governed prompt sets fully cover all BU + service-line combinations.
- `scripts/post-merge.sh` — Replit-specific.
- The `pushSchema()` + `seedAll()` calls inside `server/index.ts start()` — once we move to a real CI/CD migration step, schema push should not happen on container boot.
- `server/seed-snapshot.json` — once we have a proper seed-data pipeline.

None of these should be touched during Phase 0. They're noted here so they don't get forgotten.

---

## 14. Risk Register

| Risk                                                       | Likelihood | Impact | Mitigation |
|------------------------------------------------------------|------------|--------|------------|
| Refactor breaks calc parity (`Σ line fees ≠ deal.totalFee`)| High       | High   | Stand up Vitest + golden-snapshot tests **before** touching `recalcPricingFromScope` (Step 0.5) |
| Refactor breaks approval gating                            | Medium     | High   | Integration test the state machine via supertest before refactoring |
| Migration to multi-entity loses data                       | Medium     | High   | Backup + dry-run script that runs on a copy of prod before applying |
| Replit-specific patterns leak into AWS                     | High       | Medium | Phase 0 documents every Replit dependency; AWS deploy is a separate workstream |
| Documentation drift gets worse, not better                 | High       | Low    | Each PR updates `replit.md` (rename to `PROJECT.md`?) and `docs/audit/` |
| Stakeholder loses confidence during 32-week refactor       | Medium     | High   | Demo-first principle: app is always running; merge to `main` ≠ broken `main` |

---

## 15. What's NOT in the audit

To keep this honest, here is what this audit explicitly did **not** verify:

- **Runtime behavior**: I read the code, but did not run `npm run dev` or hit any endpoint. The "What Works ✅" section is verified by code inspection, not by smoke test. **Step 0.4 of the Phase 0 plan is the smoke test.**
- **Database state**: I did not inspect a running PostgreSQL instance. The 42 tables are confirmed in the schema file, but I did not verify that all of them get created cleanly by `pushSchema()`.
- **Seed data correctness**: `server/seed.ts` and `server/seed-snapshot.json` are present, but I did not run them.
- **Integration adapter behavior**: The four integrations are confirmed as simulated by reading the adapter files, but I did not exercise the auto-push paths.
- **Frontend rendering**: I read the page files but did not verify they render without console errors.
- **Type-checking**: I did not run `tsc --noEmit` to confirm the codebase type-checks cleanly. **Step 0.4 includes this.**

Everything in this document that depends on runtime behavior is marked accordingly. Phase 0 Step 0.4 closes these gaps.
