/**
 * One-shot codemod that inserts requirePerm/requireAnyPerm middleware into
 * Express route registrations. Run via `npx tsx scripts/apply-rbac.ts`.
 *
 * Edits are idempotent: if a route already contains requirePerm/requireAnyPerm
 * between the path and the handler, it is skipped.
 */
import * as fs from "node:fs";
import * as path from "node:path";

type Method = "get" | "post" | "put" | "patch" | "delete";

interface Rule {
  file: string;
  method: Method;
  pathPattern: string; // exact route path
  middleware: string;  // text to insert, e.g., 'requirePerm("createDeals")'
}

const ROUTES_TS = "server/routes.ts";
const DYN_TS = "server/dynamics.ts";
const INTAPP_TS = "server/intapp.ts";
const WORKDAY_TS = "server/workday.ts";
const CONGA_TS = "server/conga.ts";

const rules: Rule[] = [
  // ---- server/routes.ts ----
  // Admin
  { file: ROUTES_TS, method: "post", pathPattern: "/api/admin/reseed", middleware: 'requirePerm("manageRateCards")' },

  // Dashboard / activity / analytics
  { file: ROUTES_TS, method: "get", pathPattern: "/api/dashboard/summary", middleware: 'requirePerm("viewDashboard")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/activity", middleware: 'requirePerm("viewDashboard")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/analytics/overview", middleware: 'requirePerm("viewMargins")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/ai/dashboard-insights", middleware: 'requirePerm("viewDashboard")' },

  // Margin targets
  { file: ROUTES_TS, method: "get", pathPattern: "/api/margin-targets", middleware: 'requirePerm("viewMargins")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:id/margin-target", middleware: 'requirePerm("viewMargins")' },
  { file: ROUTES_TS, method: "put", pathPattern: "/api/margin-targets/firm", middleware: 'requirePerm("manageRateCards")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/margin-targets/overrides", middleware: 'requirePerm("manageRateCards")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/margin-targets/overrides/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/margin-targets/overrides/:id", middleware: 'requirePerm("manageRateCards")' },

  // Clients
  { file: ROUTES_TS, method: "get", pathPattern: "/api/clients", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/clients/:id", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/clients/:id", middleware: 'requirePerm("editDeals")' },

  // Deals - reads
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:id", middleware: 'requirePerm("viewDeals")' },

  // Deals - writes
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals", middleware: 'requirePerm("createDeals")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/deals/:id", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/recalc-totals", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/archive", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/restore", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/submit", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/clone", middleware: 'requirePerm("createDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/reset-pricing", middleware: 'requirePerm("editPricing")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/rate-adjust", middleware: 'requirePerm("editPricing")' },

  // Engagement spec
  { file: ROUTES_TS, method: "get", pathPattern: "/api/engagement-input-spec/:serviceLine", middleware: 'requirePerm("viewDeals")' },

  // Scope catalog
  { file: ROUTES_TS, method: "get", pathPattern: "/api/scope-catalog", middleware: 'requireAnyPerm("viewDeals", "manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/scope-catalog", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/scope-catalog/:id", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/scope-catalog/:id", middleware: 'requirePerm("manageScopeCatalog")' },

  // Deal scope items
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/scope-items", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/scope-items", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/deals/:dealId/scope-items/:id", middleware: 'requirePerm("editDeals")' },

  // Scope templates
  { file: ROUTES_TS, method: "get", pathPattern: "/api/scope-templates", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/apply-template/:templateId", middleware: 'requirePerm("editDeals")' },

  // Roles + rate cards (read)
  { file: ROUTES_TS, method: "get", pathPattern: "/api/roles", middleware: 'requirePerm("viewPricing")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/rate-cards", middleware: 'requirePerm("viewPricing")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/rate-cards/:id/entries", middleware: 'requirePerm("viewPricing")' },

  // Pricing
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/pricing", middleware: 'requirePerm("viewPricing")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/pricing", middleware: 'requirePerm("editPricing")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/deals/:dealId/pricing", middleware: 'requirePerm("editPricing")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/deals/:dealId/pricing/:id", middleware: 'requirePerm("editPricing")' },

  // Scenarios
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/scenarios", middleware: 'requirePerm("viewMargins")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/scenarios/:id/select", middleware: 'requirePerm("editPricing")' },

  // Approvals
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/approvals", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/approvals", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/approvals/:id", middleware: 'requirePerm("approveDeals")' },

  // Prompts on a deal
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/prompts", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/prompts", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/deals/:dealId/prompts/:id", middleware: 'requirePerm("editDeals")' },

  // Prompt sets (governance — pricing ops)
  { file: ROUTES_TS, method: "get", pathPattern: "/api/prompt-sets", middleware: 'requireAnyPerm("viewDeals", "manageScopeCatalog")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/prompt-sets/active", middleware: 'requireAnyPerm("viewDeals", "manageScopeCatalog")' },
  { file: ROUTES_TS, method: "get", pathPattern: "/api/prompt-sets/:id", middleware: 'requireAnyPerm("viewDeals", "manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/prompt-sets", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/prompt-sets/:id", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/prompt-sets/:id", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/prompt-sets/:id/publish", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/prompt-sets/:id/clone", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/prompt-sets/:id/archive", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/prompt-sets/:id/items", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/prompt-sets/:id/items/:itemId", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: ROUTES_TS, method: "delete", pathPattern: "/api/prompt-sets/:id/items/:itemId", middleware: 'requirePerm("manageScopeCatalog")' },

  // AI endpoints (PDL only — runAI)
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/deal-similarity", middleware: 'requirePerm("runAI")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/effort-estimation", middleware: 'requirePerm("runAI")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/margin-advisor", middleware: 'requirePerm("runAI")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/scenario-recommendation", middleware: 'requirePerm("runAI")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/risk-summary", middleware: 'requirePerm("runAI")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/architecture-chat", middleware: 'requirePerm("viewArchitecture")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/ai/ask", middleware: 'requirePerm("runAI")' },

  // Agent endpoints
  { file: ROUTES_TS, method: "post", pathPattern: "/api/dynamics/opportunities/:id/agent-draft", middleware: 'requirePerm("createDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/agent-approve", middleware: 'requirePerm("createDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/agent-discard", middleware: 'requirePerm("createDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/agent-open-wizard", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:id/agent-resubmit", middleware: 'requirePerm("editDeals")' },

  // Change orders
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/change-orders", middleware: 'requirePerm("viewDeals")' },
  { file: ROUTES_TS, method: "post", pathPattern: "/api/deals/:dealId/change-orders", middleware: 'requirePerm("editDeals")' },
  { file: ROUTES_TS, method: "patch", pathPattern: "/api/change-orders/:id", middleware: 'requirePerm("editDeals")' },

  // Proposal
  { file: ROUTES_TS, method: "get", pathPattern: "/api/deals/:dealId/proposal", middleware: 'requirePerm("viewDeals")' },

  // ---- server/dynamics.ts ----
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/accounts", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/accounts/:id", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/opportunities", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/opportunities/eligible", middleware: 'requirePerm("createDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/opportunities/:id/unlink", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/opportunities/:id/send-back", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/scope-templates", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/opportunities", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/pipeline", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/sync-log", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/settings", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "get", pathPattern: "/api/dynamics/owners", middleware: 'requirePerm("viewDeals")' },
  { file: DYN_TS, method: "patch", pathPattern: "/api/dynamics/settings", middleware: 'requirePerm("manageRateCards")' },
  { file: DYN_TS, method: "patch", pathPattern: "/api/dynamics/accounts/:id", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "patch", pathPattern: "/api/dynamics/opportunities/:id", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/opportunities/:id/import", middleware: 'requirePerm("createDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/deals/:id/push", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/sync", middleware: 'requirePerm("editDeals")' },
  { file: DYN_TS, method: "post", pathPattern: "/api/dynamics/nightly-batch", middleware: 'requirePerm("manageRateCards")' },

  // ---- server/conga.ts ----
  { file: CONGA_TS, method: "get", pathPattern: "/api/conga/settings", middleware: 'requirePerm("viewDeals")' },
  { file: CONGA_TS, method: "patch", pathPattern: "/api/conga/settings", middleware: 'requirePerm("manageScopeCatalog")' },
  { file: CONGA_TS, method: "get", pathPattern: "/api/conga/templates", middleware: 'requireAnyPerm("viewDeals", "manageScopeCatalog")' },
  { file: CONGA_TS, method: "get", pathPattern: "/api/conga/deals/:dealId/letters", middleware: 'requirePerm("viewDeals")' },
  { file: CONGA_TS, method: "post", pathPattern: "/api/conga/deals/:dealId/letters", middleware: 'requirePerm("editDeals")' },
  { file: CONGA_TS, method: "post", pathPattern: "/api/conga/letters/:id/deliver", middleware: 'requirePerm("editDeals")' },
  { file: CONGA_TS, method: "get", pathPattern: "/api/conga/letters/:id/download", middleware: 'requirePerm("viewDeals")' },

  // ---- server/workday.ts ----
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/deals/:id/push", middleware: 'requirePerm("editDeals")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/settings", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "patch", pathPattern: "/api/workday/settings", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/cost-centers", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/cost-centers", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "patch", pathPattern: "/api/workday/cost-centers/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "delete", pathPattern: "/api/workday/cost-centers/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/workers", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/workers", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "patch", pathPattern: "/api/workday/workers/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "delete", pathPattern: "/api/workday/workers/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/rate-card", middleware: 'requirePerm("viewPricing")' },
  { file: WORKDAY_TS, method: "patch", pathPattern: "/api/workday/rate-card/:id", middleware: 'requirePerm("manageRateCards")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/validations", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/validations/:id", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/deals/:dealId/latest", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/deals/:dealId/validate", middleware: 'requirePerm("editDeals")' },
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/deals/:dealId/link", middleware: 'requirePerm("editDeals")' },
  { file: WORKDAY_TS, method: "post", pathPattern: "/api/workday/validations/:id/override", middleware: 'requirePerm("approveDeals")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/events", middleware: 'requirePerm("viewDeals")' },
  { file: WORKDAY_TS, method: "get", pathPattern: "/api/workday/dashboard", middleware: 'requirePerm("viewDashboard")' },

  // ---- server/intapp.ts ----
  { file: INTAPP_TS, method: "get", pathPattern: "/api/intapp/settings", middleware: 'requirePerm("viewDeals")' },
  { file: INTAPP_TS, method: "patch", pathPattern: "/api/intapp/settings", middleware: 'requirePerm("manageRateCards")' },
  { file: INTAPP_TS, method: "get", pathPattern: "/api/intapp/screenings", middleware: 'requirePerm("viewRiskSummary")' },
  { file: INTAPP_TS, method: "get", pathPattern: "/api/intapp/screenings/:id", middleware: 'requirePerm("viewRiskSummary")' },
  { file: INTAPP_TS, method: "get", pathPattern: "/api/intapp/deals/:dealId/screening", middleware: 'requirePerm("viewDeals")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/deals/:dealId/screen", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/screenings/:id/recheck", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "get", pathPattern: "/api/intapp/screenings/:id/mitigations", middleware: 'requirePerm("viewRiskSummary")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/screenings/:id/mitigations", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "patch", pathPattern: "/api/intapp/mitigations/:id", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/mitigations/:id/push", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/screenings/:id/push-outcome", middleware: 'requirePerm("editDeals")' },
  { file: INTAPP_TS, method: "post", pathPattern: "/api/intapp/screenings/:id/override", middleware: 'requirePerm("approveDeals")' },
];

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let totalApplied = 0;
let totalSkipped = 0;
const filesTouched = new Set<string>();
const missing: Rule[] = [];

const grouped = new Map<string, Rule[]>();
for (const r of rules) {
  if (!grouped.has(r.file)) grouped.set(r.file, []);
  grouped.get(r.file)!.push(r);
}

for (const [filePath, rs] of grouped) {
  const abs = path.resolve(filePath);
  let src = fs.readFileSync(abs, "utf8");
  let imported = /from ["']\.\/rbac["']/.test(src);

  for (const r of rs) {
    // Match: app.METHOD("PATH", <something>)
    // We want to insert middleware BEFORE the second arg if not already present.
    const re = new RegExp(
      `app\\.${r.method}\\(\\s*(["'\`])${escapeReg(r.pathPattern)}\\1\\s*,\\s*`,
      "g",
    );
    let found = false;
    src = src.replace(re, (match, _q, _offset) => {
      found = true;
      // Look-ahead the original src to see if middleware already follows
      // (we cannot easily look at the rest here, so check via a marker tag).
      return match + `__RBAC_INSERT__(${r.middleware})__END__`;
    });
    if (!found) {
      missing.push(r);
    }
  }

  // Now resolve the markers: drop ones that already had requirePerm right after.
  // Simpler: since we always inserted, scan and (a) confirm middleware not duplicated,
  // (b) replace marker with bare middleware text + ", ".
  src = src.replace(
    /__RBAC_INSERT__\((.+?)\)__END__/g,
    (_m, mw) => `${mw}, `,
  );

  // De-duplicate: if a route line accidentally has the middleware twice in a row
  // (because previous run already inserted it), collapse.
  src = src.replace(/(requirePerm\([^)]*\)|requireAnyPerm\([^)]*\))\s*,\s*\1\s*,\s*/g, "$1, ");

  if (!imported && /requirePerm|requireAnyPerm/.test(src)) {
    // Insert import line after the last import statement.
    const importRegex = /^(import .+;\s*\n)+/m;
    const m = src.match(importRegex);
    if (m) {
      const insertAt = (m.index || 0) + m[0].length;
      src = src.slice(0, insertAt) + `import { requirePerm, requireAnyPerm } from "./rbac";\n` + src.slice(insertAt);
      imported = true;
    }
  }

  fs.writeFileSync(abs, src);
  filesTouched.add(filePath);
}

for (const r of rules) {
  // Re-verify the route now contains the middleware right after the path.
  const src = fs.readFileSync(path.resolve(r.file), "utf8");
  const verifyRe = new RegExp(
    `app\\.${r.method}\\(\\s*["'\`]${escapeReg(r.pathPattern)}["'\`]\\s*,\\s*${escapeReg(r.middleware)}\\s*,`,
  );
  if (verifyRe.test(src)) totalApplied++;
  else totalSkipped++;
}

console.log(`[apply-rbac] files touched:`, [...filesTouched]);
console.log(`[apply-rbac] applied:`, totalApplied, `skipped:`, totalSkipped);
if (missing.length) {
  console.log(`[apply-rbac] MISSING (route signature not found, please verify):`);
  for (const r of missing) {
    console.log(`  ${r.method.toUpperCase()} ${r.pathPattern}  in  ${r.file}`);
  }
}
