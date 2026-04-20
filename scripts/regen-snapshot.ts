import { pool } from "../server/db";
import * as fs from "fs";

const TABLES = [
  "clients","roles","rate_cards","rate_card_entries","scope_catalog","scope_templates","scope_template_items",
  "prompt_sets","prompt_set_items","deals","deal_scope_items","pricing_lines","scenarios","approvals",
  "prompt_responses","activity_log","change_orders","margin_targets",
  "dynamics_owners","dynamics_accounts","dynamics_opportunities","dynamics_settings","dynamics_sync_log",
  "workday_settings","workday_cost_centers","workday_workers","workday_rate_cards",
  "workday_validations","workday_validation_findings","workday_events",
  "intapp_settings","intapp_screenings","intapp_hits","intapp_mitigations","intapp_events",
];

async function tableExists(t: string): Promise<boolean> {
  const r = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [t]);
  return !!r.rows[0]?.e;
}

async function main() {
  const snapshot: Record<string, any[]> = {};
  const counts: string[] = [];
  for (const t of TABLES) {
    if (!(await tableExists(t))) { snapshot[t] = []; counts.push(`${t}: SKIP (no table)`); continue; }
    const orderCol = t === "rate_card_entries" ? "rate_card_id, role_id" : "id";
    try {
      const r = await pool.query(`SELECT * FROM ${t} ORDER BY ${orderCol}`);
      snapshot[t] = r.rows;
      counts.push(`${t}: ${r.rows.length}`);
    } catch (e: any) {
      snapshot[t] = [];
      counts.push(`${t}: ERR (${e.message})`);
    }
  }
  fs.writeFileSync("server/seed-snapshot.json", JSON.stringify(snapshot, null, 2));
  console.log(counts.join("\n"));
  console.log("File KB:", Math.round(fs.statSync("server/seed-snapshot.json").size / 1024));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
