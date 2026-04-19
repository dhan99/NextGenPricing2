import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "DealPad_Demo_Driver.pdf");

const AMBER = "#DA720F";
const AMBER_LIGHT = "#FCEBDA";
const INK = "#1C1917";
const MUTE = "#57534E";
const RULE = "#E7E5E4";
const PURPLE = "#7C3AED";
const BLUE = "#2563EB";
const GREEN = "#059669";
const RED = "#DC2626";

const PAGE = { size: "LETTER" as const, margin: 54 };
const W = 612 - 108;

const doc = new PDFDocument({ ...PAGE, bufferPages: true, info: {
  Title: "DealPad Demo Driver",
  Author: "Armanino LLP — NextGenApp Pricing & Scoping 2.0",
  Subject: "Stakeholder demo walkthrough",
}});
doc.pipe(fs.createWriteStream(OUT));

let pageNum = 0;

function newPage() {
  doc.addPage();
  pageNum++;
}

function H1(text: string) {
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(text, { paragraphGap: 4 });
  doc.moveTo(doc.x, doc.y).lineTo(doc.x + 60, doc.y).lineWidth(3).strokeColor(AMBER).stroke();
  doc.moveDown(0.8);
  doc.strokeColor(RULE).lineWidth(1);
}

function H2(text: string) {
  if (doc.y > 680) newPage();
  doc.moveDown(0.4);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(14).text(text);
  doc.moveDown(0.3);
}

function H3(text: string, color: string = INK) {
  if (doc.y > 700) newPage();
  doc.fillColor(color).font("Helvetica-Bold").fontSize(11).text(text);
  doc.moveDown(0.2);
}

function P(text: string, opts: { size?: number; color?: string; bold?: boolean } = {}) {
  if (doc.y > 720) newPage();
  doc.fillColor(opts.color ?? INK).font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 10).text(text, { align: "left", lineGap: 2 });
}

function muted(text: string) {
  P(text, { color: MUTE, size: 9 });
}

function bullet(items: string[], color: string = INK) {
  doc.font("Helvetica").fontSize(10).fillColor(color);
  items.forEach((item) => {
    if (doc.y > 720) newPage();
    doc.text(`•  ${item}`, { indent: 4, lineGap: 2, paragraphGap: 2 });
  });
  doc.moveDown(0.3);
}

function rule() {
  doc.moveDown(0.4);
  doc.moveTo(doc.x, doc.y).lineTo(doc.x + W, doc.y).strokeColor(RULE).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

function callout(label: string, color: string, lines: string[]) {
  if (doc.y > 640) newPage();
  const startY = doc.y;
  const padding = 10;
  const labelHeight = 14;
  const contentHeight = lines.length * 13 + 8;
  const totalHeight = labelHeight + contentHeight + padding * 2;

  doc.save();
  doc.rect(doc.x, startY, W, totalHeight).fillAndStroke(hexFade(color, 0.06), color);
  doc.restore();

  doc.fillColor(color).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), doc.x + padding, startY + padding, { width: W - padding * 2, characterSpacing: 0.6 });
  doc.fillColor(INK).font("Helvetica").fontSize(9.5);
  let y = startY + padding + labelHeight + 2;
  lines.forEach((l) => {
    doc.text(l, doc.x, y, { width: W - padding * 2 - 4 });
    y += 13;
  });
  doc.x -= padding;
  doc.y = startY + totalHeight + 6;
}

function hexFade(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * alpha);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function table(headers: string[], rows: string[][], colWidths?: number[]) {
  const widths = colWidths ?? headers.map(() => W / headers.length);
  const lineH = 14;
  if (doc.y > 660) newPage();

  const startX = doc.x;
  const startY = doc.y;
  doc.rect(startX, startY, W, lineH + 6).fill(AMBER_LIGHT);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9);
  let x = startX + 6;
  headers.forEach((h, i) => {
    doc.text(h, x, startY + 5, { width: widths[i] - 8, ellipsis: true });
    x += widths[i];
  });
  let y = startY + lineH + 6;

  doc.font("Helvetica").fontSize(9);
  rows.forEach((row, rIdx) => {
    const heights = row.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - 8 }));
    const rowH = Math.max(lineH, ...heights) + 6;
    if (y + rowH > 740) {
      newPage();
      y = doc.y;
    }
    if (rIdx % 2 === 1) {
      doc.rect(startX, y, W, rowH).fill("#FAFAF9");
    }
    doc.fillColor(INK);
    let cx = startX + 6;
    row.forEach((cell, i) => {
      doc.text(cell, cx, y + 4, { width: widths[i] - 8 });
      cx += widths[i];
    });
    doc.moveTo(startX, y + rowH).lineTo(startX + W, y + rowH).strokeColor(RULE).lineWidth(0.5).stroke();
    y += rowH;
  });
  doc.x = startX;
  doc.y = y + 6;
}

function stepHeader(num: string, title: string, persona: string) {
  if (doc.y > 660) newPage();
  doc.moveDown(0.3);
  const startY = doc.y;
  doc.rect(doc.x, startY, W, 30).fill(INK);
  doc.fillColor(AMBER).font("Helvetica-Bold").fontSize(11).text(num, doc.x + 12, startY + 9, { continued: true, width: 60 });
  doc.fillColor("white").text("  ·  " + title, { continued: true });
  doc.fillColor(MUTE).font("Helvetica").fontSize(9).text(`   as ${persona}`, { width: W - 24 });
  doc.x = PAGE.margin;
  doc.y = startY + 38;
}

// ============================================================
// COVER
// ============================================================
doc.rect(0, 0, 612, 792).fill("white");
doc.rect(0, 0, 612, 220).fill(AMBER);
doc.fillColor("white").font("Helvetica-Bold").fontSize(44).text("DealPad", 54, 70);
doc.font("Helvetica").fontSize(16).text("Pricing & Scoping 2.0", 54, 124);
doc.font("Helvetica-Bold").fontSize(11).text("ARMANINO LLP   ·   NEXTGENAPP", 54, 158, { characterSpacing: 1.2 });

doc.fillColor(INK).font("Helvetica-Bold").fontSize(32).text("Demo Driver", 54, 280);
doc.font("Helvetica").fontSize(14).fillColor(MUTE).text("End-to-end stakeholder walkthrough", 54, 322);

doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("What this document covers", 54, 400);
doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(
  "A scripted, click-by-click run through every major DealPad surface — with the exact data to enter, the catalog and configuration that gets consulted at each step, the talking points to make, and what the audience should see on screen. Use it as a presenter's notes for live demos, a self-paced trial for new users, or as a reference for the 4-week production pilot.",
  54, 422, { width: 504, lineGap: 3, align: "left" }
);

doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Two flows are demonstrated", 54, 530);
doc.font("Helvetica").fontSize(10.5).fillColor(INK);
doc.text("•  Flow A — Manual wizard: opportunity → 7 wizard steps → submit → approve → analytics", 54, 552, { width: 504 });
doc.text("•  Flow B — Autonomous Agent: opportunity → 1-click → reviewer approves draft", 54, 568, { width: 504 });

doc.rect(54, 620, 504, 1).fill(RULE);
doc.fillColor(MUTE).font("Helvetica").fontSize(9).text("Date", 54, 640);
doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("April 2026", 54, 654);
doc.fillColor(MUTE).font("Helvetica").fontSize(9).text("Audience", 220, 640);
doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Pilot stakeholders", 220, 654);
doc.fillColor(MUTE).font("Helvetica").fontSize(9).text("Duration", 400, 640);
doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("~30 minutes", 400, 654);

doc.fillColor(MUTE).font("Helvetica").fontSize(8).text("CONFIDENTIAL — Armanino LLP internal pilot material", 54, 740);

// ============================================================
// AGENDA
// ============================================================
newPage();
H1("Agenda");
muted("A 30-minute live demo. Flow A and Flow B can run independently — pick one for shorter sessions.");
doc.moveDown(0.5);

table(
  ["#", "Section", "Time", "Persona"],
  [
    ["0", "Pre-demo checklist & login", "2 min", "Presenter"],
    ["1", "Persona switcher · role-based UI", "2 min", "Switch through 6"],
    ["2", "Dashboard · pipeline at a glance", "2 min", "Michael Torres (PDL)"],
    ["3", "Dynamics CRM · opportunities to import", "3 min", "Michael Torres (PDL)"],
    ["A", "Flow A — Manual wizard (7 steps)", "10 min", "Michael Torres (PDL)"],
    ["A.8", "Submit · Intapp + Workday gates · approval", "3 min", "Marcus Chen (QRM) → Jennifer Walsh (FIN)"],
    ["B", "Flow B — Autonomous Agent (1 click)", "5 min", "Michael Torres (PDL)"],
    ["4", "Analytics · margin & cycle KPIs", "2 min", "Jennifer Walsh (FIN)"],
    ["5", "Architecture Hub · DDD · integrations", "3 min", "IT Administrator"],
    ["6", "Q&A", "open", "All"],
  ],
  [30, 240, 60, 174]
);

H2("Pre-demo checklist");
bullet([
  "App is published — open in a fresh browser window (no cached login state).",
  "Database is seeded — verify by hitting /clients showing 3+ clients and /dynamics showing 3+ open opportunities.",
  "Backend Server and DealPad Frontend workflows both green.",
  "If demoing the Autonomous Agent, ensure at least one Dynamics opportunity is in stage Develop or Propose AND not yet linked to a deal.",
  "Have a backup tab open at /architecture for the architecture portion in case CRM data is shared.",
]);

// ============================================================
// SECTION 1 — PERSONAS
// ============================================================
newPage();
H1("1 · Persona switcher");
muted("Demonstrates role-based access. Sets the tone that DealPad is one platform serving six personas, each with their own surface.");

H3("Action");
bullet([
  "On the login screen, click each persona card in turn (do not log in yet).",
  "Point out the role badge color and one-line responsibility under each name.",
  "Log in as Michael Torres (PDL) — this is the primary persona for the demo.",
]);

H3("Personas in the seed");
table(
  ["Persona", "Role", "What they care about"],
  [
    ["Michael Torres", "PDL — Practice Delivery Lead", "End-to-end deal scoping, pricing, delivery hand-off"],
    ["Rachel Kim", "SLL — Service Line Lead", "Service-line quality, staffing model, methodology fit"],
    ["Pricing Operations", "PO — Pricing Ops", "Rate cards, scope catalog, prompt sets, global config"],
    ["Jennifer Walsh", "FIN — Finance / Practice Director", "Margin enforcement, approval thresholds, commercial sign-off"],
    ["Marcus Chen", "QRM — Quality & Risk Management", "Independence checks, conflict screening, mitigations"],
    ["IT Administrator", "IT — System Admin", "Integration health, RBAC, platform observability"],
  ],
  [120, 130, W - 250]
);

callout("Talking point", AMBER, [
  "Today's Excel workbook is a single sheet shared by everyone. DealPad gives each persona a tailored",
  "surface but a single source of truth. The same deal record drives all six views.",
]);

// ============================================================
// SECTION 2 — DASHBOARD
// ============================================================
newPage();
H1("2 · Dashboard");
muted("First screen Michael lands on. Establishes that DealPad already knows the state of his pipeline before he does anything.");

H3("Action");
bullet([
  "Click the Dashboard tab in the left nav.",
  "Walk the four KPI tiles across the top.",
  "Hover the trend chart to show monthly pipeline value.",
  "Scroll down to 'Deals needing your attention' and point out the badges (At Risk · Blocked · Pending Approval).",
]);

H3("KPIs displayed");
table(
  ["KPI", "Source", "Why it matters"],
  [
    ["Total Pipeline ($)", "Sum of fee on deals not in Won/Lost", "Top-of-funnel health"],
    ["Win Rate (%)", "Won / (Won + Lost) over trailing 90d", "Conversion quality"],
    ["Avg Margin (%)", "Mean of deal margin across active deals", "Commercial discipline"],
    ["Avg Cycle Time (days)", "Days from draft → submitted → approved", "Process efficiency"],
  ],
  [140, 200, W - 340]
);

H3("Charts");
bullet([
  "Monthly Trend (line) — pipeline value rolled by month.",
  "Pipeline by Status (bar) — draft / pending review / submitted / approved counts.",
  "Margin Distribution (horizontal bar) — buckets at <20%, 20–30%, 30–40%, 40%+.",
  "Complexity Mix (pie) — Low / Medium / High / Very High.",
]);

callout("Talking point", AMBER, [
  "Today these numbers exist in three different spreadsheets and a Power BI report no one trusts.",
  "Here it's one number, computed live from the system of record.",
]);

// ============================================================
// SECTION 3 — DYNAMICS CRM
// ============================================================
newPage();
H1("3 · Dynamics CRM — opportunities");
muted("This is where deals start. We surface live opportunities from D365 directly inside DealPad so the PDL never tab-switches.");

H3("Action");
bullet([
  "Click 'Dynamics CRM' in the left nav.",
  "Point out the bidirectional sync banner at the top (last sync timestamp).",
  "Walk the columns: Opportunity · Account · Stage · Est. Value · DealPad Status · Actions.",
  "Pick the Helios Energy opportunity (stage = Develop) for the manual flow.",
]);

H3("Sample opportunities in the seed");
table(
  ["Opportunity", "Account", "Stage", "Est. Value"],
  [
    ["Pacific Logistics Co — Tax Provision Outsourcing", "Pacific Logistics Co", "Qualify", "$285,000"],
    ["Helios Energy Inc — SOX Readiness", "Helios Energy Inc", "Develop", "$540,000"],
    ["Crestwood Holdings — 2026 Annual Audit", "Crestwood Holdings", "Qualify", "$412,000"],
  ],
  [240, 130, 70, W - 440]
);

callout("Config consulted", BLUE, [
  "D365 connection settings · stage mapping (Qualify/Develop/Propose/Close)",
  "Account → Client resolution rules (auto-create stub if no match)",
  "Eligibility for Autonomous Agent: stage in {Develop, Propose} AND no existing dealpadDealId",
]);

callout("Talking point", AMBER, [
  "Every action here writes back to D365 — the salesperson sees the DealPad ID on their opportunity",
  "record within 2 seconds. No more 'who's working on what?' meetings.",
]);

// ============================================================
// FLOW A
// ============================================================
newPage();
doc.rect(0, doc.y - 10, 612, 60).fill(BLUE);
doc.fillColor("white").font("Helvetica-Bold").fontSize(20).text("Flow A · Manual wizard", PAGE.margin, doc.y + 10);
doc.font("Helvetica").fontSize(11).text("PDL walks the deal through 7 wizard steps, then submits for approval", PAGE.margin, doc.y + 4);
doc.x = PAGE.margin;
doc.y += 50;
doc.fillColor(INK);

muted("Use the Helios Energy opportunity from the previous step. From the CRM page, click 'Import to DealPad' on its row. The system creates a draft deal at currentStep=1 and redirects to the wizard.");

stepHeader("A.1", "Setup", "Michael Torres (PDL)");
H3("Data to enter");
table(
  ["Field", "Value to enter", "Notes"],
  [
    ["Deal Title", "Helios Energy — SOX Readiness FY26", "Auto-prefilled from opportunity"],
    ["Type", "New", "Renewal / New / Change Order"],
    ["Business Unit", "Risk Assurance & Advisory", "Drives catalog filtering"],
    ["Service Line", "SOX & Internal Controls", "Drives prompt set selection"],
    ["Complexity", "Medium", "Initial guess — refined in Step 3"],
    ["Start Date", "Today + 14 days", "Defaults to today; editable"],
    ["PDL Owner", "Michael Torres", "Pre-filled from logged-in user"],
  ],
  [120, 200, W - 320]
);
callout("Catalog & config consulted", BLUE, [
  "Business Unit & Service Line taxonomy (loaded from system_config)",
  "AI Deal Similarity (UC-1): suggests comparable past deals and their outcomes in a side panel",
]);
callout("Talking point", AMBER, [
  "This screen replaces the first three tabs of the Excel workbook. Notice we never ask for hours or fees yet —",
  "those are derived later from scope and rate cards, not guessed up front.",
]);

stepHeader("A.2", "Scope", "Michael Torres (PDL)");
H3("Data to enter");
bullet([
  "Click 'Browse Catalog' — filter by BU 'Risk Assurance & Advisory'.",
  "Add: 'SOX Scoping & Risk Assessment' (qty 1)",
  "Add: 'Process Walkthroughs' (qty 8 — one per significant process)",
  "Add: 'Control Testing — Operating Effectiveness' (qty 1)",
  "Add: 'Deficiency Evaluation & Reporting' (qty 1)",
  "Or apply the template 'SOX Readiness — Mid-Market' to insert all 4 at once.",
]);
H3("Catalog rows that show up (filtered for this BU)");
table(
  ["Code", "Name", "Default hours", "Service Line"],
  [
    ["SOX-001", "SOX Scoping & Risk Assessment", "120", "SOX & Internal Controls"],
    ["SOX-002", "Process Walkthroughs (per process)", "24", "SOX & Internal Controls"],
    ["SOX-003", "Control Testing — Operating Effectiveness", "200", "SOX & Internal Controls"],
    ["SOX-004", "Deficiency Evaluation & Reporting", "60", "SOX & Internal Controls"],
  ],
  [60, 230, 80, W - 370]
);
callout("Catalog & config consulted", BLUE, [
  "scope_catalog table (filtered by BU + serviceLine)",
  "scope_templates table (curated bundles — 'SOX Readiness — Mid-Market' template)",
  "AI Effort Estimation (UC-2): adjusts default hours based on complexity drivers (refined in Step 3)",
]);

stepHeader("A.3", "Assumptions / Complexity drivers", "Michael Torres (PDL)");
H3("Data to enter");
table(
  ["Prompt", "Answer", "Multiplier"],
  [
    ["How many geographic regions are involved?", "2 regions", "1.10×"],
    ["Are there regulatory/compliance requirements?", "SOX/HIPAA", "1.20×"],
    ["What is the expected data volume?", "Large", "1.15×"],
    ["How many integrations are required?", "3–4", "1.10×"],
    ["Is this client first-time SOX?", "Yes", "1.25×"],
  ],
  [240, 130, W - 370]
);
callout("Catalog & config consulted", BLUE, [
  "prompt_sets · prompt_set_items (active prompt set for the service line)",
  "AI Complexity Multipliers: each answer carries a multiplier that compounds into the final effort estimate",
  "Per-prompt 'rationale' is captured in prompt_responses for audit",
]);
callout("Talking point", AMBER, [
  "Each answer here directly moves hours and fees in real time. Watch the running total at the top of the page.",
  "Today this lives in a hidden Excel sheet that only Pricing Ops can edit.",
]);

stepHeader("A.4", "Pricing & Team", "Michael Torres (PDL)");
H3("Data to enter");
bullet([
  "Default rate card 'FY2026 Standard' is auto-applied.",
  "Confirm role mix: Partner 5%, Senior Manager 15%, Manager 25%, Senior 30%, Consultant 25%.",
  "Override Senior Manager rate if needed (this is a friendly client — discount $20/hr).",
]);
H3("Rate card — FY2026 Standard");
table(
  ["Role", "Bill rate", "Cost rate", "Default mix"],
  [
    ["Partner", "$550/hr", "$275/hr", "5%"],
    ["Senior Manager", "$395/hr", "$195/hr", "15%"],
    ["Manager", "$310/hr", "$155/hr", "25%"],
    ["Senior", "$245/hr", "$120/hr", "30%"],
    ["Consultant", "$225/hr", "$110/hr", "25%"],
  ],
  [140, 100, 100, W - 340]
);
callout("Catalog & config consulted", BLUE, [
  "rate_cards · rate_card_lines (active card filtered by effective date)",
  "Pricing Engine: recalc(fee, cost, hours, margin) on every edit",
  "AI Margin Advisor (UC-3): warns inline if margin drops below the service-line floor",
]);

stepHeader("A.5", "Review · pre-flight gates", "Michael Torres (PDL) → Marcus Chen (QRM)");
H3("Action");
bullet([
  "Click 'Run Independence Screening' — calls Intapp.",
  "Click 'Validate Cost Center' — calls Workday.",
  "Resolve any warnings (e.g., 'Affiliated party detected — add mitigation').",
]);
H3("What gets checked");
table(
  ["Check", "External system", "Pass criteria"],
  [
    ["Independence screening", "Intapp Risk", "No conflicts · or mitigations attached"],
    ["Cost center & budget headroom", "Workday", "Cost center exists · budget headroom > deal cost"],
    ["Margin floor", "DealPad config", "Margin ≥ service-line floor (default 25%)"],
  ],
  [180, 120, W - 300]
);
callout("Talking point", AMBER, [
  "These two gates are the same ones the manual approval process runs today — just earlier and automated.",
  "We catch issues before the deal is shaped, not after the engagement letter is drafted.",
]);

stepHeader("A.6", "Approval", "Jennifer Walsh (FIN)");
H3("Approval routing rules");
table(
  ["Condition", "Approver"],
  [
    ["Margin ≥ 35% AND Fee ≤ $500K AND scope items < 8", "Auto-approved"],
    ["Margin 25–34% OR Fee $500K–$2M", "Practice Delivery Lead (peer)"],
    ["Margin 20–24% OR Fee $2M–$5M", "Service Line Lead"],
    ["Margin < 20% OR Fee > $5M OR strategic flag", "Practice Director (Finance)"],
  ],
  [W * 0.62, W * 0.38]
);
H3("Action");
bullet([
  "Switch persona to Jennifer Walsh (FIN).",
  "Open Approvals queue from left nav — the Helios deal appears at the top.",
  "Read the AI Risk Summary (UC-5): margin posture, complexity, screening hits, recommendation.",
  "Click 'Approve' (or 'Request Changes' to demo the loop).",
]);
callout("Catalog & config consulted", BLUE, [
  "approval_policies (margin & fee thresholds per BU)",
  "AI Risk Summary (UC-5): synthesizes deal context into a 3-paragraph narrative + risk score 0–100",
]);

stepHeader("A.7", "Summary & engagement letter", "Michael Torres (PDL)");
H3("Action");
bullet([
  "Switch back to Michael Torres.",
  "Open the deal — status is now 'Approved'.",
  "Click 'Generate Engagement Letter' — calls Conga with the deal data.",
  "Show the generated EL preview (catalog scope, fees, team, assumptions all populated).",
]);
callout("Catalog & config consulted", BLUE, [
  "Conga templates (per service line)",
  "Field mapping: deal → EL placeholders (covers 47 fields end-to-end)",
]);
callout("Talking point", AMBER, [
  "From opportunity to ready-to-send engagement letter in under 20 minutes —",
  "today this takes a PDL between 2 and 5 days, with hand-offs to Pricing Ops and a partner review meeting.",
]);

// ============================================================
// FLOW B
// ============================================================
newPage();
doc.rect(0, doc.y - 10, 612, 60).fill(PURPLE);
doc.fillColor("white").font("Helvetica-Bold").fontSize(20).text("Flow B · Autonomous Agent", PAGE.margin, doc.y + 10);
doc.font("Helvetica").fontSize(11).text("Same outcome as Flow A — but in 1 click and ~5 seconds", PAGE.margin, doc.y + 4);
doc.x = PAGE.margin;
doc.y += 50;
doc.fillColor(INK);

muted("Use the Crestwood Holdings opportunity (or any other Develop/Propose-stage opp not yet linked). Setup time required: zero.");

stepHeader("B.1", "Trigger the agent", "Michael Torres (PDL)");
H3("Action");
bullet([
  "Go to Dynamics CRM page.",
  "On the Crestwood row, click the purple 'Autonomous Agent' button.",
  "Watch the progress modal: Setup → Prompts → Scope → Pricing → Scenarios → Risk → Review (~3–8 sec).",
  "Land on the deal Summary page with status 'Pending Reviewer Approval (Agent Draft)'.",
]);
callout("Catalog & config consulted", PURPLE, [
  "All of the same: scope_catalog, prompt_sets, rate_cards, approval_policies",
  "Plus: pickTemplateForName() heuristic that maps opportunity name → BU/serviceLine/complexity",
  "Plus: pickContextualAnswer() per prompt — emits answer + multiplier + confidence + needsReview + rationale",
]);

stepHeader("B.2", "Review the agent's draft", "Michael Torres (PDL)");
H3("What's on the deal page");
bullet([
  "Status banner: 'Agent-Drafted Deal — pending your approval' (purple)",
  "Agent Run Details panel: 7 steps with per-step confidence score, summary, and any 'needs review' flags",
  "Full deal record populated: scope items · prompt responses · pricing lines · scenarios · risk narrative",
  "Three buttons in the banner: Approve & Submit · Open in Wizard · Discard Draft",
]);

stepHeader("B.3", "Three reviewer outcomes", "Michael Torres (PDL)");
H3("Choose one to demo");
table(
  ["Outcome", "What it does", "When to use"],
  [
    ["Approve & Submit", "Runs Intapp + Workday gates · creates approval · sets status=submitted", "Agent draft looks good · trust the run"],
    ["Open in Wizard", "Snapshots draft to audit log · sets currentStep=1 · lets PDL edit any step", "Need to tweak scope or pricing"],
    ["Discard Draft", "Archives deal · unlinks D365 opportunity · frees it for re-scoping", "Agent got it wrong · start over"],
  ],
  [110, W - 280, 170]
);
callout("Talking point", AMBER, [
  "The agent never bypasses approval gates. Same Intapp + Workday checks run at agent-approve as run",
  "at manual submit. The agent compresses the work, not the controls.",
]);

// ============================================================
// SECTION 4 — ANALYTICS
// ============================================================
newPage();
H1("4 · Analytics");
muted("Where Jennifer (Finance) and Service Line Leads spend their time. Live data from the same system of record — no spreadsheet exports.");

H3("Action");
bullet([
  "Switch to Jennifer Walsh (FIN).",
  "Click 'Analytics' in the left nav.",
  "Walk the four KPIs at the top, then the four charts.",
  "Click into the Margin Distribution bar to drill down to the deals in that bucket.",
]);
H3("Charts on the page");
table(
  ["Chart", "Type", "Filterable by"],
  [
    ["Monthly trend", "Line", "BU · service line · date range"],
    ["Pipeline by status", "Bar", "BU · stage"],
    ["Margin distribution", "Horizontal bar", "BU · service line"],
    ["Complexity mix", "Pie", "BU"],
  ],
  [180, 100, W - 280]
);
callout("Talking point", AMBER, [
  "Today this report is a Tuesday-morning ritual: extract from CRM, paste into Excel, run macros, email PDF.",
  "Here it's always live, drill-down is one click, and the underlying deal is one more click away.",
]);

// ============================================================
// SECTION 5 — ARCHITECTURE HUB
// ============================================================
newPage();
H1("5 · Architecture Hub");
muted("Quick technical credibility tour for IT-leaning stakeholders. Skip if audience is purely commercial.");

H3("Action");
bullet([
  "Switch to IT Administrator persona.",
  "Click 'Architecture' in the left nav.",
  "Walk the 6 tabs in order: Overview · Interactive Diagram · DDD Context · Integrations · Chat · Document.",
  "On the DDD Context tab, scroll to the two sequence diagrams (Autonomous Agent + Manual Wizard) and the comparison table.",
  "On the Integrations tab, point out the four bi-directional connections: D365 · Workday · Intapp · Conga.",
  "On the Chat tab, ask 'What approval thresholds apply to Risk Assurance deals?' to demo the architecture-aware Q&A.",
]);
H3("9 bounded contexts");
bullet([
  "Identity & Access · Client & Opportunity · Deal Lifecycle · Scope & Catalog · Pricing & Rate Cards",
  "Approval & Risk · External Integrations · AI Orchestration · Analytics & Reporting",
]);

callout("Talking point", AMBER, [
  "The whole system is built around explicit bounded contexts. That's why the Autonomous Agent could be added in",
  "a sprint — it's a new orchestrator over the same context boundaries, not a parallel rewrite.",
]);

// ============================================================
// APPENDIX
// ============================================================
newPage();
H1("Appendix · Reference data");
muted("Quick lookup tables for anything you get asked during the demo.");

H2("A · Approval policy thresholds (default seed)");
table(
  ["Tier", "Margin", "Fee", "Approver"],
  [
    ["Auto", "≥ 35%", "≤ $500K", "System (no human approval)"],
    ["Tier 1", "25–34%", "≤ $2M", "PDL (peer review)"],
    ["Tier 2", "20–24%", "$2M–$5M", "Service Line Lead"],
    ["Tier 3", "< 20% or strategic", "Any", "Practice Director (Finance)"],
  ],
  [60, 100, 130, W - 290]
);

H2("B · Scenario engine output (Crestwood example)");
table(
  ["Scenario", "Fee", "Hours", "Margin", "Picked"],
  [
    ["Conservative (senior-heavy)", "$495,000", "1,100", "30.0%", "—"],
    ["Standard (balanced)", "$425,000", "1,200", "27.0%", "★ Recommended"],
    ["Aggressive (cost-optimized)", "$365,000", "1,400", "30.0%", "—"],
  ],
  [200, 80, 80, 70, W - 430]
);

H2("C · AI use cases (5 of them)");
table(
  ["Code", "Name", "Where it shows up"],
  [
    ["UC-1", "Deal Similarity", "Step 1 (Setup) — comparable deals panel"],
    ["UC-2", "Effort Estimation", "Step 2 (Scope) — adjusts default hours"],
    ["UC-3", "Margin Advisor", "Step 4 (Pricing) — inline margin warnings"],
    ["UC-4", "Scenario Recommendation", "Step 5 (Review) — three scenarios + recommended"],
    ["UC-5", "Risk Summary", "Step 6 (Approval) — narrative + risk score"],
  ],
  [50, 180, W - 230]
);

H2("D · Demo recovery — what to do if something breaks");
bullet([
  "If a wizard step won't save: refresh the page; the partial state is persisted on every change.",
  "If Dynamics import fails: reseed by hitting POST /api/admin/reseed-dynamics.",
  "If the Autonomous Agent button is greyed out: opportunity is either not in Develop/Propose stage, or already linked. Switch to a different opp.",
  "If approvals queue is empty for FIN: confirm at least one deal has been submitted (status=submitted, not draft).",
  "Last resort: use the second pre-prepared seeded deal (Pacific Logistics) as a fallback walkthrough.",
]);

H2("E · One-line elevator pitch for each stakeholder type");
table(
  ["Audience", "What to lead with"],
  [
    ["CFO / Finance", "Margin discipline enforced at deal entry, not in the rear-view mirror."],
    ["Practice Director", "PDL cycle time drops from days to under an hour. EL ready before the kickoff call."],
    ["Service Line Lead", "Catalog + prompt sets capture your methodology — every deal in your service line is consistent."],
    ["IT / Architecture", "Bounded-context architecture, four bi-directional integrations, full audit trail per action."],
    ["End user (PDL)", "One screen instead of seven tabs. Numbers live as you type."],
  ],
  [160, W - 160]
);

// ============================================================
// PAGE NUMBERS
// ============================================================
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  doc.fillColor(MUTE).font("Helvetica").fontSize(8);
  doc.text(`DealPad Demo Driver  ·  Armanino LLP`, PAGE.margin, 760, { width: W / 2, align: "left", lineBreak: false });
  doc.text(`${i} / ${range.count - 1}`, PAGE.margin + W / 2, 760, { width: W / 2, align: "right", lineBreak: false });
}

doc.end();
console.log(`Wrote ${OUT}`);
