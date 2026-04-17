import type { Request, Response, Express } from "express";
import { db } from "./db";
import { clients, deals } from "../shared/schema";
import { eq } from "drizzle-orm";

type SyncStatus = "synced" | "pending" | "conflict" | "queued";
type SyncDirection = "inbound" | "outbound" | "bidirectional";

interface DynamicsAccount {
  dynamicsId: string;
  accountNumber: string;
  dealpadClientId: number | null;
  name: string;
  industry: string;
  industryCode: string;
  segment: string;
  annualRevenue: number;
  numberOfEmployees: number;
  ownerName: string;
  ownerEmail: string;
  parentAccount: string | null;
  primaryContact: { name: string; title: string; email: string; phone: string };
  billingAddress: { street: string; city: string; state: string; zip: string; country: string };
  relationshipType: "Customer" | "Prospect" | "Partner";
  customerSince: string;
  syncStatus: SyncStatus;
  lastSyncedAt: string;
  source: "Dynamics 365";
}

interface DynamicsOpportunity {
  dynamicsId: string;
  opportunityNumber: string;
  dealpadDealId: number | null;
  name: string;
  accountName: string;
  estimatedValue: number;
  actualValue: number | null;
  stage: "Qualify" | "Develop" | "Propose" | "Close" | "Won" | "Lost";
  probability: number;
  estimatedCloseDate: string;
  ownerName: string;
  salesProcess: string;
  forecastCategory: "Pipeline" | "Best Case" | "Commit" | "Closed";
  rating: "Hot" | "Warm" | "Cold";
  syncStatus: SyncStatus;
  syncDirection: SyncDirection;
  lastPushedAt: string;
  lastPulledAt: string;
}

interface SyncEvent {
  id: number;
  timestamp: string;
  direction: SyncDirection;
  entity: "Account" | "Opportunity" | "Contact";
  entityName: string;
  action: string;
  fields?: string[];
  status: "success" | "failure" | "warning";
  message: string;
}

let nextSyncEventId = 1;
const syncLog: SyncEvent[] = [];

function uuid(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `${hex(h)}-${hex(h ^ 0x1234)}-${hex(h ^ 0xabcd).slice(0, 4)}-${hex(h ^ 0xbeef).slice(0, 4)}-${hex(h ^ 0xcafebabe).slice(0, 12)}`;
}

function recordEvent(e: Omit<SyncEvent, "id" | "timestamp">) {
  syncLog.unshift({ id: nextSyncEventId++, timestamp: new Date().toISOString(), ...e });
  if (syncLog.length > 200) syncLog.length = 200;
}

const INDUSTRY_CODES: Record<string, string> = {
  "Technology": "541512",
  "Manufacturing": "333000",
  "Healthcare": "621000",
  "Financial Services": "522000",
  "Retail": "445000",
  "Real Estate": "531000",
  "Professional Services": "541000",
  "Consumer Goods": "311000",
  "Energy": "211000",
  "Media": "511000",
};

const OWNERS = [
  { name: "Jennifer Walsh", email: "jwalsh@armanino.com" },
  { name: "Marcus Chen", email: "mchen@armanino.com" },
  { name: "Priya Anand", email: "panand@armanino.com" },
  { name: "Tom Becker", email: "tbecker@armanino.com" },
  { name: "Lisa Hartmann", email: "lhartmann@armanino.com" },
];

const STAGES: DynamicsOpportunity["stage"][] = ["Qualify", "Develop", "Propose", "Close"];
const STAGE_PROBABILITY: Record<string, number> = {
  Qualify: 20, Develop: 40, Propose: 65, Close: 85, Won: 100, Lost: 0,
};

function pick<T>(arr: T[], idx: number): T { return arr[idx % arr.length]; }
function rnd(seed: number, lo: number, hi: number): number {
  const x = Math.sin(seed * 99991) * 10000;
  const f = x - Math.floor(x);
  return Math.floor(lo + f * (hi - lo));
}

async function buildAccounts(): Promise<DynamicsAccount[]> {
  const rows = await db.select().from(clients);
  return rows.map((c, i) => {
    const industry = c.industry || pick(Object.keys(INDUSTRY_CODES), i);
    const owner = pick(OWNERS, i);
    const revenueMillions = c.revenueSize?.includes("$") ? parseFloat(c.revenueSize.replace(/[^0-9.]/g, "")) || 50 : 50 + rnd(c.id, 10, 500);
    return {
      dynamicsId: uuid(`acct-${c.id}`),
      accountNumber: `ACC-${String(c.id).padStart(6, "0")}`,
      dealpadClientId: c.id,
      name: c.name,
      industry,
      industryCode: INDUSTRY_CODES[industry] || "541000",
      segment: c.segment || (revenueMillions > 250 ? "Enterprise" : revenueMillions > 50 ? "Mid-Market" : "SMB"),
      annualRevenue: Math.round(revenueMillions * 1_000_000),
      numberOfEmployees: rnd(c.id + 1, 50, 5000),
      ownerName: owner.name,
      ownerEmail: owner.email,
      parentAccount: null,
      primaryContact: {
        name: c.contactName || `Contact ${i + 1}`,
        title: pick(["CFO", "Controller", "VP Finance", "Director of Accounting", "CEO"], i),
        email: c.contactEmail || `contact${i}@example.com`,
        phone: `(415) 555-${String(1000 + rnd(c.id, 100, 9999)).slice(0, 4)}`,
      },
      billingAddress: {
        street: `${rnd(c.id, 100, 999)} Market St`,
        city: c.region?.split(",")[0] || "San Francisco",
        state: c.region?.split(",")[1]?.trim() || "CA",
        zip: String(94000 + rnd(c.id, 0, 999)).padStart(5, "0"),
        country: "USA",
      },
      relationshipType: (c.relationshipYears || 0) > 0 ? "Customer" : "Prospect",
      customerSince: `${2026 - (c.relationshipYears || 1)}-01-15`,
      syncStatus: "synced",
      lastSyncedAt: new Date(Date.now() - rnd(c.id, 60, 86400) * 1000).toISOString(),
      source: "Dynamics 365",
    };
  });
}

async function buildOpportunities(): Promise<DynamicsOpportunity[]> {
  const dealRows = await db.select().from(deals);
  const clientRows = await db.select().from(clients);
  const clientById = new Map(clientRows.map((c) => [c.id, c]));

  const opps: DynamicsOpportunity[] = dealRows.map((d, i) => {
    const client = clientById.get(d.clientId);
    let stage: DynamicsOpportunity["stage"];
    if (d.status === "won") stage = "Won";
    else if (d.status === "lost") stage = "Lost";
    else if (d.status === "approved") stage = "Close";
    else if (d.status === "submitted") stage = "Propose";
    else if (d.status === "in_review") stage = "Propose";
    else if ((d.currentStep || 1) >= 3) stage = "Develop";
    else stage = "Qualify";

    const owner = OWNERS.find((o) => o.name === d.pdlName) || pick(OWNERS, i);
    const fee = parseFloat(d.totalFee || "0");
    const probability = STAGE_PROBABILITY[stage];
    const forecastCat: DynamicsOpportunity["forecastCategory"] =
      stage === "Won" || stage === "Lost" ? "Closed" :
      probability >= 80 ? "Commit" : probability >= 50 ? "Best Case" : "Pipeline";

    return {
      dynamicsId: uuid(`opp-${d.id}`),
      opportunityNumber: `OPP-${String(d.id).padStart(6, "0")}`,
      dealpadDealId: d.id,
      name: d.title,
      accountName: client?.name || "Unknown",
      estimatedValue: fee || rnd(d.id, 50000, 750000),
      actualValue: stage === "Won" ? fee : null,
      stage,
      probability,
      estimatedCloseDate: d.endDate || new Date(Date.now() + rnd(d.id, 30, 180) * 86400 * 1000).toISOString().slice(0, 10),
      ownerName: owner.name,
      salesProcess: "Armanino NextGenApp Sales Process",
      forecastCategory: forecastCat,
      rating: probability >= 70 ? "Hot" : probability >= 40 ? "Warm" : "Cold",
      syncStatus: "synced",
      syncDirection: "bidirectional",
      lastPushedAt: new Date(d.updatedAt || Date.now()).toISOString(),
      lastPulledAt: new Date(Date.now() - rnd(d.id + 7, 60, 7200) * 1000).toISOString(),
    };
  });

  // Add a few "Dynamics-only" opportunities not yet pulled into DealPad
  const extras: DynamicsOpportunity[] = [
    {
      dynamicsId: uuid("opp-x1"), opportunityNumber: "OPP-100201", dealpadDealId: null,
      name: "Pacific Logistics Co - Tax Provision Outsourcing", accountName: "Pacific Logistics Co",
      estimatedValue: 285000, actualValue: null, stage: "Qualify", probability: 20,
      estimatedCloseDate: "2026-09-30", ownerName: "Jennifer Walsh",
      salesProcess: "Armanino NextGenApp Sales Process", forecastCategory: "Pipeline", rating: "Warm",
      syncStatus: "queued", syncDirection: "inbound",
      lastPushedAt: "—", lastPulledAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      dynamicsId: uuid("opp-x2"), opportunityNumber: "OPP-100202", dealpadDealId: null,
      name: "Helios Energy Inc - SOX Readiness", accountName: "Helios Energy Inc",
      estimatedValue: 540000, actualValue: null, stage: "Develop", probability: 40,
      estimatedCloseDate: "2026-08-15", ownerName: "Marcus Chen",
      salesProcess: "Armanino NextGenApp Sales Process", forecastCategory: "Best Case", rating: "Hot",
      syncStatus: "queued", syncDirection: "inbound",
      lastPushedAt: "—", lastPulledAt: new Date(Date.now() - 600000).toISOString(),
    },
  ];

  return [...opps, ...extras];
}

async function buildPipelineSummary() {
  const opps = await buildOpportunities();
  const open = opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost");
  const byStage = STAGES.map((s) => {
    const items = open.filter((o) => o.stage === s);
    return {
      stage: s,
      count: items.length,
      value: items.reduce((sum, o) => sum + o.estimatedValue, 0),
      weighted: items.reduce((sum, o) => sum + o.estimatedValue * (o.probability / 100), 0),
    };
  });
  const byOwner = OWNERS.map((o) => {
    const items = open.filter((opp) => opp.ownerName === o.name);
    return {
      owner: o.name,
      count: items.length,
      value: items.reduce((s, x) => s + x.estimatedValue, 0),
      weighted: items.reduce((s, x) => s + x.estimatedValue * (x.probability / 100), 0),
      quota: 2_500_000,
    };
  });
  const won = opps.filter((o) => o.stage === "Won");
  const lost = opps.filter((o) => o.stage === "Lost");
  const wonValue = won.reduce((s, o) => s + (o.actualValue || 0), 0);
  const lostValue = lost.reduce((s, o) => s + o.estimatedValue, 0);
  const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;

  return {
    totalPipelineValue: open.reduce((s, o) => s + o.estimatedValue, 0),
    weightedPipelineValue: open.reduce((s, o) => s + o.estimatedValue * (o.probability / 100), 0),
    openOpportunities: open.length,
    avgDealSize: open.length > 0 ? open.reduce((s, o) => s + o.estimatedValue, 0) / open.length : 0,
    winRate,
    wonYTD: { count: won.length, value: wonValue },
    lostYTD: { count: lost.length, value: lostValue },
    byStage,
    byOwner,
    forecast: {
      commit: opps.filter((o) => o.forecastCategory === "Commit").reduce((s, o) => s + o.estimatedValue, 0),
      bestCase: opps.filter((o) => o.forecastCategory === "Best Case").reduce((s, o) => s + o.estimatedValue, 0),
      pipeline: opps.filter((o) => o.forecastCategory === "Pipeline").reduce((s, o) => s + o.estimatedValue, 0),
      closed: opps.filter((o) => o.forecastCategory === "Closed").reduce((s, o) => s + o.estimatedValue, 0),
    },
    quotaTotal: 12_500_000,
  };
}

function seedInitialLog() {
  if (syncLog.length > 0) return;
  const samples: Omit<SyncEvent, "id" | "timestamp">[] = [
    { direction: "inbound", entity: "Account", entityName: "Pacific Logistics Co", action: "Created in DealPad from D365 account",
      fields: ["name", "industry", "annualRevenue", "primaryContact"], status: "success",
      message: "Inbound sync: New account record imported from Dynamics 365" },
    { direction: "outbound", entity: "Opportunity", entityName: "Acme Corp - 2026 Audit", action: "Updated estimatedValue from DealPad pricing",
      fields: ["estimatedValue", "stage", "probability"], status: "success",
      message: "Outbound sync: Opportunity stage advanced to Propose, fee updated to $485,000" },
    { direction: "outbound", entity: "Opportunity", entityName: "TechFlow Industries - Q1 Tax", action: "Closed-Won pushed to D365",
      fields: ["stage", "actualValue", "actualCloseDate"], status: "success",
      message: "Outbound sync: Opportunity marked Won, actuals booked to revenue forecast" },
    { direction: "inbound", entity: "Account", entityName: "Helios Energy Inc", action: "Updated annualRevenue field",
      fields: ["annualRevenue", "numberOfEmployees"], status: "success",
      message: "Inbound sync: Account financials refreshed from D365 nightly job" },
    { direction: "inbound", entity: "Opportunity", entityName: "Helios Energy - SOX Readiness", action: "New opportunity queued for DealPad import",
      status: "warning", message: "Inbound sync: New opportunity detected; waiting for Pursuit Lead to scope" },
  ];
  samples.forEach(recordEvent);
}

export function registerDynamicsRoutes(app: Express) {
  seedInitialLog();

  app.get("/api/dynamics/accounts", async (_req: Request, res: Response) => {
    res.json(await buildAccounts());
  });

  app.get("/api/dynamics/accounts/:id", async (req: Request, res: Response) => {
    const accounts = await buildAccounts();
    const acct = accounts.find((a) => a.dynamicsId === req.params.id || a.accountNumber === req.params.id);
    if (!acct) return res.status(404).json({ error: "Account not found" });
    res.json(acct);
  });

  app.get("/api/dynamics/opportunities", async (_req: Request, res: Response) => {
    res.json(await buildOpportunities());
  });

  app.get("/api/dynamics/pipeline", async (_req: Request, res: Response) => {
    res.json(await buildPipelineSummary());
  });

  app.get("/api/dynamics/sync-log", async (_req: Request, res: Response) => {
    res.json(syncLog);
  });

  app.post("/api/dynamics/sync", async (req: Request, res: Response) => {
    const { entity = "All", direction = "bidirectional" } = req.body || {};
    const accounts = await buildAccounts();
    const opps = await buildOpportunities();
    const userName = req.body?.userName || "System";

    const samplesIn = [
      { name: accounts[0]?.name || "Acme Corp", entity: "Account" as const, fields: ["annualRevenue", "primaryContact.email"] },
      { name: "Helios Energy - SOX Readiness", entity: "Opportunity" as const, fields: ["stage", "probability", "estimatedCloseDate"] },
    ];
    const samplesOut = [
      { name: opps[0]?.name || "Acme - 2026 Audit", entity: "Opportunity" as const, fields: ["estimatedValue", "stage", "forecastCategory"] },
      { name: opps[1]?.name || "TechFlow - Q1 Tax", entity: "Opportunity" as const, fields: ["estimatedValue", "probability"] },
    ];

    if (direction !== "outbound") {
      samplesIn.forEach((s) => recordEvent({
        direction: "inbound", entity: s.entity, entityName: s.name,
        action: `Pulled ${s.entity.toLowerCase()} updates from D365`,
        fields: s.fields, status: "success",
        message: `Inbound sync by ${userName}: ${s.fields.length} field(s) refreshed from Dynamics 365`,
      }));
    }
    if (direction !== "inbound") {
      samplesOut.forEach((s) => recordEvent({
        direction: "outbound", entity: s.entity, entityName: s.name,
        action: `Pushed ${s.entity.toLowerCase()} updates to D365`,
        fields: s.fields, status: "success",
        message: `Outbound sync by ${userName}: ${s.fields.length} field(s) written to Dynamics 365 opportunity record`,
      }));
    }

    res.json({
      success: true,
      entity, direction,
      pulled: direction !== "outbound" ? samplesIn.length : 0,
      pushed: direction !== "inbound" ? samplesOut.length : 0,
      durationMs: 1200 + Math.floor(Math.random() * 800),
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/api/dynamics/import-opportunity", async (req: Request, res: Response) => {
    const { dynamicsId } = req.body || {};
    const opps = await buildOpportunities();
    const opp = opps.find((o) => o.dynamicsId === dynamicsId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    recordEvent({
      direction: "inbound", entity: "Opportunity", entityName: opp.name,
      action: "Imported into DealPad as draft deal",
      fields: ["name", "accountName", "estimatedValue", "stage", "estimatedCloseDate"],
      status: "success",
      message: `Inbound sync: Created DealPad draft from D365 opportunity ${opp.opportunityNumber}`,
    });
    res.json({ success: true, opportunityNumber: opp.opportunityNumber });
  });

  app.post("/api/dynamics/push-deal", async (req: Request, res: Response) => {
    const dealId = parseInt(req.body?.dealId);
    if (!dealId) return res.status(400).json({ error: "dealId required" });
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    recordEvent({
      direction: "outbound", entity: "Opportunity", entityName: deal.title,
      action: "Manual push to D365",
      fields: ["estimatedValue", "stage", "probability", "estimatedCloseDate", "forecastCategory"],
      status: "success",
      message: `Outbound sync: ${deal.title} written to D365 opportunity record (${deal.totalFee})`,
    });
    res.json({ success: true });
  });
}
