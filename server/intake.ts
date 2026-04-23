import { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requirePerm } from "./rbac";
import {
  intakeRequests, intakeExtractions, intakeApprovals, intakeEvents,
  intappSettings, intappScreenings,
  deals, clients,
} from "../shared/schema";
import { runScreeningForDeal, getLatestScreening } from "./intapp";

// ====================================================================
// Identity helper (mirrors intapp.ts)
// ====================================================================
function requireRoles(req: Request, res: Response, roles: string[]) {
  const role = (req.header("x-user-role") || "").toLowerCase();
  const name = req.header("x-user-name") || "Unknown";
  if (!role || !roles.includes(role)) {
    res.status(403).json({ error: `Requires one of: ${roles.join(", ")}` });
    return null;
  }
  return { role, name };
}

// ====================================================================
// PROVIDER INTERFACE — simulated → live by config (matches intapp pattern)
// ====================================================================
export interface IntakeProvider {
  readonly mode: "simulated" | "live";
  openRequest(req: OpenRequestArgs): Promise<OpenRequestResponse>;
  postPricingPacket(args: PricingPacketArgs): Promise<PricingPacketResponse>;
  acceptRequest(args: AcceptArgs): Promise<{ matterId: string }>;
}

export interface OpenRequestArgs {
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
  };
  policyVersion: string;
}

export interface OpenRequestResponse {
  source: "simulated" | "live";
  externalRef: string;
  riskTier: "low" | "medium" | "high";
  jurisdiction: string;
  serviceLine: string;
  extractions: Array<{
    fieldKey: string;
    fieldLabel: string;
    value: string;
    sourceDoc: string;
    confidence: number;
  }>;
  approvalMatrix: Array<{
    reviewerRole: string;
    reviewerLabel: string;
    reason: string;
  }>;
}

export interface PricingPacketArgs {
  requestId: number;
  totalFee: number;
  margin: number;
  scopeSummary: string;
}
export interface PricingPacketResponse {
  addedReviewers: Array<{ reviewerRole: string; reviewerLabel: string; reason: string }>;
}

export interface AcceptArgs { requestId: number; dealNumber: string; }

// ====================================================================
// SIMULATED PROVIDER — deterministic from inputs
// ====================================================================
const HIGH_RISK_INDUSTRIES = ["Cannabis", "Cryptocurrency", "Gaming", "Defense"];
const REGULATED_INDUSTRIES = ["Banking", "Insurance", "Healthcare", "Public Sector"];
const NON_US_REGIONS = ["EMEA", "APAC", "LATAM", "EU", "UK", "Canada"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildExtractions(p: OpenRequestArgs["payload"], seed: number) {
  const startOffset = 14 + (seed % 28);
  const start = new Date(Date.now() + startOffset * 86400 * 1000).toISOString().slice(0, 10);
  const feeBand = p.totalFee >= 750_000 ? "$750k–$1.2M"
    : p.totalFee >= 400_000 ? "$400k–$750k"
    : p.totalFee >= 150_000 ? "$150k–$400k"
    : "<$150k";
  const riskFactor = HIGH_RISK_INDUSTRIES.includes(p.clientIndustry || "")
    ? `${p.clientIndustry} sector — heightened EDD required`
    : REGULATED_INDUSTRIES.includes(p.clientIndustry || "")
    ? `${p.clientIndustry} regulated industry — standard policy review`
    : "Standard commercial engagement";
  const contactSurnames = ["Patel", "Nguyen", "Rivera", "Chen", "Okafor", "Müller"];
  const contactRole = ["CFO", "Controller", "VP Finance", "GC", "COO"][seed % 5];
  const contactName = `${contactSurnames[seed % contactSurnames.length]}, ${contactRole}`;
  const sourceDoc = ["RFP_v2.pdf", "ScopingCall_Notes.docx", "MutualNDA_signed.pdf", "TermSheet_2026.pdf"][seed % 4];
  return [
    { fieldKey: "contact",        fieldLabel: "Primary engagement contact", value: contactName,                          sourceDoc, confidence: 0.92 },
    { fieldKey: "scope_summary",  fieldLabel: "Scope summary",              value: p.dealTitle,                            sourceDoc: "RFP_v2.pdf", confidence: 0.88 },
    { fieldKey: "start_date",     fieldLabel: "Anticipated start date",     value: start,                                  sourceDoc: "ScopingCall_Notes.docx", confidence: 0.81 },
    { fieldKey: "service_line",   fieldLabel: "Service line",               value: p.serviceLine || p.dealType,            sourceDoc: "RFP_v2.pdf", confidence: 0.95 },
    { fieldKey: "risk_factor",    fieldLabel: "Key risk factor",            value: riskFactor,                              sourceDoc: "MutualNDA_signed.pdf", confidence: 0.78 },
    { fieldKey: "budget_range",   fieldLabel: "Indicative budget band",     value: feeBand,                                sourceDoc: "TermSheet_2026.pdf", confidence: 0.84 },
  ];
}

function buildApprovalMatrix(p: OpenRequestArgs["payload"]) {
  const out: Array<{ reviewerRole: string; reviewerLabel: string; reason: string }> = [];
  // GC always required
  out.push({ reviewerRole: "gc", reviewerLabel: "General Counsel", reason: "Mandatory client-acceptance sign-off." });
  // AML for high-risk industry
  if (HIGH_RISK_INDUSTRIES.includes(p.clientIndustry || "")) {
    out.push({ reviewerRole: "aml", reviewerLabel: "AML / KYC Officer",
      reason: `${p.clientIndustry} sector triggers enhanced AML diligence.` });
  }
  // Independence partner for Audit
  if ((p.serviceLine || "").toLowerCase().includes("audit") || (p.dealType || "").toLowerCase().includes("audit")) {
    out.push({ reviewerRole: "independence_partner", reviewerLabel: "Independence Partner",
      reason: "Audit engagements require independence affirmation." });
  }
  // Pricing committee for large fee
  if (p.totalFee >= 500_000) {
    out.push({ reviewerRole: "pricing_committee", reviewerLabel: "Pricing Committee",
      reason: `Fee $${p.totalFee.toLocaleString()} exceeds $500k policy threshold.` });
  }
  // Jurisdictional counsel for non-US
  if (NON_US_REGIONS.includes((p.clientRegion || "").trim())) {
    out.push({ reviewerRole: "jurisdictional_counsel", reviewerLabel: "Jurisdictional Counsel",
      reason: `Client region ${p.clientRegion} requires local-law review.` });
  }
  // Ethics for long relationship + regulated
  if ((p.relationshipYears ?? 0) >= 7 && REGULATED_INDUSTRIES.includes(p.clientIndustry || "")) {
    out.push({ reviewerRole: "ethics", reviewerLabel: "Ethics Reviewer",
      reason: `${p.relationshipYears}-year relationship with regulated client — independence drift check.` });
  }
  return out;
}

function deriveRiskTier(p: OpenRequestArgs["payload"]): "low" | "medium" | "high" {
  if (HIGH_RISK_INDUSTRIES.includes(p.clientIndustry || "")) return "high";
  if (REGULATED_INDUSTRIES.includes(p.clientIndustry || "") || p.totalFee >= 500_000) return "medium";
  return "low";
}

class SimulatedIntakeProvider implements IntakeProvider {
  readonly mode = "simulated" as const;

  async openRequest(req: OpenRequestArgs): Promise<OpenRequestResponse> {
    const { payload } = req;
    const seed = hashString(`${payload.clientName}|${payload.dealTitle}`);
    const jurisdiction = NON_US_REGIONS.includes((payload.clientRegion || "").trim())
      ? (payload.clientRegion as string)
      : "US";
    return {
      source: "simulated",
      externalRef: `SIM-INTK-${seed % 9_000_000 + 1_000_000}`,
      riskTier: deriveRiskTier(payload),
      jurisdiction,
      serviceLine: payload.serviceLine || payload.dealType || "Advisory",
      extractions: buildExtractions(payload, seed),
      approvalMatrix: buildApprovalMatrix(payload),
    };
  }

  async postPricingPacket(args: PricingPacketArgs): Promise<PricingPacketResponse> {
    const added: PricingPacketResponse["addedReviewers"] = [];
    if (args.totalFee >= 500_000) {
      added.push({
        reviewerRole: "pricing_committee",
        reviewerLabel: "Pricing Committee",
        reason: `Fee $${args.totalFee.toLocaleString()} exceeds $500k threshold (post-pricing recompute).`,
      });
    }
    if (args.margin < 0.20) {
      added.push({
        reviewerRole: "pricing_committee",
        reviewerLabel: "Pricing Committee — margin",
        reason: `Margin ${(args.margin * 100).toFixed(1)}% below 20% policy floor.`,
      });
    }
    return { addedReviewers: added };
  }

  async acceptRequest(args: AcceptArgs): Promise<{ matterId: string }> {
    return { matterId: `M-${args.dealNumber}-${Date.now().toString(36).toUpperCase().slice(-4)}` };
  }
}

class LiveIntakeProvider implements IntakeProvider {
  readonly mode = "live" as const;
  private notReady(): never {
    throw new Error(
      "Live Intake provider not yet activated. Provision INTAPP_API_TOKEN, set Live tenant URL, " +
      "switch Intapp mode to 'live', and confirm outbound allow-list. The simulated payloads match " +
      "Intapp Open / Intake REST contracts — no DealPad code change required, only configuration."
    );
  }
  async openRequest(_: OpenRequestArgs): Promise<OpenRequestResponse> { return this.notReady(); }
  async postPricingPacket(_: PricingPacketArgs): Promise<PricingPacketResponse> { return this.notReady(); }
  async acceptRequest(_: AcceptArgs): Promise<{ matterId: string }> { return this.notReady(); }
}

let cachedProvider: IntakeProvider | null = null;
let cachedMode: string | null = null;

async function getProvider(): Promise<IntakeProvider> {
  const [s] = await db.select().from(intappSettings).limit(1);
  const mode = (s?.mode as string) || "simulated";
  if (cachedProvider && cachedMode === mode) return cachedProvider;
  cachedMode = mode;
  cachedProvider = mode === "live" ? new LiveIntakeProvider() : new SimulatedIntakeProvider();
  return cachedProvider;
}

async function logIntakeEvent(args: {
  requestId?: number | null; dealId?: number | null;
  eventType: string; actorName?: string | null; actorRole?: string | null;
  message: string; metadata?: any; source?: string;
}) {
  await db.insert(intakeEvents).values({
    requestId: args.requestId ?? null,
    dealId: args.dealId ?? null,
    eventType: args.eventType,
    source: args.source || cachedMode || "simulated",
    actorName: args.actorName ?? null,
    actorRole: args.actorRole ?? null,
    message: args.message,
    metadata: args.metadata ?? null,
  });
}

// ====================================================================
// CORE: open or fetch the intake request for a deal
// ====================================================================
export async function ensureIntakeRequest(dealId: number, requestedBy?: string) {
  const [existing] = await db.select().from(intakeRequests).where(eq(intakeRequests.dealId, dealId));
  if (existing) return existing;

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error(`Deal ${dealId} not found`);
  const [client] = await db.select().from(clients).where(eq(clients.id, deal.clientId));
  const [settings] = await db.select().from(intappSettings).limit(1);

  const payload = {
    clientName: client?.name || "Unknown Client",
    clientIndustry: client?.industry || null,
    clientRegion: client?.region || null,
    relationshipYears: client?.relationshipYears ?? null,
    dealTitle: deal.title,
    dealType: deal.dealType,
    serviceLine: deal.serviceLine || null,
    totalFee: parseFloat(deal.totalFee || "0"),
  };

  const provider = await getProvider();
  const resp = await provider.openRequest({
    dealId, payload,
    policyVersion: settings?.policyVersion || "4w-pilot-v1",
  });

  const [req] = await db.insert(intakeRequests).values({
    dealId,
    externalRef: resp.externalRef,
    source: resp.source,
    stage: "screening",
    riskTier: resp.riskTier,
    serviceLine: resp.serviceLine,
    jurisdiction: resp.jurisdiction,
    policyVersion: settings?.policyVersion || "4w-pilot-v1",
  }).returning();

  if (resp.extractions.length) {
    await db.insert(intakeExtractions).values(resp.extractions.map(x => ({
      requestId: req.id,
      fieldKey: x.fieldKey,
      fieldLabel: x.fieldLabel,
      value: x.value,
      sourceDoc: x.sourceDoc,
      confidence: x.confidence.toFixed(3),
    })));
  }
  if (resp.approvalMatrix.length) {
    await db.insert(intakeApprovals).values(resp.approvalMatrix.map(a => ({
      requestId: req.id,
      reviewerRole: a.reviewerRole,
      reviewerLabel: a.reviewerLabel,
      reason: a.reason,
    })));
  }

  await logIntakeEvent({
    requestId: req.id, dealId,
    eventType: "request_opened",
    actorName: requestedBy,
    message: `Intake request ${resp.externalRef} opened for ${payload.clientName} — ${resp.riskTier} risk, ${resp.approvalMatrix.length} required reviewer(s).`,
    metadata: { externalRef: resp.externalRef, riskTier: resp.riskTier, extractions: resp.extractions.length, approvers: resp.approvalMatrix.length },
    source: resp.source,
  });

  // Trigger the existing conflicts screening for this request.
  try {
    await runScreeningForDeal(dealId, requestedBy || "Intake Auto", "intake_open");
  } catch (e: any) {
    await logIntakeEvent({
      requestId: req.id, dealId,
      eventType: "screening_trigger_failed",
      message: `Auto-screening on intake open failed: ${e?.message || e}`,
    });
  }

  // Advance stage from screening → policy once a screening has been logged.
  await db.update(intakeRequests).set({ stage: "policy", updatedAt: new Date() })
    .where(eq(intakeRequests.id, req.id));

  return req;
}

// ====================================================================
// Recompute stage based on screening + approvals (called after every change)
// ====================================================================
async function recomputeStage(requestId: number) {
  const [req] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, requestId));
  if (!req || req.stage === "accepted" || req.stage === "rejected") return req;
  const screening = await getLatestScreening(req.dealId);
  const approvals = await db.select().from(intakeApprovals).where(eq(intakeApprovals.requestId, requestId));
  const screeningCleared = !screening
    ? false
    : ["clear", "mitigated", "override_approved"].includes((screening as any).result);
  const allApproversDecided = approvals.length > 0
    && approvals.every(a => a.status === "approved" || a.status === "waived");
  const anyRejected = approvals.some(a => a.status === "rejected");
  let nextStage = req.stage;
  if (anyRejected) nextStage = "on_hold";
  else if (allApproversDecided && screeningCleared) nextStage = "approval"; // ready for accept
  else if (approvals.some(a => a.status === "approved" || a.status === "rejected")) nextStage = "approval";
  else nextStage = "policy";

  if (nextStage !== req.stage) {
    await db.update(intakeRequests).set({ stage: nextStage, updatedAt: new Date() })
      .where(eq(intakeRequests.id, requestId));
  }
  return { ...req, stage: nextStage };
}

// ====================================================================
// FULL detail (request + extractions + approvals + screening + events)
// ====================================================================
async function getRequestDetail(requestId: number) {
  const [req] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, requestId));
  if (!req) return null;
  const [deal] = await db.select().from(deals).where(eq(deals.id, req.dealId));
  const [client] = deal ? await db.select().from(clients).where(eq(clients.id, deal.clientId)) : [null];
  const extractions = await db.select().from(intakeExtractions)
    .where(eq(intakeExtractions.requestId, requestId)).orderBy(intakeExtractions.id);
  const approvals = await db.select().from(intakeApprovals)
    .where(eq(intakeApprovals.requestId, requestId)).orderBy(intakeApprovals.id);
  const screening = await getLatestScreening(req.dealId);
  const events = await db.select().from(intakeEvents)
    .where(eq(intakeEvents.requestId, requestId))
    .orderBy(desc(intakeEvents.createdAt)).limit(50);
  return { ...req, deal, client, extractions, approvals, screening, events };
}

// ====================================================================
// SEED — backfill an intake request for every existing deal
// ====================================================================
export async function seedIntake() {
  const allDeals = await db.select().from(deals).limit(20);
  for (const d of allDeals) {
    const [exists] = await db.select().from(intakeRequests).where(eq(intakeRequests.dealId, d.id));
    if (exists) continue;
    try { await ensureIntakeRequest(d.id, "Demo Seeder"); }
    catch (e) { console.error(`[seed:intake] deal ${d.id} failed:`, e); }
  }
}

// ====================================================================
// REST ROUTES
// ====================================================================
export function registerIntakeRoutes(app: Express) {
  // List all intake requests with deal/client join
  app.get("/api/intake/requests", requirePerm("viewRiskSummary"), async (_req, res) => {
    const rows = await db.select({
      id: intakeRequests.id, dealId: intakeRequests.dealId, externalRef: intakeRequests.externalRef,
      source: intakeRequests.source, stage: intakeRequests.stage, riskTier: intakeRequests.riskTier,
      serviceLine: intakeRequests.serviceLine, jurisdiction: intakeRequests.jurisdiction,
      matterId: intakeRequests.matterId, createdAt: intakeRequests.createdAt, updatedAt: intakeRequests.updatedAt,
      acceptedAt: intakeRequests.acceptedAt,
      dealTitle: deals.title, dealNumber: deals.dealNumber, totalFee: deals.totalFee,
      clientName: clients.name, clientIndustry: clients.industry,
    })
      .from(intakeRequests)
      .leftJoin(deals, eq(intakeRequests.dealId, deals.id))
      .leftJoin(clients, eq(deals.clientId, clients.id))
      .orderBy(desc(intakeRequests.updatedAt));
    res.json(rows);
  });

  // Detail
  app.get("/api/intake/requests/:id", requirePerm("viewRiskSummary"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const detail = await getRequestDetail(id);
    if (!detail) return res.status(404).json({ error: "Intake request not found" });
    res.json(detail);
  });

  // Lookup-by-deal (used from deal detail)
  app.get("/api/intake/deals/:dealId/request", requirePerm("viewDeals"), async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid dealId" });
    const [r] = await db.select().from(intakeRequests).where(eq(intakeRequests.dealId, dealId));
    if (!r) return res.json(null);
    res.json(await getRequestDetail(r.id));
  });

  // Open (idempotent — returns existing if already open)
  app.post("/api/intake/deals/:dealId/open", requirePerm("editDeals"), async (req, res) => {
    const id = requireRoles(req, res, ["pdl", "sll", "qrm", "it"]);
    if (!id) return;
    const dealId = parseInt(req.params.dealId);
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid dealId" });
    try {
      const reqRow = await ensureIntakeRequest(dealId, id.name);
      const detail = await getRequestDetail(reqRow.id);
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to open intake request" });
    }
  });

  // Apply / dismiss extraction
  app.post("/api/intake/extractions/:id/:action", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["pdl", "sll", "qrm"]);
    if (!id) return;
    const action = req.params.action;
    if (action !== "apply" && action !== "dismiss") return res.status(400).json({ error: "action must be apply|dismiss" });
    const extId = parseInt(req.params.id);
    const [ext] = await db.select().from(intakeExtractions).where(eq(intakeExtractions.id, extId));
    if (!ext) return res.status(404).json({ error: "Extraction not found" });
    const status = action === "apply" ? "applied" : "dismissed";
    const [updated] = await db.update(intakeExtractions).set({
      status, actedBy: id.name, actedAt: new Date(),
    }).where(eq(intakeExtractions.id, extId)).returning();
    const [reqRow] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, ext.requestId));
    await logIntakeEvent({
      requestId: ext.requestId, dealId: reqRow?.dealId,
      eventType: `extraction_${status}`,
      actorName: id.name, actorRole: id.role,
      message: `${id.name} ${status} extraction "${ext.fieldLabel}" → ${ext.value}`,
      metadata: { fieldKey: ext.fieldKey, value: ext.value },
    });
    res.json(updated);
  });

  // Decide an approval (federated)
  app.post("/api/intake/approvals/:id/decide", requirePerm("approveDeals"), async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "sll", "pdl", "fin"]);
    if (!id) return;
    const apprId = parseInt(req.params.id);
    const decision = String(req.body?.decision || "").toLowerCase();
    const notes = (req.body?.notes || "").toString().trim();
    if (!["approved", "rejected", "waived"].includes(decision)) {
      return res.status(400).json({ error: "decision must be approved|rejected|waived" });
    }
    const [appr] = await db.select().from(intakeApprovals).where(eq(intakeApprovals.id, apprId));
    if (!appr) return res.status(404).json({ error: "Approval not found" });
    const [updated] = await db.update(intakeApprovals).set({
      status: decision, decidedBy: id.name, decidedAt: new Date(),
      notes: notes || null,
    }).where(eq(intakeApprovals.id, apprId)).returning();
    const [reqRow] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, appr.requestId));
    await logIntakeEvent({
      requestId: appr.requestId, dealId: reqRow?.dealId,
      eventType: `approval_${decision}`,
      actorName: id.name, actorRole: id.role,
      message: `${appr.reviewerLabel} → ${decision.toUpperCase()} by ${id.name}${notes ? ` — ${notes}` : ""}`,
      metadata: { reviewerRole: appr.reviewerRole, decision },
    });
    await recomputeStage(appr.requestId);
    res.json(updated);
  });

  // Post pricing packet — recomputes the federated approver list
  app.post("/api/intake/requests/:id/pricing-packet", requirePerm("editDeals"), async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["pdl", "sll", "fin", "qrm"]);
    if (!id) return;
    const reqId = parseInt(req.params.id);
    const [reqRow] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, reqId));
    if (!reqRow) return res.status(404).json({ error: "Intake request not found" });
    const totalFee = Number(req.body?.totalFee || 0);
    const margin = Number(req.body?.margin || 0);
    const scopeSummary = String(req.body?.scopeSummary || "");
    const provider = await getProvider();
    const resp = await provider.postPricingPacket({ requestId: reqId, totalFee, margin, scopeSummary });
    // Insert any added reviewers that aren't already present.
    const existing = await db.select().from(intakeApprovals).where(eq(intakeApprovals.requestId, reqId));
    const existingRoles = new Set(existing.map(e => e.reviewerRole));
    const inserts = resp.addedReviewers.filter(r => !existingRoles.has(r.reviewerRole));
    if (inserts.length) {
      await db.insert(intakeApprovals).values(inserts.map(r => ({
        requestId: reqId, reviewerRole: r.reviewerRole, reviewerLabel: r.reviewerLabel, reason: r.reason,
      })));
    }
    await logIntakeEvent({
      requestId: reqId, dealId: reqRow.dealId,
      eventType: "pricing_packet_posted",
      actorName: id.name, actorRole: id.role,
      message: `Pricing packet posted: $${totalFee.toLocaleString()}, margin ${(margin*100).toFixed(1)}%. ${inserts.length} new reviewer(s) added.`,
      metadata: { totalFee, margin, addedReviewers: inserts.map(r => r.reviewerRole) },
    });
    await recomputeStage(reqId);
    res.json({ added: inserts });
  });

  // Accept — assigns matter ID, gates on screening clear + approvers green
  app.post("/api/intake/requests/:id/accept", requirePerm("approveDeals"), async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl"]);
    if (!id) return;
    const reqId = parseInt(req.params.id);
    const [reqRow] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, reqId));
    if (!reqRow) return res.status(404).json({ error: "Intake request not found" });
    if (reqRow.stage === "accepted") return res.status(409).json({ error: "Already accepted" });
    const [deal] = await db.select().from(deals).where(eq(deals.id, reqRow.dealId));
    const screening = await getLatestScreening(reqRow.dealId);
    const screeningCleared = !!screening && ["clear", "mitigated", "override_approved"].includes((screening as any).result);
    const approvals = await db.select().from(intakeApprovals).where(eq(intakeApprovals.requestId, reqId));
    const approversGreen = approvals.length > 0 && approvals.every(a => a.status === "approved" || a.status === "waived");
    if (!screeningCleared) return res.status(409).json({ error: "Cannot accept: conflicts screening is not clear/mitigated.", code: "screening_not_clear" });
    if (!approversGreen) return res.status(409).json({ error: "Cannot accept: not all federated approvers have signed off.", code: "approvers_pending" });

    const provider = await getProvider();
    const { matterId } = await provider.acceptRequest({ requestId: reqId, dealNumber: deal!.dealNumber });
    const [updated] = await db.update(intakeRequests).set({
      stage: "accepted", matterId, acceptedAt: new Date(), acceptedBy: id.name, updatedAt: new Date(),
    }).where(eq(intakeRequests.id, reqId)).returning();
    await logIntakeEvent({
      requestId: reqId, dealId: reqRow.dealId,
      eventType: "request_accepted",
      actorName: id.name, actorRole: id.role,
      message: `Engagement accepted. Matter ID ${matterId} assigned. Engagement letter generation unblocked.`,
      metadata: { matterId, screeningResult: (screening as any)?.result },
    });
    res.json(updated);
  });

  // Reject
  app.post("/api/intake/requests/:id/reject", requirePerm("approveDeals"), async (req: Request, res: Response) => {
    const id = requireRoles(req, res, ["qrm", "pdl"]);
    if (!id) return;
    const reqId = parseInt(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10) return res.status(400).json({ error: "Rejection reason (min 10 chars) required." });
    const [reqRow] = await db.select().from(intakeRequests).where(eq(intakeRequests.id, reqId));
    if (!reqRow) return res.status(404).json({ error: "Intake request not found" });
    const [updated] = await db.update(intakeRequests).set({
      stage: "rejected", rejectionReason: reason, updatedAt: new Date(),
    }).where(eq(intakeRequests.id, reqId)).returning();
    await logIntakeEvent({
      requestId: reqId, dealId: reqRow.dealId,
      eventType: "request_rejected",
      actorName: id.name, actorRole: id.role,
      message: `Intake request rejected: ${reason}`,
      metadata: { reason },
    });
    res.json(updated);
  });

  // Events
  app.get("/api/intake/events", requirePerm("viewRiskSummary"), async (req, res) => {
    const requestId = req.query.requestId ? parseInt(String(req.query.requestId)) : null;
    const dealId = req.query.dealId ? parseInt(String(req.query.dealId)) : null;
    const conds: any[] = [];
    if (requestId) conds.push(eq(intakeEvents.requestId, requestId));
    if (dealId) conds.push(eq(intakeEvents.dealId, dealId));
    const where = conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined;
    const q = db.select().from(intakeEvents).orderBy(desc(intakeEvents.createdAt)).limit(150);
    const rows = where ? await (q as any).where(where) : await q;
    res.json(rows);
  });

  // Dashboard
  app.get("/api/intake/dashboard", requirePerm("viewRiskSummary"), async (_req, res) => {
    const all = await db.select().from(intakeRequests);
    const byStage = {
      draft:     all.filter(r => r.stage === "draft").length,
      screening: all.filter(r => r.stage === "screening").length,
      policy:    all.filter(r => r.stage === "policy").length,
      approval:  all.filter(r => r.stage === "approval").length,
      accepted:  all.filter(r => r.stage === "accepted").length,
      rejected:  all.filter(r => r.stage === "rejected").length,
      on_hold:   all.filter(r => r.stage === "on_hold").length,
    };
    const byTier = {
      low: all.filter(r => r.riskTier === "low").length,
      medium: all.filter(r => r.riskTier === "medium").length,
      high: all.filter(r => r.riskTier === "high").length,
    };
    const recentEvents = await db.select().from(intakeEvents)
      .orderBy(desc(intakeEvents.createdAt)).limit(15);
    res.json({ total: all.length, byStage, byTier, recentEvents });
  });
}
