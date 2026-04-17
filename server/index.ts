import express from "express";
import cors from "cors";
import path from "path";
import { registerRoutes } from "./routes";
import { seedDatabase } from "./seed";
import { db } from "./db";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors());
app.use(express.json());

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
  `);

  // Backfill: ensure unique constraint on dealpad_deal_id even if table pre-existed
  await db.execute(sql`
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
}

async function start() {
  try {
    await pushSchema();
    console.log("Database schema ready");

    await seedDatabase();
    console.log("Database seeded");
  } catch (err) {
    console.error("Database initialization error:", err);
  }

  registerRoutes(app);

  app.get("/architecture-doc", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "DealPad_Architecture_Document.html"));
  });

  app.get("/architecture-doc/download-html", (_req, res) => {
    res.download(path.join(process.cwd(), "DealPad_Architecture_Document.html"), "DealPad_Architecture_Document.html");
  });

  app.get("/architecture-doc/download-md", (_req, res) => {
    res.download(path.join(process.cwd(), "DealPad_Architecture_Document.md"), "DealPad_Architecture_Document.md");
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
