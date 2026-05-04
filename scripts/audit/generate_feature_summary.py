#!/usr/bin/env python3
"""Generate docs/feature-summary.xlsx — a flat list of every feature
landed across the 32-week refactor (Phases 0–4) plus deployment +
recent bug fixes. Two sheets:

  Features   — main matrix (one row per feature ID)
  Glossary   — column key + status legend + live-mode gates

Re-run from repo root:
    python3 scripts/audit/generate_feature_summary.py
"""
from __future__ import annotations

import os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

OUT_PATH = "docs/feature-summary.xlsx"

# ---- Status palette ----
STATUS_COLOR = {
    "Live":          "C6EFCE",  # green
    "Foundation":    "FFEB9C",  # amber — schema/service/routes shipped, UI/live wiring pending
    "Deferred":      "F2DCDB",  # red-ish — intentionally not started this cycle
    "Operational":   "DCE6F1",  # blue — ops/infra/deploy
}
STATUS_TEXT = {
    "Live":          "Live + UI wired",
    "Foundation":    "Foundation only",
    "Deferred":      "Deferred",
    "Operational":   "Operational/infra",
}

HEADER_FILL = PatternFill(fill_type="solid", fgColor="DA720F")  # Armanino amber
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
BORDER_THIN = Border(
    left=Side(style="thin", color="DDDDDD"),
    right=Side(style="thin", color="DDDDDD"),
    top=Side(style="thin", color="DDDDDD"),
    bottom=Side(style="thin", color="DDDDDD"),
)

# (Phase, ID, Name, Area, Status, Description, Tables, Endpoints, Tests, PRs, LiveModeGate)
ROWS = [
    # ---------- Phase 0 ----------
    ("Phase 0", "F0.1", "Smoke test + audit extractors",
     "Tooling", "Live",
     "scripts/audit/{smoke_test.sh, extract_endpoints.py, extract_schema.py} regenerate inventory CSVs and probe app health.",
     "—", "—", "Run locally", "Audit drop-in (pre-#1)", "—"),
    ("Phase 0", "F0.4", "server/lib/req.ts type-safe extractors",
     "Lib", "Live",
     "paramStr/paramInt/headerStr/queryStr handle Express 5.x widened param/header types.",
     "—", "—", "Used everywhere", "—", "—"),
    ("Phase 0", "F0.5", "Pricing engine extracted to services/pricing.ts",
     "Service", "Live",
     "computeDealTotalsFromLines + reconcileLine + recalcPricingFromScope + persistDealTotals + backfillDealTotals.",
     "—", "—", "calc-parity golden test", "—", "—"),
    ("Phase 0", "F0.6", "ESLint flat config + Prettier",
     "Tooling", "Live",
     "eslint.config.js (ESLint 9 flat); 0 errors / ~120 warnings baseline.",
     "—", "—", "npm run lint", "—", "—"),
    ("Phase 0", "F0.10", "recalcPricingFromScope idempotency",
     "Service", "Live",
     "Back-derive standardRate from rate/factor when empty; persist on update so repeat runs don't compound the T&M factor.",
     "pricing_lines", "—", "tests/pricing/recalc-idempotency.test.ts", "—", "—"),
    ("Phase 0", "F0.11", "flushPendingEdits util (macOS onBlur fix)",
     "UI Lib", "Live",
     "document.activeElement?.blur() fired on onMouseDown so wizard nav buttons commit pending input edits before unmount.",
     "—", "—", "Manual", "—", "—"),

    # ---------- Phase 1 ----------
    ("Phase 1", "F1.1", "Multi-entity worksheets",
     "Schema + UI", "Live",
     "deal_entities table; tabs in DealDetail Scope step let one deal model 4+ entities (e.g. 1040 + 1120 + 1065 + 1120S) each with own scope/pricing rollup.",
     "deal_entities (NEW)", "GET/POST /api/deals/:dealId/entities, GET /entities/:id/totals", "tests/integration/multi-entity.test.ts", "F1.1.* chain", "—"),
    ("Phase 1", "F1.1.1", "scope_items entity_id + per-entity unique index",
     "Schema fix", "Live",
     "deal_scope_items.entity_id nullable + (deal_id, entity_id, scope_item_id) unique index lets each entity carry its own copy of a scope item.",
     "deal_scope_items", "—", "tests/integration/scope-per-entity.test.ts", "PR #53", "—"),
    ("Phase 1", "F1.2", "Assembly expansion engine",
     "Schema + Service + UI", "Live",
     "assembly_templates + assembly_components; AssemblyExpansionService uses math.js sandboxed AST for quantity formulas; AssemblyPicker UI on Scope step.",
     "assembly_templates, assembly_components (NEW)", "GET /api/assemblies, GET /:id/components, POST /:id/expand, POST /scope-items/from-assembly", "tests/assembly/*", "F1.2.* chain", "—"),
    ("Phase 1", "F1.3", "Batch renewal processing",
     "Schema + Service + UI + Worker", "Live",
     "batch_renewal_jobs + items + adjustment_rules; BatchRenewalService runs variance math + adjustment rules; admin page at /admin/batch-renewals; Python Celery+Redis worker scaffolded.",
     "batch_renewal_jobs, batch_renewal_items, batch_adjustment_rules (NEW); services/batch-processor/", "GET/POST /api/batch-renewals, /:id/start, /:id/items, /api/batch-adjustment-rules", "tests/batch/*, tests/integration/batch-renewals.test.ts", "F1.3.* chain", "—"),
    ("Phase 1", "F1.4", "DDD Strangler-Fig: Deal aggregate",
     "Domain", "Live",
     "@dealpad/domain (Money, Percentage, Deal, DealStatus, events) + @dealpad/application (SubmitDealService, ApproveDealService, RejectDealService) + @dealpad/infrastructure (DrizzleDealRepository, InProcessEventBus, OutboxDispatcher). POST /submit + /approvals routes migrated.",
     "domain_events_outbox (NEW)", "POST /api/deals/:id/submit, POST /:dealId/approvals, PATCH /api/approvals/:id (refactored)", "tests/domain/*, tests/application/*, tests/integration/{submit,approve}-deal.test.ts", "F1.4.* chain", "—"),

    # ---------- Phase 2 ----------
    ("Phase 2", "F2.1", "Intelligence Engine (pgvector k-NN)",
     "Schema + Service + Routes", "Live",
     "deals.fingerprint JSONB + deals.embedding vector(1536); IntelligenceEngine.findSimilar uses pgvector <-> operator. Heuristic mode default; openai/azure stubbed.",
     "deals", "POST /api/ai/deal-similarity (refactored), POST /api/admin/intelligence/backfill, POST /api/deals/:id/intelligence/recompute", "tests/intelligence/*, tests/integration/{intelligence,deal-similarity}.test.ts", "F2.1.* chain", "openai/azure modes need API keys"),
    ("Phase 2", "F2.2", "Budget-to-actuals monitoring",
     "Schema + Service + Routes + UI", "Live",
     "budget_actuals + budget_alerts; BudgetMonitorService with thresholds (over_budget ≥110%, near_budget ≥90%, burn_rate ≥15%). UI at /deals/:id/budget.",
     "budget_actuals, budget_alerts (NEW)", "GET /api/deals/:id/budget-actuals, /:id/budget-alerts, POST /:id/budget/recompute, POST /api/admin/budget/monitor-all, PATCH /api/budget-alerts/:id, GET /api/budget-alerts/open-count", "tests/budget/*, tests/integration/budget-*.test.ts", "F2.2.* chain", "Celery beat cron not yet wired"),
    ("Phase 2", "F2.3", "Time tracking + AI suggest",
     "Schema + Service + Routes", "Live",
     "time_entries table; full CRUD + /api/time/suggest with deterministic-simulated mode. BudgetMonitor prefers time-entry sums when present.",
     "time_entries (NEW)", "GET/POST /api/deals/:id/time-entries, /:id/time-entries/summary, PATCH /DELETE /api/time-entries/:id, POST /api/time/suggest", "tests/time-entry/*, tests/integration/{time-routes, budget-from-time-entries}.test.ts", "F2.3.* chain", "VOICE_MODE=graph (Microsoft Graph) stubbed"),
    ("Phase 2", "F2.4", "Alternative fee arrangements",
     "Schema + Service + UI", "Live",
     "deals fee_arrangement (T&M | fixed | capped | contingent | retainer | hybrid) + 6 amount/percent columns; applyFeeArrangement projection; FeeArrangementPicker UI on Pricing step.",
     "deals", "GET /api/fee-arrangements, GET /api/deals/:id/fee-projection, PATCH /api/deals/:id/fee-arrangement", "tests/pricing/feeArrangements.test.ts, tests/integration/fee-arrangement-routes.test.ts", "F2.4.* chain", "—"),

    # ---------- Phase 3 ----------
    ("Phase 3", "F3.1", "Real-time collaborative scoping (foundation)",
     "Schema + Service", "Foundation",
     "collaboration_sessions table for room allocation + Yjs update-vector durability. WebSocket gateway + CRDT integration deferred.",
     "collaboration_sessions (NEW)", "GET /api/collab/document-keys, POST /api/deals/:id/collab/sessions, GET /:id/sessions/:key, POST /snapshot + /presence", "tests/integration/collab-sessions.test.ts", "F3.1.1 (PR #39)", "yjs + ws packages + DealDetail refactor"),
    ("Phase 3", "F3.2", "Client self-service portal (magic-link)",
     "Schema + Service + Routes", "Foundation",
     "portal_invites table; SHA-256 hashed tokens (plaintext never persists); /api/portal/* with token-gated middleware separate from persona RBAC.",
     "portal_invites (NEW)", "GET/POST /api/deals/:id/portal-invites, DELETE /api/portal-invites/:id, GET /api/portal/{me,deal,scope}", "tests/portal/*, tests/integration/{portal-auth, portal-routes}.test.ts", "F3.2.1 + F3.2.2 (PR #37, #38)", "Email/SMS delivery not wired"),
    ("Phase 3", "F3.3", "Scope creep detector (heuristic)",
     "Schema + Service + Routes", "Foundation",
     "scope_creep_signals + ScopeCreepDetector with 5 rules (scope_growth, change_order_density, burn_rate, margin_drift, stale_no_progress). ML score plugs into evaluate() seam.",
     "scope_creep_signals (NEW)", "GET /api/deals/:id/scope-creep, POST /:id/scope-creep/scan, PATCH /api/scope-creep/:id", "tests/creep/*, tests/integration/scope-creep-routes.test.ts", "F3.3.1 (PR #40)", "Trained ML model needs labeled dataset"),
    ("Phase 3", "F3.4", "Voice-to-scope",
     "Schema + Service + Routes", "Foundation",
     "voice_transcripts table; token-overlap heuristic ranks scope_catalog matches; apply-to-deal flow. Audio bytes never persist.",
     "voice_transcripts (NEW)", "GET/POST /api/deals/:id/voice-transcripts, POST /api/voice-transcripts/:id/process, /:id/apply", "tests/voice/*, tests/integration/voice-routes.test.ts", "F3.4.1 (PR #41)", "VOICE_MODE=azure (Speech) needs Cognitive Services keys"),
    ("Phase 3", "F3.5", "Slack/Teams native apps",
     "—", "Deferred",
     "Bolt.js Slack app + slash commands; not started.",
     "—", "—", "—", "—", "Tenant OAuth + Bolt.js setup"),
    ("Phase 3", "F3.6", "Rate optimization (heuristic)",
     "Schema + Service + Routes", "Foundation",
     "rate_optimization_runs + RateOptimizerService with capacity + velocity + margin signals (caps at +15%/-10%). ML model plugs into evaluate() seam.",
     "rate_optimization_runs (NEW)", "GET/POST /api/rate-optimization/runs, PATCH /api/rate-optimization/runs/:id", "tests/rate-opt/*, tests/integration/rate-optimization-routes.test.ts", "F3.6.1 (PR #42)", "LTV + seasonality model needs training data"),

    # ---------- Phase 4 ----------
    ("Phase 4", "F4.1", "pgvector RAG",
     "Service", "Live",
     "Already shipped via F2.1 — IntelligenceEngine.findSimilar uses pgvector cosine similarity.",
     "deals", "POST /api/ai/deal-similarity", "tests/intelligence/*", "F2.1.* chain", "—"),
    ("Phase 4", "F4.2", "ml-service Python scaffold",
     "Service (Python)", "Foundation",
     "FastAPI service hosting /effort-estimator + /margin-optimizer in heuristic mode; sklearn / azureml modes stubbed.",
     "—", "GET /health, POST /effort-estimator, POST /margin-optimizer (FastAPI; localhost:8000)", "Manual: uvicorn + curl /health", "F4.2.1 (PR #50)", "Trained model + ML_MODE=sklearn|azureml"),
    ("Phase 4", "F4.4", "llm.ts client abstraction",
     "Service", "Foundation",
     "complete() + completeStructured() with simulated default + anthropic/openai/azure_openai stubs. Zod-validated structured output. Auto-instrumented via withAiTelemetry.",
     "—", "—", "tests/llm/llm.test.ts", "F4.4.1 (PR #47)", "LLM_PROVIDER=anthropic|openai needs API keys"),
    ("Phase 4", "F4.4.2", "risk-summary (UC-5) via llm.ts",
     "Routes", "Live",
     "POST /api/ai/risk-summary now flows narrative + keyMessage + approvalLikelihood through llm.completeStructured. Heuristic baseline preserved; LLM enriches.",
     "—", "POST /api/ai/risk-summary (refactored)", "tests/integration/risk-summary-llm.test.ts", "F4.4.2 (PR #48)", "Real LLM call gated on LLM_PROVIDER + key"),
    ("Phase 4", "F4.4.3", "margin-advisor (UC-3) via llm.ts",
     "Routes", "Live",
     "POST /api/ai/margin-advisor adds narrative + callToAction via llm.completeStructured. Suggestion math stays heuristic.",
     "—", "POST /api/ai/margin-advisor (refactored)", "tests/integration/margin-advisor-llm.test.ts", "F4.4.3 (PR #49)", "Real LLM call gated on LLM_PROVIDER + key"),
    ("Phase 4", "F4.5", "AI telemetry middleware + dashboards",
     "Schema + Middleware + Routes", "Live",
     "ai_telemetry table; recordAi + withAiTelemetry capture token counts, latency, errors, cost USD. Dashboard summary endpoint computes p95 + per-operation cost rollups.",
     "ai_telemetry (NEW)", "GET /api/ai-telemetry, GET /api/ai-telemetry/summary", "tests/ai-telemetry/*, tests/integration/ai-telemetry-routes.test.ts", "F4.5.1 (PR #46)", "Dashboard UI page is a chore PR"),

    # ---------- Operational / Bug Fixes ----------
    ("Operational", "fix.dynamics-seed", "Dynamics seed skips test-fixture deals",
     "Bugfix", "Live",
     "Excludes __test_* / DL-TEST-* deals from the on-boot opportunity-creation sweep. Stops the dashboard's Latest Opportunities panel from filling with synthetic rows.",
     "—", "—", "—", "PR #51", "—"),
    ("Operational", "fix.auto-seed-primary-entity", "Every deal-create path auto-seeds Primary Entity",
     "Bugfix", "Live",
     "ensurePrimaryEntity helper called from POST /api/deals, /clone, /agent-draft, and Dynamics import. Closes the F1.1 backfill-only gap for mid-session deals.",
     "—", "—", "tests/integration/deal-create-primary-entity.test.ts", "PR #52", "—"),
    ("Operational", "fix.healthz", "Public /healthz for Render healthcheck",
     "Bugfix", "Live",
     "Bypasses persona-RBAC so deploy gates don't 401. Returns 200 with no DB hit.",
     "—", "GET /healthz", "—", "PR #59", "—"),
    ("Operational", "deploy", "Render + Neon deployment",
     "Infra", "Operational",
     "render.yaml Blueprint + Dockerfile + docs/deployment.md. Live at https://dealpad-demo.onrender.com (Starter + Neon Launch).",
     "—", "—", "Smoke probe via /healthz + /api/dashboard/summary", "PRs #55, #56, #57, #58, #59", "—"),
]

COLS = [
    ("Phase", 12),
    ("Feature ID", 20),
    ("Feature Name", 50),
    ("Area", 26),
    ("Status", 18),
    ("Description", 80),
    ("Tables Touched", 36),
    ("Endpoints Added", 60),
    ("Tests", 50),
    ("PR(s)", 24),
    ("Live Mode Gate", 38),
]


def main() -> None:
    wb = Workbook()

    # ---- Sheet 1: Features ----
    ws = wb.active
    ws.title = "Features"

    # Header row
    for c_idx, (name, width) in enumerate(COLS, start=1):
        cell = ws.cell(row=1, column=c_idx, value=name)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER_THIN
        ws.column_dimensions[get_column_letter(c_idx)].width = width

    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"

    # Data rows
    for r_idx, row in enumerate(ROWS, start=2):
        phase, fid, name, area, status, desc, tables, endpoints, tests, prs, gate = row
        status_label = STATUS_TEXT.get(status, status)
        for c_idx, value in enumerate(
            [phase, fid, name, area, status_label, desc, tables, endpoints, tests, prs, gate],
            start=1,
        ):
            cell = ws.cell(row=r_idx, column=c_idx, value=value)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border = BORDER_THIN
            if c_idx == 5:  # Status column tinted by status palette
                cell.fill = PatternFill(fill_type="solid", fgColor=STATUS_COLOR.get(status, "FFFFFF"))
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(bold=True)
        ws.row_dimensions[r_idx].height = 60

    # Auto-filter on the header
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}1"

    # ---- Sheet 2: Glossary ----
    g = wb.create_sheet("Glossary")
    g.column_dimensions["A"].width = 22
    g.column_dimensions["B"].width = 100

    glossary = [
        ("Column", "Meaning"),
        ("Phase", "Refactor phase per docs/refactoring/BACKLOG.md (0=audit/tooling, 1=multi-entity foundation, 2=intelligence/budget/time/fees, 3=moat builders, 4=AI production)."),
        ("Feature ID", "Stable ID used in commit messages, branch names, and PR titles. Sub-IDs (e.g. F1.4.2) denote slices of a larger feature."),
        ("Feature Name", "Short human-readable label."),
        ("Area", "Where the feature touches: Schema / Service / Routes / UI / Lib / Tooling / Domain. Multi-area features list all."),
        ("Status",
         "Live + UI wired = end-to-end production-ready including UI surfaces.\n"
         "Foundation only = schema/service/routes shipped; UI or live-mode wiring pending.\n"
         "Deferred = intentionally not started this cycle.\n"
         "Operational/infra = deployment, ops, or bugfixes."),
        ("Tables Touched", "DB tables created or modified. (NEW) marks tables introduced by the feature."),
        ("Endpoints Added", "REST endpoints introduced or refactored. Use docs/audit/api_inventory.csv for the authoritative list."),
        ("Tests", "Test files exercising the feature. Suite total: 500+ tests as of 2026-05-04."),
        ("PR(s)", "Pull request numbers on github.com/dhan99/NextGenPricing2. Multi-PR features list the chain."),
        ("Live Mode Gate", "What's needed to flip a Foundation feature to Live (API keys, training data, integrations)."),
    ]
    for r_idx, (col, meaning) in enumerate(glossary, start=1):
        a = g.cell(row=r_idx, column=1, value=col)
        b = g.cell(row=r_idx, column=2, value=meaning)
        if r_idx == 1:
            a.fill = HEADER_FILL; a.font = HEADER_FONT
            b.fill = HEADER_FILL; b.font = HEADER_FONT
        else:
            a.font = Font(bold=True)
        a.alignment = Alignment(vertical="top", wrap_text=True)
        b.alignment = Alignment(vertical="top", wrap_text=True)
        a.border = BORDER_THIN; b.border = BORDER_THIN
        if r_idx == 6:
            g.row_dimensions[r_idx].height = 64
        else:
            g.row_dimensions[r_idx].height = 22

    # ---- Save ----
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    wb.save(OUT_PATH)
    print(f"Wrote {OUT_PATH} — {len(ROWS)} feature rows across 2 sheets.")


if __name__ == "__main__":
    main()
