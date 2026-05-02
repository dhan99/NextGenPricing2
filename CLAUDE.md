# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DealPad — full-stack web app replacing Excel-based pricing/scoping workbooks for Armanino LLP's Quote-to-Cash workflow. PoC stage with 5 AI use cases, RBAC, analytics, change orders, proposal generation, and four simulated integrations (Dynamics 365, Workday, Intapp, Conga).

A **32-week strangler-fig refactor** is in progress (Phase 0 landed in commit `f914e87` on `develop`). New work follows `docs/refactoring/BACKLOG.md`. Don't start anything off `main` — branch off `develop`.

## Authoritative docs (read these before non-trivial work)

| Doc | What it's for |
|---|---|
| `docs/audit/CURRENT_STATE_AUDIT.md` | **The headline.** 42 tables, 154 endpoints, 23 pages. Trust this over `replit.md` for counts — `replit.md` still says "13 tables", which is stale (called out in audit §10). |
| `docs/audit/AI_HEURISTICS.md` | What each `/api/ai/*` endpoint actually does (heuristics, not LLMs). Cited line numbers may have drifted; verify before quoting. |
| `docs/audit/REPLIT_COUPLINGS.md` | Replit-specific code that needs to come out before AWS migration. Anything that only works on Replit goes on this list, not into the new code. |
| `docs/audit/api_inventory.csv` / `schema_inventory.csv` | Auto-generated from the live tree by the extractor scripts. Re-run them in any PR that adds endpoints or tables (see Commands). |
| `docs/refactoring/BACKLOG.md` | The 32-week roadmap. Every backlog item has an ID (`F0.x`, `F1.x`, …). |
| `docs/refactoring/BRANCHING.md` | Branch + PR rules. **Binding.** See "Branching & PR rules" below. |
| `replit.md` | Older living index. Still useful for routes/integration narrative, but the table/endpoint counts are stale — defer to the audit. |
| `replit-project-rigor-playbook.md` | House rules. Most operative: **No silent fallbacks** (structured error codes, never swallow). **Smallest viable change** (no smuggled refactors). **Definition of done includes validation** (restart workflow, hit the path, read logs). **No emojis in product UI.** **Persona-aware UX.** |

## Commands

```bash
# Dev loop
npm run dev           # concurrently runs server (3001) + vite (5000) — preferred
npm run dev:server    # backend only:  tsx server/index.ts            (port 3001)
npm run dev:client    # frontend only: vite --host 0.0.0.0 --port 5000 (proxies /api → :3001)
npm run build         # vite build → dist/public
npm run preview       # serve built bundle
npm run db:push       # drizzle-kit push (rare — schema is normally pushed by server boot)

# Typecheck (no script alias yet)
npx tsc --noEmit

# Audit / safety tooling (added in F0.1–F0.4)
bash scripts/audit/smoke_test.sh                        # install + tsc + boot both servers + probe endpoints
bash scripts/audit/backup_db.sh <label>                 # pg_dump → backups/dealpad_<label>_<ts>.sql; run BEFORE any migration
python3 scripts/audit/extract_endpoints.py > docs/audit/api_inventory.csv
python3 scripts/audit/extract_schema.py    > docs/audit/schema_inventory.csv
```

**Test / lint / format scripts (wired in F0.5/F0.6):** `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run test:golden:write`, `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`. ESLint config is **flat** (`eslint.config.js`) since ESLint 9 dropped legacy `.eslintrc.*` support. Phase 0 baseline: 0 errors, ~120 warnings. The runbook bar is "errors == 0"; warnings are deliberately permissive and should tighten one rule at a time over time.

**Local-dev gotchas you will hit (in order of likelihood):**
- **macOS AirPlay Receiver hijacks port 5000.** `lsof -nP -iTCP:5000 -sTCP:LISTEN` will show `ControlCenter`. Turn it off in **System Settings → General → AirDrop & Handoff → AirPlay Receiver**. Vite + the smoke test both hardcode 5000.
- **`npm run dev` does NOT auto-load `.env`.** `concurrently` spawns `tsx server/index.ts` with no env, so `DATABASE_URL` is undefined and `pg.Pool` falls back to the OS user as both DB and role → `database "<your-os-user>" does not exist` FATAL on boot. Workaround: `set -a; . ./.env; set +a; npm run dev` from one terminal (or use the smoke script, which sources `.env` itself). Proper fix is `import "dotenv/config"` at the top of `server/index.ts` plus a `dotenv` dep — tracked as a small chore but not yet done.
- **Local Postgres role.** CI uses `dealpad:dealpad@localhost:5432/dealpad`; mirror it locally with `CREATE ROLE dealpad WITH LOGIN PASSWORD 'dealpad'; ALTER DATABASE dealpad OWNER TO dealpad;`.

**Calc-parity golden:** `tests/calc-parity/calc-parity.golden.test.ts` pins `computeDealTotalsFromLines` against deals 4 + 27 (vanilla + Tech-Admin uplift paths). It is **read-only and idempotent** — no DB mutation. Regenerate after intentional pricing changes with `npm run test:golden:write` (= `WRITE_GOLDEN=1 vitest run tests/calc-parity`). The PR must state the pricing change and link the regenerated `pricing-golden.json`.

**CI:** `.github/workflows/ci.yml` runs install + typecheck + lint (warn-only via `|| true`) + `npm test` + `smoke_test.sh` on every PR to `main`/`develop`, against an ephemeral Postgres 16 service. Flip lint to fail-on-warning once warnings are swept.

**Post-merge:** `scripts/post-merge.sh` runs `npm install` after a git merge; schema migrations always run on the next server boot via `pushSchema()`.

## Required env

- `DATABASE_URL` — Postgres connection string (Neon serverless or local). Server aborts on boot if schema push fails.
- `ADMIN_RESEED_TOKEN` *(optional)* — enables `POST /api/admin/reseed` with header `x-admin-token: <token>`. 503 if unset.
- `RUN_PRICING_BACKFILL=1` *(prod only)* — re-runs `backfillDealTotals()` on next boot. Auto-runs in dev (`NODE_ENV !== "production"`).

## Architecture

Stack: **React 19 + Vite + TS** (client) / **Express 5 on Node 22 + tsx** (server) / **Postgres + Drizzle ORM** (data) / **Tailwind 4 + shadcn-style Radix primitives** (UI). Routing via `wouter`, data fetching via `@tanstack/react-query`. No build step on the server in dev — `tsx` runs `server/index.ts` directly.

Path aliases (vite + tsconfig): `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

### Source-of-truth files

- **`shared/schema.ts`** — Drizzle ORM schema. **Single source of truth** for all tables; imported verbatim by both server and client for type inference. Don't duplicate types; derive from `InferSelectModel` / `InferInsertModel`. **Beware drift with `pushSchema()`** — see "Database mutation discipline".
- **`server/rbac.ts`** — `PERMISSIONS_BY_ROLE` matrix (PDL, SLL, PO, FIN, QRM, IT) + `requirePerm()` / `requireAnyPerm()` middleware. The client `AuthContext` mirrors this; **both layers must agree** — server-side guard is the real one, client guard is UX.
- **`server/routes.ts`** — primary REST surface (~4000+ lines). Sub-domains (Dynamics/Intapp/Workday/Conga/Intake) each register their own routes via `registerXRoutes(app)` called from `registerRoutes()`.
- **`server/lib/req.ts`** — `paramStr / paramInt / headerStr / queryStr` helpers. **Use these for every read of `req.params/.header/.query`** — never `parseInt(req.params.id)` or `req.header("...") || ...` directly. `@types/express` 5.x types those returns as `string | string[] | undefined` and the typecheck will fail. The helpers narrow safely.
- **`shared/policy.ts`** — shared business policy constants used by both ends.

### Server boot sequence (`server/index.ts:start()`)

The order is load-bearing:

1. **`pushSchema()`** — runs raw multi-statement DDL via `pool.query()` (NOT `db.execute(sql\`...\`)` — the extended protocol silently bails after the first statement, which has caused real bugs; see the comment around `intapp_settings` backfill). Schema-push failure → `process.exit(1)`.
2. **`registerRoutes(app)`** — must run before seeding because integration seeds rely on shared module state set up during route registration. Express isn't bound to the port yet, so no traffic can race.
3. **`seedAll()`** (`server/seed.ts`) — single orchestrator. Core seeds (DB, default prompt set, snapshot loader) are fatal on failure; integration seeds (Dynamics/Intapp/Workday) are logged but non-fatal.
4. **`backfillDealTotals()`** — reconciles `deals.totalFee/marginPercent/blendedRate` against canonical pricing-line + engagement-input math. Always runs in dev; gated by `RUN_PRICING_BACKFILL=1` in prod.
5. **`startNightlyRescreenLoop()`** — Intapp re-screen daemon, no-op until enabled in settings.
6. **Static SPA fallback** mounted last; `app.listen(PORT, "0.0.0.0")`.

`POST /api/admin/reseed` re-runs step 3 on demand (token-gated).

### Authentication / persona model

There is **no real auth** — personas are passed as headers from the client and trusted:

- `x-user-role`: one of `pdl | sll | po | fin | qrm | it` (validated against `VALID_ROLES`)
- `x-user-name`: actor name for activity-log writes

`attachRole` middleware (mounted globally) reads these onto `req.userRole` / `req.userName`. Route handlers gate with `requirePerm("editDeals", ...)` / `requireAnyPerm("manageRateCards", "viewAdminConfig")`. Handlers also fall back to `req.body?.userName` for legacy callers but **prefer the header**.

When adding a new route: pick the narrowest set of `PermissionKey`s that the workflow needs, and add a route guard. If the action depends on resource state (e.g. only the deal owner can edit), do a second check inside the handler.

### Integration adapters (bi-directional, simulated)

All four follow the same pattern: provider-specific tables (`<provider>_settings`, `<provider>_<entities>`, `<provider>_events/log`), a `register<Provider>Routes(app)` function, and an `autoPush*` hook fired from approval/save transitions in `routes.ts`. Idempotency uses `activity_log` event guards or unique constraints (e.g. `dynamics_opportunities_dealpad_deal_id_unique`).

- **`server/dynamics.ts`** — CRM accounts/opportunities. `autoPushDeal()` syncs status/owner/amount on changes.
- **`server/workday.ts`** — cost-centers/workers/rate cards/validations. `pushProject()` + `autoPushWorkdayProject()` create a project on approval and increment cost-center `committed`.
- **`server/intapp.ts`** — risk screenings/hits/mitigations. `pushOutcome()` + `pushMitigation()` fire on approval and on mitigation resolve/waive/reject. Includes nightly re-screen loop.
- **`server/conga.ts`** — engagement-letter templates + generation history. `pushDelivery()` flips `engagement_letters.status` to `delivered`.

When swapping a simulated adapter to live mode, the contract is: settings table has a `mode` column (`simulated`/`live`) plus `live_*` URL/secret columns; existing call sites should not need to change.

### Pricing engine

`recalcPricingFromScope()` is the canonical computation: scope items × complexity × prompt multipliers across 7 roles, with deterministic re-derivation. **`backfillDealTotals()` is the reconciler** — if you change pricing math, run a backfill (set `RUN_PRICING_BACKFILL=1` once in prod). `pricing_lines` are created lazily on first read.

**Location:** all five helpers (`computeDealTotalsFromLines`, `recalcPricingFromScope`, `persistDealTotals`, `backfillDealTotals`, `reconcileLine`) live in **`server/services/pricing.ts`** since F0.5. `server/routes.ts` re-exports them so external callers (`server/index.ts`'s dynamic `await import("./routes")`) keep working unchanged. New code should import from `./services/pricing` directly.

**Known idempotency bug** in `recalcPricingFromScope`: it falls back to `line.rate` when `standard_rate` is empty, so on deals with empty `standard_rate` each call compounds the T&M factor. The calc-parity golden test (`tests/calc-parity/`) pins `computeDealTotalsFromLines` (pure) instead. Fix is a `standard_rate` backfill — tracked but not yet done.

Margin targets (`margin_targets` table) have firm/BU/service-line scopes — `(scope, scope_key)` is unique with `COALESCE(scope_key, '')`. Firm default is `scope='firm', scope_key=NULL`. Per-scope overrides for `tech_admin_fee_pct`, `line_item_rounding`, `fixed_fee_rounding` are nullable; NULL means "fall back to engagement-input preset".

### Prompt sets

`prompt_sets` + `prompt_set_items` model the deal-wizard complexity questionnaire with versioning. The DB enforces "at most one published set per (BU, ServiceLine) tuple" via partial unique index `uq_prompt_sets_published_tuple` (uses `COALESCE` so NULL BU/SL is also unique). `seedDefaultPromptSet()` idempotently appends new canonical items to existing published default sets — this is how new prompts roll out without duplicating rows.

### Database mutation discipline

Multi-statement DDL **must** use `pool.query(\`...\`)` (simple-query protocol). `db.execute(sql\`...\`)` from drizzle uses the extended protocol and silently bails after the first statement — this caused the missing-`margin_targets`-table bug and is called out in comments around `pushSchema()`. New schema additions go in `pushSchema()` as `CREATE TABLE IF NOT EXISTS` + idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**`shared/schema.ts` ↔ `pushSchema()` drift is a real and recurring bug class.** Drizzle's typed query builder will happily generate `INSERT ... (standard_rate, ...)` for a column declared in `shared/schema.ts`, and Postgres will reject it at runtime if `pushSchema()` never created the column. F0.4.2 caught 5 missing columns on `pricing_lines` plus 4 fully-missing tables (`intake_*`) this way. Before any schema work, sanity-check both sides agree:

```bash
psql "$DATABASE_URL" -At -c "SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY 1" > /tmp/db.txt
# extract from schema.ts and diff (see the F0.4.2 commit message for the exact extractor)
```

If you add a column to `shared/schema.ts`, you **must** add the matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `pushSchema()` in the same commit — even if the column has a default. The seed runs immediately after schema push and will crash on the first INSERT.

## Frontend notes

- **`client/src/context/AuthContext.tsx`** holds the persona/RBAC client state. The exposed shape is `{ persona, login, logout, hasPermission }` — there is **no `user` field** on `AuthContextType`. Use `persona?.name` for the actor's display name, not `user?.name`. Pages gate via `hasPermission(...)` (mirrors `PERMISSIONS_BY_ROLE`); see `client/src/App.tsx` for the route table that wraps each page in a `<NoAccess>` fallback.
- **`client/src/hooks/use-api.ts`** has every React Query hook. New API endpoints get a hook here; don't `fetch()` from components directly. Mutation hooks should `qc.invalidateQueries({ queryKey: [...] })` for every cache key the mutation can affect — see `useUpdateDeal` for the canonical pattern.
- **`onBlur`-only commit pattern is fragile on macOS.** Several inputs (Engagement Inputs, rate-override popover, scope-item adjusted hours) save on `onBlur`. macOS does not shift focus to a `<button>` on click, so the input never blurs and the value is lost when navigation unmounts the step. Mitigation in the wizard: nav buttons fire `flushPendingEdits` (`document.activeElement?.blur()`) on `onMouseDown`, which fires before `click` and triggers the input's blur handler. **Apply the same pattern to any new "navigate away" button that lives next to `onBlur`-committing inputs.** Better long-term fix: commit-on-change with debounce.
- **Brand**: amber `#DA720F`, olive `#949300`, Roboto + Playfair Display. Tokens in `client/src/index.css`. UX references: Ramp.com (minimal/high-contrast) + Gusto.com (warm/sidebar/card hierarchy).
- The `/architecture` Hub has 4 tabs (Overview / Interactive / AI Chat / Document); the Interactive tab's "External Integrations" sub-page renders Dynamics/Workday/Intapp, with Intapp revealing the deep-dive `ArchitectureIntappFederated.tsx` (federated reviewer model with server-side dedupe called out as a forward-looking gap).

## Branching & PR rules (from `docs/refactoring/BRANCHING.md`)

- **Branch off `develop`**, never `main`. Naming: `feat/<id>-<slug>`, `refactor/<id>-<slug>`, `fix/<id>-<slug>` where `<id>` is a `BACKLOG.md` ID (e.g. `feat/F1.1-multi-entity-tabs`). Phase 0's single bundled commit is the exception — every other change gets its own branch + PR.
- **Squash-merge to `develop`.** `main` advances by fast-forward from `develop` after a stable demo cycle.
- **PR must:** reference the backlog ID in the title (`F1.1: …`); pass `bash scripts/audit/smoke_test.sh`; pass CI; keep calc-parity green (or regenerate it intentionally and call that out); re-run the extractors if endpoints/tables changed; stay under ~500 LOC across non-trivial files.
- **Don't mix in one PR:** schema changes + features; refactor + behavior changes. Split them.
- **Migrations are additive only** in Phase 1 — new tables, new nullable columns. **No drops, no renames, no `NOT NULL` on existing columns.** Backfill scripts are required for any new column downstream code reads. Run `bash scripts/audit/backup_db.sh <label>` before any `drizzle-kit push`, even on dev.
- **Replit-specific code is out.** Anything that only works on Replit goes on the `REPLIT_COUPLINGS.md` list, not into the new code.

## Conventions

- **Drizzle queries** use `eq`, `and`, `isNull`, `desc`, etc. from `drizzle-orm`. Use the relational `with` API for eager loading where available.
- **Request extraction** goes through `server/lib/req.ts` helpers — never `parseInt(req.params.X)` or `req.header("X") || ...` directly (typecheck will fail).
- **Error shape**: `{ error: string, detail?: string, code?: string }`. RBAC failures additionally include `requiredPermissions` / `requiredAnyOf` / `role`. Per the rigor playbook: structured codes, no silent fallbacks.
- **Activity log**: every domain mutation writes a row to `activity_log` with `userName` from the header and a JSONB `metadata` payload. Use this for audit trail, not console logs.
- **Idempotency**: integration auto-push handlers must guard against double-fire. Pattern is either a unique constraint on the linking column or a `SELECT 1 FROM activity_log WHERE action=...` check.
- **Seeded gates fire by design.** `CC-CONS-300` (Technology Consulting) is intentionally seeded near 99.7% utilization so over-budget gates trip on Tech Consulting deals — that's a **demo feature**, not a bug. If you need to walk a clean submission flow end-to-end, pick an Audit/Tax/Risk deal (e.g. deal #12 Crestwood Holdings) or bump capacity (`UPDATE workday_cost_centers SET total_budget='50000000'; DELETE FROM workday_validations;`).
- **No emojis** in any UI string, comment, or commit message you author.
