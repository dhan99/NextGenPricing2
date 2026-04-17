import { pgTable, text, serial, integer, decimal, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
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
  parentId: integer("parent_id"),
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
});

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
