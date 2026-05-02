/**
 * F3.6 — Rate optimizer (heuristic).
 *
 * Recommends per-role rate adjustments for a target window based on:
 *   - capacity utilization (Workday cost-center) — high util = uplift
 *   - approved-deal velocity (recent days) — proxy for demand
 *   - margin headroom — when target margins are missed, suggest uplift
 *
 * Pure evaluate() takes already-fetched stats; the routes layer
 * fetches and persists. ML model plugs in by replacing evaluate()
 * — interface stays the same.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  deals,
  rateCards,
  rateCardEntries,
  rateOptimizationRuns,
  workdayCostCenters,
} from "../../shared/schema";

export type OptimizerScope = "firm" | "bu" | "serviceLine" | "role";

export interface OptimizerStats {
  /** Capacity utilization (committed/total_budget) for the scope, 0..1+. */
  utilization: number;
  /** Approved-deal-count proxy (last 90d). */
  recentApprovedCount: number;
  /** Average margin observed vs target margin (decimal: 0.40 = 40%). */
  observedMargin: number;
  targetMargin: number;
  /**
   * Per-role current rate snapshot. Optimizer recommends a delta.
   * roleId → { roleName, currentRate (number, $) }
   */
  rates: Map<number, { roleName: string; currentRate: number }>;
}

export interface RoleRecommendation {
  roleId: number;
  roleName: string;
  currentRate: number;
  recommendedRate: number;
  deltaPct: number;
  drivers: string[];
}

export interface OptimizerOutcome {
  recommendation: Record<string, RoleRecommendation>; // keyed by roleId as string
  confidence: number;                                  // 0..1
  rationale: string;
}

const MAX_UPLIFT = 0.15;   // never recommend more than +15% from one run
const MAX_DOWNTICK = 0.10; // never recommend more than -10% from one run

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function evaluate(stats: OptimizerStats): OptimizerOutcome {
  const drivers: string[] = [];
  let suggestedDelta = 0;        // decimal (e.g. 0.05 = +5%)

  // Capacity utilization > 0.85 → push rates up
  if (stats.utilization >= 0.95) {
    suggestedDelta += 0.08;
    drivers.push(`Utilization at ${(stats.utilization * 100).toFixed(0)}% (≥95%) — strong demand`);
  } else if (stats.utilization >= 0.85) {
    suggestedDelta += 0.04;
    drivers.push(`Utilization at ${(stats.utilization * 100).toFixed(0)}% (≥85%) — moderate demand`);
  } else if (stats.utilization < 0.6) {
    suggestedDelta -= 0.03;
    drivers.push(`Utilization at ${(stats.utilization * 100).toFixed(0)}% (<60%) — soft demand`);
  }

  // Recent approved volume — strong velocity is +1pt; weak is -1pt.
  if (stats.recentApprovedCount >= 20) {
    suggestedDelta += 0.02;
    drivers.push(`${stats.recentApprovedCount} approved deals in last 90d — high velocity`);
  } else if (stats.recentApprovedCount <= 3) {
    suggestedDelta -= 0.01;
    drivers.push(`${stats.recentApprovedCount} approved deals in last 90d — low velocity`);
  }

  // Margin headroom: if observed < target by >5pt, suggest uplift to recover.
  const marginGap = stats.targetMargin - stats.observedMargin;
  if (marginGap > 0.05) {
    suggestedDelta += Math.min(0.05, marginGap);
    drivers.push(
      `Margin ${(stats.observedMargin * 100).toFixed(1)}% under target ${(stats.targetMargin * 100).toFixed(1)}% by ${(marginGap * 100).toFixed(1)}pt`,
    );
  } else if (marginGap < -0.05) {
    // Actuals exceeding target — stay put, no need to push rates.
    drivers.push(`Margin ${(stats.observedMargin * 100).toFixed(1)}% above target — no rate change needed`);
  }

  suggestedDelta = clamp(suggestedDelta, -MAX_DOWNTICK, MAX_UPLIFT);

  const recommendation: Record<string, RoleRecommendation> = {};
  for (const [roleId, info] of stats.rates) {
    const recommended = round2(info.currentRate * (1 + suggestedDelta));
    recommendation[String(roleId)] = {
      roleId,
      roleName: info.roleName,
      currentRate: round2(info.currentRate),
      recommendedRate: recommended,
      deltaPct: Math.round(suggestedDelta * 1000) / 10, // 1 decimal
      drivers: [...drivers],
    };
  }

  // Confidence proxy: fuller stats → higher confidence. Capacity > 0.5
  // and at least 5 approved deals = base 0.6; perfect inputs = 0.85.
  let confidence = 0.5;
  if (stats.rates.size > 0) confidence += 0.1;
  if (stats.recentApprovedCount > 0) confidence += 0.1;
  if (stats.utilization > 0) confidence += 0.05;
  if (stats.targetMargin > 0) confidence += 0.05;
  confidence = clamp(confidence, 0, 0.85);

  const directionWord =
    suggestedDelta > 0 ? "increase" : suggestedDelta < 0 ? "decrease" : "hold";
  const rationale = `Heuristic recommends ${directionWord} of ${(suggestedDelta * 100).toFixed(1)}% across ${stats.rates.size} role(s). ${drivers.length > 0 ? "Drivers: " + drivers.join("; ") : "No qualifying signals."}`;

  return { recommendation, confidence: Math.round(confidence * 1000) / 1000, rationale };
}

/**
 * Orchestrator: load the data for a given scope, evaluate, persist
 * a draft run. Caller decides whether to publish/apply.
 */
export async function runOptimizer(input: {
  scope: OptimizerScope;
  scopeKey: string | null;
  targetWindowStart: string; // YYYY-MM-DD
  targetWindowEnd: string;
  createdBy?: string;
}): Promise<typeof rateOptimizationRuns.$inferSelect> {
  // Capacity from Workday cost centers — sum committed / total_budget
  // for the scope. For 'firm' we sum all; for 'bu' we filter by BU.
  const ccs = await db.select().from(workdayCostCenters);
  const filtered = input.scope === "firm" || !input.scopeKey
    ? ccs
    : ccs.filter((c) => (c.businessUnit || "").toLowerCase() === input.scopeKey!.toLowerCase());
  const totalBudget = filtered.reduce((s, c) => s + parseFloat(c.totalBudget || "0"), 0);
  const committed = filtered.reduce((s, c) => s + parseFloat(c.committed || "0"), 0);
  const utilization = totalBudget > 0 ? committed / totalBudget : 0;

  // Recent approved deal count (last 90 days)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const approved = await db.select({ id: deals.id, marginPercent: deals.marginPercent, status: deals.status, updatedAt: deals.updatedAt }).from(deals);
  const recentApproved = approved.filter((d) => d.status === "approved" && (d.updatedAt as Date) >= cutoff);
  const observedMargin = recentApproved.length > 0
    ? recentApproved.reduce((s, d) => s + parseFloat(d.marginPercent || "0"), 0) / recentApproved.length / 100
    : 0;

  const targetMargin = 0.4; // 40% — placeholder until margin_targets per-scope read is wired

  // Current per-role rates from the latest active rate card
  const cards = await db.select().from(rateCards).where(eq(rateCards.isActive, true)).limit(1);
  const rates = new Map<number, { roleName: string; currentRate: number }>();
  if (cards.length > 0) {
    const cardId = cards[0].id;
    const entries = await db.select().from(rateCardEntries).where(eq(rateCardEntries.rateCardId, cardId));
    // Pull role names lazily — cheap join in the routes layer; here
    // we use roleId as the key + fallback name "Role #<id>".
    for (const e of entries) {
      rates.set(e.roleId, {
        roleName: `Role #${e.roleId}`,
        currentRate: parseFloat(e.rate || "0"),
      });
    }
  }

  const outcome = evaluate({
    utilization,
    recentApprovedCount: recentApproved.length,
    observedMargin,
    targetMargin,
    rates,
  });

  const [created] = await db.insert(rateOptimizationRuns).values({
    scope: input.scope,
    scopeKey: input.scopeKey,
    targetWindowStart: input.targetWindowStart,
    targetWindowEnd: input.targetWindowEnd,
    recommendation: outcome.recommendation,
    confidence: outcome.confidence.toFixed(3),
    rationale: outcome.rationale,
    status: "draft",
    createdBy: input.createdBy ?? null,
    metadata: {
      utilization: round2(utilization * 100),
      recentApprovedCount: recentApproved.length,
      observedMargin: round2(observedMargin * 100),
      targetMargin: round2(targetMargin * 100),
    },
  }).returning();
  return created;
}
