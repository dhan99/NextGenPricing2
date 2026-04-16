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
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

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
