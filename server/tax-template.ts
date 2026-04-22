// Complex Tax Engagement template — parametric metadata.
//
// Companion to the lighter "Tax Provision Outsourcing" template (Task #30).
// This one is for multi-workstream complex Tax engagements where effort is
// driven by jurisdictions, legal entities, tax types, return counts, and
// transfer-pricing transaction volume — not a flat checklist of deliverables.
//
// The catalog rows themselves live in scope_catalog (seeded via
// seed-snapshot.json); this module holds the *behavioural* metadata the
// agent and rollup helpers need but that doesn't fit the catalog schema:
// workstream classification, recurring vs project flag, role mix, and the
// per-item scaling rule.

export const COMPLEX_TAX_TEMPLATE_NAME = "Complex Tax Engagement";
export const COMPLEX_TAX_SERVICE_LINE = "Tax-Corporate";
export const COMPLEX_TAX_BUSINESS_UNIT = "Tax Services";

export type TaxWorkstream =
  | "direct"
  | "indirect"
  | "tp"
  | "intl"
  | "controversy"
  | "ma"
  | "pmo";

export const WORKSTREAM_LABELS: Record<TaxWorkstream, string> = {
  direct: "Direct Tax / Provision",
  indirect: "Indirect Tax",
  tp: "Transfer Pricing",
  intl: "International / Pillar 2",
  controversy: "Tax Controversy",
  ma: "M&A Tax Due Diligence",
  pmo: "Engagement Management",
};

// Code-prefix → workstream. Mirrors the codes seeded into scope_catalog.
export const WORKSTREAM_BY_PREFIX: Record<string, TaxWorkstream> = {
  "TAX-DIR": "direct",
  "TAX-IND": "indirect",
  "TAX-TP": "tp",
  "TAX-INT": "intl",
  "TAX-CON": "controversy",
  "TAX-MA": "ma",
  "TAX-PMO": "pmo",
};

export type ScalingBasis =
  | "flat"
  | "perEntity"
  | "perJurisdiction"
  | "perReturn"
  | "perTpTransaction"
  | "perTaxType";

export type TaxItemMeta = {
  workstream: TaxWorkstream;
  recurring: boolean; // recurring fixed-fee vs one-off project
  scaling: { basis: ScalingBasis; factor: number };
  baseHoursPerUnit: number; // hours per scaled unit (when basis !== flat)
  baseHoursFlat?: number; // hours when basis === flat
};

// Per-code metadata for the seeded catalog rows. Keep in sync with the
// scope_catalog rows in server/seed-snapshot.json.
export const COMPLEX_TAX_ITEM_META: Record<string, TaxItemMeta> = {
  // Direct Tax / Provision (ASC 740 / IAS 12)
  "TAX-DIR-001": { workstream: "direct", recurring: true,  scaling: { basis: "perEntity", factor: 1 }, baseHoursPerUnit: 28 }, // Annual provision per entity
  "TAX-DIR-002": { workstream: "direct", recurring: true,  scaling: { basis: "perEntity", factor: 4 }, baseHoursPerUnit: 6 },  // Quarterly provision (4 per yr per entity)
  "TAX-DIR-003": { workstream: "direct", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 60 }, // Uncertain tax positions review
  "TAX-DIR-004": { workstream: "direct", recurring: true,  scaling: { basis: "perReturn", factor: 1 }, baseHoursPerUnit: 22 }, // Federal/state return preparation per return
  "TAX-DIR-005": { workstream: "direct", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 80 }, // Tax accounting methods study

  // Indirect Tax (VAT/GST/Sales-and-Use)
  "TAX-IND-001": { workstream: "indirect", recurring: false, scaling: { basis: "perJurisdiction", factor: 1 }, baseHoursPerUnit: 24 }, // Indirect tax registration per country
  "TAX-IND-002": { workstream: "indirect", recurring: true,  scaling: { basis: "perJurisdiction", factor: 12 }, baseHoursPerUnit: 4 }, // Monthly VAT/GST filings per jurisdiction
  "TAX-IND-003": { workstream: "indirect", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 240 }, // Indirect tax transformation / tech enablement
  "TAX-IND-004": { workstream: "indirect", recurring: false, scaling: { basis: "perJurisdiction", factor: 1 }, baseHoursPerUnit: 32 }, // Nexus / taxability study per jurisdiction

  // Transfer Pricing
  "TAX-TP-001": { workstream: "tp", recurring: true,  scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 120 }, // Master file
  "TAX-TP-002": { workstream: "tp", recurring: true,  scaling: { basis: "perJurisdiction", factor: 1 }, baseHoursPerUnit: 60 }, // Local file per jurisdiction
  "TAX-TP-003": { workstream: "tp", recurring: true,  scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 40 }, // CbCR preparation
  "TAX-TP-004": { workstream: "tp", recurring: false, scaling: { basis: "perTpTransaction", factor: 1 }, baseHoursPerUnit: 12 }, // Benchmarking per intercompany transaction
  "TAX-TP-005": { workstream: "tp", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 100 }, // Operational TP / policy design

  // International / Pillar 2 / GILTI / Subpart F
  "TAX-INT-001": { workstream: "intl", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 200 }, // Pillar 2 readiness assessment
  "TAX-INT-002": { workstream: "intl", recurring: true,  scaling: { basis: "perJurisdiction", factor: 1 }, baseHoursPerUnit: 32 }, // Pillar 2 GloBE compliance per jurisdiction
  "TAX-INT-003": { workstream: "intl", recurring: true,  scaling: { basis: "perEntity", factor: 1 }, baseHoursPerUnit: 16 }, // GILTI / Subpart F computation per CFC
  "TAX-INT-004": { workstream: "intl", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 80 }, // Treaty / withholding analysis

  // Controversy
  "TAX-CON-001": { workstream: "controversy", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 160 }, // Audit defense — open exam
  "TAX-CON-002": { workstream: "controversy", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 100 }, // IDR response / appeals support

  // M&A Tax Due Diligence
  "TAX-MA-001":  { workstream: "ma", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 180 }, // Buy-side tax DD — federal/state
  "TAX-MA-002":  { workstream: "ma", recurring: false, scaling: { basis: "perJurisdiction", factor: 1 }, baseHoursPerUnit: 28 }, // International tax DD per jurisdiction
  "TAX-MA-003":  { workstream: "ma", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 80 }, // Tax structuring memo

  // Engagement Management (PMO)
  "TAX-PMO-001": { workstream: "pmo", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 80 }, // Engagement PMO / status reporting
  "TAX-PMO-002": { workstream: "pmo", recurring: false, scaling: { basis: "flat", factor: 1 }, baseHoursPerUnit: 0, baseHoursFlat: 40 }, // Quality / EQR review
};

// Senior-heavy Tax pyramid. Partner / Sr. Manager / Manager carry more weight
// than the default Digital pyramid. Sums to 1.00.
export const COMPLEX_TAX_ROLE_DISTRIBUTION: Record<string, number> = {
  "Partner": 0.13,
  "Managing Director": 0.12,
  "Senior Manager": 0.22,
  "Manager": 0.20,
  "Senior Consultant": 0.18,
  "Consultant": 0.10,
  "Analyst": 0.05,
};

export type ComplexTaxInputs = {
  entities: number;
  jurisdictions: string[];
  taxTypes: string[];
  returnsPerYear: number;
  tpTransactions: number;
  recurringMixPct: number; // 0..100 — informational; actual split is computed
};

export const COMPLEX_TAX_DEFAULT_INPUTS: ComplexTaxInputs = {
  entities: 5,
  jurisdictions: ["US", "UK", "DE"],
  taxTypes: ["Direct", "Indirect", "TP"],
  returnsPerYear: 12,
  tpTransactions: 20,
  recurringMixPct: 55,
};

// Coerce raw engagement-input values (which may be strings, comma-separated,
// or missing) into a typed ComplexTaxInputs object with defaults filled in.
export function readComplexTaxInputs(raw: any): ComplexTaxInputs {
  const r = raw || {};
  const num = (v: any, d: number): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const list = (v: any, d: string[]): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === "string") {
      const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
      return parts.length > 0 ? parts : d;
    }
    return d;
  };
  return {
    entities: Math.max(1, Math.round(num(r.taxEntities, COMPLEX_TAX_DEFAULT_INPUTS.entities))),
    jurisdictions: list(r.taxJurisdictions, COMPLEX_TAX_DEFAULT_INPUTS.jurisdictions),
    taxTypes: list(r.taxTypes, COMPLEX_TAX_DEFAULT_INPUTS.taxTypes),
    returnsPerYear: Math.max(0, Math.round(num(r.taxReturnsPerYear, COMPLEX_TAX_DEFAULT_INPUTS.returnsPerYear))),
    tpTransactions: Math.max(0, Math.round(num(r.tpTransactions, COMPLEX_TAX_DEFAULT_INPUTS.tpTransactions))),
    recurringMixPct: Math.max(0, Math.min(100, num(r.recurringMixPct, COMPLEX_TAX_DEFAULT_INPUTS.recurringMixPct))),
  };
}

// Compute scaled hours for a single catalog code given engagement inputs.
// Returns the scaled hours plus a human-readable explanation that's shown
// next to the line item in the wizard scope step.
// Result is structured so the caller can persist the line as
//   adjustedHours = perUnit, quantity = quantity
// so the existing pricing math `quantity × adjustedHours × multiplier`
// lands on `hours` without double-counting. `hours` (= perUnit × units) is
// also returned for rollup callers that want the total directly.
export function scaleHoursFor(
  code: string,
  inputs: ComplexTaxInputs,
): { hours: number; perUnit: number; quantity: number; multiplier: number; explanation: string } | null {
  const meta = COMPLEX_TAX_ITEM_META[code];
  if (!meta) return null;
  const { basis, factor } = meta.scaling;
  let units = 1;
  let basisLabel = "";
  switch (basis) {
    case "flat":
      units = 1; basisLabel = "flat"; break;
    case "perEntity":
      units = inputs.entities * factor; basisLabel = `${inputs.entities} entities${factor !== 1 ? ` × ${factor}` : ""}`;
      break;
    case "perJurisdiction":
      units = inputs.jurisdictions.length * factor;
      basisLabel = `${inputs.jurisdictions.length} jurisdictions${factor !== 1 ? ` × ${factor}` : ""}`;
      break;
    case "perReturn":
      units = inputs.returnsPerYear * factor; basisLabel = `${inputs.returnsPerYear} returns/yr`;
      break;
    case "perTpTransaction":
      units = inputs.tpTransactions * factor; basisLabel = `${inputs.tpTransactions} TP txns`;
      break;
    case "perTaxType":
      units = inputs.taxTypes.length * factor; basisLabel = `${inputs.taxTypes.length} tax types`;
      break;
  }
  const perUnit = basis === "flat" ? (meta.baseHoursFlat ?? 0) : meta.baseHoursPerUnit;
  const hours = Math.max(0, Math.round(units * perUnit));
  const explanation =
    basis === "flat"
      ? `Flat scope: ${perUnit}h`
      : `Scaled: ${basisLabel} × ${perUnit}h = ${hours}h`;
  // Quantity follows units exactly so that quantity × adjustedHours equals
  // the computed `hours`. Inputs that legitimately resolve to zero units
  // (e.g. taxReturnsPerYear=0, tpTransactions=0) must persist as zero
  // quantity rather than being rounded up to 1, otherwise pricing math
  // would bill those lines despite the explicit zero input. Flat-basis
  // items always have units=1.
  const quantity = Math.max(0, Math.round(units));
  return {
    hours,
    perUnit,
    quantity,
    multiplier: units,
    explanation,
  };
}

// Returns true if the opportunity name (or any free-form deal text) carries
// cues that this is a complex Tax engagement rather than a simple provision
// outsource. Conservative on purpose — better to fall back to the lighter
// template than to over-route.
export function isComplexTaxCue(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  if (!n) return false;
  if (n.includes("pillar 2") || n.includes("pillar two") || n.includes("globe")) return true;
  if (n.includes("transfer pricing") || /\btp\b.*(?:study|documentation|local file|master file)/.test(n)) return true;
  if (n.includes("asc 740") || n.includes("ias 12")) return true;
  if (n.includes("m&a tax") || n.includes("tax due diligence") || n.includes("tax dd")) return true;
  if (n.includes("indirect tax transformation") || n.includes("vat transformation")) return true;
  if (n.includes("multi-jurisdiction") || n.includes("multi jurisdiction")) return true;
  if (n.includes("controversy") && n.includes("tax")) return true;
  if (n.includes("complex tax")) return true;
  return false;
}

// Compute workstream subtotals + recurring/project split from a list of
// scaled scope items. Used for the pricing-roll-up panel and persisted onto
// deals.engagement_inputs.taxRollup so the agent log preserves it.
export function summarizeTaxRollup(
  items: Array<{ code: string; hours: number; fee: number }>,
): {
  workstreams: Array<{ key: TaxWorkstream; label: string; hours: number; fee: number; itemCount: number }>;
  recurring: { hours: number; fee: number; itemCount: number };
  project:   { hours: number; fee: number; itemCount: number };
  totals:    { hours: number; fee: number; itemCount: number };
} {
  const wsAgg: Record<string, { hours: number; fee: number; itemCount: number }> = {};
  const recurring = { hours: 0, fee: 0, itemCount: 0 };
  const project   = { hours: 0, fee: 0, itemCount: 0 };
  let totalH = 0, totalF = 0, totalC = 0;

  for (const it of items) {
    const meta = COMPLEX_TAX_ITEM_META[it.code];
    if (!meta) continue;
    const ws = meta.workstream;
    if (!wsAgg[ws]) wsAgg[ws] = { hours: 0, fee: 0, itemCount: 0 };
    wsAgg[ws].hours += it.hours;
    wsAgg[ws].fee   += it.fee;
    wsAgg[ws].itemCount += 1;
    if (meta.recurring) { recurring.hours += it.hours; recurring.fee += it.fee; recurring.itemCount += 1; }
    else                { project.hours   += it.hours; project.fee   += it.fee; project.itemCount   += 1; }
    totalH += it.hours; totalF += it.fee; totalC += 1;
  }
  const wsOrder: TaxWorkstream[] = ["direct", "indirect", "tp", "intl", "controversy", "ma", "pmo"];
  const workstreams = wsOrder
    .filter((k) => wsAgg[k])
    .map((k) => ({ key: k, label: WORKSTREAM_LABELS[k], ...wsAgg[k] }));
  return {
    workstreams,
    recurring, project,
    totals: { hours: totalH, fee: totalF, itemCount: totalC },
  };
}

// Engagement-input field spec for the "Tax-Corporate" preset. Surfaced via
// /api/engagement-input-spec so the wizard renders it automatically.
export const COMPLEX_TAX_INPUT_FIELDS = [
  { key: "taxEntities", label: "Legal Entities in Scope", type: "number",
    help: "Number of legal entities included in the engagement. Drives per-entity provision and CFC items." },
  { key: "taxJurisdictions", label: "Jurisdictions in Scope", type: "text",
    help: "Comma-separated country / state codes (e.g. US, UK, DE). Drives per-jurisdiction items (local files, VAT registrations, Pillar 2 GloBE)." },
  { key: "taxTypes", label: "Tax Types in Scope", type: "text",
    help: "Comma-separated. Examples: Direct, Indirect, TP, International, Controversy, M&A. Informational." },
  { key: "taxReturnsPerYear", label: "Tax Returns per Year", type: "number",
    help: "Total federal + state + foreign returns expected annually. Drives return-prep items." },
  { key: "tpTransactions", label: "Transfer-Pricing Transactions", type: "number",
    help: "Count of intercompany transactions to benchmark. Drives TP benchmarking effort." },
  { key: "recurringMixPct", label: "Recurring vs Project Mix (%)", type: "number", suffix: "%",
    help: "Informational target for the recurring share of fees. Actual split is computed from scaled items." },
];

export const COMPLEX_TAX_INPUT_DEFAULTS: Record<string, string> = {
  taxEntities: String(COMPLEX_TAX_DEFAULT_INPUTS.entities),
  taxJurisdictions: COMPLEX_TAX_DEFAULT_INPUTS.jurisdictions.join(", "),
  taxTypes: COMPLEX_TAX_DEFAULT_INPUTS.taxTypes.join(", "),
  taxReturnsPerYear: String(COMPLEX_TAX_DEFAULT_INPUTS.returnsPerYear),
  tpTransactions: String(COMPLEX_TAX_DEFAULT_INPUTS.tpTransactions),
  recurringMixPct: String(COMPLEX_TAX_DEFAULT_INPUTS.recurringMixPct),
};
