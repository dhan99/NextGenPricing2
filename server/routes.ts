import { Express, Request, Response } from "express";
import { db } from "./db";
import { clients, deals, dealEntities, scopeCatalog, dealScopeItems, scopeTemplates, scopeTemplateItems, assemblyTemplates, assemblyComponents, roles, rateCards, rateCardEntries, pricingLines, scenarios, approvals, promptResponses, activityLog, changeOrders, dynamicsOpportunities, promptSets, promptSetItems, marginTargets } from "../shared/schema";
import { evaluatePracticeLeadTrigger, resolveMarginTarget, type MarginTargetRow, type DealLike } from "../shared/policy";
import { eq, desc, sql, and, count, isNull, isNotNull, asc, inArray } from "drizzle-orm";
import { requirePerm, requireAnyPerm } from "./rbac";

// Load all margin-target rows once and resolve the effective target for a
// given deal. Used everywhere the server needs a target margin (Practice
// Lead routing, agent run risk summary, etc.) so all surfaces agree.
async function loadMarginTargets(): Promise<MarginTargetRow[]> {
  const rows = await db.select().from(marginTargets);
  return rows.map((r) => ({
    scope: r.scope as "firm" | "bu" | "serviceLine",
    scopeKey: r.scopeKey,
    percent: parseFloat(r.percent),
  }));
}

async function resolveTargetForDeal(deal: DealLike) {
  const rows = await loadMarginTargets();
  return resolveMarginTarget(deal, rows);
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Fallback prompt set used only if no governed prompt set is published for the
// deal's BU+service line AND no published cross-service default exists.
// Pricing Operations should publish a real set per BU/service line via /api/prompt-sets.
const STANDARD_PROMPTS: Array<{
  question: string;
  category: string;
  sortOrder: number;
  options: Array<{ label: string; multiplier: string }>;
}> = [
  { question: "How many geographic regions are involved?", category: "Complexity", sortOrder: 1, options: [{ label: "1 region", multiplier: "1.00" }, { label: "2 regions", multiplier: "1.10" }, { label: "3+ regions", multiplier: "1.20" }] },
  { question: "Are there regulatory/compliance requirements?", category: "Compliance", sortOrder: 2, options: [{ label: "None", multiplier: "1.00" }, { label: "Standard compliance", multiplier: "1.05" }, { label: "SOX/HIPAA compliance", multiplier: "1.15" }, { label: "Multi-framework", multiplier: "1.25" }] },
  { question: "What is the expected data volume?", category: "Complexity", sortOrder: 3, options: [{ label: "Small (<100K records)", multiplier: "0.90" }, { label: "Medium (100K-1M)", multiplier: "1.00" }, { label: "Large (1M-10M)", multiplier: "1.10" }, { label: "Very Large (10M+)", multiplier: "1.20" }] },
  { question: "How many integrations are required?", category: "Integration", sortOrder: 4, options: [{ label: "None", multiplier: "1.00" }, { label: "1-2 integrations", multiplier: "1.05" }, { label: "3-4 integrations", multiplier: "1.10" }, { label: "5-8 integrations", multiplier: "1.20" }, { label: "9+ integrations", multiplier: "1.30" }] },
  { question: "Is there an existing system being replaced?", category: "Migration", sortOrder: 5, options: [{ label: "No (greenfield)", multiplier: "0.95" }, { label: "Yes - modern system", multiplier: "1.05" }, { label: "Yes - legacy system", multiplier: "1.10" }, { label: "Yes - multiple systems", multiplier: "1.20" }] },
  { question: "What is the client's technical maturity?", category: "Client", sortOrder: 6, options: [{ label: "High maturity", multiplier: "0.90" }, { label: "Moderate maturity", multiplier: "1.00" }, { label: "Low maturity", multiplier: "1.10" }, { label: "Very low maturity", multiplier: "1.20" }] },
  { question: "Is there a hard deadline or external dependency?", category: "Timeline", sortOrder: 7, options: [{ label: "Flexible timeline", multiplier: "0.95" }, { label: "Preferred deadline", multiplier: "1.00" }, { label: "Hard deadline", multiplier: "1.10" }, { label: "Regulatory deadline", multiplier: "1.20" }] },
  { question: "Where will the project be executed?", category: "Delivery", sortOrder: 8, options: [{ label: "Fully onsite", multiplier: "1.10" }, { label: "Mostly onsite / some offshore", multiplier: "1.05" }, { label: "Hybrid (50/50)", multiplier: "1.00" }, { label: "Mostly offshore / some onsite", multiplier: "0.90" }, { label: "Fully offshore", multiplier: "0.80" }] },
];

type PromptOption = { label: string; multiplier: string };
type PromptAnswerCtx = {
  industry: string;
  segment: string | null;
  region: string | null;
  complexity: string;
  estimatedFee: number;
  oppName: string;
  closeDate: Date | null;
  priorDealCount: number;
  serviceLine: string;
  businessUnit: string;
};

// Match an option whose label contains any of the given keywords (case-insensitive).
function findOption(options: PromptOption[], keywords: string[]): PromptOption | null {
  const lowered = keywords.map((k) => k.toLowerCase());
  for (const opt of options) {
    const lbl = opt.label.toLowerCase();
    if (lowered.some((k) => lbl.includes(k))) return opt;
  }
  return null;
}

// Pick a context-aware answer for one prompt. Returns the chosen option plus a
// per-prompt confidence score and a rationale describing what evidence drove
// the pick. needsReview is set only when we lack signal for that specific
// prompt — not blanket-on across the whole step.
function pickContextualAnswer(
  question: string,
  options: PromptOption[],
  ctx: PromptAnswerCtx,
): { answer: string; multiplier: string; confidence: number; needsReview: boolean; rationale: string } {
  if (!options || options.length === 0) {
    return { answer: "Standard / Medium", multiplier: "1.05", confidence: 0.4, needsReview: true, rationale: "Prompt has no governed options — falling back to neutral baseline." };
  }
  const q = question.toLowerCase();
  const oppName = (ctx.oppName || "").toLowerCase();
  const industry = (ctx.industry || "").toLowerCase();
  const region = (ctx.region || "").toLowerCase();
  const middleIdx = Math.floor((options.length - 1) / 2);
  const neutral = options[middleIdx];

  // Geographic regions
  if (q.includes("geograph") || q.includes("region") || q.includes("countr")) {
    const multi = /global|multinational|multi-?national|international|emea|apac|worldwide|cross-?border/.test(oppName)
      || /global|multinational|international/.test(industry);
    if (multi) {
      const opt = findOption(options, ["3+", "3 +", "multi", "global"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.78, needsReview: false, rationale: "Opportunity name/industry signals multi-region footprint." };
    }
    const opt = findOption(options, ["1 region", "1 country", "single"]) || options[0];
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: "No multi-region signal in opportunity or client profile — assuming single region." };
  }

  // Compliance / regulatory
  if (q.includes("regulat") || q.includes("complian") || q.includes("sox") || q.includes("hipaa")) {
    const heavyReg = /financial|bank|insurance|healthcare|pharma|hospital|life sciences|government|public sector/.test(industry)
      || /sox|hipaa|pci|gdpr|audit|compliance/.test(oppName);
    const multiFw = /sox.*hipaa|hipaa.*sox|multi-?framework|sox.*pci|pci.*sox/.test(oppName + " " + industry);
    if (multiFw) {
      const opt = findOption(options, ["multi", "multiple"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.8, needsReview: false, rationale: "Multiple regulatory frameworks implied by industry/opportunity name." };
    }
    if (heavyReg) {
      const opt = findOption(options, ["sox", "hipaa", "pci"]) || options[Math.min(2, options.length - 1)];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.82, needsReview: false, rationale: `Industry "${ctx.industry}" carries heavy regulatory burden.` };
    }
    const opt = findOption(options, ["standard"]) || neutral;
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.65, needsReview: false, rationale: "No heavy-regulation signal — assuming standard compliance posture." };
  }

  // Data volume — proxy via fee tier
  if (q.includes("data volume") || q.includes("volume of data") || q.includes("records")) {
    const fee = ctx.estimatedFee;
    if (fee >= 750_000) {
      const opt = findOption(options, ["very large", "10m"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `Estimated value $${Math.round(fee).toLocaleString()} suggests very large data footprint.` };
    }
    if (fee >= 250_000) {
      const opt = findOption(options, ["large", "1m"]) || options[Math.min(2, options.length - 1)];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `Estimated value $${Math.round(fee).toLocaleString()} suggests large data footprint.` };
    }
    if (fee >= 75_000) {
      const opt = findOption(options, ["medium"]) || neutral;
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `Mid-range fee suggests medium data footprint.` };
    }
    const opt = findOption(options, ["small"]) || options[0];
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.55, needsReview: true, rationale: "Low/unknown fee — data volume needs reviewer confirmation." };
  }

  // Integrations
  if (q.includes("integration")) {
    if (ctx.complexity === "very_high") {
      const opt = findOption(options, ["9+", "5-8"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.72, needsReview: false, rationale: `Very high complexity template implies many integrations.` };
    }
    if (ctx.complexity === "high") {
      const opt = findOption(options, ["3-4", "5-8"]) || options[Math.min(2, options.length - 1)];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: "High complexity template implies several integrations." };
    }
    if (ctx.complexity === "low") {
      const opt = findOption(options, ["none", "0"]) || options[0];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.65, needsReview: false, rationale: "Low complexity template implies few/no integrations." };
    }
    const opt = findOption(options, ["1-2"]) || neutral;
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.6, needsReview: false, rationale: "Medium complexity — assuming a small number of integrations." };
  }

  // System being replaced / migration
  if (q.includes("replac") || q.includes("migrat") || q.includes("legacy") || q.includes("greenfield")) {
    const isMigration = /migrat|replace|modern|lift.?and.?shift|upgrade|legacy|sunset|cutover/.test(oppName)
      || /migration|cloud|erp/.test(ctx.serviceLine.toLowerCase());
    if (isMigration) {
      const opt = findOption(options, ["legacy"]) || findOption(options, ["yes"]) || options[Math.min(2, options.length - 1)];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.75, needsReview: false, rationale: "Opportunity scope clearly involves replacing/migrating an existing system." };
    }
    const opt = findOption(options, ["greenfield", "no"]) || options[0];
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.6, needsReview: false, rationale: "No migration/replacement signal — assuming greenfield." };
  }

  // Client technical maturity — informed by prior engagement history
  if (q.includes("technical maturity") || q.includes("client") && q.includes("maturity")) {
    if (ctx.priorDealCount >= 3) {
      const opt = findOption(options, ["high"]) || options[0];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.78, needsReview: false, rationale: `${ctx.priorDealCount} prior engagements with this client — high working maturity.` };
    }
    if (ctx.priorDealCount >= 1) {
      const opt = findOption(options, ["moderate"]) || neutral;
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `${ctx.priorDealCount} prior engagement${ctx.priorDealCount === 1 ? "" : "s"} on file — moderate working maturity.` };
    }
    const opt = findOption(options, ["low"]) || options[Math.min(2, options.length - 1)];
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.45, needsReview: true, rationale: "No prior engagement history — maturity is a guess; reviewer should confirm." };
  }

  // Hard deadline / external dependency
  if (q.includes("deadline") || q.includes("dependency") || q.includes("timeline")) {
    if (/regulatory|sox|year-?end|audit|filing|statutory/.test(oppName)) {
      const opt = findOption(options, ["regulatory"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.78, needsReview: false, rationale: "Regulatory/audit framing implies a statutory deadline." };
    }
    if (ctx.closeDate) {
      const days = Math.round((ctx.closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days <= 60 && days >= 0) {
        const opt = findOption(options, ["hard"]) || options[Math.min(2, options.length - 1)];
        return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.75, needsReview: false, rationale: `Close date is ${days} days out — hard deadline.` };
      }
      if (days <= 150) {
        const opt = findOption(options, ["preferred"]) || neutral;
        return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `Close date ~${days} days out — preferred deadline.` };
      }
      const opt = findOption(options, ["flexible"]) || options[0];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: `Close date ~${days} days out — flexible timeline.` };
    }
    return { answer: neutral.label, multiplier: neutral.multiplier, confidence: 0.45, needsReview: true, rationale: "No close date on opportunity — timeline pressure unknown." };
  }

  // Offshore vs onsite execution
  if (q.includes("execut") || q.includes("offshore") || q.includes("onsite") || q.includes("delivery model") || q.includes("delivery location")) {
    const regulated = /financial|bank|insurance|healthcare|pharma|hospital|life sciences|government|public sector|defense|federal|state|municipal/.test(industry)
      || /sox|hipaa|pci|gdpr|classified|fedramp|cjis|itar/.test(oppName);
    const costSensitive = /value|low.?cost|budget|cost-?sensitive|economy|smb|small business|mid-?market/.test(oppName)
      || /value|smb/.test(industry);
    if (regulated) {
      const opt = findOption(options, ["mostly onsite"]) || findOption(options, ["fully onsite", "onsite"]) || options[0];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.75, needsReview: false, rationale: `Regulated industry/opportunity framing — leaning onsite for control & data residency.` };
    }
    if (costSensitive) {
      const opt = findOption(options, ["mostly offshore"]) || findOption(options, ["fully offshore", "offshore"]) || options[options.length - 1];
      return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.7, needsReview: false, rationale: "Cost-sensitive / value-tier framing in opportunity name — leaning offshore-heavy delivery." };
    }
    const opt = findOption(options, ["hybrid", "50/50"]) || neutral;
    return { answer: opt.label, multiplier: opt.multiplier, confidence: 0.6, needsReview: false, rationale: "No strong regulatory or cost-sensitive signal — defaulting to a hybrid delivery mix." };
  }

  // Unknown question: pick neutral middle option, low confidence.
  return {
    answer: neutral.label,
    multiplier: neutral.multiplier,
    confidence: 0.4,
    needsReview: true,
    rationale: "No heuristic mapped this question — neutral baseline pending reviewer input.",
  };
}

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

// Pricing helpers moved to ./services/pricing in F0.5 so the calc-parity
// golden test can call them from outside the route layer. Re-exported here
// at module scope so the rest of routes.ts doesn't have to be edited.
export {
  ROLE_DISTRIBUTION,
  COMPLEXITY_MULTIPLIERS,
  type DealTotals,
  type EntityHourRollup,
  computeDealTotalsFromLines,
  reconcileLine,
  backfillDealTotals,
  persistDealTotals,
  recalcPricingFromScope,
  aggregateScopeByEntity,
  computeEntityTotalsForDeal,
} from "./services/pricing";
import {
  ROLE_DISTRIBUTION,
  COMPLEXITY_MULTIPLIERS,
  type DealTotals,
  computeDealTotalsFromLines,
  reconcileLine,
  backfillDealTotals,
  persistDealTotals,
  recalcPricingFromScope,
  computeEntityTotalsForDeal,
} from "./services/pricing";
import { expandAssembly } from "./services/AssemblyExpansionService";

// (former inline definitions of DealTotals / computeDealTotalsFromLines /
// reconcileLine / backfillDealTotals / persistDealTotals / recalcPricingFromScope
// removed — see server/services/pricing.ts for the canonical implementation.)

import { paramInt, paramStr, headerStr } from "./lib/req";
import { registerDynamicsRoutes, autoPushDeal, pickTemplateForName, tmplKey, linkDealToOpportunity, unlinkOpportunity } from "./dynamics";
import { ERP_TEMPLATE_NAME, ERP_SERVICE_LINE, scaleErpItems, summarizeErpInputs, parseErpInputs, validateErpInputs } from "./erp-scaling";
import {
  COMPLEX_TAX_TEMPLATE_NAME,
  COMPLEX_TAX_SERVICE_LINE,
  COMPLEX_TAX_ROLE_DISTRIBUTION,
  COMPLEX_TAX_INPUT_FIELDS,
  COMPLEX_TAX_INPUT_DEFAULTS,
  COMPLEX_TAX_DEFAULT_INPUTS,
  COMPLEX_TAX_ITEM_META,
  readComplexTaxInputs,
  scaleHoursFor,
  summarizeTaxRollup,
  type ComplexTaxInputs,
} from "./tax-template";
import { autoPushWorkdayProject, getProvider as getWorkdayProvider } from "./workday";
import { autoPushIntappOutcome, runScreeningForDeal, getLatestScreening } from "./intapp";
import {
  registerIntappRoutes,
  onDealSubmittedTrigger,
  assertSubmissionAllowed,
  assertApprovalAllowed,
  onClientChangedTrigger,
  startNightlyRescreenLoop,
} from "./intapp";
import { registerWorkdayRoutes, onDealSaved, onDealSubmitted } from "./workday";
import { dynamicsAccounts } from "../shared/schema";
import { registerCongaRoutes } from "./conga";
import { registerIntakeRoutes } from "./intake";

export function registerRoutes(app: Express) {
  registerDynamicsRoutes(app);
  registerIntappRoutes(app);
  registerIntakeRoutes(app);
  registerWorkdayRoutes(app);
  registerCongaRoutes(app);

  // ========== ADMIN: RESEED ==========
  // Re-runs the production seed orchestrator on demand. Guarded by a shared
  // secret in ADMIN_RESEED_TOKEN. Useful when a deploy lands against an
  // already-existing empty database and you don't want to redeploy just to
  // re-trigger seeding. All steps remain idempotent.
  app.post("/api/admin/reseed", requirePerm("manageRateCards"), async (req: Request, res: Response) => {
    const expected = process.env.ADMIN_RESEED_TOKEN;
    if (!expected) {
      return res.status(503).json({
        error: "Reseed endpoint disabled: set ADMIN_RESEED_TOKEN to enable.",
      });
    }
    const provided = headerStr(req, "x-admin-token") || req.body?.token;
    if (provided !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const { seedAll } = await import("./seed");
      const results = await seedAll();
      const failed = results.filter(r => r.status === "failed");
      res.status(failed.length === 0 ? 200 : 207).json({
        ok: failed.length === 0,
        results,
      });
    } catch (e: any) {
      console.error("[admin:reseed] seedAll() threw:", e);
      res.status(500).json({ error: e?.message || "Reseed failed", code: "seed_failed" });
    }
  });

  // ========== MARGIN TARGETS (single source of truth, Task #33) ==========
  // Returns the firm default plus any per-BU / per-service-line overrides.
  // Service-line overrides may also carry per-SL policy knobs (tech-admin fee,
  // line-item rounding, fixed-fee rounding) that overlay the engagement-input
  // preset defaults when a deal is created/edited.
  function policyNum(v: string | null | undefined): number | null {
    if (v === null || v === undefined) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  app.get("/api/margin-targets", requirePerm("viewMargins"), async (_req: Request, res: Response) => {
    const rows = await db.select().from(marginTargets);
    const firm = rows.find((r) => r.scope === "firm");
    const overrides = rows
      .filter((r) => r.scope !== "firm")
      .map((r) => ({
        id: r.id,
        scope: r.scope as "bu" | "serviceLine",
        scopeKey: r.scopeKey,
        percent: parseFloat(r.percent),
        techAdminFeePct: policyNum(r.techAdminFeePct),
        lineItemRounding: policyNum(r.lineItemRounding),
        fixedFeeRounding: policyNum(r.fixedFeeRounding),
        updatedAt: r.updatedAt,
      }));
    res.json({
      firmDefault: firm ? parseFloat(firm.percent) : null,
      firmUpdatedAt: firm?.updatedAt || null,
      overrides,
    });
  });

  // Returns the resolved target for a given deal — used by the client so
  // every surface lines up with what the server enforces.
  app.get("/api/deals/:id/margin-target", requirePerm("viewMargins"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const [d] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!d) return res.status(404).json({ error: "Deal not found" });
    const resolved = await resolveTargetForDeal(d);
    res.json(resolved);
  });

  function validatePercent(input: any): { value?: number; error?: string } {
    const n = typeof input === "string" ? parseFloat(input) : input;
    if (typeof n !== "number" || !Number.isFinite(n)) return { error: "percent must be a number" };
    if (n < 1 || n > 100) return { error: "percent must be between 1 and 100" };
    return { value: Math.round(n * 100) / 100 };
  }

  // Validate the optional per-service-line policy fields.
  // Each field accepts: missing/undefined (don't touch), null/empty (clear),
  // or a numeric value within bounds. Returns the patch to merge into the row.
  function validatePolicyFields(body: any): {
    patch?: Record<string, string | null>;
    error?: string;
  } {
    const patch: Record<string, string | null> = {};
    const fields: Array<{ key: string; column: string; min: number; max: number; label: string }> = [
      { key: "techAdminFeePct", column: "techAdminFeePct", min: 0, max: 100, label: "tech-admin fee %" },
      { key: "lineItemRounding", column: "lineItemRounding", min: 0, max: 10000, label: "line-item rounding" },
      { key: "fixedFeeRounding", column: "fixedFeeRounding", min: 0, max: 100000, label: "fixed-fee rounding" },
    ];
    for (const f of fields) {
      if (!(f.key in body)) continue; // not provided — leave alone
      const raw = body[f.key];
      if (raw === null || raw === "") { patch[f.column] = null; continue; }
      const n = typeof raw === "string" ? parseFloat(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n) || n < f.min || n > f.max) {
        return { error: `${f.label} must be a number between ${f.min} and ${f.max}` };
      }
      patch[f.column] = String(Math.round(n * 100) / 100);
    }
    return { patch };
  }

  // Set/update the firm-wide default. Idempotent upsert on the singleton row.
  app.put("/api/margin-targets/firm", requirePerm("manageRateCards"), async (req: Request, res: Response) => {
    const v = validatePercent(req.body?.percent);
    if (v.error) return res.status(400).json({ error: v.error });
    const existing = await db.select().from(marginTargets).where(and(eq(marginTargets.scope, "firm"), isNull(marginTargets.scopeKey)));
    if (existing.length > 0) {
      const [updated] = await db.update(marginTargets)
        .set({ percent: String(v.value), updatedAt: new Date() })
        .where(eq(marginTargets.id, existing[0].id))
        .returning();
      return res.json({ id: updated.id, percent: parseFloat(updated.percent) });
    }
    const [created] = await db.insert(marginTargets)
      .values({ scope: "firm", scopeKey: null, percent: String(v.value) })
      .returning();
    res.status(201).json({ id: created.id, percent: parseFloat(created.percent) });
  });

  // Shape an override row for the API response.
  function shapeOverride(r: typeof marginTargets.$inferSelect) {
    return {
      id: r.id,
      scope: r.scope,
      scopeKey: r.scopeKey,
      percent: parseFloat(r.percent),
      techAdminFeePct: policyNum(r.techAdminFeePct),
      lineItemRounding: policyNum(r.lineItemRounding),
      fixedFeeRounding: policyNum(r.fixedFeeRounding),
    };
  }

  // Create a per-BU or per-serviceLine override. The optional policy fields
  // (techAdminFeePct, lineItemRounding, fixedFeeRounding) are only meaningful
  // for service-line scope but accepted on either for forward compatibility.
  app.post("/api/margin-targets/overrides", requirePerm("manageRateCards"), async (req: Request, res: Response) => {
    const { scope, scopeKey } = req.body || {};
    if (scope !== "bu" && scope !== "serviceLine") return res.status(400).json({ error: "scope must be 'bu' or 'serviceLine'" });
    const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
    if (!key) return res.status(400).json({ error: "scopeKey is required" });
    const v = validatePercent(req.body?.percent);
    if (v.error) return res.status(400).json({ error: v.error });
    const policy = validatePolicyFields(req.body || {});
    if (policy.error) return res.status(400).json({ error: policy.error });
    try {
      const [created] = await db.insert(marginTargets)
        .values({ scope, scopeKey: key, percent: String(v.value), ...(policy.patch || {}) })
        .returning();
      res.status(201).json(shapeOverride(created));
    } catch (e: any) {
      if (String(e?.message || "").includes("uniq")) {
        return res.status(409).json({ error: `An override for ${scope} '${key}' already exists.` });
      }
      throw e;
    }
  });

  app.patch("/api/margin-targets/overrides/:id", requirePerm("manageRateCards"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const patch: Record<string, any> = { updatedAt: new Date() };
    if ("percent" in (req.body || {})) {
      const v = validatePercent(req.body.percent);
      if (v.error) return res.status(400).json({ error: v.error });
      patch.percent = String(v.value);
    }
    const policy = validatePolicyFields(req.body || {});
    if (policy.error) return res.status(400).json({ error: policy.error });
    Object.assign(patch, policy.patch || {});
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: "No updatable fields supplied" });
    }
    const [updated] = await db.update(marginTargets)
      .set(patch)
      .where(and(eq(marginTargets.id, id), isNotNull(marginTargets.scopeKey)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Override not found" });
    res.json(shapeOverride(updated));
  });

  app.delete("/api/margin-targets/overrides/:id", requirePerm("manageRateCards"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const result = await db.delete(marginTargets)
      .where(and(eq(marginTargets.id, id), isNotNull(marginTargets.scopeKey)))
      .returning();
    if (result.length === 0) return res.status(404).json({ error: "Override not found" });
    res.json({ ok: true });
  });

  // ========== DASHBOARD ==========
  app.get("/api/dashboard/summary", requirePerm("viewDashboard"), async (_req: Request, res: Response) => {
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
  app.get("/api/clients", requirePerm("viewDeals"), async (_req: Request, res: Response) => {
    const result = await db.select().from(clients).orderBy(clients.name);
    res.json(result);
  });

  app.get("/api/clients/:id", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const [result] = await db.select().from(clients).where(eq(clients.id, paramInt(req, "id")));
    if (!result) return res.status(404).json({ error: "Client not found" });
    res.json(result);
  });

  app.patch("/api/clients/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [prior] = await db.select().from(clients).where(eq(clients.id, id));
    if (!prior) return res.status(404).json({ error: "Client not found" });
    const [updated] = await db.update(clients).set(req.body).where(eq(clients.id, id)).returning();
    // Fire Intapp client-change trigger when risk-relevant attributes change.
    const watched = ["industry", "region", "relationshipYears", "name"];
    const changed = watched.some(k => req.body?.[k] !== undefined && (prior as any)[k] !== updated[k as keyof typeof updated]);
    if (changed) {
      const actor = (headerStr(req, "x-user-name") || "Client Edit").trim();
      onClientChangedTrigger(id, actor).catch(() => {});
    }
    res.json(updated);
  });

  // ========== DEALS ==========
  app.get("/api/deals", requirePerm("viewDeals"), async (req: Request, res: Response) => {
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

  app.get("/api/deals/:id", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const result = await db.query.deals.findFirst({
      where: eq(deals.id, paramInt(req, "id")),
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
    const [link] = await db.select({
      dealpadDealId: dynamicsOpportunities.dealpadDealId,
      id: dynamicsOpportunities.id,
      opportunityNumber: dynamicsOpportunities.opportunityNumber,
      accountName: dynamicsOpportunities.accountName,
      stage: dynamicsOpportunities.stage,
    }).from(dynamicsOpportunities).where(eq(dynamicsOpportunities.dealpadDealId, result.id));
    res.json({ ...result, dynamicsLink: link || null });
  });

  // Lightweight: re-sum pricing lines and write totals back to the deal header.
  // Used by the Review checklist "Recalculate" action to clear calc-parity mismatches.
  app.post("/api/deals/:id/recalc-totals", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal id" });
    // Single source of truth: persistDealTotals applies T&M / Tech & Admin /
    // line rounding via the shared helper, so this endpoint can no longer
    // produce a deal total that disagrees with what the Pricing Grid shows.
    const totals = await persistDealTotals(dealId);
    const lineCount = (await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId))).length;
    await db.insert(activityLog).values({
      dealId, action: "totals_recalculated",
      description: `Header totals refreshed from ${lineCount} pricing line${lineCount === 1 ? "" : "s"} (fee ${totals?.totalFee?.toFixed?.(2) ?? "0.00"}, hrs ${totals?.totalHours?.toFixed?.(2) ?? "0.00"})`,
      userName: "System",
    });
    res.json({ success: true, ...(totals || {}) });
  });

  app.post("/api/deals", requirePerm("createDeals"), async (req: Request, res: Response) => {
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

    // Auto-open an Intapp Intake request for the new deal — the same way a
    // matter request would be opened in Intapp the moment scoping starts.
    // Non-fatal: a simulator hiccup must never block deal creation.
    try {
      const { ensureIntakeRequest } = await import("./intake");
      await ensureIntakeRequest(newDeal.id, req.body.pdlName || "DealPad Auto");
    } catch (e: any) {
      console.error(`[intake] auto-open failed for deal ${newDeal.id}:`, e?.message || e);
    }

    res.status(201).json(newDeal);
  });

  app.patch("/api/deals/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const [prior] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!prior) return res.status(404).json({ error: "Deal not found" });
    // SERVER-SIDE GATING: terminal status transitions (`approved` / `rejected`) MUST
    // go through the approval workflow (POST /api/deals/:dealId/approvals followed
    // by PATCH /api/approvals/:id), which runs the Intapp re-screen and the
    // approval state machine. Refuse to set those statuses directly here so a
    // caller with editDeals can't bypass the approval gate.
    if (
      (req.body?.status === "approved" || req.body?.status === "rejected") &&
      prior.status !== req.body.status
    ) {
      return res.status(409).json({
        error: "direct_status_transition_forbidden",
        message: `Deals cannot be moved to "${req.body.status}" directly. Use the approval workflow.`,
        from: prior.status,
        to: req.body.status,
      });
    }
    // SERVER-SIDE GATING: a status transition to "submitted" must pass Intapp screening.
    if (req.body?.status === "submitted" && prior.status !== "submitted") {
      const actor = (headerStr(req, "x-user-name") || req.body?.userName || "Unknown").trim();
      const gate = await assertSubmissionAllowed(dealId, actor);
      if (!gate.allow) {
        return res.status(409).json({ error: gate.reason, code: "intapp_conflict", screening: gate.screening });
      }
    }

    // Engagement Inputs: validate against the service-line preset, clamp ranges,
    // and merge with the existing row to avoid last-write-wins races on per-field edits.
    const patch: any = { ...req.body, updatedAt: new Date() };
    // Per-deal margin target override (Task #33). Accept null/empty to clear,
    // or a sensible percent in [1,100]. Stored as decimal string in PG.
    if ("targetMarginPercent" in req.body) {
      const raw = req.body.targetMarginPercent;
      if (raw === null || raw === "" || raw === undefined) {
        patch.targetMarginPercent = null;
      } else {
        const n = typeof raw === "string" ? parseFloat(raw) : raw;
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          return res.status(400).json({ error: "targetMarginPercent must be a number between 1 and 100" });
        }
        patch.targetMarginPercent = String(Math.round(n * 100) / 100);
      }
    }
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
      // For Tax-Corporate deals, rescale Tax-coded scope items from the
      // freshly-saved engagement inputs FIRST so recalcPricingFromScope
      // reads the updated quantities + per-unit hours. rescaleTaxScope is
      // a no-op (returns null) for non-Tax deals or deals with no scope.
      if (req.body.engagementInputs !== undefined && finalRow.serviceLine === COMPLEX_TAX_SERVICE_LINE) {
        await rescaleTaxScope(dealId).catch(() => null);
      } else {
        await recalcPricingFromScope(dealId);
      }
      if (!changedFields.includes("totalFee")) changedFields.push("totalFee", "totalCost", "totalHours");
      // Re-fetch so the response carries the freshly recalculated totals
      const [refetched] = await db.select().from(deals).where(eq(deals.id, dealId));
      if (refetched) finalRow = refetched;
    }
    autoPushDeal(dealId, changedFields, req.body?.userName).catch(() => {});
    if (prior.status !== "submitted" && finalRow.status === "submitted") {
      const actor = (headerStr(req, "x-user-name") || req.body?.userName || "Unknown").trim();
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
      } else if (f.type === "text") {
        // Free-form text input (e.g. comma-separated jurisdiction codes for
        // the Complex Tax preset). Trim, length-bound, and normalise.
        const v = String(raw ?? "").trim();
        if (v.length > 500) {
          return { error: `"${f.label}" must be 500 characters or fewer`, field: key, values: {} };
        }
        out[key] = v;
      }
    }
    return { values: out };
  }

  app.post("/api/deals/:id/archive", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
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

  app.post("/api/deals/:id/restore", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
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
  app.post("/api/deals/:id/submit", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const actor = (headerStr(req, "x-user-name") || req.body?.userName || "Unknown").trim();
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

  app.post("/api/deals/:id/clone", requirePerm("createDeals"), async (req: Request, res: Response) => {
    const source = await db.query.deals.findFirst({
      where: eq(deals.id, paramInt(req, "id")),
      with: { client: true, scopeItems: true, pricingLines: true, promptResponses: true },
    });
    if (!source) return res.status(404).json({ error: "Source deal not found" });

    const isRenewal = req.body.mode === "renewal";
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;

    // Strip any pre-existing "(Renewal)"/"(Copy)" suffixes so we don't end up
    // with titles like "Project X (Renewal) (Renewal) (Renewal)" after a deal
    // is renewed multiple times across cycles.
    const baseTitle = (source.title || "")
      .replace(/(\s*\((?:Renewal|Copy)\))+\s*$/gi, "")
      .trim();
    const title = isRenewal
      ? `${baseTitle} (Renewal)`
      : req.body.title || `${baseTitle} (Copy)`;

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
      // Cloned/renewed deals start with the new line's `rate` as the baseline
      // — overrides from the source deal do NOT carry over silently. The new
      // PDL must re-justify any non-standard rate on this deal.
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
          standardRate: pl.standardRate || pl.rate,
          rateOverridden: false,
          overrideReason: null,
          overrideBy: null,
          overrideAt: null,
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

  app.post("/api/deals/:id/reset-pricing", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
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
        // Reset baseline to the prior-year rate and clear any line-level
        // override metadata — the pricing on this deal has just been re-anchored
        // to the parent, so prior overrides no longer apply.
        standardRate: rate.toFixed(2),
        rateOverridden: false,
        overrideReason: null,
        overrideBy: null,
        overrideAt: null,
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

  app.post("/api/deals/:id/rate-adjust", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const factor = parseFloat(req.body.factor);
    if (!factor || factor <= 0) return res.status(400).json({ error: "Invalid factor" });

    const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    for (const line of lines) {
      const newRate = parseFloat(line.rate) * factor;
      const hours = parseFloat(line.hours || "0");
      const costRate = parseFloat(line.costRate || "0");
      const standardRate = parseFloat(line.standardRate || line.rate || "0");
      const isOverride = standardRate > 0 && Math.abs(newRate - standardRate) > 0.01;
      await db.update(pricingLines).set({
        rate: newRate.toFixed(2),
        fee: (hours * newRate).toFixed(2),
        cost: (hours * costRate).toFixed(2),
        margin: (hours * (newRate - costRate)).toFixed(2),
        // Bulk rate adjustment doesn't redefine the baseline — but it does
        // change the line's relationship to it. Re-derive the override flag
        // so the UI banner stays in sync. Reason/actor are inherited from
        // the bulk action (if anything was already overridden, treat the new
        // rate as still an override; otherwise mark as system-applied so the
        // audit log can identify why).
        rateOverridden: isOverride,
        overrideReason: isOverride ? (line.overrideReason || `Bulk rate adjustment ${((factor - 1) * 100).toFixed(1)}%`) : null,
        overrideBy: isOverride ? (line.overrideBy || req.body.userName || "System") : null,
        overrideAt: isOverride ? (line.overrideAt || new Date()) : null,
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
    "ERP Implementation": {
      label: "ERP Implementation — S/4HANA",
      sourceWorkbook: null,
      defaults: {
        rateYear: "2026",
        tmRateAdjustmentPct: "0",
        techAdminFeePct: "5",
        grossMarginBenchmarkPct: "35",
        lineItemRounding: "100",
        entities: "1",
        countries: "1",
        modules: "FI,CO",
        integrations: "0",
        conversions: "0",
        ricefw: "0",
      },
      fields: [
        { key: "rateYear", label: "Rate Year", type: "select", options: ["2025", "2026"] },
        { key: "tmRateAdjustmentPct", label: "Rate Adjustment (%)", type: "number", suffix: "%" },
        { key: "techAdminFeePct", label: "Tech & Admin Fee (%)", type: "number", suffix: "%" },
        { key: "grossMarginBenchmarkPct", label: "Gross Margin Benchmark (%)", type: "number", suffix: "%" },
        { key: "lineItemRounding", label: "Line Item Rounding ($)", type: "number", prefix: "$" },
        { key: "entities", label: "Legal Entities", type: "number", help: "Number of in-scope legal entities. Drives configuration and cutover effort.", group: "ERP scaling" },
        { key: "countries", label: "Countries / Locales", type: "number", help: "Number of country localizations (tax, payroll, statutory). Drives Explore & Realize effort.", group: "ERP scaling" },
        { key: "modules", label: "Modules in Scope", type: "multiselect", options: ["FI", "CO", "MM", "SD", "PP", "WM", "HR"], help: "Select all in-scope SAP modules. Module-specific Explore/Realize items are only added when the module is selected.", group: "ERP scaling" },
        { key: "integrations", label: "Integrations", type: "number", help: "Count of in-scope integration interfaces. Realize hours scale linearly.", group: "ERP scaling" },
        { key: "conversions", label: "Data Conversion Objects", type: "number", help: "Count of master/transactional data objects to migrate. Realize hours scale linearly.", group: "ERP scaling" },
        { key: "ricefw", label: "RICEFW Objects", type: "number", help: "Count of custom Reports/Interfaces/Conversions/Enhancements/Forms/Workflows.", group: "ERP scaling" },
      ],
    },
    "Tax-Corporate": {
      label: "Tax — Complex Corporate Engagement",
      sourceWorkbook: "Complex Tax Engagement template (parametric)",
      defaults: {
        rateYear: "2026",
        tmBasis: "National",
        tmRateAdjustmentPct: "0",
        techAdminFeePct: "7",
        grossMarginBenchmarkPct: "55",
        lineItemRounding: "100",
        fixedFeeRounding: "1000",
        ...COMPLEX_TAX_INPUT_DEFAULTS,
      },
      fields: [
        { key: "rateYear", label: "Rate Year", type: "select", options: ["2025", "2026"], help: "Select 2026 for projects starting after Jan 1, 2026." },
        { key: "tmBasis", label: "T&M Basis", type: "select", options: ["National", "Geo"], help: "Standard rate (National) or geography-adjusted (Geo)." },
        { key: "tmRateAdjustmentPct", label: "One-time Pricing Adjustment (%)", type: "number", suffix: "%", help: "Applied to T&M rates. Default 0%." },
        { key: "techAdminFeePct", label: "Technology & Admin Fee (%)", type: "number", suffix: "%", help: "7% standard." },
        { key: "grossMarginBenchmarkPct", label: "Gross Margin Benchmark (%)", type: "number", suffix: "%", help: "Tax-Corporate target. Senior-heavy pyramid pulls margin lower than Digital." },
        { key: "lineItemRounding", label: "Line Item Rounding ($)", type: "number", prefix: "$" },
        { key: "fixedFeeRounding", label: "Fixed Fee Total Rounding ($)", type: "number", prefix: "$" },
        ...COMPLEX_TAX_INPUT_FIELDS,
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

  app.get("/api/engagement-input-spec/:serviceLine", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const sl = paramStr(req, "serviceLine");
    const preset = ENGAGEMENT_INPUT_PRESETS[sl] || ENGAGEMENT_INPUT_PRESETS["_generic"];

    // Overlay any per-service-line policy overrides set in Margin Targets admin
    // on top of the preset defaults. Pricing Operations can govern these
    // without a code change.
    const [slRow] = await db.select().from(marginTargets)
      .where(and(eq(marginTargets.scope, "serviceLine"), eq(marginTargets.scopeKey, sl)));
    const defaults = { ...(preset.defaults || {}) };
    const overrideSources: Record<string, "service-line override"> = {};
    if (slRow) {
      if (slRow.techAdminFeePct != null) {
        defaults.techAdminFeePct = String(parseFloat(slRow.techAdminFeePct));
        overrideSources.techAdminFeePct = "service-line override";
      }
      if (slRow.lineItemRounding != null) {
        defaults.lineItemRounding = String(parseFloat(slRow.lineItemRounding));
        overrideSources.lineItemRounding = "service-line override";
      }
      if (slRow.fixedFeeRounding != null) {
        defaults.fixedFeeRounding = String(parseFloat(slRow.fixedFeeRounding));
        overrideSources.fixedFeeRounding = "service-line override";
      }
    }
    res.json({ serviceLine: sl, ...preset, defaults, overrideSources });
  });

  // Shared helper used by the explicit /tax-rescale endpoint and by the
  // PATCH /api/deals handler so editing engagement inputs (entities,
  // jurisdictions, return counts, TP txns) automatically re-scales the
  // Tax scope without requiring a separate UI action.
  async function rescaleTaxScope(dealId: number): Promise<{ updatedCount: number; inputs: ComplexTaxInputs; taxRollup: ReturnType<typeof summarizeTaxRollup> } | null> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal || deal.serviceLine !== COMPLEX_TAX_SERVICE_LINE) return null;
    const inputs: ComplexTaxInputs = readComplexTaxInputs(deal.engagementInputs);

    const dsItems = await db.select().from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    if (dsItems.length === 0) return null;
    const catalogIds = dsItems.map((d) => d.scopeItemId);
    const catRows = await db.select().from(scopeCatalog).where(inArray(scopeCatalog.id, catalogIds));
    const catById = new Map(catRows.map((c) => [c.id, c]));

    const scaledLines: Array<{ code: string; hours: number; explanation: string }> = [];
    let updatedCount = 0;
    for (const ds of dsItems) {
      const cat = catById.get(ds.scopeItemId);
      if (!cat) continue;
      if (!COMPLEX_TAX_ITEM_META[cat.code]) continue;
      const scaled = scaleHoursFor(cat.code, inputs);
      if (!scaled) continue;
      // Store per-unit hours + units count separately so pricing math
      // (qty × adjustedHours × multiplier) does not double-count.
      await db.update(dealScopeItems).set({
        quantity: scaled.quantity,
        adjustedHours: String(scaled.perUnit),
        notes: scaled.explanation,
      }).where(eq(dealScopeItems.id, ds.id));
      scaledLines.push({ code: cat.code, hours: scaled.hours, explanation: scaled.explanation });
      updatedCount++;
    }

    await recalcPricingFromScope(dealId);
    const [refreshed] = await db.select().from(deals).where(eq(deals.id, dealId));
    const fee = parseFloat(refreshed?.totalFee || "0");
    const totalH = scaledLines.reduce((s, l) => s + l.hours, 0) || 1;
    const lineFees = scaledLines.map((l) => ({ code: l.code, hours: l.hours, fee: Math.round((l.hours / totalH) * fee) }));
    const taxRollup = summarizeTaxRollup(lineFees);
    const merged = { ...((refreshed as any)?.engagementInputs || {}), taxRollup };
    await db.update(deals).set({ engagementInputs: merged, updatedAt: new Date() }).where(eq(deals.id, dealId));
    return { updatedCount, inputs, taxRollup };
  }

  // Re-apply Complex Tax parametric scaling using the deal's current
  // engagement_inputs. Reviewer-callable for explicit "recompute" actions.
  app.post("/api/deals/:id/tax-rescale", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    if (Number.isNaN(dealId)) return res.status(400).json({ error: "Invalid id" });
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.serviceLine !== COMPLEX_TAX_SERVICE_LINE) {
      return res.status(400).json({ error: `Tax rescale only applies to ${COMPLEX_TAX_SERVICE_LINE} deals` });
    }
    const dsItems = await db.select().from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    if (dsItems.length === 0) return res.status(400).json({ error: "Deal has no scope items to rescale" });
    const result = await rescaleTaxScope(dealId);
    if (!result) return res.status(400).json({ error: "Nothing to rescale" });
    const { updatedCount: updated, inputs, taxRollup } = result;

    await db.insert(activityLog).values({
      dealId,
      action: "tax_rescale",
      description: `[Tax] Rescaled ${updated} scope item(s): ${inputs.entities} entities · ${inputs.jurisdictions.length} jurisdictions · ${inputs.returnsPerYear} returns · ${inputs.tpTransactions} TP txns`,
      userName: req.body?.userName || headerStr(req, "x-user-name") || "Reviewer",
      metadata: { inputs, taxRollup, updatedCount: updated },
    });

    res.json({ success: true, dealId, updatedCount: updated, inputs, taxRollup });
  });

  app.get("/api/scope-catalog", requireAnyPerm("viewDeals", "manageScopeCatalog"), async (req: Request, res: Response) => {
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

  app.post("/api/scope-catalog", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
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

  app.patch("/api/scope-catalog/:id", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    try {
      const id = paramInt(req, "id");
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

  app.delete("/api/scope-catalog/:id", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
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
  // F1.1.1 — accept ?entityId=N to filter the list to one entity. Without
  // it, returns every scope row on the deal (legacy behaviour). The client
  // could filter the full list itself, but doing it on the server keeps
  // payloads small for deals with dozens of entities × hundreds of rows.
  app.get("/api/deals/:dealId/scope-items", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const rawEntity = req.query.entityId;
    const entityId = typeof rawEntity === "string" && rawEntity.length > 0 ? parseInt(rawEntity, 10) : null;
    if (entityId !== null && (!Number.isFinite(entityId) || entityId <= 0)) {
      return res.status(400).json({ error: "entityId must be a positive integer" });
    }
    const result = await db.query.dealScopeItems.findMany({
      where: entityId !== null
        ? and(eq(dealScopeItems.dealId, dealId), eq(dealScopeItems.entityId, entityId))
        : eq(dealScopeItems.dealId, dealId),
      with: { scopeItem: true },
    });
    res.json(result);
  });

  app.post("/api/deals/:dealId/scope-items", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const cascade = req.body?.cascade !== false; // default true

    // F1.1.1 — pin the row to an entity. The client passes activeEntityId
    // from EntityTabs; if missing, default to the deal's primary entity so
    // legacy callers (autonomous-agent draft, ERP rescaler, snapshot loader)
    // keep working without modification.
    let entityId: number | null = null;
    if (req.body?.entityId != null) {
      const requested = parseInt(String(req.body.entityId), 10);
      if (!Number.isFinite(requested) || requested <= 0) {
        return res.status(400).json({ error: "entityId must be a positive integer", field: "entityId" });
      }
      const [ent] = await db.select({ id: dealEntities.id, dealId: dealEntities.dealId })
        .from(dealEntities).where(eq(dealEntities.id, requested));
      if (!ent) return res.status(404).json({ error: "Entity not found", field: "entityId" });
      if (ent.dealId !== dealId) {
        return res.status(400).json({ error: "Entity belongs to a different deal", field: "entityId", code: "entity_deal_mismatch" });
      }
      entityId = ent.id;
    } else {
      const [primary] = await db.select({ id: dealEntities.id })
        .from(dealEntities).where(and(eq(dealEntities.dealId, dealId), eq(dealEntities.isPrimary, true)));
      entityId = primary?.id ?? null;
    }

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
      entityId,
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
            // F1.1.1 — cascaded children inherit the parent assembly's
            // entityId so per-entity rollups stay consistent.
            entityId,
          }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
          if (ci) cascaded.push(ci);
        }
      }
    }

    await recalcPricingFromScope(dealId);
    res.status(201).json({ ...item, cascadedChildren: cascaded });
  });

  // ========== DEAL ENTITIES (F1.1) ==========
  // Multi-entity worksheets: a single engagement may model several entities
  // (1040 + 1120 + 1065 + 1120S, etc.). Pre-F1.1 deals are pointed at one
  // auto-created "Primary Entity" by 001_multi_entity_backfill, so callers
  // can rely on findMany never returning empty for a real deal.

  // Postgres unique-violation = SQLSTATE 23505. Drizzle's transaction
  // wrapper sometimes surfaces this on `e.cause.code` rather than `e.code`,
  // so check both. Used by both the entity POST and PATCH catch blocks.
  function isUniqueViolation(e: any): boolean {
    return e?.code === "23505" || e?.cause?.code === "23505";
  }

  // Validate the writeable shape for an entity. Returns either {error,field}
  // or {values}. Same shape as validateEngagementInputs in the rigor
  // playbook — narrow inputs at the boundary, never trust req.body.
  function validateEntityPatch(input: any): { error?: string; field?: string; values: Record<string, any> } {
    if (!input || typeof input !== "object") {
      return { error: "Body must be an object", values: {} };
    }
    const out: Record<string, any> = {};
    if ("name" in input) {
      const v = String(input.name ?? "").trim();
      if (!v) return { error: "name cannot be empty", field: "name", values: {} };
      if (v.length > 100) return { error: "name must be 100 characters or fewer", field: "name", values: {} };
      out.name = v;
    }
    if ("entityType" in input) {
      const v = input.entityType == null ? null : String(input.entityType).trim();
      if (v && v.length > 32) return { error: "entityType must be 32 characters or fewer", field: "entityType", values: {} };
      out.entityType = v || null;
    }
    if ("jurisdiction" in input) {
      const v = input.jurisdiction == null ? null : String(input.jurisdiction).trim();
      if (v && v.length > 64) return { error: "jurisdiction must be 64 characters or fewer", field: "jurisdiction", values: {} };
      out.jurisdiction = v || null;
    }
    if ("sortOrder" in input) {
      const n = parseInt(String(input.sortOrder ?? ""), 10);
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        return { error: "sortOrder must be between 0 and 1000", field: "sortOrder", values: {} };
      }
      out.sortOrder = n;
    }
    if ("isPrimary" in input) {
      out.isPrimary = !!input.isPrimary;
    }
    if ("notes" in input) {
      const v = input.notes == null ? null : String(input.notes);
      if (v && v.length > 1000) return { error: "notes must be 1000 characters or fewer", field: "notes", values: {} };
      out.notes = v || null;
    }
    return { values: out };
  }

  // List entities under a deal. Sorted by primary first, then sort_order, then name.
  app.get("/api/deals/:dealId/entities", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    const rows = await db.select().from(dealEntities)
      .where(eq(dealEntities.dealId, dealId))
      .orderBy(desc(dealEntities.isPrimary), asc(dealEntities.sortOrder), asc(dealEntities.name));
    res.json(rows);
  });

  // Create a new entity under a deal. If isPrimary=true, demote any other
  // primary entity for the same deal in the same transaction so we never
  // have two primaries at rest.
  app.post("/api/deals/:dealId/entities", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const [deal] = await db.select({ id: deals.id, title: deals.title }).from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const v = validateEntityPatch(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error, field: v.field });
    if (!v.values.name) return res.status(400).json({ error: "name is required", field: "name" });

    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();

    try {
      const [created] = await db.transaction(async (tx) => {
        if (v.values.isPrimary === true) {
          await tx.update(dealEntities).set({ isPrimary: false, updatedAt: new Date() })
            .where(and(eq(dealEntities.dealId, dealId), eq(dealEntities.isPrimary, true)));
        }
        const [row] = await tx.insert(dealEntities).values({
          dealId,
          name: v.values.name,
          entityType: v.values.entityType ?? null,
          jurisdiction: v.values.jurisdiction ?? null,
          sortOrder: v.values.sortOrder ?? 0,
          isPrimary: v.values.isPrimary === true,
          notes: v.values.notes ?? null,
        }).returning();
        return [row];
      });

      await db.insert(activityLog).values({
        dealId,
        action: "entity_created",
        userName: actor,
        description: `Entity "${created.name}" added to deal`,
        metadata: { entityId: created.id, entityType: created.entityType },
      });
      res.status(201).json(created);
    } catch (e: any) {
      // Unique-index violation on (deal_id, name) — surface a clean 409 so the
      // UI can prompt for a different label rather than dumping the pg error.
      // Drizzle's transaction may rewrap, so check cause as well.
      if (isUniqueViolation(e)) {
        return res.status(409).json({ error: `An entity named "${v.values.name}" already exists on this deal`, code: "duplicate_entity_name" });
      }
      throw e;
    }
  });

  // Update an entity. PATCH takes any subset of {name, entityType,
  // jurisdiction, sortOrder, isPrimary, notes}. Promoting to primary
  // demotes the previous primary in the same transaction.
  app.patch("/api/deal-entities/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const v = validateEntityPatch(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error, field: v.field });
    if (Object.keys(v.values).length === 0) {
      return res.status(400).json({ error: "No updatable fields supplied" });
    }

    const [prior] = await db.select().from(dealEntities).where(eq(dealEntities.id, id));
    if (!prior) return res.status(404).json({ error: "Entity not found" });

    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();

    try {
      const [updated] = await db.transaction(async (tx) => {
        if (v.values.isPrimary === true && !prior.isPrimary) {
          await tx.update(dealEntities).set({ isPrimary: false, updatedAt: new Date() })
            .where(and(eq(dealEntities.dealId, prior.dealId), eq(dealEntities.isPrimary, true)));
        }
        const [row] = await tx.update(dealEntities)
          .set({ ...v.values, updatedAt: new Date() })
          .where(eq(dealEntities.id, id))
          .returning();
        return [row];
      });

      await db.insert(activityLog).values({
        dealId: prior.dealId,
        action: "entity_updated",
        userName: actor,
        description: `Entity "${updated.name}" updated`,
        metadata: { entityId: id, changedFields: Object.keys(v.values) },
      });
      res.json(updated);
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        return res.status(409).json({ error: `Another entity on this deal already uses that name`, code: "duplicate_entity_name" });
      }
      throw e;
    }
  });

  // Delete an entity. Refuse if it's the deal's primary OR if it has any
  // scope_items / pricing_lines pointed at it — caller must reassign first.
  // Returning 409 with a structured `code` so the UI can offer the right
  // remediation (move children, then retry).
  app.delete("/api/deal-entities/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [prior] = await db.select().from(dealEntities).where(eq(dealEntities.id, id));
    if (!prior) return res.status(404).json({ error: "Entity not found" });

    if (prior.isPrimary) {
      return res.status(409).json({
        error: "Cannot delete the primary entity. Promote another entity first.",
        code: "primary_entity_protected",
      });
    }

    const [scopeCount] = await db.select({ c: count() }).from(dealScopeItems)
      .where(eq(dealScopeItems.entityId, id));
    const [pricingCount] = await db.select({ c: count() }).from(pricingLines)
      .where(eq(pricingLines.entityId, id));
    if ((scopeCount?.c ?? 0) > 0 || (pricingCount?.c ?? 0) > 0) {
      return res.status(409).json({
        error: "Entity has attached scope items or pricing lines. Reassign them first.",
        code: "entity_has_children",
        scopeItemCount: scopeCount?.c ?? 0,
        pricingLineCount: pricingCount?.c ?? 0,
      });
    }

    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();
    await db.delete(dealEntities).where(eq(dealEntities.id, id));
    await db.insert(activityLog).values({
      dealId: prior.dealId,
      action: "entity_deleted",
      userName: actor,
      description: `Entity "${prior.name}" deleted`,
      metadata: { entityId: id, entityType: prior.entityType },
    });
    res.status(204).end();
  });

  // F1.1: per-entity hours rollup for a deal. Read-only — uses the same
  // hour math as recalcPricingFromScope (so the UI never disagrees with
  // the pricing engine on what an entity totals to). The deal totalHours
  // returned here equals deals.total_hours after the next persist; if
  // they ever drift, the pricing engine has a bug.
  app.get("/api/deals/:dealId/entity-totals", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    const rollup = await computeEntityTotalsForDeal(dealId);
    res.json(rollup);
  });

  // ========== ASSEMBLY EXPANSION (F1.2) ==========
  // Explicit per-assembly expansion specs that supersede the legacy
  // parent_id cascade. See server/services/AssemblyExpansionService.ts
  // for the math.js sandbox + expansion semantics.

  // List active assembly templates with their parent scope_catalog row
  // (so the picker can show "Tax PHB — 1040 Calculator (assembly TAX-001)").
  app.get("/api/assemblies", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const rows = await db.select({
      id: assemblyTemplates.id,
      scopeItemId: assemblyTemplates.scopeItemId,
      name: assemblyTemplates.name,
      description: assemblyTemplates.description,
      serviceLine: assemblyTemplates.serviceLine,
      version: assemblyTemplates.version,
      isActive: assemblyTemplates.isActive,
      createdAt: assemblyTemplates.createdAt,
      assemblyCode: scopeCatalog.code,
      assemblyName: scopeCatalog.name,
      assemblyCategory: scopeCatalog.category,
    }).from(assemblyTemplates)
      .innerJoin(scopeCatalog, eq(scopeCatalog.id, assemblyTemplates.scopeItemId))
      .where(eq(assemblyTemplates.isActive, true))
      .orderBy(assemblyTemplates.name);
    res.json(rows);
  });

  // Components for one template. Joins the leaf scope_catalog row so the
  // UI can show "Federal 1040 (TAX-101) · default 8h · ultimate=12h".
  app.get("/api/assemblies/:id/components", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [tpl] = await db.select().from(assemblyTemplates).where(eq(assemblyTemplates.id, id));
    if (!tpl) return res.status(404).json({ error: "Assembly template not found" });
    const rows = await db.select({
      id: assemblyComponents.id,
      templateId: assemblyComponents.templateId,
      scopeItemId: assemblyComponents.scopeItemId,
      ultimateTierOverride: assemblyComponents.ultimateTierOverride,
      enhancedTierOverride: assemblyComponents.enhancedTierOverride,
      essentialTierOverride: assemblyComponents.essentialTierOverride,
      quantityFormula: assemblyComponents.quantityFormula,
      promptId: assemblyComponents.promptId,
      sortOrder: assemblyComponents.sortOrder,
      notes: assemblyComponents.notes,
      leafCode: scopeCatalog.code,
      leafName: scopeCatalog.name,
      leafCategory: scopeCatalog.category,
      leafDefaultHours: scopeCatalog.defaultHours,
    }).from(assemblyComponents)
      .innerJoin(scopeCatalog, eq(scopeCatalog.id, assemblyComponents.scopeItemId))
      .where(eq(assemblyComponents.templateId, id))
      .orderBy(asc(assemblyComponents.sortOrder), assemblyComponents.id);
    res.json({ template: tpl, components: rows });
  });

  function parseTier(raw: any): "ultimate" | "enhanced" | "essential" | null {
    if (raw == null) return null;
    const v = String(raw).toLowerCase();
    return v === "ultimate" || v === "enhanced" || v === "essential" ? v : null;
  }

  // Build expansion context from a deal: pulls engagement_inputs +
  // resolved prompt answers. Used by both the dry-run /expand route and
  // the /from-assembly apply route.
  async function buildExpansionContextForDeal(dealId: number, tier: "ultimate" | "enhanced" | "essential" | null) {
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: { promptResponses: true },
    });
    if (!deal) return null;
    const ei = (deal.engagementInputs as Record<string, any>) || {};
    const promptAnswers: Record<string, number> = {};
    for (const p of (deal.promptResponses || [])) {
      // Convention: each prompt is exposed as `prompt_<id>` resolved to
      // its impactMultiplier (a number). Formulas referencing a prompt
      // by id therefore see the impact, not the answer string.
      const m = parseFloat((p as any).impactMultiplier ?? "1");
      promptAnswers[`prompt_${(p as any).id}`] = Number.isFinite(m) ? m : 1;
    }
    return { tier, engagementInputs: ei, promptAnswers };
  }

  // Dry-run expansion. Returns the expansion plan (no DB writes).
  app.post("/api/assemblies/:id/expand", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const dealId = parseInt(String(req.body?.dealId ?? ""), 10);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return res.status(400).json({ error: "dealId is required", field: "dealId" });
    }
    const tier = parseTier(req.body?.tier);

    const [tpl] = await db.select().from(assemblyTemplates).where(eq(assemblyTemplates.id, id));
    if (!tpl) return res.status(404).json({ error: "Assembly template not found" });
    const [d] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    if (!d) return res.status(404).json({ error: "Deal not found" });

    const components = await db.select().from(assemblyComponents)
      .where(eq(assemblyComponents.templateId, id))
      .orderBy(asc(assemblyComponents.sortOrder), assemblyComponents.id);
    if (components.length === 0) {
      return res.json({ template: tpl, lines: [], totalHours: 0, warning: "Template has no components" });
    }
    const leafIds = Array.from(new Set(components.map((c) => c.scopeItemId)));
    const leaves = await db.select().from(scopeCatalog).where(inArray(scopeCatalog.id, leafIds));
    const catalogById = new Map(leaves.map((l) => [l.id, l]));

    const ctx = await buildExpansionContextForDeal(dealId, tier);
    if (!ctx) return res.status(404).json({ error: "Deal not found" });

    try {
      const lines = expandAssembly(components as any, catalogById as any, ctx);
      const totalHours = lines.reduce((s, l) => s + l.quantity * l.adjustedHours, 0);
      res.json({ template: tpl, lines, totalHours });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Expansion failed", code: "expansion_error" });
    }
  });

  // Apply expansion to a deal. Inserts deal_scope_items for every line
  // (skipping any (dealId, scopeItemId) pair already present — same
  // unique-index guard as POST /scope-items). Triggers a single
  // recalcPricingFromScope at the end.
  app.post("/api/deals/:dealId/scope-items/from-assembly", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const tplId = parseInt(String(req.body?.assemblyTemplateId ?? ""), 10);
    if (!Number.isFinite(tplId) || tplId <= 0) {
      return res.status(400).json({ error: "assemblyTemplateId is required", field: "assemblyTemplateId" });
    }
    const tier = parseTier(req.body?.tier);

    const [d] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    if (!d) return res.status(404).json({ error: "Deal not found" });
    const [tpl] = await db.select().from(assemblyTemplates).where(eq(assemblyTemplates.id, tplId));
    if (!tpl) return res.status(404).json({ error: "Assembly template not found" });

    // Validate / default entityId — same shape as POST /scope-items in F1.1.1.
    let entityId: number | null = null;
    if (req.body?.entityId != null) {
      const requested = parseInt(String(req.body.entityId), 10);
      if (!Number.isFinite(requested) || requested <= 0) {
        return res.status(400).json({ error: "entityId must be a positive integer", field: "entityId" });
      }
      const [ent] = await db.select({ id: dealEntities.id, dealId: dealEntities.dealId })
        .from(dealEntities).where(eq(dealEntities.id, requested));
      if (!ent) return res.status(404).json({ error: "Entity not found", field: "entityId" });
      if (ent.dealId !== dealId) {
        return res.status(400).json({ error: "Entity belongs to a different deal", field: "entityId", code: "entity_deal_mismatch" });
      }
      entityId = ent.id;
    } else {
      const [primary] = await db.select({ id: dealEntities.id })
        .from(dealEntities).where(and(eq(dealEntities.dealId, dealId), eq(dealEntities.isPrimary, true)));
      entityId = primary?.id ?? null;
    }

    const components = await db.select().from(assemblyComponents)
      .where(eq(assemblyComponents.templateId, tplId))
      .orderBy(asc(assemblyComponents.sortOrder), assemblyComponents.id);
    if (components.length === 0) {
      return res.status(400).json({ error: "Assembly has no components", code: "empty_assembly" });
    }
    const leafIds = Array.from(new Set(components.map((c) => c.scopeItemId)));
    const leaves = await db.select().from(scopeCatalog).where(inArray(scopeCatalog.id, leafIds));
    const catalogById = new Map(leaves.map((l) => [l.id, l]));

    const ctx = await buildExpansionContextForDeal(dealId, tier);
    if (!ctx) return res.status(404).json({ error: "Deal not found" });

    let lines;
    try {
      lines = expandAssembly(components as any, catalogById as any, ctx);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Expansion failed", code: "expansion_error" });
    }

    const inserted: any[] = [];
    const skipped: any[] = [];
    for (const line of lines) {
      const [row] = await db.insert(dealScopeItems).values({
        dealId,
        scopeItemId: line.scopeItemId,
        quantity: line.quantity,
        adjustedHours: String(line.adjustedHours),
        complexityMultiplier: "1.0",
        entityId,
        notes: `From assembly ${tpl.name} (component ${line.sourceComponentId})`,
      }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
      if (row) inserted.push(row);
      else skipped.push({ scopeItemId: line.scopeItemId, reason: "duplicate" });
    }

    if (inserted.length > 0) {
      await recalcPricingFromScope(dealId);
    }

    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();
    await db.insert(activityLog).values({
      dealId,
      action: "assembly_expanded",
      userName: actor,
      description: `Expanded assembly "${tpl.name}" → ${inserted.length} new line(s), ${skipped.length} skipped (duplicates)`,
      metadata: { assemblyTemplateId: tpl.id, tier, entityId, insertedCount: inserted.length, skippedCount: skipped.length },
    });

    res.status(201).json({ template: tpl, inserted, skipped, expanded: lines });
  });

  // ========== SCOPE TEMPLATES ==========
  app.get("/api/scope-templates", requirePerm("viewDeals"), async (req: Request, res: Response) => {
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

  app.post("/api/deals/:dealId/apply-template/:templateId", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const templateId = paramInt(req, "templateId");
    const items = await db.select().from(scopeTemplateItems).where(eq(scopeTemplateItems.templateId, templateId));
    if (items.length === 0) return res.status(404).json({ error: "Template has no items" });
    const [tplPre] = await db.select().from(scopeTemplates).where(eq(scopeTemplates.id, templateId));
    const isErpTemplate = tplPre?.name === ERP_TEMPLATE_NAME;

    // For ERP, pre-scale hours from the deal's engagement_inputs and gate
    // module-specific items by the modules checklist.
    let erpResultByItemId = new Map<number, ReturnType<typeof scaleErpItems>[number]>();
    if (isErpTemplate) {
      const [dealRow] = await db.select().from(deals).where(eq(deals.id, dealId));
      // Validate engagement inputs BEFORE applying — refusing to silently
      // coerce missing/blank fields to defaults that would understate hours.
      const validationErrors = validateErpInputs(dealRow?.engagementInputs || {});
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Engagement inputs are required for the ERP template.",
          detail: "Fill in the engagement inputs on the Assumptions step before applying this template.",
          code: "erp_inputs_invalid",
          errors: validationErrors,
        });
      }
      const itemIds = items.map(i => i.scopeItemId);
      const cats = itemIds.length > 0
        ? await db.select().from(scopeCatalog).where(inArray(scopeCatalog.id, itemIds))
        : [];
      const scaled = scaleErpItems(
        cats.map(c => ({ id: c.id, code: c.code, defaultHours: c.defaultHours })),
        dealRow?.engagementInputs || {}
      );
      for (const s of scaled) erpResultByItemId.set(s.scopeItemId, s);
    }

    const existing = await db.select({ scopeItemId: dealScopeItems.scopeItemId })
      .from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    const existingIds = new Set(existing.map(e => e.scopeItemId));
    const inserted: any[] = [];
    const skippedInactive: string[] = [];
    const skippedByModule: string[] = [];
    for (const ti of items) {
      if (existingIds.has(ti.scopeItemId)) continue;
      const [catalogItem] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, ti.scopeItemId));
      if (!catalogItem || catalogItem.isActive === false) {
        if (catalogItem) skippedInactive.push(catalogItem.code);
        continue;
      }
      // ERP module gating: skip module-specific items the user did not select.
      const erp = erpResultByItemId.get(ti.scopeItemId);
      if (isErpTemplate && erp && !erp.included) {
        skippedByModule.push(catalogItem.code);
        continue;
      }
      const adjustedHours = erp ? String(erp.adjustedHours)
        : (ti.defaultHours || catalogItem?.defaultHours);
      const notes = erp ? erp.notes : undefined;
      const [row] = await db.insert(dealScopeItems).values({
        dealId,
        scopeItemId: ti.scopeItemId,
        quantity: 1,
        adjustedHours,
        complexityMultiplier: ti.complexityMultiplier || "1.0",
        notes: notes ?? null,
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
    res.status(201).json({ insertedCount: inserted.length, items: inserted, skippedInactive, skippedByModule });
  });

  // Re-apply ERP scaling to existing dealScopeItems for an ERP deal. Reads
  // current engagement_inputs and rewrites each ERP item's adjustedHours +
  // notes (rationale). Module-deselected items are removed; module-selected
  // items missing from the deal are added back. Pricing is then recalculated.
  app.post("/api/deals/:dealId/erp-rescale", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid id" });
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.serviceLine !== ERP_SERVICE_LINE) {
      return res.status(400).json({
        error: "Not an ERP deal",
        detail: `ERP scaling only applies to deals with service line "${ERP_SERVICE_LINE}". This deal is "${deal.serviceLine || "unset"}".`,
      });
    }

    // Same input validation we apply at template-apply time — refuses to
    // re-scale against blank/out-of-range engagement inputs that would
    // silently fall back to defaults and produce misleading hours.
    const validationErrors = validateErpInputs(deal.engagementInputs || {});
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Engagement inputs are required to re-scale ERP hours.",
        detail: "Fill in the engagement inputs on the Assumptions step before re-scaling.",
        code: "erp_inputs_invalid",
        errors: validationErrors,
      });
    }

    // Pull all ERP catalog items (those with codes prefixed ERPPREP/ERPEXPL/...).
    const allCats = await db.select().from(scopeCatalog);
    const erpCats = allCats.filter(c =>
      typeof c.code === "string" && /^ERP(PREP|EXPL|RLZE|DPLY|RUN)-/.test(c.code)
    );
    const scaled = scaleErpItems(
      erpCats.map(c => ({ id: c.id, code: c.code, defaultHours: c.defaultHours })),
      deal.engagementInputs || {}
    );
    const erpItemIds = new Set(erpCats.map(c => c.id));
    const existing = await db.select().from(dealScopeItems)
      .where(eq(dealScopeItems.dealId, dealId));
    const existingByItemId = new Map(existing.map(r => [r.scopeItemId, r]));

    let updated = 0, added = 0, removed = 0;
    for (const s of scaled) {
      const cur = existingByItemId.get(s.scopeItemId);
      if (!s.included) {
        if (cur) {
          await db.delete(dealScopeItems).where(eq(dealScopeItems.id, cur.id));
          removed++;
        }
        continue;
      }
      if (cur) {
        await db.update(dealScopeItems).set({
          adjustedHours: String(s.adjustedHours),
          notes: s.notes,
        }).where(eq(dealScopeItems.id, cur.id));
        updated++;
      } else {
        await db.insert(dealScopeItems).values({
          dealId,
          scopeItemId: s.scopeItemId,
          quantity: 1,
          adjustedHours: String(s.adjustedHours),
          complexityMultiplier: "1.0",
          notes: s.notes,
        }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] });
        added++;
      }
    }

    await recalcPricingFromScope(dealId);
    await db.insert(activityLog).values({
      dealId,
      action: "erp_rescaled",
      description: `ERP scaling re-applied (${summarizeErpInputs(deal.engagementInputs || {})}). +${added} / Δ${updated} / −${removed} items.`,
      userName: headerStr(req, "x-user-name") || req.body?.userName || null,
      metadata: { added, updated, removed, inputs: parseErpInputs(deal.engagementInputs || {}) },
    }).catch(() => {});

    res.json({
      ok: true, added, updated, removed,
      inputsSummary: summarizeErpInputs(deal.engagementInputs || {}),
      scaled: scaled.filter(s => s.included).map(s => ({ code: s.code, hours: s.adjustedHours, multiplier: s.multiplier, notes: s.notes })),
    });
  });

  app.delete("/api/deals/:dealId/scope-items/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    await db.delete(dealScopeItems).where(
      and(eq(dealScopeItems.id, paramInt(req, "id")), eq(dealScopeItems.dealId, dealId))
    );
    await recalcPricingFromScope(dealId);
    res.json({ success: true });
  });

  // ========== ROLES & RATE CARDS ==========
  app.get("/api/roles", requirePerm("viewPricing"), async (_req: Request, res: Response) => {
    const result = await db.select().from(roles).orderBy(roles.sortOrder);
    res.json(result);
  });

  app.get("/api/rate-cards", requirePerm("viewPricing"), async (_req: Request, res: Response) => {
    const result = await db.query.rateCards.findMany({
      orderBy: [desc(rateCards.isActive)],
    });
    res.json(result);
  });

  app.get("/api/rate-cards/:id/entries", requirePerm("viewPricing"), async (req: Request, res: Response) => {
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
      .where(eq(rateCardEntries.rateCardId, paramInt(req, "id")))
      .orderBy(roles.sortOrder);
    res.json(result);
  });

  // ========== PRICING LINES ==========
  app.get("/api/deals/:dealId/pricing", requirePerm("viewPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
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

          // Apply T&M rate adjustment up-front so per-row rate × hours = fee
          // holds even at first creation. Tech & Admin uplift / rounding are
          // shown as explicit footer rows on the deal totals, not silently
          // baked into per-line numbers.
          const ei: any = (deal as any).engagementInputs || {};
          const rateAdjustmentPct = parseFloat(ei.tmRateAdjustmentPct ?? "0") || 0;
          const rateAdjustmentFactor = 1 + rateAdjustmentPct / 100;

          await db.insert(pricingLines).values(
            allRoles.map((r) => {
              const pct = roleDistribution[r.name] || (1 / allRoles.length);
              const hours = Math.max(Math.round(totalHours * pct), 1);
              const standardRate = parseFloat(r.defaultRate || "300");
              const rate = standardRate * rateAdjustmentFactor;
              const costRate = parseFloat(r.costRate || "150");
              const reconciled = reconcileLine(hours, rate, costRate);
              return {
                dealId,
                roleId: r.id,
                hours: reconciled.hours,
                rate: reconciled.rate,
                costRate: reconciled.costRate,
                fee: reconciled.fee,
                cost: reconciled.cost,
                margin: reconciled.margin,
                // Capture the role-card baseline so we can render variance
                // and detect overrides on subsequent edits. The baseline is
                // ALWAYS the unadjusted card rate so override math doesn't
                // get confused by the T&M factor.
                standardRate: standardRate.toFixed(2),
                rateOverridden: false,
              };
            })
          );
          result = await db.query.pricingLines.findMany({
            where: eq(pricingLines.dealId, dealId),
            with: { role: true },
          });
          await persistDealTotals(dealId);
        }
      }
    }
    res.json(result);
  });

  app.post("/api/deals/:dealId/pricing", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const hours = parseFloat(req.body.hours || "0");
    const rate = parseFloat(req.body.rate || "0");
    const costRate = parseFloat(req.body.costRate || "0");
    const reconciled = reconcileLine(hours, rate, costRate);
    const [line] = await db.insert(pricingLines).values({
      dealId,
      ...req.body,
      hours: reconciled.hours,
      rate: reconciled.rate,
      costRate: reconciled.costRate,
      fee: reconciled.fee,
      cost: reconciled.cost,
      margin: reconciled.margin,
    }).returning();
    await persistDealTotals(dealId);
    res.status(201).json(line);
  });

  app.delete("/api/deals/:dealId/pricing", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    await db.delete(pricingLines).where(eq(pricingLines.dealId, dealId));
    await persistDealTotals(dealId);
    res.json({ success: true });
  });

  app.patch("/api/deals/:dealId/pricing/:id", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const lineId = paramInt(req, "id");

    // Load existing line so we know the standardRate baseline and can detect
    // a rate-override transition (none -> overridden, overridden -> reset).
    const [existing] = await db.select().from(pricingLines).where(eq(pricingLines.id, lineId));
    if (!existing) return res.status(404).json({ error: "Pricing line not found" });

    // The baseline is server-controlled. We NEVER let the client influence it
    // through the PATCH body — that would let a caller redefine "standard"
    // and erase variance from the audit trail. If the line predates this
    // column, fall back to its current rate so the override math has a
    // basis; once set, it is permanent for the life of the line.
    const role = await db.query.roles.findFirst({ where: eq(roles.id, existing.roleId) });
    const standardRate = parseFloat(
      existing.standardRate || (role?.defaultRate ?? existing.rate) || "0"
    );

    const hours = parseFloat(req.body.hours ?? existing.hours ?? "0");
    const rate = parseFloat(req.body.rate ?? existing.rate ?? "0");
    const costRate = parseFloat(req.body.costRate ?? existing.costRate ?? "0");

    // Override is detected against the EFFECTIVE standard rate the user
    // actually sees in the grid, which is the role-card baseline times the
    // T&M adjustment factor. Comparing against the unadjusted standardRate
    // would falsely flag every routine edit on a T&M-adjusted line as an
    // override transition (and trip the "overrideReason required" guard).
    const dealForFactor = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    const eiForFactor: any = (dealForFactor as any)?.engagementInputs || {};
    const tmAdjPct = parseFloat(eiForFactor.tmRateAdjustmentPct ?? "0") || 0;
    const tmFactor = 1 + tmAdjPct / 100;
    const effectiveStandard = standardRate * tmFactor;
    const isOverride = effectiveStandard > 0 && Math.abs(rate - effectiveStandard) > 0.01;
    const wasOverride = !!existing.rateOverridden;

    // Server-side enforcement of the same justification rule the UI applies,
    // so direct API calls cannot bypass the audit-trail requirement.
    const proposedReason = (req.body.overrideReason ?? existing.overrideReason ?? "").toString().trim();
    const willTransitionIntoOverride = isOverride && (!wasOverride || parseFloat(existing.rate || "0") !== rate);
    if (willTransitionIntoOverride && proposedReason.length < 5) {
      return res.status(400).json({
        error: "overrideReason must be at least 5 characters when overriding the standard rate.",
      });
    }

    const overrideReason = isOverride ? (proposedReason || null) : null;
    const overrideBy = isOverride
      ? (req.body.overrideBy ?? existing.overrideBy ?? null)
      : null;

    // Strip any caller-supplied baseline / override-state fields before the
    // generic spread so they cannot bypass our derivation above.
    const { standardRate: _ignoreStdRate, rateOverridden: _ignoreFlag,
      overrideAt: _ignoreOverrideAt, ...sanitizedBody } = req.body || {};

    const reconciled = reconcileLine(hours, rate, costRate);
    const updateValues: any = {
      ...sanitizedBody,
      dealId,
      hours: reconciled.hours,
      rate: reconciled.rate,
      costRate: reconciled.costRate,
      fee: reconciled.fee,
      cost: reconciled.cost,
      margin: reconciled.margin,
      standardRate: standardRate.toFixed(2),
      rateOverridden: isOverride,
      overrideReason,
      overrideBy,
    };
    // Stamp override timestamp on transition into override or on a fresh
    // override edit (rate changed while already overridden). Clear on reset.
    if (isOverride) {
      const rateChanged = parseFloat(existing.rate || "0") !== rate;
      if (!wasOverride || rateChanged) updateValues.overrideAt = new Date();
    } else {
      updateValues.overrideAt = null;
    }

    const [updated] = await db.update(pricingLines)
      .set(updateValues)
      .where(eq(pricingLines.id, lineId))
      .returning();

    // Keep deals.totalFee/marginPercent/blendedRate in lockstep with the
    // grid the user is looking at. Without this, the deal-level totals
    // surfaced to Ask AI / proposal / EL drift away on every cell edit.
    await persistDealTotals(dealId);

    // Audit trail: only log on a meaningful override transition or change of
    // override rate, not on every hours edit. Keeps activity feed signal-rich.
    const rateChanged = parseFloat(existing.rate || "0") !== rate;
    if (rateChanged && (isOverride || wasOverride)) {
      const [withRole] = await db.query.pricingLines.findMany({
        where: eq(pricingLines.id, lineId),
        with: { role: true },
        limit: 1,
      });
      const roleName = withRole?.role?.name || `Role ${updated.roleId}`;
      const variancePct = standardRate > 0 ? ((rate - standardRate) / standardRate * 100) : 0;
      let action: string;
      let description: string;
      if (isOverride && !wasOverride) {
        action = "rate_override_set";
        description = `Rate override on ${roleName}: $${standardRate.toFixed(0)} -> $${rate.toFixed(0)} (${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}% vs standard)`;
      } else if (isOverride && wasOverride) {
        action = "rate_override_changed";
        description = `Rate override on ${roleName} updated: $${parseFloat(existing.rate).toFixed(0)} -> $${rate.toFixed(0)} (now ${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}% vs standard $${standardRate.toFixed(0)})`;
      } else {
        action = "rate_override_cleared";
        description = `Rate override on ${roleName} reset to standard ($${standardRate.toFixed(0)}/hr)`;
      }
      await db.insert(activityLog).values({
        dealId,
        action,
        description,
        userName: overrideBy || existing.overrideBy || "PDL",
        metadata: {
          pricingLineId: lineId,
          roleId: updated.roleId,
          roleName,
          standardRate,
          previousRate: parseFloat(existing.rate || "0"),
          newRate: rate,
          variancePct: Number(variancePct.toFixed(2)),
          reason: overrideReason || null,
        },
      });
    }

    res.json(updated);
  });

  // ========== SCENARIOS ==========
  app.get("/api/deals/:dealId/scenarios", requirePerm("viewMargins"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
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
            scenarioType: "option_1", isRecommended: true,
            totalFee: String(Math.round(fee)), totalCost: String(Math.round(cost)),
            totalHours: String(Math.round(hours)), marginPercent: String(stdMargin.toFixed(1)),
            blendedRate: hours > 0 ? String((fee / hours).toFixed(2)) : "0",
            aiReasoning: `Standard delivery model maintaining ${stdMargin.toFixed(0)}% margin with balanced senior-to-junior ratio across ${Math.round(hours)} hours. Meets baseline requirements with predictable delivery timeline.`,
          },
          {
            dealId, name: "Option 2", description: "Senior-heavy team with accelerated timeline",
            scenarioType: "option_2", isRecommended: false,
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

  app.post("/api/deals/:dealId/scenarios/:id/select", requirePerm("editPricing"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const scenarioId = paramInt(req, "id");

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
      // Selecting a scenario re-baselines the line — the scenario rate is
      // the new "standard" for this deal-option pairing. Clear any previous
      // line-level override so the override banner doesn't lie about the new
      // numbers (it would otherwise still show the prior override flag with
      // a baseline that no longer matches the visible rate).
      await db.update(pricingLines).set({
        hours: newHours.toFixed(2),
        rate: newRate.toFixed(2),
        costRate: newCostRate.toFixed(2),
        fee: newFee.toFixed(2),
        cost: newCost.toFixed(2),
        margin: (newFee - newCost).toFixed(2),
        standardRate: newRate.toFixed(2),
        rateOverridden: false,
        overrideReason: null,
        overrideBy: null,
        overrideAt: null,
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
  app.get("/api/deals/:dealId/approvals", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const result = await db.select().from(approvals)
      .where(eq(approvals.dealId, paramInt(req, "dealId")))
      .orderBy(desc(approvals.submittedAt));
    res.json(result);
  });

  app.post("/api/deals/:dealId/approvals", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const actor = (headerStr(req, "x-user-name") || req.body?.submittedBy || req.body?.userName || "Unknown").trim();
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

    // Apply shared approval policy so the approver routed here matches what
    // the Review & Submit checklist promised. If policy requires Practice
    // Lead approval (high fee, low margin, or large scope), override any
    // approver supplied in the request body.
    const dealLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const dealItems = await db.select().from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    const polFee = dealLines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const polCost = dealLines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const polMargin = polFee > 0 ? ((polFee - polCost) / polFee) * 100 : 0;
    const [dealRow] = await db.select().from(deals).where(eq(deals.id, dealId));
    const resolvedTargetA = await resolveTargetForDeal(dealRow || {});
    const trigger = evaluatePracticeLeadTrigger({
      totalFee: polFee,
      marginPercent: polMargin,
      scopeItemCount: dealItems.length,
      targetMarginPercent: resolvedTargetA.percent,
    });

    const approvalPayload: any = { dealId, ...req.body };
    if (trigger.required) {
      approvalPayload.approverRole = "Practice Lead";
      approvalPayload.riskSummary = trigger.reason;
    }

    const [approval] = await db.insert(approvals).values(approvalPayload).returning();

    // Advance the persisted wizard step to "Approvals" (6) so when the user
    // navigates back to the deal detail (e.g. from the Renewal Leadsheet)
    // they land on the approvals tab instead of being bounced back to
    // whatever step they last edited (Scope/Pricing/etc.).
    await db.update(deals)
      .set({ status: "submitted", currentStep: 6 })
      .where(eq(deals.id, dealId));
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

  app.patch("/api/approvals/:id", requirePerm("approveDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const existing = await db.query.approvals.findFirst({ where: eq(approvals.id, id) });
    if (!existing) return res.status(404).json({ error: "approval_not_found" });

    // Enforce stage transition graph:
    //   pending_lead_review | pending  ->  pending_bu_approval | approved | rejected
    //   pending_bu_approval            ->  approved | rejected
    //   approved | rejected            ->  (terminal — no further status changes)
    const next = req.body.status;
    if (next && next !== existing.status) {
      const allowed: Record<string, string[]> = {
        pending: ["pending_bu_approval", "approved", "rejected"],
        pending_lead_review: ["pending_bu_approval", "approved", "rejected"],
        pending_bu_approval: ["approved", "rejected"],
        approved: [],
        rejected: [],
      };
      const ok = (allowed[existing.status] || []).includes(next);
      if (!ok) {
        return res.status(409).json({
          error: "illegal_approval_transition",
          message: `Cannot move approval from "${existing.status}" to "${next}".`,
          from: existing.status,
          to: next,
        });
      }
    }

    // Gate fan-out on an actual status TRANSITION (not just "current value happens to be final").
    // Without this, repeated PATCHes to an already-approved row would re-fire pushes.
    const isTransition = !!next && next !== existing.status;
    const isFinal = isTransition && (next === "approved" || next === "rejected");

    // SERVER-SIDE GATING at the approval-decision point: re-verify the latest
    // Intapp Risk screening before allowing the deal to flip to "approved".
    // Mirrors the submission gate; closes the gap where a conflict surfaced
    // by the nightly re-screen between submit and approve could otherwise
    // slip through unchecked. Rejections are NEVER gated — you should always
    // be able to reject a deal regardless of screening state.
    if (isTransition && next === "approved" && existing.dealId) {
      const actor = (headerStr(req, "x-user-name") || req.body?.userName || req.body?.approverName || "Approver").toString();
      const intappGate = await assertApprovalAllowed(existing.dealId, actor);
      if (!intappGate.allow) {
        return res.status(409).json({
          error: intappGate.reason,
          code: "intapp_conflict",
          screening: intappGate.screening,
        });
      }
    }

    // Whitelist mutable fields. Crucially, never let the request rewrite
    // `dealId` or `id` — otherwise a caller could screen one deal in the
    // gate above and then retarget the post-approval status flip to a
    // different deal. Identity columns and audit timestamps are server-set.
    // Field set is aligned with the `approvals` table in shared/schema.ts.
    const ALLOWED_PATCH_FIELDS = new Set([
      "status",
      "approverName",
      "approverRole",
      "approverEmail",
      "comments",
      "riskSummary",
      "aiNarrative",
      "scenarioId",
    ]);
    const patch: any = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (ALLOWED_PATCH_FIELDS.has(k)) patch[k] = v;
    }
    if (isFinal) patch.decidedAt = new Date();

    // Compare-and-set: only update the row if its status is still what we read above.
    // This ensures concurrent finalization requests can't both succeed and double-fire pushes.
    const [updated] = await db.update(approvals).set(patch)
      .where(and(eq(approvals.id, id), eq(approvals.status, existing.status)))
      .returning();
    if (!updated) {
      return res.status(409).json({
        error: "approval_state_changed",
        message: "Approval was modified concurrently. Reload and try again.",
      });
    }

    if (updated && updated.dealId) {
      if (isFinal) {
        await db.update(deals).set({ status: req.body.status }).where(eq(deals.id, updated.dealId));
        await db.insert(activityLog).values({
          dealId: updated.dealId,
          action: `deal_${req.body.status}`,
          description: `Deal ${req.body.status} by ${updated.approverName || "reviewer"}`,
          userName: updated.approverName || "System",
        });
        // Bi-directional fan-out: push outcome back to all integration platforms.
        autoPushDeal(updated.dealId, ["status"], updated.approverName || undefined).catch(() => {});
        autoPushIntappOutcome(updated.dealId, req.body.status as any, updated.approverName || undefined).catch(() => {});
        if (req.body.status === "approved") {
          autoPushWorkdayProject(updated.dealId, "approval", updated.approverName || undefined).catch(() => {});
        }
      } else if (req.body.status === "pending_bu_approval") {
        await db.insert(activityLog).values({
          dealId: updated.dealId,
          action: "approval_advanced",
          description: `Lead review complete — advanced to BU Approver`,
          userName: req.body.userName || updated.approverName || "System",
        });
      }
    }

    res.json(updated);
  });

  // ========== PROMPT RESPONSES ==========
  app.get("/api/deals/:dealId/prompts", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
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

  app.post("/api/deals/:dealId/prompts", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const [prompt] = await db.insert(promptResponses).values({
      dealId: paramInt(req, "dealId"),
      ...req.body,
    }).returning();
    res.status(201).json(prompt);
  });

  app.patch("/api/deals/:dealId/prompts/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const [updated] = await db.update(promptResponses)
      .set({ answer: req.body.answer, impactMultiplier: req.body.impactMultiplier })
      .where(eq(promptResponses.id, paramInt(req, "id")))
      .returning();
    if (!updated) return res.status(404).json({ error: "Prompt not found" });
    await recalcPricingFromScope(dealId);
    res.json(updated);
  });

  // ========== PROMPT SETS (Pricing Operations governance — US-12) ==========
  // List sets, optionally filtered by status / BU / serviceLine.
  app.get("/api/prompt-sets", requireAnyPerm("viewDeals", "manageScopeCatalog"), async (req: Request, res: Response) => {
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
  app.get("/api/prompt-sets/active", requireAnyPerm("viewDeals", "manageScopeCatalog"), async (req: Request, res: Response) => {
    const bu = (req.query.businessUnit as string) || null;
    const sl = (req.query.serviceLine as string) || null;
    const set = await findActivePromptSet(bu, sl);
    if (!set) return res.json(null);
    const items = await db.select().from(promptSetItems)
      .where(and(eq(promptSetItems.promptSetId, set.id), eq(promptSetItems.enabled, true)))
      .orderBy(asc(promptSetItems.sortOrder));
    res.json({ ...set, items });
  });

  app.get("/api/prompt-sets/:id", requireAnyPerm("viewDeals", "manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [set] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!set) return res.status(404).json({ error: "Prompt set not found" });
    const items = await db.select().from(promptSetItems)
      .where(eq(promptSetItems.promptSetId, id))
      .orderBy(asc(promptSetItems.sortOrder));
    res.json({ ...set, items });
  });

  // Create a new draft set (version starts at 1 unless caller specifies).
  app.post("/api/prompt-sets", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const { name, businessUnit, serviceLine, notes, version } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    const createdBy = (headerStr(req, "x-user-name") || "Unknown").trim();
    const [created] = await db.insert(promptSets).values({
      name, businessUnit: businessUnit || null, serviceLine: serviceLine || null,
      notes: notes || null, version: Number.isFinite(version) ? Math.max(1, parseInt(String(version))) : 1,
      status: "draft", createdBy,
    }).returning();
    res.status(201).json(created);
  });

  // Update draft metadata (cannot edit published sets — clone instead).
  app.patch("/api/prompt-sets/:id", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
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
  app.delete("/api/prompt-sets/:id", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [existing] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!existing) return res.status(404).json({ error: "Prompt set not found" });
    if (existing.status !== "draft") {
      return res.status(409).json({ error: "Only draft sets can be deleted. Archive published sets instead." });
    }
    await db.delete(promptSets).where(eq(promptSets.id, id));
    res.json({ ok: true });
  });

  // Publish a draft. Auto-archives any prior published set with same (BU, serviceLine).
  app.post("/api/prompt-sets/:id/publish", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [existing] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!existing) return res.status(404).json({ error: "Prompt set not found" });
    if (existing.status !== "draft") {
      return res.status(409).json({ error: `Cannot publish a set in status "${existing.status}"` });
    }
    const items = await db.select().from(promptSetItems).where(eq(promptSetItems.promptSetId, id));
    if (items.length === 0) {
      return res.status(400).json({ error: "Cannot publish an empty set — add at least one prompt." });
    }
    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();
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
  app.post("/api/prompt-sets/:id/clone", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const [src] = await db.select().from(promptSets).where(eq(promptSets.id, id));
    if (!src) return res.status(404).json({ error: "Prompt set not found" });
    const sameTuple: any[] = [];
    sameTuple.push(src.businessUnit ? eq(promptSets.businessUnit, src.businessUnit) : isNull(promptSets.businessUnit));
    sameTuple.push(src.serviceLine ? eq(promptSets.serviceLine, src.serviceLine) : isNull(promptSets.serviceLine));
    const siblings = await db.select({ version: promptSets.version }).from(promptSets).where(and(...sameTuple));
    const nextVersion = (siblings.reduce((m, r) => Math.max(m, r.version || 1), 0) || 0) + 1;
    const createdBy = (headerStr(req, "x-user-name") || "Unknown").trim();
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
  app.post("/api/prompt-sets/:id/archive", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
    const actor = (headerStr(req, "x-user-name") || "Unknown").trim();
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

  app.post("/api/prompt-sets/:id/items", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const setId = paramInt(req, "id");
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

  app.patch("/api/prompt-sets/:id/items/:itemId", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const setId = paramInt(req, "id");
    const itemId = paramInt(req, "itemId");
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

  app.delete("/api/prompt-sets/:id/items/:itemId", requirePerm("manageScopeCatalog"), async (req: Request, res: Response) => {
    const setId = paramInt(req, "id");
    const itemId = paramInt(req, "itemId");
    const guard = await assertDraftSet(setId);
    if (guard.error) return res.status(guard.status!).json({ error: guard.error });
    await db.delete(promptSetItems)
      .where(and(eq(promptSetItems.id, itemId), eq(promptSetItems.promptSetId, setId)));
    await db.update(promptSets).set({ updatedAt: new Date() }).where(eq(promptSets.id, setId));
    res.json({ ok: true });
  });

  // ========== AI ENDPOINTS ==========

  app.post("/api/ai/deal-similarity", requirePerm("runAI"), async (req: Request, res: Response) => {
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

  app.post("/api/ai/effort-estimation", requirePerm("runAI"), async (req: Request, res: Response) => {
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

  app.post("/api/ai/margin-advisor", requirePerm("runAI"), async (req: Request, res: Response) => {
    const { pricingLines: lines, dealId, targetMargin: explicitTarget } = req.body;
    if (!lines || !Array.isArray(lines)) {
      return res.json({ suggestions: [], currentMargin: 0 });
    }
    // Resolve target: explicit override (legacy) > deal-resolved > firm fallback.
    let targetMargin: number = typeof explicitTarget === "number" ? explicitTarget : NaN;
    let targetSource = "explicit";
    if (!Number.isFinite(targetMargin)) {
      if (dealId) {
        const [d] = await db.select().from(deals).where(eq(deals.id, parseInt(String(dealId))));
        const resolved = await resolveTargetForDeal(d || {});
        targetMargin = resolved.percent;
        targetSource = resolved.sourceLabel;
      } else {
        const resolved = await resolveTargetForDeal({});
        targetMargin = resolved.percent;
        targetSource = resolved.sourceLabel;
      }
    }

    // Use the canonical totals helper so the advisor's currentMargin matches
    // the Pricing grid footer, the Review & Submit card, and deals.totalFee
    // (all of which apply per-line rounding + tech-admin uplift on top of
    // the raw Σ line.fee). Without this the advisor reports the *raw*
    // margin and disagrees with every other surface in the app.
    let dealEi: any = {};
    if (dealId) {
      const [d] = await db.select().from(deals).where(eq(deals.id, parseInt(String(dealId))));
      dealEi = (d as any)?.engagementInputs || {};
    }
    const ct = computeDealTotalsFromLines(lines, dealEi);
    const totalFee = ct.totalFee;
    const totalCost = ct.totalCost;
    const currentMargin = ct.marginPercent;

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
      targetSource,
      totalFee,
      totalCost,
      isOnTarget: currentMargin >= targetMargin,
      suggestions,
    });
  });

  app.post("/api/ai/scenario-recommendation", requirePerm("runAI"), async (req: Request, res: Response) => {
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

  app.post("/api/ai/risk-summary", requirePerm("runAI"), async (req: Request, res: Response) => {
    const { dealId } = req.body;
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: { client: true, scenarios: true, pricingLines: { with: { role: true } } },
    });

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const margin = parseFloat(deal.marginPercent || "0");
    const resolvedTarget = await resolveTargetForDeal(deal as any);
    const target = resolvedTarget.percent;
    const warnThreshold = Math.max(0, target - 10);
    const riskLevel = margin < warnThreshold ? "High" : margin < target ? "Medium" : "Low";

    const riskFactors = [];
    if (deal.complexity === "high" || deal.complexity === "very_high") {
      riskFactors.push({ factor: "High Complexity", severity: "medium", detail: "Project complexity increases delivery risk" });
    }
    if (margin < target) {
      riskFactors.push({ factor: "Below Target Margin", severity: margin < warnThreshold ? "high" : "medium", detail: `Current margin of ${margin.toFixed(1)}% is below the ${target}% target (${resolvedTarget.sourceLabel})` });
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

  // ========== AUTONOMOUS AGENT DRAFT (Task #22) ==========
  // One-click pipeline: takes a Dynamics opportunity and produces a fully
  // drafted DealPad deal (scope, prompts, pricing, scenarios, risk) in a
  // pendingReviewAgent state for human review. Each step is logged to
  // activityLog with a structured metadata.agentRun payload.
  app.post("/api/dynamics/opportunities/:id/agent-draft", requirePerm("createDeals"), async (req: Request, res: Response) => {
    const oppId = paramInt(req, "id");
    if (isNaN(oppId)) return res.status(400).json({ error: "Invalid id" });
    const userName = (headerStr(req, "x-user-name") || req.body?.userName || "Agent").toString();

    const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, oppId));
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });
    if (opp.dealpadDealId) return res.status(400).json({ error: "Already linked", dealId: opp.dealpadDealId });
    if (!["Develop", "Propose"].includes(opp.stage || "")) {
      return res.status(400).json({ error: `Opportunity stage "${opp.stage}" not eligible (needs Develop or Propose)` });
    }

    // 1. Resolve client (mirror import flow)
    let clientId: number | null = null;
    if (opp.dynamicsAccountId) {
      const [acct] = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.id, opp.dynamicsAccountId));
      clientId = acct?.dealpadClientId ?? null;
    }
    if (!clientId) {
      const [matched] = await db.select().from(clients).where(eq(clients.name, opp.accountName || ""));
      if (matched) clientId = matched.id;
      else {
        const [newClient] = await db.insert(clients).values({
          name: opp.accountName || "Unknown",
          industry: "Professional Services",
          segment: "Mid-Market",
          region: "San Francisco, CA",
        }).returning();
        clientId = newClient.id;
      }
    }

    // 2. Pick template hints (BU/serviceLine/complexity) from opp name
    const tmpl = pickTemplateForName(opp.name);
    const templateKey = tmplKey(opp.name);
    const businessUnit = tmpl?.businessUnit || "Advisory Services";
    const serviceLine = tmpl?.serviceLine || "Strategy Consulting";
    const complexity = tmpl?.complexity || "medium";

    // 3. Create deal in pendingReviewAgent state, currentStep=7 (Summary)
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;
    const [newDeal] = await db.insert(deals).values({
      dealNumber,
      title: opp.name,
      clientId: clientId!,
      status: "pendingReviewAgent",
      dealType: "new",
      businessUnit,
      serviceLine,
      complexity,
      totalFee: opp.estimatedValue || "0",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: opp.estimatedCloseDate || null,
      pdlName: opp.ownerName || null,
      currentStep: 7,
      notes: tmpl?.scopeNotes || null,
    }).returning();

    const dealId = newDeal.id;
    const agentRunSteps: any[] = [];
    const logStep = async (stepKey: string, label: string, summary: string, output: any, confidence: number, needsReview = false) => {
      const entry = { step: stepKey, label, summary, output, confidence, needsReview, ts: new Date().toISOString() };
      agentRunSteps.push(entry);
      await db.insert(activityLog).values({
        dealId,
        action: `agent_${stepKey}`,
        description: `[Agent] ${label}: ${summary}`,
        userName,
        metadata: { agentRun: entry },
      });
    };

    await logStep(
      "setup",
      "Setup drafted",
      `Inferred ${businessUnit} / ${serviceLine} (complexity: ${complexity}) from opportunity name${templateKey ? ` ("${templateKey}" template)` : ""}.`,
      { businessUnit, serviceLine, complexity, templateKey, dealNumber },
      tmpl ? 0.9 : 0.4,
      !tmpl,
    );

    // 4. Link to opportunity
    await linkDealToOpportunity(oppId, dealId, userName).catch(() => {});

    // 5. Default prompts + context-aware auto-answer.
    //    Each prompt is mapped to opportunity attributes (industry, complexity
    //    template hint, estimated value tier, close date, prior engagement
    //    history). Confidence is per-prompt and only the genuinely uncertain
    //    ones are flagged for reviewer attention.
    await createDefaultPrompts(dealId);
    const prompts = await db.select().from(promptResponses).where(eq(promptResponses.dealId, dealId));

    // Load options: governed prompts come from promptSetItems; fallback prompts
    // come from STANDARD_PROMPTS keyed by question.
    const optionsByQuestion = new Map<string, PromptOption[]>();
    const promptSetIds = Array.from(new Set(prompts.map(p => p.promptSetId).filter((x): x is number => !!x)));
    if (promptSetIds.length > 0) {
      const items = await db.select().from(promptSetItems)
        .where(inArray(promptSetItems.promptSetId, promptSetIds));
      for (const it of items) {
        optionsByQuestion.set(`${it.promptSetId}::${it.question}`, (it.options as PromptOption[]) || []);
      }
    }
    const standardOptionsByQuestion = new Map(STANDARD_PROMPTS.map(p => [p.question, p.options]));

    // Prior engagement history for the client (excluding the deal we just created).
    const priorDeals = await db.select({ id: deals.id }).from(deals)
      .where(and(eq(deals.clientId, clientId!), sql`${deals.id} <> ${dealId}`));
    const priorDealCount = priorDeals.length;

    // Resolve client industry (we may have just created a "Professional Services" stub).
    const [clientRow] = await db.select().from(clients).where(eq(clients.id, clientId!));

    const ctx: PromptAnswerCtx = {
      industry: clientRow?.industry || "",
      segment: clientRow?.segment || null,
      region: clientRow?.region || null,
      complexity,
      estimatedFee: parseFloat(opp.estimatedValue || "0") || 0,
      oppName: opp.name || "",
      closeDate: (() => {
        if (!opp.estimatedCloseDate) return null;
        const d = new Date(opp.estimatedCloseDate);
        return isNaN(d.getTime()) ? null : d;
      })(),
      priorDealCount,
      serviceLine,
      businessUnit,
    };

    const promptDetails: any[] = [];
    let lowSignalCount = 0;
    for (const p of prompts) {
      const opts = (p.promptSetId ? optionsByQuestion.get(`${p.promptSetId}::${p.question}`) : null)
        || standardOptionsByQuestion.get(p.question)
        || [];
      const decision = pickContextualAnswer(p.question, opts, ctx);
      await db.update(promptResponses).set({
        answer: decision.answer,
        impactMultiplier: decision.multiplier,
      }).where(eq(promptResponses.id, p.id));
      promptDetails.push({
        question: p.question,
        category: p.category,
        answer: decision.answer,
        multiplier: parseFloat(decision.multiplier),
        confidence: decision.confidence,
        needsReview: decision.needsReview,
        rationale: decision.rationale,
      });
      if (decision.needsReview) lowSignalCount++;
    }
    const avgConfidence = promptDetails.length > 0
      ? promptDetails.reduce((s, d) => s + d.confidence, 0) / promptDetails.length
      : 0.45;
    const stepNeedsReview = lowSignalCount > 0;
    const summary = lowSignalCount === 0
      ? `Answered ${promptDetails.length} contextual prompts from opportunity context (avg confidence ${Math.round(avgConfidence * 100)}%).`
      : `Answered ${promptDetails.length} contextual prompts (avg confidence ${Math.round(avgConfidence * 100)}%). ${lowSignalCount} need reviewer validation.`;
    await logStep(
      "prompts",
      "Assumptions answered",
      summary,
      { prompts: promptDetails, autoAnsweredCount: promptDetails.length, lowSignalCount, avgConfidence },
      avgConfidence,
      stepNeedsReview,
    );

    // 6. UC-2: pick scope items. Layered selection so the agent reliably drafts
    //    4–8 relevant items even when serviceLine tagging is sparse:
    //      (a) prefer items from a matching scopeTemplates row,
    //      (b) merge in catalog rows tagged with the serviceLine OR any
    //          businessUnit-implied keyword,
    //      (c) round out with universal helpers (PMO/Training) so the draft
    //          always lands in the 4–8 range.
    const allCatalog = await db.select().from(scopeCatalog).where(eq(scopeCatalog.isActive, true));
    const catalogById = new Map(allCatalog.map((c) => [c.id, c]));
    const slLower = serviceLine.toLowerCase();
    const buLower = (businessUnit || "").toLowerCase();
    const buKeywordMap: Record<string, string[]> = {
      "audit & assurance": ["financial audit", "risk assurance", "audit"],
      "tax services": ["tax planning", "tax"],
      "technology consulting": [
        "digital transformation", "cloud services", "erp implementation",
        "netsuite", "sage intacct", "data analytics",
      ],
      "risk & compliance": [
        "cybersecurity", "compliance consulting", "risk assurance", "security",
      ],
      "advisory services": ["strategy consulting", "data analytics", "advisory"],
    };
    const expansionTerms = new Set<string>([slLower, ...(buKeywordMap[buLower] || [])]);
    for (const w of slLower.split(/\s+/)) if (w.length > 3) expansionTerms.add(w);

    const picked = new Map<number, typeof allCatalog[number]>();
    const sources: Record<string, string[]> = { template: [], tag: [], universal: [] };

    // 6a. Pull non-assembly items from any active template for this serviceLine.
    const matchingTemplates = await db.select().from(scopeTemplates)
      .where(and(eq(scopeTemplates.isActive, true), eq(scopeTemplates.serviceLine, serviceLine)));
    if (matchingTemplates.length > 0) {
      const tplIds = matchingTemplates.map((t) => t.id);
      const tItems = await db.select().from(scopeTemplateItems)
        .where(inArray(scopeTemplateItems.templateId, tplIds))
        .orderBy(scopeTemplateItems.sortOrder);
      for (const ti of tItems) {
        const cat = catalogById.get(ti.scopeItemId);
        if (!cat || cat.isActive === false || cat.isAssembly) continue;
        if (picked.has(cat.id)) continue;
        picked.set(cat.id, cat);
        sources.template.push(cat.code);
      }
    }

    // 6b. Catalog rows tagged with the serviceLine or a BU-implied keyword.
    for (const c of allCatalog) {
      if (c.isAssembly) continue;
      if (picked.has(c.id)) continue;
      const tags = (c.serviceLines || "").toLowerCase();
      if (!tags) continue;
      const hit = [...expansionTerms].some((term) => term && tags.includes(term));
      if (hit) {
        picked.set(c.id, c);
        sources.tag.push(c.code);
      }
    }

    // 6c. Universal helpers — PM/Training/Testing — to ensure ≥4 items and
    //     give the reviewer a realistic baseline to trim from.
    const universalCodes = ["PMO-001", "TRN-001", "PMO-002", "TEST-002"];
    for (const code of universalCodes) {
      if (picked.size >= 4) break;
      const c = allCatalog.find((x) => x.code === code && !x.isAssembly && x.isActive !== false);
      if (c && !picked.has(c.id)) {
        picked.set(c.id, c);
        sources.universal.push(c.code);
      }
    }

    // Cap at 8, preserving insertion order (template > tag > universal).
    let candidateScope = [...picked.values()].slice(0, 8);
    if (candidateScope.length === 0) {
      candidateScope = allCatalog.filter((c) => !c.isAssembly).slice(0, 5);
    }

    // For ERP-flavoured deals, pre-compute the scaled hours / module gating
    // from sensible default engagement inputs so the agent's draft already
    // reflects the parametric model. Reviewers can re-scale once they tweak
    // the inputs.
    let erpScaleByItemId = new Map<number, ReturnType<typeof scaleErpItems>[number]>();
    if (serviceLine === ERP_SERVICE_LINE) {
      const scaled = scaleErpItems(
        candidateScope.map(c => ({ id: c.id, code: c.code, defaultHours: c.defaultHours })),
        {} // defaults — reviewer can edit on Scope step then click "Re-scale"
      );
      for (const s of scaled) erpScaleByItemId.set(s.scopeItemId, s);
      // Drop module-gated items the defaults excluded.
      candidateScope = candidateScope.filter(c => {
        const s = erpScaleByItemId.get(c.id);
        return !s || s.included;
      });
    }

    // For Complex Tax engagements, prefer ALL items from the matched template
    // (so every workstream is represented) and apply parametric scaling from
    // the deal's engagement inputs. Falls back to the generic 8-item cap for
    // every other service line.
    const isComplexTax = templateKey === COMPLEX_TAX_TEMPLATE_NAME;
    if (isComplexTax) {
      candidateScope = [...picked.values()].filter((c) => COMPLEX_TAX_ITEM_META[c.code]);
      if (candidateScope.length === 0) {
        candidateScope = [...picked.values()].slice(0, 8);
      }
    }

    const taxInputsForAgent = isComplexTax
      ? readComplexTaxInputs(COMPLEX_TAX_INPUT_DEFAULTS)
      : null;

    const insertedScope: any[] = [];
    const scaledTaxLines: Array<{ code: string; hours: number; explanation: string }> = [];
    for (const item of candidateScope) {
      let quantity = 1;
      let hoursStr: string | null = item.defaultHours;
      let notes: string | null = null;
      // ERP parametric scaling (S/4HANA module gating + scaled hours)
      const erp = erpScaleByItemId.get(item.id);
      if (erp) {
        hoursStr = String(erp.adjustedHours);
        notes = erp.notes;
      }
      // Complex Tax parametric scaling (entities × jurisdictions × returns × TP txns).
      // Store per-unit hours + units count separately so the existing pricing
      // math (qty × adjustedHours × multiplier) lands on the scaled total
      // without double-counting.
      if (isComplexTax && taxInputsForAgent && COMPLEX_TAX_ITEM_META[item.code]) {
        const scaled = scaleHoursFor(item.code, taxInputsForAgent);
        if (scaled) {
          // Store per-unit hours and units count separately so the existing
          // pricing math (qty × adjustedHours × multiplier) lands on the
          // scaled total without double-counting.
          quantity = scaled.quantity;
          hoursStr = String(scaled.perUnit);
          notes = scaled.explanation;
          scaledTaxLines.push({ code: item.code, hours: scaled.hours, explanation: scaled.explanation });
        }
      }
      const [row] = await db.insert(dealScopeItems).values({
        dealId,
        scopeItemId: item.id,
        quantity,
        adjustedHours: hoursStr,
        complexityMultiplier: "1.0",
        notes,
      }).onConflictDoNothing({ target: [dealScopeItems.dealId, dealScopeItems.scopeItemId] }).returning();
      if (row) insertedScope.push({
        id: row.id, code: item.code, name: item.name,
        defaultHours: hoursStr, quantity, scalingNote: notes,
      });
    }
    const sourceSummary =
      `template:${sources.template.length} tag:${sources.tag.length} universal:${sources.universal.length}`;
    await logStep(
      "scope",
      "Scope assembled",
      `Added ${insertedScope.length} scope item${insertedScope.length === 1 ? "" : "s"} for ${serviceLine} (${sourceSummary}).`,
      {
        items: insertedScope,
        serviceLine,
        businessUnit,
        totalCandidates: candidateScope.length,
        sources,
        templateMatches: matchingTemplates.map((t) => ({ id: t.id, name: t.name })),
      },
      insertedScope.length >= 4 ? 0.8 : insertedScope.length > 0 ? 0.55 : 0.3,
      insertedScope.length < 4,
    );

    // 7. Seed pricing lines (mirror GET /pricing lazy-init) so recalc has a
    //    line-set to scale.
    const allRoles = await db.select().from(roles).orderBy(roles.sortOrder);
    if (allRoles.length > 0) {
      const baseMul = COMPLEXITY_MULTIPLIERS[complexity] || 1.0;
      const promptMul = 1.05 ** prompts.length;
      const totalMul = baseMul * promptMul;
      const totalHours = insertedScope.length > 0
        ? insertedScope.reduce(
            (s, si) =>
              s +
              Math.round(parseFloat(si.defaultHours || "40") * (si.quantity ?? 1) * totalMul),
            0,
          )
        : Math.round(200 * totalMul);
      const roleDist = isComplexTax ? COMPLEX_TAX_ROLE_DISTRIBUTION : ROLE_DISTRIBUTION;
      await db.insert(pricingLines).values(
        allRoles.map((r) => {
          const pct = roleDist[r.name] || (1 / allRoles.length);
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
    }

    // 8. Recalc totals from scope (rolls up pricing lines and updates the deal header)
    await recalcPricingFromScope(dealId);

    // Re-fetch to get updated header totals
    const [refreshedDeal] = await db.select().from(deals).where(eq(deals.id, dealId));
    const fee = parseFloat(refreshedDeal?.totalFee || "0");
    const cost = parseFloat(refreshedDeal?.totalCost || "0");
    const hours = parseFloat(refreshedDeal?.totalHours || "0");
    const margin = parseFloat(refreshedDeal?.marginPercent || "0");
    const blended = parseFloat(refreshedDeal?.blendedRate || "0");

    // Workstream + recurring/project rollup for complex Tax engagements.
    // Computed by allocating each scope item's share of total hours to its
    // workstream and applying the deal's blended rate, then persisted onto
    // engagement_inputs.taxRollup so the UI can render the split alongside
    // the standard totals.
    let taxRollup: any = null;
    if (isComplexTax && scaledTaxLines.length > 0) {
      const totalScaledH = scaledTaxLines.reduce((s, l) => s + l.hours, 0) || 1;
      const lineFees = scaledTaxLines.map((l) => ({
        code: l.code,
        hours: l.hours,
        fee: Math.round((l.hours / totalScaledH) * fee),
      }));
      taxRollup = summarizeTaxRollup(lineFees);
      const merged = { ...((refreshedDeal as any)?.engagementInputs || {}), ...COMPLEX_TAX_INPUT_DEFAULTS, taxRollup };
      await db.update(deals).set({ engagementInputs: merged, updatedAt: new Date() }).where(eq(deals.id, dealId));
    }

    const pricingOutput: any = { totalFee: fee, totalCost: cost, totalHours: hours, marginPercent: margin, blendedRate: blended, roleCount: allRoles.length };
    let pricingSummary = `Effort estimate: ${hours} hrs across ${allRoles.length} roles. Fee $${fee.toLocaleString()}, margin ${margin.toFixed(1)}%, blended $${blended.toFixed(0)}/hr.`;
    if (taxRollup) {
      pricingOutput.taxRollup = taxRollup;
      pricingOutput.engagementInputs = { ...COMPLEX_TAX_INPUT_DEFAULTS };
      const wsSummary = taxRollup.workstreams
        .map((w: any) => `${w.label}: $${Math.round(w.fee).toLocaleString()}`).join(" · ");
      pricingSummary +=
        ` Recurring $${Math.round(taxRollup.recurring.fee).toLocaleString()} / Project $${Math.round(taxRollup.project.fee).toLocaleString()}.` +
        ` Workstreams — ${wsSummary}.`;
    }
    await logStep(
      "pricing",
      "Pricing computed",
      pricingSummary,
      pricingOutput,
      hours > 0 ? 0.75 : 0.3,
      hours === 0,
    );

    // 9. UC-4: generate scenarios (3 options with Option 1 recommended)
    const baseFee = fee || 100000;
    const baseCost = cost || 70000;
    const baseHours = hours || 400;
    const stdMargin = baseFee > 0 ? ((baseFee - baseCost) / baseFee * 100) : 25;
    const premFee = Math.round(baseFee * 1.15);
    const premHours = Math.round(baseHours * 0.9);
    const premCost = Math.round(baseCost * 1.05);
    const premMargin = premFee > 0 ? ((premFee - premCost) / premFee * 100) : 30;
    const valFee = Math.round(baseFee * 0.85);
    const valHours = Math.round(baseHours * 1.15);
    const valCost = Math.round(baseCost * 0.92);
    const valMargin = valFee > 0 ? ((valFee - valCost) / valFee * 100) : 20;
    await db.delete(scenarios).where(eq(scenarios.dealId, dealId));
    await db.insert(scenarios).values([
      {
        dealId, name: "Option 1", description: "Balanced team composition with standard timeline",
        scenarioType: "option_1", isRecommended: true,
        totalFee: String(Math.round(baseFee)), totalCost: String(Math.round(baseCost)),
        totalHours: String(Math.round(baseHours)), marginPercent: String(stdMargin.toFixed(1)),
        blendedRate: baseHours > 0 ? String((baseFee / baseHours).toFixed(2)) : "0",
        aiReasoning: `Standard delivery model maintaining ${stdMargin.toFixed(0)}% margin with balanced senior-to-junior ratio across ${Math.round(baseHours)} hours.`,
      },
      {
        dealId, name: "Option 2", description: "Senior-heavy team with accelerated timeline",
        scenarioType: "option_2", isRecommended: false,
        totalFee: String(premFee), totalCost: String(premCost),
        totalHours: String(premHours), marginPercent: String(premMargin.toFixed(1)),
        blendedRate: premHours > 0 ? String((premFee / premHours).toFixed(2)) : "0",
        aiReasoning: `Senior-heavy staffing reduces hours to ${premHours} at higher fee; ${premMargin.toFixed(0)}% margin.`,
      },
      {
        dealId, name: "Option 3", description: "Cost-optimized with extended timeline",
        scenarioType: "option_3", isRecommended: false,
        totalFee: String(valFee), totalCost: String(valCost),
        totalHours: String(valHours), marginPercent: String(valMargin.toFixed(1)),
        blendedRate: valHours > 0 ? String((valFee / valHours).toFixed(2)) : "0",
        aiReasoning: `Junior-heavy mix at ${valMargin.toFixed(0)}% margin across ${valHours} hours; budget-conscious.`,
      },
    ]);
    await logStep(
      "scenarios",
      "Scenarios generated",
      `Recommended Option 1 (balanced) at ${stdMargin.toFixed(1)}% margin; alternatives Option 2 (premium) and Option 3 (value) available.`,
      {
        recommended: "Option 1",
        options: [
          { name: "Option 1", fee: Math.round(baseFee), margin: parseFloat(stdMargin.toFixed(1)) },
          { name: "Option 2", fee: premFee, margin: parseFloat(premMargin.toFixed(1)) },
          { name: "Option 3", fee: valFee, margin: parseFloat(valMargin.toFixed(1)) },
        ],
      },
      0.7,
    );

    // 10. UC-5: risk narrative
    const agentResolvedTarget = await resolveTargetForDeal(refreshedDeal as any);
    const agentTarget = agentResolvedTarget.percent;
    const agentWarnThreshold = Math.max(0, agentTarget - 10);
    const riskLevel = margin < agentWarnThreshold ? "High" : margin < agentTarget ? "Medium" : "Low";
    const riskScore = riskLevel === "Low" ? 2.5 : riskLevel === "Medium" ? 5.5 : 8.0;
    const riskFactors: any[] = [];
    if (complexity === "high" || complexity === "very_high") {
      riskFactors.push({ factor: "High Complexity", severity: "medium" });
    }
    if (margin < agentTarget) {
      riskFactors.push({ factor: "Below Target Margin", severity: margin < agentWarnThreshold ? "high" : "medium", detail: `Margin ${margin.toFixed(1)}% is below the ${agentTarget}% target (${agentResolvedTarget.sourceLabel})` });
    }
    if (hours > 1000) {
      riskFactors.push({ factor: "Large Engagement", severity: "low" });
    }
    const narrative = `Agent-drafted ${serviceLine} engagement for ${opp.accountName || "client"} totalling $${fee.toLocaleString()} at ${margin.toFixed(1)}% margin (${riskLevel} risk). ${riskLevel === "Low" ? "Acceptable margin and manageable complexity." : riskLevel === "Medium" ? "Moderate risk factors should be monitored." : "Elevated risk factors require oversight."} Approval likelihood: ${riskLevel === "Low" ? "High (89%)" : riskLevel === "Medium" ? "Moderate (72%)" : "Requires Review (45%)"}.`;
    await db.update(deals).set({
      aiSummary: narrative,
      riskScore: String(riskScore),
      updatedAt: new Date(),
    }).where(eq(deals.id, dealId));
    await logStep(
      "risk",
      "Risk narrative",
      `${riskLevel} risk · score ${riskScore}. ${riskFactors.length} factor${riskFactors.length === 1 ? "" : "s"} identified.`,
      { riskLevel, riskScore, riskFactors, narrative, approvalLikelihood: riskLevel === "Low" ? "High (89%)" : riskLevel === "Medium" ? "Moderate (72%)" : "Requires Review (45%)" },
      0.7,
    );

    // 11. Review checklist — execute Intapp screening, Workday validation,
    //     and a margin/Practice-Lead policy check up front so reviewers see
    //     the full readiness picture on the Summary banner (instead of
    //     surfacing it only at Approve & Submit time).
    const checklist: any = { intapp: null, workday: null, margin: null };
    let checklistConfidence = 0.85;
    let checklistNeedsReview = false;

    try {
      const screen = await runScreeningForDeal(dealId, userName, "agent");
      const latest = await getLatestScreening(dealId);
      checklist.intapp = {
        result: screen.response.result,
        riskTier: screen.response.riskTier,
        hitCount: latest?.hits?.length || 0,
        screeningId: latest?.id,
      };
      if (screen.response.result === "conflict") { checklistNeedsReview = true; checklistConfidence = 0.3; }
      else if (screen.response.result === "review") { checklistNeedsReview = true; checklistConfidence = 0.55; }
    } catch (e: any) {
      checklist.intapp = { error: e?.message || "Intapp screening failed" };
      checklistNeedsReview = true;
      checklistConfidence = Math.min(checklistConfidence, 0.4);
    }

    try {
      const wdProvider = await getWorkdayProvider();
      const wdResult = await wdProvider.validateDeal(dealId, { trigger: "manual", actorName: userName });
      checklist.workday = {
        status: wdResult.status,
        ok: wdResult.ok,
        findingCount: wdResult.findings?.length || 0,
        validationId: wdResult.validationId,
        summary: wdResult.summary,
      };
      if (wdResult.status === "failed") {
        checklistNeedsReview = true; checklistConfidence = Math.min(checklistConfidence, 0.4);
      } else if (!wdResult.ok) {
        checklistNeedsReview = true; checklistConfidence = Math.min(checklistConfidence, 0.65);
      }
    } catch (e: any) {
      checklist.workday = { error: e?.message || "Workday validation failed" };
      checklistNeedsReview = true;
      checklistConfidence = Math.min(checklistConfidence, 0.4);
    }

    const resolvedTargetAgent = await resolveTargetForDeal({ businessUnit, serviceLine, targetMarginPercent: null });
    const marginTrigger = evaluatePracticeLeadTrigger({
      totalFee: fee, marginPercent: margin, scopeItemCount: insertedScope.length,
      targetMarginPercent: resolvedTargetAgent.percent,
    });
    checklist.margin = {
      marginPercent: margin,
      targetMarginPercent: resolvedTargetAgent.percent,
      targetSource: resolvedTargetAgent.sourceLabel,
      practiceLeadRequired: marginTrigger.required,
      reason: marginTrigger.reason,
      belowTarget: margin < resolvedTargetAgent.percent,
    };
    if (marginTrigger.required) { checklistNeedsReview = true; checklistConfidence = Math.min(checklistConfidence, 0.6); }

    const checklistSummary = [
      checklist.intapp?.result ? `Intapp: ${checklist.intapp.result}` : "Intapp: error",
      checklist.workday?.status ? `Workday: ${checklist.workday.status}` : "Workday: error",
      `Margin: ${margin.toFixed(1)}%${marginTrigger.required ? " (Practice Lead required)" : ""}`,
    ].join(" · ");
    await logStep(
      "review",
      "Review checklist",
      checklistSummary,
      checklist,
      checklistConfidence,
      checklistNeedsReview,
    );

    // 12. Final completion entry (so UI can detect "ready for review")
    await db.insert(activityLog).values({
      dealId,
      action: "agent_complete",
      description: `[Agent] Draft complete — ready for human review. ${agentRunSteps.length} pipeline steps executed.`,
      userName,
      metadata: { agentRun: { step: "complete", totalSteps: agentRunSteps.length, opportunityNumber: opp.opportunityNumber } },
    });

    res.status(201).json({
      success: true,
      dealId,
      dealNumber,
      steps: agentRunSteps,
    });
  });

  // Approve & Submit an agent-drafted deal — creates an approval (which the
  // existing routing in shared/policy.ts may upgrade to Practice Lead) and
  // flips the deal to "submitted". Mirrors the wizard's Approve step.
  app.post("/api/deals/:id/agent-approve", requirePerm("createDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const userName = (headerStr(req, "x-user-name") || req.body?.userName || "Reviewer").toString();
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.status !== "pendingReviewAgent") {
      return res.status(400).json({ error: "Only pendingReviewAgent deals can be agent-approved" });
    }

    // Flip to draft so the standard submission gating engages cleanly.
    await db.update(deals).set({ status: "draft", currentStep: 6, updatedAt: new Date() }).where(eq(deals.id, dealId));

    // Run the same gates as the wizard's Approve step.
    const intappGate = await assertSubmissionAllowed(dealId, userName);
    if (!intappGate.allow) {
      // Roll back status so banner re-appears
      await db.update(deals).set({ status: "pendingReviewAgent" }).where(eq(deals.id, dealId));
      return res.status(409).json({ error: intappGate.reason, code: "intapp_conflict", screening: intappGate.screening });
    }
    const wdGate = await onDealSubmitted(dealId, userName);
    if (wdGate.blocked) {
      await db.update(deals).set({ status: "pendingReviewAgent" }).where(eq(deals.id, dealId));
      return res.status(409).json({ error: "WORKDAY_VALIDATION_BLOCKED", message: wdGate.reason, validationId: wdGate.validationId });
    }

    // Apply Practice Lead policy
    const dealLines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const dealItems = await db.select().from(dealScopeItems).where(eq(dealScopeItems.dealId, dealId));
    const polFee = dealLines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const polCost = dealLines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const polMargin = polFee > 0 ? ((polFee - polCost) / polFee) * 100 : 0;
    const resolvedTargetB = await resolveTargetForDeal(deal);
    const trigger = evaluatePracticeLeadTrigger({
      totalFee: polFee,
      marginPercent: polMargin,
      scopeItemCount: dealItems.length,
      targetMarginPercent: resolvedTargetB.percent,
    });

    const approverRole = trigger.required ? "Practice Lead" : "Pricing Director";
    const [approval] = await db.insert(approvals).values({
      dealId,
      approverName: deal.pdlName || userName,
      approverRole,
      status: "pending",
      riskSummary: trigger.required ? trigger.reason : null,
    }).returning();

    await db.update(deals).set({ status: "submitted", updatedAt: new Date() }).where(eq(deals.id, dealId));
    autoPushDeal(dealId, ["status"], userName).catch(() => {});
    onDealSubmittedTrigger(dealId, userName).catch(() => {});
    await db.insert(activityLog).values({
      dealId,
      action: "agent_approved_submitted",
      description: `[Agent] Reviewer ${userName} approved & submitted agent-drafted deal for ${approverRole} review`,
      userName,
      metadata: { agentRun: { step: "approve_submit", approvalId: approval.id, approverRole } },
    });
    res.json({ success: true, approval, status: "submitted" });
  });

  // Discard an agent-drafted deal — archives it (which also unlinks the D365
  // opportunity so it can be re-scoped or re-run).
  app.post("/api/deals/:id/agent-discard", requirePerm("createDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const userName = (headerStr(req, "x-user-name") || req.body?.userName || "Reviewer").toString();
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.status !== "pendingReviewAgent") {
      return res.status(400).json({ error: "Only pendingReviewAgent deals can be agent-discarded" });
    }

    let unlinkedOpp: string | null = null;
    const [linkedOpp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.dealpadDealId, dealId));
    if (linkedOpp) {
      await unlinkOpportunity(linkedOpp.id, userName).catch(() => {});
      unlinkedOpp = linkedOpp.opportunityNumber;
    }

    await db.update(deals).set({
      archivedAt: new Date(),
      archivedBy: userName,
      status: "draft",
      updatedAt: new Date(),
    }).where(eq(deals.id, dealId));

    await db.insert(activityLog).values({
      dealId,
      action: "agent_discarded",
      description: `[Agent] Reviewer ${userName} discarded agent draft${unlinkedOpp ? ` (unlinked from D365 ${unlinkedOpp})` : ""}`,
      userName,
      metadata: { agentRun: { step: "discard", unlinkedOpportunityNumber: unlinkedOpp } },
    });
    res.json({ success: true, unlinkedOpportunityNumber: unlinkedOpp });
  });

  // Open an agent-drafted deal in the wizard for editing — moves currentStep
  // back to 1 and snapshots the pre-edit state to the activity log so the
  // original draft can be compared after Resubmit.
  app.post("/api/deals/:id/agent-open-wizard", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const userName = (headerStr(req, "x-user-name") || req.body?.userName || "Reviewer").toString();
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: { scopeItems: { with: { scopeItem: true } }, pricingLines: true, promptResponses: true },
    });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.status !== "pendingReviewAgent") {
      return res.status(400).json({ error: "Only pendingReviewAgent deals can be opened in the wizard" });
    }

    // Check we haven't already snapshotted to avoid duplicating on repeated opens.
    const existingSnap = await db.select().from(activityLog)
      .where(and(eq(activityLog.dealId, dealId), eq(activityLog.action, "agent_draft_snapshot")));
    if (existingSnap.length === 0) {
      await db.insert(activityLog).values({
        dealId,
        action: "agent_draft_snapshot",
        description: `[Agent] Snapshot of original agent draft preserved before wizard editing by ${userName}`,
        userName,
        metadata: {
          agentRun: {
            step: "snapshot",
            snapshot: {
              totalFee: deal.totalFee, totalCost: deal.totalCost, totalHours: deal.totalHours,
              marginPercent: deal.marginPercent, blendedRate: deal.blendedRate,
              complexity: deal.complexity, businessUnit: deal.businessUnit, serviceLine: deal.serviceLine,
              scopeItemCount: deal.scopeItems?.length || 0,
              pricingLineCount: deal.pricingLines?.length || 0,
              promptResponses: (deal.promptResponses || []).map((p: any) => ({ question: p.question, answer: p.answer, impactMultiplier: p.impactMultiplier })),
              scopeItems: (deal.scopeItems || []).map((s: any) => ({ code: s.scopeItem?.code, name: s.scopeItem?.name, hours: s.adjustedHours })),
            },
          },
        },
      });
    }

    await db.update(deals).set({ currentStep: 1, updatedAt: new Date() }).where(eq(deals.id, dealId));
    res.json({ success: true });
  });

  // Resubmit an agent-drafted deal back to Summary review (status remains
  // pendingReviewAgent so the badge persists). Re-runs the risk narrative
  // against the edited values and logs the resubmission.
  app.post("/api/deals/:id/agent-resubmit", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "id");
    const userName = (headerStr(req, "x-user-name") || req.body?.userName || "Reviewer").toString();
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.status !== "pendingReviewAgent") {
      return res.status(400).json({ error: "Only pendingReviewAgent deals can be agent-resubmitted" });
    }

    // Re-sum totals from pricing lines
    const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
    const sumFee = lines.reduce((s, l) => s + parseFloat(l.fee || "0"), 0);
    const sumCost = lines.reduce((s, l) => s + parseFloat(l.cost || "0"), 0);
    const sumHours = lines.reduce((s, l) => s + parseFloat(l.hours || "0"), 0);
    const margin = sumFee > 0 ? ((sumFee - sumCost) / sumFee) * 100 : 0;
    const blended = sumHours > 0 ? sumFee / sumHours : 0;
    const riskLevel = margin < 20 ? "High" : margin < 25 ? "Medium" : "Low";
    const riskScore = riskLevel === "Low" ? 2.5 : riskLevel === "Medium" ? 5.5 : 8.0;
    const narrative = `[Updated after wizard edits] ${deal.serviceLine || "consulting"} engagement totalling $${sumFee.toLocaleString()} at ${margin.toFixed(1)}% margin (${riskLevel} risk).`;

    await db.update(deals).set({
      totalFee: sumFee.toFixed(2),
      totalCost: sumCost.toFixed(2),
      totalHours: sumHours.toFixed(2),
      marginPercent: margin.toFixed(2),
      blendedRate: blended.toFixed(2),
      aiSummary: narrative,
      riskScore: String(riskScore),
      currentStep: 7,
      updatedAt: new Date(),
    }).where(eq(deals.id, dealId));

    await db.insert(activityLog).values({
      dealId,
      action: "agent_resubmit",
      description: `[Agent] Reviewer ${userName} resubmitted edited draft — fee $${sumFee.toLocaleString()}, margin ${margin.toFixed(1)}%, risk ${riskLevel}`,
      userName,
      metadata: {
        agentRun: {
          step: "resubmit",
          totalFee: sumFee, totalCost: sumCost, totalHours: sumHours,
          marginPercent: margin, blendedRate: blended, riskLevel, riskScore,
        },
      },
    });
    res.json({ success: true });
  });

  // ========== ACTIVITY LOG ==========
  app.get("/api/activity", requirePerm("viewDashboard"), async (_req: Request, res: Response) => {
    const result = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(20);
    res.json(result);
  });

  // ========== ARCHITECTURE CONVERSATIONAL AI ==========
  app.post("/api/ai/architecture-chat", requirePerm("viewArchitecture"), async (req: Request, res: Response) => {
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
      backend: {
        answer: `**Backend architecture:**\n\n**Runtime & framework:** Node.js executed via \`tsx\` (no separate build step in dev) running **Express.js 5.x** as a single long-lived process. Entry point is \`server/index.ts\`, which boots Express, registers middleware, mounts routes, and serves the built SPA from \`dist/public/\` in production.\n\n**Module layout (server/):**\n- \`index.ts\` — process bootstrap, middleware, static SPA fallback\n- \`routes.ts\` — primary REST surface (deals, pricing, scope, scenarios, approvals, prompts, AI, dashboard, activity)\n- \`db.ts\` — Drizzle ORM client + \`pg\` connection pool against \`DATABASE_URL\`\n- \`rbac.ts\` — role -> permission matrix and \`requirePerm()\` middleware\n- \`seed.ts\` — deterministic demo data loader\n- Integration adapters: \`dynamics.ts\` (CRM), \`intapp.ts\` (conflicts/risk), \`workday.ts\` (HR/finance), \`conga.ts\` (document generation) — each isolates its own DTOs, routes, and external-API stubs\n\n**Request pipeline:** JSON body parser -> persona-header extraction -> \`requirePerm()\` RBAC guard -> route handler -> Drizzle query -> JSON response. Errors bubble to a centralized handler that returns shape \`{ error: string }\`.\n\n**Data access:** **Drizzle ORM 0.45** over \`pg\` (node-postgres) against PostgreSQL. Schema is the single source of truth in \`shared/schema.ts\` and shared verbatim with the frontend for type inference. Mutations use parameterized queries; lists use Drizzle's relational \`with\` for eager loading.\n\n**Domain logic:**\n- **Pricing engine** (\`recalcPricingFromScope\`) — deterministic recompute from scope items x complexity x prompt multipliers across 7 roles; pricing lines created lazily on first read.\n- **Scenario generator** — Standard / Premium / Value variants computed on first scenarios-step visit.\n- **Approval state machine** — draft -> submitted -> approved/rejected, enforced at the UI layer (server is permissive for the PoC).\n- **AI services** — 5 deterministic heuristic endpoints under \`/api/ai/*\` (similarity, effort, margin, scenario, risk) plus the architecture chat.\n- **Activity log** — every domain mutation writes an audit row, forming the seed of a future event stream.\n\n**Cross-cutting:**\n- **RBAC** — server-side \`requirePerm("...")\` guards mirror the client AuthContext; mutations are rejected even if a UI button slips through.\n- **Integrations** — Dynamics / Intapp / Workday / Conga are stubbed adapters with realistic DTOs, ready to swap to live APIs.\n- **Configuration** — \`DATABASE_URL\` from env; no other secrets required for the PoC.\n\n**Production target:** Decompose along the existing bounded contexts (Deal, Pricing, Approval, Analytics, Integrations) into Azure Container Apps behind APIM, with Service Bus + Event Grid replacing in-process calls. The current handler shapes (command-style writes, query-style reads) are designed to map 1:1 onto that topology.`,
        sources: ["server/index.ts", "server/routes.ts", "server/db.ts", "server/rbac.ts", "shared/schema.ts"],
        relatedTopics: ["API design", "database", "RBAC", "CQRS readiness", "Azure architecture"]
      },
      cqrs: {
        answer: `**CQRS & Event Sourcing readiness:**\n\nThe PoC is a single-process Express + PostgreSQL monolith, but it is intentionally structured so the path to a CQRS / event-driven topology is incremental rather than a rewrite.\n\n**What is already CQRS-friendly today:**\n- **Bounded contexts** — Deal, Pricing, Scope Catalog, Rate Cards, Scenarios, Approvals, AI, and Integrations (Dynamics / Intapp / Workday / Conga) are isolated in separate route modules and service helpers.\n- **Command-shaped writes** — Mutations go through explicit handlers (createDeal, recalcPricingFromScope, submitApproval, selectScenario, generateScenarios) rather than ad-hoc table updates. These map 1:1 to future commands on a bus.\n- **Query-shaped reads** — Dashboard, Analytics, Deals list, and Pricing read endpoints already use dedicated SELECTs and aggregations distinct from the write paths.\n- **Audit trail** — \`activity_log\` captures domain events (deal.created, scope.added, pricing.recalculated, approval.submitted, scenario.selected) and is the seed of an event stream.\n- **Idempotent recalculation** — recalcPricingFromScope is deterministic from inputs, which is the same invariant a projection rebuild requires.\n- **Integration adapters** — Dynamics, Intapp, Workday, and Conga are isolated behind service modules with their own DTOs, ready to become subscribers on an event bus.\n\n**Gaps to close for full CQRS in production:**\n- Introduce an explicit **command bus** (Azure Service Bus queues) and **event bus** (Azure Event Grid topics) instead of in-process function calls.\n- Promote \`activity_log\` entries to **first-class domain events** with versioned schemas (DealSubmitted v1, PricingRecalculated v1, ApprovalGranted v1, ScenarioSelected v1).\n- Split the write model (normalized PostgreSQL) from **read models / projections** (denormalized views in PostgreSQL or Cosmos DB) for Dashboard, Analytics, and Pipeline queries.\n- Add an **outbox table** so command handlers atomically persist state and enqueue events in the same transaction.\n- Replace lazy pricing-line creation with an **event-driven projector** triggered by ScopeChanged.\n- Adopt **optimistic concurrency** (row version / ETag) on deals and scenarios to make commands safely retriable.\n\n**Recommended phasing:**\n1. Outbox + activity_log -> domain events (no infra change).\n2. Extract Pricing and Approval projections into read models.\n3. Move async work (AI, Conga generation, Workday sync) onto Service Bus.\n4. Decompose Deal, Pricing, Approval, and Analytics into separate Container Apps consuming the bus.\n\nNet: the PoC does not implement CQRS, but every write path, read path, and integration boundary has been shaped so the migration is additive.`,
        sources: ["server/routes.ts (command-shaped handlers)", "shared/schema.ts (activity_log)", "DealPad_Architecture_Document.md (Section 13)"],
        relatedTopics: ["Azure architecture", "deployment", "API design", "deal lifecycle"]
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
      [["backend", "backend architecture", "express", "server architecture", "node.js", "nodejs", "tsx", "request pipeline", "middleware", "drizzle", "server-side", "server side"], "backend"],
      [["cqrs", "event sourcing", "event-sourcing", "command query", "command bus", "event bus", "read model", "write model", "projection", "outbox", "event-driven", "event driven", "domain event", "bounded context", "service bus", "event grid"], "cqrs"],
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

  app.get("/api/ai/dashboard-insights", requirePerm("viewDashboard"), async (req: Request, res: Response) => {
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

  // ========== ASK DEALPAD AI (contextual) ==========
  app.post("/api/ai/ask", requirePerm("runAI"), async (req: Request, res: Response) => {
    const { question, context, role } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    const rawRole = role || headerStr(req, "x-user-role");
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

    // Dashboard chat: portfolio-wide topics gated by ROLE_CAPABILITIES.
    if (screen === "dashboard") {
      try {
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

        const matched = topics.find(t => t.keys.some(k => q.includes(k)));
        let answer: string;
        let restricted = false;

        if (matched) {
          if (denies(matched.need)) {
            restricted = true;
            answer = `As a ${caps.label}, you do not have access to ${matched.need.replace("_", " ")} data. This query is outside your capability scope. Contact your administrator if you believe this is incorrect.`;
          } else {
            answer = matched.answer();
          }
        } else {
          answer = `I can help with topics within your role (${caps.label}): ${caps.can.join(", ").replace(/_/g, " ")}. Try asking about one of those areas.`;
        }

        return res.json({
          answer,
          role: r,
          capability: caps.label,
          screen,
          restricted,
          canPerform: !restricted,
          alternatives: [],
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[ask:dashboard] handler error:", err);
        return res.status(500).json({
          error: "internal_error",
          answer: "Sorry, the AI service hit an unexpected error. Please try again in a moment.",
          restricted: false,
          timestamp: new Date().toISOString(),
        });
      }
    }

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
      "deals-list":        { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
      "analytics":         { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
      "admin":             { allowed: ["pdl","po"], readOnly: ["sll","fin","qrm","it"] },
      "admin-rate-cards":  { allowed: ["po"], readOnly: ["pdl","sll","fin","qrm","it"] },
      "admin-scope-catalog": { allowed: ["po"], readOnly: ["pdl","sll","fin","qrm","it"] },
      "admin-prompt-sets": { allowed: ["po"], readOnly: ["pdl","sll","fin","qrm","it"] },
      "admin-margin-targets": { allowed: ["po"], readOnly: ["pdl","sll","fin","qrm","it"] },
      "admin-conga":       { allowed: ["po"], readOnly: ["pdl","sll","fin","qrm","it"] },
      "integration-dynamics": { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
      "integration-intapp":   { allowed: ["pdl","sll","qrm"], readOnly: ["po","fin","it"] },
      "integration-workday":  { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
      "architecture":      { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
      "global":            { allowed: ["pdl","sll","po","fin","qrm","it"], readOnly: [] },
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
        { keys: ["difference between rate","rate vs cost","cost rate vs rate","rate and cost rate","rate & cost"], answer: () => "Two different sides of the engagement:\n\n• Rate = bill rate. What the client pays per hour for that role. Multiplied by hours, it produces fee (revenue).\n• Cost rate = internal fully-loaded cost per hour (salary + benefits + overhead). Multiplied by hours, it produces cost.\n\nThe gap is your margin. Example: Senior Manager at $475 bill / $185 cost throws off ~$290 of margin per hour. Margin % = (fee - cost) / fee." },
        { keys: ["what is cost rate","cost rate","fully loaded","internal cost"], answer: () => "Cost rate is the fully-loaded internal cost per hour for that role — base salary + benefits + overhead allocation, sourced from Workday/Finance. It's not editable in DealPad because it's a fact about what the person costs, not a negotiation lever. Only the bill rate is overrideable." },
        { keys: ["rate card","standard rate","default rate","where do rates come from"], answer: () => "Rate cards live in the Rates admin (open from the topbar → Rates). Each role has a default bill rate and cost rate per practice/region. The Pricing Grid pulls the role's defaultRate as the standard, then applies any line-level override on top. Rate cards are versioned — historical deals stay anchored to the card that was active at submit." },
        { keys: ["override","justification","why amber"], answer: (c) => `Click any rate cell to override it. You'll need a justification of 5+ characters; the change writes to the activity log with before/after, variance %, and your name. ${c.extra?.overrideCount ? `This deal currently has ${c.extra.overrideCount} override${c.extra.overrideCount === 1 ? "" : "s"}.` : "Overrides surface to the SLL during approval and are reset by scenario selection."}` },
        { keys: ["blended","blended rate"], answer: (c) => {
          const t = c.totals;
          if (t && t.totalHours > 0) {
            return `Blended rate = total fee ÷ total hours across all roles on the deal. Current: $${t.blendedRate.toFixed(0)}/hr ($${t.totalFee.toLocaleString(undefined, {maximumFractionDigits: 2})} ÷ ${t.totalHours.toLocaleString()} hrs). It's a weighted average — heavier-weighted senior hours pull it up; mid/staff hours pull it down.`;
          }
          return `Blended rate = total fee ÷ total hours across all roles on the deal. It's a weighted average — heavier-weighted senior hours pull it up; mid/staff hours pull it down.`;
        }},
        { keys: ["how is margin","margin calc","margin formula","calculate margin"], answer: (c) => {
          const t = c.totals;
          const detail = t ? ` This deal is at ${t.marginPercent.toFixed(1)}% (fee $${t.totalFee.toLocaleString(undefined,{maximumFractionDigits:2})} − cost $${t.totalCost.toLocaleString(undefined,{maximumFractionDigits:2})}).` : "";
          return `Margin % = (fee - cost) ÷ fee, calculated per line and rolled up to the deal.${detail} Below 25% triggers an SLL approval gate; below 20% needs a second approver.`;
        }},
        { keys: ["margin advisor","improve margin","lift margin"], answer: () => "Run Margin Advisor (button on the Pricing step) to get AI suggestions: shift hours from senior to mid-tier, trim non-core scope, or apply rate uplifts on under-priced lines. The advisor cites comparable won deals." },
        { keys: ["role mix","staffing","staff ratio","seniority"], answer: () => "Role mix shifts hours between Partner / MD / SM / Manager / Senior / Consultant / Analyst tiers. More senior weight = higher quality + higher fee, lower margin. More mid/staff weight = leaner cost, higher margin, more delivery risk on complex work." },
        { keys: ["fee","total fee","revenue"], answer: (c) => {
          const t = c.totals;
          if (!t) return "Total fee = Σ (hours × rate) across every pricing line, plus the Tech & Admin uplift if one is configured. It updates live as you edit hours or rates.";
          let breakdown = `Subtotal of lines (Σ hours × rate): $${t.lineSubtotalFee.toLocaleString(undefined,{maximumFractionDigits:2})}.`;
          if (Math.abs(t.roundingAdjustment) > 0.005) {
            breakdown += ` Rounding adjustment (line-item rounding $${t.lineItemRounding}): ${t.roundingAdjustment >= 0 ? "+" : ""}$${t.roundingAdjustment.toLocaleString(undefined,{maximumFractionDigits:2})}.`;
          }
          if (t.techAdminFeePct > 0) {
            breakdown += ` Tech & Admin (${t.techAdminFeePct}%): +$${t.techAdminFee.toLocaleString(undefined,{maximumFractionDigits:2})}.`;
          }
          breakdown += ` Total fee: $${t.totalFee.toLocaleString(undefined,{maximumFractionDigits:2})}.`;
          return `Total fee = Σ (hours × rate) across every pricing line${t.techAdminFeePct > 0 ? ", plus the Tech & Admin uplift" : ""}. ${breakdown}`;
        }},
        { keys: ["hours","total hours"], answer: (c) => {
          const t = c.totals;
          const hrs = t ? t.totalHours : c.totalHours;
          return `Total hours = sum of hours across every role on the deal. ${hrs ? `Current: ${Number(hrs).toLocaleString()} hrs.` : ""} Hours come from your Scope step (estimated effort × complexity multiplier × assumption multipliers).`;
        }},
        { keys: ["tech and admin","tech & admin","tech admin","admin fee","uplift"], answer: (c) => {
          const t = c.totals;
          if (t && t.techAdminFeePct > 0) {
            return `Tech & Admin fee is a ${t.techAdminFeePct}% uplift on top of the line subtotal ($${t.roundedSubtotal.toLocaleString(undefined,{maximumFractionDigits:2})}), adding $${t.techAdminFee.toLocaleString(undefined,{maximumFractionDigits:2})} to the deal. It shows as an explicit footer line in the Pricing Grid so the displayed Total Fee always equals (Σ line fees + rounding) + Tech & Admin.`;
          }
          return "Tech & Admin fee is a % uplift on the line subtotal, configured under Pricing Options → Engagement Inputs. When non-zero it appears as an explicit footer line in the Pricing Grid so the Total Fee reconciles to the lines plus the uplift.";
        }},
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
      "deals-list": [
        { keys: ["filter","search","find"], answer: () => "Use the search box for free-text matching across deal title, client, and number. Status filters live in the toolbar; combine them to scope to draft / submitted / approved / rejected. Sort by clicking any column header." },
        { keys: ["archive","restore","deleted"], answer: () => "Archived deals are hidden by default. Toggle 'Show archived' to include them; archived rows can be restored from the row menu. Archive is reversible — nothing is hard-deleted." },
        { keys: ["new","create","start"], answer: () => "Start a new deal from the New Deal button (top right). PDLs can also pick Renewal Fast-Track from the action menu on any approved deal to clone its scope and pricing." },
        { keys: ["status","stage","lifecycle"], answer: () => "Deals flow draft -> submitted -> approved (or rejected -> draft for revision). Status badges are color-coded; submitted deals are awaiting SLL approval." },
        { keys: ["margin","color","badge"], answer: () => "Margin badges turn amber under 25% and red under 20%. These are the same thresholds the approval gate uses, so anything red will require justification at submit time." },
      ],
      "analytics": [
        { keys: ["pipeline","forecast","total"], answer: () => "Pipeline total = sum of total fee across active (non-archived, non-rejected) deals. The trend chart aggregates by deal createdAt; the breakdown card splits by service line." },
        { keys: ["margin","average","portfolio"], answer: () => "Portfolio margin = weighted average of marginPercent across deals, weighted by total fee. Below 25% triggers risk highlighting." },
        { keys: ["service line","practice","mix"], answer: () => "Service line mix shows fee distribution across Tax / Audit / Consulting / Risk Advisory / Outsourcing. Click any segment to drill into its deals." },
        { keys: ["scenario","standard","premium","value"], answer: () => "Scenario adoption tracks which scenario (Standard / Premium / Value) PDLs ultimately selected per deal. Premium adoption above 30% is healthy." },
        { keys: ["export","download","csv"], answer: () => "Export is on the action menu in the top-right. CSV export streams the underlying deal rows; PDF export captures the dashboard layout." },
      ],
      "admin": [
        { keys: ["who can edit","permission","manage"], answer: () => "Pricing Operations (PO) is the only role that can edit configuration. PDLs see the same pages in read-only mode for transparency. SLL/FIN/QRM/IT have no admin access." },
        { keys: ["where is","navigate","sections"], answer: () => "Configuration covers: Rate Cards (bill + cost rates), Scope Catalog (engagement templates), Prompt Sets (assumption questions), Margin Targets (per-service-line targets), and Conga Templates (proposal/engagement letter mappings)." },
      ],
      "admin-rate-cards": [
        { keys: ["create","add new","new card"], answer: () => "Click 'New Rate Card' to draft a card. Cards are versioned by effective date; only one card per practice/region can be active at a time. Activating a new card archives the previous one but keeps it linked to historical deals." },
        { keys: ["bill rate","cost rate","margin"], answer: () => "Each role row carries a bill rate (what the client pays) and cost rate (fully-loaded internal cost). The implied margin is shown live as you edit. Cost rates are sourced from Finance/Workday in production." },
        { keys: ["uplift","increase","annual"], answer: () => "Annual uplift is applied per-role with a single percentage. The form previews the new rate next to the old before you commit." },
        { keys: ["effective date","activate","schedule"], answer: () => "Cards take effect on their effective date. Future-dated cards stay in 'pending' until midnight UTC of that date." },
      ],
      "admin-scope-catalog": [
        { keys: ["create","add item","new item"], answer: () => "Click 'New Item'. Required: code, name, category, default hours, complexity. Tags help PDLs filter inside the wizard. Items default to active." },
        { keys: ["assembly","parent","cascade","children"], answer: () => "Assemblies are catalog items that auto-add a curated set of children when added to a deal. Define children in the assembly editor; the cascade is one-way — removing the parent leaves children in place." },
        { keys: ["deactivate","retire","hide"], answer: () => "Deactivating an item hides it from new deals but preserves it on every existing deal. To re-enable, toggle 'Show inactive' in the list and click the row's restore action." },
        { keys: ["template","starter","bundle"], answer: () => "Starter templates live under Scope Templates and bundle multiple catalog items with default hour overrides. PDLs apply them in one click from the wizard's Scope step." },
        { keys: ["tag","filter","practice"], answer: () => "Tags are free-form labels (e.g. 'tax', 'sox', 'erp'). The wizard auto-filters by service line; the 'Show all practices' toggle lifts that filter." },
      ],
      "admin-prompt-sets": [
        { keys: ["what is","prompt","purpose"], answer: () => "Prompt sets are the assumption questionnaires PDLs answer in the Assumptions step. Each prompt has a question, response options, and per-option multipliers that compound into the deal's effort total." },
        { keys: ["multiplier","impact","effort"], answer: () => "Each response option carries a multiplier (1.0 = baseline). Multipliers compound: three 1.1x answers produce 1.331x total effort. Keep extreme multipliers (>1.3x or <0.8x) intentional." },
        { keys: ["create","add prompt","new"], answer: () => "Build a set, then add prompts one at a time. Each prompt needs a question and at least two response options. Drag to reorder; PDLs see them in this order." },
        { keys: ["assign","service line","attach"], answer: () => "Assign a prompt set to one or more service lines. The wizard auto-attaches the matching set when a deal is created against that service line." },
      ],
      "admin-margin-targets": [
        { keys: ["target","threshold","floor"], answer: () => "Margin targets define the floor used by the approval gate. Standard target is 31%; below 25% requires SLL justification, below 20% triggers second approver. Per-service-line overrides take precedence." },
        { keys: ["how it","applied","enforced"], answer: () => "Targets are evaluated at submit time against the deal's calculated margin. Failures don't block submission — they route the deal through the stricter approval path with a visible badge." },
      ],
      "admin-conga": [
        { keys: ["template","mapping","field"], answer: () => "Each Conga template maps DealPad fields to merge fields in the destination doc (proposal, engagement letter, change order). Templates support conditional sections and per-line iteration." },
        { keys: ["proposal","engagement letter","change order"], answer: () => "Three template types ship by default: Proposal, Engagement Letter, Change Order. Add custom types by registering them with Conga and linking the template ID here." },
        { keys: ["provider","conga","stub"], answer: () => "The PoC uses a stubbed Conga provider — generated docs are saved locally and tagged 'simulation'. Production swaps in real Conga REST credentials via the Provider Config card." },
      ],
      "integration-dynamics": [
        { keys: ["sync","direction","push","pull"], answer: () => "Dynamics sync is bi-directional. Opportunity updates flow into DealPad on a 5-minute poll; deal status changes push back as opportunity stage updates. Conflicts are flagged in the activity log." },
        { keys: ["link","attach","opportunity"], answer: () => "Link an opportunity from the New Deal screen or from any deal detail page. Linking copies client, value, and notes; subsequent edits sync both ways." },
        { keys: ["mock","stub","simulation"], answer: () => "The integration runs against a deterministic stub for the PoC. Production swaps in real Dataverse credentials with no code changes — only the provider config moves." },
      ],
      "integration-intapp": [
        { keys: ["screening","conflict","check"], answer: () => "Intapp runs a conflict + risk screening on every submitted deal. Findings show severity (Low/Medium/High) and the matched clauses; QRM triages from the queue." },
        { keys: ["mitigation","resolve","clear"], answer: () => "High-severity findings require a mitigation note before approval. QRM enters the note here; it threads onto the deal's approval record." },
        { keys: ["dashboard","summary","queue"], answer: () => "The Intapp dashboard summarizes open conflicts, in-flight reviews, and open mitigations. Click any tile to drill into the underlying screenings." },
      ],
      "integration-workday": [
        { keys: ["validation","status","clean"], answer: () => "Workday validation classifies each deal as Clean / Over Budget / Staffing Short / Rate Variance / Unvalidated. PDLs can override with a justification; overrides surface to the SLL." },
        { keys: ["cost center","link","mapping"], answer: () => "Linking a Workday cost center sets the post-award accounting hook. Validation runs immediately after link; mismatches highlight in the deal's review step." },
        { keys: ["rate variance","cost rate","drift"], answer: () => "Rate Variance triggers when a deal's bill or cost rate diverges from Workday's source-of-truth by more than 5%. Reconcile by re-pulling the rate card or filing a Workday correction." },
      ],
      "architecture": [
        { keys: ["diagram","map","overview"], answer: () => "The Architecture Hub renders the system map: bounded contexts, integrations, AI services, and data flow. Click any node to drill into its routes, schemas, and dependencies." },
        { keys: ["bounded","context","domain"], answer: () => "Bounded contexts: Deal, Pricing, Scope Catalog, Rate Cards, Scenarios, Approvals, AI, Integrations (Dynamics / Intapp / Workday / Conga). Each owns its tables and route module." },
        { keys: ["azure","production","target"], answer: () => "Production target is Azure: Container Apps behind APIM, Service Bus + Event Grid for async, Entra ID for auth, Azure OpenAI for AI. The PoC handler shapes are designed to map 1:1 onto that topology." },
      ],
      "global": [
        { keys: ["what can","help","how"], answer: () => "Ask DealPad AI is contextual — open it on any screen for screen-specific help. From here you can ask about navigation, persona permissions, or general DealPad concepts." },
        { keys: ["persona","switch","role"], answer: () => "Switch personas from your avatar in the top-right. Each persona has its own permissions: PDL creates deals, SLL approves, PO manages config, FIN reviews margins, QRM handles risk, IT sees architecture." },
        { keys: ["navigation","menu","find"], answer: () => "The left sidebar groups navigation by area: Pipeline (Dashboard, Deals, Analytics), Integrations (Dynamics, Intapp, Workday), Configuration (admin pages), and Architecture. Items hide automatically when your role lacks access." },
      ],
    };

    let answer: string;
    let restricted = false;

    // Pick the BEST KB entry, not the first one. Score = length of the
    // longest matching key (more specific phrases beat single-word keys).
    // This is what fixes "what's the difference between rate & cost rate?"
    // grabbing the generic "rate" answer instead of the targeted one.
    const findBestMatch = (kb: { keys: string[]; answer: (ctx: any) => string }[]) => {
      let best: { entry: typeof kb[0]; score: number } | null = null;
      for (const entry of kb) {
        for (const key of entry.keys) {
          if (q.includes(key) && (!best || key.length > best.score)) {
            best = { entry, score: key.length };
          }
        }
      }
      return best?.entry || null;
    };

    // Always answer with the SAME numbers the Pricing Grid is showing right
    // now: read pricing_lines for the deal and roll them up via the shared
    // helper. We never trust the deal.totalFee snapshot the client sent —
    // that can be stale if the user edited a cell since last fetch.
    let liveDeal = context?.deal;
    let liveTotalHours = context?.totalHours;
    let liveTotals: DealTotals | null = null;
    if (dealId && Number.isFinite(dealId)) {
      const dealRow = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
      if (dealRow) {
        const lines = await db.select().from(pricingLines)
          .where(eq(pricingLines.dealId, dealId));
        liveTotals = computeDealTotalsFromLines(lines, (dealRow as any).engagementInputs || {});
        // Synthesize a deal context that mirrors what the grid renders, so
        // every wizard-pricing answer cites the same fee / hours / margin /
        // blended rate the user is staring at.
        liveDeal = {
          ...(context?.deal || {}),
          marginPercent: liveTotals.marginPercent.toFixed(1),
          totalFee: liveTotals.totalFee.toFixed(2),
          totalHours: String(liveTotals.totalHours),
          serviceLine: dealRow.serviceLine,
          complexity: dealRow.complexity,
          status: dealRow.status,
        };
        liveTotalHours = liveTotals.totalHours;
      }
    }
    const ctxObj = {
      deal: liveDeal,
      totalHours: liveTotalHours,
      totals: liveTotals,
      extra: context?.extra,
    };

    if (isReadOnly) {
      restricted = true;
      const altLines = (roleAlternatives[r] || []).map(a => `• ${a}`).join("\n");
      answer = `As ${caps.label}, you can view this screen but not make changes here. What you CAN do:\n${altLines}`;

      // Still try to answer informational questions
      const matched = findBestMatch(screenKB[screen] || []);
      if (matched) {
        const info = matched.answer(ctxObj);
        answer = `${info}\n\n(Read-only context for ${caps.label}.) What you CAN do here:\n${altLines}`;
      }
    } else if (isEditor) {
      const kb = screenKB[screen] || [];
      const matched = findBestMatch(kb);
      if (matched) {
        answer = matched.answer(ctxObj);
      } else {
        // Surface up to 4 representative topics so the user knows what this
        // screen actually answers, instead of a frustrating dead-end.
        const topics = kb.slice(0, 4).map(t => `"${t.keys[0]}"`).join(", ") || "the screen above";
        answer = `I don't have a prepared answer for that on this screen. I can speak to: ${topics}. Try rephrasing, or pick one of the suggested prompts below.`;
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
  app.get("/api/deals/:dealId/change-orders", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
    const result = await db.select().from(changeOrders)
      .where(eq(changeOrders.dealId, dealId))
      .orderBy(desc(changeOrders.createdAt));
    res.json(result);
  });

  app.post("/api/deals/:dealId/change-orders", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
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

  app.patch("/api/change-orders/:id", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = paramInt(req, "id");
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
  app.get("/api/analytics/overview", requirePerm("viewMargins"), async (_req: Request, res: Response) => {
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
  app.get("/api/deals/:dealId/proposal", requirePerm("viewDeals"), async (req: Request, res: Response) => {
    const dealId = paramInt(req, "dealId");
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
