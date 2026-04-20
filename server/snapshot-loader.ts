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
  "margin_targets",
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

  // Re-align scope_catalog.service_lines tagging from the snapshot. This is the
  // catalog metadata the autonomous agent relies on for scope matching, and we
  // want broader tagging changes to propagate into existing dev DBs (which
  // would otherwise be skipped by ON CONFLICT DO NOTHING above).
  const catalogRows = snapshot["scope_catalog"];
  if (Array.isArray(catalogRows)) {
    let realigned = 0;
    for (const row of catalogRows) {
      if (typeof row.id !== "number") continue;
      try {
        const result = await pool.query(
          `UPDATE scope_catalog
             SET service_lines = $2
           WHERE id = $1
             AND COALESCE(service_lines, '') IS DISTINCT FROM COALESCE($2, '')`,
          [row.id, row.service_lines ?? null]
        );
        realigned += result.rowCount ?? 0;
      } catch (err: any) {
        console.error(`[snapshot] scope_catalog tag realign id=${row.id} failed:`, err.message);
      }
    }
    if (realigned > 0) {
      console.log(`[snapshot] scope_catalog: realigned service_lines on ${realigned} row(s)`);
    }
  }
}
