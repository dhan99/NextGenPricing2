import { pgTable, text, serial, integer, decimal, boolean, timestamp, jsonb, varchar, uniqueIndex, customType } from "drizzle-orm/pg-core";

/**
 * pgvector `vector(N)` column type for Drizzle (F2.1.2). The
 * extension ships with `CREATE TYPE vector` of dimension N; we model
 * it client-side as a `number[]` and serialize to the canonical
 * "[a,b,c,...]" wire format. Read path tolerates both string and
 * array shapes (driver versions differ).
 *
 * Usage: `embedding: vector("embedding", { dimensions: 1536 })`
 */
const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (Array.isArray(value)) return value as number[];
    if (typeof value === "string") {
      // pgvector returns "[1,2,3]" — strip brackets, split, parse.
      const stripped = value.replace(/^\[|\]$/g, "");
      if (!stripped) return [];
      return stripped.split(",").map((n) => parseFloat(n));
    }
    return [];
  },
});
import { relations } from "drizzle-orm";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry"),
  segment: text("segment"),
  region: text("region"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  revenueSize: text("revenue_size"),
  relationshipYears: integer("relationship_years"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  dealNumber: text("deal_number").notNull().unique(),
  title: text("title").notNull(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  status: text("status").notNull().default("draft"),
  dealType: text("deal_type").notNull().default("new"),
  businessUnit: text("business_unit"),
  serviceLine: text("service_line"),
  region: text("region"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  complexity: text("complexity").default("medium"),
  totalFee: decimal("total_fee", { precision: 12, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).default("0"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).default("0"),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).default("0"),
  blendedRate: decimal("blended_rate", { precision: 8, scale: 2 }).default("0"),
  currentStep: integer("current_step").default(1),
  pdlName: text("pdl_name"),
  pdlEmail: text("pdl_email"),
  parentDealId: integer("parent_deal_id"),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  riskScore: decimal("risk_score", { precision: 3, scale: 1 }),
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  workdayCostCenterId: integer("workday_cost_center_id"),
  engagementInputs: jsonb("engagement_inputs"),
  // Per-deal margin target override. When set, takes precedence over the
  // firm/BU/serviceLine defaults from the margin_targets table. Captured by
  // the pricing lead during the wizard's Pricing step (Task #33).
  targetMarginPercent: decimal("target_margin_percent", { precision: 5, scale: 2 }),
  // F2.1 — Deal fingerprint. Structured features extracted from a deal
  // (BU, serviceLine, scope-item count, fee bucket, complexity, etc.)
  // used as a fast cache key for the similarity engine. The fingerprint
  // is a JSONB blob so the schema doesn't lock us into a specific
  // feature set; the IntelligenceEngine writes it on the same path that
  // computes the deal's embedding. NULL until first compute.
  fingerprint: jsonb("fingerprint"),
  // F2.1.2 — Deal embedding. 1536-dimensional dense vector produced by
  // the IntelligenceEngine (text-embedding-3-small or equivalent) over
  // the deal's title + scope summary + entity list. Indexed via HNSW
  // for sub-500ms k-NN similarity search. NULL until first compute;
  // background job back-fills on existing rows.
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Multi-entity worksheets (F1.1). A single tax engagement commonly models
// 4 entities under one deal — e.g. 1040 + 1120 + 1065 + 1120S — each with its
// own scope and pricing rollup. The deal stays the contracting unit; entities
// live below it. Pre-F1.1 deals have a single auto-created "Primary Entity"
// (see scripts/migrations/001_multi_entity_backfill.ts) so existing scope and
// pricing rows can be assigned without behavior change.
export const dealEntities = pgTable("deal_entities", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  name: text("name").notNull(),                            // e.g. "Form 1040", "DE-Holding LLC"
  entityType: text("entity_type"),                          // e.g. "1040", "1120", "1065", "1120S", or NULL for non-tax
  jurisdiction: text("jurisdiction"),                       // e.g. "US-DE", "UK-LDN"
  sortOrder: integer("sort_order").default(0),
  isPrimary: boolean("is_primary").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // (deal_id, name) is unique — no two entities under the same deal can share
  // a label. Backfill creates exactly one "Primary Entity" per deal so this
  // never collides on existing data.
  uniqDealEntityName: uniqueIndex("deal_entities_deal_name_uniq").on(t.dealId, t.name),
}));

export const scopeCatalog = pgTable("scope_catalog", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  defaultHours: decimal("default_hours", { precision: 8, scale: 2 }),
  isAssembly: boolean("is_assembly").default(false),
  parentId: integer("parent_id").references((): any => scopeCatalog.id),
  serviceLines: text("service_lines"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

export const scopeTemplates = pgTable("scope_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  serviceLine: text("service_line"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scopeTemplateItems = pgTable("scope_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => scopeTemplates.id).notNull(),
  scopeItemId: integer("scope_item_id").references(() => scopeCatalog.id).notNull(),
  defaultHours: decimal("default_hours", { precision: 8, scale: 2 }),
  complexityMultiplier: decimal("complexity_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  sortOrder: integer("sort_order").default(0),
});

// F1.2 — Assembly expansion engine. Today scope_catalog.isAssembly groups
// children via parent_id and the cascade is implicit (POST /scope-items
// adds every child of a parent). That covers simple bundles but not the
// Tax PHB Excel calculator's parametric assemblies, which have:
//   - tier-based hour overrides (Ultimate / Enhanced / Essential)
//   - quantity formulas computed from prompt answers + engagement inputs
//     (e.g. "1 per entity × 2 if multi-jurisdiction")
//   - per-component prompt dependencies
//
// `assembly_templates` is the explicit spec for an assembly catalog item.
// `assembly_components` is its line-by-line expansion. Backwards compat:
// when a scope_catalog row has is_assembly=true but no template, the
// legacy parent_id cascade still applies. The new model is opt-in per
// assembly catalog item — set up the template and AssemblyExpansionService
// (slice 2) prefers it over the cascade.
export const assemblyTemplates = pgTable("assembly_templates", {
  id: serial("id").primaryKey(),
  // The assembly catalog row this template implements. Unique so we
  // never have two competing templates for the same assembly.
  scopeItemId: integer("scope_item_id").references(() => scopeCatalog.id).notNull().unique(),
  name: text("name").notNull(),                      // e.g. "Tax PHB — 1040 Calculator"
  description: text("description"),
  serviceLine: text("service_line"),                  // optional segmentation hint
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const assemblyComponents = pgTable("assembly_components", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => assemblyTemplates.id).notNull(),
  // The leaf scope_catalog row this component expands into. NOT unique
  // per template — a single template may pull the same leaf in twice
  // (e.g. one for federal, one for state) with different formulas.
  scopeItemId: integer("scope_item_id").references(() => scopeCatalog.id).notNull(),
  // Tier overrides — tax pricing's three packages. Each is an HOURS
  // override applied to the leaf's defaultHours when the deal's tier
  // matches. NULL = use the leaf's defaultHours unchanged.
  ultimateTierOverride: decimal("ultimate_tier_override", { precision: 8, scale: 2 }),
  enhancedTierOverride: decimal("enhanced_tier_override", { precision: 8, scale: 2 }),
  essentialTierOverride: decimal("essential_tier_override", { precision: 8, scale: 2 }),
  // Pure-arithmetic expression evaluated against engagement_inputs +
  // prompt answers + a small whitelist of identifiers. Resolves to a
  // non-negative integer "how many of this leaf to add". NULL = always 1.
  // The mathjs sandbox in slice 2 enforces no function calls beyond
  // basic arithmetic.
  quantityFormula: text("quantity_formula"),
  // Optional pointer at a specific prompt this component's quantity
  // depends on. The expansion service uses this to surface "answer this
  // prompt before adding" UX warnings.
  promptId: integer("prompt_id").references(() => promptSetItems.id),
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
});

export const dealScopeItems = pgTable("deal_scope_items", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  scopeItemId: integer("scope_item_id").references(() => scopeCatalog.id).notNull(),
  quantity: integer("quantity").default(1),
  adjustedHours: decimal("adjusted_hours", { precision: 8, scale: 2 }),
  complexityMultiplier: decimal("complexity_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  notes: text("notes"),
  // F1.1: which entity (under this deal) does this scope row belong to?
  // Nullable for back-compat — existing rows are pointed at the deal's
  // Primary Entity by 001_multi_entity_backfill. New rows should always
  // populate this once the entity-aware UI ships.
  entityId: integer("entity_id").references(() => dealEntities.id),
}, (t) => ({
  uniqDealScopeItem: uniqueIndex("deal_scope_items_deal_item_uniq").on(t.dealId, t.scopeItemId),
}));

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  defaultRate: decimal("default_rate", { precision: 8, scale: 2 }).notNull(),
  costRate: decimal("cost_rate", { precision: 8, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const rateCards = pgTable("rate_cards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  effectiveDate: text("effective_date"),
  expirationDate: text("expiration_date"),
  isActive: boolean("is_active").default(true),
  region: text("region"),
});

export const rateCardEntries = pgTable("rate_card_entries", {
  id: serial("id").primaryKey(),
  rateCardId: integer("rate_card_id").references(() => rateCards.id).notNull(),
  roleId: integer("role_id").references(() => roles.id).notNull(),
  rate: decimal("rate", { precision: 8, scale: 2 }).notNull(),
  costRate: decimal("cost_rate", { precision: 8, scale: 2 }).notNull(),
});

export const pricingLines = pgTable("pricing_lines", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  scenarioId: integer("scenario_id"),
  roleId: integer("role_id").references(() => roles.id).notNull(),
  scopeItemId: integer("scope_item_id"),
  hours: decimal("hours", { precision: 8, scale: 2 }).notNull().default("0"),
  rate: decimal("rate", { precision: 8, scale: 2 }).notNull(),
  costRate: decimal("cost_rate", { precision: 8, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 12, scale: 2 }).default("0"),
  cost: decimal("cost", { precision: 12, scale: 2 }).default("0"),
  margin: decimal("margin", { precision: 12, scale: 2 }).default("0"),
  // ---- Per-step rate override (US: rate override by step) -----------------
  // standardRate is the rate-card-derived baseline captured at line creation
  // and never overwritten by a user edit. It is the comparator used to decide
  // whether a line is currently "overridden" and to render the variance badge.
  standardRate: decimal("standard_rate", { precision: 8, scale: 2 }),
  rateOverridden: boolean("rate_overridden").default(false),
  overrideReason: text("override_reason"),
  overrideBy: text("override_by"),
  overrideAt: timestamp("override_at"),
  // F1.1: same shape as dealScopeItems.entityId — nullable for back-compat,
  // backfilled to the deal's Primary Entity for legacy rows.
  entityId: integer("entity_id").references(() => dealEntities.id),
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  scenarioType: text("scenario_type").notNull().default("option_1"),
  isRecommended: boolean("is_recommended").default(false),
  totalFee: decimal("total_fee", { precision: 12, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).default("0"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).default("0"),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).default("0"),
  blendedRate: decimal("blended_rate", { precision: 8, scale: 2 }).default("0"),
  aiReasoning: text("ai_reasoning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  scenarioId: integer("scenario_id"),
  status: text("status").notNull().default("pending"),
  approverName: text("approver_name"),
  approverRole: text("approver_role"),
  approverEmail: text("approver_email"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  comments: text("comments"),
  riskSummary: text("risk_summary"),
  aiNarrative: text("ai_narrative"),
});

export const promptResponses = pgTable("prompt_responses", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
  category: text("category"),
  impactMultiplier: decimal("impact_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  sortOrder: integer("sort_order").default(0),
  promptSetId: integer("prompt_set_id"),
  promptSetVersion: integer("prompt_set_version"),
});

// Governed, versioned prompt sets owned by Pricing Operations (US-12).
// Only one published set per (businessUnit, serviceLine) is "active" at a time.
export const promptSets = pgTable("prompt_sets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  businessUnit: text("business_unit"),
  serviceLine: text("service_line"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft | published | archived
  notes: text("notes"),
  publishedAt: timestamp("published_at"),
  publishedBy: text("published_by"),
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Each prompt belongs to a set. `options` is an array of {label, multiplier} entries.
export const promptSetItems = pgTable("prompt_set_items", {
  id: serial("id").primaryKey(),
  promptSetId: integer("prompt_set_id").references(() => promptSets.id, { onDelete: "cascade" }).notNull(),
  question: text("question").notNull(),
  category: text("category"),
  helpText: text("help_text"),
  options: jsonb("options").notNull(), // [{ label: string, multiplier: string }]
  sortOrder: integer("sort_order").default(0),
  enabled: boolean("enabled").default(true),
});

// Single source of truth for the firm's margin target AND per-scope pricing
// policy knobs (Task #33, extended). One row per scope: a single "firm" row
// holds the firm-wide default margin; additional rows hold per-business-unit
// or per-service-line overrides. The resolver picks the most specific
// applicable row for a given deal (deal override → BU → service line → firm).
//
// `percent` is the gross-margin target (always required).
// The remaining columns are *optional* per-service-line policy overrides
// applied on top of ENGAGEMENT_INPUT_PRESETS when generating the engagement
// inputs spec for a deal. NULL means "use the preset default".
export const marginTargets = pgTable("margin_targets", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(), // "firm" | "bu" | "serviceLine"
  scopeKey: text("scope_key"), // null for firm; BU name or service-line name otherwise
  percent: decimal("percent", { precision: 5, scale: 2 }).notNull(),
  techAdminFeePct: decimal("tech_admin_fee_pct", { precision: 5, scale: 2 }),
  lineItemRounding: decimal("line_item_rounding", { precision: 10, scale: 2 }),
  fixedFeeRounding: decimal("fixed_fee_rounding", { precision: 10, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniqScope: uniqueIndex("margin_targets_scope_key_uniq").on(t.scope, t.scopeKey),
}));

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id),
  action: text("action").notNull(),
  description: text("description"),
  userName: text("user_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const changeOrders = pgTable("change_orders", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  version: integer("version").notNull().default(1),
  changeType: text("change_type").notNull().default("scope_change"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  originalFee: decimal("original_fee", { precision: 12, scale: 2 }).default("0"),
  originalCost: decimal("original_cost", { precision: 12, scale: 2 }).default("0"),
  originalHours: decimal("original_hours", { precision: 10, scale: 2 }).default("0"),
  newFee: decimal("new_fee", { precision: 12, scale: 2 }).default("0"),
  newCost: decimal("new_cost", { precision: 12, scale: 2 }).default("0"),
  newHours: decimal("new_hours", { precision: 10, scale: 2 }).default("0"),
  deltaFee: decimal("delta_fee", { precision: 12, scale: 2 }).default("0"),
  deltaCost: decimal("delta_cost", { precision: 12, scale: 2 }).default("0"),
  deltaHours: decimal("delta_hours", { precision: 10, scale: 2 }).default("0"),
  scopeChanges: jsonb("scope_changes"),
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// F1.3 — Batch renewal processing. Tax season needs 1,000+ renewal deals
// turned around in <2 days. Today there's only a single-deal /api/deals/:id
// /clone endpoint; F1.3 adds the orchestrator + per-item variance flagging
// + adjustment-rule application so an operator can renew a year's worth
// of deals in one job. The worker runs synchronous TS in the route layer
// (slice 2) for sub-100-deal batches; the Python+Celery+Redis worker
// (slice 5) handles production-scale parallelism.
export const batchRenewalJobs = pgTable("batch_renewal_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                                    // "Tax Season 2027 — Renewals"
  status: text("status").notNull().default("pending"),             // pending | running | completed | failed | cancelled
  // Filter that produced the candidate source deals — captured so a
  // failed batch can be re-run with the same input set, and so the
  // audit trail tells you "this batch came from these deals".
  sourceFilter: jsonb("source_filter"),
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  failedItems: integer("failed_items").notNull().default(0),
  flaggedItems: integer("flagged_items").notNull().default(0),     // above variance threshold
  // Items with variance >= this threshold get status='flagged' instead
  // of 'completed'; an operator must explicitly accept them. Default
  // 10% pulled from BACKLOG.md F1.3 done-when ("flagged for review").
  varianceThresholdPct: decimal("variance_threshold_pct", { precision: 5, scale: 2 }).notNull().default("10.00"),
  // IDs of batch_adjustment_rules to apply to every item in the job.
  // Stored as JSONB array of integers for cheap lookup; FK enforcement
  // is at the orchestrator layer.
  adjustmentRuleIds: jsonb("adjustment_rule_ids"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const batchRenewalItems = pgTable("batch_renewal_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => batchRenewalJobs.id).notNull(),
  sourceDealId: integer("source_deal_id").references(() => deals.id).notNull(),
  // Set after the orchestrator successfully clones + adjusts.
  newDealId: integer("new_deal_id").references(() => deals.id),
  status: text("status").notNull().default("pending"),             // pending | running | completed | flagged | failed
  // Computed variance: (new_total_fee - source_total_fee) / source_total_fee × 100.
  // Stored even on flagged items so the operator's review UI can sort.
  variancePct: decimal("variance_pct", { precision: 6, scale: 2 }),
  varianceReason: text("variance_reason"),                          // e.g. "scope mix changed; 3 items dropped"
  error: text("error"),                                             // populated on status=failed
  processedAt: timestamp("processed_at"),
}, (t) => ({
  uniqJobSource: uniqueIndex("batch_renewal_items_job_source_uniq").on(t.jobId, t.sourceDealId),
}));

export const batchAdjustmentRules = pgTable("batch_adjustment_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("firm"),                  // firm | bu | serviceLine
  scopeKey: text("scope_key"),
  // Rule kind. Each kind has a different `parameters` shape:
  //   rate_uplift          { factor: 1.05 }              — multiply per-line rate by factor
  //   hour_adjustment      { factor: 0.95 }              — multiply per-line hours by factor
  //   margin_target_override { percent: 38 }             — set deal targetMarginPercent
  //   tech_admin_fee_override { percent: 7 }             — set engagementInputs.techAdminFeePct
  ruleType: text("rule_type").notNull(),
  parameters: jsonb("parameters").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============ DOMAIN EVENTS OUTBOX (F1.4) ============
// Outbox for the DDD strangler-fig refactor. Application services write
// aggregate state + outbox rows in a single transaction; an in-process
// dispatcher publishes them to subscribers. The table is the durable
// source for replay and debugging — subscribers must be idempotent.
//
// `published_at` is set by the dispatcher when delivery completes;
// rows where it stays null after a restart are picked up on next boot.
// `payload` is the raw event JSON so we can replay even if the
// deserializer evolves; `version` lets subscribers fan out by schema.
export const domainEventsOutbox = pgTable("domain_events_outbox", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),                       // e.g. "DealSubmitted"
  version: integer("version").notNull(),              // event schema version
  aggregateType: text("aggregate_type").notNull(),    // e.g. "Deal"
  aggregateId: integer("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),                // full event including ts + actor
  occurredAt: timestamp("occurred_at").notNull(),     // when the domain event happened
  publishedAt: timestamp("published_at"),             // null until dispatched
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ DYNAMICS 365 SIMULATION (persistent) ============
export const dynamicsOwners = pgTable("dynamics_owners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  quota: decimal("quota", { precision: 14, scale: 2 }).default("2500000"),
});

export const dynamicsAccounts = pgTable("dynamics_accounts", {
  id: serial("id").primaryKey(),
  dynamicsId: text("dynamics_id").notNull().unique(),
  accountNumber: text("account_number").notNull().unique(),
  dealpadClientId: integer("dealpad_client_id").references(() => clients.id),
  name: text("name").notNull(),
  industry: text("industry"),
  industryCode: text("industry_code"),
  segment: text("segment"),
  annualRevenue: decimal("annual_revenue", { precision: 16, scale: 2 }).default("0"),
  numberOfEmployees: integer("number_of_employees").default(0),
  ownerName: text("owner_name"),
  ownerEmail: text("owner_email"),
  parentAccount: text("parent_account"),
  contactName: text("contact_name"),
  contactTitle: text("contact_title"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  billingStreet: text("billing_street"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingZip: text("billing_zip"),
  billingCountry: text("billing_country").default("USA"),
  relationshipType: text("relationship_type").default("Customer"),
  customerSince: text("customer_since"),
  syncStatus: text("sync_status").default("synced"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dynamicsOpportunities = pgTable("dynamics_opportunities", {
  id: serial("id").primaryKey(),
  dynamicsId: text("dynamics_id").notNull().unique(),
  opportunityNumber: text("opportunity_number").notNull().unique(),
  dealpadDealId: integer("dealpad_deal_id").references(() => deals.id),
  dynamicsAccountId: integer("dynamics_account_id").references(() => dynamicsAccounts.id),
  name: text("name").notNull(),
  accountName: text("account_name"),
  estimatedValue: decimal("estimated_value", { precision: 14, scale: 2 }).default("0"),
  actualValue: decimal("actual_value", { precision: 14, scale: 2 }),
  stage: text("stage").default("Qualify"),
  probability: integer("probability").default(20),
  estimatedCloseDate: text("estimated_close_date"),
  actualCloseDate: text("actual_close_date"),
  ownerName: text("owner_name"),
  salesProcess: text("sales_process").default("Armanino NextGenApp Sales Process"),
  forecastCategory: text("forecast_category").default("Pipeline"),
  rating: text("rating").default("Warm"),
  syncStatus: text("sync_status").default("synced"),
  syncDirection: text("sync_direction").default("bidirectional"),
  lastPushedAt: timestamp("last_pushed_at"),
  lastPulledAt: timestamp("last_pulled_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dynamicsSyncLog = pgTable("dynamics_sync_log", {
  id: serial("id").primaryKey(),
  direction: text("direction").notNull(),
  entity: text("entity").notNull(),
  entityName: text("entity_name").notNull(),
  entityRefId: integer("entity_ref_id"),
  action: text("action").notNull(),
  fields: jsonb("fields"),
  status: text("status").default("success"),
  message: text("message"),
  actorName: text("actor_name"),
  trigger: text("trigger").default("manual"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const dynamicsSettings = pgTable("dynamics_settings", {
  id: serial("id").primaryKey(),
  autoPushEnabled: boolean("auto_push_enabled").default(false),
  autoPushOnStageChange: boolean("auto_push_on_stage_change").default(true),
  autoPushOnFeeChange: boolean("auto_push_on_fee_change").default(true),
  nightlyBatchEnabled: boolean("nightly_batch_enabled").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============ INTAPP RISK & COMPLIANCE (simulation, swappable to live) ============
export const intappSettings = pgTable("intapp_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("simulated"),
  autoScreenOnSubmit: boolean("auto_screen_on_submit").default(true),
  blockSubmitOnConflict: boolean("block_submit_on_conflict").default(true),
  allowQrmOverride: boolean("allow_qrm_override").default(true),
  autoScreenOnClientChange: boolean("auto_screen_on_client_change").default(false),
  nightlyRescreen: boolean("nightly_rescreen").default(false),
  apiBaseUrl: text("api_base_url"),
  apiTokenSecret: text("api_token_secret"),
  liveTenantUrl: text("live_tenant_url"),
  liveClientId: text("live_client_id"),
  liveApiKeySecret: text("live_api_key_secret"),
  policyVersion: text("policy_version").default("4w-pilot-v1"),
  pilotEndsOn: text("pilot_ends_on"),
  qrmNotifyOnConflict: boolean("qrm_notify_on_conflict").default(true),
  qrmNotifyChannel: text("qrm_notify_channel").default("email"),
  qrmNotifyRecipients: text("qrm_notify_recipients"),
  qrmTeamsWebhookUrl: text("qrm_teams_webhook_url"),
  appBaseUrl: text("app_base_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const intappScreenings = pgTable("intapp_screenings", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  source: text("source").notNull().default("simulated"),
  status: text("status").notNull().default("pending"),
  result: text("result").default("pending"),
  riskTier: text("risk_tier").default("low"),
  hitCount: integer("hit_count").default(0),
  policyVersion: text("policy_version"),
  externalRef: text("external_ref"),
  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  payloadSnapshot: jsonb("payload_snapshot"),
  narrative: text("narrative"),
});

export const intappHits = pgTable("intapp_hits", {
  id: serial("id").primaryKey(),
  screeningId: integer("screening_id").references(() => intappScreenings.id).notNull(),
  hitType: text("hit_type").notNull(),
  severity: text("severity").notNull().default("low"),
  matchedEntity: text("matched_entity"),
  description: text("description"),
  recommendation: text("recommendation"),
  externalRef: text("external_ref"),
});

export const intappMitigations = pgTable("intapp_mitigations", {
  id: serial("id").primaryKey(),
  screeningId: integer("screening_id").references(() => intappScreenings.id).notNull(),
  hitId: integer("hit_id").references(() => intappHits.id),
  status: text("status").notNull().default("pending"),
  action: text("action").notNull(),
  notes: text("notes"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intappEvents = pgTable("intapp_events", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id),
  screeningId: integer("screening_id").references(() => intappScreenings.id),
  eventType: text("event_type").notNull(),
  source: text("source").default("simulated"),
  actorName: text("actor_name"),
  actorRole: text("actor_role"),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ INTAPP INTAKE (simulation, swappable to live) ============
// Sits in front of conflicts: opens a request per deal, runs AI extractions,
// drives a federated approval matrix, ties to the screening engine, and
// assigns a matter ID at acceptance.
export const intakeRequests = pgTable("intake_requests", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull().unique(),
  externalRef: text("external_ref").notNull(),
  source: text("source").notNull().default("simulated"),
  stage: text("stage").notNull().default("draft"), // draft | screening | policy | approval | accepted | rejected | on_hold
  riskTier: text("risk_tier").notNull().default("low"), // low | medium | high
  serviceLine: text("service_line"),
  jurisdiction: text("jurisdiction"),
  matterId: text("matter_id"),
  policyVersion: text("policy_version"),
  rejectionReason: text("rejection_reason"),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: text("accepted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const intakeExtractions = pgTable("intake_extractions", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").references(() => intakeRequests.id).notNull(),
  fieldKey: text("field_key").notNull(), // contact | scope_summary | start_date | service_line | risk_factor | budget_range
  fieldLabel: text("field_label").notNull(),
  value: text("value").notNull(),
  sourceDoc: text("source_doc").notNull(), // simulated source: "RFP_v2.pdf" etc.
  confidence: decimal("confidence", { precision: 4, scale: 3 }).notNull().default("0.900"),
  status: text("status").notNull().default("pending"), // pending | applied | dismissed
  actedBy: text("acted_by"),
  actedAt: timestamp("acted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intakeApprovals = pgTable("intake_approvals", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").references(() => intakeRequests.id).notNull(),
  reviewerRole: text("reviewer_role").notNull(), // gc | aml | ethics | pricing_committee | independence_partner | jurisdictional_counsel
  reviewerLabel: text("reviewer_label").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | waived
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intakeEvents = pgTable("intake_events", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").references(() => intakeRequests.id),
  dealId: integer("deal_id").references(() => deals.id),
  eventType: text("event_type").notNull(),
  source: text("source").default("simulated"),
  actorName: text("actor_name"),
  actorRole: text("actor_role"),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ WORKDAY SIMULATION (persistent) ============
export const workdaySettings = pgTable("workday_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("simulated"), // 'simulated' | 'live'
  tenantUrl: text("tenant_url"),
  isuUsername: text("isu_username"),
  apiClientId: text("api_client_id"),
  apiClientSecret: text("api_client_secret"),
  autoValidateOnSave: boolean("auto_validate_on_save").default(true),
  autoCheckOnSubmit: boolean("auto_check_on_submit").default(true),
  nightlyRefreshEnabled: boolean("nightly_refresh_enabled").default(true),
  rateVarianceTolerancePct: decimal("rate_variance_tolerance_pct", { precision: 5, scale: 2 }).default("10.00"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workdayCostCenters = pgTable("workday_cost_centers", {
  id: serial("id").primaryKey(),
  workdayId: text("workday_id").notNull().unique(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  fiscalYear: text("fiscal_year").notNull().default("FY2026"),
  totalBudget: decimal("total_budget", { precision: 14, scale: 2 }).notNull().default("0"),
  committed: decimal("committed", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: text("currency").default("USD"),
  businessUnit: text("business_unit"),
  source: text("source").notNull().default("simulated"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workdayWorkers = pgTable("workday_workers", {
  id: serial("id").primaryKey(),
  workdayId: text("workday_id").notNull().unique(),
  employeeNumber: text("employee_number").notNull().unique(),
  name: text("name").notNull(),
  roleName: text("role_name").notNull(),
  region: text("region"),
  weeklyCapacityHours: decimal("weekly_capacity_hours", { precision: 6, scale: 2 }).notNull().default("40"),
  availableHours: decimal("available_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  standardCostRate: decimal("standard_cost_rate", { precision: 8, scale: 2 }).notNull().default("0"),
  source: text("source").notNull().default("simulated"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

export const workdayRateCards = pgTable("workday_rate_cards", {
  id: serial("id").primaryKey(),
  roleName: text("role_name").notNull(),
  standardCostRate: decimal("standard_cost_rate", { precision: 8, scale: 2 }).notNull(),
  effectiveDate: text("effective_date").notNull().default("2025-07-01"),
  expirationDate: text("expiration_date"),
  source: text("source").notNull().default("simulated"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workdayValidations = pgTable("workday_validations", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  costCenterId: integer("cost_center_id"),
  status: text("status").notNull().default("pending"), // pending | clean | over_budget | staffing_shortfall | rate_variance | failed
  source: text("source").notNull().default("simulated"),
  trigger: text("trigger").default("manual"), // manual | save | submit | nightly
  budgetHeadroom: decimal("budget_headroom", { precision: 14, scale: 2 }),
  budgetUsedPct: decimal("budget_used_pct", { precision: 5, scale: 2 }),
  staffingShortfallHours: decimal("staffing_shortfall_hours", { precision: 10, scale: 2 }).default("0"),
  rateVarianceMaxPct: decimal("rate_variance_max_pct", { precision: 6, scale: 2 }).default("0"),
  summary: text("summary"),
  overrideJustification: text("override_justification"),
  overriddenBy: text("overridden_by"),
  overriddenAt: timestamp("overridden_at"),
  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const workdayValidationFindings = pgTable("workday_validation_findings", {
  id: serial("id").primaryKey(),
  validationId: integer("validation_id").references(() => workdayValidations.id).notNull(),
  findingType: text("finding_type").notNull(), // budget | staffing | rate
  severity: text("severity").notNull().default("info"), // info | warning | blocker
  roleName: text("role_name"),
  requiredHours: decimal("required_hours", { precision: 10, scale: 2 }),
  availableHours: decimal("available_hours", { precision: 10, scale: 2 }),
  shortfallHours: decimal("shortfall_hours", { precision: 10, scale: 2 }),
  dealCostRate: decimal("deal_cost_rate", { precision: 8, scale: 2 }),
  workdayCostRate: decimal("workday_cost_rate", { precision: 8, scale: 2 }),
  variancePct: decimal("variance_pct", { precision: 6, scale: 2 }),
  amount: decimal("amount", { precision: 14, scale: 2 }),
  message: text("message"),
});

export const workdayEvents = pgTable("workday_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(), // pull | validate | override | link | unlink | settings | seed
  entity: text("entity").notNull(), // CostCenter | Worker | RateCard | Validation | Settings | System
  entityName: text("entity_name"),
  entityRefId: integer("entity_ref_id"),
  dealId: integer("deal_id"),
  status: text("status").default("success"),
  source: text("source").notNull().default("simulated"),
  trigger: text("trigger").default("manual"),
  message: text("message"),
  fields: jsonb("fields"),
  actorName: text("actor_name"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// ============ CONGA ENGAGEMENT LETTER AUTOMATION ============
// Mirrors the Intapp / Workday simulated→live provider pattern.
// `congaTemplates` are registered template metadata (authoring stays in Conga
// Composer itself). `engagementLetters` is the per-deal generation history.
export const congaSettings = pgTable("conga_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("simulated"), // 'simulated' | 'live'
  liveBaseUrl: text("live_base_url"),
  liveTenantId: text("live_tenant_id"),
  liveApiKeySecret: text("live_api_key_secret"),
  defaultTemplateKey: text("default_template_key"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const congaTemplates = pgTable("conga_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  practice: text("practice"),       // e.g. Audit, Tax, Consulting, Advisory
  serviceLine: text("service_line"),
  description: text("description"),
  // Field map describes which deal/client/pricing fields flow into each
  // template merge field. Stored as [{ field, source, description }] JSON.
  fieldMap: jsonb("field_map").notNull(),
  // Standard clauses appended/varied by template. Stored as
  // [{ heading, body }] for use by the simulated PDF renderer.
  clauses: jsonb("clauses").notNull(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const engagementLetters = pgTable("engagement_letters", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  templateId: integer("template_id").references(() => congaTemplates.id).notNull(),
  templateKey: text("template_key").notNull(),
  templateName: text("template_name").notNull(),
  source: text("source").notNull().default("simulated"),
  status: text("status").notNull().default("generated"), // generated | failed
  // External reference returned by Conga Composer (sim: SIM-CONGA-XXXXXX).
  externalRef: text("external_ref"),
  // Stored document. For the simulated provider we persist the rendered HTML
  // so re-download produces the exact same document.
  storedDocumentRef: text("stored_document_ref"),
  // Generated PDF document, stored as a base64 string. Re-download decodes
  // and serves it back as application/pdf.
  documentBase64: text("document_base64"),
  // Snapshot of the parameters that were merged into the template (deal,
  // client, pricing summary). Lets QRM see exactly what was sent to Conga.
  parameters: jsonb("parameters"),
  generatedBy: text("generated_by"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const dealsRelations = relations(deals, ({ one, many }) => ({
  client: one(clients, { fields: [deals.clientId], references: [clients.id] }),
  scopeItems: many(dealScopeItems),
  pricingLines: many(pricingLines),
  scenarios: many(scenarios),
  approvals: many(approvals),
  promptResponses: many(promptResponses),
  activities: many(activityLog),
  changeOrders: many(changeOrders),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  deals: many(deals),
}));

export const dealScopeItemsRelations = relations(dealScopeItems, ({ one }) => ({
  deal: one(deals, { fields: [dealScopeItems.dealId], references: [deals.id] }),
  scopeItem: one(scopeCatalog, { fields: [dealScopeItems.scopeItemId], references: [scopeCatalog.id] }),
}));

export const pricingLinesRelations = relations(pricingLines, ({ one }) => ({
  deal: one(deals, { fields: [pricingLines.dealId], references: [deals.id] }),
  role: one(roles, { fields: [pricingLines.roleId], references: [roles.id] }),
}));

export const scenariosRelations = relations(scenarios, ({ one }) => ({
  deal: one(deals, { fields: [scenarios.dealId], references: [deals.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  deal: one(deals, { fields: [approvals.dealId], references: [deals.id] }),
}));

export const promptResponsesRelations = relations(promptResponses, ({ one }) => ({
  deal: one(deals, { fields: [promptResponses.dealId], references: [deals.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  deal: one(deals, { fields: [activityLog.dealId], references: [deals.id] }),
}));

export const changeOrdersRelations = relations(changeOrders, ({ one }) => ({
  deal: one(deals, { fields: [changeOrders.dealId], references: [deals.id] }),
}));
