// F1.3 — Batch renewal orchestrator (TS-side).
//
// One run looks like:
//   1. Operator picks a source filter (e.g. "all approved Tax-Corporate
//      deals from FY2026") and a list of adjustment rules.
//   2. createJob() inserts batch_renewal_jobs + batch_renewal_items rows.
//   3. runJob() iterates items synchronously: clone the source deal,
//      apply the rules, recompute totals via the F0.5 pricing engine,
//      compute variance vs the source deal, set status to 'completed'
//      or 'flagged' depending on threshold.
//
// The whole thing is intentionally synchronous TS for batches up to ~100
// deals (BACKLOG done-when target). Slice 5 adds a Python+Celery worker
// for production-scale parallelism; the orchestrator gains an enqueue
// path then but the variance math + rule application live here so both
// code paths share the same semantics.
//
// Pure helpers live at the bottom of the file (computeVariance,
// applyAdjustmentRule); they are exported so vitest can pin them
// without spinning up the DB.

import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  batchRenewalJobs, batchRenewalItems, batchAdjustmentRules,
  deals, dealEntities, dealScopeItems, pricingLines, scenarios,
} from "../../shared/schema";
import { recalcPricingFromScope, persistDealTotals } from "./pricing";

// --- Pure helpers -----------------------------------------------------

export type AdjustmentRuleType =
  | "rate_uplift"
  | "hour_adjustment"
  | "margin_target_override"
  | "tech_admin_fee_override";

export type AdjustmentRule = {
  id: number;
  name: string;
  ruleType: AdjustmentRuleType;
  parameters: Record<string, any>;
  isActive?: boolean;
};

export type DealTotalsLite = {
  totalFee: number;
  totalCost: number;
  totalHours: number;
};

export type VarianceResult = {
  feePct: number;          // (new.fee - old.fee) / old.fee × 100
  costPct: number;
  hoursPct: number;
  // The signed pct most likely to trip the threshold — used to decide
  // flagged vs completed. Worst-case is the absolute-largest of the three.
  worstPct: number;
  reason: string;          // human-readable summary
};

/**
 * Compute the renewal-vs-source variance. Returns positive percentages
 * for increases and negative for decreases. When the source totals are
 * zero (a fresh deal with no pricing yet), returns 0% — the caller
 * shouldn't flag those.
 */
export function computeVariance(prev: DealTotalsLite, next: DealTotalsLite): VarianceResult {
  const safePct = (oldV: number, newV: number): number => {
    if (oldV === 0) return 0;
    return ((newV - oldV) / oldV) * 100;
  };
  const feePct = safePct(prev.totalFee, next.totalFee);
  const costPct = safePct(prev.totalCost, next.totalCost);
  const hoursPct = safePct(prev.totalHours, next.totalHours);
  const worstPct = [feePct, costPct, hoursPct].reduce(
    (acc, v) => (Math.abs(v) > Math.abs(acc) ? v : acc),
    0,
  );
  const reason =
    `fee Δ ${feePct.toFixed(1)}% (${prev.totalFee.toFixed(0)} → ${next.totalFee.toFixed(0)}); ` +
    `cost Δ ${costPct.toFixed(1)}%; hours Δ ${hoursPct.toFixed(1)}%`;
  return { feePct, costPct, hoursPct, worstPct, reason };
}

/**
 * Whether the variance trips the job's threshold. Threshold is an
 * absolute percentage; matches BACKLOG default of 10%.
 */
export function exceedsThreshold(variance: VarianceResult, thresholdPct: number): boolean {
  return Math.abs(variance.worstPct) >= thresholdPct;
}

// Mutation shape returned by applyAdjustmentRule. Pure: returns the
// changes the orchestrator should apply, doesn't talk to the DB.
export type AdjustmentEffect = {
  // Per-line multipliers — applied to every pricing_line row.
  ratesMultiplier?: number;
  hoursMultiplier?: number;
  // Deal-level overrides.
  targetMarginPercent?: number;          // sets deals.target_margin_percent
  engagementInputsPatch?: Record<string, any>;  // merged into deals.engagement_inputs
  // For audit / variance reason text.
  description: string;
};

export function applyAdjustmentRule(rule: AdjustmentRule): AdjustmentEffect {
  if (rule.isActive === false) {
    return { description: `(rule "${rule.name}" inactive — skipped)` };
  }
  switch (rule.ruleType) {
    case "rate_uplift": {
      const factor = parseFiniteNumber(rule.parameters?.factor, 1.0);
      return {
        ratesMultiplier: factor,
        description: `rate uplift × ${factor}`,
      };
    }
    case "hour_adjustment": {
      const factor = parseFiniteNumber(rule.parameters?.factor, 1.0);
      return {
        hoursMultiplier: factor,
        description: `hours × ${factor}`,
      };
    }
    case "margin_target_override": {
      const percent = parseFiniteNumber(rule.parameters?.percent, 0);
      return {
        targetMarginPercent: percent,
        description: `target margin → ${percent}%`,
      };
    }
    case "tech_admin_fee_override": {
      const percent = parseFiniteNumber(rule.parameters?.percent, 0);
      return {
        engagementInputsPatch: { techAdminFeePct: String(percent) },
        description: `tech-admin fee → ${percent}%`,
      };
    }
    default: {
      // Unknown rule — return a no-op rather than throwing so a
      // mis-configured rule doesn't take down a 100-deal batch. The
      // operator sees the description in the variance reason text.
      return { description: `unknown rule type "${(rule as any).ruleType}" — skipped` };
    }
  }
}

function parseFiniteNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Compose multiple effects into one. Multipliers compound; deal-level
 * overrides apply in rule order with later rules winning.
 */
export function composeEffects(effects: AdjustmentEffect[]): AdjustmentEffect {
  let ratesMultiplier = 1.0;
  let hoursMultiplier = 1.0;
  let targetMarginPercent: number | undefined;
  let engagementInputsPatch: Record<string, any> = {};
  const descriptions: string[] = [];
  for (const e of effects) {
    if (e.ratesMultiplier != null) ratesMultiplier *= e.ratesMultiplier;
    if (e.hoursMultiplier != null) hoursMultiplier *= e.hoursMultiplier;
    if (e.targetMarginPercent != null) targetMarginPercent = e.targetMarginPercent;
    if (e.engagementInputsPatch) engagementInputsPatch = { ...engagementInputsPatch, ...e.engagementInputsPatch };
    descriptions.push(e.description);
  }
  return {
    ratesMultiplier: ratesMultiplier === 1.0 ? undefined : ratesMultiplier,
    hoursMultiplier: hoursMultiplier === 1.0 ? undefined : hoursMultiplier,
    targetMarginPercent,
    engagementInputsPatch: Object.keys(engagementInputsPatch).length === 0 ? undefined : engagementInputsPatch,
    description: descriptions.join("; ") || "no-op",
  };
}

// --- Orchestrator (DB-bound) ------------------------------------------

export type CreateJobInput = {
  name: string;
  sourceFilter?: Record<string, any>;
  sourceDealIds: number[];          // resolved upstream from sourceFilter
  varianceThresholdPct?: number;    // default 10
  adjustmentRuleIds?: number[];
  notes?: string;
  createdBy: string;
};

export async function createBatchRenewalJob(input: CreateJobInput): Promise<{
  jobId: number;
  itemCount: number;
}> {
  if (input.sourceDealIds.length === 0) {
    throw new Error("Cannot create a batch with zero source deals");
  }
  const [job] = await db.insert(batchRenewalJobs).values({
    name: input.name,
    status: "pending",
    sourceFilter: input.sourceFilter ?? null,
    totalItems: input.sourceDealIds.length,
    varianceThresholdPct: String(input.varianceThresholdPct ?? 10),
    adjustmentRuleIds: input.adjustmentRuleIds ?? [],
    notes: input.notes,
    createdBy: input.createdBy,
  }).returning();

  // Bulk insert items — onConflictDoNothing on (job_id, source_deal_id)
  // so duplicate source ids in the input array don't crash the insert.
  const rows = input.sourceDealIds.map((sourceDealId) => ({
    jobId: job.id, sourceDealId, status: "pending" as const,
  }));
  await db.insert(batchRenewalItems).values(rows)
    .onConflictDoNothing({ target: [batchRenewalItems.jobId, batchRenewalItems.sourceDealId] });

  return { jobId: job.id, itemCount: input.sourceDealIds.length };
}

/**
 * Run a job to completion synchronously. Per-item failures are
 * recorded but never abort the whole job. Returns counts so the
 * route layer can surface a summary in the response.
 *
 * Idempotent enough to retry: if an item already has status
 * 'completed' or 'flagged', it's skipped on a second run.
 */
export async function runBatchRenewalJob(jobId: number, actorName: string): Promise<{
  processed: number;
  flagged: number;
  failed: number;
}> {
  const [job] = await db.select().from(batchRenewalJobs).where(eq(batchRenewalJobs.id, jobId));
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status === "running") {
    throw new Error(`Job ${jobId} is already running`);
  }

  await db.update(batchRenewalJobs).set({
    status: "running", startedAt: new Date(), updatedAt: new Date(),
  }).where(eq(batchRenewalJobs.id, jobId));

  // Resolve adjustment rules once for the whole job.
  const ruleIds = Array.isArray(job.adjustmentRuleIds) ? (job.adjustmentRuleIds as number[]) : [];
  const rules: AdjustmentRule[] = ruleIds.length === 0 ? [] :
    (await db.select().from(batchAdjustmentRules).where(inArray(batchAdjustmentRules.id, ruleIds)))
      .map((r) => ({
        id: r.id,
        name: r.name,
        ruleType: r.ruleType as AdjustmentRuleType,
        parameters: (r.parameters as Record<string, any>) || {},
        isActive: r.isActive ?? true,
      }));
  const composed = composeEffects(rules.map(applyAdjustmentRule));
  const threshold = parseFloat(job.varianceThresholdPct);

  // Process pending items in id order for stable progress.
  const items = await db.select().from(batchRenewalItems)
    .where(and(eq(batchRenewalItems.jobId, jobId), eq(batchRenewalItems.status, "pending")));

  let processed = 0;
  let flagged = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await db.update(batchRenewalItems).set({ status: "running" })
        .where(eq(batchRenewalItems.id, item.id));

      // actorName forwarded to processOneItem for slice 5's audit-log writes.
      const result = await processOneItem(item.sourceDealId, composed, actorName);
      const variance = computeVariance(result.sourceTotals, result.newTotals);
      const isFlagged = exceedsThreshold(variance, threshold);

      await db.update(batchRenewalItems).set({
        status: isFlagged ? "flagged" : "completed",
        newDealId: result.newDealId,
        variancePct: variance.worstPct.toFixed(2),
        varianceReason: `${composed.description} | ${variance.reason}`,
        processedAt: new Date(),
      }).where(eq(batchRenewalItems.id, item.id));

      processed++;
      if (isFlagged) flagged++;
    } catch (e: any) {
      failed++;
      await db.update(batchRenewalItems).set({
        status: "failed",
        error: e?.message ?? String(e),
        processedAt: new Date(),
      }).where(eq(batchRenewalItems.id, item.id));
    }

    // Update job counters after each item so an operator polling the
    // status endpoint sees progress.
    await db.update(batchRenewalJobs).set({
      processedItems: processed,
      failedItems: failed,
      flaggedItems: flagged,
      updatedAt: new Date(),
    }).where(eq(batchRenewalJobs.id, jobId));
  }

  await db.update(batchRenewalJobs).set({
    status: failed > 0 && processed === 0 ? "failed" : "completed",
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(batchRenewalJobs.id, jobId));

  return { processed, flagged, failed };
}

type ProcessItemResult = {
  newDealId: number;
  sourceTotals: DealTotalsLite;
  newTotals: DealTotalsLite;
};

/**
 * Clone one source deal, apply the composed effects, recompute totals.
 * Mirrors the existing /api/deals/:id/clone path's mutations but is
 * scoped to one deal in one function so the orchestrator's status
 * machine has a clean per-item boundary.
 */
async function processOneItem(
  sourceDealId: number,
  effects: AdjustmentEffect,
  // Reserved for slice 5's per-item activity_log writes; for now the
  // orchestrator-level write at runBatchRenewalJob's caller carries the
  // actor.
  _actorName: string,
): Promise<ProcessItemResult> {
  const [src] = await db.select().from(deals).where(eq(deals.id, sourceDealId));
  if (!src) throw new Error(`Source deal ${sourceDealId} not found`);

  const sourceTotals: DealTotalsLite = {
    totalFee: parseFloat(src.totalFee || "0"),
    totalCost: parseFloat(src.totalCost || "0"),
    totalHours: parseFloat(src.totalHours || "0"),
  };

  // Patch engagement_inputs first so recalc reads the right tech-admin fee.
  const newEngagementInputs = effects.engagementInputsPatch
    ? { ...((src.engagementInputs as any) || {}), ...effects.engagementInputsPatch }
    : (src.engagementInputs as any);

  // 1. Insert new deal row. deal_number must be unique — append "-RNW".
  const renewalNumber = `${src.dealNumber}-RNW-${Date.now()}`;
  const [newDeal] = await db.insert(deals).values({
    dealNumber: renewalNumber,
    title: `${src.title} (Renewal)`,
    clientId: src.clientId,
    status: "draft",
    dealType: "renewal",
    businessUnit: src.businessUnit,
    serviceLine: src.serviceLine,
    region: src.region,
    complexity: src.complexity ?? "medium",
    pdlName: src.pdlName,
    pdlEmail: src.pdlEmail,
    parentDealId: src.id,
    notes: `Auto-generated renewal of ${src.dealNumber} via batch job. ${effects.description}`,
    engagementInputs: newEngagementInputs,
    targetMarginPercent: effects.targetMarginPercent != null
      ? String(effects.targetMarginPercent)
      : src.targetMarginPercent,
  }).returning();

  // 2. Clone the deal's primary entity (F1.1 — every deal needs at
  // least one entity row, otherwise scope/pricing have nowhere to
  // attach).
  const [primary] = await db.insert(dealEntities).values({
    dealId: newDeal.id,
    name: "Primary Entity",
    isPrimary: true,
  }).returning();

  // 3. Clone scope items. Reset scenarios + pricing — we'll regenerate
  // pricing via recalcPricingFromScope below.
  const sourceScope = await db.select().from(dealScopeItems)
    .where(eq(dealScopeItems.dealId, src.id));
  if (sourceScope.length > 0) {
    await db.insert(dealScopeItems).values(sourceScope.map((s) => ({
      dealId: newDeal.id,
      scopeItemId: s.scopeItemId,
      quantity: s.quantity,
      adjustedHours: effects.hoursMultiplier && s.adjustedHours
        ? (parseFloat(s.adjustedHours) * effects.hoursMultiplier).toFixed(2)
        : s.adjustedHours,
      complexityMultiplier: s.complexityMultiplier,
      notes: s.notes,
      entityId: primary.id,
    })));
  }

  // 4. Clone pricing lines (recalc may overwrite, but we need the
  // role/standardRate baseline). Apply rate multiplier.
  const sourceLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, src.id));
  if (sourceLines.length > 0) {
    await db.insert(pricingLines).values(sourceLines.map((l) => {
      const oldRate = parseFloat(l.rate || "0");
      const oldStd = parseFloat(l.standardRate || l.rate || "0");
      const newRate = effects.ratesMultiplier ? oldRate * effects.ratesMultiplier : oldRate;
      const newStd = effects.ratesMultiplier ? oldStd * effects.ratesMultiplier : oldStd;
      const hours = parseFloat(l.hours || "0");
      const cost = parseFloat(l.costRate || "0") * hours;
      return {
        dealId: newDeal.id,
        roleId: l.roleId,
        scopeItemId: l.scopeItemId,
        hours: l.hours,
        rate: newRate.toFixed(2),
        standardRate: newStd.toFixed(2),
        costRate: l.costRate,
        fee: (newRate * hours).toFixed(2),
        cost: cost.toFixed(2),
        margin: (newRate * hours - cost).toFixed(2),
        entityId: primary.id,
      };
    }));
  }

  // 5. Recompute totals from the canonical pricing engine. Even if
  // the multipliers above are correct, this enforces the
  // rate × hours = fee invariant and writes deals.totalFee/Cost/Hours.
  await persistDealTotals(newDeal.id);

  // 6. Wipe scenarios; the scenarios generator runs lazily on first
  // visit to the Pricing step (matches recalcPricingFromScope's behaviour).
  await db.delete(scenarios).where(eq(scenarios.dealId, newDeal.id));

  const [refreshed] = await db.select().from(deals).where(eq(deals.id, newDeal.id));
  const newTotals: DealTotalsLite = {
    totalFee: parseFloat(refreshed?.totalFee || "0"),
    totalCost: parseFloat(refreshed?.totalCost || "0"),
    totalHours: parseFloat(refreshed?.totalHours || "0"),
  };

  return { newDealId: newDeal.id, sourceTotals, newTotals };
}

// Suppress unused import warnings until the recalcPricingFromScope
// integration in slice 5's Celery worker. persistDealTotals is the
// canonical post-write reconciler today.
void recalcPricingFromScope;
