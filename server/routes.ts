import { Express, Request, Response } from "express";
import { db } from "./db";
import { clients, deals, scopeCatalog, dealScopeItems, scopeTemplates, scopeTemplateItems, roles, rateCards, rateCardEntries, pricingLines, scenarios, approvals, promptResponses, activityLog, changeOrders, dynamicsOpportunities, promptSets, promptSetItems } from "../shared/schema";
import { eq, desc, sql, and, count, isNull, isNotNull, asc } from "drizzle-orm";

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Fallback prompt set used only if no governed prompt set is published for the
// deal's BU+service line AND no published cross-service default exists.
// Pricing Operations should publish a real set per BU/service line via /api/prompt-sets.
const STANDARD_PROMPTS = [
  { question: "How many geographic regions are involved?", category: "Complexity", sortOrder: 1 },
  { question: "Are there regulatory/compliance requirements?", category: "Compliance", sortOrder: 2 },
  { question: "What is the expected data volume?", category: "Complexity", sortOrder: 3 },
  { question: "How many integrations are required?", category: "Integration", sortOrder: 4 },
  { question: "Is there an existing system being replaced?", category: "Migration", sortOrder: 5 },
  { question: "What is the client's technical maturity?", category: "Client", sortOrder: 6 },
  { question: "Is there a hard deadline or external dependency?", category: "Timeline", sortOrder: 7 },
];

// Find the most-specific published prompt set for a deal's BU + serviceLine.
// Specificity priority: exact (BU+SL) > BU-only > SL-only > cross-service default.
async function findActivePromptSet(businessUnit: string | null | undefined, serviceLine: string | null | undefined) {
  const all = await db.select().from(promptSets).where(eq(promptSets.status, "published"));
  if (all.length === 0) return null;
  const score = (s: any): number => {
    const buMatch = s.businessUnit && businessUnit && s.businessUnit === businessUnit;
    const slMatch = s.serviceLine && serviceLine && s.serviceLine === serviceLine;
    const buNull = !s.businessUnit;
    const slNull = !s.serviceLine;
    if (buMatch && slMatch) return 100;
    if (buMatch && slNull) return 80;
    if (buNull && slMatch) return 60;
    if (buNull && slNull) return 40;
    return -1; // mismatch — exclude
  };
  const ranked = all.map(s => ({ s, score: score(s) })).filter(x => x.score >= 0);
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => b.score - a.score || b.s.version - a.s.version);
  return ranked[0].s;
}

async function createDefaultPrompts(dealId: number) {
  const existing = await db.select({ id: promptResponses.id }).from(promptResponses)
    .where(eq(promptResponses.dealId, dealId)).limit(1);
  if (existing.length > 0) return;
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  const activeSet = deal ? await findActivePromptSet(deal.businessUnit, deal.serviceLine) : null;
  if (activeSet) {
    const items = await db.select().from(promptSetItems)
      .where(and(eq(promptSetItems.promptSetId, activeSet.id), eq(promptSetItems.enabled, true)))
      .orderBy(asc(promptSetItems.sortOrder));
    if (items.length > 0) {
      await db.insert(promptResponses).values(items.map((it) => ({
        dealId,
        question: it.question,
        answer: null,
        category: it.category,
        impactMultiplier: "1.0",
        sortOrder: it.sortOrder ?? 0,
        promptSetId: activeSet.id,
        promptSetVersion: activeSet.version,
      })));
      return;
    }
  }
  // No governed set found — fall back to the hardcoded baseline.
  await db.insert(promptResponses).values(
    STANDARD_PROMPTS.map((p) => ({
      dealId,
      question: p.question,
      answer: null,
      category: p.category,
      impactMultiplier: "1.0",
      sortOrder: p.sortOrder,
    }))
  );
}

const ROLE_DISTRIBUTION: Record<string, number> = {
  "Partner": 0.07, "Managing Director": 0.10, "Senior Manager": 0.17,
  "Manager": 0.20, "Senior Consultant": 0.26, "Consultant": 0.13, "Analyst": 0.07,
};

const COMPLEXITY_MULTIPLIERS: Record<string, number> = { low: 0.8, medium: 1.0, high: 1.2, very_high: 1.5 };

async function recalcPricingFromScope(dealId: number) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { scopeItems: { with: { scopeItem: true } }, promptResponses: true },
  });
  if (!deal) return;

  const baseMultiplier = COMPLEXITY_MULTIPLIERS[deal.complexity || "medium"] || 1.0;
  const promptMultiplier = (deal.promptResponses || []).reduce(
    (m: number, p: any) => m * (parseFloat(p.impactMultiplier) || 1.0), 1.0
  );
  const totalMultiplier = baseMultiplier * promptMultiplier;

  // Engagement Inputs adjustments (Tax PHB Excel parity): T&M rate adjustment % and rounding
  const ei: any = (deal as any).engagementInputs || {};
  const rateAdjustmentPct = parseFloat(ei.tmRateAdjustmentPct ?? "0") || 0;
  const rateAdjustmentFactor = 1 + rateAdjustmentPct / 100;
  const techAdminFeePct = parseFloat(ei.techAdminFeePct ?? "0") || 0;
  const lineRounding = parseFloat(ei.lineItemRounding ?? "0") || 0;
  const roundLine = (v: number) => lineRounding > 0 ? Math.round(v / lineRounding) * lineRounding : v;

  // Use only billable items (assemblies are groupings, not billable lines)
  const billableScope = (deal.scopeItems || []).filter((si: any) => !si.scopeItem?.isAssembly);
  let totalHours: number;
  if (billableScope.length > 0) {
    totalHours = billableScope.reduce((sum: number, si: any) => {
      const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "40");
      const qty = si.quantity || 1;
      return sum + Math.round(baseHrs * qty * totalMultiplier);
    }, 0);
  } else {
    totalHours = Math.round(200 * totalMultiplier);
  }

  const existingLines = await db.select().from(pricingLines)
    .where(eq(pricingLines.dealId, dealId));

  if (existingLines.length > 0) {
    const allRoles = await db.select().from(roles).orderBy(roles.sortOrder);
    const roleMap = new Map(allRoles.map(r => [r.id, r]));

    for (const line of existingLines) {
      const role = roleMap.get(line.roleId!);
      const pct = role ? (ROLE_DISTRIBUTION[role.name] || (1 / allRoles.length)) : (1 / existingLines.length);
      const hours = Math.max(Math.round(totalHours * pct), 1);
      const rate = parseFloat(line.rate || "300") * rateAdjustmentFactor;
      const costRate = parseFloat(line.costRate || "150");
      const lineFee = roundLine(hours * rate);
      const lineCost = hours * costRate;
      await db.update(pricingLines).set({
        hours: String(hours),
        fee: String(lineFee),
        cost: String(lineCost),
        margin: String(lineFee - lineCost),
      }).where(eq(pricingLines.id, line.id));
    }
  }

  const updatedLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
  let calcFee = updatedLines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
  const calcCost = updatedLines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
  const calcHours = updatedLines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
  // Tech & Admin fee is a % uplift on top of professional fees
  if (techAdminFeePct > 0) calcFee = calcFee * (1 + techAdminFeePct / 100);
  await db.update(deals).set({
    totalFee: String(calcFee.toFixed(2)),
    totalCost: String(calcCost.toFixed(2)),
    totalHours: String(calcHours),
    marginPercent: calcFee > 0 ? String(((calcFee - calcCost) / calcFee * 100).toFixed(1)) : "0",
    blendedRate: calcHours > 0 ? String((calcFee / calcHours).toFixed(2)) : "0",
  }).where(eq(deals.id, dealId));

  await db.delete(scenarios).where(eq(scenarios.dealId, dealId));
}

import { registerDynamicsRoutes, autoPushDeal } from "./dynamics";
import {
  registerIntappRoutes,
  onDealSubmittedTrigger,
  assertSubmissionAllowed,
  onClientChangedTrigger,
  startNightlyRescreenLoop,
} from "./intapp";
import { registerWorkdayRoutes, onDealSaved, onDealSubmitted } from "./workday";

export function registerRoutes(app: Express) {
  registerDynamicsRoutes(app);
  registerIntappRoutes(app);
  registerWorkdayRoutes(app);


  // ========== DASHBOARD ==========
  app.get("/api/dashboard/summary", async (_req: Request, res: Response) => {
    const [dealStats] = await db.select({
      total: count(),
      totalFee: sql<string>`COALESCE(SUM(CAST(total_fee AS NUMERIC)), 0)`,
      avgMargin: sql<string>`COALESCE(AVG(CAST(margin_percent AS NUMERIC)), 0)`,
    }).from(deals);

    const statusBreakdown = await db.select({
      status: deals.status,
      count: count(),
    }).from(deals).groupBy(deals.status);

    const recentActivity = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(10);

    const submittedDeals = await db.select({
      count: count(),
    }).from(deals).where(eq(deals.status, "submitted"));

    res.json({
      totalDeals: dealStats.total,
      totalPipeline: parseFloat(dealStats.totalFee),
      averageMargin: parseFloat(dealStats.avgMargin).toFixed(1),
      pendingApprovals: submittedDeals[0]?.count || 0,
      statusBreakdown,
      recentActivity,
    });
  });

  // ========== CLIENTS ==========
  app.get("/api/clients", async (_req: Request, res: Response) => {
    const result = await db.select().from(clients).orderBy(clients.name);
    res.json(result);
  });

  app.get("/api/clients/:id", async (req: Request, res: Response) => {
    const [result] = await db.select().from(clients).where(eq(clients.id, parseInt(req.params.id)));
    if (!result) return res.status(404).json({ error: "Client not found" });
    res.json(result);
  });

  app.patch("/api/clients/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [prior] = await db.select().from(clients).where(eq(clients.id, id));
    if (!prior) return res.status(404).json({ error: "Client not found" });
    const [updated] = await db.update(clients).set(req.body).where(eq(clients.id, id)).returning();
    // Fire Intapp client-change trigger when risk-relevant attributes change.
    const watched = ["industry", "region", "relationshipYears", "name"];
    const changed = watched.some(k => req.body?.[k] !== undefined && (prior as any)[k] !== updated[k as keyof typeof updated]);
    if (changed) {
      const actor = (req.header("x-user-name") || "Client Edit").trim();
      onClientChangedTrigger(id, actor).catch(() => {});
    }
    res.json(updated);
  });

  // ========== DEALS ==========
  app.get("/api/deals", async (req: Request, res: Response) => {
    const includeArchived = req.query.includeArchived === "true";
    const onlyArchived = req.query.onlyArchived === "true";
    const result = await db.query.deals.findMany({
      with: { client: true },
      where: onlyArchived ? isNotNull(deals.archivedAt) : (includeArchived ? undefined : isNull(deals.archivedAt)),
      orderBy: [desc(deals.updatedAt)],
    });
    // Enrich with D365 link info so the UI can show "linked" vs "standalone"
    const linkedOpps = await db.select({
      dealpadDealId: dynamicsOpportunities.dealpadDealId,
      id: dynamicsOpportunities.id,
      opportunityNumber: dynamicsOpportunities.opportunityNumber,
      accountName: dynamicsOpportunities.accountName,
      stage: dynamicsOpportunities.stage,
    }).from(dynamicsOpportunities).where(isNotNull(dynamicsOpportunities.dealpadDealId));
    const linkMap = new Map(linkedOpps.map((o) => [o.dealpadDealId!, o]));
    res.json(result.map((d) => ({ ...d, dynamicsLink: linkMap.get(d.id) || null })));
  });

  app.get("/api/deals/:id", async (req: Request, res: Response) => {
    const result = await db.query.deals.findFirst({
      where: eq(deals.id, parseInt(req.params.id)),
      with: {
        client: true,
        scopeItems: { with: { scopeItem: true } },
        pricingLines: { with: { role: true } },
        scenarios: true,
        approvals: true,
        promptResponses: true,
        activities: true,
      },
    });
    if (!result) return res.status(404).json({ error: "Deal not found" });
    res.json(result);
  });

  app.post("/api/deals", async (req: Request, res: Response) => {
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;
    const { dynamicsOpportunityId, ...dealBody } = req.body || {};
    const [newDeal] = await db.insert(deals).values({
      ...dealBody,
      dealNumber,
    }).returning();

    await createDefaultPrompts(newDeal.id);

    await db.insert(activityLog).values({
      dealId: newDeal.id,
      action: "deal_created",
      description: `Deal "${newDeal.title}" created`,
      userName: req.body.pdlName || "System",
    });

    if (dynamicsOpportunityId) {
      const { linkDealToOpportunity } = await import("./dynamics");
      await linkDealToOpportunity(parseInt(dynamicsOpportunityId), newDeal.id, req.body.pdlName).catch(() => {});
    }

    res.status(201).json(newDeal);
  });

  app.patch("/api/deals/:id", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const [prior] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!prior) return res.status(404).json({ error: "Deal not found" });
    // SERVER-SIDE GATING: a status transition to "submitted" must pass Intapp screening.
    if (req.body?.status === "submitted" && prior.status !== "submitted") {
      const actor = (req.header("x-user-name") || req.body?.userName || "Unknown").trim();
      const gate = await assertSubmissionAllowed(dealId, actor);
      if (!gate.allow) {
        return res.status(409).json({ error: gate.reason, code: "intapp_conflict", screening: gate.screening });
      }
    }

    // Engagement Inputs: validate against the service-line preset, clamp ranges,
    // and merge with the existing row to avoid last-write-wins races on per-field edits.
    const patch: any = { ...req.body, updatedAt: new Date() };
    if (req.body?.engagementInputs !== undefined) {
      const sl = req.body.serviceLine || prior.serviceLine || "_generic";
      const preset = ENGAGEMENT_INPUT_PRESETS[sl] || ENGAGEMENT_INPUT_PRESETS["_generic"];
      const validated = validateEngagementInputs(req.body.engagementInputs, preset);
      if (validated.error) return res.status(400).json({ error: validated.error, field: validated.field });
      const existing = (prior as any).engagementInputs || {};
      patch.engagementInputs = { ...existing, ...validated.values };
    }

    const [updated] = await db.update(deals)
      .set(patch)
      .where(eq(deals.id, dealId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });
    const changedFields = Object.keys(req.body || {});
    let finalRow = updated;
    if (req.body.complexity || req.body.engagementInputs !== undefined) {
      await recalcPricingFromScope(dealId);
      if (!changedFields.includes("totalFee")) changedFields.push("totalFee", "totalCost", "totalHours");
      // Re-fetch so the response carries the freshly recalculated totals
      const [refetched] = await db.select().from(deals).where(eq(deals.id, dealId));
      if (refetched) finalRow = refetched;
    }
    autoPushDeal(dealId, changedFields, req.body?.userName).catch(() => {});
    if (prior.status !== "submitted" && finalRow.status === "submitted") {
      const actor = (req.header("x-user-name") || req.body?.userName || "Unknown").trim();
      onDealSubmittedTrigger(dealId, actor).catch(() => {});
    }
    res.json(finalRow);
  });

  // Validate an engagementInputs payload against a preset spec.
  // - Strips unknown keys
  // - For 'select' fields: enum check
  // - For 'number' fields: parses, requires finite, clamps to safe ranges
  function validateEngagementInputs(input: any, preset: any): { error?: string; field?: string; values: Record<string, string> } {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { error: "engagementInputs must be an object", values: {} };
    }
    const fieldMap = new Map<string, any>((preset.fields || []).map((f: any) => [f.key, f]));
    // Per-field safety bounds (covers all current preset numeric fields)
    const NUMERIC_BOUNDS: Record<string, { min: number; max: number }> = {
      tmRateAdjustmentPct: { min: -50, max: 100 },
      techAdminFeePct: { min: 0, max: 25 },
      grossMarginBenchmarkPct: { min: 0, max: 100 },
      lineItemRounding: { min: 0, max: 10000 },
      fixedFeeRounding: { min: 0, max: 100000 },
    };
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(input)) {
      const f: any = fieldMap.get(key);
      if (!f) continue; // strip unknown keys silently
      if (f.type === "select") {
        const v = String(raw ?? "");
        if (!f.options.includes(v)) {
          return { error: `Invalid value for "${f.label}". Allowed: ${f.options.join(", ")}`, field: key, values: {} };
        }
        out[key] = v;
      } else if (f.type === "number") {
        const n = parseFloat(String(raw ?? ""));
        if (!Number.isFinite(n)) {
          return { error: `"${f.label}" must be a number`, field: key, values: {} };
        }
        const bounds = NUMERIC_BOUNDS[key] || { min: -1e9, max: 1e9 };
        if (n < bounds.min || n > bounds.max) {
          return { error: `"${f.label}" must be between ${bounds.min} and ${bounds.max}`, field: key, values: {} };
        }
        out[key] = String(n);
      }
    }
    return { values: out };
  }

  app.post("/api/deals/:id/archive", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const userName = req.body?.userName || "System";
    const [updated] = await db.update(deals)
      .set({ archivedAt: new Date(), archivedBy: userName, updatedAt: new Date() })
      .where(eq(deals.id, dealId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });

    // Auto-unlink any D365 opportunity so it can be re-scoped
    let unlinkedOpp: string | null = null;
    const [linkedOpp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.dealpadDealId, dealId));
    if (linkedOpp) {
      const { unlinkOpportunity } = await import("./dynamics");
      await unlinkOpportunity(linkedOpp.id, userName).catch(() => {});
      unlinkedOpp = linkedOpp.opportunityNumber;
    }

    await db.insert(activityLog).values({
      dealId, action: "deal_archived", userName,
      description: `Deal "${updated.title}" archived${unlinkedOpp ? ` (unlinked from D365 ${unlinkedOpp})` : ""}`,
    });
    res.json({ ...updated, unlinkedOpportunityNumber: unlinkedOpp });
  });

  app.post("/api/deals/:id/restore", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const userName = req.body?.userName || "System";
    const [updated] = await db.update(deals)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(eq(deals.id, dealId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });
    await db.insert(activityLog).values({
      dealId, action: "deal_restored", userName,
      description: `Deal "${updated.title}" restored from archive`,
    });
    res.json(updated);
  });

  // ------------------------------------------------------------------
  // Submission gating: dedicated endpoint that runs Intapp screening
  // SYNCHRONOUSLY before transitioning a deal to "submitted". Use this
  // route from the UI instead of PATCHing status directly.
  // ------------------------------------------------------------------
  app.post("/api/deals/:id/submit", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const actor = (req.header("x-user-name") || req.body?.userName || "Unknown").trim();
    const gate = await assertSubmissionAllowed(dealId, actor);
    if (!gate.allow) {
      return res.status(409).json({
        error: gate.reason,
        code: "intapp_conflict",
        screening: gate.screening,
      });
    }
    const [updated] = await db.update(deals)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(deals.id, dealId)).returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });
    autoPushDeal(dealId, ["status"], actor).catch(() => {});
    onDealSubmittedTrigger(dealId, actor).catch(() => {});
    res.json({ deal: updated, screening: gate.screening });
  });

  app.post("/api/deals/:id/clone", async (req: Request, res: Response) => {
    const source = await db.query.deals.findFirst({
      where: eq(deals.id, parseInt(req.params.id)),
      with: { client: true, scopeItems: true, pricingLines: true, promptResponses: true },
    });
    if (!source) return res.status(404).json({ error: "Source deal not found" });

    const isRenewal = req.body.mode === "renewal";
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;

    const title = isRenewal
      ? `${source.title} (Renewal)`
      : req.body.title || `${source.title} (Copy)`;

    const [newDeal] = await db.insert(deals).values({
      title,
      dealNumber,
      clientId: source.clientId,
      dealType: isRenewal ? "renewal" : source.dealType,
      status: "draft",
      complexity: source.complexity,
      serviceLine: source.serviceLine,
      businessUnit: source.businessUnit,
      region: source.region,
      pdlName: req.body.pdlName || source.pdlName,
      pdlEmail: source.pdlEmail,
      currentStep: 1,
      parentDealId: source.id,
    }).returning();

    if (source.scopeItems?.length) {
      await db.insert(dealScopeItems).values(
        source.scopeItems.map((si: any) => ({
          dealId: newDeal.id,
          scopeItemId: si.scopeItemId,
          adjustedHours: si.adjustedHours,
          notes: si.notes,
          included: si.included,
        }))
      );
    }

    if (source.pricingLines?.length) {
      await db.insert(pricingLines).values(
        source.pricingLines.map((pl: any) => ({
          dealId: newDeal.id,
          roleId: pl.roleId,
          roleName: pl.roleName,
          level: pl.level,
          hours: pl.hours,
          rate: pl.rate,
          costRate: pl.costRate,
          fee: pl.fee,
          cost: pl.cost,
          margin: pl.margin,
        }))
      );
    }

    if (source.promptResponses?.length) {
      await db.insert(promptResponses).values(
        source.promptResponses.map((pr: any) => ({
          dealId: newDeal.id,
          question: pr.question,
          answer: isRenewal ? pr.answer : null,
          category: pr.category,
          impactMultiplier: isRenewal ? pr.impactMultiplier : "1.0",
          sortOrder: pr.sortOrder,
        }))
      );
    } else {
      await createDefaultPrompts(newDeal.id);
    }

    const totalFee = source.pricingLines?.reduce((s: number, p: any) => s + parseFloat(p.fee || "0"), 0) || 0;
    const totalCost = source.pricingLines?.reduce((s: number, p: any) => s + parseFloat(p.cost || "0"), 0) || 0;
    const totalHours = source.pricingLines?.reduce((s: number, p: any) => s + parseFloat(p.hours || "0"), 0) || 0;
    await db.update(deals).set({
      totalFee: String(totalFee),
      totalCost: String(totalCost),
      totalHours: String(totalHours),
      marginPercent: totalFee > 0 ? String(((totalFee - totalCost) / totalFee * 100).toFixed(1)) : "0",
    }).where(eq(deals.id, newDeal.id));

    await db.insert(activityLog).values({
      dealId: newDeal.id,
      action: isRenewal ? "deal_renewed" : "deal_cloned",
      description: `${isRenewal ? "Renewed" : "Cloned"} from "${source.title}" (${source.dealNumber})`,
      userName: req.body.pdlName || source.pdlName || "System",
    });

    const result = await db.query.deals.findFirst({
      where: eq(deals.id, newDeal.id),
      with: { client: true },
    });
    res.status(201).json(result);
  });

  app.post("/api/deals/:id/reset-pricing", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (!deal.parentDealId) return res.status(400).json({ error: "Deal has no parent to reset from" });

    const parentLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, deal.parentDealId));
    const currentLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));

    // Match lines by roleId; fall back to order
    const parentByRole = new Map(parentLines.map((p) => [p.roleId, p]));
    for (const line of currentLines) {
      const src = parentByRole.get(line.roleId) || parentLines[currentLines.indexOf(line)];
      if (!src) continue;
      const rate = parseFloat(src.rate);
      const costRate = parseFloat(src.costRate);
      const hours = parseFloat(line.hours || "0");
      await db.update(pricingLines).set({
        rate: rate.toFixed(2),
        costRate: costRate.toFixed(2),
        fee: (hours * rate).toFixed(2),
        cost: (hours * costRate).toFixed(2),
        margin: (hours * (rate - costRate)).toFixed(2),
      }).where(eq(pricingLines.id, line.id));
    }

    const updated = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const calcFee = updated.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const calcCost = updated.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const calcHours = updated.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
    await db.update(deals).set({
      totalFee: String(calcFee),
      totalCost: String(calcCost),
      totalHours: String(calcHours),
      marginPercent: calcFee > 0 ? String(((calcFee - calcCost) / calcFee * 100).toFixed(1)) : "0",
      blendedRate: calcHours > 0 ? String((calcFee / calcHours).toFixed(2)) : "0",
    }).where(eq(deals.id, dealId));

    await db.insert(activityLog).values({
      dealId,
      action: "pricing_reset",
      description: `Pricing reset to prior-year baseline`,
      userName: req.body.userName || "System",
    });

    res.json({ success: true, totalFee: calcFee, totalCost: calcCost, totalHours: calcHours });
  });

  app.post("/api/deals/:id/rate-adjust", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.id);
    const factor = parseFloat(req.body.factor);
    if (!factor || factor <= 0) return res.status(400).json({ error: "Invalid factor" });

    const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    for (const line of lines) {
      const newRate = parseFloat(line.rate) * factor;
      const hours = parseFloat(line.hours || "0");
      const costRate = parseFloat(line.costRate || "0");
      await db.update(pricingLines).set({
        rate: newRate.toFixed(2),
        fee: (hours * newRate).toFixed(2),
        cost: (hours * costRate).toFixed(2),
        margin: (hours * (newRate - costRate)).toFixed(2),
      }).where(eq(pricingLines.id, line.id));
    }

    const updated = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const calcFee = updated.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const calcCost = updated.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const calcHours = updated.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
    await db.update(deals).set({
      totalFee: String(calcFee),
      totalCost: String(calcCost),
      totalHours: String(calcHours),
      marginPercent: calcFee > 0 ? String(((calcFee - calcCost) / calcFee * 100).toFixed(1)) : "0",
      blendedRate: calcHours > 0 ? String((calcFee / calcHours).toFixed(2)) : "0",
    }).where(eq(deals.id, dealId));

    await db.insert(activityLog).values({
      dealId,
      action: "rate_adjusted",
      description: `Quick rate adjustment applied: ${((factor - 1) * 100).toFixed(1)}%`,
      userName: req.body.userName || "System",
    });

    autoPushDeal(dealId, ["totalFee", "totalCost", "marginPercent"], req.body?.userName).catch(() => {});
    res.json({ success: true, factor, totalFee: calcFee, totalCost: calcCost, totalHours: calcHours });
  });

  // ========== SCOPE CATALOG ==========
  // ========== ENGAGEMENT INPUTS PRESETS (per service line) ==========
  // Each preset describes the structured pricing inputs that mirror the
  // Excel "Core Assumptions" sheet for that service line. Tax-PHB is the
  // first fully-modeled preset; others fall back to a generic minimal set.
  const ENGAGEMENT_INPUT_PRESETS: Record<string, any> = {
    "Tax-PHB": {
      label: "Tax — Private Holdings & Business",
      sourceWorkbook: "tax-pricing-calculator.xlsx (Core Assumptions)",
      defaults: {
        rateYear: "2026",
        tmBasis: "National",
        tmRateAdjustmentPct: "0",
        techAdminFeePct: "7",
        grossMarginBenchmarkPct: "74.6",
        lineItemRounding: "100",
        fixedFeeRounding: "1000",
        offshoringAcceptable: "Yes",
        offshoring7216: "N/A",
        comparisonProject: "No",
      },
      fields: [
        { key: "rateYear", label: "Rate Year", type: "select", options: ["2025", "2026"], help: "Select 2026 for projects starting after Jan 1, 2026." },
        { key: "tmBasis", label: "T&M Basis", type: "select", options: ["National", "Geo"], help: "Standard rate (National) or geography-adjusted (Geo)." },
        { key: "tmRateAdjustmentPct", label: "One-time Pricing Adjustment (%)", type: "number", suffix: "%", help: "Applied to T&M rates. Default 0%. Positive = uplift, negative = discount." },
        { key: "techAdminFeePct", label: "Technology & Admin Fee (%)", type: "number", suffix: "%", help: "7% standard. Below 7% requires BUOL written approval." },
        { key: "grossMarginBenchmarkPct", label: "Gross Margin Benchmark (%)", type: "number", suffix: "%", help: "Target margin for this service line. Excel default: 74.6%." },
        { key: "lineItemRounding", label: "Line Item Rounding ($)", type: "number", prefix: "$", help: "Default $100." },
        { key: "fixedFeeRounding", label: "Fixed Fee Total Rounding ($)", type: "number", prefix: "$", help: "Default $1,000." },
        { key: "offshoringAcceptable", label: "Offshoring Available — Client Acceptable", type: "select", options: ["Yes", "No"], help: "Confirm Outsourcing Resource availability with Resource Planning." },
        { key: "offshoring7216", label: "Form 7216 — Individual Returns", type: "select", options: ["N/A", "Yes (signed)", "Pending"], help: "Required for offshoring Individual returns. N/A for non-individual engagements." },
        { key: "comparisonProject", label: "Comparison Project (renewal history)", type: "select", options: ["No", "Yes"], help: "Pulls prior-year actuals from Project Profitability dashboard." },
      ],
    },
    "_generic": {
      label: "Generic Engagement Inputs",
      sourceWorkbook: null,
      defaults: {
        rateYear: "2026",
        tmRateAdjustmentPct: "0",
        techAdminFeePct: "0",
        grossMarginBenchmarkPct: "30",
        lineItemRounding: "0",
      },
      fields: [
        { key: "rateYear", label: "Rate Year", type: "select", options: ["2025", "2026"] },
        { key: "tmRateAdjustmentPct", label: "Rate Adjustment (%)", type: "number", suffix: "%" },
        { key: "techAdminFeePct", label: "Tech & Admin Fee (%)", type: "number", suffix: "%" },
        { key: "grossMarginBenchmarkPct", label: "Gross Margin Benchmark (%)", type: "number", suffix: "%" },
        { key: "lineItemRounding", label: "Line Item Rounding ($)", type: "number", prefix: "$" },
      ],
    },
  };

  app.get("/api/engagement-input-spec/:serviceLine", async (req: Request, res: Response) => {
    const sl = req.params.serviceLine;
    const preset = ENGAGEMENT_INPUT_PRESETS[sl] || ENGAGEMENT_INPUT_PRESETS["_generic"];
    res.json({ serviceLine: sl, ...preset });
  });

  app.get("/api/scope-catalog", async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";
    const rows = await db.select().from(scopeCatalog).orderBy(scopeCatalog.sortOrder);
    res.json(includeInactive ? rows : rows.filter(r => r.isActive !== false));
  });

  // Validate that a proposed parentId is (a) an existing assembly and (b) does not introduce a cycle.
  async function validateScopeParent(parentId: number, selfId: number | null): Promise<string | null> {
    const [parent] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, parentId));
    if (!parent) return "Parent assembly not found";
    if (!parent.isAssembly) return "Parent must be an assembly item";
    // Walk up the chain from the parent — if we hit `selfId`, it's a cycle
    let cursor: number | null = parent.parentId;
    const visited = new Set<number>([parentId]);
    while (cursor) {
      if (selfId !== null && cursor === selfId) return "Cannot set parent: would create a cycle";
      if (visited.has(cursor)) return "Existing hierarchy contains a cycle"; // defensive
      visited.add(cursor);
      const [next]: any[] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, cursor));
      cursor = next?.parentId ?? null;
    }
    return null;
  }

  function parseIntOrError(v: any, label: string): { value: number | null; error?: string } {
    if (v === null || v === undefined || v === "") return { value: null };
    const n = parseInt(v);
    if (Number.isNaN(n)) return { value: null, error: `${label} must be a number` };
    return { value: n };
  }

  app.post("/api/scope-catalog", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const code = String(body.code ?? "").trim();
      const name = String(body.name ?? "").trim();
      const category = String(body.category ?? "").trim();
      if (!code || !name || !category) {
        return res.status(400).json({ error: "code, name, and category are required" });
      }
      const parentParse = parseIntOrError(body.parentId, "parentId");
      if (parentParse.error) return res.status(400).json({ error: parentParse.error });
      const sortParse = parseIntOrError(body.sortOrder, "sortOrder");
      if (sortParse.error) return res.status(400).json({ error: sortParse.error });
      const isAssembly = !!body.isAssembly;
      if (parentParse.value !== null) {
        if (isAssembly) return res.status(400).json({ error: "Assembly items cannot have a parent" });
        const cycleErr = await validateScopeParent(parentParse.value, null);
        if (cycleErr) return res.status(400).json({ error: cycleErr });
      }
      const [row] = await db.insert(scopeCatalog).values({
        code,
        name,
        category,
        description: body.description || null,
        defaultHours: body.defaultHours != null && body.defaultHours !== "" ? String(body.defaultHours) : null,
        isAssembly,
        parentId: parentParse.value,
        serviceLines: body.serviceLines || null,
        sortOrder: sortParse.value ?? 0,
        isActive: body.isActive !== false,
      }).returning();
      await db.insert(activityLog).values({
        action: "scope_catalog_created",
        description: `Created scope item ${row.code} — ${row.name}`,
        userName: body.userName || null,
        metadata: { scopeItemId: row.id },
      });
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Code already exists" });
      res.status(500).json({ error: err?.message || "Failed to create scope item" });
    }
  });

  app.patch("/api/scope-catalog/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const body = req.body || {};
      const [current] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, id));
      if (!current) return res.status(404).json({ error: "Not found" });

      const updates: any = {};
      if (body.code !== undefined) {
        const v = String(body.code).trim();
        if (!v) return res.status(400).json({ error: "code cannot be empty" });
        updates.code = v;
      }
      if (body.name !== undefined) {
        const v = String(body.name).trim();
        if (!v) return res.status(400).json({ error: "name cannot be empty" });
        updates.name = v;
      }
      if (body.category !== undefined) {
        const v = String(body.category).trim();
        if (!v) return res.status(400).json({ error: "category cannot be empty" });
        updates.category = v;
      }
      if (body.description !== undefined) updates.description = body.description || null;
      if (body.defaultHours !== undefined) {
        updates.defaultHours = body.defaultHours != null && body.defaultHours !== "" ? String(body.defaultHours) : null;
      }
      if (body.isAssembly !== undefined) updates.isAssembly = !!body.isAssembly;
      if (body.parentId !== undefined) {
        const p = parseIntOrError(body.parentId, "parentId");
        if (p.error) return res.status(400).json({ error: p.error });
        updates.parentId = p.value;
      }
      if (body.serviceLines !== undefined) updates.serviceLines = body.serviceLines || null;
      if (body.sortOrder !== undefined) {
        const s = parseIntOrError(body.sortOrder, "sortOrder");
        if (s.error) return res.status(400).json({ error: s.error });
        updates.sortOrder = s.value ?? 0;
      }
      if (body.isActive !== undefined) updates.isActive = !!body.isActive;

      const finalIsAssembly = updates.isAssembly ?? current.isAssembly;
      const finalParentId = updates.parentId !== undefined ? updates.parentId : current.parentId;

      if (finalParentId !== null && finalParentId !== undefined) {
        if (finalIsAssembly) return res.status(400).json({ error: "Assembly items cannot have a parent" });
        if (finalParentId === id) return res.status(400).json({ error: "An item cannot be its own parent" });
        const cycleErr = await validateScopeParent(finalParentId, id);
        if (cycleErr) return res.status(400).json({ error: cycleErr });
      }

      // If toggling assembly -> non-assembly, ensure no items still reference it as parent
      if (current.isAssembly && updates.isAssembly === false) {
        const children = await db.select({ id: scopeCatalog.id, code: scopeCatalog.code })
          .from(scopeCatalog).where(eq(scopeCatalog.parentId, id));
        if (children.length > 0) {
          return res.status(400).json({
            error: `Cannot un-mark as assembly: ${children.length} child item(s) still reference this as parent (${children.slice(0, 3).map(c => c.code).join(", ")}${children.length > 3 ? "..." : ""}). Re-parent or remove them first.`,
          });
        }
      }

      const [row] = await db.update(scopeCatalog).set(updates).where(eq(scopeCatalog.id, id)).returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      await db.insert(activityLog).values({
        action: "scope_catalog_updated",
        description: `Updated scope item ${row.code}`,
        userName: body.userName || null,
        metadata: { scopeItemId: id, changedFields: Object.keys(updates) },
      });
      res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Code already exists" });
      res.status(500).json({ error: err?.message || "Failed to update scope item" });
    }
  });

  app.delete("/api/scope-catalog/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const userName = (req.body?.userName as string) || null;
    // Always soft-delete (deactivate) — preserve historical references on existing deals
    const [row] = await db.update(scopeCatalog).set({ isActive: false }).where(eq(scopeCatalog.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.insert(activityLog).values({
      action: "scope_catalog_deactivated",
      description: `Deactivated scope item ${row.code} — ${row.name}`,
      userName,
      metadata: { scopeItemId: id },
    });
    res.json({ ok: true, item: row });
  });

  // ========== DEAL SCOPE ITEMS ==========
  app.get("/api/deals/:dealId/scope-items", async (req: Request, res: Response) => {
    const result = await db.query.dealScopeItems.findMany({
      where: eq(dealScopeItems.dealId, parseInt(req.params.dealId)),
      with: { scopeItem: true },
    });
    res.json(result);
  });

  app.post("/api/deals/:dealId/scope-items", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const cascade = req.body?.cascade !== false; // default true
    const [check] = await db.select({ isActive: scopeCatalog.isActive, code: scopeCatalog.code })
      .from(scopeCatalog).where(eq(scopeCatalog.id, req.body.scopeItemId));
    if (!check) return res.status(404).json({ error: "Scope item not found" });
    if (check.isActive === false) return res.status(400).json({ error: `Scope item ${check.code} is inactive and cannot be added` });
    const [item] = await db.insert(dealScopeItems).values({
      dealId,
      scopeItemId: req.body.scopeItemId,
      quantity: req.body.quantity ?? 1,
      adjustedHours: req.body.adjustedHours,
      complexityMultiplier: req.body.complexityMultiplier ?? "1.0",
      notes: req.body.notes,
    }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
    if (!item) {
      const [existingRow] = await db.select().from(dealScopeItems)
        .where(and(eq(dealScopeItems.dealId, dealId), eq(dealScopeItems.scopeItemId, req.body.scopeItemId)));
      return res.status(200).json({ ...existingRow, cascadedChildren: [], duplicate: true });
    }

    let cascaded: any[] = [];
    if (cascade) {
      const [parent] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, req.body.scopeItemId));
      if (parent?.isAssembly) {
        const children = await db.select().from(scopeCatalog).where(eq(scopeCatalog.parentId, parent.id));
        const existing = await db.select({ scopeItemId: dealScopeItems.scopeItemId })
          .from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
        const existingIds = new Set(existing.map(e => e.scopeItemId));
        for (const child of children) {
          if (existingIds.has(child.id)) continue;
          const [ci] = await db.insert(dealScopeItems).values({
            dealId, scopeItemId: child.id, quantity: 1,
            adjustedHours: child.defaultHours, complexityMultiplier: "1.0",
          }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
          if (ci) cascaded.push(ci);
        }
      }
    }

    await recalcPricingFromScope(dealId);
    res.status(201).json({ ...item, cascadedChildren: cascaded });
  });

  // ========== SCOPE TEMPLATES ==========
  app.get("/api/scope-templates", async (req: Request, res: Response) => {
    const serviceLine = (req.query.serviceLine as string) || null;
    const tpls = await db.select().from(scopeTemplates)
      .where(eq(scopeTemplates.isActive, true))
      .orderBy(scopeTemplates.sortOrder);
    const ids = tpls.map(t => t.id);
    if (ids.length === 0) return res.json([]);
    const items = await db.execute(sql`
      SELECT ti.template_id, ti.scope_item_id, ti.default_hours, ti.complexity_multiplier, ti.sort_order,
             c.code, c.name, c.category, c.default_hours AS catalog_default_hours, c.is_assembly
      FROM scope_template_items ti
      JOIN scope_catalog c ON c.id = ti.scope_item_id
      WHERE ti.template_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
      ORDER BY ti.sort_order
    `);
    const byTpl = new Map<number, any[]>();
    for (const r of (items as any).rows || items) {
      const tid = (r as any).template_id;
      if (!byTpl.has(tid)) byTpl.set(tid, []);
      byTpl.get(tid)!.push(r);
    }
    let result = tpls.map(t => ({ ...t, items: byTpl.get(t.id) || [] }));
    if (serviceLine) {
      result = result.filter(t => !t.serviceLine || t.serviceLine === serviceLine);
    }
    res.json(result);
  });

  app.post("/api/deals/:dealId/apply-template/:templateId", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const templateId = parseInt(req.params.templateId);
    const items = await db.select().from(scopeTemplateItems).where(eq(scopeTemplateItems.templateId, templateId));
    if (items.length === 0) return res.status(404).json({ error: "Template has no items" });
    const existing = await db.select({ scopeItemId: dealScopeItems.scopeItemId })
      .from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    const existingIds = new Set(existing.map(e => e.scopeItemId));
    const inserted: any[] = [];
    const skippedInactive: string[] = [];
    for (const ti of items) {
      if (existingIds.has(ti.scopeItemId)) continue;
      const [catalogItem] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, ti.scopeItemId));
      if (!catalogItem || catalogItem.isActive === false) {
        if (catalogItem) skippedInactive.push(catalogItem.code);
        continue;
      }
      const [row] = await db.insert(dealScopeItems).values({
        dealId,
        scopeItemId: ti.scopeItemId,
        quantity: 1,
        adjustedHours: ti.defaultHours || catalogItem?.defaultHours,
        complexityMultiplier: ti.complexityMultiplier || "1.0",
      }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
      if (row) {
        inserted.push(row);
        existingIds.add(ti.scopeItemId);
      }
      // Cascade assembly children (skip inactive)
      if (catalogItem?.isAssembly) {
        const children = await db.select().from(scopeCatalog).where(eq(scopeCatalog.parentId, catalogItem.id));
        for (const child of children) {
          if (existingIds.has(child.id)) continue;
          if (child.isActive === false) { skippedInactive.push(child.code); continue; }
          const [ci] = await db.insert(dealScopeItems).values({
            dealId, scopeItemId: child.id, quantity: 1,
            adjustedHours: child.defaultHours, complexityMultiplier: "1.0",
          }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
          if (ci) {
            inserted.push(ci);
            existingIds.add(child.id);
          }
        }
      }
    }
    await recalcPricingFromScope(dealId);
    const [tpl] = await db.select().from(scopeTemplates).where(eq(scopeTemplates.id, templateId));
    await db.insert(activityLog).values({
      dealId, action: "template_applied",
      description: `Applied scope template "${tpl?.name}" (${inserted.length} items added)`,
      userName: req.body?.userName || null,
      metadata: { templateId, itemsAdded: inserted.length },
    }).catch(() => {});
    res.status(201).json({ insertedCount: inserted.length, items: inserted, skippedInactive });
  });

  app.delete("/api/deals/:dealId/scope-items/:id", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    await db.delete(dealScopeItems).where(
      and(eq(dealScopeItems.id, parseInt(req.params.id)), eq(dealScopeItems.dealId, dealId))
    );
    await recalcPricingFromScope(dealId);
    res.json({ success: true });
  });

  // ========== ROLES & RATE CARDS ==========
  app.get("/api/roles", async (_req: Request, res: Response) => {
    const result = await db.select().from(roles).orderBy(roles.sortOrder);
    res.json(result);
  });

  app.get("/api/rate-cards", async (_req: Request, res: Response) => {
    const result = await db.query.rateCards.findMany({
      orderBy: [desc(rateCards.isActive)],
    });
    res.json(result);
  });

  app.get("/api/rate-cards/:id/entries", async (req: Request, res: Response) => {
    const result = await db.select({
      id: rateCardEntries.id,
      rateCardId: rateCardEntries.rateCardId,
      roleId: rateCardEntries.roleId,
      rate: rateCardEntries.rate,
      costRate: rateCardEntries.costRate,
      roleName: roles.name,
      roleLevel: roles.level,
    }).from(rateCardEntries)
      .innerJoin(roles, eq(rateCardEntries.roleId, roles.id))
      .where(eq(rateCardEntries.rateCardId, parseInt(req.params.id)))
      .orderBy(roles.sortOrder);
    res.json(result);
  });

  // ========== PRICING LINES ==========
  app.get("/api/deals/:dealId/pricing", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    let result = await db.query.pricingLines.findMany({
      where: eq(pricingLines.dealId, dealId),
      with: { role: true },
    });
    if (result.length === 0) {
      const deal = await db.query.deals.findFirst({
        where: eq(deals.id, dealId),
        with: { scopeItems: { with: { scopeItem: true } }, promptResponses: true },
      });
      if (deal) {
        const allRoles = await db.select().from(roles).orderBy(roles.sortOrder);
        if (allRoles.length > 0) {
          const complexityMultipliers: Record<string, number> = { low: 0.8, medium: 1.0, high: 1.2, very_high: 1.5 };
          const baseMultiplier = complexityMultipliers[deal.complexity || "medium"] || 1.0;
          const promptMultiplier = (deal.promptResponses || []).reduce(
            (m: number, p: any) => m * (parseFloat(p.impactMultiplier) || 1.0), 1.0
          );
          const totalMultiplier = baseMultiplier * promptMultiplier;

          let totalHours: number;
          if (deal.scopeItems && deal.scopeItems.length > 0) {
            totalHours = deal.scopeItems.reduce((sum: number, si: any) => {
              const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "40");
              return sum + Math.round(baseHrs * totalMultiplier);
            }, 0);
          } else {
            totalHours = Math.round(200 * totalMultiplier);
          }

          const roleDistribution: Record<string, number> = {
            "Partner": 0.07, "Managing Director": 0.10, "Senior Manager": 0.17,
            "Manager": 0.20, "Senior Consultant": 0.26, "Consultant": 0.13, "Analyst": 0.07,
          };

          await db.insert(pricingLines).values(
            allRoles.map((r) => {
              const pct = roleDistribution[r.name] || (1 / allRoles.length);
              const hours = Math.max(Math.round(totalHours * pct), 1);
              const rate = parseFloat(r.defaultRate || "300");
              const costRate = parseFloat(r.costRate || "150");
              return {
                dealId,
                roleId: r.id,
                hours: String(hours),
                rate: String(rate),
                costRate: String(costRate),
                fee: String(hours * rate),
                cost: String(hours * costRate),
                margin: String(hours * (rate - costRate)),
              };
            })
          );
          result = await db.query.pricingLines.findMany({
            where: eq(pricingLines.dealId, dealId),
            with: { role: true },
          });
          const calcTotalFee = result.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
          const calcTotalCost = result.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
          const calcTotalHours = result.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
          await db.update(deals).set({
            totalFee: String(calcTotalFee),
            totalCost: String(calcTotalCost),
            totalHours: String(calcTotalHours),
            marginPercent: calcTotalFee > 0 ? String(((calcTotalFee - calcTotalCost) / calcTotalFee * 100).toFixed(1)) : "0",
            blendedRate: calcTotalHours > 0 ? String((calcTotalFee / calcTotalHours).toFixed(2)) : "0",
          }).where(eq(deals.id, dealId));
        }
      }
    }
    res.json(result);
  });

  app.post("/api/deals/:dealId/pricing", async (req: Request, res: Response) => {
    const [line] = await db.insert(pricingLines).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
      fee: String(parseFloat(req.body.hours) * parseFloat(req.body.rate)),
      cost: String(parseFloat(req.body.hours) * parseFloat(req.body.costRate)),
      margin: String(parseFloat(req.body.hours) * (parseFloat(req.body.rate) - parseFloat(req.body.costRate))),
    }).returning();
    res.status(201).json(line);
  });

  app.delete("/api/deals/:dealId/pricing", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    await db.delete(pricingLines).where(eq(pricingLines.dealId, dealId));
    res.json({ success: true });
  });

  app.patch("/api/deals/:dealId/pricing/:id", async (req: Request, res: Response) => {
    const hours = parseFloat(req.body.hours || "0");
    const rate = parseFloat(req.body.rate || "0");
    const costRate = parseFloat(req.body.costRate || "0");
    const [updated] = await db.update(pricingLines).set({
      ...req.body,
      dealId: parseInt(req.params.dealId),
      fee: String(hours * rate),
      cost: String(hours * costRate),
      margin: String(hours * (rate - costRate)),
    }).where(eq(pricingLines.id, parseInt(req.params.id))).returning();
    res.json(updated);
  });

  // ========== SCENARIOS ==========
  app.get("/api/deals/:dealId/scenarios", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    let result = await db.select().from(scenarios)
      .where(eq(scenarios.dealId, dealId))
      .orderBy(scenarios.createdAt);

    if (result.length === 0) {
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
      if (deal) {
        const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
        const baseFee = lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
        const baseCost = lines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
        const baseHours = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);

        const fee = baseFee || parseFloat(deal.totalFee || "0") || 100000;
        const cost = baseCost || parseFloat(deal.totalCost || "0") || 70000;
        const hours = baseHours || parseFloat(deal.totalHours || "0") || 400;

        const stdMargin = fee > 0 ? ((fee - cost) / fee * 100) : 25;
        const premFee = Math.round(fee * 1.15);
        const premHours = Math.round(hours * 0.9);
        const premCost = Math.round(cost * 1.05);
        const premMargin = premFee > 0 ? ((premFee - premCost) / premFee * 100) : 30;
        const valFee = Math.round(fee * 0.85);
        const valHours = Math.round(hours * 1.15);
        const valCost = Math.round(cost * 0.92);
        const valMargin = valFee > 0 ? ((valFee - valCost) / valFee * 100) : 20;

        await db.insert(scenarios).values([
          {
            dealId, name: "Option 1", description: "Balanced team composition with standard timeline",
            scenarioType: "option_1", isRecommended: false,
            totalFee: String(Math.round(fee)), totalCost: String(Math.round(cost)),
            totalHours: String(Math.round(hours)), marginPercent: String(stdMargin.toFixed(1)),
            blendedRate: hours > 0 ? String((fee / hours).toFixed(2)) : "0",
            aiReasoning: `Standard delivery model maintaining ${stdMargin.toFixed(0)}% margin with balanced senior-to-junior ratio across ${Math.round(hours)} hours. Meets baseline requirements with predictable delivery timeline.`,
          },
          {
            dealId, name: "Option 2", description: "Senior-heavy team with accelerated timeline",
            scenarioType: "option_2", isRecommended: true,
            totalFee: String(premFee), totalCost: String(premCost),
            totalHours: String(premHours), marginPercent: String(premMargin.toFixed(1)),
            blendedRate: premHours > 0 ? String((premFee / premHours).toFixed(2)) : "0",
            aiReasoning: `Recommended option with ${premMargin.toFixed(0)}% margin. Senior-heavy staffing reduces total hours to ${premHours} while increasing fee to ${premFee.toLocaleString()}. Higher blended rate compensated by faster, more experienced delivery.`,
          },
          {
            dealId, name: "Option 3", description: "Cost-optimized with extended timeline",
            scenarioType: "option_3", isRecommended: false,
            totalFee: String(valFee), totalCost: String(valCost),
            totalHours: String(valHours), marginPercent: String(valMargin.toFixed(1)),
            blendedRate: valHours > 0 ? String((valFee / valHours).toFixed(2)) : "0",
            aiReasoning: `Budget-conscious option at ${valMargin.toFixed(0)}% margin leveraging more junior resources across ${valHours} hours. Lower blended rate with extended timeline provides cost savings while maintaining quality.`,
          },
        ]);
        result = await db.select().from(scenarios)
          .where(eq(scenarios.dealId, dealId))
          .orderBy(scenarios.createdAt);
      }
    }
    res.json(result);
  });

  app.post("/api/deals/:dealId/scenarios/:id/select", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const scenarioId = parseInt(req.params.id);

    // Validate scenario belongs to this deal BEFORE mutating any state.
    const target = await db.query.scenarios.findFirst({
      where: and(eq(scenarios.id, scenarioId), eq(scenarios.dealId, dealId)),
    });
    if (!target) return res.status(404).json({ error: "Scenario not found for this deal" });

    await db.update(scenarios).set({ isRecommended: false }).where(eq(scenarios.dealId, dealId));
    const [selected] = await db.update(scenarios).set({ isRecommended: true })
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.dealId, dealId))).returning();
    if (!selected) return res.status(404).json({ error: "Scenario not found" });

    // Scale every pricing line so the per-row grid (and all derived KPIs / role
    // & scope breakdowns) reflects the chosen option. Multipliers are computed
    // from the current line totals → the scenario's targets, so re-selecting a
    // different option later re-scales correctly.
    const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const curHours = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
    const curFee = lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const curCost = lines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const tgtHours = parseFloat(selected.totalHours || "0");
    const tgtFee = parseFloat(selected.totalFee || "0");
    const tgtCost = parseFloat(selected.totalCost || "0");
    const hMul = curHours > 0 && tgtHours > 0 ? tgtHours / curHours : 1;
    const fMul = curFee > 0 && tgtFee > 0 ? tgtFee / curFee : 1;
    const cMul = curCost > 0 && tgtCost > 0 ? tgtCost / curCost : 1;
    for (const l of lines) {
      const newHours = parseFloat(l.hours || "0") * hMul;
      const newFee = parseFloat(l.fee || "0") * fMul;
      const newCost = parseFloat(l.cost || "0") * cMul;
      const newRate = newHours > 0 ? newFee / newHours : parseFloat(l.rate || "0");
      const newCostRate = newHours > 0 ? newCost / newHours : parseFloat(l.costRate || "0");
      await db.update(pricingLines).set({
        hours: newHours.toFixed(2),
        rate: newRate.toFixed(2),
        costRate: newCostRate.toFixed(2),
        fee: newFee.toFixed(2),
        cost: newCost.toFixed(2),
        margin: (newFee - newCost).toFixed(2),
      }).where(eq(pricingLines.id, l.id));
    }

    // Single source of truth: derive deal-level totals from the persisted
    // (post-scale) pricing lines so the banner / KPI strip / grid never drift.
    const updatedLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const sumHours = updatedLines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
    const sumFee = updatedLines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const sumCost = updatedLines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const dealTotalFee = updatedLines.length > 0 ? sumFee : parseFloat(selected.totalFee || "0");
    const dealTotalCost = updatedLines.length > 0 ? sumCost : parseFloat(selected.totalCost || "0");
    const dealTotalHours = updatedLines.length > 0 ? sumHours : parseFloat(selected.totalHours || "0");
    const dealMargin = dealTotalFee > 0 ? ((dealTotalFee - dealTotalCost) / dealTotalFee) * 100 : 0;
    const dealBlended = dealTotalHours > 0 ? dealTotalFee / dealTotalHours : 0;

    await db.update(deals).set({
      totalFee: dealTotalFee.toFixed(2),
      totalCost: dealTotalCost.toFixed(2),
      totalHours: dealTotalHours.toFixed(2),
      marginPercent: dealMargin.toFixed(2),
      blendedRate: dealBlended.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(deals.id, dealId));

    await db.insert(activityLog).values({
      dealId,
      action: "scenario_selected",
      description: `Selected "${selected.name}" scenario — Fee: $${parseFloat(selected.totalFee || "0").toLocaleString()}, Margin: ${selected.marginPercent}%`,
      userName: req.body.userName || "System",
    });

    res.json(selected);
  });

  // ========== APPROVALS ==========
  app.get("/api/deals/:dealId/approvals", async (req: Request, res: Response) => {
    const result = await db.select().from(approvals)
      .where(eq(approvals.dealId, parseInt(req.params.dealId)))
      .orderBy(desc(approvals.submittedAt));
    res.json(result);
  });

  app.post("/api/deals/:dealId/approvals", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const actor = (req.header("x-user-name") || req.body?.submittedBy || req.body?.userName || "Unknown").trim();
    // SERVER-SIDE GATING: refuse to create the approval (and refuse to flip
    // the deal to "submitted") if the latest Intapp screening is a conflict
    // and gating is enabled. Override path is /api/intapp/.../override.
    const intappGate = await assertSubmissionAllowed(dealId, actor);
    if (!intappGate.allow) {
      return res.status(409).json({
        error: intappGate.reason,
        code: "intapp_conflict",
        screening: intappGate.screening,
      });
    }

    // Workday pre-submit gating: blocks if budget or staffing fails AND not yet overridden
    const wdGate = await onDealSubmitted(dealId, actor);
    if (wdGate.blocked) {
      return res.status(409).json({
        error: "WORKDAY_VALIDATION_BLOCKED",
        message: wdGate.reason,
        validationId: wdGate.validationId,
      });
    }

    const [approval] = await db.insert(approvals).values({
      dealId,
      ...req.body,
    }).returning();

    await db.update(deals).set({ status: "submitted" }).where(eq(deals.id, dealId));
    autoPushDeal(dealId, ["status"], actor).catch(() => {});
    onDealSubmittedTrigger(dealId, actor).catch(() => {});

    await db.insert(activityLog).values({
      dealId,
      action: "approval_submitted",
      description: `Deal submitted for approval to ${req.body.approverName || "reviewer"}`,
      userName: req.body.submittedBy || "System",
    });

    res.status(201).json(approval);
  });

  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    const [updated] = await db.update(approvals).set({
      ...req.body,
      decidedAt: new Date(),
    }).where(eq(approvals.id, parseInt(req.params.id))).returning();

    if (updated && updated.dealId && (req.body.status === "approved" || req.body.status === "rejected")) {
      await db.update(deals).set({ status: req.body.status }).where(eq(deals.id, updated.dealId));
      await db.insert(activityLog).values({
        dealId: updated.dealId,
        action: `deal_${req.body.status}`,
        description: `Deal ${req.body.status} by ${updated.approverName || "reviewer"}`,
        userName: updated.approverName || "System",
      });
      autoPushDeal(updated.dealId, ["status"], updated.approverName || undefined).catch(() => {});
    }

    res.json(updated);
  });

  // ========== PROMPT RESPONSES ==========
  app.get("/api/deals/:dealId/prompts", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    let result = await db.select().from(promptResponses)
      .where(eq(promptResponses.dealId, dealId))
      .orderBy(promptResponses.sortOrder);
    if (result.length === 0) {
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
      if (deal) {
        await createDefaultPrompts(dealId);
        result = await db.select().from(promptResponses)
          .where(eq(promptResponses.dealId, dealId))
          .orderBy(promptResponses.sortOrder);
      }
    }
    res.json(result);
  });

  app.post("/api/deals/:dealId/prompts", async (req: Request, res: Response) => {
    const [prompt] = await db.insert(promptResponses).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
    }).returning();
    res.status(201).json(prompt);
  });

  app.patch("/api/deals/:dealId/prompts/:id", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const [updated] = await db.update(promptResponses)
      .set({ answer: req.body.answer, impactMultiplier: req.body.impactMultiplier })
      .where(eq(promptResponses.id, parseInt(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Prompt not found" });
    await recalcPricingFromScope(dealId);
    res.json(updated);
  });

  // ========== PROMPT SETS (Pricing Operations governance — US-12) ==========
  // List sets, optionally filtered by status / BU / serviceLine.
  app.get("/api/prompt-sets", async (req: Request, res: Response) => {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(promptSets.status, String(req.query.status)));
    if (req.query.businessUnit) conds.push(eq(promptSets.businessUnit, String(req.query.businessUnit)));
    if (req.query.serviceLine) conds.push(eq(promptSets.serviceLine, String(req.query.serviceLine)));
    const where = conds.length ? and(...conds) : undefined;
    const rows = where
      ? await db.select().from(promptSets).where(where).orderBy(desc(promptSets.updatedAt))
      : await db.select().from(promptSets).orderBy(desc(promptSets.updatedAt));
    res.json(rows);
  });

  // Resolve the active published set for (BU, serviceLine) using same precedence as new-deal flow.
  app.get("/api/prompt-sets/active", async (req: Request, res: Response) => {
    const bu = (req.query.businessUnit as string) || null;
    const sl = (req.query.serviceLine as string) || null;
    const set = await findActivePromptSet(bu, sl);
    if (!set) return res.json(null);
    const items = await db.select().from(promptSetItems)
      .where(and(eq(promptSetItems.promptSetId, set.id), eq(promptSetItems.enabled, true)))
      .orderBy(asc(promptSetItems.sortOrder));
    res.json({ ...set, items });
  });

  app.get("/api/prompt-sets/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [set] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!set) return res.status(404).json({ error: "Prompt set not found" });
    const items = await db.select().from(promptSetItems)
      .where(eq(promptSetItems.promptSetId, id))
      .orderBy(asc(promptSetItems.sortOrder));
    res.json({ ...set, items });
  });

  // Create a new draft set (version starts at 1 unless caller specifies).
  app.post("/api/prompt-sets", async (req: Request, res: Response) => {
    const { name, businessUnit, serviceLine, notes, version } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    const createdBy = (req.header("x-user-name") || "Unknown").trim();
    const [created] = await db.insert(promptSets).values({
      name, businessUnit: businessUnit || null, serviceLine: serviceLine || null,
      notes: notes || null, version: Number.isFinite(version) ? Math.max(1, parseInt(String(version))) : 1,
      status: "draft", createdBy,
    }).returning();
    res.status(201).json(created);
  });

  // Update draft metadata (cannot edit published sets — clone instead).
  app.patch("/api/prompt-sets/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!existing) return res.status(404).json({ error: "Prompt set not found" });
    if (existing.status !== "draft") {
      return res.status(409).json({ error: "Only draft sets can be edited. Clone this set to create a new draft." });
    }
    const allowed: any = {};
    for (const k of ["name", "businessUnit", "serviceLine", "notes"]) {
      if (k in (req.body || {})) allowed[k] = req.body[k];
    }
    allowed.updatedAt = new Date();
    const [updated] = await db.update(promptSets).set(allowed).where(eq(promptSets.id, id)).returning();
    res.json(updated);
  });

  // Delete a draft set (cascades to items). Published/archived sets cannot be deleted.
  app.delete("/api/prompt-sets/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!existing) return res.status(404).json({ error: "Prompt set not found" });
    if (existing.status !== "draft") {
      return res.status(409).json({ error: "Only draft sets can be deleted. Archive published sets instead." });
    }
    await db.delete(promptSets).where(eq(promptSets.id, id));
    res.json({ ok: true });
  });

  // Publish a draft. Auto-archives any prior published set with same (BU, serviceLine).
  app.post("/api/prompt-sets/:id/publish", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!existing) return res.status(404).json({ error: "Prompt set not found" });
    if (existing.status !== "draft") {
      return res.status(409).json({ error: `Cannot publish a set in status "${existing.status}"` });
    }
    const items = await db.select().from(promptSetItems).where(eq(promptSetItems.promptSetId, id));
    if (items.length === 0) {
      return res.status(400).json({ error: "Cannot publish an empty set — add at least one prompt." });
    }
    const actor = (req.header("x-user-name") || "Unknown").trim();
    // Wrap archive-prior + publish-new in a single transaction so concurrent
    // publishes for the same (BU, SL) tuple cannot leave two published rows.
    // The unique partial index uq_prompt_sets_published_tuple is the ultimate
    // safety net.
    const updated = await db.transaction(async (tx) => {
      const priorConds: any[] = [eq(promptSets.status, "published")];
      priorConds.push(existing.businessUnit ? eq(promptSets.businessUnit, existing.businessUnit) : isNull(promptSets.businessUnit));
      priorConds.push(existing.serviceLine ? eq(promptSets.serviceLine, existing.serviceLine) : isNull(promptSets.serviceLine));
      await tx.update(promptSets)
        .set({ status: "archived", archivedAt: new Date(), archivedBy: actor, updatedAt: new Date() })
        .where(and(...priorConds));
      const [u] = await tx.update(promptSets)
        .set({ status: "published", publishedAt: new Date(), publishedBy: actor, updatedAt: new Date() })
        .where(eq(promptSets.id, id))
        .returning();
      return u;
    });
    res.json(updated);
  });

  // Clone a set as a new draft with version = max(version)+1 for that (BU, serviceLine).
  app.post("/api/prompt-sets/:id/clone", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const [src] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!src) return res.status(404).json({ error: "Prompt set not found" });
    const sameTuple: any[] = [];
    sameTuple.push(src.businessUnit ? eq(promptSets.businessUnit, src.businessUnit) : isNull(promptSets.businessUnit));
    sameTuple.push(src.serviceLine ? eq(promptSets.serviceLine, src.serviceLine) : isNull(promptSets.serviceLine));
    const siblings = await db.select({ version: promptSets.version }).from(promptSets).where(and(...sameTuple));
    const nextVersion = (siblings.reduce((m, r) => Math.max(m, r.version || 1), 0) || 0) + 1;
    const createdBy = (req.header("x-user-name") || "Unknown").trim();
    const [cloned] = await db.insert(promptSets).values({
      name: src.name,
      businessUnit: src.businessUnit,
      serviceLine: src.serviceLine,
      notes: src.notes,
      version: nextVersion,
      status: "draft",
      createdBy,
    }).returning();
    const items = await db.select().from(promptSetItems).where(eq(promptSetItems.promptSetId, src.id));
    if (items.length > 0) {
      await db.insert(promptSetItems).values(items.map((it) => ({
        promptSetId: cloned.id,
        question: it.question,
        category: it.category,
        helpText: it.helpText,
        options: it.options,
        sortOrder: it.sortOrder,
        enabled: it.enabled,
      })));
    }
    res.status(201).json(cloned);
  });

  // Manually archive any set (publishers may want to retire without replacement).
  app.post("/api/prompt-sets/:id/archive", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const actor = (req.header("x-user-name") || "Unknown").trim();
    const [updated] = await db.update(promptSets)
      .set({ status: "archived", archivedAt: new Date(), archivedBy: actor, updatedAt: new Date() })
      .where(eq(promptSets.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Prompt set not found" });
    res.json(updated);
  });

  // Items: only draft sets are mutable.
  async function assertDraftSet(setId: number): Promise<{ error?: string; status?: number; set?: any }> {
    const [set] = await db.select().from(promptSets).where(eq(promptSets.id, setId));
    if (!set) return { error: "Prompt set not found", status: 404 };
    if (set.status !== "draft") return { error: "Only draft sets can be edited. Clone the set first.", status: 409 };
    return { set };
  }

  function validateOptionsArray(opts: any): { error?: string; value?: any[] } {
    if (!Array.isArray(opts) || opts.length === 0) return { error: "options must be a non-empty array" };
    const cleaned: any[] = [];
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (!o || typeof o !== "object") return { error: `option ${i + 1} is invalid` };
      const label = String(o.label ?? "").trim();
      const m = parseFloat(String(o.multiplier ?? ""));
      if (!label) return { error: `option ${i + 1} is missing a label` };
      if (!Number.isFinite(m) || m < 0.1 || m > 5.0) return { error: `option "${label}" multiplier must be a number between 0.1 and 5.0` };
      cleaned.push({ label, multiplier: m.toFixed(2) });
    }
    return { value: cleaned };
  }

  app.post("/api/prompt-sets/:id/items", async (req: Request, res: Response) => {
    const setId = parseInt(req.params.id);
    const guard = await assertDraftSet(setId);
    if (guard.error) return res.status(guard.status!).json({ error: guard.error });
    const { question, category, helpText, options, sortOrder, enabled } = req.body || {};
    if (!question || typeof question !== "string") return res.status(400).json({ error: "question is required" });
    const v = validateOptionsArray(options);
    if (v.error) return res.status(400).json({ error: v.error });
    const [created] = await db.insert(promptSetItems).values({
      promptSetId: setId,
      question,
      category: category || null,
      helpText: helpText || null,
      options: v.value!,
      sortOrder: Number.isFinite(sortOrder) ? parseInt(String(sortOrder)) : 0,
      enabled: enabled === false ? false : true,
    }).returning();
    await db.update(promptSets).set({ updatedAt: new Date() }).where(eq(promptSets.id, setId));
    res.status(201).json(created);
  });

  app.patch("/api/prompt-sets/:id/items/:itemId", async (req: Request, res: Response) => {
    const setId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    const guard = await assertDraftSet(setId);
    if (guard.error) return res.status(guard.status!).json({ error: guard.error });
    const patch: any = {};
    if ("question" in req.body) patch.question = String(req.body.question || "");
    if ("category" in req.body) patch.category = req.body.category || null;
    if ("helpText" in req.body) patch.helpText = req.body.helpText || null;
    if ("sortOrder" in req.body) patch.sortOrder = parseInt(String(req.body.sortOrder)) || 0;
    if ("enabled" in req.body) patch.enabled = !!req.body.enabled;
    if ("options" in req.body) {
      const v = validateOptionsArray(req.body.options);
      if (v.error) return res.status(400).json({ error: v.error });
      patch.options = v.value;
    }
    if (patch.question !== undefined && !patch.question.trim()) return res.status(400).json({ error: "question cannot be empty" });
    const [updated] = await db.update(promptSetItems).set(patch)
      .where(and(eq(promptSetItems.id, itemId), eq(promptSetItems.promptSetId, setId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Item not found" });
    await db.update(promptSets).set({ updatedAt: new Date() }).where(eq(promptSets.id, setId));
    res.json(updated);
  });

  app.delete("/api/prompt-sets/:id/items/:itemId", async (req: Request, res: Response) => {
    const setId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    const guard = await assertDraftSet(setId);
    if (guard.error) return res.status(guard.status!).json({ error: guard.error });
    await db.delete(promptSetItems)
      .where(and(eq(promptSetItems.id, itemId), eq(promptSetItems.promptSetId, setId)));
    await db.update(promptSets).set({ updatedAt: new Date() }).where(eq(promptSets.id, setId));
    res.json({ ok: true });
  });

  // ========== AI ENDPOINTS ==========

  app.post("/api/ai/deal-similarity", async (req: Request, res: Response) => {
    const { clientId, serviceLine, businessUnit } = req.body;
    const similarDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.clientId, clientId),
        eq(deals.status, "approved"),
      ),
      with: { client: true },
      limit: 3,
    });

    const allDeals = await db.query.deals.findMany({
      where: eq(deals.status, "approved"),
      with: { client: true },
      limit: 5,
    });

    const dealsToAnalyze = similarDeals.length > 0 ? similarDeals : allDeals;
    const avgMargin = dealsToAnalyze.reduce((sum, d) => sum + parseFloat(d.marginPercent || "0"), 0) / (dealsToAnalyze.length || 1);
    const avgFee = dealsToAnalyze.reduce((sum, d) => sum + parseFloat(d.totalFee || "0"), 0) / (dealsToAnalyze.length || 1);

    res.json({
      similarDeals: dealsToAnalyze.map(d => ({
        dealNumber: d.dealNumber,
        title: d.title,
        clientName: d.client?.name,
        totalFee: d.totalFee,
        marginPercent: d.marginPercent,
        totalHours: d.totalHours,
      })),
      insights: {
        averageMargin: avgMargin.toFixed(1),
        averageFee: avgFee.toFixed(0),
        dealCount: dealsToAnalyze.length,
        recommendation: `Based on ${dealsToAnalyze.length} similar ${serviceLine || "consulting"} engagements, the average margin is ${avgMargin.toFixed(1)}% with an average fee of $${avgFee.toLocaleString()}. Consider using these benchmarks as a starting point for your pricing strategy.`,
      },
    });
  });

  app.post("/api/ai/effort-estimation", async (req: Request, res: Response) => {
    const { scopeItems: items, complexity, prompts, startDate, endDate } = req.body;
    const complexityMultipliers: Record<string, number> = { low: 0.8, medium: 1.0, high: 1.2, very_high: 1.5 };
    const baseMultiplier = complexityMultipliers[complexity] || 1.0;

    let promptMultiplier = 1.0;
    if (prompts && Array.isArray(prompts)) {
      promptMultiplier = prompts.reduce((m: number, p: any) => m * (parseFloat(p.impactMultiplier) || 1.0), 1.0);
    }

    const totalMultiplier = baseMultiplier * promptMultiplier;

    const estimatedItems = (items || []).map((item: any) => ({
      ...item,
      estimatedHours: Math.round(parseFloat(item.defaultHours || "40") * totalMultiplier),
      multiplierApplied: totalMultiplier.toFixed(2),
    }));

    const totalHours = estimatedItems.reduce((sum: number, i: any) => sum + i.estimatedHours, 0);

    // Compute project duration in weeks from deal dates (fallback: 12 weeks)
    let projectWeeks = 12;
    let weeksSource: "dates" | "default" = "default";
    if (startDate && endDate) {
      const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
      const w = ms / (1000 * 60 * 60 * 24 * 7);
      if (Number.isFinite(w) && w >= 1) {
        projectWeeks = Math.round(w);
        weeksSource = "dates";
      }
    }
    // Standard billable capacity: 32 hrs/week per FTE (80% utilization on 40hr week)
    const billableHrsPerFTEPerWeek = 32;
    const fteCapacity = projectWeeks * billableHrsPerFTEPerWeek;

    const distribution: Array<{ role: string; percentage: number }> = [
      { role: "Partner", percentage: 7 },
      { role: "Managing Director", percentage: 10 },
      { role: "Senior Manager", percentage: 17 },
      { role: "Manager", percentage: 20 },
      { role: "Senior Consultant", percentage: 26 },
      { role: "Consultant", percentage: 13 },
      { role: "Analyst", percentage: 7 },
    ];

    const roleDistribution = distribution.map(r => {
      const hours = Math.round(totalHours * (r.percentage / 100));
      // Headcount = hours / FTE capacity; round up to whole resources, min 0 (skip if <0.05 FTE)
      const fteRaw = fteCapacity > 0 ? hours / fteCapacity : 0;
      const headcount = fteRaw < 0.05 ? 0 : Math.max(1, Math.ceil(fteRaw));
      return { ...r, hours, headcount, fte: parseFloat(fteRaw.toFixed(2)) };
    });

    const totalHeadcount = roleDistribution.reduce((s, r) => s + r.headcount, 0);
    const totalFTE = parseFloat(roleDistribution.reduce((s, r) => s + r.fte, 0).toFixed(2));

    res.json({
      estimatedItems,
      totalHours,
      complexityMultiplier: baseMultiplier,
      promptMultiplier: promptMultiplier.toFixed(2),
      totalMultiplier: totalMultiplier.toFixed(2),
      roleDistribution,
      projectWeeks,
      weeksSource,
      billableHrsPerFTEPerWeek,
      totalHeadcount,
      totalFTE,
      narrative: `Based on ${complexity} complexity with ${(prompts || []).length} scope factors applied, we estimate ${totalHours} total hours across ${estimatedItems.length} scope areas. Over ${projectWeeks} weeks${weeksSource === "default" ? " (default — set deal start/end dates for a tighter estimate)" : ""}, that maps to ~${totalFTE} FTE (${totalHeadcount} named resources at standard ${billableHrsPerFTEPerWeek} billable hrs/wk).`,
    });
  });

  app.post("/api/ai/margin-advisor", async (req: Request, res: Response) => {
    const { pricingLines: lines, targetMargin = 25 } = req.body;
    if (!lines || !Array.isArray(lines)) {
      return res.json({ suggestions: [], currentMargin: 0 });
    }

    const totalFee = lines.reduce((sum: number, l: any) => sum + parseFloat(l.fee || "0"), 0);
    const totalCost = lines.reduce((sum: number, l: any) => sum + parseFloat(l.cost || "0"), 0);
    const currentMargin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;

    const suggestions: any[] = [];

    if (currentMargin < targetMargin) {
      const seniorLines = lines.filter((l: any) => ["Senior Consultant", "Manager", "Senior Manager"].includes(l.role?.name));
      const juniorLines = lines.filter((l: any) => ["Consultant", "Analyst"].includes(l.role?.name));

      if (seniorLines.length > 0 && juniorLines.length > 0) {
        const shiftHours = 40;
        const seniorRate = parseFloat(seniorLines[0].rate || "0");
        const juniorRate = parseFloat(juniorLines[0].rate || "0");
        const seniorCostRate = parseFloat(seniorLines[0].costRate || "0");
        const juniorCostRate = parseFloat(juniorLines[0].costRate || "0");

        const newTotalCost = totalCost - (shiftHours * seniorCostRate) + (shiftHours * juniorCostRate);
        const newMargin = totalFee > 0 ? ((totalFee - newTotalCost) / totalFee) * 100 : 0;

        suggestions.push({
          type: "role_shift",
          title: "Optimize Resource Mix",
          description: `Shifting ${shiftHours} hours from ${seniorLines[0].role?.name} to ${juniorLines[0].role?.name} would improve margin from ${currentMargin.toFixed(1)}% to ${newMargin.toFixed(1)}% while maintaining delivery quality.`,
          impact: `+${(newMargin - currentMargin).toFixed(1)}% margin improvement`,
          newMargin: newMargin.toFixed(1),
          priority: "high",
        });
      }

      suggestions.push({
        type: "rate_adjustment",
        title: "Consider Rate Uplift",
        description: `A 5% rate increase across all roles would bring the margin to approximately ${(currentMargin + 3.5).toFixed(1)}%.`,
        impact: `+3.5% margin improvement`,
        newMargin: (currentMargin + 3.5).toFixed(1),
        priority: "medium",
      });
    }

    if (currentMargin >= targetMargin) {
      suggestions.push({
        type: "on_target",
        title: "Margin On Target",
        description: `Current margin of ${currentMargin.toFixed(1)}% meets the ${targetMargin}% target. The pricing structure is well-balanced.`,
        impact: "No changes needed",
        priority: "info",
      });
    }

    res.json({
      currentMargin: currentMargin.toFixed(1),
      targetMargin,
      totalFee,
      totalCost,
      isOnTarget: currentMargin >= targetMargin,
      suggestions,
    });
  });

  app.post("/api/ai/scenario-recommendation", async (req: Request, res: Response) => {
    const { dealId } = req.body;
    const dealScenarios = await db.select().from(scenarios).where(eq(scenarios.dealId, dealId));

    if (dealScenarios.length === 0) {
      return res.json({ recommendation: null, scenarios: [] });
    }

    const recommended = dealScenarios.find(s => s.isRecommended) || dealScenarios[0];

    const comparison = dealScenarios.map(s => ({
      name: s.name,
      type: s.scenarioType,
      totalFee: s.totalFee,
      totalHours: s.totalHours,
      marginPercent: s.marginPercent,
      blendedRate: s.blendedRate,
      isRecommended: s.isRecommended,
      reasoning: s.aiReasoning,
    }));

    res.json({
      recommendation: {
        scenarioName: recommended.name,
        reasoning: recommended.aiReasoning,
        confidence: 0.87,
      },
      scenarios: comparison,
      narrative: `After analyzing ${comparison.length} pricing scenarios, the "${recommended.name}" option is recommended. It offers the best balance of margin performance (${recommended.marginPercent}%) and client value alignment based on historical engagement patterns.`,
    });
  });

  app.post("/api/ai/risk-summary", async (req: Request, res: Response) => {
    const { dealId } = req.body;
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: { client: true, scenarios: true, pricingLines: { with: { role: true } } },
    });

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const margin = parseFloat(deal.marginPercent || "0");
    const riskLevel = margin < 20 ? "High" : margin < 25 ? "Medium" : "Low";

    const riskFactors = [];
    if (deal.complexity === "high" || deal.complexity === "very_high") {
      riskFactors.push({ factor: "High Complexity", severity: "medium", detail: "Project complexity increases delivery risk" });
    }
    if (margin < 25) {
      riskFactors.push({ factor: "Below Target Margin", severity: margin < 20 ? "high" : "medium", detail: `Current margin of ${margin.toFixed(1)}% is below the 25% target` });
    }
    if (parseFloat(deal.totalHours || "0") > 1000) {
      riskFactors.push({ factor: "Large Engagement", severity: "low", detail: "Engagements over 1,000 hours require additional project governance" });
    }

    const clientYears = deal.client?.relationshipYears || 0;
    if (clientYears > 3) {
      riskFactors.push({ factor: "Strong Client Relationship", severity: "positive", detail: `${clientYears}-year relationship provides delivery confidence` });
    }

    const narrative = `This $${parseFloat(deal.totalFee || "0").toLocaleString()} ${deal.serviceLine || "consulting"} engagement for ${deal.client?.name} represents a ${margin.toFixed(1)}% margin with ${parseFloat(deal.totalHours || "0").toLocaleString()} estimated hours. ${riskLevel === "Low" ? "The deal is well-positioned with acceptable margin and manageable complexity." : riskLevel === "Medium" ? "The deal has moderate risk factors that should be monitored during delivery." : "The deal has elevated risk factors requiring additional oversight and potential restructuring."} ${clientYears > 3 ? `The ${clientYears}-year client relationship provides a strong foundation for successful delivery.` : ""} Comparable deals in the ${deal.businessUnit || "practice"} have an 89% approval rate at this margin band.`;

    res.json({
      dealTitle: deal.title,
      clientName: deal.client?.name,
      riskLevel,
      riskScore: riskLevel === "Low" ? 2.5 : riskLevel === "Medium" ? 5.5 : 8.0,
      riskFactors,
      executiveSummary: {
        totalFee: deal.totalFee,
        totalCost: deal.totalCost,
        totalHours: deal.totalHours,
        marginPercent: deal.marginPercent,
        blendedRate: deal.blendedRate,
        dealType: deal.dealType,
        complexity: deal.complexity,
      },
      narrative,
      approvalLikelihood: riskLevel === "Low" ? "High (89%)" : riskLevel === "Medium" ? "Moderate (72%)" : "Requires Review (45%)",
    });
  });

  // ========== ACTIVITY LOG ==========
  app.get("/api/activity", async (_req: Request, res: Response) => {
    const result = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(20);
    res.json(result);
  });

  // ========== ARCHITECTURE CONVERSATIONAL AI ==========
  app.post("/api/ai/architecture-chat", async (req: Request, res: Response) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    const msg = message.toLowerCase();

    const allDeals = await db.select().from(deals);
    const allClients = await db.select().from(clients);
    const allRoles = await db.select().from(roles);
    const catalog = await db.select().from(scopeCatalog);
    const allScenarios = await db.select().from(scenarios);

    const totalDeals = allDeals.length;
    const draftDeals = allDeals.filter(d => d.status === "draft").length;
    const submittedDeals = allDeals.filter(d => d.status === "submitted").length;
    const approvedDeals = allDeals.filter(d => d.status === "approved").length;

    const knowledgeBase: Record<string, { answer: string; sources: string[]; relatedTopics: string[] }> = {
      stack: {
        answer: `DealPad uses a modern TypeScript-first stack:\n\n**Frontend:** React 19, Vite 8.x, Tailwind CSS 4.x, TanStack React Query 5.x, Wouter 3.9, Radix UI, Framer Motion 12.x, Recharts 3.8, Lucide React\n\n**Backend:** Express.js 5.x, Node.js with tsx runtime, Drizzle ORM 0.45, pg (node-postgres)\n\n**Database:** PostgreSQL with 12 normalized tables\n\n**Design:** Armanino amber (#DA720F) brand identity, inspired by Ramp.com and Gusto.com`,
        sources: ["package.json", "shared/schema.ts", "client/src/index.css"],
        relatedTopics: ["database schema", "frontend components", "API design"]
      },
      database: {
        answer: `The database has **12 normalized tables** managed by Drizzle ORM:\n\n1. **clients** - Client profiles (${allClients.length} records)\n2. **deals** - Deal records with status lifecycle (${totalDeals} total: ${draftDeals} draft, ${submittedDeals} submitted, ${approvedDeals} approved)\n3. **scope_catalog** - Standardized scope items (${catalog.length} items)\n4. **deal_scope_items** - Scope items attached to deals\n5. **roles** - Professional billing roles (${allRoles.length} levels)\n6. **rate_cards** - Rate card definitions with effective dates\n7. **rate_card_entries** - Per-role rates within rate cards\n8. **pricing_lines** - Deal-level pricing by role\n9. **scenarios** - Generated pricing scenarios (${allScenarios.length} total)\n10. **approvals** - Approval workflow records\n11. **prompt_responses** - Contextual discovery answers\n12. **activity_log** - Audit trail\n\nAll financial fields use DECIMAL(12,2) to avoid floating-point errors. Schema is defined in \`shared/schema.ts\` as the single source of truth.`,
        sources: ["shared/schema.ts", "server/db.ts", "server/seed.ts"],
        relatedTopics: ["pricing engine", "deal lifecycle", "data model"]
      },
      ai: {
        answer: `DealPad implements **5 AI use cases** as deterministic heuristic engines (simulating LLM behavior for the PoC):\n\n**UC-1: Deal Similarity** - Benchmarks against historical approved deals. Queries by client/service line, computes average margins.\n\n**UC-2: Effort Estimation** - Predicts hours using complexity multipliers (0.8x-1.5x) and prompt impact factors. Distributes across 7 roles: Partner 7%, MD 10%, SM 17%, Mgr 20%, SC 26%, Con 13%, An 7%.\n\n**UC-3: Margin Advisor** - Analyzes pricing structure vs 25% target. Suggests role shifts and rate uplifts.\n\n**UC-4: Scenario Recommendation** - Compares Standard/Premium/Value scenarios with 0.87 confidence score.\n\n**UC-5: Risk Summary** - Generates executive narrative with approval likelihood (Low=89%, Medium=72%, High=45%).\n\n**Production target:** Azure OpenAI GPT-4o with Semantic Kernel orchestration.`,
        sources: ["server/routes.ts (AI endpoints)", "POST /api/ai/*"],
        relatedTopics: ["pricing engine", "scenarios", "risk assessment"]
      },
      rbac: {
        answer: `**6 personas** with distinct permission sets:\n\n1. **PDL** (Michael Torres) - Project Delivery Lead. Creates/edits deals, runs AI tools, manages pricing. Primary user.\n2. **SLL** (Sarah Chen) - Service Line Leader. Approves/rejects deals, pipeline oversight.\n3. **PO** (James Wright) - Pricing Operations. Manages rate cards and scope catalog.\n4. **FIN** (Lisa Park) - Finance/FP&A. Views margins and financial metrics.\n5. **QRM** (David Kim) - Risk/QRM. Views risk summaries and compliance.\n6. **IT** (Alex Rivera) - IT/Data Consumer. Architecture and infrastructure views only.\n\n**PoC enforcement:** Client-side via AuthContext + localStorage persona switching.\n**Production target:** Azure Entra ID with OIDC + JWT middleware + row-level security.`,
        sources: ["client/src/context/AuthContext.tsx", "client/src/App.tsx"],
        relatedTopics: ["security", "personas", "permissions"]
      },
      pricing: {
        answer: `The **Pricing Engine** (recalcPricingFromScope) calculates deal economics:\n\n**Inputs:** Scope items (default hours) x Complexity multiplier (0.8x-1.5x) x Prompt multipliers (compounded)\n\n**Role Distribution:** Partner 7% ($550/hr), MD 10% ($475/hr), SM 17% ($395/hr), Mgr 20% ($345/hr), SC 26% ($285/hr), Con 13% ($225/hr), An 7% ($175/hr)\n\n**Per Line:** fee = hours x rate, cost = hours x costRate, margin = fee - cost\n\n**Scenarios:** Standard (1.0x baseline), Premium (1.15x fee/1.05x cost/-10% hrs), Value (0.85x fee/0.92x cost/+15% hrs)\n\n**Pricing lines are created lazily** on first GET /api/deals/:dealId/pricing, not at deal creation time.`,
        sources: ["server/routes.ts (recalcPricingFromScope)", "shared/schema.ts"],
        relatedTopics: ["scenarios", "rate cards", "deal wizard"]
      },
      lifecycle: {
        answer: `Deal lifecycle follows a **state machine**: draft -> submitted -> approved/rejected (rejected -> draft for revision)\n\n**8-step wizard:** Setup, Scope, Assumptions, Pricing, Scenarios, Review, Approval, Summary\n\n**Deal numbers:** Format DL-2026-### (auto-incremented)\n\n**Key behaviors:**\n- Default prompts (7 questions) created on deal creation\n- Pricing lines created lazily on first pricing step visit\n- Scope changes trigger automatic pricing recalculation\n- Scenario generation on first scenarios step visit\n- Activity logged for all major events\n\n**Current state:** ${draftDeals} draft, ${submittedDeals} pending approval, ${approvedDeals} approved\n\n**PoC note:** State machine enforced at UI layer only. Server accepts any status update.`,
        sources: ["client/src/pages/DealDetail.tsx", "server/routes.ts"],
        relatedTopics: ["pricing engine", "approval workflow", "AI services"]
      },
      azure: {
        answer: `**Target production architecture on Azure:**\n\n- **Identity:** Azure Entra ID (SSO + OIDC + MFA + Conditional Access)\n- **API Gateway:** Azure APIM (rate limiting, auth, routing)\n- **Compute:** Azure Container Apps (microservices: Deal, Pricing, Approval, Analytics services)\n- **AI:** Azure OpenAI GPT-4o + Semantic Kernel + LangGraph agent workflows\n- **Database:** Azure Database for PostgreSQL Flexible Server\n- **Cache:** Azure Cache for Redis (sessions, rate cards)\n- **Storage:** Azure Blob Storage (documents, exports)\n- **Messaging:** Azure Service Bus (async commands) + Event Grid (domain events)\n- **Security:** Key Vault, WAF, TLS 1.3, row-level security\n- **Observability:** Application Insights + Log Analytics + Azure Monitor\n- **CI/CD:** GitHub Actions + Azure DevOps + Container Registry\n\nThe PoC monolith is designed with bounded context separation for clean microservice decomposition.`,
        sources: ["DealPad_Architecture_Document.md (Section 13)"],
        relatedTopics: ["deployment", "security", "CQRS readiness"]
      },
      security: {
        answer: `**PoC security posture:**\n- Authentication: localStorage persona switcher (demo only)\n- Authorization: Client-side hasPermission() checks\n- Data protection: HTTPS via Replit mTLS proxy\n- SQL injection: Drizzle ORM parameterized queries\n- CORS: Open policy (needs tightening)\n- Secrets: DATABASE_URL via environment variable\n\n**Production security roadmap:**\n- Azure Entra ID + OIDC + MFA\n- Server-side JWT middleware\n- Azure WAF + APIM rate limiting\n- Transparent Data Encryption at-rest\n- TLS 1.3 end-to-end\n- Azure Key Vault for secrets\n- Row-level security for multi-tenancy\n- SOC 2 Type II alignment\n- Automated SAST/DAST in CI/CD`,
        sources: ["DealPad_Architecture_Document.md (Section 16)"],
        relatedTopics: ["RBAC", "Azure architecture", "deployment"]
      },
      api: {
        answer: `**25+ REST endpoints** organized by domain:\n\n**Dashboard:** GET /dashboard/summary\n**Clients:** GET /clients, GET /clients/:id\n**Deals:** GET/POST /deals, GET/PATCH /deals/:id, POST /deals/:id/clone\n**Scope:** GET /scope-catalog, GET/POST /deals/:dealId/scope-items, DELETE scope-items/:id\n**Roles & Rates:** GET /roles, GET /rate-cards, GET /rate-cards/:id/entries\n**Pricing:** GET/POST /deals/:dealId/pricing, PATCH/DELETE pricing\n**Scenarios:** GET /deals/:dealId/scenarios, POST scenarios/:id/select\n**Approvals:** GET/POST /deals/:dealId/approvals, PATCH /approvals/:id\n**Prompts:** GET/POST/PATCH /deals/:dealId/prompts\n**AI:** POST /ai/deal-similarity, effort-estimation, margin-advisor, scenario-recommendation, risk-summary\n**Activity:** GET /activity\n\nAll responses are JSON. List endpoints return arrays. Detail endpoints use Drizzle's relational with clause for eager loading.`,
        sources: ["server/routes.ts"],
        relatedTopics: ["backend architecture", "database", "deal lifecycle"]
      },
      frontend: {
        answer: `**Frontend architecture:**\n\n**Pages:** Login (6-persona grid), Dashboard (role-aware KPIs), Deals List (filterable), New Deal (creation form), Deal Detail (8-step wizard), Rate Cards (admin CRUD), Scope Catalog (admin), Architecture (system diagrams)\n\n**State management:** AuthContext (persona/permissions via React Context), TanStack React Query (server state + cache), custom hooks in use-api.ts\n\n**Design system:** Armanino amber #DA720F primary, warm stone #fafaf9 background, dark sidebar #1c1917. Inter font. No emojis. Inspired by Ramp.com/Gusto.com.\n\n**UI library:** Radix UI primitives (Button, Card, Dialog, Select, Tabs, Accordion, Popover, Tooltip) styled with Tailwind CSS v4.\n\n**Animations:** Framer Motion for page transitions and micro-interactions.`,
        sources: ["client/src/App.tsx", "client/src/pages/*", "client/src/index.css"],
        relatedTopics: ["design system", "RBAC", "deal wizard"]
      },
      deployment: {
        answer: `**PoC deployment (current):**\n- Build: Vite compiles React to dist/public/ via npm run build\n- Run: npx tsx server/index.ts (Express serves API + static)\n- Infrastructure: Replit Autoscale deployment\n- Database: Replit PostgreSQL (auto-provisioned)\n- Single process serves both /api/* routes and SPA fallback\n\n**Production target:**\n- CI: GitHub Actions (lint, test, build, Docker image)\n- Registry: Azure Container Registry\n- CD: Azure DevOps release pipeline\n- Staging: Slot-based deployment with smoke tests\n- Production: Blue/green on Azure Container Apps\n- Rollback: Automatic on health check failure`,
        sources: ["server/index.ts", ".replit", "DealPad_Architecture_Document.md (Section 17)"],
        relatedTopics: ["Azure architecture", "CI/CD", "infrastructure"]
      }
    };

    let matched: { answer: string; sources: string[]; relatedTopics: string[] } | null = null;
    const topicMap: [string[], string][] = [
      [["security", "secure", "jwt", "encryption", "waf", "soc", "compliance", "gdpr", "vulnerability", "tls", "key vault"], "security"],
      [["rbac", "persona", "permission", "pdl", "sll", "who can", "access control", "authorization"], "rbac"],
      [["database", "schema", "table", "drizzle", "postgres", "data model", "erd", "entity", "migration"], "database"],
      [["ai", "artificial intelligence", "machine learning", "heuristic", "use case", "uc-1", "uc-2", "uc-3", "uc-4", "uc-5", "llm", "openai", "gpt", "similarity", "effort estimation", "margin advisor", "scenario recommendation", "risk summary"], "ai"],
      [["pricing", "price", "rate card", "cost", "margin", "fee", "blended rate", "recalc", "pricing engine", "pricing line"], "pricing"],
      [["lifecycle", "wizard", "state machine", "deal flow", "deal status", "deal step", "approval workflow"], "lifecycle"],
      [["azure", "entra", "container app", "apim", "service bus", "event grid", "cloud architecture", "azure openai"], "azure"],
      [["api", "endpoint", "rest api", "route", "api design"], "api"],
      [["frontend", "react", "component", "tailwind", "radix", "framer motion", "design system", "sidebar", "vite"], "frontend"],
      [["deploy", "deployment", "hosting", "ci/cd", "pipeline", "docker", "container registry", "blue/green"], "deployment"],
      [["stack", "tech stack", "technology", "framework", "library", "built with", "tools", "dependencies"], "stack"],
    ];

    let bestMatch: { topic: string; score: number } | null = null;
    for (const [keywords, topic] of topicMap) {
      const score = keywords.filter(k => msg.includes(k)).length;
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { topic, score };
      }
    }
    if (bestMatch) {
      matched = knowledgeBase[bestMatch.topic];
    }

    if (msg.includes("help") || msg.includes("what can") || msg.includes("how to use") || msg.includes("capabilities")) {
      matched = {
        answer: `I can answer questions about DealPad's architecture across these topics:\n\n1. **Technology Stack** - Frontend, backend, database technologies\n2. **Database Schema** - 12 tables, relationships, design decisions\n3. **AI Services** - 5 use cases, algorithms, production targets\n4. **RBAC & Personas** - 6 roles, permissions, enforcement\n5. **Pricing Engine** - Calculation model, role distribution, scenarios\n6. **Deal Lifecycle** - State machine, wizard steps, workflows\n7. **Azure Architecture** - Production infrastructure vision\n8. **Security** - Current posture and production roadmap\n9. **API Design** - 25+ endpoints, patterns, conventions\n10. **Frontend** - Components, design system, state management\n11. **Deployment** - Current and target CI/CD\n\nTry asking: "How does the pricing engine work?" or "What AI use cases are implemented?"`,
        sources: ["DealPad_Architecture_Document.md"],
        relatedTopics: ["All topics"]
      };
    }

    if (!matched) {
      matched = {
        answer: `I'm not sure about that specific topic. Here's what I can help with:\n\n- **"What tech stack does DealPad use?"**\n- **"How does the database schema work?"**\n- **"Tell me about the AI services"**\n- **"What are the RBAC personas?"**\n- **"How does the pricing engine calculate fees?"**\n- **"Explain the deal lifecycle"**\n- **"What's the Azure production architecture?"**\n- **"What are the security measures?"**\n- **"List all API endpoints"**\n- **"Describe the frontend architecture"**\n- **"How is deployment configured?"**\n\nCurrently the system has **${totalDeals} deals** (${draftDeals} draft, ${submittedDeals} submitted, ${approvedDeals} approved), **${allClients.length} clients**, **${catalog.length} scope catalog items**, and **${allRoles.length} professional roles**.`,
        sources: [],
        relatedTopics: ["help"]
      };
    }

    res.json({
      response: matched.answer,
      sources: matched.sources,
      relatedTopics: matched.relatedTopics,
      timestamp: new Date().toISOString(),
      systemStats: {
        totalDeals,
        draftDeals,
        submittedDeals,
        approvedDeals,
        totalClients: allClients.length,
        totalRoles: allRoles.length,
        catalogItems: catalog.length,
      }
    });
  });

  // ========== DASHBOARD AI: INSIGHTS + CHAT (role-based) ==========
  // Capability taxonomy mirrors AuthContext permissions. Derived from persona role.
  // NOTE: This PoC trusts client-supplied role (matches localStorage-based auth).
  // Production target: derive role from authenticated session / JWT middleware.
  const ROLE_CAPABILITIES: Record<string, { can: string[]; label: string }> = {
    pdl: { label: "Project Delivery Lead", can: ["deals", "pricing", "margins", "risk", "scope_catalog", "scenarios", "approvals"] },
    sll: { label: "Service Line Leader",   can: ["deals", "pricing", "margins", "risk", "approvals", "scenarios"] },
    po:  { label: "Pricing Operations",    can: ["deals", "pricing", "margins", "rate_cards", "scope_catalog"] },
    fin: { label: "Finance / FP&A",        can: ["deals", "pricing", "margins", "scenarios"] },
    qrm: { label: "Risk / QRM",            can: ["deals", "risk", "approvals", "compliance"] },
    it:  { label: "IT / Data Consumer",    can: ["architecture", "integrations"] },
  };

  function buildRoleInsights(role: string, allDeals: any[], pendingApprovals: number, avgMargin: number) {
    const highRisk = allDeals.filter(d => parseFloat(d.marginPercent || "0") < 25 && parseFloat(d.marginPercent || "0") > 0);
    const topPipeline = allDeals.reduce((sum, d) => sum + parseFloat(d.totalFee || "0"), 0);
    const renewalCount = allDeals.filter(d => d.dealType === "renewal").length;

    const base: Record<string, { type: string; title: string; body: string; cta?: string; href?: string }[]> = {
      pdl: [
        { type: "suggestion", title: "AI Suggestion", body: `Your pipeline totals $${(topPipeline/1000).toFixed(0)}K across ${allDeals.length} deals. Review any deal tracking below your 25% margin floor.`, cta: "View deals", href: "/deals" },
        { type: "alert", title: "Margin Alert", body: `${highRisk.length} active deal(s) sit below the 25% margin threshold. Run Margin Advisor to identify role-mix shifts.`, cta: "Open deals", href: "/deals" },
        { type: "info", title: "Portfolio Margin", body: `Average margin across your portfolio is ${avgMargin.toFixed(1)}% (illustrative benchmark: 31%).`, cta: "Analytics", href: "/analytics" },
      ],
      sll: [
        { type: "alert", title: "Pending Approvals", body: `${pendingApprovals} deal(s) awaiting your review. Oldest submission may be aging.`, cta: "Review now", href: "/deals?status=submitted" },
        { type: "suggestion", title: "Margin Watch", body: `${highRisk.length} deal(s) tracking below 25% margin. Consider requesting rework before approval.`, cta: "View deals", href: "/deals" },
        { type: "info", title: "Service Line Health", body: `Pipeline-weighted margin is ${avgMargin.toFixed(1)}%. Your service line is ${avgMargin >= 30 ? "on target" : "below target"}.` },
      ],
      po: [
        { type: "suggestion", title: "Rate Card Review", body: `${renewalCount} renewal deal(s) in pipeline. Evaluate rate uplift opportunities against your latest market survey.`, cta: "Manage rates", href: "/admin/rate-cards" },
        { type: "info", title: "Scope Catalog", body: `Review scope catalog usage to identify underutilized templates.`, cta: "Open catalog", href: "/admin/scope-catalog" },
        { type: "alert", title: "Pricing Governance", body: `Check for deals with off-rate-card line items. Enforce standards across ${allDeals.length} active deals.`, cta: "View deals", href: "/deals" },
      ],
      fin: [
        { type: "info", title: "Portfolio Margin", body: `Weighted average margin is ${avgMargin.toFixed(1)}%. ${highRisk.length} deal(s) drag below your target.`, cta: "Analytics", href: "/analytics" },
        { type: "alert", title: "Revenue at Risk", body: `${highRisk.length} low-margin deal(s) represent variance risk. Validate scenarios and assumptions.`, cta: "View deals", href: "/deals" },
        { type: "suggestion", title: "Scenario Mix", body: `Premium scenarios typically lift margin. Encourage PDLs to present Premium options alongside Standard.` },
      ],
      qrm: [
        { type: "alert", title: "Risk Flags", body: `${highRisk.length} deal(s) with compressed margins may indicate scope risk. Review AI Risk Summaries.`, cta: "Review deals", href: "/deals" },
        { type: "info", title: "Approval Pipeline", body: `${pendingApprovals} deal(s) in approval queue. Ensure risk summaries are complete before sign-off.`, cta: "Open queue", href: "/deals?status=submitted" },
        { type: "suggestion", title: "Compliance Check", body: `Confirm all submitted deals include assumptions and change-order readiness.` },
      ],
      it: [
        { type: "info", title: "System Health", body: `All integrations nominal. Review the Architecture Hub for active endpoints and data flows.`, cta: "Architecture", href: "/architecture" },
        { type: "suggestion", title: "Integration Map", body: `Explore integration points and upstream/downstream dependencies.`, cta: "Open hub", href: "/architecture" },
        { type: "alert", title: "Data Access", body: `Your role is scoped to infrastructure and architecture views. Deal financials are not accessible.` },
      ],
    };
    return base[role] || base.pdl;
  }

  app.get("/api/ai/dashboard-insights", async (req: Request, res: Response) => {
    const role = String(req.query.role || "pdl").toLowerCase();
    const allDeals = await db.select().from(deals);
    const pendingApprovals = allDeals.filter(d => d.status === "submitted").length;
    const margins = allDeals.map(d => parseFloat(d.marginPercent || "0")).filter(m => m > 0);
    const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    res.json({
      role,
      capability: ROLE_CAPABILITIES[role]?.label || role,
      insights: buildRoleInsights(role, allDeals, pendingApprovals, avgMargin),
    });
  });

  app.post("/api/ai/dashboard-chat", async (req: Request, res: Response) => {
    const { message, role } = req.body || {};
    if (!message) return res.status(400).json({ error: "message is required" });
    const r = String(role || "pdl").toLowerCase();
    const caps = ROLE_CAPABILITIES[r] || ROLE_CAPABILITIES.pdl;
    const msg = String(message).toLowerCase();

    const allDeals = await db.select().from(deals);
    const allClients = await db.select().from(clients);
    const clientMap = new Map(allClients.map(c => [c.id, c]));
    const pendingApprovals = allDeals.filter(d => d.status === "submitted").length;
    const margins = allDeals.map(d => parseFloat(d.marginPercent || "0")).filter(m => m > 0);
    const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    const totalFee = allDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0);

    const denies = (topic: string) => !caps.can.includes(topic);

    const topics: { keys: string[]; need: string; answer: () => string }[] = [
      {
        keys: ["pipeline", "total value", "total deals"],
        need: "deals",
        answer: () => `Current pipeline: $${(totalFee/1000).toFixed(0)}K across ${allDeals.length} deals. ${pendingApprovals} awaiting approval.`,
      },
      {
        keys: ["margin", "low margin", "profit", "profitability"],
        need: "margins",
        answer: () => {
          const low = allDeals.filter(d => parseFloat(d.marginPercent || "0") < 25 && parseFloat(d.marginPercent || "0") > 0);
          const names = low.slice(0, 3).map(d => {
            const c = clientMap.get(d.clientId);
            return `${c?.name || d.title} (${parseFloat(d.marginPercent || "0").toFixed(1)}%)`;
          }).join(", ");
          return `Portfolio average margin is ${avgMargin.toFixed(1)}%. ${low.length} deal(s) below 25%${names ? ": " + names : ""}. Standard BU target is 31%.`;
        },
      },
      {
        keys: ["approval", "pending", "review", "awaiting"],
        need: "deals",
        answer: () => `${pendingApprovals} deal(s) pending approval. ${r === "sll" ? "You are the approver — open the review queue from the sidebar." : "Only Service Line Leaders can approve deals."}`,
      },
      {
        keys: ["risk", "compliance", "flag"],
        need: "risk",
        answer: () => {
          const risky = allDeals.filter(d => parseFloat(d.marginPercent || "0") < 20);
          return `Risk scan: ${risky.length} deal(s) show compressed margins indicating scope or rate risk. Review AI Risk Summaries on each deal.`;
        },
      },
      {
        keys: ["rate card", "rates", "billing rate"],
        need: "rate_cards",
        answer: () => "Rate cards are managed under Configuration. Current recommended uplift is 4.2% based on market averages.",
      },
      {
        keys: ["scope", "catalog", "template"],
        need: "scope_catalog",
        answer: () => "The scope catalog defines standardized engagement templates with default hours and complexity multipliers.",
      },
      {
        keys: ["scenario", "premium", "value option"],
        need: "scenarios",
        answer: () => "Each deal generates Standard, Premium, and Value scenarios. Premium averages +10pts margin vs Standard.",
      },
      {
        keys: ["architecture", "integration", "stack", "tech"],
        need: "architecture",
        answer: () => "DealPad is built on React 19, Express 5, Drizzle ORM, PostgreSQL. Explore the Architecture Hub for diagrams and integration points.",
      },
    ];

    let matched = topics.find(t => t.keys.some(k => msg.includes(k)));
    let response: string;
    let restricted = false;

    if (matched) {
      if (denies(matched.need)) {
        restricted = true;
        response = `As a ${caps.label}, you do not have access to ${matched.need.replace("_", " ")} data. This query is outside your capability scope. Contact your administrator if you believe this is incorrect.`;
      } else {
        response = matched.answer();
      }
    } else {
      response = `I can help with topics within your role (${caps.label}): ${caps.can.join(", ").replace(/_/g, " ")}. Try asking about one of those areas.`;
    }

    res.json({
      response,
      role: r,
      capability: caps.label,
      restricted,
      timestamp: new Date().toISOString(),
    });
  });

  // ========== ASK DEALPAD AI (contextual) ==========
  app.post("/api/ai/ask", async (req: Request, res: Response) => {
    const { question, context, role } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    const rawRole = role || req.headers["x-user-role"];
    if (!rawRole) {
      return res.status(401).json({ error: "Authentication required: select a persona to use Ask DealPad AI" });
    }
    const r = String(rawRole).toLowerCase();
    const caps = ROLE_CAPABILITIES[r];
    if (!caps) {
      return res.status(403).json({ error: `Unknown role "${r}"` });
    }
    const screen = String(context?.screen || "unknown").toLowerCase();
    const dealId = context?.dealId ? Number(context.dealId) : null;
    const q = question.toLowerCase();

    // What can each role DO on each screen
    const screenPermissions: Record<string, { allowed: string[]; readOnly: string[] }> = {
      "new-deal":   { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-setup":      { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-scope":      { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-assumptions":{ allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-pricing":    { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-scenarios":  { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
      "wizard-review":     { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm"] },
      "wizard-approval":   { allowed: ["sll"], readOnly: ["pdl","po","fin","qrm","it"] },
      "wizard-summary":    { allowed: ["pdl","sll","po","fin","qrm"], readOnly: [] },
      "renewal-leadsheet": { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] },
    };
    const perm = screenPermissions[screen] || { allowed: ["pdl"], readOnly: ["sll","po","fin","qrm","it"] };
    const isEditor = perm.allowed.includes(r);
    const isReadOnly = perm.readOnly.includes(r);

    // What this user CAN do (role-appropriate alternatives) when read-only
    const roleAlternatives: Record<string, string[]> = {
      pdl: ["Create or edit deals", "Run AI estimation, margin advisor, scenario recommendation", "Submit deals for approval"],
      sll: ["Review submitted deals from the Approval Center", "Approve, reject, or request rework", "View pipeline margins and dashboards"],
      po:  ["Manage rate cards and the scope catalog", "Configure starter templates", "Audit pricing governance across deals"],
      fin: ["Validate margins and scenario mix", "Review portfolio analytics and FP&A reports", "Comment on financial assumptions (read-only)"],
      qrm: ["Review AI Risk Summaries and Intapp screenings", "Audit approval trail and compliance flags", "Flag deals for QRM review"],
      it:  ["Explore the Architecture Hub and integration map", "Review system health and data flows"],
    };

    // Screen-specific knowledge base — keyword → answer (only if user can access)
    const screenKB: Record<string, { keys: string[]; answer: (ctx: any) => string }[]> = {
      "wizard-setup": [
        { keys: ["title","name"], answer: () => "Pick a deal title that names the engagement and phase, e.g. 'ERP Modernization — Phase 1'. The PDL email auto-routes notifications." },
        { keys: ["complexity","multiplier"], answer: () => "Complexity drives the global hours multiplier (Low 0.9 → Very High 1.3). Set it now; it cascades through scope hours and pricing." },
        { keys: ["pdl","owner"], answer: () => "The PDL owns the deal end-to-end and is the only persona that can edit scope/pricing. Other personas review or approve." },
        { keys: ["margin","target"], answer: (c) => `Standard BU target is 31%. ${c.deal?.marginPercent ? `Current deal margin: ${parseFloat(c.deal.marginPercent).toFixed(1)}%.` : "Margin will calculate after Pricing step."}` },
      ],
      "wizard-scope": [
        { keys: ["template","starter"], answer: () => "Apply a starter template to bulk-add a curated set of scope items. Existing items are preserved; duplicates are skipped." },
        { keys: ["assembly","cascade","child"], answer: () => "Assemblies are parent items that auto-add their children when added. Removing a parent does not remove children — they stay independently." },
        { keys: ["hour","effort","estimate"], answer: (c) => `Total estimated hours for this scope: ${c.totalHours || 0}. Click 'Estimate Effort' to run AI distribution across roles.` },
        { keys: ["catalog","item","add"], answer: () => "Browse the Scope Catalog on the left; click + to add. Items are filtered to your service line by default — toggle 'Show all practices' to see everything." },
        { keys: ["inactive","deactivat"], answer: () => "Inactive scope items are hidden from new deals. Practice leads manage activation in the Scope Catalog admin page." },
        { keys: ["compar","similar","benchmark"], answer: (c) => `Comparable deals for ${c.deal?.serviceLine || "this practice"}: pull from Dashboard analytics or run AI Estimation here for a sized recommendation.` },
      ],
      "wizard-assumptions": [
        { keys: ["multiplier","impact"], answer: () => "Each prompt response carries a multiplier (e.g. 1.0 baseline, 1.2 for added complexity). Multipliers compound and feed the Pricing step." },
        { keys: ["regulator","compliance","sox","hipaa"], answer: () => "If SOX/HIPAA applies, choose the matching compliance option — it adds 15% effort uplift and flags the deal for QRM review." },
        { keys: ["integration"], answer: () => "Each integration above 2 adds ~5–10% effort. Document them now to avoid scope creep later." },
      ],
      "wizard-pricing": [
        { keys: ["rate","blended"], answer: (c) => `Blended rate is computed from role hours × role rate cards. ${c.deal?.totalFee ? `Current total fee: $${parseFloat(c.deal.totalFee).toLocaleString()}.` : ""}` },
        { keys: ["margin","advisor"], answer: () => "Run Margin Advisor to see recommended adjustments. Below 25% margin triggers an SLL approval gate." },
        { keys: ["role","mix","staff"], answer: () => "Adjust the role mix to shift hours from senior to mid-level for margin lift, or the reverse for delivery confidence." },
      ],
      "wizard-scenarios": [
        { keys: ["which","best","recommend"], answer: () => "Run AI Scenario Recommendation. Premium typically lifts margin +10pts vs Standard but reduces win probability by ~15%." },
        { keys: ["premium","value","standard"], answer: () => "Standard = baseline. Premium = senior-heavy mix, higher fee. Value = offshore-heavy mix, lower fee, tighter margin." },
      ],
      "wizard-review": [
        { keys: ["risk","intapp","screen"], answer: () => "Run Intapp screening before submitting. High-risk findings require QRM mitigation notes." },
        { keys: ["workday","cost center"], answer: () => "Link the Workday cost center so post-award accounting flows. Validation runs automatically on link." },
        { keys: ["submit","approval"], answer: () => "Submitting routes the deal to your Service Line Leader. They cannot edit — only approve, reject, or request rework." },
      ],
      "wizard-approval": [
        { keys: ["approve","reject","rework"], answer: () => "As SLL, you can Approve, Reject, or Request Rework. Rework returns the deal to the PDL with your notes — they can resubmit after edits." },
        { keys: ["margin","threshold"], answer: () => "Deals below 25% margin require explicit justification. Below 20% require a second approver." },
      ],
      "wizard-summary": [
        { keys: ["change order","amend"], answer: () => "Approved deals can have Change Orders added. Each CO captures incremental scope/fee and routes for re-approval." },
        { keys: ["export","pdf"], answer: () => "Use the Summary view as the canonical engagement record. PDF export is available from the action menu." },
      ],
      "new-deal": [
        { keys: ["renewal","fast"], answer: () => "Renewal Fast-Track clones the prior deal's scope, pricing, and assumptions, then opens the Renewal Leadsheet for PY vs CY review." },
        { keys: ["dynamics","crm","opportunity"], answer: () => "Linking a Dynamics opportunity auto-fills client, value, and notes — and keeps the deal bi-directionally synced with CRM." },
        { keys: ["client","new"], answer: () => "Add new clients from the Clients admin page first, then return here to scope a deal against them." },
      ],
      "renewal-leadsheet": [
        { keys: ["uplift","increase","raise"], answer: () => "Recommended renewal uplift is 4.2% (illustrative market avg). Apply per line or globally from the toolbar." },
        { keys: ["compare","prior","py"], answer: () => "PY columns are read-only snapshots from the source deal. CY columns are editable; deltas highlight changes >10%." },
      ],
    };

    let answer: string;
    let restricted = false;

    if (isReadOnly) {
      restricted = true;
      const altLines = (roleAlternatives[r] || []).map(a => `• ${a}`).join("\n");
      answer = `As ${caps.label}, you can view this screen but not make changes here. What you CAN do:\n${altLines}`;

      // Still try to answer informational questions
      const kb = screenKB[screen] || [];
      const matched = kb.find(t => t.keys.some(k => q.includes(k)));
      if (matched) {
        const info = matched.answer({ deal: context?.deal, totalHours: context?.totalHours });
        answer = `${info}\n\n(Read-only context for ${caps.label}.) What you CAN do here:\n${altLines}`;
      }
    } else if (isEditor) {
      const kb = screenKB[screen] || [];
      const matched = kb.find(t => t.keys.some(k => q.includes(k)));
      if (matched) {
        answer = matched.answer({ deal: context?.deal, totalHours: context?.totalHours });
      } else {
        const suggestions = (kb.slice(0, 3).map(t => `"${t.keys[0]}"`).join(", ")) || "the screen above";
        answer = `I'm not sure how to answer that for this screen. Try asking about: ${suggestions}, or use the suggested prompts below.`;
      }
    } else {
      answer = `Your role (${caps.label}) is not configured for this screen. What you CAN do:\n${(roleAlternatives[r] || []).map(a => `• ${a}`).join("\n")}`;
      restricted = true;
    }

    res.json({
      answer,
      role: r,
      capability: caps.label,
      screen,
      restricted,
      canPerform: isEditor,
      alternatives: isReadOnly || !isEditor ? (roleAlternatives[r] || []) : [],
      timestamp: new Date().toISOString(),
    });
  });

  // ========== CHANGE ORDERS ==========
  app.get("/api/deals/:dealId/change-orders", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const result = await db.select().from(changeOrders)
      .where(eq(changeOrders.dealId, dealId))
      .orderBy(desc(changeOrders.createdAt));
    res.json(result);
  });

  app.post("/api/deals/:dealId/change-orders", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const existingOrders = await db.select().from(changeOrders)
      .where(eq(changeOrders.dealId, dealId));
    const nextVersion = existingOrders.length + 1;

    const { title, description, changeType, newFee, newCost, newHours, scopeChanges, createdBy } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });

    const originalFee = parseFloat(deal.totalFee || "0");
    const originalCost = parseFloat(deal.totalCost || "0");
    const originalHours = parseFloat(deal.totalHours || "0");
    const nFee = newFee ? parseFloat(newFee) : originalFee;
    const nCost = newCost ? parseFloat(newCost) : originalCost;
    const nHours = newHours ? parseFloat(newHours) : originalHours;

    if (isNaN(nFee) || isNaN(nCost) || isNaN(nHours)) {
      return res.status(400).json({ error: "Fee, cost, and hours must be valid numbers" });
    }

    const [order] = await db.insert(changeOrders).values({
      dealId,
      version: nextVersion,
      title: title || `Change Order #${nextVersion}`,
      description,
      changeType: changeType || "scope_change",
      status: "draft",
      originalFee: String(originalFee),
      originalCost: String(originalCost),
      originalHours: String(originalHours),
      newFee: String(nFee),
      newCost: String(nCost),
      newHours: String(nHours),
      deltaFee: String(nFee - originalFee),
      deltaCost: String(nCost - originalCost),
      deltaHours: String(nHours - originalHours),
      scopeChanges: scopeChanges || null,
      createdBy: createdBy || "System",
    }).returning();

    await db.insert(activityLog).values({
      dealId,
      action: "change_order_created",
      description: `Change Order v${nextVersion}: ${title || "Scope Change"}`,
      userName: createdBy || "System",
    });

    res.json(order);
  });

  app.patch("/api/change-orders/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { status, approvedBy } = req.body;

    const allowedStatuses = ["approved", "rejected"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const order = await db.select().from(changeOrders).where(eq(changeOrders.id, id)).limit(1);
    if (!order.length) return res.status(404).json({ error: "Change order not found" });

    if (order[0].status !== "draft") {
      return res.status(400).json({ error: `Cannot update change order with status '${order[0].status}'` });
    }

    const updates: any = { status };
    if (approvedBy) updates.approvedBy = approvedBy;
    if (status === "approved") {
      updates.approvedAt = new Date();
      const co = order[0];
      const nFee = parseFloat(co.newFee || "0");
      const nCost = parseFloat(co.newCost || "0");
      const nHours = parseFloat(co.newHours || "0");
      const margin = nFee > 0 ? ((nFee - nCost) / nFee * 100) : 0;
      const blended = nHours > 0 ? nFee / nHours : 0;

      await db.update(deals).set({
        totalFee: String(nFee),
        totalCost: String(nCost),
        totalHours: String(nHours),
        marginPercent: String(margin.toFixed(2)),
        blendedRate: String(blended.toFixed(2)),
        updatedAt: new Date(),
      }).where(eq(deals.id, co.dealId));
    }

    const [updated] = await db.update(changeOrders).set(updates).where(eq(changeOrders.id, id)).returning();

    await db.insert(activityLog).values({
      dealId: updated.dealId,
      action: `change_order_${status}`,
      description: `Change Order v${updated.version} ${status}`,
      userName: approvedBy || "System",
    });

    res.json(updated);
  });

  // ========== ANALYTICS ==========
  app.get("/api/analytics/overview", async (_req: Request, res: Response) => {
    const allDeals = await db.query.deals.findMany({ with: { client: true, approvals: true } });
    const allApprovals = await db.select().from(approvals);

    const totalDeals = allDeals.length;
    const approvedDeals = allDeals.filter(d => d.status === "approved");
    const rejectedDeals = allDeals.filter(d => d.status === "rejected");
    const submittedDeals = allDeals.filter(d => d.status === "submitted");
    const draftDeals = allDeals.filter(d => d.status === "draft");

    const winRate = totalDeals > 0 ? ((approvedDeals.length / Math.max(approvedDeals.length + rejectedDeals.length, 1)) * 100).toFixed(1) : "0";

    const serviceLines = [...new Set(allDeals.map(d => d.serviceLine).filter(Boolean))];
    const serviceLineBreakdown = serviceLines.map(sl => {
      const slDeals = allDeals.filter(d => d.serviceLine === sl);
      const slApproved = slDeals.filter(d => d.status === "approved");
      const totalFee = slDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0);
      const avgMargin = slDeals.length > 0
        ? (slDeals.reduce((s, d) => s + parseFloat(d.marginPercent || "0"), 0) / slDeals.length).toFixed(1)
        : "0";
      return {
        serviceLine: sl,
        totalDeals: slDeals.length,
        approvedDeals: slApproved.length,
        winRate: slDeals.length > 0 ? ((slApproved.length / Math.max(slApproved.length + slDeals.filter(d => d.status === "rejected").length, 1)) * 100).toFixed(1) : "0",
        totalFee,
        avgMargin,
      };
    });

    const marginDistribution = [
      { range: "< 15%", count: allDeals.filter(d => parseFloat(d.marginPercent || "0") < 15).length },
      { range: "15-20%", count: allDeals.filter(d => { const m = parseFloat(d.marginPercent || "0"); return m >= 15 && m < 20; }).length },
      { range: "20-25%", count: allDeals.filter(d => { const m = parseFloat(d.marginPercent || "0"); return m >= 20 && m < 25; }).length },
      { range: "25-30%", count: allDeals.filter(d => { const m = parseFloat(d.marginPercent || "0"); return m >= 25 && m < 30; }).length },
      { range: "30%+", count: allDeals.filter(d => parseFloat(d.marginPercent || "0") >= 30).length },
    ];

    const avgCycleTime = (() => {
      const completedDeals = allDeals.filter(d => d.status === "approved" || d.status === "rejected");
      if (completedDeals.length === 0) return 0;
      const totalDays = completedDeals.reduce((sum, d) => {
        const created = new Date(d.createdAt).getTime();
        const updated = new Date(d.updatedAt).getTime();
        return sum + Math.max(1, Math.round((updated - created) / (1000 * 60 * 60 * 24)));
      }, 0);
      return Math.round(totalDays / completedDeals.length);
    })();

    const complexityBreakdown = [
      { complexity: "Low", count: allDeals.filter(d => d.complexity === "low").length },
      { complexity: "Medium", count: allDeals.filter(d => d.complexity === "medium").length },
      { complexity: "High", count: allDeals.filter(d => d.complexity === "high").length },
      { complexity: "Very High", count: allDeals.filter(d => d.complexity === "very_high").length },
    ];

    const pipelineSummary = {
      draft: { count: draftDeals.length, totalFee: draftDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0) },
      submitted: { count: submittedDeals.length, totalFee: submittedDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0) },
      approved: { count: approvedDeals.length, totalFee: approvedDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0) },
      rejected: { count: rejectedDeals.length, totalFee: rejectedDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0) },
    };

    const totalPipeline = allDeals.reduce((s, d) => s + parseFloat(d.totalFee || "0"), 0);
    const avgMargin = totalDeals > 0
      ? (allDeals.reduce((s, d) => s + parseFloat(d.marginPercent || "0"), 0) / totalDeals).toFixed(1)
      : "0";
    const avgDealSize = totalDeals > 0 ? (totalPipeline / totalDeals) : 0;

    const monthlyTrend = (() => {
      const months: { month: string; deals: number; revenue: number; avgMargin: string }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toLocaleString("default", { month: "short", year: "2-digit" });
        const monthDeals = allDeals.filter(deal => {
          const created = new Date(deal.createdAt);
          return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
        });
        months.push({
          month: monthStr,
          deals: monthDeals.length,
          revenue: monthDeals.reduce((s, deal) => s + parseFloat(deal.totalFee || "0"), 0),
          avgMargin: monthDeals.length > 0
            ? (monthDeals.reduce((s, deal) => s + parseFloat(deal.marginPercent || "0"), 0) / monthDeals.length).toFixed(1)
            : "0",
        });
      }
      return months;
    })();

    res.json({
      summary: {
        totalDeals,
        totalPipeline,
        avgMargin,
        avgDealSize,
        winRate,
        avgCycleTime,
        approvedCount: approvedDeals.length,
        rejectedCount: rejectedDeals.length,
      },
      pipelineSummary,
      serviceLineBreakdown,
      marginDistribution,
      complexityBreakdown,
      monthlyTrend,
    });
  });

  // ========== PROPOSAL GENERATION ==========
  app.get("/api/deals/:dealId/proposal", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: {
        client: true,
        scopeItems: { with: { scopeItem: true } },
        pricingLines: { with: { role: true } },
        scenarios: true,
        promptResponses: true,
        approvals: true,
      },
    });

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const scopeRows = (deal.scopeItems || []).map((si: any) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;">${escapeHtml(si.scopeItem?.name) || "N/A"}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;">${escapeHtml(si.scopeItem?.category)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">${si.adjustedHours || si.scopeItem?.defaultHours || "0"} hrs</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:center;">${si.complexityMultiplier || "1.0"}x</td>
      </tr>
    `).join("");

    const pricingRows = (deal.pricingLines || [])
      .filter((pl: any) => !pl.scenarioId)
      .map((pl: any) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;">${pl.role?.name || "Role"}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">${parseFloat(pl.hours || "0").toFixed(1)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">$${parseFloat(pl.rate || "0").toFixed(0)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;font-weight:600;">$${parseFloat(pl.fee || "0").toLocaleString()}</td>
      </tr>
    `).join("");

    const scenarioRows = (deal.scenarios || []).map((sc: any) => `
      <tr style="${sc.isRecommended ? "background:#fef7ed;" : ""}">
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;font-weight:${sc.isRecommended ? "700" : "400"};">
          ${sc.name}${sc.isRecommended ? " (Recommended)" : ""}
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">$${parseFloat(sc.totalFee || "0").toLocaleString()}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">${parseFloat(sc.totalHours || "0").toFixed(0)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;text-align:right;">${parseFloat(sc.marginPercent || "0").toFixed(1)}%</td>
      </tr>
    `).join("");

    const assumptions = (deal.promptResponses || [])
      .filter((p: any) => p.answer)
      .map((p: any) => `<li style="margin-bottom:8px;font-size:14px;"><strong>${escapeHtml(p.question)}</strong><br/><span style="color:#57534e;">${escapeHtml(p.answer)}</span></li>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Proposal - ${escapeHtml(deal.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; color:#1c1917; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <div style="max-width:800px;margin:0 auto;padding:40px;">
    <!-- Header -->
    <div style="border-bottom:4px solid #DA720F;padding-bottom:32px;margin-bottom:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:48px;height:48px;background:#DA720F;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-weight:700;font-size:20px;">D</span>
            </div>
            <div>
              <h3 style="font-size:18px;font-weight:700;color:#1c1917;">DealPad</h3>
              <p style="font-size:12px;color:#78716c;">by Armanino LLP</p>
            </div>
          </div>
          <h1 style="font-size:28px;font-weight:700;color:#1c1917;margin-bottom:4px;">Engagement Proposal</h1>
          <p style="font-size:14px;color:#78716c;">Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:12px;color:#78716c;margin-bottom:4px;">Deal Number</p>
          <p style="font-size:16px;font-weight:700;color:#DA720F;">${escapeHtml(deal.dealNumber)}</p>
          <p style="font-size:12px;color:#78716c;margin-top:12px;">Status</p>
          <p style="font-size:14px;font-weight:600;text-transform:uppercase;">${escapeHtml(deal.status)}</p>
        </div>
      </div>
    </div>

    <!-- Deal Overview -->
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#DA720F;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Engagement Overview</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:#fafaf9;padding:16px;border-radius:12px;">
          <p style="font-size:12px;color:#78716c;margin-bottom:4px;">Engagement Title</p>
          <p style="font-size:15px;font-weight:600;">${escapeHtml(deal.title)}</p>
        </div>
        <div style="background:#fafaf9;padding:16px;border-radius:12px;">
          <p style="font-size:12px;color:#78716c;margin-bottom:4px;">Client</p>
          <p style="font-size:15px;font-weight:600;">${escapeHtml(deal.client?.name) || "N/A"}</p>
        </div>
        <div style="background:#fafaf9;padding:16px;border-radius:12px;">
          <p style="font-size:12px;color:#78716c;margin-bottom:4px;">Service Line</p>
          <p style="font-size:15px;font-weight:600;">${escapeHtml(deal.serviceLine) || "N/A"}</p>
        </div>
        <div style="background:#fafaf9;padding:16px;border-radius:12px;">
          <p style="font-size:12px;color:#78716c;margin-bottom:4px;">Engagement Period</p>
          <p style="font-size:15px;font-weight:600;">${escapeHtml(deal.startDate) || "TBD"} - ${escapeHtml(deal.endDate) || "TBD"}</p>
        </div>
      </div>
    </div>

    <!-- Financial Summary -->
    <div style="margin-bottom:32px;background:linear-gradient(135deg,#1c1917,#292524);border-radius:16px;padding:24px;color:#fff;">
      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#DA720F;margin-bottom:16px;">Financial Summary</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div>
          <p style="font-size:11px;color:#a8a29e;margin-bottom:4px;">Total Fee</p>
          <p style="font-size:22px;font-weight:700;">$${parseFloat(deal.totalFee || "0").toLocaleString()}</p>
        </div>
        <div>
          <p style="font-size:11px;color:#a8a29e;margin-bottom:4px;">Total Hours</p>
          <p style="font-size:22px;font-weight:700;">${parseFloat(deal.totalHours || "0").toFixed(0)}</p>
        </div>
        <div>
          <p style="font-size:11px;color:#a8a29e;margin-bottom:4px;">Blended Rate</p>
          <p style="font-size:22px;font-weight:700;">$${parseFloat(deal.blendedRate || "0").toFixed(0)}</p>
        </div>
        <div>
          <p style="font-size:11px;color:#a8a29e;margin-bottom:4px;">Margin</p>
          <p style="font-size:22px;font-weight:700;color:${parseFloat(deal.marginPercent || "0") >= 25 ? "#4ade80" : parseFloat(deal.marginPercent || "0") >= 15 ? "#DA720F" : "#ef4444"};">${parseFloat(deal.marginPercent || "0").toFixed(1)}%</p>
        </div>
      </div>
    </div>

    <!-- Scope of Work -->
    ${scopeRows ? `
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#DA720F;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Scope of Work</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f5f4;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Deliverable</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Category</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Hours</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Complexity</th>
          </tr>
        </thead>
        <tbody>${scopeRows}</tbody>
      </table>
    </div>` : ""}

    <!-- Pricing Breakdown -->
    ${pricingRows ? `
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#DA720F;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Pricing Breakdown</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f5f4;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Role</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Hours</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Rate</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Fee</th>
          </tr>
        </thead>
        <tbody>${pricingRows}</tbody>
      </table>
    </div>` : ""}

    <!-- Scenarios -->
    ${scenarioRows ? `
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#DA720F;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Pricing Scenarios</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f5f4;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Scenario</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Total Fee</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Hours</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;">Margin</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>
    </div>` : ""}

    <!-- Assumptions -->
    ${assumptions ? `
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#DA720F;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em;">Key Assumptions</h2>
      <ul style="list-style:none;padding:0;">${assumptions}</ul>
    </div>` : ""}

    <!-- Footer -->
    <div style="border-top:2px solid #e7e5e4;padding-top:24px;margin-top:40px;text-align:center;">
      <p style="font-size:12px;color:#78716c;">This proposal was generated by DealPad - NextGenApp Pricing & Scoping 2.0</p>
      <p style="font-size:12px;color:#a8a29e;margin-top:4px;">Armanino LLP | Confidential</p>
    </div>
  </div>
</body>
</html>`;

    if (req.query.format === "json") {
      res.json({
        deal: {
          id: deal.id,
          dealNumber: deal.dealNumber,
          title: deal.title,
          status: deal.status,
          client: deal.client?.name,
          serviceLine: deal.serviceLine,
          totalFee: deal.totalFee,
          totalCost: deal.totalCost,
          totalHours: deal.totalHours,
          marginPercent: deal.marginPercent,
          blendedRate: deal.blendedRate,
        },
        scopeItems: deal.scopeItems?.length || 0,
        pricingLines: deal.pricingLines?.filter((pl: any) => !pl.scenarioId).length || 0,
        scenarios: deal.scenarios?.length || 0,
      });
    } else {
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    }
  });
}
