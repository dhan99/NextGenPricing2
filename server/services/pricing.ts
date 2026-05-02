// Pricing engine — single source of truth for deal-level totals derived from
// pricing lines + engagement inputs. Extracted from server/routes.ts in F0.5
// so the calc-parity golden test can call it from outside the route layer.
//
// Per-line invariant: rate × hours = fee (we never apply rounding to the per-
// line fee anymore — rounding is shown as an explicit footer line on the deal
// total instead, so users can always reconcile the grid by hand).

import { eq } from "drizzle-orm";
import { db } from "../db";
import { deals, dealEntities, pricingLines, roles, scenarios } from "../../shared/schema";
import { COMPLEX_TAX_ROLE_DISTRIBUTION, COMPLEX_TAX_SERVICE_LINE } from "../tax-template";

// Default Digital pyramid. Used by recalcPricingFromScope and (separately)
// by the agent-draft path in routes.ts, so it must stay exported.
export const ROLE_DISTRIBUTION: Record<string, number> = {
  "Partner": 0.07, "Managing Director": 0.10, "Senior Manager": 0.17,
  "Manager": 0.20, "Senior Consultant": 0.26, "Consultant": 0.13, "Analyst": 0.07,
};

export const COMPLEXITY_MULTIPLIERS: Record<string, number> = {
  low: 0.8, medium: 1.0, high: 1.2, very_high: 1.5,
};

export type DealTotals = {
  lineSubtotalFee: number;     // Σ line.fee (already rate×hours per row)
  totalCost: number;           // Σ line.cost
  totalHours: number;          // Σ line.hours
  rateAdjustmentPct: number;   // T&M rate adjustment % (informational)
  lineItemRounding: number;    // rounding step ($) applied to the subtotal
  roundedSubtotal: number;     // subtotal after the rounding step
  roundingAdjustment: number;  // roundedSubtotal - lineSubtotalFee (signed)
  techAdminFeePct: number;     // Tech & Admin uplift %
  techAdminFee: number;        // techAdminFeePct × roundedSubtotal
  totalFee: number;            // roundedSubtotal + techAdminFee — what deals.totalFee stores
  marginPercent: number;       // (totalFee - totalCost) / totalFee × 100
  blendedRate: number;         // totalFee / totalHours
};

export function computeDealTotalsFromLines(lines: any[], ei: any): DealTotals {
  const rateAdjustmentPct = parseFloat(ei?.tmRateAdjustmentPct ?? "0") || 0;
  const techAdminFeePct = parseFloat(ei?.techAdminFeePct ?? "0") || 0;
  const lineItemRounding = parseFloat(ei?.lineItemRounding ?? "0") || 0;

  const lineSubtotalFee = lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
  const totalCost = lines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
  const totalHours = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);

  // Legacy economics: when lineItemRounding > 0, each line fee is rounded
  // to the nearest rounding step BEFORE the subtotal is taken. This keeps
  // per-row `rate × hours = fee` exact (line fees stay unrounded in the
  // grid cells) and surfaces the aggregate rounding effect as a single
  // visible footer row, instead of silently mutating each row's stored fee.
  const roundedSubtotal = lineItemRounding > 0
    ? lines.reduce((s, l) => {
        const raw = parseFloat(l.fee || "0");
        return s + Math.round(raw / lineItemRounding) * lineItemRounding;
      }, 0)
    : lineSubtotalFee;
  const roundingAdjustment = roundedSubtotal - lineSubtotalFee;

  const techAdminFee = roundedSubtotal * (techAdminFeePct / 100);
  const totalFee = roundedSubtotal + techAdminFee;

  const marginPercent = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;
  const blendedRate = totalHours > 0 ? totalFee / totalHours : 0;

  return {
    lineSubtotalFee, totalCost, totalHours,
    rateAdjustmentPct, lineItemRounding,
    roundedSubtotal, roundingAdjustment,
    techAdminFeePct, techAdminFee,
    totalFee, marginPercent, blendedRate,
  };
}

// Canonical per-line math. ALL pricing-line write paths must funnel through
// this so the displayed `rate × hours = fee` invariant holds at the cent.
// We round rate/costRate to 2dp first, then derive fee/cost/margin from
// those rounded values, so what the user sees in the grid reconciles
// exactly with what is stored. Without this, raw rate * hours can produce
// 2dp fees that disagree with displayed rate * displayed hours.
export function reconcileLine(hours: number, rate: number, costRate: number) {
  // Normalize hours/rate/costRate to 2dp FIRST, then derive fee/cost from
  // those normalized values. If we used the raw inputs to compute fee while
  // storing the rounded inputs, callers passing fractional inputs (e.g.
  // 10.123 hours) would persist a row where storedRate × storedHours ≠
  // storedFee — the exact invariant Task #45 must guarantee.
  const h = Math.round(hours * 100) / 100;
  const r = Math.round(rate * 100) / 100;
  const cr = Math.round(costRate * 100) / 100;
  const fee = Math.round(h * r * 100) / 100;
  const cost = Math.round(h * cr * 100) / 100;
  return {
    hours: h.toFixed(2),
    rate: r.toFixed(2),
    costRate: cr.toFixed(2),
    fee: fee.toFixed(2),
    cost: cost.toFixed(2),
    margin: (fee - cost).toFixed(2),
  };
}

// One-time reconciliation. We have to migrate two flavors of legacy data
// without changing the deal economics users were already shown:
//   A) Legacy rows where rate == standardRate (unadjusted) but fee already
//      had the T&M uplift baked in. Naively setting fee = hours × rate
//      would silently strip the uplift. We instead lift rate up to
//      standardRate × (1 + tmRateAdjustmentPct/100) — same formula as
//      recalcPricingFromScope — so the adjusted economics are preserved
//      AND the rate × hours = fee invariant holds.
//   B) Rows that were always consistent: rate already equals the adjusted
//      rate, so we only refresh fee/cost/margin if they drifted.
// Lines flagged as rateOverridden are left alone (the override is intentional).
// After per-line cleanup we re-roll the deal totals via the shared helper
// so deals.totalFee matches what the Pricing Grid renders.
export async function backfillDealTotals(): Promise<{ updated: number; linesFixed: number }> {
  const all = await db.select().from(deals);
  let updated = 0;
  let linesFixed = 0;
  for (const d of all) {
    try {
      const ei: any = (d as any).engagementInputs || {};
      const adjPct = parseFloat(ei.tmRateAdjustmentPct ?? "0") || 0;
      const factor = 1 + adjPct / 100;

      const lines = await db.select().from(pricingLines)
        .where(eq(pricingLines.dealId, d.id));
      for (const l of lines) {
        const hours = parseFloat(l.hours || "0");
        const storedRate = parseFloat(l.rate || "0");
        const standard = parseFloat(l.standardRate || l.rate || "0");
        const costRate = parseFloat(l.costRate || "0");

        // Decide the canonical adjusted rate. Honor manual overrides; for
        // everything else, the rate must be standardRate × factor so the
        // T&M uplift lives in `rate` (not silently in `fee`).
        const rawTargetRate = l.rateOverridden ? storedRate : standard * factor;
        const reconciled = reconcileLine(hours, rawTargetRate, costRate);

        const storedFee = parseFloat(l.fee || "0");
        const storedCost = parseFloat(l.cost || "0");
        const rateDrift = Math.abs(parseFloat(reconciled.rate) - storedRate) > 0.01;
        const feeDrift = Math.abs(parseFloat(reconciled.fee) - storedFee) > 0.01;
        const costDrift = Math.abs(parseFloat(reconciled.cost) - storedCost) > 0.01;

        if (rateDrift || feeDrift || costDrift) {
          await db.update(pricingLines).set({
            rate: reconciled.rate,
            fee: reconciled.fee,
            cost: reconciled.cost,
            margin: reconciled.margin,
          }).where(eq(pricingLines.id, l.id));
          linesFixed++;
        }
      }
      await persistDealTotals(d.id);
      updated++;
    } catch (e) {
      console.error(`[backfillDealTotals] deal ${d.id} failed:`, e);
    }
  }
  return { updated, linesFixed };
}

// Persist computed totals onto deals row from current pricing_lines. Use this
// after any pricing-line write so deals.totalFee never drifts from the grid.
export async function persistDealTotals(dealId: number) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return null;
  const lines = await db.select().from(pricingLines)
    .where(eq(pricingLines.dealId, dealId));
  const totals = computeDealTotalsFromLines(lines, (deal as any).engagementInputs || {});
  await db.update(deals).set({
    totalFee: totals.totalFee.toFixed(2),
    totalCost: totals.totalCost.toFixed(2),
    totalHours: String(totals.totalHours),
    marginPercent: totals.totalFee > 0 ? totals.marginPercent.toFixed(1) : "0",
    blendedRate: totals.totalHours > 0 ? totals.blendedRate.toFixed(2) : "0",
  }).where(eq(deals.id, dealId));
  return totals;
}

// F1.1: hours rolled up per entity. The deal total is the sum across
// entities (and across the legacy `null` bucket for any scope rows whose
// entity_id hasn't been backfilled — should be empty in practice).
//
// `aggregateScopeByEntity` is pure and deterministic: same inputs → same
// outputs. The per-item math is identical to the pre-F1.1 reduce
// (Math.round(baseHrs × qty × multiplier)), so summing across entities
// reproduces the legacy deal totalHours bit-for-bit. Calc parity holds.
export type EntityHourRollup = {
  entityId: number | null;
  totalHours: number;
};

export function aggregateScopeByEntity(
  scopeItems: any[],
  totalMultiplier: number,
): EntityHourRollup[] {
  const byEntity = new Map<number | null, number>();
  for (const si of scopeItems) {
    if (si.scopeItem?.isAssembly) continue; // assemblies are groupings, not billable
    const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "40");
    // Use ?? not || so an explicit zero quantity (e.g. parametric Tax
    // line where the input resolved to zero units) stays zero. Falsy-
    // coalescing would silently bill those lines as 1 × baseHrs.
    const qty = si.quantity ?? 1;
    const hours = Math.round(baseHrs * qty * totalMultiplier);
    const eid = (si.entityId ?? null) as number | null;
    byEntity.set(eid, (byEntity.get(eid) ?? 0) + hours);
  }
  return Array.from(byEntity.entries())
    .map(([entityId, totalHours]) => ({ entityId, totalHours }))
    .sort((a, b) => {
      // null bucket last, otherwise stable by entityId for deterministic output
      if (a.entityId === null) return 1;
      if (b.entityId === null) return -1;
      return a.entityId - b.entityId;
    });
}

// Loads + aggregates per-entity hours for a deal. Returns the rollup +
// flat deal total + the entity rows themselves so the UI can render
// labelled tabs. Read-only — never mutates pricing or scope.
export async function computeEntityTotalsForDeal(dealId: number): Promise<{
  entities: Array<{
    entityId: number;
    name: string;
    entityType: string | null;
    jurisdiction: string | null;
    isPrimary: boolean;
    sortOrder: number;
    totalHours: number;
  }>;
  unassignedHours: number;   // hours from scope rows with entity_id IS NULL
  totalHours: number;
}> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { scopeItems: { with: { scopeItem: true } }, promptResponses: true },
  });
  if (!deal) {
    return { entities: [], unassignedHours: 0, totalHours: 0 };
  }
  const baseMultiplier = COMPLEXITY_MULTIPLIERS[deal.complexity || "medium"] || 1.0;
  const promptMultiplier = (deal.promptResponses || []).reduce(
    (m: number, p: any) => m * (parseFloat(p.impactMultiplier) || 1.0), 1.0
  );
  const totalMultiplier = baseMultiplier * promptMultiplier;

  const rollup = aggregateScopeByEntity(deal.scopeItems || [], totalMultiplier);
  const entityRows = await db.select().from(dealEntities).where(eq(dealEntities.dealId, dealId));
  const byId = new Map(entityRows.map(e => [e.id, e]));

  const entities = rollup
    .filter(r => r.entityId !== null)
    .map(r => {
      const e = byId.get(r.entityId as number);
      return {
        entityId: r.entityId as number,
        name: e?.name ?? "(deleted entity)",
        entityType: e?.entityType ?? null,
        jurisdiction: e?.jurisdiction ?? null,
        isPrimary: !!e?.isPrimary,
        sortOrder: e?.sortOrder ?? 0,
        totalHours: r.totalHours,
      };
    })
    .sort((a, b) => {
      // Primary first, then by sortOrder, then by name. Same order the
      // GET /api/deals/:dealId/entities endpoint uses, so the UI's tab
      // strip and rollup table line up without re-sorting.
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

  const unassigned = rollup.find(r => r.entityId === null);
  const unassignedHours = unassigned?.totalHours ?? 0;
  const totalHours = rollup.reduce((s, r) => s + r.totalHours, 0);

  return { entities, unassignedHours, totalHours };
}

export async function recalcPricingFromScope(dealId: number) {
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

  // Engagement Inputs adjustments (Tax PHB Excel parity): T&M rate adjustment %
  // is folded into the per-row rate so rate × hours = fee is preserved on
  // every row. Tech & Admin uplift and rounding are deal-level concerns and
  // are applied in computeDealTotalsFromLines, never silently against rows.
  const ei: any = (deal as any).engagementInputs || {};
  const rateAdjustmentPct = parseFloat(ei.tmRateAdjustmentPct ?? "0") || 0;
  const rateAdjustmentFactor = 1 + rateAdjustmentPct / 100;

  // Compute hours via the entity rollup so the math is grouped how the UI
  // displays it (per-entity → deal total). Sum across all entities is
  // identical to the pre-F1.1 flat reduce; calc parity holds.
  const rollup = aggregateScopeByEntity(deal.scopeItems || [], totalMultiplier);
  let totalHours: number;
  if (rollup.length > 0) {
    totalHours = rollup.reduce((s, r) => s + r.totalHours, 0);
  } else {
    totalHours = Math.round(200 * totalMultiplier);
  }

  const existingLines = await db.select().from(pricingLines)
    .where(eq(pricingLines.dealId, dealId));

  if (existingLines.length > 0) {
    const allRoles = await db.select().from(roles).orderBy(roles.sortOrder);
    const roleMap = new Map(allRoles.map(r => [r.id, r]));

    // Senior-heavy pyramid for Complex Tax engagements; Digital pyramid for
    // everything else. Without this, recalc after any edit would drift a
    // Tax-Corporate deal back to the default role mix.
    const dist = (deal.serviceLine === COMPLEX_TAX_SERVICE_LINE)
      ? COMPLEX_TAX_ROLE_DISTRIBUTION
      : ROLE_DISTRIBUTION;
    for (const line of existingLines) {
      const role = roleMap.get(line.roleId!);
      const pct = role ? (dist[role.name] || (1 / allRoles.length)) : (1 / existingLines.length);
      const hours = Math.max(Math.round(totalHours * pct), 1);
      // The standard rate is the rate-card baseline; the displayed rate is
      // that baseline times the T&M adjustment factor. We persist the
      // adjusted rate so the UI's "rate × hours" math always lands on fee.
      const baseRate = parseFloat(line.standardRate || line.rate || "300");
      const rate = baseRate * rateAdjustmentFactor;
      const costRate = parseFloat(line.costRate || "150");
      const reconciled = reconcileLine(hours, rate, costRate);
      await db.update(pricingLines).set({
        hours: reconciled.hours,
        rate: reconciled.rate,
        fee: reconciled.fee,
        cost: reconciled.cost,
        margin: reconciled.margin,
      }).where(eq(pricingLines.id, line.id));
    }
  }

  await persistDealTotals(dealId);
  await db.delete(scenarios).where(eq(scenarios.dealId, dealId));
}
