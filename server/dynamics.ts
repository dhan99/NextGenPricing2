import type { Request, Response, Express } from "express";
import { db } from "./db";
import { requirePerm, requireAnyPerm } from "./rbac";
import {
  clients, deals, dynamicsAccounts, dynamicsOpportunities, dynamicsSyncLog,
  dynamicsSettings, dynamicsOwners, approvals, activityLog,
} from "../shared/schema";
import { eq, desc, sql, inArray, and } from "drizzle-orm";

const STAGES = ["Qualify", "Develop", "Propose", "Close", "Won", "Lost"] as const;
const STAGE_PROBABILITY: Record<string, number> = {
  Qualify: 20, Develop: 40, Propose: 65, Close: 85, Won: 100, Lost: 0,
};

const INDUSTRY_CODES: Record<string, string> = {
  "Technology": "541512", "Manufacturing": "333000", "Healthcare": "621000",
  "Financial Services": "522000", "Retail": "445000", "Real Estate": "531000",
  "Professional Services": "541000", "Consumer Goods": "311000",
  "Energy": "211000", "Media": "511000",
};

const SEED_OWNERS = [
  { name: "Jennifer Walsh", email: "jwalsh@armanino.com", quota: "2500000" },
  { name: "Marcus Chen", email: "mchen@armanino.com", quota: "2500000" },
  { name: "Priya Anand", email: "panand@armanino.com", quota: "2500000" },
  { name: "Tom Becker", email: "tbecker@armanino.com", quota: "2500000" },
  { name: "Lisa Hartmann", email: "lhartmann@armanino.com", quota: "2500000" },
];

function uuid(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = (n: number, len = 8) => n.toString(16).padStart(len, "0").slice(0, len);
  return `${hex(h)}-${hex(h ^ 0x1234, 4)}-${hex(h ^ 0xabcd, 4)}-${hex(h ^ 0xbeef, 4)}-${hex(h ^ 0xcafebabe, 12)}`;
}

function rnd(seed: number, lo: number, hi: number): number {
  const x = Math.sin(seed * 99991) * 10000;
  const f = x - Math.floor(x);
  return Math.floor(lo + f * (hi - lo));
}

function pick<T>(arr: T[], idx: number): T { return arr[Math.abs(idx) % arr.length]; }

async function logEvent(e: {
  direction: "inbound" | "outbound" | "bidirectional";
  entity: "Account" | "Opportunity" | "Contact" | "System";
  entityName: string;
  entityRefId?: number;
  action: string;
  fields?: string[];
  status?: "success" | "failure" | "warning";
  message: string;
  actorName?: string;
  trigger?: "manual" | "auto" | "batch";
}) {
  await db.insert(dynamicsSyncLog).values({
    direction: e.direction, entity: e.entity, entityName: e.entityName,
    entityRefId: e.entityRefId, action: e.action,
    fields: e.fields ? (e.fields as any) : null,
    status: e.status || "success",
    message: e.message, actorName: e.actorName || "System",
    trigger: e.trigger || "manual",
  });
}

async function getSettings() {
  const [s] = await db.select().from(dynamicsSettings).limit(1);
  if (s) return s;
  const [created] = await db.insert(dynamicsSettings).values({}).returning();
  return created;
}

export async function seedDynamics() {
  // Record-level idempotency: every insert is gated by a per-record existence
  // check so this can heal a partially-populated database without duplicating
  // rows or hitting unique constraints. Safe to run on every cold start AND
  // via the admin reseed endpoint after a half-broken deploy.

  // Owners — keyed by email
  const existingOwners = await db.select({ email: dynamicsOwners.email }).from(dynamicsOwners);
  const existingOwnerEmails = new Set(existingOwners.map((o) => o.email));
  const missingOwners = SEED_OWNERS.filter((o) => !existingOwnerEmails.has(o.email));
  if (missingOwners.length > 0) {
    await db.insert(dynamicsOwners).values(missingOwners);
  }

  await getSettings();

  // Accounts — keyed by dealpad_client_id (one D365 account per DealPad client)
  const clientRows = await db.select().from(clients);
  if (clientRows.length > 0) {
    const existingAccts = await db.select({ dealpadClientId: dynamicsAccounts.dealpadClientId }).from(dynamicsAccounts);
    const linkedClientIds = new Set(existingAccts.map((a) => a.dealpadClientId).filter((id): id is number => id != null));
    const owners = await db.select().from(dynamicsOwners);
    if (owners.length > 0) {
      const missingClients = clientRows.filter((c) => !linkedClientIds.has(c.id));
      for (let i = 0; i < missingClients.length; i++) {
        const c = missingClients[i];
        const industry = c.industry || pick(Object.keys(INDUSTRY_CODES), i);
        const owner = pick(owners, i);
        const revenueMillions = c.revenueSize?.includes("$")
          ? parseFloat(c.revenueSize.replace(/[^0-9.]/g, "")) || 50
          : 50 + rnd(c.id, 10, 500);
        await db.insert(dynamicsAccounts).values({
          dynamicsId: uuid(`acct-${c.id}`),
          accountNumber: `ACC-${String(c.id).padStart(6, "0")}`,
          dealpadClientId: c.id,
          name: c.name,
          industry,
          industryCode: INDUSTRY_CODES[industry] || "541000",
          segment: c.segment || (revenueMillions > 250 ? "Enterprise" : revenueMillions > 50 ? "Mid-Market" : "SMB"),
          annualRevenue: String(Math.round(revenueMillions * 1_000_000)),
          numberOfEmployees: rnd(c.id + 1, 50, 5000),
          ownerName: owner.name, ownerEmail: owner.email,
          contactName: c.contactName || `Contact ${i + 1}`,
          contactTitle: pick(["CFO", "Controller", "VP Finance", "Director of Accounting", "CEO"], i),
          contactEmail: c.contactEmail || `contact${i}@example.com`,
          contactPhone: `(415) 555-${String(1000 + rnd(c.id, 100, 9999)).slice(0, 4)}`,
          billingStreet: `${rnd(c.id, 100, 999)} Market St`,
          billingCity: c.region?.split(",")[0] || "San Francisco",
          billingState: c.region?.split(",")[1]?.trim() || "CA",
          billingZip: String(94000 + rnd(c.id, 0, 999)).padStart(5, "0"),
          relationshipType: (c.relationshipYears || 0) > 0 ? "Customer" : "Prospect",
          customerSince: `${2026 - (c.relationshipYears || 1)}-01-15`,
        }).onConflictDoNothing();
      }
    }
  }

  // Opportunities linked to deals — keyed by dealpad_deal_id (UNIQUE constraint exists)
  const dealRows = await db.select().from(deals);
  if (dealRows.length > 0) {
    const existingLinks = await db.select({ dealpadDealId: dynamicsOpportunities.dealpadDealId })
      .from(dynamicsOpportunities);
    const linkedDealIds = new Set(existingLinks.map((o) => o.dealpadDealId).filter((id): id is number => id != null));
    const acctRows = await db.select().from(dynamicsAccounts);
    const acctByClient = new Map(acctRows.map((a) => [a.dealpadClientId, a]));
    const owners = await db.select().from(dynamicsOwners);

    const missingDeals = dealRows.filter((d) => !linkedDealIds.has(d.id));
    for (let i = 0; i < missingDeals.length; i++) {
      const d = missingDeals[i];
      const acct = acctByClient.get(d.clientId);
      const stage = inferStage(d);
      const owner = owners.find((o) => o.name === d.pdlName) || pick(owners, i);
      const fee = parseFloat(d.totalFee || "0");
      const probability = STAGE_PROBABILITY[stage];

      await db.insert(dynamicsOpportunities).values({
        dynamicsId: uuid(`opp-${d.id}`),
        opportunityNumber: `OPP-${String(d.id).padStart(6, "0")}`,
        dealpadDealId: d.id,
        dynamicsAccountId: acct?.id || null,
        name: d.title,
        accountName: acct?.name || "Unknown",
        estimatedValue: String(fee || rnd(d.id, 50000, 750000)),
        actualValue: stage === "Won" ? String(fee) : null,
        stage, probability,
        estimatedCloseDate: d.endDate || new Date(Date.now() + rnd(d.id, 30, 180) * 86400 * 1000).toISOString().slice(0, 10),
        ownerName: owner.name,
        forecastCategory: forecastFor(stage, probability),
        rating: probability >= 70 ? "Hot" : probability >= 40 ? "Warm" : "Cold",
        lastPushedAt: d.updatedAt || new Date(),
      }).onConflictDoNothing();
    }
  }

  // Dynamics-only opps not yet imported into DealPad — keyed by dynamics_id (unique).
  const extras = [
    {
      dynamicsId: uuid("opp-x1"), opportunityNumber: "OPP-100201",
      name: "Pacific Logistics Co - Tax Provision Outsourcing", accountName: "Pacific Logistics Co",
      estimatedValue: "285000", stage: "Qualify", probability: 20,
      estimatedCloseDate: "2026-09-30", ownerName: "Jennifer Walsh",
      forecastCategory: "Pipeline", rating: "Warm",
      syncStatus: "queued", syncDirection: "inbound",
    },
    {
      dynamicsId: uuid("opp-x2"), opportunityNumber: "OPP-100202",
      name: "Helios Energy Inc - SOX Readiness", accountName: "Helios Energy Inc",
      estimatedValue: "540000", stage: "Develop", probability: 40,
      estimatedCloseDate: "2026-08-15", ownerName: "Marcus Chen",
      forecastCategory: "Best Case", rating: "Hot",
      syncStatus: "queued", syncDirection: "inbound",
    },
    {
      dynamicsId: uuid("opp-x3"), opportunityNumber: "OPP-100203",
      name: "Crestwood Holdings - 2026 Annual Audit", accountName: "Crestwood Holdings",
      estimatedValue: "412000", stage: "Qualify", probability: 20,
      estimatedCloseDate: "2026-11-01", ownerName: "Priya Anand",
      forecastCategory: "Pipeline", rating: "Warm",
      syncStatus: "queued", syncDirection: "inbound",
    },
  ];
  const existingExtraIds = new Set(
    (await db.select({ dynamicsId: dynamicsOpportunities.dynamicsId }).from(dynamicsOpportunities))
      .map((o) => o.dynamicsId).filter((id): id is string => id != null),
  );
  for (const e of extras) {
    if (!existingExtraIds.has(e.dynamicsId)) {
      await db.insert(dynamicsOpportunities).values(e as any).onConflictDoNothing();
    }
  }

  // Bootstrap log line — only if no log entries at all (the action is self-describing).
  const [{ count: logCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(dynamicsSyncLog);
  if (logCount === 0) {
    await logEvent({ direction: "inbound", entity: "System", entityName: "Initial seed",
      action: "Bootstrapped Dynamics 365 simulation", status: "success",
      message: "Dynamics 365 PoC simulation initialized with accounts, opportunities, and pipeline data",
      trigger: "batch" });
  }
}

function inferStage(d: any): "Qualify" | "Develop" | "Propose" | "Close" | "Won" | "Lost" {
  if (d.status === "won") return "Won";
  if (d.status === "lost") return "Lost";
  if (d.status === "approved") return "Close";
  if (d.status === "submitted" || d.status === "in_review") return "Propose";
  if ((d.currentStep || 1) >= 3) return "Develop";
  return "Qualify";
}

function forecastFor(stage: string, probability: number): "Pipeline" | "Best Case" | "Commit" | "Closed" {
  if (stage === "Won" || stage === "Lost") return "Closed";
  if (probability >= 80) return "Commit";
  if (probability >= 50) return "Best Case";
  return "Pipeline";
}

// Auto-push hook called from deals routes when a deal changes
export async function autoPushDeal(dealId: number, changedFields: string[], actorName?: string) {
  const settings = await getSettings();
  if (!settings.autoPushEnabled) return;

  const wantsStage = changedFields.some((f) => ["status", "stage", "currentStep"].includes(f));
  const wantsFee = changedFields.some((f) => ["totalFee", "totalCost", "totalHours", "marginPercent"].includes(f));
  if (wantsStage && !settings.autoPushOnStageChange) return;
  if (wantsFee && !settings.autoPushOnFeeChange && !wantsStage) return;
  if (!wantsStage && !wantsFee) return;

  await pushDealToDynamics(dealId, actorName, "auto");
}

async function pushDealToDynamics(dealId: number, actorName: string | undefined, trigger: "manual" | "auto") {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return { ok: false, reason: "deal not found" };
  const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.dealpadDealId, dealId));
  if (!opp) return { ok: false, reason: "no linked opportunity" };

  const stage = inferStage(deal);
  const probability = STAGE_PROBABILITY[stage];
  const forecastCategory = forecastFor(stage, probability);
  const fee = parseFloat(deal.totalFee || "0");

  await db.update(dynamicsOpportunities).set({
    estimatedValue: String(fee),
    actualValue: stage === "Won" ? String(fee) : null,
    stage, probability, forecastCategory,
    estimatedCloseDate: deal.endDate || opp.estimatedCloseDate,
    actualCloseDate: stage === "Won" || stage === "Lost" ? new Date().toISOString().slice(0, 10) : null,
    lastPushedAt: new Date(), updatedAt: new Date(),
  }).where(eq(dynamicsOpportunities.id, opp.id));

  await logEvent({
    direction: "outbound", entity: "Opportunity", entityName: deal.title, entityRefId: opp.id,
    action: trigger === "auto" ? "Auto-pushed deal updates to D365" : "Manual push to D365",
    fields: ["estimatedValue", "stage", "probability", "forecastCategory", "estimatedCloseDate"],
    status: "success", actorName, trigger,
    message: `Outbound sync (${trigger}): ${deal.title} → D365 ${opp.opportunityNumber} (${stage}, $${fee.toLocaleString()})`,
  });
  return { ok: true, opportunityId: opp.id };
}

// Match opportunity name to a scope template by keyword
export function tmplKey(name: string): string | null {
  const n = (name || "").toLowerCase();
  if (n.includes("audit")) return "Annual Audit";
  // Complex Tax cues (Pillar 2, transfer pricing, ASC 740, M&A tax DD,
  // indirect tax transformation, multi-jurisdiction, controversy) route to
  // the parametric Complex Tax template. Order matters — these checks
  // precede the simpler "tax provision" / "tax outsourc" cue from Task #30
  // so a multi-jurisdiction provision still lands on the complex template.
  if (
    n.includes("pillar 2") || n.includes("pillar two") || n.includes("globe") ||
    n.includes("transfer pricing") || n.includes("asc 740") || n.includes("ias 12") ||
    n.includes("m&a tax") || n.includes("tax due diligence") || n.includes("tax dd") ||
    n.includes("indirect tax transformation") || n.includes("vat transformation") ||
    n.includes("multi-jurisdiction") || n.includes("multi jurisdiction") ||
    n.includes("complex tax") ||
    (n.includes("controversy") && n.includes("tax"))
  ) return "Complex Tax Engagement";
  if (n.includes("tax provision") || n.includes("tax outsourc")) return "Tax Provision Outsourcing";
  if (
    n.includes("erp") ||
    n.includes("s/4hana") || n.includes("s4hana") || n.includes("s/4 hana") ||
    n.includes("sap implementation") || n.includes("sap rollout") ||
    n.includes("oracle fusion") || n.includes("oracle erp") ||
    n.includes("workday financials") || n.includes("workday hcm") ||
    n.includes("workday implementation")
  ) return "ERP Implementation";
  if (n.includes("sox")) return "SOX Readiness";
  if (n.includes("cloud") || n.includes("migration")) return "Cloud Migration";
  if (n.includes("analytics") || n.includes("data warehouse") || n.includes("bi ")) return "Data Analytics Platform";
  if (n.includes("cyber") || n.includes("security")) return "Cybersecurity Assessment";
  return null;
}
export function pickTemplateForName(name: string) {
  const k = tmplKey(name);
  return k ? SCOPE_TEMPLATES[k] : null;
}

// Called from POST /api/deals when dynamicsOpportunityId is provided
export async function linkDealToOpportunity(opportunityId: number, dealId: number, actorName?: string) {
  const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, opportunityId));
  if (!opp || opp.dealpadDealId) return { ok: false };
  await db.update(dynamicsOpportunities).set({
    dealpadDealId: dealId,
    syncStatus: "synced",
    syncDirection: "bidirectional",
    lastPulledAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(dynamicsOpportunities.id, opportunityId));
  await logEvent({
    direction: "inbound", entity: "Opportunity", entityName: opp.name, entityRefId: opp.id,
    action: "Linked D365 opportunity to new DealPad deal",
    fields: ["dealpadDealId"], status: "success", actorName, trigger: "manual",
    message: `Inbound link: D365 ${opp.opportunityNumber} now bi-directionally synced with DealPad deal #${dealId}`,
  });
  return { ok: true };
}

// Unlink a D365 opportunity from its DealPad deal (does not delete the deal).
// Frees the opp to be re-linked or re-scoped.
export async function unlinkOpportunity(opportunityId: number, actorName?: string) {
  const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, opportunityId));
  if (!opp || !opp.dealpadDealId) return { ok: false, reason: "not-linked" };
  const previousDealId = opp.dealpadDealId;
  await db.update(dynamicsOpportunities).set({
    dealpadDealId: null,
    syncStatus: "queued",
    syncDirection: "inbound",
    lastPushedAt: null,
    updatedAt: new Date(),
  }).where(eq(dynamicsOpportunities.id, opportunityId));
  await logEvent({
    direction: "inbound", entity: "Opportunity", entityName: opp.name, entityRefId: opp.id,
    action: "Unlinked D365 opportunity from DealPad deal",
    fields: ["dealpadDealId"], status: "success", actorName, trigger: "manual",
    message: `D365 ${opp.opportunityNumber} unlinked from DealPad deal #${previousDealId}. Opportunity is now available for re-linking.`,
  });
  return { ok: true, previousDealId };
}

// Templates that pre-populate scope hints so an opp is "scope-ready" (Develop/Propose-eligible)
const SCOPE_TEMPLATES: Record<string, { businessUnit: string; serviceLine: string; complexity: string; scopeNotes: string }> = {
  "Annual Audit": {
    businessUnit: "Audit & Assurance", serviceLine: "Financial Audit", complexity: "medium",
    scopeNotes: "Full-year audit. Estimated 6-month engagement, ~1,200 hours. Includes planning, fieldwork, sample testing, and issuance of opinion.",
  },
  "Tax Provision Outsourcing": {
    businessUnit: "Tax Services", serviceLine: "Tax Planning", complexity: "medium",
    scopeNotes: "Quarterly tax provision support + year-end true-up. Multi-state, ~600 hours/year.",
  },
  "Complex Tax Engagement": {
    businessUnit: "Tax Services", serviceLine: "Tax-Corporate", complexity: "very_high",
    scopeNotes: "Multi-workstream complex Tax engagement — Direct/Provision (ASC 740), Indirect, Transfer Pricing, International (Pillar 2), Controversy and M&A Tax DD. Parametric scope scales with legal entities, jurisdictions, return counts and intercompany transactions; senior-heavy Tax pyramid; recurring fixed-fee + project T&M roll-up.",
  },
  "ERP Implementation": {
    businessUnit: "Technology Consulting", serviceLine: "ERP Implementation", complexity: "high",
    scopeNotes: "Phase 1 implementation: architecture, configuration, integration, testing, training. ~2,400 hours over 9 months.",
  },
  "SOX Readiness": {
    businessUnit: "Risk & Compliance", serviceLine: "Cybersecurity", complexity: "high",
    scopeNotes: "SOX 404(b) readiness assessment + control design. ~900 hours, 4-month sprint.",
  },
  "Cloud Migration": {
    businessUnit: "Technology Consulting", serviceLine: "Cloud Services", complexity: "high",
    scopeNotes: "Lift-and-shift migration for core workloads. Includes assessment, migration plan, execution, cutover. ~1,800 hours.",
  },
  "Data Analytics Platform": {
    businessUnit: "Advisory Services", serviceLine: "Data Analytics", complexity: "medium",
    scopeNotes: "Modern data warehouse + BI dashboards. ~1,000 hours over 6 months.",
  },
  "Cybersecurity Assessment": {
    businessUnit: "Risk & Compliance", serviceLine: "Cybersecurity", complexity: "medium",
    scopeNotes: "NIST CSF-based assessment, gap analysis, and remediation roadmap. ~400 hours.",
  },
};

export function registerDynamicsRoutes(app: Express) {
  // Seeding is centralized in seedAll() (server/seed.ts) and runs before app.listen.

  // ============ READ ============
  app.get("/api/dynamics/accounts", requirePerm("viewDeals"), async (_req, res) => {
    const rows = await db.select().from(dynamicsAccounts).orderBy(dynamicsAccounts.name);
    res.json(rows.map(formatAccount));
  });

  app.get("/api/dynamics/accounts/:id", requirePerm("viewDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [row] = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(formatAccount(row));
  });

  app.get("/api/dynamics/opportunities", requirePerm("viewDeals"), async (_req, res) => {
    const rows = await db.select().from(dynamicsOpportunities).orderBy(desc(dynamicsOpportunities.updatedAt));
    const linkedDealIds = rows.map((r) => r.dealpadDealId).filter((id): id is number => id != null);
    const dealMap = new Map<number, any>();
    if (linkedDealIds.length > 0) {
      const dealRows = await db.select().from(deals).where(inArray(deals.id, linkedDealIds));
      for (const d of dealRows) dealMap.set(d.id, d);
    }
    res.json(rows.map((o) => {
      const base = formatOpp(o);
      const linkedDeal = o.dealpadDealId ? dealMap.get(o.dealpadDealId) : null;
      if (!linkedDeal) return { ...base, dealpadDeal: null, readyForSales: false };
      const isApproved = linkedDeal.status === "approved";
      return {
        ...base,
        dealpadDeal: {
          id: linkedDeal.id,
          dealNumber: linkedDeal.dealNumber,
          status: linkedDeal.status,
          totalFee: parseFloat(linkedDeal.totalFee || "0"),
          marginPercent: parseFloat(linkedDeal.marginPercent || "0"),
          pdlName: linkedDeal.pdlName,
          updatedAt: linkedDeal.updatedAt,
        },
        readyForSales: isApproved,
      };
    }));
  });

  // Opportunities eligible to be turned into a DealPad deal:
  // Develop or Propose stage, not yet linked. Filter by client when ?clientId is provided.
  app.get("/api/dynamics/opportunities/eligible", requirePerm("createDeals"), async (req, res) => {
    const clientId = req.query.clientId ? parseInt(String(req.query.clientId)) : null;
    let rows = await db.select().from(dynamicsOpportunities)
      .where(sql`${dynamicsOpportunities.dealpadDealId} IS NULL AND ${dynamicsOpportunities.stage} IN ('Develop','Propose')`);
    if (clientId) {
      const accts = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.dealpadClientId, clientId));
      const acctIds = new Set(accts.map((a) => a.id));
      rows = rows.filter((o) => o.dynamicsAccountId && acctIds.has(o.dynamicsAccountId));
    }
    // Enrich with template scope hints when available
    const enriched = rows.map((o) => {
      const tmpl = pickTemplateForName(o.name);
      return { ...formatOpp(o), scopeTemplate: tmpl ? { ...tmpl, key: tmplKey(o.name) } : null };
    });
    res.json(enriched);
  });

  app.post("/api/dynamics/opportunities/:id/unlink", requirePerm("editDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const result = await unlinkOpportunity(id, req.body?.userName);
    if (!result.ok) return res.status(400).json({ error: result.reason || "unlink-failed" });
    res.json(result);
  });

  // Sales sends an approved deal back to DealPad for revision (from CRM view).
  // Reuses the existing `rejected` revision path — PDL can amend and re-submit
  // through the standard approval workflow. Auto-push fans out the stage update.
  app.post("/api/dynamics/opportunities/:id/send-back", requirePerm("editDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const reason = (req.body?.reason || "").toString().trim();
    const userName = (req.body?.userName || "Sales").toString();
    if (reason.length < 5) {
      return res.status(400).json({ error: "reason_required", message: "A short reason (at least 5 characters) is required to send a deal back." });
    }

    const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, id));
    if (!opp) return res.status(404).json({ error: "opportunity_not_found" });
    if (!opp.dealpadDealId) return res.status(400).json({ error: "not_linked", message: "Opportunity is not linked to a DealPad deal." });

    const [deal] = await db.select().from(deals).where(eq(deals.id, opp.dealpadDealId));
    if (!deal) return res.status(404).json({ error: "deal_not_found" });
    if (deal.status !== "approved") {
      return res.status(409).json({ error: "deal_not_approved", message: `Deal is currently "${deal.status}", not approved.` });
    }

    // Atomically: move deal back into revision (rejected) state, annotate the
    // latest approval with the send-back note, and write the activity log entry.
    // Wrapping in a transaction prevents partial state on mid-operation failure.
    try {
      await db.transaction(async (tx) => {
        await tx.update(deals).set({ status: "rejected", updatedAt: new Date() }).where(eq(deals.id, deal.id));

        const [latestApproval] = await tx.select().from(approvals)
          .where(eq(approvals.dealId, deal.id))
          .orderBy(desc(approvals.submittedAt))
          .limit(1);
        if (latestApproval) {
          const stamped = `\n\n[Sent back from CRM by ${userName} on ${new Date().toISOString().slice(0, 10)}]\nReason: ${reason}`;
          await tx.update(approvals).set({
            comments: (latestApproval.comments || "") + stamped,
          }).where(eq(approvals.id, latestApproval.id));
        }

        await tx.insert(activityLog).values({
          dealId: deal.id,
          action: "sent_back_from_crm",
          description: `Sales (${userName}) sent deal back from Dynamics CRM for revision: ${reason}`,
          userName,
          metadata: { reason, opportunityId: opp.id, opportunityNumber: opp.opportunityNumber, previousStatus: "approved" },
        });
      });
    } catch (err) {
      console.error("[dynamics] send-back transaction failed", { dealId: deal.id, opportunityId: opp.id, err });
      return res.status(500).json({ error: "send_back_failed", message: "Failed to send deal back. Please try again." });
    }

    // Fan-out: push the stage change back to the linked Dynamics opportunity.
    // Failures here don't block the user-visible state change but should be logged.
    autoPushDeal(deal.id, ["status"], userName).catch((err) => {
      console.warn("[dynamics] autoPushDeal after send-back failed", { dealId: deal.id, err });
    });

    res.json({ success: true, dealId: deal.id, dealStatus: "rejected" });
  });

  app.get("/api/dynamics/scope-templates", requirePerm("viewDeals"), (_req, res) => {
    res.json(Object.entries(SCOPE_TEMPLATES).map(([key, v]) => ({ key, ...v })));
  });

  // Create new D365 opportunity. Optional `seedScope: true` makes it Develop-eligible
  // by attaching a service-line template + complexity hint that flows into the deal on import.
  app.post("/api/dynamics/opportunities", requirePerm("editDeals"), async (req, res) => {
    const {
      accountId, name, estimatedValue, stage = "Qualify",
      estimatedCloseDate, ownerName, scopeTemplateKey, userName,
    } = req.body || {};
    if (!accountId || !name) return res.status(400).json({ error: "accountId and name are required" });
    const [acct] = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.id, parseInt(accountId)));
    if (!acct) return res.status(404).json({ error: "Account not found" });

    const probability = STAGE_PROBABILITY[stage] ?? 20;
    const tmpl = scopeTemplateKey ? SCOPE_TEMPLATES[scopeTemplateKey] : null;
    // If scope template is provided, the opp is automatically scope-ready and bumped to Develop
    const finalStage = tmpl && stage === "Qualify" ? "Develop" : stage;
    const finalProbability = STAGE_PROBABILITY[finalStage] ?? probability;

    const [{ count: existingCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(dynamicsOpportunities);
    const oppNumber = `OPP-${String(100000 + existingCount + 1).padStart(6, "0")}`;
    const dynId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

    const [created] = await db.insert(dynamicsOpportunities).values({
      dynamicsId: dynId,
      opportunityNumber: oppNumber,
      dynamicsAccountId: acct.id,
      name,
      accountName: acct.name,
      estimatedValue: String(estimatedValue || 0),
      stage: finalStage,
      probability: finalProbability,
      forecastCategory: forecastFor(finalStage, finalProbability),
      estimatedCloseDate: estimatedCloseDate || new Date(Date.now() + 90 * 86400 * 1000).toISOString().slice(0, 10),
      ownerName: ownerName || acct.ownerName,
      rating: finalProbability >= 70 ? "Hot" : finalProbability >= 40 ? "Warm" : "Cold",
      syncStatus: "queued",
      syncDirection: "inbound",
    }).returning();

    await logEvent({
      direction: "inbound", entity: "Opportunity", entityName: name, entityRefId: created.id,
      action: tmpl ? "Created scope-ready D365 opportunity" : "Created D365 opportunity",
      fields: ["name", "accountName", "stage", "estimatedValue", "estimatedCloseDate", "ownerName"],
      status: "success", actorName: userName, trigger: "manual",
      message: tmpl
        ? `Inbound: New D365 opp ${oppNumber} (${name}) seeded with ${scopeTemplateKey} template — eligible for DealPad scoping`
        : `Inbound: New D365 opp ${oppNumber} (${name}) created in ${finalStage}`,
    });

    res.status(201).json({ ...formatOpp(created), scopeTemplate: tmpl ? { key: scopeTemplateKey, ...tmpl } : null });
  });

  app.get("/api/dynamics/pipeline", requirePerm("viewDeals"), async (_req, res) => {
    const opps = await db.select().from(dynamicsOpportunities);
    const owners = await db.select().from(dynamicsOwners);
    res.json(buildPipelineSummary(opps, owners));
  });

  app.get("/api/dynamics/sync-log", requirePerm("viewDeals"), async (_req, res) => {
    const rows = await db.select().from(dynamicsSyncLog).orderBy(desc(dynamicsSyncLog.timestamp)).limit(100);
    res.json(rows);
  });

  app.get("/api/dynamics/settings", requirePerm("viewDeals"), async (_req, res) => {
    res.json(await getSettings());
  });

  app.get("/api/dynamics/owners", requirePerm("viewDeals"), async (_req, res) => {
    res.json(await db.select().from(dynamicsOwners).orderBy(dynamicsOwners.name));
  });

  // ============ WRITE: Settings ============
  app.patch("/api/dynamics/settings", requirePerm("manageRateCards"), async (req, res) => {
    const { autoPushEnabled, autoPushOnStageChange, autoPushOnFeeChange, nightlyBatchEnabled } = req.body || {};
    const current = await getSettings();
    const patch: any = { updatedAt: new Date() };
    if (typeof autoPushEnabled === "boolean") patch.autoPushEnabled = autoPushEnabled;
    if (typeof autoPushOnStageChange === "boolean") patch.autoPushOnStageChange = autoPushOnStageChange;
    if (typeof autoPushOnFeeChange === "boolean") patch.autoPushOnFeeChange = autoPushOnFeeChange;
    if (typeof nightlyBatchEnabled === "boolean") patch.nightlyBatchEnabled = nightlyBatchEnabled;
    await db.update(dynamicsSettings).set(patch).where(eq(dynamicsSettings.id, current.id));
    await logEvent({
      direction: "outbound", entity: "System", entityName: "Integration settings",
      action: "Updated sync settings",
      fields: Object.keys(patch).filter((k) => k !== "updatedAt"),
      message: `Sync settings updated: auto-push=${patch.autoPushEnabled ?? current.autoPushEnabled}`,
      actorName: req.body?.userName,
    });
    const [updated] = await db.select().from(dynamicsSettings).where(eq(dynamicsSettings.id, current.id));
    res.json(updated);
  });

  // ============ WRITE: Account edit ============
  app.patch("/api/dynamics/accounts/:id", requirePerm("editDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const allowed = [
      "name", "industry", "industryCode", "segment", "annualRevenue", "numberOfEmployees",
      "ownerName", "ownerEmail", "contactName", "contactTitle", "contactEmail", "contactPhone",
      "billingStreet", "billingCity", "billingState", "billingZip", "relationshipType",
    ];
    const patch: any = { updatedAt: new Date(), lastSyncedAt: new Date() };
    const changed: string[] = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        patch[k] = typeof req.body[k] === "number" ? String(req.body[k]) : req.body[k];
        changed.push(k);
      }
    }
    if (changed.length === 0) return res.status(400).json({ error: "No fields to update" });
    await db.update(dynamicsAccounts).set(patch).where(eq(dynamicsAccounts.id, id));
    const [updated] = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.id, id));
    await logEvent({
      direction: "inbound", entity: "Account", entityName: updated.name, entityRefId: id,
      action: "Account record edited in D365",
      fields: changed, status: "success", actorName: req.body?.userName,
      message: `Inbound sync: ${changed.length} field(s) updated on ${updated.name} from D365`,
    });
    res.json(formatAccount(updated));
  });

  // ============ WRITE: Opportunity edit ============
  app.patch("/api/dynamics/opportunities/:id", requirePerm("editDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const allowed = ["name", "estimatedValue", "stage", "probability", "estimatedCloseDate",
                     "ownerName", "forecastCategory", "rating"];
    const patch: any = { updatedAt: new Date(), lastPulledAt: new Date() };
    const changed: string[] = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        patch[k] = ["estimatedValue"].includes(k) ? String(req.body[k]) :
                   k === "probability" ? parseInt(req.body[k]) : req.body[k];
        changed.push(k);
      }
    }
    if (patch.stage && !patch.probability) {
      patch.probability = STAGE_PROBABILITY[patch.stage] ?? 20;
      changed.push("probability");
    }
    if (patch.stage || patch.probability) {
      patch.forecastCategory = forecastFor(patch.stage || "Qualify", patch.probability ?? 20);
    }
    await db.update(dynamicsOpportunities).set(patch).where(eq(dynamicsOpportunities.id, id));
    const [updated] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, id));
    await logEvent({
      direction: "inbound", entity: "Opportunity", entityName: updated.name, entityRefId: id,
      action: "Opportunity edited in D365",
      fields: changed, status: "success", actorName: req.body?.userName,
      message: `Inbound sync: ${updated.name} updated in D365 (${changed.join(", ")})`,
    });
    res.json(formatOpp(updated));
  });

  // ============ WRITE: Import opportunity → DealPad draft ============
  app.post("/api/dynamics/opportunities/:id/import", requirePerm("createDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [opp] = await db.select().from(dynamicsOpportunities).where(eq(dynamicsOpportunities.id, id));
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });
    if (opp.dealpadDealId) return res.status(400).json({ error: "Already imported", dealId: opp.dealpadDealId });

    // Find or create matching client
    let clientId: number | null = null;
    if (opp.dynamicsAccountId) {
      const [acct] = await db.select().from(dynamicsAccounts).where(eq(dynamicsAccounts.id, opp.dynamicsAccountId));
      clientId = acct?.dealpadClientId ?? null;
    }
    if (!clientId) {
      // Try match by name
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
        await logEvent({
          direction: "inbound", entity: "Account", entityName: newClient.name, entityRefId: newClient.id,
          action: "Auto-created DealPad client from D365 account",
          status: "success", actorName: req.body?.userName,
          message: `Inbound sync: Created DealPad client ${newClient.name} during opportunity import`,
        });
      }
    }

    const dealNumber = `D-${Date.now().toString().slice(-7)}`;
    const [newDeal] = await db.insert(deals).values({
      dealNumber,
      title: opp.name,
      clientId: clientId!,
      status: "draft",
      dealType: "new",
      totalFee: opp.estimatedValue || "0",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: opp.estimatedCloseDate || null,
      pdlName: opp.ownerName || null,
      currentStep: 1,
    }).returning();

    await db.update(dynamicsOpportunities).set({
      dealpadDealId: newDeal.id,
      syncStatus: "synced",
      syncDirection: "bidirectional",
      lastPulledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(dynamicsOpportunities.id, id));

    await logEvent({
      direction: "inbound", entity: "Opportunity", entityName: opp.name, entityRefId: id,
      action: "Imported D365 opportunity as DealPad draft",
      fields: ["name", "accountName", "estimatedValue", "stage", "estimatedCloseDate", "ownerName"],
      status: "success", actorName: req.body?.userName,
      message: `Inbound sync: D365 opportunity ${opp.opportunityNumber} created DealPad deal ${dealNumber}`,
    });

    res.json({ success: true, dealId: newDeal.id, dealNumber });
  });

  // ============ WRITE: Manual push deal → D365 ============
  app.post("/api/dynamics/deals/:id/push", requirePerm("editDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const result = await pushDealToDynamics(id, req.body?.userName, "manual");
    if (!result.ok) return res.status(404).json(result);
    res.json(result);
  });

  // ============ WRITE: Bulk sync simulation ============
  app.post("/api/dynamics/sync", requirePerm("editDeals"), async (req, res) => {
    const { entity = "All", direction = "bidirectional", userName } = req.body || {};
    let pulled = 0, pushed = 0;

    if (direction !== "outbound") {
      // Inbound: refresh lastSyncedAt timestamps and log
      await db.update(dynamicsAccounts).set({ lastSyncedAt: new Date() });
      const accts = await db.select().from(dynamicsAccounts).limit(2);
      for (const a of accts) {
        await logEvent({
          direction: "inbound", entity: "Account", entityName: a.name, entityRefId: a.id,
          action: "Pulled account record from D365",
          fields: ["annualRevenue", "primaryContact"],
          actorName: userName, trigger: "manual",
          message: `Inbound sync by ${userName || "User"}: refreshed ${a.name} from Dynamics 365`,
        });
        pulled++;
      }
    }
    if (direction !== "inbound") {
      // Outbound: push linked deals
      const opps = await db.select().from(dynamicsOpportunities).limit(3);
      for (const o of opps) {
        if (!o.dealpadDealId) continue;
        await pushDealToDynamics(o.dealpadDealId, userName, "manual");
        pushed++;
      }
    }

    res.json({
      success: true, entity, direction, pulled, pushed,
      durationMs: 1200 + Math.floor(Math.random() * 800),
      timestamp: new Date().toISOString(),
    });
  });

  // ============ Nightly batch trigger ============
  app.post("/api/dynamics/nightly-batch", requirePerm("manageRateCards"), async (req, res) => {
    const settings = await getSettings();
    if (!settings.nightlyBatchEnabled) {
      return res.status(400).json({ error: "Nightly batch is disabled in Settings" });
    }
    const startedAt = Date.now();

    // INBOUND: refresh timestamps (real implementation would pull updates)
    const acctCount = await db.select({ c: sql<number>`count(*)::int` }).from(dynamicsAccounts);
    const oppCount = await db.select({ c: sql<number>`count(*)::int` }).from(dynamicsOpportunities);
    await db.update(dynamicsAccounts).set({ lastSyncedAt: new Date() });
    await db.update(dynamicsOpportunities).set({ lastPulledAt: new Date() });

    // OUTBOUND: push every linked DealPad deal back to D365
    const linkedOpps = await db.select().from(dynamicsOpportunities)
      .where(sql`${dynamicsOpportunities.dealpadDealId} IS NOT NULL`);
    let pushed = 0, failed = 0;
    for (const o of linkedOpps) {
      if (!o.dealpadDealId) continue;
      try {
        const r = await pushDealToDynamics(o.dealpadDealId, req.body?.userName, "manual");
        if (r.ok) pushed++; else failed++;
      } catch {
        failed++;
      }
    }

    await logEvent({
      direction: "bidirectional", entity: "System", entityName: "Nightly batch",
      action: "Completed nightly D365 ⇄ DealPad sync",
      fields: ["accounts", "opportunities", "deals"],
      status: failed > 0 ? "warning" : "success",
      actorName: req.body?.userName, trigger: "batch",
      message: `Nightly batch: pulled ${acctCount[0].c} accounts + ${oppCount[0].c} opps, pushed ${pushed} deals${failed > 0 ? `, ${failed} failed` : ""} (${Date.now() - startedAt}ms)`,
    });
    res.json({ success: true, pulled: acctCount[0].c + oppCount[0].c, pushed, failed });
  });
}

function formatAccount(a: any) {
  return {
    ...a,
    annualRevenue: parseFloat(a.annualRevenue || "0"),
    primaryContact: {
      name: a.contactName, title: a.contactTitle,
      email: a.contactEmail, phone: a.contactPhone,
    },
    billingAddress: {
      street: a.billingStreet, city: a.billingCity,
      state: a.billingState, zip: a.billingZip, country: a.billingCountry,
    },
    source: "Dynamics 365",
  };
}

function formatOpp(o: any) {
  return {
    ...o,
    estimatedValue: parseFloat(o.estimatedValue || "0"),
    actualValue: o.actualValue !== null && o.actualValue !== undefined ? parseFloat(o.actualValue) : null,
  };
}

function buildPipelineSummary(rawOpps: any[], owners: any[]) {
  const opps = rawOpps.map(formatOpp);
  const open = opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost");
  const byStage = ["Qualify", "Develop", "Propose", "Close"].map((s) => {
    const items = open.filter((o) => o.stage === s);
    return {
      stage: s,
      count: items.length,
      value: items.reduce((sum, o) => sum + o.estimatedValue, 0),
      weighted: items.reduce((sum, o) => sum + o.estimatedValue * (o.probability / 100), 0),
    };
  });
  const byOwner = owners.map((o) => {
    const items = open.filter((opp) => opp.ownerName === o.name);
    return {
      owner: o.name, count: items.length,
      value: items.reduce((s, x) => s + x.estimatedValue, 0),
      weighted: items.reduce((s, x) => s + x.estimatedValue * (x.probability / 100), 0),
      quota: parseFloat(o.quota || "2500000"),
    };
  });
  const won = opps.filter((o) => o.stage === "Won");
  const lost = opps.filter((o) => o.stage === "Lost");
  const wonValue = won.reduce((s, o) => s + (o.actualValue || 0), 0);
  const lostValue = lost.reduce((s, o) => s + o.estimatedValue, 0);
  const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;
  const quotaTotal = byOwner.reduce((s, o) => s + o.quota, 0);

  return {
    totalPipelineValue: open.reduce((s, o) => s + o.estimatedValue, 0),
    weightedPipelineValue: open.reduce((s, o) => s + o.estimatedValue * (o.probability / 100), 0),
    openOpportunities: open.length,
    avgDealSize: open.length > 0 ? open.reduce((s, o) => s + o.estimatedValue, 0) / open.length : 0,
    winRate, wonYTD: { count: won.length, value: wonValue }, lostYTD: { count: lost.length, value: lostValue },
    byStage, byOwner,
    forecast: {
      commit: opps.filter((o) => o.forecastCategory === "Commit").reduce((s, o) => s + o.estimatedValue, 0),
      bestCase: opps.filter((o) => o.forecastCategory === "Best Case").reduce((s, o) => s + o.estimatedValue, 0),
      pipeline: opps.filter((o) => o.forecastCategory === "Pipeline").reduce((s, o) => s + o.estimatedValue, 0),
      closed: opps.filter((o) => o.forecastCategory === "Closed").reduce((s, o) => s + o.estimatedValue, 0),
    },
    quotaTotal,
  };
}
