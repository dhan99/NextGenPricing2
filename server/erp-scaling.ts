// ============================================================================
// ERP Implementation (S/4HANA) — engagement-input scaling
// ----------------------------------------------------------------------------
// One source of truth for: which scope items belong to the ERP template, how
// each item's hours scale from the engagement parameters (entities, countries,
// modules, integrations, data-conversion objects, RICEFW count), and the
// human-readable rationale we attach to each scaled scope-item line so a
// reviewer can see exactly why hours moved.
//
// Used by:
//   - POST /api/deals/:id/apply-template/:templateId       (template apply)
//   - POST /api/deals/:id/erp-rescale                      (re-apply after
//                                                           inputs change)
//   - POST /api/dynamics/opportunities/:id/agent-draft     (agent picking)
// ============================================================================

export const ERP_TEMPLATE_NAME = "ERP Implementation (S/4HANA)";
export const ERP_SERVICE_LINE = "ERP Implementation";

export const ERP_MODULE_KEYS = ["FI", "CO", "MM", "SD", "PP", "WM", "HR"] as const;
export type ErpModuleKey = typeof ERP_MODULE_KEYS[number];

export type ErpInputs = {
  entities: number;
  countries: number;
  modules: ErpModuleKey[];
  integrations: number;
  conversions: number;
  ricefw: number;
};

export const DEFAULT_ERP_INPUTS: ErpInputs = {
  entities: 1,
  countries: 1,
  modules: ["FI", "CO"],
  integrations: 0,
  conversions: 0,
  ricefw: 0,
};

export function parseErpInputs(raw: any): ErpInputs {
  const e = raw || {};
  const num = (v: any, d: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  let modules: ErpModuleKey[] = [];
  const m = e.modules;
  if (Array.isArray(m)) {
    modules = m.filter((x: any) => ERP_MODULE_KEYS.includes(x));
  } else if (typeof m === "string" && m.trim()) {
    modules = m.split(/[,\s]+/).map(s => s.trim().toUpperCase())
      .filter((x: any) => ERP_MODULE_KEYS.includes(x)) as ErpModuleKey[];
  }
  if (modules.length === 0) modules = [...DEFAULT_ERP_INPUTS.modules];
  return {
    entities: Math.max(1, num(e.entities, DEFAULT_ERP_INPUTS.entities)),
    countries: Math.max(1, num(e.countries, DEFAULT_ERP_INPUTS.countries)),
    modules,
    integrations: num(e.integrations, DEFAULT_ERP_INPUTS.integrations),
    conversions: num(e.conversions, DEFAULT_ERP_INPUTS.conversions),
    ricefw: num(e.ricefw, DEFAULT_ERP_INPUTS.ricefw),
  };
}

// Per-item scaling rule. `modules` (when set) gates inclusion: the item is
// only added to the deal if AT LEAST ONE of the listed modules is selected
// in the engagement inputs. Workstreams group paired modules together
// (e.g., FI/CO, MM/SD, PP/WM) so selecting either keeps the item in scope.
type Rule = {
  multiplier: (i: ErpInputs) => number;
  rationale: (i: ErpInputs, mult: number) => string;
  modules?: ErpModuleKey[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const ERP_SCALING_RULES: Record<string, Rule> = {
  // ===== Prepare =====
  "ERPPREP-001": {
    multiplier: (i) => 1 + 0.10 * (i.entities - 1) + 0.10 * (i.countries - 1),
    rationale: (i, m) => `${round1(m)}× — ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPPREP-002": {
    multiplier: (i) => 1 + 0.05 * (i.entities - 1) + 0.05 * (i.countries - 1) + 0.05 * (i.modules.length - 1),
    rationale: (i, m) => `${round1(m)}× — PMO scales lightly with ${i.entities} entities, ${i.countries} countries, ${i.modules.length} modules`,
  },
  "ERPPREP-003": {
    multiplier: (i) => 1 + 0.10 * (i.entities - 1),
    rationale: (i, m) => `${round1(m)}× — roadmap scaled to ${i.entities} entities`,
  },

  // ===== Explore (per-module fit-to-standard workshops) =====
  "ERPEXPL-001": {
    modules: ["FI", "CO"],
    multiplier: (i) => 1 + 0.20 * (i.countries - 1),
    rationale: (i, m) => `${round1(m)}× — FI/CO fit-to-standard across ${i.countries} countries`,
  },
  "ERPEXPL-002": {
    modules: ["MM", "SD"],
    multiplier: (i) => 1 + 0.20 * (i.countries - 1),
    rationale: (i, m) => `${round1(m)}× — MM/SD fit-to-standard across ${i.countries} countries`,
  },
  "ERPEXPL-003": {
    modules: ["PP", "WM"],
    multiplier: (i) => 1 + 0.20 * (i.countries - 1),
    rationale: (i, m) => `${round1(m)}× — PP/WM fit-to-standard across ${i.countries} countries`,
  },
  "ERPEXPL-004": {
    modules: ["HR"],
    multiplier: (i) => 1 + 0.25 * (i.countries - 1),
    rationale: (i, m) => `${round1(m)}× — HR/Payroll workshops across ${i.countries} countries`,
  },
  "ERPEXPL-005": {
    multiplier: (i) => 1 + 0.10 * i.ricefw + 0.10 * i.integrations,
    rationale: (i, m) => `${round1(m)}× — solution architecture sized to ${i.ricefw} RICEFW + ${i.integrations} integrations`,
  },

  // ===== Realize (per-module configuration) =====
  "ERPRLZE-001": {
    modules: ["FI", "CO"],
    multiplier: (i) => i.entities * (1 + 0.20 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — Finance config × ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPRLZE-002": {
    modules: ["MM", "SD"],
    multiplier: (i) => i.entities * (1 + 0.20 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — Supply Chain config × ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPRLZE-003": {
    modules: ["PP", "WM"],
    multiplier: (i) => i.entities * (1 + 0.15 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — Manufacturing config × ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPRLZE-004": {
    modules: ["HR"],
    multiplier: (i) => i.entities * (1 + 0.30 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — HR config × ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPRLZE-005": {
    multiplier: (i) => Math.max(1, i.integrations),
    rationale: (i, m) => `${round1(m)}× — ${i.integrations} integrations × base build effort`,
  },
  "ERPRLZE-006": {
    multiplier: (i) => Math.max(1, i.conversions),
    rationale: (i, m) => `${round1(m)}× — ${i.conversions} data-conversion objects`,
  },
  "ERPRLZE-007": {
    multiplier: (i) => Math.max(1, i.ricefw),
    rationale: (i, m) => `${round1(m)}× — ${i.ricefw} RICEFW objects`,
  },
  "ERPRLZE-008": {
    multiplier: (i) => 1 + 0.15 * (i.modules.length - 1) + 0.10 * (i.entities - 1) + 0.05 * i.integrations,
    rationale: (i, m) => `${round1(m)}× — SIT/UAT scope: ${i.modules.length} modules, ${i.entities} entities, ${i.integrations} integrations`,
  },
  "ERPRLZE-009": {
    multiplier: (i) => 1 + 0.20 * (i.countries - 1) + 0.10 * (i.entities - 1),
    rationale: (i, m) => `${round1(m)}× — training rollouts across ${i.countries} countries / ${i.entities} entities`,
  },

  // ===== Deploy =====
  "ERPDPLY-001": {
    multiplier: (i) => i.entities * Math.pow(i.countries, 0.7),
    rationale: (i, m) => `${round1(m)}× — cutover load × ${i.entities} entities × ${i.countries} countries`,
  },
  "ERPDPLY-002": {
    multiplier: (i) => i.entities * (1 + 0.30 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — go-live support across ${i.entities} entities, ${i.countries} countries`,
  },

  // ===== Run =====
  "ERPRUN-001": {
    multiplier: (i) => i.entities * (1 + 0.15 * (i.countries - 1)),
    rationale: (i, m) => `${round1(m)}× — hypercare scaled to ${i.entities} entities, ${i.countries} countries`,
  },
};

export type ErpScopeItemLike = {
  id: number;
  code: string;
  defaultHours: string | number | null;
};

export type ErpScalingResult = {
  scopeItemId: number;
  code: string;
  baseHours: number;
  multiplier: number;
  adjustedHours: number;
  notes: string;
  included: boolean;
};

// Apply scaling to a list of catalog items. Returns one entry per known ERP
// item; `included=false` means the user's module checklist excluded it.
export function scaleErpItems(
  catalogItems: ErpScopeItemLike[],
  rawInputs: any,
): ErpScalingResult[] {
  const inputs = parseErpInputs(rawInputs);
  const out: ErpScalingResult[] = [];
  for (const it of catalogItems) {
    const rule = ERP_SCALING_RULES[it.code];
    if (!rule) continue;
    const baseHours = parseFloat(String(it.defaultHours ?? "0")) || 0;
    const included = !rule.modules || rule.modules.some((m) => inputs.modules.includes(m));
    const rawMult = Math.max(0.1, rule.multiplier(inputs));
    const mult = Math.round(rawMult * 100) / 100;
    const adjusted = Math.max(1, Math.round(baseHours * mult));
    out.push({
      scopeItemId: it.id,
      code: it.code,
      baseHours,
      multiplier: mult,
      adjustedHours: adjusted,
      notes: rule.rationale(inputs, mult),
      included,
    });
  }
  return out;
}

export function summarizeErpInputs(rawInputs: any): string {
  const i = parseErpInputs(rawInputs);
  return `${i.entities} entit${i.entities === 1 ? "y" : "ies"} · ${i.countries} countr${i.countries === 1 ? "y" : "ies"} · modules: ${i.modules.join("/")} · ${i.integrations} integrations · ${i.conversions} conversion objects · ${i.ricefw} RICEFW`;
}
