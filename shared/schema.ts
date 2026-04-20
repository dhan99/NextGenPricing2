import { pgTable, text, serial, integer, decimal, boolean, timestamp, jsonb, varchar, uniqueIndex } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

export const dealScopeItems = pgTable("deal_scope_items", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => deals.id).notNull(),
  scopeItemId: integer("scope_item_id").references(() => scopeCatalog.id).notNull(),
  quantity: integer("quantity").default(1),
  adjustedHours: decimal("adjusted_hours", { precision: 8, scale: 2 }),
  complexityMultiplier: decimal("complexity_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  notes: text("notes"),
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
