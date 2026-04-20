// Seeds the Financial Audit scope catalog. Idempotent on the `code` column —
// safe to re-run. Items follow PCAOB/AICPA financial-statement audit phases:
// engagement acceptance → planning & risk → controls → substantive testing
// (by FS area) → specialized procedures → reporting & wrap-up.
//
// Run: npx tsx scripts/seed-audit-scope.ts
import { pool } from "../server/db";

type Item = {
  code: string;
  name: string;
  category: string;
  description: string;
  defaultHours: number;
  isAssembly?: boolean;
  parentCode?: string;
  serviceLines: string[];
};

const ITEMS: Item[] = [
  // Assembly: a typical mid-market annual audit bundle (parent for many items below)
  { code: "AUD-100", name: "Annual Financial Statement Audit", category: "Audit - Engagement",
    description: "Composite assembly representing a full annual financial-statement audit engagement (planning through reporting).",
    defaultHours: 800, isAssembly: true,
    serviceLines: ["Financial Audit", "Audit"] },

  // Engagement acceptance & planning
  { code: "AUD-101", name: "Engagement Acceptance & Independence", category: "Audit - Planning",
    description: "Client acceptance / continuance evaluation, independence confirmation, and engagement letter preparation.",
    defaultHours: 8, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-102", name: "Audit Planning & Strategy Memo", category: "Audit - Planning",
    description: "Overall audit strategy, scoping, team assignment, timing, and planning memo.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-103", name: "Materiality & Performance Materiality", category: "Audit - Planning",
    description: "Calculation of overall materiality, performance materiality, and clearly-trivial threshold; benchmark documentation.",
    defaultHours: 8, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-104", name: "Risk Assessment Procedures", category: "Audit - Risk Assessment",
    description: "Inquiries, analytics, and walkthroughs to identify and assess risks of material misstatement at the FS and assertion level.",
    defaultHours: 40, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-105", name: "Industry & Client Familiarity Update", category: "Audit - Risk Assessment",
    description: "Update of industry, regulatory, and client business knowledge; environmental / external risk scan.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-106", name: "Fraud Risk Assessment & Brainstorming", category: "Audit - Risk Assessment",
    description: "AU-C 240 fraud brainstorming session, identification of fraud risks, and design of responses including journal-entry testing scope.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },

  // Internal controls
  { code: "AUD-110", name: "Process Walkthroughs - Significant Cycles", category: "Audit - Internal Controls",
    description: "Walkthroughs of significant transaction cycles (revenue, purchasing, payroll, FR close) to confirm understanding of controls.",
    defaultHours: 32, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-111", name: "IT General Controls (ITGC) Testing", category: "Audit - Internal Controls",
    description: "Testing of access management, change management, computer operations, and program development controls over financially-relevant systems.",
    defaultHours: 60, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance", "Cybersecurity"] },
  { code: "AUD-112", name: "Application & Automated Controls Testing", category: "Audit - Internal Controls",
    description: "Testing of application-level automated controls and IPE (Information Produced by Entity) reports.",
    defaultHours: 40, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-113", name: "SOC 1 / Service Organization Report Review", category: "Audit - Internal Controls",
    description: "Review of SOC 1 reports for outsourced service organizations; complementary user entity controls evaluation.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-114", name: "Control Deficiency Evaluation", category: "Audit - Internal Controls",
    description: "Evaluation and aggregation of control deficiencies; severity assessment and management/governance communication.",
    defaultHours: 12, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },

  // Substantive procedures by FS area
  { code: "AUD-120", name: "Revenue Recognition Testing (ASC 606)", category: "Audit - Substantive Procedures",
    description: "Testing of revenue streams, contract review, performance obligations, transaction price allocation, and cut-off.",
    defaultHours: 60, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-121", name: "Accounts Receivable Confirmations", category: "Audit - Substantive Procedures",
    description: "Positive/negative confirmations to customers, alternative procedures for non-responses, allowance for doubtful accounts review.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-122", name: "Cash & Cash Equivalents", category: "Audit - Substantive Procedures",
    description: "Bank confirmations, reconciliations, restricted cash review, and outstanding-item testing.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-123", name: "Inventory Observation & Costing", category: "Audit - Substantive Procedures",
    description: "Physical inventory observation, count-sheet testing, costing methodology, lower-of-cost-or-NRV evaluation, and obsolescence reserve review.",
    defaultHours: 40, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-124", name: "Fixed Assets & Capex Testing", category: "Audit - Substantive Procedures",
    description: "Additions, disposals, depreciation expense recalculation, impairment indicators, and capitalization policy review.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-125", name: "A/P Search for Unrecorded Liabilities", category: "Audit - Substantive Procedures",
    description: "Subsequent disbursement testing, vendor confirmations, and search for unrecorded liabilities through the cut-off date.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-126", name: "Accrued Liabilities & Reserves", category: "Audit - Substantive Procedures",
    description: "Testing of accrued payroll, bonus, vacation, warranty, and other estimated liabilities including methodology and assumption review.",
    defaultHours: 20, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-127", name: "Debt & Equity Testing", category: "Audit - Substantive Procedures",
    description: "Loan agreement review, covenant compliance, interest expense recalculation, and equity rollforward and stock-based compensation review.",
    defaultHours: 20, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-128", name: "Income Tax Provision Review (ASC 740)", category: "Audit - Substantive Procedures",
    description: "Review of current/deferred tax provision, uncertain tax positions, valuation allowance, and rate reconciliation - typically with tax specialist support.",
    defaultHours: 32, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Tax-Corporate"] },
  { code: "AUD-129", name: "Journal Entry & Top-side Adjustment Testing", category: "Audit - Substantive Procedures",
    description: "AU-C 240 mandatory JE testing - selection of high-risk journal entries and top-side adjustments for substantive review.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-130", name: "Analytical Procedures (Substantive)", category: "Audit - Substantive Procedures",
    description: "Substantive analytics on income statement and balance sheet accounts; threshold investigation and corroboration.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },

  // Specialized procedures
  { code: "AUD-140", name: "Fair Value & Estimates Audit (ASC 820)", category: "Audit - Specialized",
    description: "Auditing management's estimates - fair value of investments, intangibles, contingent consideration; specialist involvement assessment.",
    defaultHours: 40, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-141", name: "Going Concern Evaluation", category: "Audit - Specialized",
    description: "Substantial-doubt assessment, management's plans evaluation, and disclosure / opinion modification review.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-142", name: "Related Party Transactions Review", category: "Audit - Specialized",
    description: "Identification and evaluation of related-party transactions and required disclosures.",
    defaultHours: 12, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-143", name: "Subsequent Events Procedures", category: "Audit - Specialized",
    description: "Inquiries, document review, and minutes review through the auditor's report date; Type I vs Type II evaluation.",
    defaultHours: 12, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },

  // Reporting & wrap-up
  { code: "AUD-150", name: "Financial Statement Preparation / Review", category: "Audit - Reporting",
    description: "Review (or assistance with) financial statements, footnotes, and required disclosures; tie-out to trial balance.",
    defaultHours: 32, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-151", name: "Auditor's Report / Opinion Drafting", category: "Audit - Reporting",
    description: "Drafting of auditor's report including any modifications, KAMs (where applicable), and emphasis-of-matter paragraphs.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-152", name: "Engagement Quality Review (EQR)", category: "Audit - Reporting",
    description: "Concurring-partner / EQR review of significant judgments, conclusions, and the auditor's report.",
    defaultHours: 24, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-153", name: "Management Representation Letter", category: "Audit - Reporting",
    description: "Drafting and obtaining signed management representation letter as of the report date.",
    defaultHours: 4, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-154", name: "Audit Committee / Governance Communications", category: "Audit - Reporting",
    description: "AU-C 260 communications - audit results, significant findings, internal control matters, and required communications.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },
  { code: "AUD-155", name: "Workpaper Finalization & Archival", category: "Audit - Reporting",
    description: "Workpaper review, sign-off, archival within 60-day window per AU-C 230.",
    defaultHours: 16, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit"] },
  { code: "AUD-156", name: "Management Letter (Internal Control Comments)", category: "Audit - Reporting",
    description: "Drafting of management letter with control observations and operational recommendations.",
    defaultHours: 12, parentCode: "AUD-100",
    serviceLines: ["Financial Audit", "Audit", "Risk Assurance"] },

  // Renewal-specific assembly (consolidated workflow per requirements doc lines 85-89)
  { code: "AUD-200", name: "Audit Renewal Leadsheet", category: "Audit - Engagement",
    description: "Consolidated renewal scoping bundle - leverages prior-year baselines with focused risk re-assessment and rollforward procedures.",
    defaultHours: 480, isAssembly: true,
    serviceLines: ["Financial Audit", "Audit"] },
];

async function main() {
  // Resolve max sort_order to append in order
  const r = await pool.query("SELECT COALESCE(MAX(sort_order), 0) AS m FROM scope_catalog");
  let nextSort = (r.rows[0]?.m ?? 0) + 1;

  // Pass 1: insert all rows without parentId so codes resolve
  const codeToId: Record<string, number> = {};
  for (const it of ITEMS) {
    const result = await pool.query(
      `INSERT INTO scope_catalog
         (code, name, category, description, default_hours, is_assembly, service_lines, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             category = EXCLUDED.category,
             description = EXCLUDED.description,
             default_hours = EXCLUDED.default_hours,
             is_assembly = EXCLUDED.is_assembly,
             service_lines = EXCLUDED.service_lines
       RETURNING id`,
      [
        it.code, it.name, it.category, it.description,
        String(it.defaultHours), !!it.isAssembly,
        it.serviceLines.join(","),
        nextSort++,
      ]
    );
    codeToId[it.code] = result.rows[0].id;
  }

  // Pass 2: wire parent_id for child items now that all parents have ids
  let linked = 0;
  for (const it of ITEMS) {
    if (!it.parentCode) continue;
    const parentId = codeToId[it.parentCode];
    const childId = codeToId[it.code];
    if (!parentId || !childId) continue;
    await pool.query(
      "UPDATE scope_catalog SET parent_id = $1 WHERE id = $2 AND (parent_id IS DISTINCT FROM $1)",
      [parentId, childId]
    );
    linked++;
  }

  console.log(`[seed-audit] upserted ${ITEMS.length} catalog items, linked ${linked} parent/child relationships`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
