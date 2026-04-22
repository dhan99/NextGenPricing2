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

export type ErpInputValidationError = {
  field: keyof ErpInputs;
  message: string;
  reason: "missing" | "invalid" | "out_of_range";
};

const ERP_INPUT_RANGES = {
  entities: { min: 1, max: 50 },
  countries: { min: 1, max: 50 },
  integrations: { min: 0, max: 100 },
  conversions: { min: 0, max: 200 },
  ricefw: { min: 0, max: 500 },
} as const;

// Validate raw engagement-input payload for ERP deals. Unlike parseErpInputs,
// this DOES NOT silently coerce missing/invalid values to defaults — it
// returns a list of human-readable errors so callers can fail fast and tell
// the user exactly which input is wrong. Numeric fields must be present
// (non-blank), finite, and within the documented range. Modules must be a
// non-empty subset of ERP_MODULE_KEYS.
export function validateErpInputs(raw: any): ErpInputValidationError[] {
  const errors: ErpInputValidationError[] = [];
  const e = raw || {};

  const checkNumeric = (key: keyof typeof ERP_INPUT_RANGES, label: string) => {
    const v = e[key];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      errors.push({ field: key, message: `${label} is required.`, reason: "missing" });
      return;
    }
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) {
      errors.push({ field: key, message: `${label} must be a number.`, reason: "invalid" });
      return;
    }
    if (!Number.isInteger(n)) {
      errors.push({ field: key, message: `${label} must be a whole number.`, reason: "invalid" });
      return;
    }
    const { min, max } = ERP_INPUT_RANGES[key];
    if (n < min || n > max) {
      errors.push({
        field: key,
        message: `${label} must be between ${min} and ${max} (got ${n}).`,
        reason: "out_of_range",
      });
    }
  };

  checkNumeric("entities", "Entities");
  checkNumeric("countries", "Countries");
  checkNumeric("integrations", "Integrations");
  checkNumeric("conversions", "Data-conversion objects");
  checkNumeric("ricefw", "RICEFW objects");

  // Modules: must be present with at least one valid module key.
  const m = e.modules;
  let mods: string[] = [];
  let hasModulesField = false;
  if (Array.isArray(m)) {
    hasModulesField = true;
    mods = m.map((x: any) => String(x).toUpperCase());
  } else if (typeof m === "string") {
    if (m.trim() !== "") {
      hasModulesField = true;
      mods = m.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    }
  }
  if (!hasModulesField || mods.length === 0) {
    errors.push({ field: "modules", message: "Select at least one ERP module.", reason: "missing" });
  } else {
    const invalid = mods.filter(x => !(ERP_MODULE_KEYS as readonly string[]).includes(x));
    if (invalid.length > 0) {
      errors.push({
        field: "modules",
        message: `Unknown ERP module(s): ${invalid.join(", ")}. Allowed: ${ERP_MODULE_KEYS.join(", ")}.`,
        reason: "invalid",
      });
    }
  }

  return errors;
}

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
