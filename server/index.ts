// Load .env before any other import — `server/db.ts` reads
// process.env.DATABASE_URL at module load to construct its pg.Pool, so
// dotenv MUST run first or the pool ends up with undefined and pg falls
// back to the OS user as both DB and role (manifests as `database
// "<your-os-user>" does not exist` FATAL on boot). This was the
// "concurrently doesn't auto-load .env" gotcha from CLAUDE.md.
import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import { registerRoutes } from "./routes";
import { seedAll } from "./seed";
import { attachRole } from "./rbac";
import { db } from "./db";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors());
app.use(express.json());
app.use(attachRole);

async function initializeDatabase() {
  try {
    const tableNames = Object.keys(schema).filter(key => {
      const val = (schema as any)[key];
      return val && typeof val === 'object' && val._ && val._.name;
    });

    for (const key of tableNames) {
      const table = (schema as any)[key];
      const tableName = table._.name;
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "${tableName}" ()
      `)).catch(() => {});
    }
  } catch (e) {}
}

async function pushSchema() {
  const { pool } = await import("./db");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      segment TEXT,
      region TEXT,
      contact_name TEXT,
      contact_email TEXT,
      revenue_size TEXT,
      relationship_years INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY,
      deal_number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id) NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      deal_type TEXT NOT NULL DEFAULT 'new',
      business_unit TEXT,
      service_line TEXT,
      region TEXT,
      start_date TEXT,
      end_date TEXT,
      complexity TEXT DEFAULT 'medium',
      total_fee DECIMAL(12,2) DEFAULT 0,
      total_cost DECIMAL(12,2) DEFAULT 0,
      total_hours DECIMAL(10,2) DEFAULT 0,
      margin_percent DECIMAL(5,2) DEFAULT 0,
      blended_rate DECIMAL(8,2) DEFAULT 0,
      current_step INTEGER DEFAULT 1,
      pdl_name TEXT,
      pdl_email TEXT,
      parent_deal_id INTEGER,
      notes TEXT,
      ai_summary TEXT,
      risk_score DECIMAL(3,1),
      archived_at TIMESTAMP,
      archived_by TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS archived_by TEXT;

    CREATE TABLE IF NOT EXISTS scope_catalog (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      default_hours DECIMAL(8,2),
      is_assembly BOOLEAN DEFAULT false,
      parent_id INTEGER,
      service_lines TEXT,
      sort_order INTEGER DEFAULT 0
    );
    ALTER TABLE scope_catalog ADD COLUMN IF NOT EXISTS service_lines TEXT;
    ALTER TABLE scope_catalog ADD COLUMN IF NOT EXISTS parent_id INTEGER;
    ALTER TABLE scope_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scope_catalog_parent_id_fkey') THEN
        ALTER TABLE scope_catalog
          ADD CONSTRAINT scope_catalog_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES scope_catalog(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS scope_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      service_line TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scope_template_items (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES scope_templates(id) NOT NULL,
      scope_item_id INTEGER REFERENCES scope_catalog(id) NOT NULL,
      default_hours DECIMAL(8,2),
      complexity_multiplier DECIMAL(4,2) DEFAULT 1.0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deal_scope_items (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      scope_item_id INTEGER REFERENCES scope_catalog(id) NOT NULL,
      quantity INTEGER DEFAULT 1,
      adjusted_hours DECIMAL(8,2),
      complexity_multiplier DECIMAL(4,2) DEFAULT 1.0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      default_rate DECIMAL(8,2) NOT NULL,
      cost_rate DECIMAL(8,2) NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rate_cards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      effective_date TEXT,
      expiration_date TEXT,
      is_active BOOLEAN DEFAULT true,
      region TEXT
    );

    CREATE TABLE IF NOT EXISTS rate_card_entries (
      id SERIAL PRIMARY KEY,
      rate_card_id INTEGER REFERENCES rate_cards(id) NOT NULL,
      role_id INTEGER REFERENCES roles(id) NOT NULL,
      rate DECIMAL(8,2) NOT NULL,
      cost_rate DECIMAL(8,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_lines (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      scenario_id INTEGER,
      role_id INTEGER REFERENCES roles(id) NOT NULL,
      scope_item_id INTEGER,
      hours DECIMAL(8,2) NOT NULL DEFAULT 0,
      rate DECIMAL(8,2) NOT NULL,
      cost_rate DECIMAL(8,2) NOT NULL,
      fee DECIMAL(12,2) DEFAULT 0,
      cost DECIMAL(12,2) DEFAULT 0,
      margin DECIMAL(12,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      scenario_type TEXT NOT NULL DEFAULT 'standard',
      is_recommended BOOLEAN DEFAULT false,
      total_fee DECIMAL(12,2) DEFAULT 0,
      total_cost DECIMAL(12,2) DEFAULT 0,
      total_hours DECIMAL(10,2) DEFAULT 0,
      margin_percent DECIMAL(5,2) DEFAULT 0,
      blended_rate DECIMAL(8,2) DEFAULT 0,
      ai_reasoning TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      scenario_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      approver_name TEXT,
      approver_role TEXT,
      approver_email TEXT,
      submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
      decided_at TIMESTAMP,
      comments TEXT,
      risk_summary TEXT,
      ai_narrative TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_responses (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      category TEXT,
      impact_multiplier DECIMAL(4,2) DEFAULT 1.0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prompt_sets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      business_unit TEXT,
      service_line TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      published_at TIMESTAMP,
      published_by TEXT,
      archived_at TIMESTAMP,
      archived_by TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_set_items (
      id SERIAL PRIMARY KEY,
      prompt_set_id INTEGER REFERENCES prompt_sets(id) ON DELETE CASCADE NOT NULL,
      question TEXT NOT NULL,
      category TEXT,
      help_text TEXT,
      options JSONB NOT NULL,
      sort_order INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT TRUE
    );

    -- Enforce "at most one published set per (BU, ServiceLine)" tuple at the DB level.
    -- Uses COALESCE so NULL BU/SL (cross-service or cross-BU defaults) are also unique.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_sets_published_tuple
      ON prompt_sets (COALESCE(business_unit, ''), COALESCE(service_line, ''))
      WHERE status = 'published';

    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id),
      action TEXT NOT NULL,
      description TEXT,
      user_name TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS change_orders (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      change_type TEXT NOT NULL DEFAULT 'scope_change',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      original_fee DECIMAL(12,2) DEFAULT 0,
      original_cost DECIMAL(12,2) DEFAULT 0,
      original_hours DECIMAL(10,2) DEFAULT 0,
      new_fee DECIMAL(12,2) DEFAULT 0,
      new_cost DECIMAL(12,2) DEFAULT 0,
      new_hours DECIMAL(10,2) DEFAULT 0,
      delta_fee DECIMAL(12,2) DEFAULT 0,
      delta_cost DECIMAL(12,2) DEFAULT 0,
      delta_hours DECIMAL(10,2) DEFAULT 0,
      scope_changes JSONB,
      created_by TEXT,
      approved_by TEXT,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamics_owners (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      quota DECIMAL(14,2) DEFAULT '2500000'
    );
    CREATE TABLE IF NOT EXISTS dynamics_accounts (
      id SERIAL PRIMARY KEY,
      dynamics_id TEXT NOT NULL UNIQUE,
      account_number TEXT NOT NULL UNIQUE,
      dealpad_client_id INTEGER REFERENCES clients(id),
      name TEXT NOT NULL,
      industry TEXT, industry_code TEXT, segment TEXT,
      annual_revenue DECIMAL(16,2) DEFAULT '0',
      number_of_employees INTEGER DEFAULT 0,
      owner_name TEXT, owner_email TEXT, parent_account TEXT,
      contact_name TEXT, contact_title TEXT, contact_email TEXT, contact_phone TEXT,
      billing_street TEXT, billing_city TEXT, billing_state TEXT, billing_zip TEXT, billing_country TEXT DEFAULT 'USA',
      relationship_type TEXT DEFAULT 'Customer',
      customer_since TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_synced_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamics_opportunities (
      id SERIAL PRIMARY KEY,
      dynamics_id TEXT NOT NULL UNIQUE,
      opportunity_number TEXT NOT NULL UNIQUE,
      dealpad_deal_id INTEGER REFERENCES deals(id) UNIQUE,
      dynamics_account_id INTEGER REFERENCES dynamics_accounts(id),
      name TEXT NOT NULL, account_name TEXT,
      estimated_value DECIMAL(14,2) DEFAULT '0',
      actual_value DECIMAL(14,2),
      stage TEXT DEFAULT 'Qualify',
      probability INTEGER DEFAULT 20,
      estimated_close_date TEXT, actual_close_date TEXT,
      owner_name TEXT,
      sales_process TEXT DEFAULT 'Armanino NextGenApp Sales Process',
      forecast_category TEXT DEFAULT 'Pipeline',
      rating TEXT DEFAULT 'Warm',
      sync_status TEXT DEFAULT 'synced',
      sync_direction TEXT DEFAULT 'bidirectional',
      last_pushed_at TIMESTAMP,
      last_pulled_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamics_sync_log (
      id SERIAL PRIMARY KEY,
      direction TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_ref_id INTEGER,
      action TEXT NOT NULL,
      fields JSONB,
      status TEXT DEFAULT 'success',
      message TEXT,
      actor_name TEXT,
      trigger TEXT DEFAULT 'manual',
      timestamp TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamics_settings (
      id SERIAL PRIMARY KEY,
      auto_push_enabled BOOLEAN DEFAULT FALSE,
      auto_push_on_stage_change BOOLEAN DEFAULT TRUE,
      auto_push_on_fee_change BOOLEAN DEFAULT TRUE,
      nightly_batch_enabled BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intapp_settings (
      id SERIAL PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'simulated',
      auto_screen_on_submit BOOLEAN DEFAULT TRUE,
      block_submit_on_conflict BOOLEAN DEFAULT TRUE,
      allow_qrm_override BOOLEAN DEFAULT TRUE,
      auto_screen_on_client_change BOOLEAN DEFAULT FALSE,
      nightly_rescreen BOOLEAN DEFAULT FALSE,
      api_base_url TEXT,
      api_token_secret TEXT,
      live_tenant_url TEXT,
      live_client_id TEXT,
      live_api_key_secret TEXT,
      policy_version TEXT DEFAULT '4w-pilot-v1',
      pilot_ends_on TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intapp_screenings (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      source TEXT NOT NULL DEFAULT 'simulated',
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT DEFAULT 'pending',
      risk_tier TEXT DEFAULT 'low',
      hit_count INTEGER DEFAULT 0,
      policy_version TEXT,
      external_ref TEXT,
      requested_by TEXT,
      requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP,
      payload_snapshot JSONB,
      narrative TEXT
    );
    CREATE TABLE IF NOT EXISTS intapp_hits (
      id SERIAL PRIMARY KEY,
      screening_id INTEGER REFERENCES intapp_screenings(id) NOT NULL,
      hit_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      matched_entity TEXT,
      description TEXT,
      recommendation TEXT,
      external_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS intapp_mitigations (
      id SERIAL PRIMARY KEY,
      screening_id INTEGER REFERENCES intapp_screenings(id) NOT NULL,
      hit_id INTEGER REFERENCES intapp_hits(id),
      status TEXT NOT NULL DEFAULT 'pending',
      action TEXT NOT NULL,
      notes TEXT,
      resolved_by TEXT,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intapp_events (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id),
      screening_id INTEGER REFERENCES intapp_screenings(id),
      event_type TEXT NOT NULL,
      source TEXT DEFAULT 'simulated',
      actor_name TEXT,
      actor_role TEXT,
      message TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Backfill: add Intapp settings columns if table pre-existed without them.
  // NOTE: must use pool.query (simple-query protocol) for multi-statement DDL.
  // db.execute(sql`...`) uses the extended protocol which silently bails after
  // the first statement, leaving later ALTER/CREATE TABLE/INDEX statements
  // un-applied (the cause of the missing margin_targets table bug).
  await pool.query(`
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS auto_screen_on_client_change BOOLEAN DEFAULT FALSE;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS nightly_rescreen BOOLEAN DEFAULT FALSE;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS live_tenant_url TEXT;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS live_client_id TEXT;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS live_api_key_secret TEXT;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS qrm_notify_on_conflict BOOLEAN DEFAULT TRUE;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS qrm_notify_channel TEXT DEFAULT 'in_app';
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS qrm_notify_recipients TEXT;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS qrm_teams_webhook_url TEXT;
    ALTER TABLE intapp_settings ADD COLUMN IF NOT EXISTS app_base_url TEXT;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS workday_cost_center_id INTEGER;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS engagement_inputs JSONB;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS target_margin_percent DECIMAL(5,2);
    -- F2.1.1 — Deal fingerprint (JSONB). Cache key + feature snapshot for
    -- the similarity engine.
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS fingerprint JSONB;

    -- F2.4.1 — Alternative fee arrangements. Default 'time_and_materials'
    -- preserves legacy pricing-engine behavior; other arrangements are
    -- handled by the pricing-engine fork in F2.4.2. All amount/percent
    -- columns are nullable so legacy T&M rows don't carry zeroes.
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS fee_arrangement TEXT DEFAULT 'time_and_materials';
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS fixed_fee_amount DECIMAL(14,2);
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS capped_fee_amount DECIMAL(14,2);
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS contingent_fee_percent DECIMAL(5,2);
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS contingent_fee_base TEXT;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS retainer_amount DECIMAL(14,2);
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS success_fee_percent DECIMAL(5,2);

    -- F2.1.2 — pgvector + deal embedding column. CREATE EXTENSION is a
    -- no-op once installed; the dealpad role doesn't have permission to
    -- create extensions, so this is wrapped in DO/EXCEPTION so a missing
    -- extension is logged but doesn't abort startup. In that case the
    -- ALTER TABLE below also no-ops because the type doesn't exist.
    DO $$
    BEGIN
      CREATE EXTENSION IF NOT EXISTS vector;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '[pushSchema] vector extension not present and dealpad role cannot create it; embedding column skipped. Run "psql -d dealpad -c ''CREATE EXTENSION IF NOT EXISTS vector''" as a superuser once.';
    END
    $$;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE 'ALTER TABLE deals ADD COLUMN IF NOT EXISTS embedding vector(1536)';
      END IF;
    END
    $$;

    -- Per-step rate override (shared/schema.ts:137-145). Captured baseline +
    -- audit metadata so the variance badge can render "$X over standard, by Y".
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS standard_rate DECIMAL(8,2);
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS rate_overridden BOOLEAN DEFAULT FALSE;
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS override_reason TEXT;
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS override_by TEXT;
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS override_at TIMESTAMP;

    -- Multi-entity worksheets (F1.1, BACKLOG.md). One deal can hold multiple
    -- entities — e.g. tax engagements modeling 1040 + 1120 + 1065 + 1120S
    -- under one engagement. Pre-F1.1 deals are pointed at a single auto-
    -- created "Primary Entity" by 001_multi_entity_backfill so existing
    -- scope and pricing rows can be assigned without touching their values.
    CREATE TABLE IF NOT EXISTS deal_entities (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      name TEXT NOT NULL,
      entity_type TEXT,
      jurisdiction TEXT,
      sort_order INTEGER DEFAULT 0,
      is_primary BOOLEAN DEFAULT FALSE NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS deal_entities_deal_name_uniq
      ON deal_entities (deal_id, name);
    ALTER TABLE deal_scope_items ADD COLUMN IF NOT EXISTS entity_id INTEGER REFERENCES deal_entities(id);
    ALTER TABLE pricing_lines ADD COLUMN IF NOT EXISTS entity_id INTEGER REFERENCES deal_entities(id);

    -- Assembly expansion engine (F1.2, BACKLOG.md). Explicit per-assembly
    -- expansion specs that supersede the legacy parent_id cascade for any
    -- assembly catalog row that has a template registered. Components carry
    -- tier overrides + a quantity formula evaluated by the F1.2 sandbox
    -- (see server/services/AssemblyExpansionService.ts in slice 2).
    CREATE TABLE IF NOT EXISTS assembly_templates (
      id SERIAL PRIMARY KEY,
      scope_item_id INTEGER REFERENCES scope_catalog(id) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      service_line TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assembly_components (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES assembly_templates(id) NOT NULL,
      scope_item_id INTEGER REFERENCES scope_catalog(id) NOT NULL,
      ultimate_tier_override DECIMAL(8,2),
      enhanced_tier_override DECIMAL(8,2),
      essential_tier_override DECIMAL(8,2),
      quantity_formula TEXT,
      prompt_id INTEGER REFERENCES prompt_set_items(id),
      sort_order INTEGER DEFAULT 0,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS assembly_components_template_idx
      ON assembly_components (template_id);

    -- Batch renewal processing (F1.3, BACKLOG.md). Tax-season job
    -- orchestrator: one batch_renewal_jobs row per run, one
    -- batch_renewal_items row per source deal, plus a small library
    -- of reusable batch_adjustment_rules.
    CREATE TABLE IF NOT EXISTS batch_renewal_jobs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source_filter JSONB,
      total_items INTEGER NOT NULL DEFAULT 0,
      processed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      flagged_items INTEGER NOT NULL DEFAULT 0,
      variance_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
      adjustment_rule_ids JSONB,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_renewal_items (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES batch_renewal_jobs(id) NOT NULL,
      source_deal_id INTEGER REFERENCES deals(id) NOT NULL,
      new_deal_id INTEGER REFERENCES deals(id),
      status TEXT NOT NULL DEFAULT 'pending',
      variance_pct DECIMAL(6,2),
      variance_reason TEXT,
      error TEXT,
      processed_at TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS batch_renewal_items_job_source_uniq
      ON batch_renewal_items (job_id, source_deal_id);
    CREATE INDEX IF NOT EXISTS batch_renewal_items_status_idx
      ON batch_renewal_items (job_id, status);

    CREATE TABLE IF NOT EXISTS batch_adjustment_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'firm',
      scope_key TEXT,
      rule_type TEXT NOT NULL,
      parameters JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    -- Scope creep signals (F3.3). Heuristic detector writes one
    -- row per (deal, kind) breach; status defaults to 'open'.
    -- Detector dedupes against open rows on subsequent runs.
    CREATE TABLE IF NOT EXISTS scope_creep_signals (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      kind TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      confidence DECIMAL(4,3) NOT NULL DEFAULT 0.500,
      message TEXT NOT NULL,
      evidence JSONB,
      status TEXT NOT NULL DEFAULT 'open',
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMP,
      resolved_by TEXT,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scope_creep_signals_deal_idx
      ON scope_creep_signals (deal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS scope_creep_signals_open_idx
      ON scope_creep_signals (status) WHERE status = 'open';

    -- Collaborative scoping (F3.1). Schema-only foundation; the
    -- WebSocket + Yjs CRDT layer is intentionally not yet wired.
    -- documentState carries the serialized Yjs update vector
    -- ({format: "y-update-v1", payload: base64}) when present.
    CREATE TABLE IF NOT EXISTS collaboration_sessions (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      document_key TEXT NOT NULL,
      document_state JSONB,
      room_id TEXT NOT NULL,
      presence JSONB,
      last_edited_by TEXT,
      last_edited_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS collab_sessions_deal_key_uniq
      ON collaboration_sessions (deal_id, document_key);
    CREATE INDEX IF NOT EXISTS collab_sessions_room_idx
      ON collaboration_sessions (room_id);

    -- Client portal invites (F3.2). Magic-link auth for the
    -- client-facing /portal/* routes. tokenHash is sha256 of the
    -- raw token; we never persist plaintext. tokenSuffix is the
    -- last 6 chars of the raw token (debugging only).
    CREATE TABLE IF NOT EXISTS portal_invites (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      deal_id INTEGER REFERENCES deals(id),
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      token_suffix TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT,
      consumed_at TIMESTAMP,
      consumed_from_ip TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS portal_invites_token_hash_uniq
      ON portal_invites (token_hash);
    CREATE INDEX IF NOT EXISTS portal_invites_client_idx
      ON portal_invites (client_id, status);

    -- Time entries (F2.3). Authoritative source for "actuals" once
    -- populated; BudgetMonitorService prefers a sum-of-time-entries
    -- over the pricing-line projection when both are available.
    CREATE TABLE IF NOT EXISTS time_entries (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      user_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      hours DECIMAL(6,2) NOT NULL,
      role_id INTEGER REFERENCES roles(id),
      description TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS time_entries_deal_idx ON time_entries (deal_id, work_date DESC);
    CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries (user_name, work_date DESC);

    -- Budget actuals (F2.2). Periodic snapshot rows; one per (deal,
    -- period). Variance percent columns are nullable (null when the
    -- budget value is zero — avoids divide-by-zero garbage).
    CREATE TABLE IF NOT EXISTS budget_actuals (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      hours_budgeted DECIMAL(10,2) DEFAULT 0,
      hours_actual DECIMAL(10,2) DEFAULT 0,
      hours_var_pct DECIMAL(6,2),
      cost_budgeted DECIMAL(14,2) DEFAULT 0,
      cost_actual DECIMAL(14,2) DEFAULT 0,
      cost_var_pct DECIMAL(6,2),
      fee_budgeted DECIMAL(14,2) DEFAULT 0,
      fee_actual DECIMAL(14,2) DEFAULT 0,
      fee_var_pct DECIMAL(6,2),
      captured_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS budget_actuals_deal_idx ON budget_actuals (deal_id, period_end DESC);

    -- Budget alerts (F2.2). One row per fired threshold breach.
    -- Status defaults to 'open'; UI acknowledge/resolve flips it.
    CREATE TABLE IF NOT EXISTS budget_alerts (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      kind TEXT NOT NULL,
      metric TEXT NOT NULL,
      threshold DECIMAL(8,2) NOT NULL,
      observed DECIMAL(8,2) NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMP,
      resolved_by TEXT,
      resolved_at TIMESTAMP,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS budget_alerts_deal_idx ON budget_alerts (deal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS budget_alerts_open_idx ON budget_alerts (status) WHERE status = 'open';

    -- Domain events outbox (F1.4). The DDD strangler-fig refactor writes
    -- aggregate state + outbox rows in one transaction; an in-process
    -- dispatcher publishes them to subscribers (synchronous fanout for
    -- now). published_at stays null until delivered. The unique
    -- (aggregate_type, aggregate_id, type, occurred_at) tuple lets
    -- subscribers dedupe replays.
    CREATE TABLE IF NOT EXISTS domain_events_outbox (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      version INTEGER NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id INTEGER NOT NULL,
      payload JSONB NOT NULL,
      occurred_at TIMESTAMP NOT NULL,
      published_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS domain_events_outbox_unpublished_idx
      ON domain_events_outbox (published_at) WHERE published_at IS NULL;
    CREATE INDEX IF NOT EXISTS domain_events_outbox_aggregate_idx
      ON domain_events_outbox (aggregate_type, aggregate_id);

    -- Margin Targets: single source of truth (Task #33). Firm default is the
    -- single row with scope='firm' and scope_key NULL; per-BU and
    -- per-service-line overrides have scope_key set.
    CREATE TABLE IF NOT EXISTS margin_targets (
      id SERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_key TEXT,
      percent DECIMAL(5,2) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS margin_targets_scope_key_uniq
      ON margin_targets (scope, COALESCE(scope_key, ''));
    -- Per-scope policy knobs (Task #33, extended). All nullable: NULL means
    -- "fall back to the engagement-input preset default for the service line".
    ALTER TABLE margin_targets ADD COLUMN IF NOT EXISTS tech_admin_fee_pct DECIMAL(5,2);
    ALTER TABLE margin_targets ADD COLUMN IF NOT EXISTS line_item_rounding DECIMAL(10,2);
    ALTER TABLE margin_targets ADD COLUMN IF NOT EXISTS fixed_fee_rounding DECIMAL(10,2);
    ALTER TABLE prompt_responses ADD COLUMN IF NOT EXISTS prompt_set_id INTEGER;
    ALTER TABLE prompt_responses ADD COLUMN IF NOT EXISTS prompt_set_version INTEGER;

    DELETE FROM deal_scope_items a
      USING deal_scope_items b
      WHERE a.id > b.id AND a.deal_id = b.deal_id AND a.scope_item_id = b.scope_item_id;
    CREATE UNIQUE INDEX IF NOT EXISTS deal_scope_items_deal_item_uniq
      ON deal_scope_items (deal_id, scope_item_id);

    CREATE TABLE IF NOT EXISTS workday_settings (
      id SERIAL PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'simulated',
      tenant_url TEXT,
      isu_username TEXT,
      api_client_id TEXT,
      api_client_secret TEXT,
      auto_validate_on_save BOOLEAN DEFAULT TRUE,
      auto_check_on_submit BOOLEAN DEFAULT TRUE,
      nightly_refresh_enabled BOOLEAN DEFAULT TRUE,
      rate_variance_tolerance_pct DECIMAL(5,2) DEFAULT 10.00,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workday_cost_centers (
      id SERIAL PRIMARY KEY,
      workday_id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      fiscal_year TEXT NOT NULL DEFAULT 'FY2026',
      total_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
      committed DECIMAL(14,2) NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      business_unit TEXT,
      source TEXT NOT NULL DEFAULT 'simulated',
      last_synced_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workday_workers (
      id SERIAL PRIMARY KEY,
      workday_id TEXT NOT NULL UNIQUE,
      employee_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role_name TEXT NOT NULL,
      region TEXT,
      weekly_capacity_hours DECIMAL(6,2) NOT NULL DEFAULT 40,
      available_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
      standard_cost_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'simulated',
      last_synced_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workday_rate_cards (
      id SERIAL PRIMARY KEY,
      role_name TEXT NOT NULL,
      standard_cost_rate DECIMAL(8,2) NOT NULL,
      effective_date TEXT NOT NULL DEFAULT '2025-07-01',
      expiration_date TEXT,
      source TEXT NOT NULL DEFAULT 'simulated',
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workday_validations (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER REFERENCES deals(id) NOT NULL,
      cost_center_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'simulated',
      trigger TEXT DEFAULT 'manual',
      budget_headroom DECIMAL(14,2),
      budget_used_pct DECIMAL(5,2),
      staffing_shortfall_hours DECIMAL(10,2) DEFAULT 0,
      rate_variance_max_pct DECIMAL(6,2) DEFAULT 0,
      summary TEXT,
      override_justification TEXT,
      overridden_by TEXT,
      overridden_at TIMESTAMP,
      requested_by TEXT,
      requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workday_validation_findings (
      id SERIAL PRIMARY KEY,
      validation_id INTEGER REFERENCES workday_validations(id) NOT NULL,
      finding_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      role_name TEXT,
      required_hours DECIMAL(10,2),
      available_hours DECIMAL(10,2),
      shortfall_hours DECIMAL(10,2),
      deal_cost_rate DECIMAL(8,2),
      workday_cost_rate DECIMAL(8,2),
      variance_pct DECIMAL(6,2),
      amount DECIMAL(14,2),
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS workday_events (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_name TEXT,
      entity_ref_id INTEGER,
      deal_id INTEGER,
      status TEXT DEFAULT 'success',
      source TEXT NOT NULL DEFAULT 'simulated',
      trigger TEXT DEFAULT 'manual',
      message TEXT,
      fields JSONB,
      actor_name TEXT,
      timestamp TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // ============ INTAKE (parallel-track gating) ============
  // Mirrors shared/schema.ts:449-505. Creates a parallel non-blocking gate
  // alongside the deal wizard: a request per deal, AI-extracted fields,
  // federated reviewer approvals, and an append-only event log. References
  // deals(id) so this block must run after the deals CREATE TABLE above.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intake_requests (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL UNIQUE REFERENCES deals(id),
      external_ref TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'simulated',
      stage TEXT NOT NULL DEFAULT 'draft',
      risk_tier TEXT NOT NULL DEFAULT 'low',
      service_line TEXT,
      jurisdiction TEXT,
      matter_id TEXT,
      policy_version TEXT,
      rejection_reason TEXT,
      accepted_at TIMESTAMP,
      accepted_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS intake_extractions (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES intake_requests(id),
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      value TEXT NOT NULL,
      source_doc TEXT NOT NULL,
      confidence DECIMAL(4,3) NOT NULL DEFAULT 0.900,
      status TEXT NOT NULL DEFAULT 'pending',
      acted_by TEXT,
      acted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS intake_approvals (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES intake_requests(id),
      reviewer_role TEXT NOT NULL,
      reviewer_label TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by TEXT,
      decided_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS intake_events (
      id SERIAL PRIMARY KEY,
      request_id INTEGER REFERENCES intake_requests(id),
      deal_id INTEGER REFERENCES deals(id),
      event_type TEXT NOT NULL,
      source TEXT DEFAULT 'simulated',
      actor_name TEXT,
      actor_role TEXT,
      message TEXT,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // ============ CONGA ENGAGEMENT LETTER AUTOMATION ============
  // Mirrors the Intapp/Workday pattern: provider settings + registered
  // templates (field map + clauses) + per-deal generation history.
  // Use pool.query for multi-statement DDL — see note above.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conga_settings (
      id SERIAL PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'simulated',
      live_base_url TEXT,
      live_tenant_id TEXT,
      live_api_key_secret TEXT,
      default_template_key TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conga_templates (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      practice TEXT,
      service_line TEXT,
      description TEXT,
      field_map JSONB NOT NULL,
      clauses JSONB NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS engagement_letters (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      template_id INTEGER NOT NULL REFERENCES conga_templates(id),
      template_key TEXT NOT NULL,
      template_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'simulated',
      status TEXT NOT NULL DEFAULT 'generated',
      external_ref TEXT,
      stored_document_ref TEXT,
      document_html TEXT,
      document_base64 TEXT,
      parameters JSONB,
      generated_by TEXT,
      generated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Backfill: add document_base64 column on environments where the table
  // pre-dated the rename from document_html.
  await pool.query(`
    ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS document_base64 TEXT;
  `);

  // Backfill: ensure unique constraint on dealpad_deal_id even if table pre-existed
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dynamics_opportunities_dealpad_deal_id_unique'
      ) THEN
        BEGIN
          ALTER TABLE dynamics_opportunities ADD CONSTRAINT dynamics_opportunities_dealpad_deal_id_unique UNIQUE (dealpad_deal_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END $$;
  `);

  // Backfill scope catalog: service lines + assembly parent links.
  // Use pool.query for multi-statement DDL/DML — see note above.
  await pool.query(`
    UPDATE scope_catalog SET service_lines = 'Digital Transformation,Cloud Services' WHERE code IN ('ARCH-001','ARCH-002','ARCH-003') AND service_lines IS NULL;
    UPDATE scope_catalog SET service_lines = 'Digital Transformation,Cloud Services,NetSuite,Sage Intacct' WHERE code IN ('IMPL-001','IMPL-002','IMPL-003','IMPL-004') AND service_lines IS NULL;
    UPDATE scope_catalog SET service_lines = NULL WHERE code IN ('TEST-001','TEST-002','TEST-003','PMO-001','PMO-002','TRN-001') AND service_lines IS NULL;
    UPDATE scope_catalog SET service_lines = 'Risk Assurance,Cloud Services,Financial Audit' WHERE code = 'SEC-001' AND service_lines IS NULL;
    UPDATE scope_catalog SET service_lines = 'Cloud Services,Digital Transformation' WHERE code = 'CLD-001' AND service_lines IS NULL;

    UPDATE scope_catalog c SET parent_id = p.id FROM scope_catalog p WHERE p.code = 'ARCH-001' AND c.code IN ('ARCH-002','ARCH-003') AND c.parent_id IS NULL;
    UPDATE scope_catalog c SET parent_id = p.id FROM scope_catalog p WHERE p.code = 'IMPL-001' AND c.code IN ('IMPL-002','IMPL-003','IMPL-004') AND c.parent_id IS NULL;
    UPDATE scope_catalog c SET parent_id = p.id FROM scope_catalog p WHERE p.code = 'TEST-001' AND c.code IN ('TEST-002','TEST-003') AND c.parent_id IS NULL;
  `);

  // Seed starter templates if none exist
  const { rows: tplRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM scope_templates`);
  if (tplRows[0]?.c === 0) {
    await pool.query(`
      INSERT INTO scope_templates (name, description, service_line, sort_order) VALUES
        ('NetSuite Implementation - Mid-Market', 'Standard mid-market NetSuite ERP rollout: implementation, testing, PM, training.', 'Digital Transformation', 1),
        ('Cloud Migration - Standard', 'Lift-and-shift cloud migration with architecture, security, and project oversight.', 'Cloud Services', 2),
        ('Risk Assurance - SOC 2 Type II', 'SOC 2 Type II readiness and assessment package.', 'Risk Assurance', 3),
        ('Architecture Quick Start', 'Discovery + target-state design for a new platform decision.', NULL, 4);

      INSERT INTO scope_template_items (template_id, scope_item_id, sort_order)
      SELECT t.id, c.id, c.sort_order FROM scope_templates t, scope_catalog c
      WHERE t.name = 'NetSuite Implementation - Mid-Market' AND c.code IN ('IMPL-001','PMO-001','TRN-001','TEST-001');

      INSERT INTO scope_template_items (template_id, scope_item_id, sort_order)
      SELECT t.id, c.id, c.sort_order FROM scope_templates t, scope_catalog c
      WHERE t.name = 'Cloud Migration - Standard' AND c.code IN ('CLD-001','ARCH-002','ARCH-003','SEC-001','PMO-001');

      INSERT INTO scope_template_items (template_id, scope_item_id, sort_order)
      SELECT t.id, c.id, c.sort_order FROM scope_templates t, scope_catalog c
      WHERE t.name = 'Risk Assurance - SOC 2 Type II' AND c.code IN ('SEC-001','PMO-001','TRN-001');

      INSERT INTO scope_template_items (template_id, scope_item_id, sort_order)
      SELECT t.id, c.id, c.sort_order FROM scope_templates t, scope_catalog c
      WHERE t.name = 'Architecture Quick Start' AND c.code IN ('ARCH-001','PMO-002');
    `);
  }
}

async function start() {
  try {
    await pushSchema();
    console.log("Database schema ready");
  } catch (err) {
    console.error("FATAL: Database schema push failed; aborting startup.", err);
    process.exit(1);
  }

  // Routes must be registered before seedAll() because some integration seeds
  // expect routes/triggers to exist via shared module state. Express does not
  // bind to the port until app.listen() below, so no requests can race the seed.
  registerRoutes(app);

  try {
    await seedAll();
  } catch (err) {
    console.error("FATAL: Core seed failed; aborting startup so traffic isn't served against an empty database.", err);
    process.exit(1);
  }

  // Task #45 reconciliation: bring every existing deal's stored totalFee /
  // marginPercent / blendedRate in line with the now-canonical computation
  // from pricing_lines + engagement_inputs. Gated behind RUN_PRICING_BACKFILL
  // so production hosts only execute it once (set the env, redeploy, unset)
  // rather than paying the cost on every cold start. In dev (NODE_ENV !==
  // "production") it runs by default so engineers' boxes self-heal after
  // schema/seed changes.
  const shouldBackfill =
    process.env.RUN_PRICING_BACKFILL === "1" ||
    process.env.NODE_ENV !== "production";
  if (shouldBackfill) {
    try {
      const { backfillDealTotals } = await import("./routes");
      const result = await backfillDealTotals();
      console.log(`[backfillDealTotals] reconciled totals for ${result.updated} deal(s); rewrote ${result.linesFixed} pricing line(s) to restore rate × hours = fee`);
    } catch (e) {
      console.error("[backfillDealTotals] failed:", e);
    }
  } else {
    console.log("[backfillDealTotals] skipped (set RUN_PRICING_BACKFILL=1 to run on next boot)");
  }

  // F1.1: ensure every deal has at least one entity row, and that all existing
  // scope/pricing rows are pointed at it. Idempotent — skips deals already
  // backfilled. Same gating pattern as backfillDealTotals.
  const shouldBackfillEntities =
    process.env.RUN_MULTI_ENTITY_BACKFILL === "1" ||
    process.env.NODE_ENV !== "production";
  if (shouldBackfillEntities) {
    try {
      const { backfillMultiEntity } = await import("../scripts/migrations/001_multi_entity_backfill");
      const r = await backfillMultiEntity();
      console.log(`[001_multi_entity_backfill] scanned ${r.dealsScanned} deal(s); created ${r.entitiesCreated} primary entity row(s); assigned ${r.scopeItemsAssigned} scope item(s) and ${r.pricingLinesAssigned} pricing line(s) to their primary entity`);
    } catch (e) {
      console.error("[001_multi_entity_backfill] failed:", e);
    }
  } else {
    console.log("[001_multi_entity_backfill] skipped (set RUN_MULTI_ENTITY_BACKFILL=1 to run on next boot)");
  }

  // F1.4 strangler fig: build the deal-services container so the
  // submit/approve/reject flows + their auto-push subscribers are
  // wired before the first request arrives. Then drain any outbox
  // rows that were committed but not delivered before the last
  // process exit.
  try {
    const { getDealServices } = await import("./services/dealServices");
    const services = getDealServices();
    const drained = await services.outboxDispatcher.dispatchUnpublished();
    if (drained.dispatched > 0 || drained.failed > 0) {
      console.log(
        `[outbox] dispatched ${drained.dispatched} unpublished event(s); ${drained.failed} failed`,
      );
    }
  } catch (e) {
    console.error("[F1.4] deal-services bootstrap error:", e);
  }

  // Start nightly Intapp re-screen loop (no-op until enabled in settings)
  try {
    const { startNightlyRescreenLoop } = await import("./intapp");
    startNightlyRescreenLoop();
  } catch (e) { console.error("Intapp nightly loop bootstrap error:", e); }

  app.get("/architecture-doc", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "DealPad_Architecture_Document.html"));
  });

  app.get("/architecture-doc/download-html", (_req, res) => {
    res.download(path.join(process.cwd(), "DealPad_Architecture_Document.html"), "DealPad_Architecture_Document.html");
  });

  app.get("/architecture-doc/download-md", (_req, res) => {
    res.download(path.join(process.cwd(), "DealPad_Architecture_Document.md"), "DealPad_Architecture_Document.md");
  });

  app.get("/demo-driver", (_req, res) => {
    res.download(path.join(process.cwd(), "DealPad_Demo_Driver.pdf"), "DealPad_Demo_Driver.pdf");
  });

  app.get("/demo-driver/view", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "DealPad_Demo_Driver.pdf"));
  });

  app.get("/integrations-doc/download-pptx", (_req, res) => {
    res.download(
      path.join(process.cwd(), "exports", "Integrations-API-Overview.pptx"),
      "DealPad-Integrations-API-Overview.pptx",
    );
  });

  app.get("/integrations-doc/download-md", (_req, res) => {
    res.download(
      path.join(process.cwd(), "docs", "integrations", "api-overview.md"),
      "DealPad-Integrations-API-Overview.md",
    );
  });

  app.get("/strategy/cots-vs-build/view", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "docs", "strategy", "cots-vs-build-one-pager.pdf"));
  });

  app.get("/strategy/cots-vs-build/download-pdf", (_req, res) => {
    res.download(
      path.join(process.cwd(), "docs", "strategy", "cots-vs-build-one-pager.pdf"),
      "DealPad-COTS-vs-Build-One-Pager.pdf",
    );
  });

  app.get("/strategy/cots-vs-build/download-md", (_req, res) => {
    res.download(
      path.join(process.cwd(), "docs", "strategy", "cots-vs-build-one-pager.md"),
      "DealPad-COTS-vs-Build-One-Pager.md",
    );
  });

  const clientDistPath = path.join(process.cwd(), "dist", "public");
  app.use(express.static(clientDistPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
