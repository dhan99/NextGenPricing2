/**
 * F3.3 — Scope creep detector (heuristic mode).
 *
 * Pure rules over deal + scope + change-order rows. ML score plugs
 * in as `confidence` on `evaluate()` results once available.
 *
 * Heuristics:
 *   - scope_growth       hours grew ≥ growthPct vs baseline
 *   - change_order_density ≥ N change orders in M days
 *   - burn_rate          fee-actual / fee-budget ≥ burnRatePct
 *   - margin_drift       deal margin < target by ≥ marginDropPct
 *   - stale_no_progress  submitted > stalenessDays ago, no decision
 *
 * `evaluate()` is pure (takes already-fetched data); the routes
 * layer fetches and calls. `runForDeal` orchestrates the fetch +
 * dedup-insert.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  budgetActuals,
  changeOrders,
  deals,
  dealScopeItems,
  scopeCreepSignals,
} from "../../shared/schema";

export interface CreepThresholds {
  scopeGrowthPct: number;          // default 25 — hours growth vs baseline
  changeOrdersInDays: { count: number; days: number }; // default 3 in 30
  burnRatePct: number;             // default 110 — actual/budget %
  marginDropPct: number;           // default 5 — points below target
  stalenessDays: number;           // default 30 — submitted but undecided
}

export const DEFAULT_THRESHOLDS: CreepThresholds = {
  scopeGrowthPct: 25,
  changeOrdersInDays: { count: 3, days: 30 },
  burnRatePct: 110,
  marginDropPct: 5,
  stalenessDays: 30,
};

export type SignalKind =
  | "scope_growth"
  | "change_order_density"
  | "burn_rate"
  | "margin_drift"
  | "stale_no_progress";

export type Severity = "low" | "medium" | "high";

export interface CreepSignal {
  kind: SignalKind;
  severity: Severity;
  confidence: number;     // 0..1
  message: string;
  evidence: Record<string, unknown>;
}

export interface DetectorInput {
  /** Deal row + a few derived stats. */
  deal: {
    id: number;
    status: string;
    submittedAt?: Date | null;
    targetMarginPercent?: string | number | null;
    marginPercent?: string | number | null;
    totalHours?: string | number | null;
    baselineHours?: string | number | null; // taken from earliest snapshot or initial estimate
  };
  /** Recent change orders (any status). */
  changeOrders: Array<{ id: number; createdAt: Date; status: string }>;
  /** Most recent budget snapshot (or null if none). */
  latestBudget: {
    feeBudgeted: string | number;
    feeActual: string | number;
    feeVarPct: string | number | null;
  } | null;
  /** Now (injectable for deterministic tests). */
  now?: Date;
}

function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Pure: produce signals from already-fetched data.
 */
export function evaluate(
  input: DetectorInput,
  thresholds: CreepThresholds = DEFAULT_THRESHOLDS,
): CreepSignal[] {
  const out: CreepSignal[] = [];
  const now = input.now ?? new Date();

  // scope_growth
  const totalHours = num(input.deal.totalHours);
  const baselineHours = num(input.deal.baselineHours);
  if (baselineHours > 0 && totalHours > 0) {
    const growthPct = ((totalHours - baselineHours) / baselineHours) * 100;
    if (growthPct >= thresholds.scopeGrowthPct) {
      const severity: Severity =
        growthPct >= thresholds.scopeGrowthPct * 2
          ? "high"
          : growthPct >= thresholds.scopeGrowthPct * 1.5
            ? "medium"
            : "low";
      out.push({
        kind: "scope_growth",
        severity,
        confidence: clamp01(0.5 + (growthPct - thresholds.scopeGrowthPct) / 200),
        message: `Total hours grew ${growthPct.toFixed(1)}% vs baseline (${baselineHours.toFixed(0)}h → ${totalHours.toFixed(0)}h)`,
        evidence: { totalHours, baselineHours, growthPct: Number(growthPct.toFixed(2)) },
      });
    }
  }

  // change_order_density
  const cutoff = now.getTime() - thresholds.changeOrdersInDays.days * 24 * 60 * 60 * 1000;
  const recentCos = input.changeOrders.filter((c) => c.createdAt.getTime() >= cutoff);
  if (recentCos.length >= thresholds.changeOrdersInDays.count) {
    const severity: Severity = recentCos.length >= thresholds.changeOrdersInDays.count * 2 ? "high" : "medium";
    out.push({
      kind: "change_order_density",
      severity,
      confidence: clamp01(0.4 + recentCos.length / 20),
      message: `${recentCos.length} change orders in the last ${thresholds.changeOrdersInDays.days} days (threshold ${thresholds.changeOrdersInDays.count})`,
      evidence: {
        recentChangeOrderCount: recentCos.length,
        windowDays: thresholds.changeOrdersInDays.days,
        ids: recentCos.map((c) => c.id),
      },
    });
  }

  // burn_rate
  if (input.latestBudget) {
    const feeBudget = num(input.latestBudget.feeBudgeted);
    const feeActual = num(input.latestBudget.feeActual);
    if (feeBudget > 0) {
      const pct = (feeActual / feeBudget) * 100;
      if (pct >= thresholds.burnRatePct) {
        const severity: Severity =
          pct >= thresholds.burnRatePct + 20 ? "high" : pct >= thresholds.burnRatePct + 10 ? "medium" : "low";
        out.push({
          kind: "burn_rate",
          severity,
          confidence: clamp01(0.5 + (pct - thresholds.burnRatePct) / 200),
          message: `Fee actual at ${pct.toFixed(1)}% of budget (threshold ${thresholds.burnRatePct}%)`,
          evidence: { feeBudget, feeActual, pct: Number(pct.toFixed(2)) },
        });
      }
    }
  }

  // margin_drift
  const target = num(input.deal.targetMarginPercent);
  const actual = num(input.deal.marginPercent);
  if (target > 0 && target - actual >= thresholds.marginDropPct) {
    const drop = target - actual;
    const severity: Severity = drop >= thresholds.marginDropPct * 3 ? "high" : drop >= thresholds.marginDropPct * 2 ? "medium" : "low";
    out.push({
      kind: "margin_drift",
      severity,
      confidence: clamp01(0.5 + drop / 50),
      message: `Margin ${actual.toFixed(1)}% is ${drop.toFixed(1)} points below target ${target.toFixed(1)}%`,
      evidence: { actualMarginPct: actual, targetMarginPct: target, dropPoints: Number(drop.toFixed(2)) },
    });
  }

  // stale_no_progress
  if (input.deal.status === "submitted" && input.deal.submittedAt) {
    const ageMs = now.getTime() - input.deal.submittedAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays >= thresholds.stalenessDays) {
      const severity: Severity = ageDays >= thresholds.stalenessDays * 2 ? "high" : "medium";
      out.push({
        kind: "stale_no_progress",
        severity,
        confidence: clamp01(0.5 + (ageDays - thresholds.stalenessDays) / 60),
        message: `Submitted ${ageDays.toFixed(0)} days ago without decision (threshold ${thresholds.stalenessDays}d)`,
        evidence: { ageDays: Number(ageDays.toFixed(1)) },
      });
    }
  }

  return out;
}

/**
 * Persist signals with dedup against open rows of the same kind.
 * Re-running on the same deal updates `confidence` + `message` on
 * the existing open row instead of inserting a duplicate.
 */
export async function persistSignals(
  dealId: number,
  signals: CreepSignal[],
): Promise<{ inserted: number; deduped: number }> {
  let inserted = 0;
  let deduped = 0;
  for (const s of signals) {
    const [existing] = await db
      .select({ id: scopeCreepSignals.id })
      .from(scopeCreepSignals)
      .where(
        and(
          eq(scopeCreepSignals.dealId, dealId),
          eq(scopeCreepSignals.kind, s.kind),
          eq(scopeCreepSignals.status, "open"),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(scopeCreepSignals)
        .set({
          confidence: s.confidence.toFixed(3),
          severity: s.severity,
          message: s.message,
          evidence: s.evidence,
        })
        .where(eq(scopeCreepSignals.id, existing.id));
      deduped++;
    } else {
      await db.insert(scopeCreepSignals).values({
        dealId,
        kind: s.kind,
        severity: s.severity,
        confidence: s.confidence.toFixed(3),
        message: s.message,
        evidence: s.evidence,
      });
      inserted++;
    }
  }
  return { inserted, deduped };
}

/**
 * Orchestrator: load the data, run evaluate(), dedup-persist.
 * Returns the signals (with persistence-row id flagged) so callers
 * can render or alert.
 */
export async function runForDeal(
  dealId: number,
  thresholds: CreepThresholds = DEFAULT_THRESHOLDS,
): Promise<{ signals: CreepSignal[]; inserted: number; deduped: number } | null> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return null;

  const cos = await db
    .select({ id: changeOrders.id, createdAt: changeOrders.createdAt, status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.dealId, dealId));

  const [budget] = await db
    .select({
      feeBudgeted: budgetActuals.feeBudgeted,
      feeActual: budgetActuals.feeActual,
      feeVarPct: budgetActuals.feeVarPct,
    })
    .from(budgetActuals)
    .where(eq(budgetActuals.dealId, dealId))
    .orderBy(desc(budgetActuals.periodEnd))
    .limit(1);

  // Baseline hours: the smallest deal_scope_items.adjustedHours sum
  // we've seen, falling back to the current value (no detection
  // until there's a baseline). For now use the current totalHours
  // as the baseline if no other source exists — production wiring
  // would store a baseline snapshot at deal-approval time.
  const scopeRows = await db
    .select({ adj: dealScopeItems.adjustedHours, qty: dealScopeItems.quantity })
    .from(dealScopeItems)
    .where(eq(dealScopeItems.dealId, dealId));
  const baselineHours = scopeRows.reduce((s, r) => s + num(r.adj) * (r.qty ?? 1), 0);

  const signals = evaluate({
    deal: {
      id: deal.id,
      status: deal.status,
      submittedAt: deal.updatedAt ?? null,    // proxy; F1.4 outbox could provide a real submitted_at later
      targetMarginPercent: deal.targetMarginPercent,
      marginPercent: deal.marginPercent,
      totalHours: deal.totalHours,
      baselineHours,
    },
    changeOrders: cos.map((c) => ({ id: c.id, createdAt: c.createdAt as Date, status: c.status })),
    latestBudget: budget
      ? {
          feeBudgeted: budget.feeBudgeted ?? "0",
          feeActual: budget.feeActual ?? "0",
          feeVarPct: budget.feeVarPct,
        }
      : null,
  }, thresholds);

  const persistResult = await persistSignals(dealId, signals);
  return { signals, ...persistResult };
}
