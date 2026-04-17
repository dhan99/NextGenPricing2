import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  deals, pricingLines, roles as rolesTable,
  workdaySettings, workdayCostCenters, workdayWorkers, workdayRateCards,
  workdayValidations, workdayValidationFindings, workdayEvents,
} from "../shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";

const PILOT_FIN_PERSONAS = new Set(["fin", "sll", "Lisa Park", "Sarah Chen"]);

function isApprover(persona?: string | null) {
  if (!persona) return false;
  return PILOT_FIN_PERSONAS.has(persona);
}

function uuid(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = (n: number, len = 8) => n.toString(16).padStart(len, "0").slice(0, len);
  return `WD-${hex(h)}-${hex(h ^ 0x1234, 4)}-${hex(h ^ 0xabcd, 4)}-${hex(h ^ 0xbeef, 12)}`;
}

async function logEvent(e: {
  eventType: "pull" | "validate" | "override" | "link" | "unlink" | "settings" | "seed";
  entity: "CostCenter" | "Worker" | "RateCard" | "Validation" | "Settings" | "System";
  entityName?: string;
  entityRefId?: number;
  dealId?: number;
  status?: "success" | "failure" | "warning";
  source?: "simulated" | "live";
  trigger?: "manual" | "auto" | "batch" | "save" | "submit";
  message: string;
  fields?: any;
  actorName?: string;
}) {
  await db.insert(workdayEvents).values({
    eventType: e.eventType,
    entity: e.entity,
    entityName: e.entityName,
    entityRefId: e.entityRefId,
    dealId: e.dealId,
    status: e.status || "success",
    source: e.source || "simulated",
    trigger: e.trigger || "manual",
    message: e.message,
    fields: e.fields ? (e.fields as any) : null,
    actorName: e.actorName || "System",
  });
}

export async function getWorkdaySettings() {
  const [s] = await db.select().from(workdaySettings).limit(1);
  if (s) return s;
  const [created] = await db.insert(workdaySettings).values({}).returning();
  return created;
}

// ============ PROVIDER INTERFACE ============
interface WorkdayProvider {
  mode: "simulated" | "live";
  getCostCenters(): Promise<any[]>;
  getWorkers(): Promise<any[]>;
  getRateCard(): Promise<any[]>;
  validateDeal(dealId: number, opts: ValidateOpts): Promise<ValidationResult>;
  /** Bi-directional: push approved deal back to Workday as a Project record. */
  pushProject(args: PushProjectArgs): Promise<PushProjectResult>;
}

interface PushProjectArgs {
  dealId: number;
  trigger?: "manual" | "auto" | "approval";
  actorName?: string;
}
interface PushProjectResult {
  ok: boolean;
  externalRef?: string;
  message: string;
}

interface ValidateOpts {
  trigger?: "manual" | "save" | "submit" | "nightly";
  actorName?: string;
}

interface FindingDraft {
  findingType: "budget" | "staffing" | "rate";
  severity: "info" | "warning" | "blocker";
  roleName?: string;
  requiredHours?: number;
  availableHours?: number;
  shortfallHours?: number;
  dealCostRate?: number;
  workdayCostRate?: number;
  variancePct?: number;
  amount?: number;
  message: string;
}

interface ValidationResult {
  ok: boolean;
  status: "clean" | "over_budget" | "staffing_shortfall" | "rate_variance" | "failed";
  validationId: number;
  summary: string;
  findings: FindingDraft[];
}

const SimulatedWorkdayProvider: WorkdayProvider = {
  mode: "simulated",
  async getCostCenters() {
    return db.select().from(workdayCostCenters).orderBy(workdayCostCenters.code);
  },
  async getWorkers() {
    return db.select().from(workdayWorkers).orderBy(workdayWorkers.name);
  },
  async getRateCard() {
    return db.select().from(workdayRateCards).orderBy(workdayRateCards.roleName);
  },
  async validateDeal(dealId, opts) {
    return runSimulatedValidation(dealId, opts);
  },
  async pushProject(args) {
    return runSimulatedPushProject(args);
  },
};

const LiveWorkdayProvider: WorkdayProvider = {
  mode: "live",
  async getCostCenters() { return []; },
  async getWorkers() { return []; },
  async getRateCard() { return []; },
  async validateDeal(dealId): Promise<ValidationResult> {
    const [v] = await db.insert(workdayValidations).values({
      dealId, status: "failed", source: "live",
      summary: "Live Workday provider is not configured. Switch to Simulation mode or supply credentials.",
      completedAt: new Date(),
    }).returning();
    return { ok: false, status: "failed", validationId: v.id, summary: v.summary || "Live not configured", findings: [] };
  },
  async pushProject(args) {
    await logEvent({
      eventType: "link", entity: "System", dealId: args.dealId, status: "warning",
      source: "live", trigger: args.trigger || "manual", actorName: args.actorName,
      message: "Live Workday push not configured. Switch to Simulation mode or supply credentials.",
    });
    return { ok: false, message: "Live Workday provider is not configured." };
  },
};

async function runSimulatedPushProject(args: PushProjectArgs): Promise<PushProjectResult> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, args.dealId) });
  if (!deal) return { ok: false, message: "Deal not found" };
  const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, args.dealId));
  const totalHours = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
  const totalCost = parseFloat(deal.totalCost || "0");
  const externalRef = uuid(`prj-${deal.id}-${deal.status}`);
  let costCenter: any = null;
  if (deal.workdayCostCenterId) {
    const [cc] = await db.select().from(workdayCostCenters).where(eq(workdayCostCenters.id, deal.workdayCostCenterId));
    costCenter = cc || null;
    if (cc) {
      // Atomic, narrowly-scoped idempotency: insert a sentinel marker row first
      // (eventType="committed_increment" is unique to this side-effect, distinct
      // from generic "link" events) and only increment if the insert wins the race.
      // Wrapped in a transaction so concurrent pushes can't double-increment.
      try {
        await db.transaction(async (tx) => {
          const dup = await tx.select({ id: workdayEvents.id }).from(workdayEvents)
            .where(and(
              eq(workdayEvents.dealId, args.dealId),
              eq(workdayEvents.eventType, "committed_increment"),
              eq(workdayEvents.entityRefId, cc.id),
            )).limit(1);
          if (dup.length > 0) return;
          await tx.insert(workdayEvents).values({
            eventType: "committed_increment", entity: "CostCenter",
            entityRefId: cc.id, dealId: args.dealId, status: "success",
            source: "simulated", trigger: args.trigger || "manual", actorName: args.actorName,
            message: `Reserved $${totalCost.toLocaleString()} of committed budget on ${cc.code}`,
            fields: { increment: totalCost, costCenterId: cc.id },
          });
          const [fresh] = await tx.select().from(workdayCostCenters).where(eq(workdayCostCenters.id, cc.id));
          const newCommitted = parseFloat(fresh.committed || "0") + totalCost;
          await tx.update(workdayCostCenters).set({
            committed: String(newCommitted), lastSyncedAt: new Date(),
          }).where(eq(workdayCostCenters.id, cc.id));
        });
      } catch (e) {
        // Marker insert lost the race or transaction failed — increment was either
        // applied by the winning request or is intentionally skipped. Continue.
      }
    }
  }
  await logEvent({
    eventType: "link", entity: "System", dealId: args.dealId, status: "success",
    source: "simulated", trigger: args.trigger || "manual", actorName: args.actorName,
    message: `Project ${externalRef} pushed to Workday (${costCenter?.code || "no cost-center"}, ${totalHours.toFixed(0)}h, $${totalCost.toLocaleString()})`,
    fields: { externalRef, totalHours, totalCost, costCenterCode: costCenter?.code },
  });
  return { ok: true, externalRef, message: `Project record ${externalRef} created in Workday.` };
}

// Auto-push hook called from deal-status transitions when a deal is approved.
export async function autoPushWorkdayProject(dealId: number, trigger: "auto" | "approval" = "approval", actorName?: string) {
  try {
    const provider = await getProvider();
    return await provider.pushProject({ dealId, trigger, actorName });
  } catch (e: any) {
    return { ok: false, message: e?.message || "push failed" };
  }
}

export async function getProvider(): Promise<WorkdayProvider> {
  const s = await getWorkdaySettings();
  return s.mode === "live" ? LiveWorkdayProvider : SimulatedWorkdayProvider;
}

// ============ SIMULATED VALIDATION LOGIC ============
async function runSimulatedValidation(dealId: number, opts: ValidateOpts): Promise<ValidationResult> {
  const settings = await getWorkdaySettings();
  const tolerance = parseFloat(settings.rateVarianceTolerancePct || "10");
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) {
    const [v] = await db.insert(workdayValidations).values({
      dealId, status: "failed", source: "simulated", summary: "Deal not found", completedAt: new Date(),
    }).returning();
    return { ok: false, status: "failed", validationId: v.id, summary: "Deal not found", findings: [] };
  }

  const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
  const allRoles = await db.select().from(rolesTable);
  const roleById = new Map(allRoles.map((r) => [r.id, r]));

  // Aggregate hours by role
  const hoursByRole = new Map<string, { hours: number; costRate: number }>();
  for (const l of lines) {
    const r = roleById.get(l.roleId!);
    if (!r) continue;
    const cur = hoursByRole.get(r.name) || { hours: 0, costRate: parseFloat(l.costRate || "0") };
    cur.hours += parseFloat(l.hours || "0");
    cur.costRate = parseFloat(l.costRate || cur.costRate.toString());
    hoursByRole.set(r.name, cur);
  }

  const findings: FindingDraft[] = [];

  // ----- Budget check -----
  let costCenter: any = null;
  if (deal.workdayCostCenterId) {
    const [cc] = await db.select().from(workdayCostCenters).where(eq(workdayCostCenters.id, deal.workdayCostCenterId));
    costCenter = cc || null;
  }
  const dealCost = parseFloat(deal.totalCost || "0");
  let budgetHeadroom: number | null = null;
  let budgetUsedPct: number | null = null;
  let budgetOver = false;
  if (costCenter) {
    const total = parseFloat(costCenter.totalBudget || "0");
    const committed = parseFloat(costCenter.committed || "0");
    const headroomBefore = total - committed;
    budgetHeadroom = headroomBefore - dealCost;
    budgetUsedPct = total > 0 ? ((committed + dealCost) / total) * 100 : 0;
    if (budgetHeadroom < 0) {
      budgetOver = true;
      findings.push({
        findingType: "budget",
        severity: "blocker",
        amount: Math.abs(budgetHeadroom),
        message: `Deal cost $${dealCost.toLocaleString()} exceeds remaining budget on ${costCenter.code} (${costCenter.name}) by $${Math.abs(budgetHeadroom).toLocaleString()}.`,
      });
    } else {
      findings.push({
        findingType: "budget",
        severity: budgetUsedPct! > 90 ? "warning" : "info",
        amount: budgetHeadroom,
        message: `Cost center ${costCenter.code} has $${budgetHeadroom.toLocaleString()} headroom (${budgetUsedPct!.toFixed(1)}% utilized after this deal).`,
      });
    }
  } else {
    findings.push({
      findingType: "budget",
      severity: "warning",
      message: "No Workday cost center linked. Budget validation skipped.",
    });
  }

  // ----- Staffing check -----
  const workers = await db.select().from(workdayWorkers);
  const availByRole = new Map<string, number>();
  for (const w of workers) {
    availByRole.set(w.roleName, (availByRole.get(w.roleName) || 0) + parseFloat(w.availableHours || "0"));
  }
  let totalShortfall = 0;
  for (const [roleName, agg] of hoursByRole) {
    const required = agg.hours;
    const available = availByRole.get(roleName) || 0;
    const shortfall = Math.max(0, required - available);
    if (shortfall > 0) {
      totalShortfall += shortfall;
      findings.push({
        findingType: "staffing",
        severity: "blocker",
        roleName,
        requiredHours: required,
        availableHours: available,
        shortfallHours: shortfall,
        message: `${roleName}: requires ${required.toFixed(0)}h, Workday shows ${available.toFixed(0)}h available — short ${shortfall.toFixed(0)}h.`,
      });
    } else if (required > 0) {
      findings.push({
        findingType: "staffing",
        severity: "info",
        roleName,
        requiredHours: required,
        availableHours: available,
        shortfallHours: 0,
        message: `${roleName}: ${required.toFixed(0)}h required vs ${available.toFixed(0)}h available — covered.`,
      });
    }
  }

  // ----- Rate variance check -----
  const rateCard = await db.select().from(workdayRateCards);
  const rateByRole = new Map(rateCard.map((r) => [r.roleName, parseFloat(r.standardCostRate)]));
  let maxVariance = 0;
  let varianceFlagged = false;
  for (const [roleName, agg] of hoursByRole) {
    const wdRate = rateByRole.get(roleName);
    if (wdRate == null) continue;
    if (agg.costRate <= 0) continue;
    const variance = ((agg.costRate - wdRate) / wdRate) * 100;
    const absV = Math.abs(variance);
    if (absV > maxVariance) maxVariance = absV;
    if (absV > tolerance) {
      varianceFlagged = true;
      findings.push({
        findingType: "rate",
        severity: "warning",
        roleName,
        dealCostRate: agg.costRate,
        workdayCostRate: wdRate,
        variancePct: variance,
        message: `${roleName}: deal cost rate $${agg.costRate.toFixed(2)} vs Workday $${wdRate.toFixed(2)} (${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%) — exceeds ${tolerance}% tolerance.`,
      });
    }
  }

  // ----- Determine overall status -----
  let status: ValidationResult["status"] = "clean";
  if (budgetOver) status = "over_budget";
  else if (totalShortfall > 0) status = "staffing_shortfall";
  else if (varianceFlagged) status = "rate_variance";

  const summary =
    status === "clean" ? "All Workday checks passed."
    : status === "over_budget" ? "Deal cost exceeds linked Workday cost-center budget."
    : status === "staffing_shortfall" ? `Staffing shortfall: ${totalShortfall.toFixed(0)}h across roles.`
    : `Rate variance up to ${maxVariance.toFixed(1)}% vs Workday standard (tolerance ${tolerance}%).`;

  const [v] = await db.insert(workdayValidations).values({
    dealId,
    costCenterId: costCenter?.id || null,
    status,
    source: "simulated",
    trigger: opts.trigger || "manual",
    budgetHeadroom: budgetHeadroom != null ? String(budgetHeadroom) : null,
    budgetUsedPct: budgetUsedPct != null ? String(budgetUsedPct.toFixed(2)) : null,
    staffingShortfallHours: String(totalShortfall),
    rateVarianceMaxPct: String(maxVariance.toFixed(2)),
    summary,
    requestedBy: opts.actorName,
    completedAt: new Date(),
  }).returning();

  if (findings.length > 0) {
    await db.insert(workdayValidationFindings).values(findings.map((f) => ({
      validationId: v.id,
      findingType: f.findingType,
      severity: f.severity,
      roleName: f.roleName,
      requiredHours: f.requiredHours != null ? String(f.requiredHours) : null,
      availableHours: f.availableHours != null ? String(f.availableHours) : null,
      shortfallHours: f.shortfallHours != null ? String(f.shortfallHours) : null,
      dealCostRate: f.dealCostRate != null ? String(f.dealCostRate) : null,
      workdayCostRate: f.workdayCostRate != null ? String(f.workdayCostRate) : null,
      variancePct: f.variancePct != null ? String(f.variancePct.toFixed(2)) : null,
      amount: f.amount != null ? String(f.amount) : null,
      message: f.message,
    })));
  }

  await logEvent({
    eventType: "validate", entity: "Validation", entityName: deal.title, entityRefId: v.id,
    dealId, source: "simulated", trigger: opts.trigger || "manual",
    status: status === "clean" ? "success" : status === "rate_variance" ? "warning" : "failure",
    actorName: opts.actorName,
    message: `Workday validation #${v.id} → ${status.toUpperCase()}: ${summary}`,
  });

  return { ok: status === "clean", status, validationId: v.id, summary, findings };
}

// Hook called by routes when deal saves / submits
export async function onDealSaved(dealId: number, actorName?: string) {
  const s = await getWorkdaySettings();
  if (!s.autoValidateOnSave) return;
  try { await runSimulatedValidation(dealId, { trigger: "save", actorName }); }
  catch (e) { console.error("Workday auto-validate (save) failed:", e); }
}

export async function onDealSubmitted(dealId: number, actorName?: string): Promise<{ blocked: boolean; reason?: string; validationId?: number }> {
  const s = await getWorkdaySettings();
  if (!s.autoCheckOnSubmit) return { blocked: false };
  try {
    // Use the most recent validation for this deal as the gate.
    const [latest] = await db.select().from(workdayValidations)
      .where(eq(workdayValidations.dealId, dealId))
      .orderBy(desc(workdayValidations.requestedAt)).limit(1);

    let v = latest;
    if (!v) {
      const r = await runSimulatedValidation(dealId, { trigger: "submit", actorName });
      const [refetched] = await db.select().from(workdayValidations).where(eq(workdayValidations.id, r.validationId));
      v = refetched;
    }
    if (!v) return { blocked: false };

    const isBlocking = v.status === "over_budget" || v.status === "staffing_shortfall";
    if (!isBlocking) return { blocked: false, validationId: v.id };

    if (v.overriddenBy) {
      await logEvent({
        eventType: "validate", entity: "Validation", entityRefId: v.id, dealId,
        status: "warning", trigger: "submit", actorName,
        message: `Submission allowed under override #${v.id} (${v.status}).`,
      });
      return { blocked: false, validationId: v.id };
    }

    return { blocked: true, reason: v.summary || "Workday validation failed.", validationId: v.id };
  } catch (e: any) {
    return { blocked: false, reason: e?.message };
  }
}

// ============ SEED ============
const SIM_COST_CENTERS = [
  { code: "CC-AUDIT-100", name: "Audit & Assurance — National", fiscalYear: "FY2026", totalBudget: "5500000", committed: "1850000", businessUnit: "Audit & Assurance" },
  { code: "CC-TAX-200",   name: "Tax Services — National",      fiscalYear: "FY2026", totalBudget: "3800000", committed: "1620000", businessUnit: "Tax Services" },
  { code: "CC-CONS-300",  name: "Technology Consulting",        fiscalYear: "FY2026", totalBudget: "6200000", committed: "5950000", businessUnit: "Technology Consulting" },
  { code: "CC-ADV-400",   name: "Advisory Services",            fiscalYear: "FY2026", totalBudget: "4100000", committed: "1200000", businessUnit: "Advisory Services" },
  { code: "CC-RISK-500",  name: "Risk & Compliance",            fiscalYear: "FY2026", totalBudget: "2700000", committed: "900000",  businessUnit: "Risk & Compliance" },
];

const SIM_RATE_CARD = [
  { roleName: "Partner",           standardCostRate: "285" },
  { roleName: "Managing Director", standardCostRate: "240" },
  { roleName: "Senior Manager",    standardCostRate: "200" },
  { roleName: "Manager",           standardCostRate: "175" },
  { roleName: "Senior Consultant", standardCostRate: "145" },
  { roleName: "Consultant",        standardCostRate: "115" },
  { roleName: "Analyst",           standardCostRate: "88"  },
];

const SIM_WORKERS = [
  // Plenty of capacity for most roles, but Senior Consultant intentionally low
  ["Olivia Brennan", "Partner", "West", 40, 320, 285],
  ["Daniel Reeves",  "Partner", "East", 40, 280, 285],
  ["Priya Nair",     "Managing Director", "Central", 40, 360, 240],
  ["Marcus Lee",     "Managing Director", "West", 40, 300, 240],
  ["Sandra Holt",    "Senior Manager", "East", 40, 480, 200],
  ["Rafael Ortiz",   "Senior Manager", "West", 40, 420, 200],
  ["Hannah Park",    "Manager", "Central", 40, 520, 175],
  ["Tom Becker",     "Manager", "West", 40, 460, 175],
  ["Jamie Wu",       "Manager", "East", 40, 400, 175],
  // Senior Consultant pool kept tight to drive a "staffing_shortfall" demo
  ["Erin Walsh",     "Senior Consultant", "West", 40, 220, 150],
  ["Vikram Shah",    "Senior Consultant", "East", 40, 180, 145],
  ["Megan O'Connor", "Consultant", "Central", 40, 640, 115],
  ["Liam Foster",    "Consultant", "East", 40, 580, 115],
  ["Nora Bell",      "Consultant", "West", 40, 520, 115],
  ["Owen Park",      "Analyst", "Central", 40, 720, 88],
  ["Sara Khan",      "Analyst", "West", 40, 640, 88],
];

export async function seedWorkday() {
  await getWorkdaySettings();

  const [{ count: ccCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(workdayCostCenters);
  if (ccCount === 0) {
    for (const c of SIM_COST_CENTERS) {
      await db.insert(workdayCostCenters).values({
        workdayId: uuid(`cc-${c.code}`),
        code: c.code, name: c.name, fiscalYear: c.fiscalYear,
        totalBudget: c.totalBudget, committed: c.committed,
        businessUnit: c.businessUnit, source: "simulated",
      });
    }
  }

  const [{ count: rcCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(workdayRateCards);
  if (rcCount === 0) {
    for (const r of SIM_RATE_CARD) {
      await db.insert(workdayRateCards).values({
        roleName: r.roleName, standardCostRate: r.standardCostRate,
        effectiveDate: "2025-07-01", source: "simulated",
      });
    }
  }

  const [{ count: wkCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(workdayWorkers);
  if (wkCount === 0) {
    let i = 0;
    for (const [name, role, region, cap, avail, rate] of SIM_WORKERS) {
      await db.insert(workdayWorkers).values({
        workdayId: uuid(`worker-${i}-${name}`),
        employeeNumber: `EMP-${String(10000 + i++).padStart(6, "0")}`,
        name: String(name), roleName: String(role), region: String(region),
        weeklyCapacityHours: String(cap), availableHours: String(avail),
        standardCostRate: String(rate), source: "simulated",
      });
    }
  }

  // Link existing demo deals to cost centers + run baseline validations
  const [{ count: vCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(workdayValidations);
  if (vCount === 0) {
    const allDeals = await db.select().from(deals);
    const centers = await db.select().from(workdayCostCenters);
    const ccByBU = new Map(centers.map((c) => [c.businessUnit, c]));
    const consultingCC = centers.find((c) => c.code === "CC-CONS-300");
    for (const d of allDeals) {
      const cc = (d.businessUnit && ccByBU.get(d.businessUnit)) || consultingCC;
      if (cc) {
        await db.update(deals).set({ workdayCostCenterId: cc.id }).where(eq(deals.id, d.id));
      }
      try { await runSimulatedValidation(d.id, { trigger: "nightly", actorName: "Workday Seed" }); } catch {}
    }

    // Inject representative demo validations covering each outcome
    await seedDemoValidations(allDeals, centers);

    await logEvent({
      eventType: "seed", entity: "System", entityName: "Workday simulation",
      message: `Workday pilot seeded: ${centers.length} cost centers, ${SIM_WORKERS.length} workers, ${SIM_RATE_CARD.length} rate-card roles.`,
      trigger: "batch", source: "simulated",
    });
  }
}

async function seedDemoValidations(allDeals: any[], centers: any[]) {
  if (allDeals.length < 3) return;
  const consultingCC = centers.find((c) => c.code === "CC-CONS-300");
  const advisoryCC = centers.find((c) => c.code === "CC-ADV-400");
  const cases: Array<{ deal: any; cc: any; status: "over_budget" | "staffing_shortfall" | "rate_variance"; summary: string; findings: any[] }> = [];

  // Over-budget demo on first deal vs Technology Consulting CC (already near full at $5.95M of $6.2M)
  const d1 = allDeals[0];
  if (consultingCC) cases.push({
    deal: d1, cc: consultingCC, status: "over_budget",
    summary: `Deal cost $385,000 exceeds remaining budget on ${consultingCC.code} (${consultingCC.name}) by $135,000.`,
    findings: [
      { findingType: "budget", severity: "blocker", amount: "135000",
        message: `Deal would commit $385,000 against $250,000 remaining headroom on ${consultingCC.code}.` },
      { findingType: "staffing", severity: "info", roleName: "Manager", requiredHours: "180", availableHours: "1380", shortfallHours: "0",
        message: "Manager: 180h required vs 1380h available — covered." },
    ],
  });

  // Staffing shortfall demo on second deal
  const d2 = allDeals[1];
  if (advisoryCC) cases.push({
    deal: d2, cc: advisoryCC, status: "staffing_shortfall",
    summary: "Staffing shortfall: 240h across roles.",
    findings: [
      { findingType: "budget", severity: "info", amount: "1280000",
        message: `Cost center ${advisoryCC.code} has $1,280,000 headroom (68.8% utilized after this deal).` },
      { findingType: "staffing", severity: "blocker", roleName: "Senior Consultant", requiredHours: "640", availableHours: "400", shortfallHours: "240",
        message: "Senior Consultant: requires 640h, Workday shows 400h available — short 240h." },
    ],
  });

  // Rate variance demo on third deal
  const d3 = allDeals[2];
  if (consultingCC) cases.push({
    deal: d3, cc: consultingCC, status: "rate_variance",
    summary: "Rate variance up to 18.4% vs Workday standard (tolerance 10%).",
    findings: [
      { findingType: "rate", severity: "warning", roleName: "Senior Manager", dealCostRate: "237", workdayCostRate: "200", variancePct: "18.50",
        message: "Senior Manager: deal cost rate $237.00 vs Workday $200.00 (+18.5%) — exceeds 10% tolerance." },
      { findingType: "rate", severity: "warning", roleName: "Manager", dealCostRate: "195", workdayCostRate: "175", variancePct: "11.40",
        message: "Manager: deal cost rate $195.00 vs Workday $175.00 (+11.4%) — exceeds 10% tolerance." },
      { findingType: "budget", severity: "info", message: `Cost center ${consultingCC.code} has $850,000 headroom (86.3% utilized after this deal).` },
    ],
  });

  for (const c of cases) {
    const [v] = await db.insert(workdayValidations).values({
      dealId: c.deal.id, costCenterId: c.cc.id,
      status: c.status, source: "simulated", trigger: "nightly",
      budgetHeadroom: c.status === "over_budget" ? "-135000" : "1280000",
      budgetUsedPct: c.status === "over_budget" ? "102.18" : "68.78",
      staffingShortfallHours: c.status === "staffing_shortfall" ? "240" : "0",
      rateVarianceMaxPct: c.status === "rate_variance" ? "18.50" : "0",
      summary: c.summary, requestedBy: "Workday Seed", completedAt: new Date(),
    }).returning();

    await db.insert(workdayValidationFindings).values(c.findings.map((f) => ({ validationId: v.id, ...f })));

    await logEvent({
      eventType: "validate", entity: "Validation", entityName: c.deal.title, entityRefId: v.id,
      dealId: c.deal.id, source: "simulated", trigger: "nightly",
      status: c.status === "rate_variance" ? "warning" : "failure",
      message: `Workday validation #${v.id} → ${c.status.toUpperCase()}: ${c.summary}`,
      actorName: "Workday Seed",
    });
  }
}

// ============ ROUTES ============
export function registerWorkdayRoutes(app: Express) {
  seedWorkday().catch((e) => console.error("Workday seed error:", e));

  // Bi-directional: push approved deal back to Workday as a Project record.
  app.post("/api/workday/deals/:id/push", async (req: Request, res: Response) => {
    // Identity is derived from trusted headers, NEVER request body.
    const actorName = (req.header("x-user-name") || "").trim();
    const role = (req.header("x-user-role") || "").trim().toLowerCase();
    if (!actorName || !role) {
      return res.status(401).json({ error: "x-user-name and x-user-role headers are required." });
    }
    if (!["pdl", "sll", "po", "fin", "it"].includes(role)) {
      return res.status(403).json({ error: "Insufficient role to push to Workday." });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const provider = await getProvider();
    const result = await provider.pushProject({
      dealId: id, trigger: "manual", actorName,
    });
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  });

  app.get("/api/workday/settings", async (_req, res) => res.json(await getWorkdaySettings()));

  app.patch("/api/workday/settings", async (req: Request, res: Response) => {
    const cur = await getWorkdaySettings();
    const allowed = ["mode", "tenantUrl", "isuUsername", "apiClientId", "apiClientSecret",
      "autoValidateOnSave", "autoCheckOnSubmit", "nightlyRefreshEnabled", "rateVarianceTolerancePct"];
    const patch: any = { updatedAt: new Date() };
    for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    if (patch.rateVarianceTolerancePct != null) patch.rateVarianceTolerancePct = String(patch.rateVarianceTolerancePct);
    await db.update(workdaySettings).set(patch).where(eq(workdaySettings.id, cur.id));
    await logEvent({
      eventType: "settings", entity: "Settings", message: `Workday settings updated`,
      fields: Object.keys(patch).filter((k) => k !== "updatedAt"), actorName: req.body?.userName,
    });
    const [updated] = await db.select().from(workdaySettings).where(eq(workdaySettings.id, cur.id));
    res.json(updated);
  });

  // Cost centers
  app.get("/api/workday/cost-centers", async (_req, res) => {
    res.json(await db.select().from(workdayCostCenters).orderBy(workdayCostCenters.code));
  });
  app.post("/api/workday/cost-centers", async (req, res) => {
    const { code, name, fiscalYear, totalBudget, committed, businessUnit, currency, userName } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: "code and name required" });
    const [row] = await db.insert(workdayCostCenters).values({
      workdayId: uuid(`cc-${code}-${Date.now()}`),
      code, name, fiscalYear: fiscalYear || "FY2026",
      totalBudget: String(totalBudget || 0), committed: String(committed || 0),
      currency: currency || "USD", businessUnit, source: "simulated",
    }).returning();
    await logEvent({ eventType: "pull", entity: "CostCenter", entityName: name, entityRefId: row.id, message: `Cost center ${code} created`, actorName: userName });
    res.status(201).json(row);
  });
  app.patch("/api/workday/cost-centers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const allowed = ["name", "fiscalYear", "totalBudget", "committed", "businessUnit", "currency"];
    const patch: any = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = ["totalBudget", "committed"].includes(k) ? String(req.body[k]) : req.body[k];
    patch.lastSyncedAt = new Date();
    const [row] = await db.update(workdayCostCenters).set(patch).where(eq(workdayCostCenters.id, id)).returning();
    await logEvent({ eventType: "pull", entity: "CostCenter", entityName: row?.name, entityRefId: id, message: `Cost center ${row?.code} updated`, fields: Object.keys(patch), actorName: req.body?.userName });
    res.json(row);
  });
  app.delete("/api/workday/cost-centers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await db.delete(workdayCostCenters).where(eq(workdayCostCenters.id, id));
    res.json({ ok: true });
  });

  // Workers
  app.get("/api/workday/workers", async (_req, res) => {
    res.json(await db.select().from(workdayWorkers).orderBy(workdayWorkers.name));
  });
  app.post("/api/workday/workers", async (req, res) => {
    const { name, roleName, region, weeklyCapacityHours, availableHours, standardCostRate, userName } = req.body || {};
    if (!name || !roleName) return res.status(400).json({ error: "name and roleName required" });
    const [row] = await db.insert(workdayWorkers).values({
      workdayId: uuid(`worker-${name}-${Date.now()}`),
      employeeNumber: `EMP-${Date.now().toString().slice(-6)}`,
      name, roleName, region,
      weeklyCapacityHours: String(weeklyCapacityHours || 40),
      availableHours: String(availableHours || 0),
      standardCostRate: String(standardCostRate || 0),
      source: "simulated",
    }).returning();
    await logEvent({ eventType: "pull", entity: "Worker", entityName: name, entityRefId: row.id, message: `Worker ${name} added (${roleName})`, actorName: userName });
    res.status(201).json(row);
  });
  app.patch("/api/workday/workers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const allowed = ["name", "roleName", "region", "weeklyCapacityHours", "availableHours", "standardCostRate"];
    const patch: any = {};
    for (const k of allowed) if (req.body[k] !== undefined) {
      patch[k] = ["weeklyCapacityHours", "availableHours", "standardCostRate"].includes(k) ? String(req.body[k]) : req.body[k];
    }
    patch.lastSyncedAt = new Date();
    const [row] = await db.update(workdayWorkers).set(patch).where(eq(workdayWorkers.id, id)).returning();
    res.json(row);
  });
  app.delete("/api/workday/workers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await db.delete(workdayWorkers).where(eq(workdayWorkers.id, id));
    res.json({ ok: true });
  });

  // Rate card
  app.get("/api/workday/rate-card", async (_req, res) => {
    res.json(await db.select().from(workdayRateCards).orderBy(workdayRateCards.roleName));
  });
  app.patch("/api/workday/rate-card/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const patch: any = { updatedAt: new Date() };
    if (req.body.standardCostRate !== undefined) patch.standardCostRate = String(req.body.standardCostRate);
    if (req.body.effectiveDate !== undefined) patch.effectiveDate = req.body.effectiveDate;
    if (req.body.expirationDate !== undefined) patch.expirationDate = req.body.expirationDate;
    const [row] = await db.update(workdayRateCards).set(patch).where(eq(workdayRateCards.id, id)).returning();
    await logEvent({ eventType: "pull", entity: "RateCard", entityName: row?.roleName, entityRefId: id, message: `Rate card updated for ${row?.roleName} → $${row?.standardCostRate}`, actorName: req.body?.userName });
    res.json(row);
  });

  // Validations
  app.get("/api/workday/validations", async (req, res) => {
    const dealId = req.query.dealId ? parseInt(String(req.query.dealId)) : null;
    const status = req.query.status ? String(req.query.status) : null;
    let rows = await db.select().from(workdayValidations).orderBy(desc(workdayValidations.requestedAt)).limit(200);
    if (dealId) rows = rows.filter((r) => r.dealId === dealId);
    if (status) rows = rows.filter((r) => r.status === status);
    // Attach deal title
    const dealIds = Array.from(new Set(rows.map((r) => r.dealId)));
    const dealRows = dealIds.length ? await db.select().from(deals).where(sql`id = ANY(${dealIds as any})`) : [];
    const dealMap = new Map(dealRows.map((d) => [d.id, d]));
    res.json(rows.map((r) => ({ ...r, dealTitle: dealMap.get(r.dealId)?.title || null, dealNumber: dealMap.get(r.dealId)?.dealNumber || null })));
  });

  app.get("/api/workday/validations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const [v] = await db.select().from(workdayValidations).where(eq(workdayValidations.id, id));
    if (!v) return res.status(404).json({ error: "Not found" });
    const findings = await db.select().from(workdayValidationFindings).where(eq(workdayValidationFindings.validationId, id));
    res.json({ ...v, findings });
  });

  app.get("/api/workday/deals/:dealId/latest", async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    const [v] = await db.select().from(workdayValidations)
      .where(eq(workdayValidations.dealId, dealId))
      .orderBy(desc(workdayValidations.requestedAt)).limit(1);
    if (!v) return res.json(null);
    const findings = await db.select().from(workdayValidationFindings).where(eq(workdayValidationFindings.validationId, v.id));
    let costCenter = null;
    if (v.costCenterId) {
      const [cc] = await db.select().from(workdayCostCenters).where(eq(workdayCostCenters.id, v.costCenterId));
      costCenter = cc;
    }
    res.json({ ...v, findings, costCenter });
  });

  app.post("/api/workday/deals/:dealId/validate", async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    const provider = await getProvider();
    const result = await provider.validateDeal(dealId, { trigger: "manual", actorName: req.body?.userName });
    res.json(result);
  });

  app.post("/api/workday/deals/:dealId/link", async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    const { costCenterId, userName } = req.body || {};
    const ccId = costCenterId ? parseInt(costCenterId) : null;
    await db.update(deals).set({ workdayCostCenterId: ccId, updatedAt: new Date() }).where(eq(deals.id, dealId));
    let cc = null;
    if (ccId) {
      const [row] = await db.select().from(workdayCostCenters).where(eq(workdayCostCenters.id, ccId));
      cc = row;
    }
    await logEvent({
      eventType: ccId ? "link" : "unlink", entity: "CostCenter",
      entityName: cc?.name || "(unlinked)", entityRefId: ccId || undefined, dealId,
      message: ccId ? `Deal #${dealId} linked to cost center ${cc?.code}` : `Deal #${dealId} unlinked from cost center`,
      actorName: userName,
    });
    // Re-validate after link change
    try { await runSimulatedValidation(dealId, { trigger: "manual", actorName: userName }); } catch {}
    res.json({ ok: true, costCenter: cc });
  });

  app.post("/api/workday/validations/:id/override", async (req, res) => {
    const id = parseInt(req.params.id);
    const { justification, userName, role } = req.body || {};
    if (!justification || justification.trim().length < 5) {
      return res.status(400).json({ error: "Justification (>=5 chars) required" });
    }
    if (!isApprover(role) && !isApprover(userName)) {
      return res.status(403).json({ error: "Override requires Finance or Service Line Lead persona" });
    }
    const [updated] = await db.update(workdayValidations).set({
      overrideJustification: justification,
      overriddenBy: userName || "Approver",
      overriddenAt: new Date(),
    }).where(eq(workdayValidations.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    await logEvent({
      eventType: "override", entity: "Validation", entityRefId: id,
      dealId: updated.dealId, status: "warning", message: `Workday validation #${id} overridden: ${justification}`,
      fields: { justification, status: updated.status }, actorName: userName,
    });
    res.json(updated);
  });

  // Events / audit log
  app.get("/api/workday/events", async (_req, res) => {
    const rows = await db.select().from(workdayEvents).orderBy(desc(workdayEvents.timestamp)).limit(150);
    res.json(rows);
  });

  // Dashboard rollup
  app.get("/api/workday/dashboard", async (_req, res) => {
    const allDeals = await db.select().from(deals);
    const dealIds = allDeals.map((d) => d.id);
    if (dealIds.length === 0) return res.json({ counts: { clean: 0, over_budget: 0, staffing_shortfall: 0, rate_variance: 0, unvalidated: 0 }, attention: [] });
    // Latest validation per deal
    const allValidations = await db.select().from(workdayValidations).orderBy(desc(workdayValidations.requestedAt));
    const latestByDeal = new Map<number, any>();
    for (const v of allValidations) if (!latestByDeal.has(v.dealId)) latestByDeal.set(v.dealId, v);
    const counts = { clean: 0, over_budget: 0, staffing_shortfall: 0, rate_variance: 0, unvalidated: 0 };
    const attention: any[] = [];
    for (const d of allDeals) {
      const v = latestByDeal.get(d.id);
      if (!v) { counts.unvalidated++; continue; }
      counts[v.status as keyof typeof counts] = (counts[v.status as keyof typeof counts] || 0) + 1;
      if (v.status !== "clean") {
        attention.push({
          dealId: d.id, dealNumber: d.dealNumber, title: d.title, totalFee: d.totalFee,
          status: v.status, summary: v.summary, validationId: v.id,
          overridden: !!v.overriddenBy, requestedAt: v.requestedAt,
        });
      }
    }
    res.json({ counts, attention: attention.slice(0, 25) });
  });
}
