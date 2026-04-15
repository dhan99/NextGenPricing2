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
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  riskScore: decimal("risk_score", { precision: 3, scale: 1 }),
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
  scenarioType: text("scenario_type").notNull().default("standard"),
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

export const dealsRelations = relations(deals, ({ one, many }) => ({
  client: one(clients, { fields: [deals.clientId], references: [clients.id] }),
  scopeItems: many(dealScopeItems),
  pricingLines: many(pricingLines),
  scenarios: many(scenarios),
  approvals: many(approvals),
  promptResponses: many(promptResponses),
  activities: many(activityLog),
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
