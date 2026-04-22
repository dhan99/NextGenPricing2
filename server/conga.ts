import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { requirePerm, requireAnyPerm } from "./rbac";
import {
  congaSettings, congaTemplates, engagementLetters,
  deals, clients, pricingLines, roles as rolesTable,
} from "../shared/schema";

// ====================================================================
// PROVIDER INTERFACE — mirrors the Intapp simulated→live pattern.
// Switching from simulated → live is a configuration change only.
// ====================================================================
export interface CongaTemplateMeta {
  id: number;
  key: string;
  name: string;
  practice: string | null;
  serviceLine: string | null;
  description: string | null;
  fieldMap: any;
  clauses: any;
}

export interface CongaGenerateRequest {
  dealId: number;
  templateId: number;
  generatedBy?: string | null;
}

export interface CongaGenerateResponse {
  source: "simulated" | "live";
  externalRef: string;
  storedDocumentRef: string;
  documentBase64: string;   // base64-encoded application/pdf bytes
  parameters: Record<string, any>;
}

export interface CongaProvider {
  readonly mode: "simulated" | "live";
  listTemplates(): Promise<CongaTemplateMeta[]>;
  generateLetter(req: CongaGenerateRequest): Promise<CongaGenerateResponse>;
  getDocument(externalRef: string): Promise<string | null>;
  /** Bi-directional: push generated letter into Conga document storage / e-sign pipeline. */
  pushDelivery(req: CongaDeliverRequest): Promise<CongaDeliverResponse>;
}

export interface CongaDeliverRequest {
  letterId: number;
  externalRef: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  channel?: "email" | "esign" | "portal";
  triggeredBy?: string | null;
}
export interface CongaDeliverResponse {
  ok: boolean;
  source: "simulated" | "live";
  deliveryRef?: string;
  message: string;
}


async function loadTemplates(): Promise<CongaTemplateMeta[]> {
  const rows = await db.select().from(congaTemplates)
    .where(eq(congaTemplates.isActive, true))
    .orderBy(congaTemplates.sortOrder);
  return rows as any;
}

async function loadDealBundle(dealId: number) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { client: true },
  });
  if (!deal) throw new Error(`Deal ${dealId} not found`);
  const lines = await db.select().from(pricingLines).where(eq(pricingLines.dealId, dealId));
  const allRoles = await db.select().from(rolesTable);
  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const team = lines
    .filter((l) => !l.scenarioId)
    .map((l) => ({
      role: roleById.get(l.roleId!)?.name || "Role",
      hours: parseFloat(l.hours || "0"),
      rate: parseFloat(l.rate || "0"),
      fee: parseFloat(l.fee || "0"),
    }));
  return { deal, team };
}

// ----------------------------------------------------------------
// PDF rendering — pdfkit-based formal engagement letter, served as
// application/pdf. The simulated provider produces the binary so the
// download is a real PDF (not HTML print preview).
// ----------------------------------------------------------------
async function renderLetterPdf(args: {
  template: CongaTemplateMeta;
  deal: any;
  team: { role: string; hours: number; rate: number; fee: number }[];
  externalRef: string;
  generatedAt: Date;
  generatedBy?: string | null;
}): Promise<Buffer> {
  const { template, deal, team, externalRef, generatedAt, generatedBy } = args;
  const client = deal.client || {};
  const period = `${deal.startDate || "TBD"} – ${deal.endDate || "TBD"}`;
  // Collapse repeated "(Renewal)"/"(Copy)" suffixes that may have accreted
  // from multiple renewal cycles, so every place we render the title (PDF
  // metadata, salutation, summary card) shows a clean engagement name.
  const cleanTitle = (deal.title || "—")
    .replace(/(\s*\(Renewal\))+/gi, " (Renewal)")
    .replace(/(\s*\(Copy\))+/gi, " (Copy)")
    .replace(/\s+/g, " ")
    .trim();

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    info: {
      Title: `Engagement Letter — ${deal.title}`,
      Author: "Armanino LLP",
      Subject: template.name,
      Keywords: `engagement-letter,${template.key},${externalRef}`,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ORANGE = "#DA720F";
  const STONE_900 = "#1c1917";
  const STONE_600 = "#57534e";
  const STONE_500 = "#78716c";
  const STONE_200 = "#e7e5e4";
  const STONE_50 = "#fafaf9";

  // ---- Header bar
  doc.rect(0, 0, doc.page.width, 6).fill(ORANGE);
  doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(8)
     .text("ARMANINO LLP", 64, 36, { characterSpacing: 2 });
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(22)
     .text("Engagement Letter", 64, 50);
  doc.fillColor(STONE_600).font("Helvetica").fontSize(11)
     .text(`${template.name}${template.practice ? " · " + template.practice : ""}`, 64, 80);

  // Right-aligned doc ref block
  const rightX = 360;
  doc.fillColor(STONE_500).font("Helvetica").fontSize(8).text("DOC REF", rightX, 38, { width: 188, align: "right" });
  doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(12).text(externalRef, rightX, 50, { width: 188, align: "right" });
  doc.fillColor(STONE_500).font("Helvetica").fontSize(8).text("GENERATED", rightX, 70, { width: 188, align: "right" });
  doc.fillColor(STONE_900).font("Helvetica").fontSize(10).text(
    generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    rightX, 82, { width: 188, align: "right" }
  );

  doc.moveTo(64, 110).lineTo(548, 110).lineWidth(2).strokeColor(ORANGE).stroke();

  // ---- Salutation block
  doc.y = 124;
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(11).text(client.name || "Client");
  doc.font("Helvetica").fontSize(10).fillColor(STONE_600);
  if (client.contactName || client.contactEmail) {
    doc.text(`${client.contactName || ""}${client.contactName && client.contactEmail ? ", " : ""}${client.contactEmail || ""}`);
  }
  if (client.region) doc.text(client.region);
  doc.moveDown(0.8);

  doc.fillColor(STONE_900).font("Helvetica").fontSize(10)
     .text(`Dear ${client.contactName || "Client"},`);
  doc.moveDown(0.4);
  doc.text(
    `Armanino LLP ("Armanino", "we") is pleased to confirm the terms of our engagement to perform `,
    { continued: true }
  );
  doc.font("Helvetica-Bold").text(cleanTitle, { continued: true });
  doc.font("Helvetica").text(
    ` for ${client.name || "your organization"}. This letter outlines the scope of services, fees, ` +
    `assumptions, and other terms governing this engagement.`
  );
  doc.moveDown(0.8);

  // ---- Engagement Summary card
  const cardY = doc.y;
  const cardH = 110;
  doc.roundedRect(64, cardY, 484, cardH, 8).fillAndStroke(STONE_50, STONE_200);
  doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(8)
     .text("ENGAGEMENT SUMMARY", 80, cardY + 12, { characterSpacing: 1 });

  const fmtMoneyLocal = (n: any) => `$${(parseFloat(String(n ?? "0")) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const summary: [string, string][] = [
    ["Engagement", cleanTitle],
    ["Deal #", deal.dealNumber || "—"],
    ["Service Line", deal.serviceLine || "—"],
    ["Period", period],
    ["Total Fee", fmtMoneyLocal(deal.totalFee)],
    ["Total Hours", `${(parseFloat(deal.totalHours || "0") || 0).toFixed(0)}`],
    ["Engagement Lead", deal.pdlName || "—"],
    ["Generated By", generatedBy || "DealPad"],
  ];
  summary.forEach((row, i) => {
    const col = i % 2;
    const rIdx = Math.floor(i / 2);
    const x = 80 + col * 234;
    const y = cardY + 30 + rIdx * 18;
    doc.fillColor(STONE_500).font("Helvetica").fontSize(8)
       .text(row[0].toUpperCase(), x, y, { width: 100, lineBreak: false });
    // lineBreak:false + height keeps each value on a single line so the next
    // row never overlaps when a value (e.g. a long engagement title) is wide.
    doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(10)
       .text(row[1], x + 100, y - 1, { width: 130, height: 14, lineBreak: false, ellipsis: true });
  });
  doc.y = cardY + cardH + 18;

  // ---- Standard clauses
  const clauses = Array.isArray(template.clauses) ? template.clauses : [];
  for (const c of clauses) {
    if (doc.y > 680) doc.addPage();
    doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(10).text((c.heading || "").toUpperCase(), { characterSpacing: 1 });
    doc.moveDown(0.2);
    doc.fillColor(STONE_900).font("Helvetica").fontSize(10).text(c.body || "", { lineGap: 2, align: "justify" });
    doc.moveDown(0.8);
  }

  // ---- Engagement Team table
  if (doc.y > 600) doc.addPage();
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(10).text("ENGAGEMENT TEAM & ESTIMATED HOURS", { characterSpacing: 1 });
  doc.moveDown(0.4);
  const tx = 64;
  const colWidths = [240, 80, 80, 84];
  const headerY = doc.y;
  doc.rect(tx, headerY, 484, 22).fill("#f5f5f4");
  doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(8);
  ["ROLE", "HOURS", "RATE", "FEE"].forEach((h, i) => {
    const x = tx + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x + 8, headerY + 7, { width: colWidths[i] - 16, align: i === 0 ? "left" : "right" });
  });
  let rowY = headerY + 22;
  if (team.length === 0) {
    doc.fillColor(STONE_500).font("Helvetica-Oblique").fontSize(9)
       .text("No engagement team allocated yet.", tx, rowY + 8, { width: 484, align: "center" });
    rowY += 30;
  } else {
    team.forEach((t) => {
      if (rowY > 720) { doc.addPage(); rowY = 64; }
      doc.fillColor(STONE_900).font("Helvetica").fontSize(9);
      const cells = [t.role, t.hours.toFixed(0), `$${t.rate.toFixed(0)}`, fmtMoneyLocal(t.fee)];
      cells.forEach((v, i) => {
        const x = tx + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        if (i === 3) doc.font("Helvetica-Bold");
        doc.text(v, x + 8, rowY + 6, { width: colWidths[i] - 16, align: i === 0 ? "left" : "right" });
        if (i === 3) doc.font("Helvetica");
      });
      doc.moveTo(tx, rowY + 22).lineTo(tx + 484, rowY + 22).lineWidth(0.5).strokeColor(STONE_200).stroke();
      rowY += 22;
    });
  }
  doc.y = rowY + 12;

  if (deal.notes) {
    if (doc.y > 640) doc.addPage();
    doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(10).text("ENGAGEMENT NOTES", { characterSpacing: 1 });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).text(deal.notes, { lineGap: 2 });
    doc.moveDown(0.8);
  }

  // ---- Signature blocks
  if (doc.y > 600) doc.addPage();
  const sigY = doc.y + 24;
  const sigCols = [
    { x: 64, label: `ACCEPTED BY ${(client.name || "CLIENT").toUpperCase()}`, name: "Name, Title" },
    { x: 320, label: "ARMANINO LLP", name: deal.pdlName || "Engagement Partner" },
  ];
  sigCols.forEach((s) => {
    doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(8).text(s.label, s.x, sigY, { characterSpacing: 1, width: 220 });
    doc.moveTo(s.x, sigY + 50).lineTo(s.x + 220, sigY + 50).lineWidth(1).strokeColor(STONE_900).stroke();
    doc.fillColor(STONE_500).font("Helvetica").fontSize(8).text(s.name, s.x, sigY + 56, { width: 220 });
    doc.moveTo(s.x, sigY + 92).lineTo(s.x + 220, sigY + 92).lineWidth(1).strokeColor(STONE_900).stroke();
    doc.fillColor(STONE_500).font("Helvetica").fontSize(8).text("Date", s.x, sigY + 98, { width: 220 });
  });

  // ---- Footer
  doc.fillColor(STONE_500).font("Helvetica").fontSize(8)
     .text(`Generated via DealPad → Conga Composer (${externalRef})`, 64, 740, { width: 484, align: "center" });
  doc.fillColor("#a8a29e").fontSize(8)
     .text("Armanino LLP · Confidential", 64, 752, { width: 484, align: "center" });

  doc.end();
  return done;
}


// ====================================================================
// SIMULATED PROVIDER — deterministic from inputs
// ====================================================================
class SimulatedCongaProvider implements CongaProvider {
  readonly mode = "simulated" as const;

  async listTemplates() { return loadTemplates(); }

  async getDocument(externalRef: string) {
    const [row] = await db.select().from(engagementLetters)
      .where(eq(engagementLetters.externalRef, externalRef)).limit(1);
    return row?.documentBase64 || null;
  }

  async generateLetter(req: CongaGenerateRequest): Promise<CongaGenerateResponse> {
    const [tmpl] = await db.select().from(congaTemplates).where(eq(congaTemplates.id, req.templateId));
    if (!tmpl) throw new Error(`Conga template ${req.templateId} not found`);
    const { deal, team } = await loadDealBundle(req.dealId);
    const generatedAt = new Date();
    const seedNum = (deal.id * 7919 + req.templateId * 31 + generatedAt.getTime()) >>> 0;
    const externalRef = `SIM-CONGA-${(seedNum % 9000000 + 1000000)}`;
    const pdfBuffer = await renderLetterPdf({
      template: tmpl as any, deal, team, externalRef, generatedAt, generatedBy: req.generatedBy || null,
    });
    const documentBase64 = pdfBuffer.toString("base64");
    const parameters = {
      dealId: deal.id,
      dealNumber: deal.dealNumber,
      title: deal.title,
      clientName: deal.client?.name || null,
      clientContactName: deal.client?.contactName || null,
      clientContactEmail: deal.client?.contactEmail || null,
      serviceLine: deal.serviceLine || null,
      businessUnit: deal.businessUnit || null,
      startDate: deal.startDate || null,
      endDate: deal.endDate || null,
      totalFee: deal.totalFee || "0",
      totalHours: deal.totalHours || "0",
      marginPercent: deal.marginPercent || "0",
      pdlName: deal.pdlName || null,
      teamRoles: team.map((t) => ({ role: t.role, hours: t.hours, rate: t.rate })),
      templateKey: tmpl.key,
    };
    return {
      source: "simulated",
      externalRef,
      storedDocumentRef: `local://engagement-letters/${externalRef}.pdf`,
      documentBase64,
      parameters,
    };
  }

  async pushDelivery(req: CongaDeliverRequest): Promise<CongaDeliverResponse> {
    const channel = req.channel || "email";
    const deliveryRef = `SIM-DELIV-${(req.letterId * 16777619 + Date.now()) >>> 0}`.slice(0, 24);
    return {
      ok: true,
      source: "simulated",
      deliveryRef,
      message: `Letter ${req.externalRef || "#" + req.letterId} queued for ${channel} delivery to ${req.recipientName || req.recipientEmail || "client"} (${deliveryRef}).`,
    };
  }
}

// ====================================================================
// LIVE PROVIDER STUB — placeholder for real Conga Composer REST integration.
// Mapping: POST /api/composer/v1/templates/:key/generate (multipart binary
// PDF response). Re-download via GET /documents/:id. Activation is a config
// switch — no code changes once credentials exist.
// ====================================================================
class LiveCongaProvider implements CongaProvider {
  readonly mode = "live" as const;
  constructor(
    private baseUrl: string,
    private tenantId: string | null,
    private apiKey: string,
  ) {}
  private notReady(): never {
    throw new Error(
      "Live Conga Composer provider is not yet activated. Set CONGA_API_KEY, " +
      "configure live tenant URL + tenant ID in Conga Settings, switch mode to 'live', " +
      "and confirm outbound allow-list. The simulated request/response contract matches " +
      "Conga Composer REST API v1 — no DealPad code change required, only configuration."
    );
  }
  async listTemplates(): Promise<CongaTemplateMeta[]> { return this.notReady(); }
  async generateLetter(_req: CongaGenerateRequest): Promise<CongaGenerateResponse> { return this.notReady(); }
  async getDocument(_externalRef: string): Promise<string | null> { return this.notReady(); }
  async pushDelivery(_req: CongaDeliverRequest): Promise<CongaDeliverResponse> {
    return {
      ok: false,
      source: "live",
      message: "Live Conga delivery not configured. POST /api/composer/v1/documents/{ref}/deliver activates with CONGA_API_KEY.",
    };
  }
}

// ====================================================================
// PROVIDER FACTORY (cached)
// ====================================================================
let cachedProvider: CongaProvider | null = null;
let cachedMode: string | null = null;

async function getSettings() {
  let [s] = await db.select().from(congaSettings).limit(1);
  if (!s) {
    [s] = await db.insert(congaSettings).values({ mode: "simulated" }).returning();
  }
  return s;
}

async function getProvider(): Promise<CongaProvider> {
  const s = await getSettings();
  if (cachedProvider && cachedMode === s.mode) return cachedProvider;
  cachedMode = s.mode;
  cachedProvider = s.mode === "live"
    ? new LiveCongaProvider(
        s.liveBaseUrl || "",
        s.liveTenantId || null,
        process.env.CONGA_API_KEY || s.liveApiKeySecret || "",
      )
    : new SimulatedCongaProvider();
  return cachedProvider;
}

// ====================================================================
// SEED — registers a few realistic templates per practice line.
// Idempotent: only inserts when the table is empty.
// ====================================================================
const STANDARD_FIELD_MAP = [
  { field: "{{Client.Name}}", source: "clients.name", description: "Legal client name on the letter header" },
  { field: "{{Client.PrimaryContact}}", source: "clients.contact_name", description: "Primary contact addressed in the salutation" },
  { field: "{{Engagement.Title}}", source: "deals.title", description: "Engagement title printed in summary block" },
  { field: "{{Engagement.DealNumber}}", source: "deals.deal_number", description: "Internal Armanino deal reference" },
  { field: "{{Engagement.ServiceLine}}", source: "deals.service_line", description: "Service line driving template selection" },
  { field: "{{Engagement.Period}}", source: "deals.start_date + deals.end_date", description: "Engagement period rendered as a single range" },
  { field: "{{Engagement.TotalFee}}", source: "deals.total_fee", description: "Top-line fee shown in summary and signature blocks" },
  { field: "{{Engagement.TotalHours}}", source: "deals.total_hours", description: "Estimated effort rolled up from pricing lines" },
  { field: "{{Engagement.PDL}}", source: "deals.pdl_name", description: "Engagement Partner / PDL name on signature line" },
  { field: "{{Team[]}}", source: "pricing_lines join roles", description: "Engagement team grid (role, hours, rate, fee)" },
];

const SEED_TEMPLATES = [
  {
    key: "audit-fy26",
    name: "Annual Audit Engagement Letter",
    practice: "Audit & Assurance",
    serviceLine: "Financial Audit",
    description: "Standard audit engagement letter for a single fiscal year, AICPA-aligned scope and independence language.",
    sortOrder: 1,
    clauses: [
      { heading: "Scope of Services", body: "We will audit the financial statements of the Company, comprising the balance sheet and the related statements of operations, changes in equity, and cash flows for the year then ended, and the related notes." },
      { heading: "Auditor Responsibilities", body: "Our audit will be conducted in accordance with auditing standards generally accepted in the United States of America (GAAS) and will include tests of the accounting records and other procedures we consider necessary." },
      { heading: "Management Responsibilities", body: "Management is responsible for the preparation and fair presentation of the financial statements, for designing and maintaining internal control, and for providing us with all information relevant to the audit." },
      { heading: "Independence", body: "We confirm that, in accordance with the AICPA Code of Professional Conduct, we are independent of the Company and have no relationships that would impair our objectivity." },
      { heading: "Fees & Timing", body: "Our fees for these services are detailed in the Engagement Summary above and are based on the hours and rates listed below. Out-of-pocket expenses will be billed separately at cost." },
    ],
  },
  {
    key: "tax-provision",
    name: "Tax Provision & Compliance Engagement Letter",
    practice: "Tax Services",
    serviceLine: "Tax Planning",
    description: "Quarterly tax provision support plus year-end true-up across multi-state jurisdictions.",
    sortOrder: 2,
    clauses: [
      { heading: "Scope of Services", body: "We will assist the Company with quarterly income tax provision computations, year-end true-up, and preparation of supporting workpapers consistent with ASC 740 requirements." },
      { heading: "Compliance Filings", body: "We will prepare federal and state income tax returns for the periods identified in the Engagement Summary. Returns will be e-filed upon receipt of signed authorization." },
      { heading: "Reliance on Information", body: "Our work will be based on information provided by the Company. We will not audit or independently verify such information, and our deliverables are subject to that limitation." },
      { heading: "Fees & Timing", body: "Fees are based on the Engagement Summary above. Material changes in scope (additional jurisdictions, late-arriving information, or tax authority inquiries) will be billed separately under a change order." },
    ],
  },
  {
    key: "consulting-implementation",
    name: "Consulting Implementation Engagement Letter",
    practice: "Technology Consulting",
    serviceLine: "ERP Implementation",
    description: "Phase-gated implementation engagement letter for ERP, cloud, or analytics platform builds.",
    sortOrder: 3,
    clauses: [
      { heading: "Scope of Services", body: "We will perform the implementation services described in the Engagement Summary, consisting of architecture design, configuration, integration, testing, and training." },
      { heading: "Deliverables", body: "Deliverables will be reviewed and accepted by the Company in accordance with a phase-gate sign-off process. Acceptance will not be unreasonably withheld and will occur within ten (10) business days of delivery." },
      { heading: "Change Management", body: "Any change in scope, schedule, or fee will be documented through a Change Order signed by both parties. DealPad's Change Order workflow will be used to track and approve modifications." },
      { heading: "Fees & Timing", body: "Fees for this fixed-scope engagement are listed in the Engagement Summary. Time-and-materials work, if any, will be billed against the rate card below." },
    ],
  },
  {
    key: "advisory-strategy",
    name: "Advisory & Strategy Engagement Letter",
    practice: "Advisory Services",
    serviceLine: "Strategic Advisory",
    description: "Time-and-materials advisory engagement covering CFO advisory, transaction support, and strategic projects.",
    sortOrder: 4,
    clauses: [
      { heading: "Scope of Services", body: "We will provide strategic advisory services as directed by the Company. Specific workstreams, deliverables, and milestones will be agreed in writing prior to commencement." },
      { heading: "Time & Materials", body: "Services will be performed on a time-and-materials basis at the rates set out in the Engagement Summary. Estimates are not caps; any approaching overage will be communicated promptly." },
      { heading: "Confidentiality", body: "All non-public information shared by the Company will be treated as confidential and used solely for the purposes of this engagement." },
      { heading: "Fees & Timing", body: "Invoices will be issued monthly for services performed and expenses incurred in the prior period. Payment terms are net thirty (30) days." },
    ],
  },
];

export async function seedConga() {
  await getSettings();
  const [{ count: tmplCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(congaTemplates);
  if (tmplCount > 0) return;
  for (const t of SEED_TEMPLATES) {
    await db.insert(congaTemplates).values({
      key: t.key, name: t.name, practice: t.practice, serviceLine: t.serviceLine,
      description: t.description, sortOrder: t.sortOrder,
      fieldMap: STANDARD_FIELD_MAP as any,
      clauses: t.clauses as any,
      isActive: true,
    });
  }
}

// ====================================================================
// ROUTES
// ====================================================================
export function registerCongaRoutes(app: Express) {
  seedConga().catch((e) => console.error("Conga seed error:", e));

  // Settings (read + patch). Lets admins flip simulated↔live and configure URLs.
  app.get("/api/conga/settings", requirePerm("viewDeals"), async (_req, res) => {
    res.json(await getSettings());
  });

  app.patch("/api/conga/settings", requirePerm("manageScopeCatalog"), async (req, res) => {
    const { mode, liveBaseUrl, liveTenantId, defaultTemplateKey } = req.body || {};
    const current = await getSettings();
    const patch: any = { updatedAt: new Date() };
    if (mode === "simulated" || mode === "live") patch.mode = mode;
    if (typeof liveBaseUrl === "string") patch.liveBaseUrl = liveBaseUrl;
    if (typeof liveTenantId === "string") patch.liveTenantId = liveTenantId;
    if (typeof defaultTemplateKey === "string") patch.defaultTemplateKey = defaultTemplateKey;
    await db.update(congaSettings).set(patch).where(eq(congaSettings.id, current.id));
    cachedProvider = null; // force re-resolve
    const [updated] = await db.select().from(congaSettings).where(eq(congaSettings.id, current.id));
    res.json(updated);
  });

  // Templates list (used by both the deal modal and the admin view).
  app.get("/api/conga/templates", requireAnyPerm("viewDeals", "manageScopeCatalog"), async (_req, res) => {
    const provider = await getProvider();
    try {
      const templates = await provider.listTemplates();
      res.json({ source: provider.mode, templates });
    } catch (e: any) {
      // Fall back to DB read if live provider isn't ready, so the admin UI
      // can still inspect registered templates.
      const templates = await loadTemplates();
      res.json({ source: "simulated", templates, providerError: e?.message });
    }
  });

  // Per-deal letter history.
  app.get("/api/conga/deals/:dealId/letters", requirePerm("viewDeals"), async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    if (Number.isNaN(dealId)) return res.status(400).json({ error: "Invalid deal id" });
    const rows = await db.select().from(engagementLetters)
      .where(eq(engagementLetters.dealId, dealId))
      .orderBy(desc(engagementLetters.generatedAt));
    res.json(rows.map((r) => ({
      id: r.id, dealId: r.dealId, templateId: r.templateId,
      templateKey: r.templateKey, templateName: r.templateName,
      source: r.source, status: r.status, externalRef: r.externalRef,
      storedDocumentRef: r.storedDocumentRef, generatedBy: r.generatedBy,
      generatedAt: r.generatedAt,
    })));
  });

  // Generate a new engagement letter for a deal. Returns the row metadata —
  // the client opens /api/conga/letters/:id/download in a new tab to view it.
  app.post("/api/conga/deals/:dealId/letters", requirePerm("editDeals"), async (req, res) => {
    const dealId = parseInt(req.params.dealId);
    if (Number.isNaN(dealId)) return res.status(400).json({ error: "Invalid deal id" });
    const { templateId, generatedBy } = req.body || {};
    const tid = parseInt(templateId);
    if (Number.isNaN(tid)) return res.status(400).json({ error: "templateId is required" });

    const [dealRow] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    if (!dealRow) return res.status(404).json({ error: "Deal not found" });

    const [tmpl] = await db.select().from(congaTemplates).where(eq(congaTemplates.id, tid));
    if (!tmpl) return res.status(404).json({ error: "Template not found" });

    const provider = await getProvider();
    try {
      const result = await provider.generateLetter({
        dealId, templateId: tid,
        generatedBy: generatedBy || (req.headers["x-user-name"] as string | undefined) || null,
      });
      const [row] = await db.insert(engagementLetters).values({
        dealId, templateId: tid,
        templateKey: tmpl.key, templateName: tmpl.name,
        source: result.source, status: "generated",
        externalRef: result.externalRef,
        storedDocumentRef: result.storedDocumentRef,
        documentBase64: result.documentBase64,
        parameters: result.parameters,
        generatedBy: generatedBy || (req.headers["x-user-name"] as string | undefined) || null,
      }).returning();
      res.status(201).json({
        id: row.id, dealId: row.dealId, templateId: row.templateId,
        templateKey: row.templateKey, templateName: row.templateName,
        source: row.source, status: row.status, externalRef: row.externalRef,
        storedDocumentRef: row.storedDocumentRef, generatedBy: row.generatedBy,
        generatedAt: row.generatedAt,
        downloadUrl: `/api/conga/letters/${row.id}/download`,
      });
    } catch (e: any) {
      const [row] = await db.insert(engagementLetters).values({
        dealId, templateId: tid,
        templateKey: tmpl.key, templateName: tmpl.name,
        source: provider.mode, status: "failed",
        parameters: { error: e?.message || String(e) },
        generatedBy: generatedBy || (req.headers["x-user-name"] as string | undefined) || null,
      }).returning();
      res.status(502).json({ error: e?.message || "Letter generation failed", letterId: row.id });
    }
  });

  // Bi-directional: push (deliver) a generated letter back to Conga's
  // delivery / e-sign pipeline. Updates engagement_letters.status to "delivered".
  app.post("/api/conga/letters/:id/deliver", requirePerm("editDeals"), async (req, res) => {
    // Identity from trusted headers, NEVER request body. Only roles that own the
    // engagement-letter delivery flow may trigger an external send.
    const actorName = ((req.headers["x-user-name"] as string) || "").trim();
    const role = ((req.headers["x-user-role"] as string) || "").trim().toLowerCase();
    if (!actorName || !role) {
      return res.status(401).json({ error: "x-user-name and x-user-role headers are required." });
    }
    if (!["pdl", "sll", "po", "qrm", "it"].includes(role)) {
      return res.status(403).json({ error: "Insufficient role to deliver engagement letters." });
    }
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
    if (!letter) return res.status(404).json({ error: "Letter not found" });
    if (letter.status === "failed") return res.status(409).json({ error: "Cannot deliver a failed letter." });

    const provider = await getProvider();
    let result: CongaDeliverResponse;
    try {
      result = await provider.pushDelivery({
        letterId: id,
        externalRef: letter.externalRef,
        recipientEmail: req.body?.recipientEmail || null,
        recipientName: req.body?.recipientName || null,
        channel: req.body?.channel || "email",
        triggeredBy: actorName,
      });
    } catch (e: any) {
      result = { ok: false, source: provider.mode, message: e?.message || "delivery failed" };
    }
    if (result.ok) {
      await db.update(engagementLetters).set({ status: "delivered" }).where(eq(engagementLetters.id, id));
    }
    res.status(result.ok ? 200 : 502).json(result);
  });

  // Download a previously-generated letter as application/pdf. The stored
  // base64 PDF is decoded and streamed back so re-downloads return the exact
  // same document that was generated originally.
  app.get("/api/conga/letters/:id/download", requirePerm("viewDeals"), async (req, res) => {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [row] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
    if (!row) return res.status(404).json({ error: "Letter not found" });
    if (!row.documentBase64) {
      return res.status(410).json({ error: "Stored document is no longer available." });
    }
    const buf = Buffer.from(row.documentBase64, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="EngagementLetter-${row.externalRef || row.id}.pdf"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  });
}
