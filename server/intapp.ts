import { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  intappSettings, intappScreenings, intappHits, intappMitigations, intappEvents,
  deals, clients,
} from "../shared/schema";

// ====================================================================
// PROVIDER INTERFACE
// Switching from simulated → live = configuration change only.
// ====================================================================
export interface IntappScreeningRequest {
  dealId: number;
  payload: {
    clientName: string;
    clientIndustry?: string | null;
    clientRegion?: string | null;
    relationshipYears?: number | null;
    dealTitle: string;
    dealType: string;
    serviceLine?: string | null;
    totalFee: number;
    requestedBy?: string | null;
  };
  policyVersion: string;
}

export interface IntappHit {
  hitType: string;
  severity: "low" | "medium" | "high";
  matchedEntity: string;
  description: string;
  recommendation: string;
  externalRef?: string;
}

export interface IntappScreeningResponse {
  source: "simulated" | "live";
  externalRef: string;
  result: "clear" | "review" | "conflict";
  riskTier: "low" | "medium" | "high";
  hits: IntappHit[];
  narrative: string;
  policyVersion: string;
}

export interface IntappProvider {
  readonly mode: "simulated" | "live";
  /** Submit a deal for screening. Required by both simulated and live providers. */
  screenDeal(req: IntappScreeningRequest): Promise<IntappScreeningResponse>;
  /** Fetch a previously-issued screening by externalRef (live polling); simulated returns null. */
  getScreening(externalRef: string): Promise<IntappScreeningResponse | null>;
  /** Re-run a screening using the same payload (used by nightly batch + manual recheck). */
  recheck(req: IntappScreeningRequest): Promise<IntappScreeningResponse>;
}

// ====================================================================
// SIMULATED PROVIDER — deterministic from inputs
// ====================================================================
const HIGH_RISK_INDUSTRIES = ["Cannabis", "Cryptocurrency", "Gaming", "Defense"];
const REGULATED_INDUSTRIES = ["Banking", "Insurance", "Healthcare", "Public Sector"];
const SANCTIONS_KEYWORDS = ["holdings ltd", "global trust", "pacific ventures"];
const PEP_KEYWORDS = ["senator", "minister", "ambassador"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

class SimulatedIntappProvider implements IntappProvider {
  readonly mode = "simulated" as const;

  async getScreening(_externalRef: string) { return null; }
  async recheck(req: IntappScreeningRequest) { return this.screenDeal(req); }

  async screenDeal(req: IntappScreeningRequest): Promise<IntappScreeningResponse> {
    const { payload } = req;
    const name = (payload.clientName || "").toLowerCase();
    const industry = payload.clientIndustry || "";
    const fee = payload.totalFee || 0;
    const years = payload.relationshipYears ?? 0;
    const seed = hashString(`${name}|${payload.dealType}|${industry}`);

    const hits: IntappHit[] = [];

    // Sanctions / watchlist scan
    if (SANCTIONS_KEYWORDS.some(k => name.includes(k))) {
      hits.push({
        hitType: "sanctions_watchlist",
        severity: "high",
        matchedEntity: payload.clientName,
        description: `Name match against OFAC SDN-style watchlist record for "${payload.clientName}".`,
        recommendation: "Halt onboarding pending QRM review and enhanced due diligence (EDD).",
        externalRef: `WL-${seed % 90000 + 10000}`,
      });
    }

    // PEP scan
    if (PEP_KEYWORDS.some(k => name.includes(k))) {
      hits.push({
        hitType: "pep",
        severity: "medium",
        matchedEntity: payload.clientName,
        description: "Politically Exposed Person association detected in beneficial ownership.",
        recommendation: "Document EDD file; route to QRM Lead for sign-off.",
      });
    }

    // Industry conflict for high-risk verticals
    if (HIGH_RISK_INDUSTRIES.includes(industry)) {
      hits.push({
        hitType: "industry_restriction",
        severity: "high",
        matchedEntity: industry,
        description: `${industry} engagements require partner-level pre-approval per firm policy.`,
        recommendation: "Confirm partner sponsor + independence clearance before submitting.",
      });
    }

    // Independence concern (deterministic ~12%)
    if (seed % 8 === 0 && years >= 7) {
      hits.push({
        hitType: "independence",
        severity: "medium",
        matchedEntity: payload.clientName,
        description: "Long-standing relationship plus prior non-attest services may impair independence.",
        recommendation: "Validate independence checklist with QRM; rotate engagement partner if required.",
      });
    }

    // Conflict of interest with adverse party (deterministic)
    if (seed % 11 === 0) {
      hits.push({
        hitType: "conflict_of_interest",
        severity: "medium",
        matchedEntity: `${payload.clientName} ↔ existing client #${(seed % 4000) + 1000}`,
        description: "Adverse-party overlap with an existing engagement detected in relationship graph.",
        recommendation: "Obtain conflict waiver letters from both clients.",
      });
    }

    // Regulated industry advisory note
    if (REGULATED_INDUSTRIES.includes(industry) && hits.length === 0) {
      hits.push({
        hitType: "regulatory_review",
        severity: "low",
        matchedEntity: industry,
        description: `Standard regulatory due-diligence questionnaire required for ${industry} clients.`,
        recommendation: "Attach completed regulatory checklist before partner sign-off.",
      });
    }

    // High-fee threshold review
    if (fee >= 500_000 && !hits.some(h => h.hitType === "fee_threshold")) {
      hits.push({
        hitType: "fee_threshold",
        severity: "low",
        matchedEntity: `Fee $${fee.toLocaleString()}`,
        description: "Engagement fee exceeds $500k — partner concurrence required by policy.",
        recommendation: "Route to QRM Lead and Practice Partner concurrent reviewers.",
      });
    }

    const hasHigh = hits.some(h => h.severity === "high");
    const hasMedium = hits.some(h => h.severity === "medium");

    const result: "clear" | "review" | "conflict" =
      hasHigh ? "conflict" : hasMedium ? "review" : "clear";
    const riskTier: "low" | "medium" | "high" =
      hasHigh ? "high" : hasMedium ? "medium" : "low";

    const narrative = hits.length === 0
      ? `Cleared. No conflicts, sanctions, PEP or independence concerns detected for ${payload.clientName} in the simulated Intapp policy index (${req.policyVersion}).`
      : `${hits.length} finding(s) detected. ${hasHigh ? "Engagement is BLOCKED pending mitigation or QRM override." : "Engagement may proceed with documented mitigations."} Highest severity: ${hasHigh ? "high" : hasMedium ? "medium" : "low"}.`;

    return {
      source: "simulated",
      externalRef: `SIM-INT-${seed % 9000000 + 1000000}`,
      result,
      riskTier,
      hits,
      narrative,
      policyVersion: req.policyVersion,
    };
  }
}

// ====================================================================
// LIVE PROVIDER STUB — placeholder for the real Intapp REST integration
// Maps 1:1 to /api/risk/screen endpoints; payload + response shapes match.
// ====================================================================
class LiveIntappProvider implements IntappProvider {
  readonly mode = "live" as const;
  constructor(
    private baseUrl: string,
    private tokenSecret: string,
    private clientId?: string | null,
  ) {}

  private notReady(): never {
    throw new Error(
      "Live Intapp provider not yet activated. Provision INTAPP_API_TOKEN, set Live tenant URL " +
      "and Client ID in Intapp Settings, switch mode to 'live', and confirm outbound allow-list. " +
      "The simulated schema and response contract match Intapp Risk REST API v2 — no DealPad " +
      "code change required, only configuration."
    );
  }

  async screenDeal(_req: IntappScreeningRequest): Promise<IntappScreeningResponse> { return this.notReady(); }
  async getScreening(_externalRef: string): Promise<IntappScreeningResponse | null> { return this.notReady(); }
  async recheck(_req: IntappScreeningRequest): Promise<IntappScreeningResponse> { return this.notReady(); }
}

// ====================================================================
// PROVIDER FACTORY (cached)
// ====================================================================
let cachedSettingsId: number | null = null;
let cachedProvider: IntappProvider | null = null;
let cachedMode: string | null = null;

async function getSettings() {
  let [s] = await db.select().from(intappSettings).limit(1);
  if (!s) {
    [s] = await db.insert(intappSettings).values({
      mode: "simulated",
      pilotEndsOn: new Date(Date.now() + 28 * 86400 * 1000).toISOString().slice(0, 10),
    }).returning();
  }
  cachedSettingsId = s.id;
  return s;
}

async function getProvider(): Promise<IntappProvider> {
  const s = await getSettings();
  if (cachedProvider && cachedMode === s.mode) return cachedProvider;
  cachedMode = s.mode;
  cachedProvider = s.mode === "live"
    ? new LiveIntappProvider(
        (s as any).liveTenantUrl || s.apiBaseUrl || "",
        process.env.INTAPP_API_TOKEN || (s as any).liveApiKeySecret || s.apiTokenSecret || "",
        (s as any).liveClientId || null,
      )
    : new SimulatedIntappProvider();
  return cachedProvider;
}

async function logEvent(args: {
  dealId?: number | null; screeningId?: number | null;
  eventType: string; actorName?: string | null; actorRole?: string | null;
  message: string; metadata?: any; source?: string;
}) {
  await db.insert(intappEvents).values({
    dealId: args.dealId ?? null,
    screeningId: args.screeningId ?? null,
    eventType: args.eventType,
    source: args.source || cachedMode || "simulated",
    actorName: args.actorName ?? null,
    actorRole: args.actorRole ?? null,
    message: args.message,
    metadata: args.metadata ?? null,
  });
}

// ====================================================================
// CORE: run screening for a deal (called from trigger or manually)
// ====================================================================
export async function runScreeningForDeal(
  dealId: number,
  requestedBy?: string,
  trigger: string = "manual",
) {
  const settings = await getSettings();
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error(`Deal ${dealId} not found`);
  const [client] = await db.select().from(clients).where(eq(clients.id, deal.clientId));

  const payload = {
    clientName: client?.name || "Unknown Client",
    clientIndustry: client?.industry || null,
    clientRegion: client?.region || null,
    relationshipYears: client?.relationshipYears ?? null,
    dealTitle: deal.title,
    dealType: deal.dealType,
    serviceLine: deal.serviceLine || null,
    totalFee: parseFloat(deal.totalFee || "0"),
    requestedBy: requestedBy || null,
  };

  // Insert pending screening
  const [screening] = await db.insert(intappScreenings).values({
    dealId,
    source: settings.mode === "live" ? "live" : "simulated",
    status: "running",
    result: "pending",
    riskTier: "low",
    hitCount: 0,
    policyVersion: settings.policyVersion || "4w-pilot-v1",
    requestedBy: requestedBy || null,
    payloadSnapshot: payload,
  }).returning();

  await logEvent({
    dealId, screeningId: screening.id,
    eventType: "screening_requested",
    actorName: requestedBy,
    message: `Intapp screening requested for ${payload.clientName} (${trigger})`,
    metadata: { trigger, source: screening.source },
    source: screening.source,
  });

  // Run provider
  let response: IntappScreeningResponse;
  try {
    const provider = await getProvider();
    response = await provider.screenDeal({
      dealId, payload,
      policyVersion: settings.policyVersion || "4w-pilot-v1",
    });
  } catch (e: any) {
    await db.update(intappScreenings).set({
      status: "error",
      result: "pending",
      completedAt: new Date(),
      narrative: `Screening failed: ${e?.message || "unknown error"}`,
    }).where(eq(intappScreenings.id, screening.id));
    await logEvent({
      dealId, screeningId: screening.id,
      eventType: "screening_error",
      message: `Intapp screening failed: ${e?.message || "unknown error"}`,
      source: screening.source,
    });
    throw e;
  }

  await db.update(intappScreenings).set({
    status: "complete",
    result: response.result,
    riskTier: response.riskTier,
    hitCount: response.hits.length,
    externalRef: response.externalRef,
    narrative: response.narrative,
    completedAt: new Date(),
  }).where(eq(intappScreenings.id, screening.id));

  if (response.hits.length > 0) {
    await db.insert(intappHits).values(response.hits.map(h => ({
      screeningId: screening.id,
      hitType: h.hitType,
      severity: h.severity,
      matchedEntity: h.matchedEntity,
      description: h.description,
      recommendation: h.recommendation,
      externalRef: h.externalRef || null,
    })));
  }

  await logEvent({
    dealId, screeningId: screening.id,
    eventType: "screening_completed",
    actorName: requestedBy,
    message: `Intapp screening completed: ${response.result.toUpperCase()} (${response.riskTier} tier, ${response.hits.length} hit${response.hits.length === 1 ? "" : "s"})`,
    metadata: { result: response.result, riskTier: response.riskTier, hitCount: response.hits.length },
    source: screening.source,
  });

  return { screening: { ...screening, ...response, status: "complete", hitCount: response.hits.length }, response };
}

// Latest screening helper
export async function getLatestScreening(dealId: number) {
  const [s] = await db.select().from(intappScreenings)
    .where(eq(intappScreenings.dealId, dealId))
    .orderBy(desc(intappScreenings.requestedAt))
    .limit(1);
  if (!s) return null;
  const hits = await db.select().from(intappHits).where(eq(intappHits.screeningId, s.id));
  const mits = await db.select().from(intappMitigations).where(eq(intappMitigations.screeningId, s.id));
  return { ...s, hits, mitigations: mits };
}

// Trigger from deal status change. Returns block info if conflict found and gating is on.
export async function onDealSubmittedTrigger(dealId: number, requestedBy?: string) {
  const settings = await getSettings();
  if (!settings.autoScreenOnSubmit) return { triggered: false };
  try {
    const { response } = await runScreeningForDeal(dealId, requestedBy, "deal_submitted");
    return {
      triggered: true,
      result: response.result,
      blocked: response.result === "conflict" && !!settings.blockSubmitOnConflict,
    };
  } catch (e) {
    return { triggered: true, error: String(e) };
  }
}

/**
 * Synchronous gating helper used by deal status routes BEFORE the deal is set
 * to "submitted" or an approval row is inserted. Returns { allow: false } when
 * a blocking conflict is present and gating is enabled. The route MUST honor
 * `allow=false` and short-circuit with HTTP 409 instead of mutating state.
 */
export async function assertSubmissionAllowed(
  dealId: number,
  requestedBy?: string,
): Promise<{ allow: boolean; reason?: string; screening?: any }> {
  const settings = await getSettings();
  if (!settings.autoScreenOnSubmit) return { allow: true };

  // If the most recent screening was a QRM override, honor it: do NOT re-run
  // (re-running would invalidate the override). Otherwise ALWAYS run a fresh
  // screening at submit time so stale "clear" screenings cannot be reused to
  // bypass new policy or new client/deal data.
  const prior = await getLatestScreening(dealId);
  if (prior?.result === "override_approved") {
    return { allow: true, screening: prior };
  }

  try {
    await runScreeningForDeal(dealId, requestedBy, "deal_submitted");
  } catch (e: any) {
    // Provider failure: fail-closed in live mode (block), fail-open in
    // simulated pilot mode (allow with surfaced reason). Live cutover MUST
    // not silently allow submissions when the provider is unreachable.
    if (settings.mode === "live") {
      return {
        allow: false,
        reason: `Intapp provider error during submission gating: ${e?.message || e}`,
      };
    }
    return { allow: true, reason: `Screening provider warning: ${e?.message || e}` };
  }
  const fresh = await getLatestScreening(dealId);
  if (!fresh) return { allow: true };
  if (fresh.result === "conflict" && settings.blockSubmitOnConflict) {
    return {
      allow: false,
      reason: `Intapp Risk screening returned a CONFLICT (${fresh.riskTier} tier, ${fresh.hitCount} finding(s)). Resolve mitigations or obtain a QRM override before submitting.`,
      screening: fresh,
    };
  }
  return { allow: true, screening: fresh };
}

/**
 * Trigger fired when a client record changes (industry/region/relationship).
 * Re-screens any non-archived deals attached to that client when the
 * `autoScreenOnClientChange` setting is enabled.
 */
export async function onClientChangedTrigger(clientId: number, actor?: string) {
  const settings = await getSettings();
  if (!settings.autoScreenOnClientChange) return { triggered: false };
  const open = await db.select({ id: deals.id }).from(deals)
    .where(and(eq(deals.clientId, clientId), sql`${deals.status} <> 'archived'`));
  for (const d of open) {
    try { await runScreeningForDeal(d.id, actor || "Client Change Trigger", "client_changed"); } catch {}
  }
  return { triggered: true, count: open.length };
}

/**
 * Nightly batch re-screen of all open deals. Started once at process boot
 * when the setting is enabled. Idempotent — re-checks `intapp_settings` on
 * every tick so the cadence reflects the current config.
 */
let nightlyTimerStarted = false;
export function startNightlyRescreenLoop() {
  if (nightlyTimerStarted) return;
  nightlyTimerStarted = true;
  const tick = async () => {
    try {
      const settings = await getSettings();
      if (!settings.nightlyRescreen) return;
      const open = await db.select({ id: deals.id }).from(deals)
        .where(sql`${deals.status} IN ('draft','submitted','in_review')`);
      for (const d of open) {
        try { await runScreeningForDeal(d.id, "Nightly Batch", "nightly"); } catch {}
      }
    } catch (e) { console.error("Intapp nightly rescreen error:", e); }
  };
  // Run every 24h; jitter the first run by 60s so server boot isn't blocked.
  setTimeout(() => { tick(); setInterval(tick, 24 * 60 * 60 * 1000); }, 60 * 1000);
}

// ====================================================================
// IDENTITY (PoC) — trusted-from-headers, not body
// In PoC there is no JWT, but we standardize on x-user-name / x-user-role
// headers set by the React client from AuthContext. Body fields are NEVER
// trusted for authorization decisions.
// ====================================================================
function identityFrom(req: Request): { name: string | null; role: string | null } {
  const name = (req.header("x-user-name") || "").trim() || null;
  const role = ((req.header("x-user-role") || "").trim().toLowerCase()) || null;
  return { name, role };
}

function requireIdentity(req: Request, res: Response): { name: string; role: string } | null {
  const { name, role } = identityFrom(req);
  if (!name || !role) {
    res.status(401).json({ error: "Authentication required: x-user-name and x-user-role headers must be set." });
    return null;
  }
  return { name, role };
}

function requireRoles(req: Request, res: Response, allowed: string[]): { name: string; role: string } | null {
  const id = requireIdentity(req, res);
  if (!id) return null;
  if (!allowed.includes(id.role)) {
    res.status(403).json({ error: `This action requires one of: ${allowed.join(", ")}. Current persona: ${id.role}.` });
    return null;
  }
  return id;
}

function maskSecrets<T extends Record<string, any>>(s: T): T & { apiTokenMasked: boolean; liveApiKeyMasked: boolean } {
  const out: any = { ...s };
  out.apiTokenMasked = !!out.apiTokenSecret;
  out.liveApiKeyMasked = !!out.liveApiKeySecret;
  if (out.apiTokenSecret) out.apiTokenSecret = "***";
  if (out.liveApiKeySecret) out.liveApiKeySecret = "***";
  return out;
}

// ====================================================================
// SEED — defaults + demo screenings (clear, review, conflict, override)
// ====================================================================
export async function seedIntapp() {
  await getSettings();
  const existing = await db.select({ c: sql<number>`count(*)::int` }).from(intappScreenings);
  if ((existing[0]?.c ?? 0) > 0) return;

  // Ensure two demo clients + deals exist so the dashboard always has rich data:
  //   - one cannabis high-risk industry (will produce a conflict)
  //   - one PEP-named (will produce a medium review)
  const ensureDealForDemo = async (clientName: string, industry: string, title: string, fee: string) => {
    let [c] = await db.select().from(clients).where(eq(clients.name, clientName));
    if (!c) {
      [c] = await db.insert(clients).values({
        name: clientName, industry, segment: "Mid-Market", region: "West",
        relationshipYears: 9, contactName: "Demo Contact", contactEmail: "demo@example.com",
      }).returning();
    }
    let [d] = await db.select().from(deals).where(and(eq(deals.clientId, c.id), eq(deals.title, title)));
    if (!d) {
      const dealNumber = `INT-DEMO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
      [d] = await db.insert(deals).values({
        dealNumber, title, clientId: c.id, status: "draft", dealType: "new",
        businessUnit: "Risk Advisory", serviceLine: "Compliance Consulting",
        totalFee: fee, complexity: "medium",
      }).returning();
    }
    return d;
  };

  try {
    const cannabisDeal = await ensureDealForDemo(
      "GreenLeaf Cannabis Holdings",
      "Cannabis",
      "Multi-State Compliance Readiness",
      "385000",
    );
    const pepDeal = await ensureDealForDemo(
      "Senator Westbrook Family Trust",
      "Banking",
      "Trust Tax Advisory FY2026",
      "180000",
    );
    await runScreeningForDeal(cannabisDeal.id, "Demo Seeder", "seed");
    await runScreeningForDeal(pepDeal.id, "Demo Seeder", "seed");
  } catch (e) { /* non-fatal */ }

  // Seed 3 baseline screenings against existing deals
  const allDeals = await db.select().from(deals).limit(8);
  for (const d of allDeals.slice(0, 3)) {
    try { await runScreeningForDeal(d.id, "Demo Seeder", "seed"); } catch {}
  }
}

// ====================================================================
// REST ROUTES
// ====================================================================
export function registerIntappRoutes(app: Express) {
  seedIntapp().catch(e => console.error("Intapp seed error:", e));

  // -------- Settings --------
  app.get("/api/intapp/settings", async (_req, res) => {
    const s = await getSettings();
    res.json({ ...maskSecrets(s), hasApiToken: !!process.env.INTAPP_API_TOKEN });
  });

  app.patch("/api/intapp/settings", async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "it"]);
    if (!id) return;
    const allowed = [
      "mode", "autoScreenOnSubmit", "blockSubmitOnConflict", "allowQrmOverride",
      "autoScreenOnClientChange", "nightlyRescreen",
      "apiBaseUrl", "liveTenantUrl", "liveClientId",
      "policyVersion", "pilotEndsOn",
    ];
    const patch: any = { updatedAt: new Date() };
    const changed: string[] = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) { patch[k] = req.body[k]; changed.push(k); }
    }
    // Secret writes are accepted but never echoed back; "***" sentinel = leave unchanged.
    if (req.body?.apiTokenSecret && req.body.apiTokenSecret !== "***") {
      patch.apiTokenSecret = req.body.apiTokenSecret; changed.push("apiTokenSecret");
    }
    if (req.body?.liveApiKeySecret && req.body.liveApiKeySecret !== "***") {
      patch.liveApiKeySecret = req.body.liveApiKeySecret; changed.push("liveApiKeySecret");
    }
    const s = await getSettings();
    const [updated] = await db.update(intappSettings).set(patch)
      .where(eq(intappSettings.id, s.id)).returning();
    cachedProvider = null; cachedMode = null;
    await logEvent({
      eventType: "settings_updated",
      actorName: id.name, actorRole: id.role,
      message: `Intapp settings updated by ${id.name} (${id.role}): ${changed.join(", ")}`,
      metadata: { changed, mode: updated.mode },
      source: updated.mode,
    });
    res.json(maskSecrets(updated));
  });

  // -------- Screenings --------
  app.get("/api/intapp/screenings", async (req: Request, res: Response) => {
    const dealId = req.query.dealId ? parseInt(String(req.query.dealId)) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const result = req.query.result ? String(req.query.result) : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100;
    const conds: any[] = [];
    if (dealId) conds.push(eq(intappScreenings.dealId, dealId));
    if (status) conds.push(eq(intappScreenings.status, status));
    if (result) conds.push(eq(intappScreenings.result, result));
    const where = conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined;
    const q = db.select().from(intappScreenings)
      .orderBy(desc(intappScreenings.requestedAt))
      .limit(limit);
    const rows = where ? await (q as any).where(where) : await q;
    res.json(rows);
  });

  app.get("/api/intapp/screenings/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [s] = await db.select().from(intappScreenings).where(eq(intappScreenings.id, id));
    if (!s) return res.status(404).json({ error: "Screening not found" });
    const hits = await db.select().from(intappHits).where(eq(intappHits.screeningId, id));
    const mits = await db.select().from(intappMitigations).where(eq(intappMitigations.screeningId, id));
    const events = await db.select().from(intappEvents)
      .where(eq(intappEvents.screeningId, id)).orderBy(desc(intappEvents.createdAt)).limit(50);
    res.json({ ...s, hits, mitigations: mits, events });
  });

  app.get("/api/intapp/deals/:dealId/screening", async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid dealId" });
    const screening = await getLatestScreening(dealId);
    res.json(screening);
  });

  app.post("/api/intapp/deals/:dealId/screen", async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl", "sll", "it"]);
    if (!id) return;
    const dealId = parseInt(req.params.dealId);
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid dealId" });
    try {
      const { response } = await runScreeningForDeal(dealId, id.name, "manual");
      const screening = await getLatestScreening(dealId);
      res.json({ success: true, result: response.result, screening });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Screening failed" });
    }
  });

  // Recheck (re-run) an existing screening — used by nightly batch and the UI "Recheck" button.
  app.post("/api/intapp/screenings/:id/recheck", async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl", "sll", "it"]);
    if (!id) return;
    const screeningId = parseInt(req.params.id);
    const [s] = await db.select().from(intappScreenings).where(eq(intappScreenings.id, screeningId));
    if (!s) return res.status(404).json({ error: "Screening not found" });
    try {
      const { response } = await runScreeningForDeal(s.dealId, id.name, "recheck");
      res.json({ success: true, result: response.result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Recheck failed" });
    }
  });

  // -------- Mitigations --------
  app.get("/api/intapp/screenings/:id/mitigations", async (req, res) => {
    const id = parseInt(req.params.id);
    const rows = await db.select().from(intappMitigations)
      .where(eq(intappMitigations.screeningId, id))
      .orderBy(desc(intappMitigations.createdAt));
    res.json(rows);
  });

  app.post("/api/intapp/screenings/:id/mitigations", async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl", "sll"]);
    if (!id) return;
    const screeningId = parseInt(req.params.id);
    const { hitId, action, notes, status } = req.body || {};
    if (!action) return res.status(400).json({ error: "action is required" });
    const [m] = await db.insert(intappMitigations).values({
      screeningId,
      hitId: hitId || null,
      status: status || "pending",
      action, notes: notes || null,
      resolvedBy: status === "resolved" ? id.name : null,
      resolvedAt: status === "resolved" ? new Date() : null,
    }).returning();
    const [s] = await db.select().from(intappScreenings).where(eq(intappScreenings.id, screeningId));
    await logEvent({
      dealId: s?.dealId, screeningId,
      eventType: "mitigation_added",
      actorName: id.name, actorRole: id.role,
      message: `Mitigation logged by ${id.name} (${id.role}): ${action}`,
      metadata: { hitId, status: m.status },
    });
    res.status(201).json(m);
  });

  app.patch("/api/intapp/mitigations/:id", async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl", "sll"]);
    if (!id) return;
    const mitId = parseInt(req.params.id);
    const patch: any = {};
    if (req.body.status) {
      patch.status = req.body.status;
      if (req.body.status === "resolved" || req.body.status === "completed") {
        patch.resolvedAt = new Date();
        patch.resolvedBy = id.name;
      }
    }
    if (req.body.notes !== undefined) patch.notes = req.body.notes;
    const [updated] = await db.update(intappMitigations).set(patch)
      .where(eq(intappMitigations.id, mitId)).returning();
    if (updated) {
      const [s] = await db.select().from(intappScreenings).where(eq(intappScreenings.id, updated.screeningId));
      await logEvent({
        dealId: s?.dealId, screeningId: updated.screeningId,
        eventType: "mitigation_updated",
        actorName: id.name, actorRole: id.role,
        message: `Mitigation ${mitId} → ${patch.status || "updated"} by ${id.name}`,
        metadata: { mitigationId: mitId, status: patch.status },
      });
    }
    res.json(updated);
  });

  // -------- Override (QRM-only). Identity comes from headers, NEVER request body. --------
  // Both /screenings/:id/override and /deals/:dealId/override are accepted.
  const overrideHandler = async (req: Request, res: Response, lookup: { screeningId?: number; dealId?: number }) => {
    const id = requireRoles(req, res, ["qrm"]);
    if (!id) return;
    const { justification } = req.body || {};
    if (!justification || String(justification).trim().length < 10) {
      return res.status(400).json({ error: "Override justification (min 10 chars) is required." });
    }
    const settings = await getSettings();
    if (!settings.allowQrmOverride) {
      return res.status(403).json({ error: "QRM overrides are disabled in Intapp settings." });
    }
    let screening: any = null;
    if (lookup.screeningId) {
      [screening] = await db.select().from(intappScreenings).where(eq(intappScreenings.id, lookup.screeningId));
    } else if (lookup.dealId) {
      screening = await getLatestScreening(lookup.dealId);
    }
    if (!screening) return res.status(404).json({ error: "Screening not found." });

    await db.update(intappScreenings).set({
      result: "override_approved",
      narrative: `${screening.narrative || ""}\n\n[QRM OVERRIDE by ${id.name}]: ${justification}`,
    }).where(eq(intappScreenings.id, screening.id));

    await logEvent({
      dealId: screening.dealId, screeningId: screening.id,
      eventType: "qrm_override",
      actorName: id.name, actorRole: id.role,
      message: `QRM override applied to Intapp ${screening.riskTier}-tier conflict.`,
      metadata: { justification, originalResult: screening.result, hitCount: screening.hitCount },
    });

    res.json({ success: true, screening: await getLatestScreening(screening.dealId) });
  };

  app.post("/api/intapp/screenings/:id/override", (req: Request, res: Response) =>
    overrideHandler(req, res, { screeningId: parseInt(req.params.id) }));
  app.post("/api/intapp/deals/:dealId/override", (req: Request, res: Response) =>
    overrideHandler(req, res, { dealId: parseInt(req.params.dealId) }));

  // -------- Events / audit log --------
  app.get("/api/intapp/events", async (req, res) => {
    const dealId = req.query.dealId ? parseInt(String(req.query.dealId)) : null;
    const rows = dealId
      ? await db.select().from(intappEvents)
          .where(eq(intappEvents.dealId, dealId))
          .orderBy(desc(intappEvents.createdAt)).limit(200)
      : await db.select().from(intappEvents)
          .orderBy(desc(intappEvents.createdAt)).limit(100);
    res.json(rows);
  });

  // -------- QRM dashboard surface --------
  app.get("/api/intapp/dashboard", async (_req, res) => {
    const allScreenings = await db.select().from(intappScreenings)
      .orderBy(desc(intappScreenings.requestedAt));
    const all = allScreenings;
    const total = all.length;
    const byResult = {
      clear: all.filter(s => s.result === "clear").length,
      review: all.filter(s => s.result === "review").length,
      conflict: all.filter(s => s.result === "conflict").length,
      override: all.filter(s => s.result === "override_approved").length,
      pending: all.filter(s => s.result === "pending").length,
    };
    const byTier = {
      low: all.filter(s => s.riskTier === "low").length,
      medium: all.filter(s => s.riskTier === "medium").length,
      high: all.filter(s => s.riskTier === "high").length,
    };

    const openConflicts = await db.select({
      id: intappScreenings.id, dealId: intappScreenings.dealId,
      riskTier: intappScreenings.riskTier, hitCount: intappScreenings.hitCount,
      result: intappScreenings.result, requestedAt: intappScreenings.requestedAt,
      narrative: intappScreenings.narrative,
      dealTitle: deals.title, dealNumber: deals.dealNumber, clientName: clients.name,
    })
      .from(intappScreenings)
      .leftJoin(deals, eq(intappScreenings.dealId, deals.id))
      .leftJoin(clients, eq(deals.clientId, clients.id))
      .where(eq(intappScreenings.result, "conflict"))
      .orderBy(desc(intappScreenings.requestedAt))
      .limit(20);

    const recentEvents = await db.select().from(intappEvents)
      .orderBy(desc(intappEvents.createdAt)).limit(15);

    const openMitsRows = await db.select().from(intappMitigations)
      .where(eq(intappMitigations.status, "open"));

    const settings = await getSettings();
    res.json({
      mode: settings.mode,
      policyVersion: settings.policyVersion,
      pilotEndsOn: settings.pilotEndsOn,
      total, byResult, byTier,
      summary: {
        total,
        conflictCount: byResult.conflict,
        reviewCount: byResult.review,
        clearCount: byResult.clear,
        overrideCount: byResult.override,
        openMitigations: openMitsRows.length,
      },
      openConflicts, recentEvents,
    });
  });
}
