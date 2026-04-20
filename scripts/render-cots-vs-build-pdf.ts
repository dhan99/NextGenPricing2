import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "fs";
import { dirname } from "path";

const OUT = "docs/strategy/cots-vs-build-one-pager.pdf";
mkdirSync(dirname(OUT), { recursive: true });

const ORANGE = "#DA720F";
const STONE_900 = "#1c1917";
const STONE_700 = "#3f3f46";
const STONE_600 = "#57534e";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_100 = "#f5f5f4";
const STONE_50 = "#fafaf9";

const doc = new PDFDocument({
  size: "LETTER",
  layout: "landscape",
  margins: { top: 22, bottom: 4, left: 24, right: 24 },
  bufferPages: true,
  info: {
    Title: "DealPad — COTS vs Build One-Pager (Scoping & Pricing)",
    Author: "Armanino LLP · DealPad",
    Subject: "Why we build DealPad's scoping & pricing engine instead of buying COTS",
    Keywords: "Salesforce CPQ, Conga CPQ, Deltek, Kantata, Certinia, PROS, ISO 42001, DealPad",
  },
});
doc.pipe(createWriteStream(OUT));

const PAGE_W = doc.page.width;
const PAGE_H = doc.page.height; // 612
const M = 24;
const W = PAGE_W - M * 2;       // 744

// Header bar
doc.rect(0, 0, PAGE_W, 3).fill(ORANGE);
doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(6.5)
  .text("ARMANINO LLP · DEALPAD · INTERNAL / CONFIDENTIAL", M, 8, { characterSpacing: 1.4 });
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(14)
  .text("COTS vs Build — Scoping & Pricing Engine", M, 18);
doc.fillColor(STONE_600).font("Helvetica").fontSize(7.5)
  .text("Why we build DealPad instead of buying a CPQ / PSA to do scope-to-fee   ·   April 20, 2026", M, 35);

// Decision strip
let y = 48;
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(7.5)
  .text("Question:", M, y, { continued: true })
  .font("Helvetica").fillColor(STONE_700)
  .text(" Dynamics 365 (CRM), Workday (HCM/Fin), Intapp (Risk), Conga (letters), Power BI (analytics) are already decided as Buy + Integrate. The open question is the scope-to-fee engine: do we buy COTS or build DealPad? Per stakeholder direction, the comparison set below is true replacement alternatives — not the integrated stack.", { width: W });
y = doc.y + 4;

// Pillars
const pillarW = (W - 12) / 3;
const pillars: [string, string][] = [
  ["1 · BUY TO ACCELERATE", "CRM, HCM, contracts, financials, BI are commodity — already integrated (Dynamics, Workday, Intapp, Conga, Power BI)."],
  ["2 · BUILD TO DIFFERENTIATE", "Own the scope-to-fee engine: role hierarchy, complexity multipliers, scenario engine, AI calibrated on Armanino data."],
  ["3 · ISO 42001 AS A MOAT", "An owned AI Management System per tenant is materially harder for any horizontal SaaS vendor to replicate."],
];
const pillarH = 26;
pillars.forEach((p, i) => {
  const x = M + i * (pillarW + 6);
  doc.roundedRect(x, y, pillarW, pillarH, 3).fillAndStroke(STONE_50, STONE_200);
  doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(6.4).text(p[0], x + 6, y + 4, { characterSpacing: 1, width: pillarW - 12 });
  doc.fillColor(STONE_900).font("Helvetica").fontSize(7).text(p[1], x + 6, y + 13, { width: pillarW - 12 });
});
y += pillarH + 6;

// COMPARISON
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(8)
  .text("COTS ALTERNATIVES THAT COULD REPLACE DEALPAD'S SCOPING & PRICING FUNCTION", M, y, { characterSpacing: 1.1 });
y += 10;

const cmpHeaders = ["Product", "What it offers for scope & pricing", "Why it does not replace DealPad for Armanino"];
const cmpWidths = [130, 260, 354];
const cmpRows: string[][] = [
  [
    "Salesforce Revenue Cloud (CPQ + CLM)",
    "CPQ rules engine, approval workflows, quote document generation, contract lifecycle; Einstein for forecasting / next-best-action.",
    "CPQ is built around products and SKUs, not a 7-tier role hierarchy with complexity multipliers; service-hour assemblies and Standard/Premium/Value scenarios must be hand-built in CPQ rules / Apex; Einstein is generic forecasting, not Armanino effort/margin learning; introduces a second CRM stack alongside Dynamics; per-user licensing scales with every contributor.",
  ],
  [
    "Conga CPQ (separate from Composer doc engine)",
    "Standalone CPQ with quote configuration, pricing rules, approval routing; pairs with Conga CLM.",
    "Same product/SKU pricing model bias as Salesforce CPQ; cannot natively express role-loaded service-hour pricing or auto-generated scenarios; vendor AI surface is generic; would still need DealPad-style scoping logic on top.",
  ],
  [
    "Deltek Vantagepoint / Maconomy",
    "ERP + PSA built for project-based professional-services firms: opportunity, project setup, role-based pricing, resourcing, billing, revenue recognition.",
    "Closest single-vendor alternative for accounting-firm scope-to-fee, but the opportunity/scoping module is template-based, not a calibrated AI engine; ERP-class implementation; firm-specific scope catalog and complexity multipliers still require heavy customisation; no ISO 42001-aligned per-tenant AIMS evidence; high lock-in.",
  ],
  [
    "Kantata (formerly Kimble + Mavenlink)",
    "PSA for services firms covering deal/opportunity, resource planning, project margin forecasting, time/expense, billing.",
    "Opportunity & margin module covers part of DealPad's scenario surface but is generic across services verticals; no firm-specific role hierarchy or complexity multiplier IP; AI features are vendor-owned and shared across tenants; overlaps with Workday Financials, creating a second source of truth.",
  ],
  [
    "Certinia PSA (formerly FinancialForce)",
    "Salesforce-native PSA: services CRM, project pricing, resource management, project accounting; tight Salesforce integration.",
    "Inherits Salesforce CPQ's product-centric pricing model; firm-specific role-loaded pricing must be built on top; AI is Einstein/Salesforce-owned; assumes Salesforce as CRM (Armanino's CRM is Dynamics); platform lock-in to Salesforce ecosystem.",
  ],
  [
    "PROS Smart CPQ",
    "AI-driven pricing optimisation, dynamic discounting, win-probability modelling on top of CPQ.",
    "Calibrated for high-volume transactional B2B (manufacturing, distribution, travel), not low-volume professional-services engagements; opaque vendor AI; no native scenario / RBAC / approval workflow for service-hour scoping; would need wrapping in another product to be useful for Armanino.",
  ],
];

function drawCmpRow(yy: number, cells: string[], header = false) {
  const fs = header ? 6.3 : 6.5;
  const lineGap = 0.2;
  doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(fs);
  let maxH = 0;
  cells.forEach((c, i) => {
    const h = doc.heightOfString(c, { width: cmpWidths[i] - 8, lineGap });
    if (h > maxH) maxH = h;
  });
  const rowH = maxH + 4;
  if (header) doc.rect(M, yy, W, rowH).fill(STONE_100);
  let x = M;
  cells.forEach((c, i) => {
    const w = cmpWidths[i];
    if (header) {
      doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(6.3)
        .text(c.toUpperCase(), x + 4, yy + 3, { width: w - 8, characterSpacing: 0.9 });
    } else {
      doc.fillColor(i === 0 ? STONE_900 : STONE_700)
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(fs)
        .text(c, x + 4, yy + 3, { width: w - 8, lineGap });
    }
    x += w;
  });
  doc.moveTo(M, yy + rowH).lineTo(M + W, yy + rowH).lineWidth(0.3).strokeColor(STONE_200).stroke();
  return yy + rowH;
}

y = drawCmpRow(y, cmpHeaders, true);
for (const r of cmpRows) y = drawCmpRow(y, r);

y += 4;

// ---- Dimensions matrix
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(7.5)
  .text("DIMENSIONS — same options scored against a consistent rubric", M, y, { characterSpacing: 1, width: W });
y += 9;

const dimHeaders = ["Option", "Capability fit (scope & pricing)", "Time-to-value", "Customization cost", "Data residency / governance", "AI transparency", "Lock-in risk"];
const dimWidths = [130, 120, 80, 95, 120, 110, 89]; // sum = 744
type Dim = { label: string; vals: string[]; emphasize?: boolean };
const dimRows: Dim[] = [
  { label: "Salesforce Revenue Cloud", vals: ["Medium — product-centric CPQ", "Medium", "High (CPQ rules + Apex)", "Vendor cloud", "Vendor-owned (Einstein)", "High"] },
  { label: "Conga CPQ", vals: ["Medium — product-centric CPQ", "Medium", "High", "Vendor cloud", "Vendor-owned", "Medium"] },
  { label: "Deltek Vantagepoint", vals: ["Medium — PSA + ERP", "Slow (ERP rollout)", "High", "Vendor cloud / on-prem", "Vendor-owned", "High"] },
  { label: "Kantata", vals: ["Medium — generic PSA", "Medium", "Medium", "Vendor cloud", "Vendor-owned", "Medium"] },
  { label: "Certinia PSA", vals: ["Medium — Salesforce-native PSA", "Medium", "High (Salesforce platform)", "Vendor cloud", "Vendor-owned (Einstein)", "High"] },
  { label: "PROS Smart CPQ", vals: ["Low — wrong workload (transactional B2B)", "Slow", "High", "Vendor cloud", "Vendor-owned (opaque)", "High"] },
  { label: "DealPad build", emphasize: true, vals: ["Full — owns scoping & pricing + AI", "Slower (build cycle)", "Owned (low marginal)", "Owned (firm tenant + audit)", "Owned + ISO 42001-auditable", "Low"] },
];

doc.rect(M, y, W, 11).fill(STONE_100);
let dx = M;
dimHeaders.forEach((h, i) => {
  doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(5.6)
    .text(h.toUpperCase(), dx + 3, y + 3, { width: dimWidths[i] - 6, characterSpacing: 0.6 });
  dx += dimWidths[i];
});
y += 11;

for (const r of dimRows) {
  const rowH = 10;
  if (r.emphasize) doc.rect(M, y, W, rowH).fill(STONE_50);
  let x = M;
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(6).text(r.label, x + 3, y + 2.5, { width: dimWidths[0] - 6 });
  x += dimWidths[0];
  r.vals.forEach((v, i) => {
    doc.fillColor(r.emphasize ? STONE_900 : STONE_700)
      .font(r.emphasize ? "Helvetica-Bold" : "Helvetica").fontSize(6)
      .text(v, x + 3, y + 2.5, { width: dimWidths[i + 1] - 6 });
    x += dimWidths[i + 1];
  });
  doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(0.3).strokeColor(STONE_200).stroke();
  y += rowH;
}

y += 4;

// Two columns: Build differentiation + ISO 42001 moat (compact)
const colW = (W - 12) / 2;
const leftX = M, rightX = M + colW + 12;
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(7.2).text("WHY DEALPAD BUILD WINS FOR SCOPING & PRICING", leftX, y, { characterSpacing: 1, width: colW });
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(7.2).text("ISO 42001 AS A GENUINE MOAT", rightX, y, { characterSpacing: 1, width: colW });
const colTop = y + 9;

const buildItems: [string, string][] = [
  ["Scoped pricing assemblies", "7-tier role hierarchy, complexity multipliers (0.8×–1.5×), scope catalog, automatic margin/fee recalc — not modelled by any product/SKU CPQ."],
  ["AI calibrated on Armanino data", "Five use cases (similarity, effort, margin, scenario, risk) grounded in DealPad's own historical data, not a generic vendor model."],
  ["Scenario engine + persona approval", "Std / Prem / Value with AI reasoning; six-persona RBAC, state machine, AI narrative on approvals, full audit trail."],
];
let ly = colTop;
for (const [k, v] of buildItems) {
  const textX = leftX + 7;
  const textW = colW - 7;
  doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(6.4).text("•", leftX, ly, { width: 6 });
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(6.4).text(k + ": ", textX, ly, { width: textW, continued: true });
  doc.fillColor(STONE_700).font("Helvetica").fontSize(6.4).text(v, { width: textW });
  ly = doc.y + 1;
}

const isoBullets = [
  "DealPad's AI sits inside Armanino's tenant, on Armanino's data, with Armanino's controls. COTS vendors' AIMS is the vendor's — scoped to their product and shared across tenants.",
  "42001 needs per-tenant evidence (model purpose, dataset lineage, monitoring, override capture, improvement loops tied to firm risk appetite) — hard for a horizontal SaaS vendor to carry per firm.",
  "DealPad already has the primitives 42001 expects: persona RBAC, override-with-justification, AI narrative on approvals, activity log, source-tagged audit history. Formalising these turns engineering into a governance asset for regulated client work.",
];
let ry = colTop;
for (const b of isoBullets) {
  const textX = rightX + 7;
  const textW = colW - 7;
  doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(6.4).text("•", rightX, ry, { width: 6 });
  doc.fillColor(STONE_700).font("Helvetica").fontSize(6.4).text(b, textX, ry, { width: textW });
  ry = doc.y + 1;
}

y = Math.max(ly, ry) + 3;

// Recommendation table
doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(8).text("RECOMMENDATION — BUY / BUILD / REJECT", M, y, { characterSpacing: 1.1 });
y += 10;

const recHeaders = ["Capability area", "Decision", "Rationale"];
const recWidths = [210, 100, W - 210 - 100];
const recRows: [string, string, "buy" | "build" | "reject", string][] = [
  ["Surrounding stack — CRM, HCM/Fin, Risk, Letters, BI", "BUY + INTEGRATE", "buy", "Dynamics 365, Workday, Intapp, Conga Composer, Power BI — already firm-standard and integrated; DealPad consumes/pushes via provider pattern."],
  ["Scope-to-fee engine, role pricing, complexity multipliers", "BUILD (DealPad)", "build", "Encodes Armanino IP; no COTS in this set models service-hour assemblies this way."],
  ["Scenario generation & comparison (Std / Prem / Value)", "BUILD (DealPad)", "build", "Differentiating UX and reasoning surface; absent from the COTS set."],
  ["AI use cases (similarity, effort, margin, scenario, risk)", "BUILD (DealPad)", "build", "Trained on Armanino's own deal corpus; vendor AI is not effort/margin-tuned."],
  ["Multi-persona RBAC & approval workflow", "BUILD (DealPad)", "build", "Firm-specific governance and audit shape; not a generic CRM workflow."],
  ["AI Management System (ISO/IEC 42001)", "BUILD (DealPad)", "build", "Owned AIMS is the durable moat; tenant-specific evidence not provided by surveyed COTS."],
  ["End-to-end CPQ replacement (Salesforce / Conga CPQ)", "REJECT", "reject", "Product-centric pricing; service-hour assemblies still custom; introduces a second CRM stack alongside Dynamics."],
  ["Single-vendor PSA (Deltek / Kantata / Certinia)", "REJECT", "reject", "Template-based scoping, not a calibrated AI engine; firm catalog & multipliers still custom; no per-tenant ISO 42001 AIMS; high lock-in."],
  ["AI pricing optimisation (PROS Smart CPQ)", "REJECT", "reject", "Calibrated for transactional B2B, not low-volume professional services; no scoping/approval workflow."],
];

doc.rect(M, y, W, 12).fill(STONE_100);
let hx = M;
recHeaders.forEach((h, i) => {
  doc.fillColor(STONE_500).font("Helvetica-Bold").fontSize(6.3)
    .text(h.toUpperCase(), hx + 4, y + 3, { width: recWidths[i] - 8, characterSpacing: 0.9 });
  hx += recWidths[i];
});
y += 12;

for (const r of recRows) {
  doc.font("Helvetica").fontSize(6.4);
  const h0 = doc.heightOfString(r[0], { width: recWidths[0] - 8 });
  const h2 = doc.heightOfString(r[3], { width: recWidths[2] - 8 });
  const rowH = Math.max(h0, h2, 11) + 3;
  const pillColor = r[2] === "build" ? ORANGE : r[2] === "reject" ? "#991b1b" : "#3f6212";
  let x = M;
  doc.fillColor(STONE_900).font("Helvetica-Bold").fontSize(6.5).text(r[0], x + 4, y + 1.5, { width: recWidths[0] - 8 });
  x += recWidths[0];
  const pillW = recWidths[1] - 14;
  const pillH = 11;
  const pillY = y + (rowH - pillH) / 2 - 1;
  doc.roundedRect(x + 4, pillY, pillW, pillH, 2.5).fill(pillColor);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6).text(r[1], x + 4, pillY + 2.9, { width: pillW, align: "center", characterSpacing: 0.5 });
  x += recWidths[1];
  doc.fillColor(STONE_700).font("Helvetica").fontSize(6.4).text(r[3], x + 4, y + 1.5, { width: recWidths[2] - 8 });
  doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(0.3).strokeColor(STONE_200).stroke();
  y += rowH;
}

// Footer
doc.fillColor(STONE_500).font("Helvetica").fontSize(6)
  .text(
    "All claims reference vendor public capability descriptions and DealPad integration docs (docs/integrations/api-overview.md; server/{dynamics,workday,intapp,conga}.ts). No pricing or proprietary statistics included.",
    M, PAGE_H - 12, { width: W, align: "center" },
  );

// Single-page guard: pdfkit cannot delete pages, so this only warns when
// content overflows. The single-page contract is enforced by the layout
// itself (margins, font sizes, row heights). Verify post-render with:
//   pdfinfo docs/strategy/cots-vs-build-one-pager.pdf | grep Pages
const range = doc.bufferedPageRange();
if (range.count > 1) {
  for (let i = range.count - 1; i >= 1; i--) {
    console.warn("WARNING: content overflowed onto page", i + 1, "— tighten layout (renderer cannot trim pages).");
  }
}

doc.end();
console.log("Wrote", OUT, "y-end:", y, "page-h:", PAGE_H);
