/**
 * F2.2.2 — BudgetMonitorService.
 *
 * Computes budgeted vs actual for a deal over a period, writes a
 * `budget_actuals` snapshot, and fires `budget_alerts` when a
 * configured threshold is breached.
 *
 * Until F2.3 lands the time-entries table, "actuals" are derived
 * heuristically from the deal's pricing lines + a usage factor
 * (defaulting to 1.0 — same as budget). The interface is stable
 * so F2.3 can swap the actuals source without touching callers.
 *
 * Threshold rules (DEFAULT_THRESHOLDS):
 *   - over_budget    fires when (actual / budgeted * 100) >= 110%
 *   - near_budget    fires when (actual / budgeted * 100) >= 90% AND < 110%
 *   - burn_rate      fires when fee variance >= 15% on a *single* period
 *
 * The service is dedup-safe: it won't insert a duplicate open
 * alert for (deal, kind, metric) — the existing one stays, with
 * its `observed` field bumped to the latest reading.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  budgetActuals,
  budgetAlerts,
  deals,
  pricingLines,
} from "../../shared/schema";

export type BudgetThresholds = {
  /** "Over budget" — fires when actual / budgeted * 100 ≥ this. Default 110. */
  overBudgetPct: number;
  /** "Near budget" — fires when actual / budgeted * 100 ≥ this. Default 90. */
  nearBudgetPct: number;
  /** "Burn rate" — fires when fee variance ≥ this on a single period. Default 15. */
  burnRatePct: number;
};

export const DEFAULT_THRESHOLDS: BudgetThresholds = {
  overBudgetPct: 110,
  nearBudgetPct: 90,
  burnRatePct: 15,
};

export interface BudgetSnapshot {
  dealId: number;
  periodStart: Date;
  periodEnd: Date;
  hoursBudgeted: number;
  hoursActual: number;
  hoursVarPct: number | null;
  costBudgeted: number;
  costActual: number;
  costVarPct: number | null;
  feeBudgeted: number;
  feeActual: number;
  feeVarPct: number | null;
}

export interface BudgetAlert {
  kind: "over_budget" | "near_budget" | "burn_rate" | "margin_drop";
  metric: "hours" | "cost" | "fee" | "margin";
  threshold: number;
  observed: number;
  message: string;
}

/**
 * Pure: variance percent. `null` if the budget is zero (avoids
 * divide-by-zero garbage flooding the dashboard).
 */
export function variancePct(actual: number, budgeted: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(budgeted)) return null;
  if (budgeted === 0) return null;
  return ((actual - budgeted) / budgeted) * 100;
}

/**
 * Pure: which alerts to fire given a snapshot + thresholds.
 * Returns one alert per metric that breaches; never duplicates.
 */
export function evaluateAlerts(
  snapshot: BudgetSnapshot,
  thresholds: BudgetThresholds = DEFAULT_THRESHOLDS,
): BudgetAlert[] {
  const out: BudgetAlert[] = [];
  const metrics: Array<{
    metric: BudgetAlert["metric"];
    actual: number;
    budgeted: number;
  }> = [
    { metric: "hours", actual: snapshot.hoursActual, budgeted: snapshot.hoursBudgeted },
    { metric: "cost", actual: snapshot.costActual, budgeted: snapshot.costBudgeted },
    { metric: "fee", actual: snapshot.feeActual, budgeted: snapshot.feeBudgeted },
  ];

  for (const m of metrics) {
    if (m.budgeted <= 0) continue;
    const pct = (m.actual / m.budgeted) * 100;
    if (pct >= thresholds.overBudgetPct) {
      out.push({
        kind: "over_budget",
        metric: m.metric,
        threshold: thresholds.overBudgetPct,
        observed: round2(pct),
        message: `${m.metric} at ${round2(pct)}% of budget (threshold ${thresholds.overBudgetPct}%)`,
      });
    } else if (pct >= thresholds.nearBudgetPct) {
      out.push({
        kind: "near_budget",
        metric: m.metric,
        threshold: thresholds.nearBudgetPct,
        observed: round2(pct),
        message: `${m.metric} at ${round2(pct)}% of budget (approaching ${thresholds.overBudgetPct}%)`,
      });
    }
  }

  // Burn-rate is a fee-variance check on a single period — fires when
  // fee variance is materially negative (over budget) past threshold.
  if (
    snapshot.feeVarPct != null &&
    Math.abs(snapshot.feeVarPct) >= thresholds.burnRatePct &&
    snapshot.feeActual > snapshot.feeBudgeted
  ) {
    out.push({
      kind: "burn_rate",
      metric: "fee",
      threshold: thresholds.burnRatePct,
      observed: round2(Math.abs(snapshot.feeVarPct)),
      message: `Fee variance is ${round2(snapshot.feeVarPct!)}% over budget on this period (threshold ${thresholds.burnRatePct}%)`,
    });
  }

  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute a snapshot for one deal over (periodStart, periodEnd).
 *
 * Source of truth:
 *   - `hoursBudgeted` / `costBudgeted` / `feeBudgeted` come from
 *     pricing_lines (sum across roles).
 *   - `*Actual` are derived heuristically until F2.3 lands time
 *     entries. For now: if the deal is approved AND fully past its
 *     end date, actuals = budget × `usageFactor` (caller-supplied,
 *     default 1.0). Otherwise actuals = 0 (no work logged yet).
 */
export async function computeBudgetSnapshot(input: {
  dealId: number;
  periodStart: Date;
  periodEnd: Date;
  usageFactor?: number;
}): Promise<BudgetSnapshot | null> {
  const { dealId, periodStart, periodEnd } = input;
  const usageFactor = Number.isFinite(input.usageFactor)
    ? Math.max(0, input.usageFactor as number)
    : 1.0;

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return null;

  const lines = await db
    .select({
      hours: pricingLines.hours,
      rate: pricingLines.rate,
      cost: pricingLines.cost,
      fee: pricingLines.fee,
    })
    .from(pricingLines)
    .where(eq(pricingLines.dealId, dealId));

  const hoursBudgeted = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
  const costBudgeted = lines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
  const feeBudgeted = lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);

  // Heuristic actuals — replaced by time-entries sum once F2.3 lands.
  const isPastEnd =
    deal.endDate != null && new Date(deal.endDate) <= periodEnd;
  const factor = deal.status === "approved" && isPastEnd ? usageFactor : 0;
  const hoursActual = hoursBudgeted * factor;
  const costActual = costBudgeted * factor;
  const feeActual = feeBudgeted * factor;

  return {
    dealId,
    periodStart,
    periodEnd,
    hoursBudgeted: round2(hoursBudgeted),
    hoursActual: round2(hoursActual),
    hoursVarPct: variancePct(hoursActual, hoursBudgeted),
    costBudgeted: round2(costBudgeted),
    costActual: round2(costActual),
    costVarPct: variancePct(costActual, costBudgeted),
    feeBudgeted: round2(feeBudgeted),
    feeActual: round2(feeActual),
    feeVarPct: variancePct(feeActual, feeBudgeted),
  };
}

/**
 * Persist a snapshot, evaluate alerts, and dedup-insert any new
 * ones. Returns the snapshot row + the alerts array (empty if none).
 *
 * Dedup rule: only one open alert per (dealId, kind, metric). If
 * an open alert already exists, we update its `observed` + bump
 * `created_at` so dashboards show the latest reading; we don't
 * insert a new row.
 */
export async function persistAndAlert(input: {
  dealId: number;
  periodStart: Date;
  periodEnd: Date;
  usageFactor?: number;
  thresholds?: BudgetThresholds;
}): Promise<{
  snapshot: BudgetSnapshot;
  actualsRowId: number;
  alerts: Array<BudgetAlert & { id: number; deduped: boolean }>;
} | null> {
  const snapshot = await computeBudgetSnapshot(input);
  if (!snapshot) return null;

  const [actualsRow] = await db
    .insert(budgetActuals)
    .values({
      dealId: snapshot.dealId,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      hoursBudgeted: String(snapshot.hoursBudgeted),
      hoursActual: String(snapshot.hoursActual),
      hoursVarPct: snapshot.hoursVarPct == null ? null : String(round2(snapshot.hoursVarPct)),
      costBudgeted: String(snapshot.costBudgeted),
      costActual: String(snapshot.costActual),
      costVarPct: snapshot.costVarPct == null ? null : String(round2(snapshot.costVarPct)),
      feeBudgeted: String(snapshot.feeBudgeted),
      feeActual: String(snapshot.feeActual),
      feeVarPct: snapshot.feeVarPct == null ? null : String(round2(snapshot.feeVarPct)),
    })
    .returning();

  const alerts = evaluateAlerts(snapshot, input.thresholds);
  const out: Array<BudgetAlert & { id: number; deduped: boolean }> = [];

  for (const a of alerts) {
    const [existing] = await db
      .select({ id: budgetAlerts.id })
      .from(budgetAlerts)
      .where(
        and(
          eq(budgetAlerts.dealId, snapshot.dealId),
          eq(budgetAlerts.kind, a.kind),
          eq(budgetAlerts.metric, a.metric),
          eq(budgetAlerts.status, "open"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(budgetAlerts)
        .set({
          observed: String(a.observed),
          message: a.message,
          createdAt: new Date(),
        })
        .where(eq(budgetAlerts.id, existing.id));
      out.push({ ...a, id: existing.id, deduped: true });
    } else {
      const [created] = await db
        .insert(budgetAlerts)
        .values({
          dealId: snapshot.dealId,
          kind: a.kind,
          metric: a.metric,
          threshold: String(a.threshold),
          observed: String(a.observed),
          message: a.message,
          metadata: {
            actualsRowId: actualsRow.id,
            periodStart: snapshot.periodStart.toISOString(),
            periodEnd: snapshot.periodEnd.toISOString(),
          },
        })
        .returning();
      out.push({ ...a, id: created.id, deduped: false });
    }
  }

  return { snapshot, actualsRowId: actualsRow.id, alerts: out };
}

/**
 * Bulk monitor across every deal in a status set. Used by the
 * cron-style sweeper. Returns counts.
 */
export async function monitorAll(input: {
  periodStart: Date;
  periodEnd: Date;
  statusFilter?: string[]; // default ['approved']
  usageFactor?: number;
  thresholds?: BudgetThresholds;
}): Promise<{ scanned: number; snapshots: number; alertsFired: number; alertsDeduped: number }> {
  const statuses = input.statusFilter ?? ["approved"];
  const rows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(inArray(deals.status, statuses));

  let snapshots = 0;
  let alertsFired = 0;
  let alertsDeduped = 0;
  for (const r of rows) {
    const out = await persistAndAlert({
      dealId: r.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      usageFactor: input.usageFactor,
      thresholds: input.thresholds,
    });
    if (out) {
      snapshots++;
      for (const a of out.alerts) (a.deduped ? alertsDeduped++ : alertsFired++);
    }
  }
  return { scanned: rows.length, snapshots, alertsFired, alertsDeduped };
}
