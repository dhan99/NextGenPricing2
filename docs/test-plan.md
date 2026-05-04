# DealPad — Test plan for new functionality

Coverage spans Phases 0–4 of the 32-week refactor. Last refreshed
**2026-05-03**. For an up-to-date diff against develop, regenerate
the API + schema inventories:

```bash
python3 scripts/audit/extract_endpoints.py > docs/audit/api_inventory.csv
python3 scripts/audit/extract_schema.py    > docs/audit/schema_inventory.csv
```

## Pre-flight

- Dev server running at <http://localhost:5000>. If port 5000 is
  hijacked by macOS AirPlay Receiver, disable it in
  **System Settings → AirDrop & Handoff → AirPlay Receiver**.
- Login as **PDL** (Michael Torres) for the broadest permissions.
  Use **PO** (Procurement Officer) for admin-gated endpoints.
- Pick a clean Audit/Tax/Risk deal for happy paths
  (e.g. **Crestwood Holdings - Annual Audit**, deal #2132). Avoid
  Tech Consulting deals — `CC-CONS-300` is intentionally seeded
  near 99.7% utilization to demo Workday gating.
- All API examples use:
  ```
  -H "x-user-role: pdl" -H "x-user-name: smoke"
  ```
  (or `x-user-role: po` for admin endpoints).

---

## Section A — Visual UI tests

| # | Feature | Steps | Expected result |
|---|---|---|---|
| **A1** | F1.1 Multi-entity tabs | Open deal #2132 → click step **Scope** | Tab strip visible with "Primary Entity" tab. Click `+` Add Entity → enter "Subsidiary A" → tab appears, switching shows empty scope list |
| **A2** | F1.1.1 Scope per entity | On Tab 1 add "Federal 1040" → switch to Tab 2 → add "Federal 1040" again | Both succeed. Tab 1 has 1 row, Tab 2 has 1 row. Same scope item on different entities → no duplicate error |
| **A3** | F1.1.1 Same-tab duplicate guard | Try adding "Federal 1040" to Tab 1 a second time | Returns 200 with `duplicate: true`; no second row created |
| **A4** | F1.2 Assembly picker | Scope step → click **Assembly** → pick "Tax PHB Standard Bundle" → Tier = Enhanced → preview → Apply | Multiple scope rows added at once with correct hours per tier (Enhanced ≈ 696h total) |
| **A5** | F2.4.3 FeeArrangementPicker | Step **Pricing** → bottom of left column. Switch to **Capped** → enter $75k | Projection card shows base T&M unchanged; adjusted total = $75k; "Cap applied" caption when T&M > cap |
| **A6** | F2.4.3 Hybrid arrangement | Same picker → switch to **Hybrid** → Success fee 5% | Adjusted total = T&M × 1.05; meta shows "Success fee uplift: $X" |
| **A7** | F4.4.3 Margin Advisor narrative | Pricing step → run AI Margin Advisor | Response includes new `narrative` + `callToAction` fields under the suggestions list |
| **A8** | F4.4.2 Risk Summary keyMessage | Step **Review** → Generate Risk Summary | Response includes new `keyMessage` field; severity-appropriate one-liner |
| **A9** | F1.4 Submit pipeline | Step **Approve** → Submit deal | Success → `psql -c "select type, payload->>'actor' from domain_events_outbox where aggregate_id=2132 order by id desc limit 3"` shows DealSubmitted row |
| **A10** | F2.2.4 Budget UI | Visit `/deals/2132/budget` directly | Budget panel renders. Click **Recompute** → snapshot row appears in history table; alerts list populated if breach |
| **A11** | F1.3 Batch Renewals | Visit `/admin/batch-renewals` → Create job → pick 3 deals + adjustment rule (5% rate uplift) → Run | Job completes; flagged items list shows variance-flagged deals |
| **A12** | DealsList "Latest Opportunities" tab | `/deals` → switch view to **Latest Opportunities** | Top of list shows real CRM-imported opps (Crestwood at top); no `__test_*` pollution |

---

## Section B — API contract tests (curl)

| # | Feature | curl | Expected |
|---|---|---|---|
| **B1** | F2.1 pgvector k-NN | `POST /api/ai/deal-similarity -d '{"dealId":2132,"k":5}'` | `insights.mode: "knn"`; results don't include the anchor; `similarDeals[].distance` numeric |
| **B2** | F2.1 lazy embedding | Pick a deal whose `embedding` is null in DB → call B1 | First call backfills via `recomputeForDeal`; check `select length(embedding) from deals where id=...` returns 1536 |
| **B3** | F2.3 time-entry CRUD | `POST /api/deals/2132/time-entries -d '{"workDate":"2026-05-01","hours":1.4}'` | 201; response shows hours snapped to 1.5 (0.25h granularity) |
| **B4** | F2.3 AI suggest | `POST /api/time/suggest -d '{"dealId":2132,"hint":"client review"}'` | Returns deterministic suggestion: `workDate`, `hours` (>0), `confidence` 0.6–0.7, `source:"ai"` |
| **B5** | F3.2 portal magic-link | `POST /api/deals/2132/portal-invites -d '{"email":"client@example.com"}'` | Returns raw token ONCE; copy it. Then `GET /api/portal/me -H "Authorization: Bearer <token>"` → returns clientId+dealId scope |
| **B6** | F3.2 portal scope guard | Try `GET /api/portal/me` with no token | 401 `portal_token_missing`. Try with garbage token → 401 `portal_token_invalid` |
| **B7** | F3.3 scope creep scan | `POST /api/deals/2132/scope-creep/scan` | Returns `signals[]` (some kinds: `scope_growth` / `margin_drift` / `burn_rate` / `change_order_density` / `stale_no_progress`). Re-running → `inserted=0, deduped=N` |
| **B8** | F3.4 voice-to-scope | `POST /api/deals/2132/voice-transcripts -d '{}'` then `POST /api/voice-transcripts/:id/process -d '{"transcript":"Federal 1040 plus state return"}'` | Status flips `pending → extracted`; `extractions[]` ranks catalog matches |
| **B9** | F3.6 rate optimizer | `POST /api/rate-optimization/runs -H "x-user-role:po" -d '{"scope":"firm","targetWindowStart":"2026-07-01","targetWindowEnd":"2026-09-30"}'` | 201 with `recommendation` keyed by roleId, `rationale` text, status=`draft` |
| **B10** | F4.5 telemetry summary | `GET /api/ai-telemetry/summary?windowDays=1 -H "x-user-role:po"` | Returns `groups[]` per (operation, mode); each carries `totalCalls`, `errorRate`, `p95LatencyMs`, `totalCostUsd` |
| **B11** | F2.4 fee-projection | `GET /api/deals/2132/fee-projection` | Returns `arrangement`, `baseTotals`, `adjustedTotals`, `meta` (cap-applied / success-fee-amount / contingent terms when set) |
| **B12** | F1.2 assembly expand | `POST /api/assemblies/:id/expand -d '{"dealId":2132,"tier":"essential"}'` | Returns expanded line plan; no DB writes (dry-run). `POST /scope-items/from-assembly` to commit |

---

## Section C — Regression tests (recently fixed bugs)

| # | Bug | Steps | Expected |
|---|---|---|---|
| **C1** | Test-data pollution | `/deals` Latest Opportunities tab | Zero `__test_*` rows; only ~29 real opps |
| **C2** | Mid-session deal w/o entity | Import any new opp from CRM | `psql -c "select count(*) from deal_entities where deal_id=<new>"` returns ≥ 1 (Primary Entity auto-seeded) |
| **C3** | Scope-item-per-entity unique | Cover above as A2 | Same item, two entities, two rows allowed |
| **C4** | LLM_PROVIDER fallback | Force a malformed transcript or oversized payload | Endpoint returns structured error code; route never 500s |
| **C5** | Recalc idempotency (F0.10) | Hit `POST /api/deals/2132/pricing/recalc` twice | Total fees identical between calls (no T&M factor compounding) |

---

## Section D — Foundations not yet user-visible (verification only)

| # | Feature | How to verify |
|---|---|---|
| **D1** | F1.4 outbox | `psql -c "select type, version, count(*) from domain_events_outbox group by 1,2 order by 1"` after submitting/approving deals |
| **D2** | F3.1 collab session | `POST /api/deals/2132/collab/sessions -d '{"documentKey":"scope_v1"}'` → returns `roomId`; idempotent re-call returns same room |
| **D3** | F4.4.1 llm.ts simulated | Same input → same output (`POST /api/ai/risk-summary` twice with same dealId) |
| **D4** | F4.5.1 telemetry capture | Each AI call emits a row: `psql -c "select operation, status, latency_ms from ai_telemetry order by id desc limit 5"` |
| **D5** | F4.2 ml-service health | `cd services/ml-service && uvicorn app:app --port 8000` → `curl localhost:8000/health` returns `{status:"ok",mode:"heuristic"}` |

---

## Section E — Things that should NOT work yet (intentional)

| # | Action | Expected |
|---|---|---|
| **E1** | Set `LLM_PROVIDER=anthropic` and call risk-summary | LLM call throws "client not configured"; route falls through to heuristic narrative — never 500s |
| **E2** | F3.5 Slack/Teams integration | No endpoint exists — 404 expected |
| **E3** | Real audio upload to voice-to-scope | `VOICE_MODE=azure` throws "not yet wired"; simulated mode still returns extractions from a pre-typed transcript |

---

## Smoke shortcut (≈ 2 minutes)

```
A1 → A4 → A5 → A9 → A10 → B1 → B5 → B10
```

Hits every major surface: multi-entity, assemblies, fee arrangements,
submit/outbox, budget UI, vector similarity, portal auth, AI telemetry.

---

## Demo-day pitfalls

1. **AirPlay Receiver hijacks port 5000 on macOS.** Symptom: page won't load. Fix: System Settings → AirDrop & Handoff → AirPlay Receiver = OFF.
2. **Tech Consulting deals trip the Workday over-budget gate.** That's a seeded demo feature, not a bug — skip them for happy paths.
3. **First `/deal-similarity` call after a fresh DB takes ~500ms** because it lazily backfills the embedding. Pre-warm by running it once before demoing.
4. **No emojis anywhere in product UI** — house rule from the rigor playbook.
5. **`gh` CLI auto-merges work.** Don't run `gh pr merge` during the demo unless you mean it.
