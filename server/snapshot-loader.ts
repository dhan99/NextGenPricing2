import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

const SNAPSHOT_PATH = path.join(process.cwd(), "server", "seed-snapshot.json");

const LOAD_ORDER = [
  "clients",
  "roles",
  "rate_cards",
  "rate_card_entries",
  "scope_catalog",
  "scope_templates",
  "scope_template_items",
  "prompt_sets",
  "prompt_set_items",
  "deals",
  "deal_scope_items",
  "pricing_lines",
  "scenarios",
  "approvals",
  "prompt_responses",
  "activity_log",
  "change_orders",
  "dynamics_owners",
  "dynamics_accounts",
  "dynamics_opportunities",
  "dynamics_settings",
  "dynamics_sync_log",
  "workday_settings",
  "workday_cost_centers",
  "workday_workers",
  "workday_rate_cards",
  "workday_validations",
  "workday_validation_findings",
  "workday_events",
  "intapp_settings",
  "intapp_screenings",
  "intapp_hits",
  "intapp_mitigations",
  "intapp_events",
];

export async function loadSeedSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.log("[snapshot] no snapshot file, skipping");
    return;
  }
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
  const snapshot: Record<string, any[]> = JSON.parse(raw);
  let totalInserted = 0;

  for (const table of LOAD_ORDER) {
    const rows = snapshot[table];
    if (!rows || rows.length === 0) continue;

    try {
      const before = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const beforeCount = before.rows[0]?.c ?? 0;

      const result = await pool.query(
        `INSERT INTO ${table}
           SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(rows)]
      );

      const inserted = result.rowCount ?? 0;
      totalInserted += inserted;

      // Advance the serial sequence so future inserts don't collide
      await pool.query(
        `SELECT setval(
           pg_get_serial_sequence('${table}', 'id'),
           GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1)
         )`
      ).catch(() => {});

      if (inserted > 0) {
        console.log(`[snapshot] ${table}: +${inserted} (had ${beforeCount})`);
      }
    } catch (err: any) {
      console.error(`[snapshot] ${table} failed:`, err.message);
    }
  }

  if (totalInserted > 0) {
    console.log(`[snapshot] loaded ${totalInserted} rows total`);
  } else {
    console.log("[snapshot] all rows already present");
  }
}
