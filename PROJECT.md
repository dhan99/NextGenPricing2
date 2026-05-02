# DealPad - NextGenApp Pricing & Scoping 2.0

> **File rename note (May 2026):** this file used to be `replit.md`. The
> rename landed alongside the Phase 1 close-out — keep this name going
> forward. `CLAUDE.md` is the AI-pair-programming guide; `PROJECT.md`
> (this file) is the project's living index.

## Overview
DealPad is a full-stack web application replacing Excel-based pricing and scoping workbooks for professional services firm Armanino LLP's Quote-to-Cash workflow. It demonstrates 5 AI-powered use cases across the entire vertical stack with a modern UX inspired by Ramp.com and Gusto.com.

## Current State
- **Phase**: Phase 1 of the 32-week refactor complete (F1.1 Multi-entity worksheets, F1.2 Assembly expansion, F1.3 Batch renewals, F1.4 DDD Strangler-Fig start). Backlog: `docs/refactoring/BACKLOG.md`.
- **Active Features**: Login/Persona Selection, Dashboard, Deal List, 8-step Deal Wizard, Rate Card Admin, Scope Catalog Admin, Architecture Hub (4-tab), Analytics Dashboard, Change Order Management, PDF Proposal Generation, Batch Renewal Processing (admin)
- **AI Features**: Deal Similarity, Effort Estimation, Margin Advisor, Scenario Recommendation, Risk Summary, Architecture Chat (heuristics today; pgvector RAG slated for F2.1)
- **Auth**: Role-based persona selection (PDL, SLL, PO, FIN, QRM, IT) with per-feature permissions

## Architecture
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS (client/src/)
- **Backend**: Express.js 5 on Node.js 22 (server/, tsx in dev)
- **Database**: PostgreSQL + Drizzle ORM (shared/schema.ts)
- **Domain layer (F1.4)**: `packages/domain` (pure TS, no I/O), `packages/application` (use-case orchestrators), `packages/infrastructure` (Drizzle repos, in-process EventBus, outbox dispatcher). Wired via TS path aliases (`@dealpad/domain`, `@dealpad/application`, `@dealpad/infrastructure`).
- **Styling**: Custom design tokens with Armanino brand colors (amber/orange #DA720F)

## Project Structure
```
client/src/          - React frontend
  context/           - AuthContext (persona/RBAC state)
  components/layout/ - AppLayout, Sidebar
  pages/             - Login, Dashboard, DealsList, DealDetail, NewDeal, RateCards, ScopeCatalogAdmin, ArchitectureHub, Architecture, ArchitectureInteractive, Analytics, ChangeOrders, BatchRenewals
  hooks/use-api.ts   - All API hooks (React Query)
  lib/utils.ts       - Utility functions
  index.css          - Tailwind + design tokens
server/              - Express backend
  index.ts           - Server entry, schema push, seeding, outbox dispatch
  routes.ts          - REST surface (CRUD + AI + Analytics + Change Orders + Proposal + Batch Renewals + DDD-migrated submit/approval endpoints)
  db.ts              - Database connection
  seed.ts            - Sample data seeding
  services/          - Domain-adjacent services: pricing, AssemblyExpansion, BatchRenewal, dealServices (DI container), gates/, subscribers/
  lib/req.ts         - paramStr/paramInt/headerStr/queryStr (Express 5.x type-safe extractors)
shared/              - Shared code
  schema.ts          - Drizzle ORM schema (all 49 tables + relations; see `docs/audit/schema_inventory.csv` for the full list)
  policy.ts          - Approval-trigger constants used by both ends
packages/            - DDD strangler-fig packages (F1.4)
  domain/            - Money, Percentage, DealStatus, Deal aggregate, versioned events, errors
  application/       - SubmitDealService, ApproveDealService, RejectDealService, gate ports
  infrastructure/    - DrizzleDealRepository, InProcessEventBus, OutboxDispatcher
services/            - Standalone workers (deployable independently)
  batch-processor/   - Python + Celery + Redis worker for F1.3 batch renewals
```

## Key Routes
- `/` - Dashboard with KPIs, recent deals, activity feed
- `/deals` - Deal list with search, filter, table/card view
- `/deals/new` - Create new deal form
- `/deals/:id` - Deal detail with 8-step wizard (Setup, Scope, Assumptions, Pricing, Scenarios, Review, Approval, Summary)
- `/deals/:id/change-orders` - Change order management for a deal
- `/analytics` - Analytics dashboard with charts, trends, service line breakdown
- `/admin/rate-cards` - Rate card management
- `/admin/scope-catalog` - Scope catalog browser
- `/architecture` - Architecture Hub (4-tab: Overview, Interactive, AI Chat, Document). The Interactive tab's "External Integrations" sub-page now hosts three providers — Dynamics 365, Workday, and **Intapp**. Selecting Intapp reveals an extra "Federated Model" pill that renders the deep-dive component `client/src/pages/ArchitectureIntappFederated.tsx` (Intake/Screening explainer, AI confidence-routed extraction, parallel-tracks SVG, reviewer matrix, outbound push narrative with server-side dedupe called out as a forward-looking gap).

## API Endpoints
- `GET /api/dashboard/summary` - KPI summary
- `GET/POST /api/deals` - Deal CRUD
- `GET/PATCH /api/deals/:id` - Deal detail/update
- `GET /api/scope-catalog` - Scope catalog items
- `GET/POST/DELETE /api/deals/:dealId/scope-items` - Deal scope items
- `GET /api/roles` - Available roles
- `GET /api/rate-cards` - Rate cards
- `GET/PATCH /api/deals/:dealId/pricing` - Pricing grid
- `GET /api/deals/:dealId/scenarios` - Pricing scenarios
- `GET/POST /api/deals/:dealId/approvals` - Approval workflow
- `GET/POST /api/deals/:dealId/change-orders` - Change order management
- `PATCH /api/change-orders/:id` - Update change order status
- `GET /api/analytics/overview` - Analytics with trends, win rates, margins, service line breakdown
- `GET /api/deals/:dealId/proposal` - Generate branded HTML proposal (or ?format=json for data)
- `POST /api/ai/deal-similarity` - AI deal matching
- `POST /api/ai/effort-estimation` - AI effort estimation
- `POST /api/ai/margin-advisor` - AI margin optimization
- `POST /api/ai/scenario-recommendation` - AI scenario recommendation
- `POST /api/ai/risk-summary` - AI risk assessment
- `POST /api/ai/architecture-chat` - Architecture conversational AI (11 topics with live DB stats)
- `POST /api/ai/deal-similarity` - **F2.1.4 — pgvector k-NN.** Anchor on `dealId` (preferred) or fall back to `clientId`/`serviceLine`/`businessUnit` for a virtual-anchor query. Heuristic fallback if pgvector unavailable. Returns `{ similarDeals, insights: { mode: "knn" | "heuristic", ... } }`.
- `POST /api/admin/intelligence/backfill` - Bulk recompute fingerprint + embedding for every deal that's missing one (manageRateCards-gated). Idempotent under no concurrent writes.
- `POST /api/deals/:id/intelligence/recompute` - Single-deal recompute (editDeals-gated).
- `POST /api/deals/:id/submit` - Submit deal for approval (Intapp gating, runs through `SubmitDealService`/F1.4)
- `GET/POST /api/deals/:dealId/entities` - Multi-entity worksheets (F1.1)
- `POST /api/deals/:dealId/scope-items/from-assembly` - Apply assembly template (F1.2)
- `GET /api/assemblies` / `GET /api/assemblies/:id/components` / `POST /api/assemblies/:id/expand` - Assembly catalog + dry-run expansion (F1.2)
- `GET/POST /api/batch-renewals` / `POST /api/batch-renewals/:id/start` / `GET /api/batch-renewals/:id/items` - Batch renewal jobs (F1.3)
- `GET/POST /api/batch-adjustment-rules` - Reusable adjustment rules for batch renewals (F1.3)

Authoritative endpoint list: `docs/audit/api_inventory.csv` (170 endpoints; regenerated by `python3 scripts/audit/extract_endpoints.py`).

## Database Tables (53 total — +1 in F1.1 for `deal_entities`, +2 in F1.2 for `assembly_templates` + `assembly_components`, +3 in F1.3 for `batch_renewal_jobs` + `batch_renewal_items` + `batch_adjustment_rules`, +1 in F1.4 for `domain_events_outbox`, +2 in F2.2 for `budget_actuals` + `budget_alerts`, +1 in F2.3 for `time_entries`, +1 in F3.2 for `portal_invites`)

Authoritative list: `docs/audit/schema_inventory.csv` (auto-regenerated by `python3 scripts/audit/extract_schema.py`). Grouped:

- **Core domain (13)**: clients, deals, **deal_entities** *(F1.1)*, scope_catalog, scope_templates, scope_template_items, deal_scope_items, **assembly_templates** *(F1.2)*, **assembly_components** *(F1.2)*, roles, rate_cards, rate_card_entries, pricing_lines
- **Pricing & approvals (5)**: scenarios, approvals, prompt_responses, prompt_sets, prompt_set_items

> **F2.1 schema columns on `deals`** (nullable, additive): `fingerprint JSONB` (F2.1.1, feature snapshot for the IntelligenceEngine) and `embedding vector(1536)` (F2.1.2, dense vector for k-NN similarity). Both default to NULL; the IntelligenceEngine fills them on first read and a backfill job catches up legacy rows. Requires pgvector extension on the cluster (`CREATE EXTENSION vector` is run in `pushSchema()`, gracefully no-ops if the role lacks permission).
>
> **F2.4 fee-arrangement columns on `deals`** (additive): `fee_arrangement` TEXT (default `'time_and_materials'`) plus 6 nullable fee-shape columns — `fixed_fee_amount`, `capped_fee_amount`, `contingent_fee_percent`, `contingent_fee_base`, `retainer_amount`, `success_fee_percent`. Allowed `fee_arrangement` values: `time_and_materials | fixed | capped | contingent | retainer | hybrid`. Pricing engine fork in F2.4.2 reads these to project totals.
- **Operations & governance (11)**: margin_targets, activity_log, change_orders, engagement_letters, **batch_renewal_jobs** *(F1.3)*, **batch_renewal_items** *(F1.3)*, **batch_adjustment_rules** *(F1.3)*, **domain_events_outbox** *(F1.4)*, **budget_actuals** *(F2.2)*, **budget_alerts** *(F2.2)*, **time_entries** *(F2.3)*
- **Dynamics 365 integration (5)**: dynamics_owners, dynamics_accounts, dynamics_opportunities, dynamics_sync_log, dynamics_settings
- **Intapp Risk integration (5)**: intapp_settings, intapp_screenings, intapp_hits, intapp_mitigations, intapp_events
- **Intake (4)**: intake_requests, intake_extractions, intake_approvals, intake_events
- **Workday integration (7)**: workday_settings, workday_cost_centers, workday_workers, workday_rate_cards, workday_validations, workday_validation_findings, workday_events
- **Conga CLM integration (2)**: conga_settings, conga_templates

## Bi-Directional Integrations (simulated, pilot-grade)
All four platforms now push outcomes back from DealPad in addition to inbound sync. Auto-push fires on final approval transitions (approved/rejected) in `server/routes.ts`.
- **Dynamics 365** (`server/dynamics.ts`): `autoPushDeal()` syncs status/owner/amount on changes.
- **Workday** (`server/workday.ts`): `pushProject()` + `autoPushWorkdayProject()` create a project record on approval and increment cost-center `committed`. Idempotent via activity_log event guard. Route: `POST /api/workday/deals/:id/push`.
- **Intapp Risk** (`server/intapp.ts`): `pushOutcome()` + `pushMitigation()` + `autoPushIntappOutcome()` fire on deal approval/rejection and on mitigation resolve/waive/reject. Routes: `POST /api/intapp/screenings/:id/push-outcome`, `POST /api/intapp/mitigations/:id/push`.
- **Conga CLM** (`server/conga.ts`): `pushDelivery()` delivers letters via email/esign/portal and flips `engagement_letters.status` to `delivered`. Route: `POST /api/conga/letters/:id/deliver`.

## Workflows
- Backend Server: `npx tsx server/index.ts` (port 3001)
- DealPad Frontend: `npx vite --host 0.0.0.0 --port 5000` (port 5000, proxies /api to 3001)

## Design References
- UX: Ramp.com (minimal, high-contrast) + Gusto.com (warm, sidebar nav, card hierarchy)
- Brand: Armanino LLP (amber #DA720F, olive #949300, Roboto + Playfair Display)
- No emojis in UI

## Key Documents
- `attached_assets/requirements-executice-summary_*.txt` - Requirements executive summary
- `attached_assets/scope_*.txt` - Scope of solution
- `attached_assets/Dealpad-technical-outline_*.pdf` - Technical outline
- `attached_assets/3._User_Stories_*.pdf` - 69 user stories across 8 epics
- `DealPad_Architecture_Document.md` - 1,900-line architecture document with 17 Mermaid diagrams

## Production Seeding
- `server/seed.ts` exports `seedAll()`, the single startup orchestrator. It runs core seeds (database, default prompt set, snapshot loader) and then all integration seeds (Dynamics, Intapp, Workday) in order.
- `server/index.ts` `start()` calls `pushSchema()` then `seedAll()` BEFORE `app.listen()`. Schema push or core seed failure aborts startup (`process.exit(1)`); integration seed failures are logged but non-fatal.
- Integration `register*Routes()` no longer fire-and-forget seeds; all seeding flows through `seedAll()`.
- Operators can re-trigger seeding via `POST /api/admin/reseed` with header `x-admin-token: <ADMIN_RESEED_TOKEN>` (or `{ "token": "..." }` body). Returns 503 if `ADMIN_RESEED_TOKEN` is unset, 401 on bad token, 200/207 with per-step status.
- Deployment: autoscale runs `npx tsx server/index.ts` which goes through the same `pushSchema + seedAll` path. `DATABASE_URL` must be set on the deployment.
