import { db } from "./db";
import { clients, deals, scopeCatalog, roles, rateCards, rateCardEntries, dealScopeItems, pricingLines, scenarios, approvals, promptResponses, activityLog } from "../shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existingClients = await db.select().from(clients).limit(1);
  if (existingClients.length > 0) return;

  const [client1, client2, client3] = await db.insert(clients).values([
    { name: "Acme Corporation", industry: "Technology", segment: "Enterprise", region: "West", contactName: "Sarah Chen", contactEmail: "sarah.chen@acmecorp.com", revenueSize: "$500M-$1B", relationshipYears: 5 },
    { name: "GlobalTech Industries", industry: "Manufacturing", segment: "Mid-Market", region: "Central", contactName: "James Wilson", contactEmail: "jwilson@globaltech.com", revenueSize: "$100M-$500M", relationshipYears: 3 },
    { name: "Meridian Financial", industry: "Financial Services", segment: "Enterprise", region: "East", contactName: "Lisa Park", contactEmail: "lpark@meridianfin.com", revenueSize: "$1B+", relationshipYears: 8 },
  ]).returning();

  const rolesList = await db.insert(roles).values([
    { name: "Partner", level: "Partner", defaultRate: "550", costRate: "275", sortOrder: 1 },
    { name: "Managing Director", level: "Director", defaultRate: "475", costRate: "235", sortOrder: 2 },
    { name: "Senior Manager", level: "Manager", defaultRate: "395", costRate: "195", sortOrder: 3 },
    { name: "Manager", level: "Manager", defaultRate: "345", costRate: "170", sortOrder: 4 },
    { name: "Senior Consultant", level: "Senior", defaultRate: "285", costRate: "140", sortOrder: 5 },
    { name: "Consultant", level: "Staff", defaultRate: "225", costRate: "110", sortOrder: 6 },
    { name: "Analyst", level: "Staff", defaultRate: "175", costRate: "85", sortOrder: 7 },
  ]).returning();

  const [rateCard1] = await db.insert(rateCards).values([
    { name: "FY2026 Standard", effectiveDate: "2025-07-01", expirationDate: "2026-06-30", isActive: true, region: "National" },
  ]).returning();

  await db.insert(rateCardEntries).values(
    rolesList.map(role => ({
      rateCardId: rateCard1.id,
      roleId: role.id,
      rate: role.defaultRate,
      costRate: role.costRate,
    }))
  );

  const scopeItems = await db.insert(scopeCatalog).values([
    { code: "ARCH-001", name: "System Architecture Design", category: "Architecture", description: "End-to-end system architecture design and documentation", defaultHours: "120", isAssembly: true, sortOrder: 1 },
    { code: "ARCH-002", name: "Architecture Assessment", category: "Architecture", description: "Current state architecture assessment", defaultHours: "40", parentId: null, sortOrder: 2 },
    { code: "ARCH-003", name: "Solution Design", category: "Architecture", description: "Target state solution design", defaultHours: "60", parentId: null, sortOrder: 3 },
    { code: "IMPL-001", name: "System Implementation", category: "Implementation", description: "Full system implementation and configuration", defaultHours: "240", isAssembly: true, sortOrder: 4 },
    { code: "IMPL-002", name: "Core Module Setup", category: "Implementation", description: "Core module installation and configuration", defaultHours: "80", sortOrder: 5 },
    { code: "IMPL-003", name: "Integration Development", category: "Implementation", description: "Third-party integration development", defaultHours: "60", sortOrder: 6 },
    { code: "IMPL-004", name: "Data Migration", category: "Implementation", description: "Data migration planning and execution", defaultHours: "100", sortOrder: 7 },
    { code: "TEST-001", name: "Testing & QA", category: "Testing", description: "Comprehensive testing and quality assurance", defaultHours: "80", isAssembly: true, sortOrder: 8 },
    { code: "TEST-002", name: "Unit Testing", category: "Testing", description: "Component-level unit testing", defaultHours: "40", sortOrder: 9 },
    { code: "TEST-003", name: "Integration Testing", category: "Testing", description: "End-to-end integration testing", defaultHours: "40", sortOrder: 10 },
    { code: "PMO-001", name: "Project Management", category: "Project Management", description: "Full project management and governance", defaultHours: "80", sortOrder: 11 },
    { code: "PMO-002", name: "Change Management", category: "Project Management", description: "Organizational change management", defaultHours: "40", sortOrder: 12 },
    { code: "TRN-001", name: "Training & Enablement", category: "Training", description: "End-user training and knowledge transfer", defaultHours: "40", sortOrder: 13 },
    { code: "SEC-001", name: "Security Assessment", category: "Security", description: "Security review and compliance assessment", defaultHours: "60", sortOrder: 14 },
    { code: "CLD-001", name: "Cloud Infrastructure", category: "Cloud", description: "Cloud infrastructure setup and optimization", defaultHours: "80", sortOrder: 15 },
  ]).returning();

  const [deal1] = await db.insert(deals).values([
    {
      dealNumber: "DL-2026-001",
      title: "ERP Modernization - Phase 1",
      clientId: client1.id,
      status: "in_progress",
      dealType: "new",
      businessUnit: "Technology Consulting",
      serviceLine: "Digital Transformation",
      region: "West",
      startDate: "2026-06-01",
      endDate: "2026-12-31",
      complexity: "high",
      totalFee: "425000",
      totalCost: "310250",
      totalHours: "1200",
      marginPercent: "27.0",
      blendedRate: "354.17",
      currentStep: 4,
      pdlName: "Michael Torres",
      pdlEmail: "mtorres@armanino.com",
      notes: "Strategic client. Multi-phase engagement with expansion potential.",
    },
    {
      dealNumber: "DL-2026-002",
      title: "Cloud Migration Assessment",
      clientId: client2.id,
      status: "draft",
      dealType: "new",
      businessUnit: "Technology Consulting",
      serviceLine: "Cloud Services",
      region: "Central",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      complexity: "medium",
      totalFee: "185000",
      totalCost: "138750",
      totalHours: "520",
      marginPercent: "25.0",
      blendedRate: "355.77",
      currentStep: 2,
      pdlName: "Rachel Kim",
      pdlEmail: "rkim@armanino.com",
    },
    {
      dealNumber: "DL-2026-003",
      title: "Annual Audit & Advisory - FY2026",
      clientId: client3.id,
      status: "approved",
      dealType: "renewal",
      businessUnit: "Audit & Assurance",
      serviceLine: "Financial Audit",
      region: "East",
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      complexity: "medium",
      totalFee: "320000",
      totalCost: "224000",
      totalHours: "880",
      marginPercent: "30.0",
      blendedRate: "363.64",
      currentStep: 8,
      pdlName: "David Martinez",
      pdlEmail: "dmartinez@armanino.com",
    },
  ]).returning();

  await db.insert(dealScopeItems).values([
    { dealId: deal1.id, scopeItemId: scopeItems[0].id, quantity: 1, adjustedHours: "140", complexityMultiplier: "1.2" },
    { dealId: deal1.id, scopeItemId: scopeItems[3].id, quantity: 1, adjustedHours: "280", complexityMultiplier: "1.2" },
    { dealId: deal1.id, scopeItemId: scopeItems[7].id, quantity: 1, adjustedHours: "96", complexityMultiplier: "1.2" },
    { dealId: deal1.id, scopeItemId: scopeItems[10].id, quantity: 1, adjustedHours: "96", complexityMultiplier: "1.2" },
  ]);

  await db.insert(pricingLines).values([
    { dealId: deal1.id, roleId: rolesList[0].id, hours: "80", rate: "550", costRate: "275", fee: "44000", cost: "22000", margin: "22000" },
    { dealId: deal1.id, roleId: rolesList[1].id, hours: "120", rate: "475", costRate: "235", fee: "57000", cost: "28200", margin: "28800" },
    { dealId: deal1.id, roleId: rolesList[2].id, hours: "200", rate: "395", costRate: "195", fee: "79000", cost: "39000", margin: "40000" },
    { dealId: deal1.id, roleId: rolesList[3].id, hours: "240", rate: "345", costRate: "170", fee: "82800", cost: "40800", margin: "42000" },
    { dealId: deal1.id, roleId: rolesList[4].id, hours: "320", rate: "285", costRate: "140", fee: "91200", cost: "44800", margin: "46400" },
    { dealId: deal1.id, roleId: rolesList[5].id, hours: "160", rate: "225", costRate: "110", fee: "36000", cost: "17600", margin: "18400" },
    { dealId: deal1.id, roleId: rolesList[6].id, hours: "80", rate: "175", costRate: "85", fee: "14000", cost: "6800", margin: "7200" },
  ]);

  await db.insert(scenarios).values([
    {
      dealId: deal1.id, name: "Standard", description: "Balanced team composition with standard timeline",
      scenarioType: "standard", isRecommended: false,
      totalFee: "425000", totalCost: "310250", totalHours: "1200", marginPercent: "27.0", blendedRate: "354.17",
      aiReasoning: "Standard delivery model with balanced senior-to-junior ratio. Meets minimum margin requirements.",
    },
    {
      dealId: deal1.id, name: "Premium Service", description: "Senior-heavy team with accelerated timeline",
      scenarioType: "premium", isRecommended: true,
      totalFee: "495000", totalCost: "346500", totalHours: "1100", marginPercent: "30.0", blendedRate: "450.00",
      aiReasoning: "Recommended based on client history of selecting senior-heavy teams. Higher margin compensates for reduced hours through experienced delivery.",
    },
    {
      dealId: deal1.id, name: "Value Delivery", description: "Cost-optimized with extended timeline",
      scenarioType: "value", isRecommended: false,
      totalFee: "365000", totalCost: "255500", totalHours: "1400", marginPercent: "30.0", blendedRate: "260.71",
      aiReasoning: "Budget-conscious option leveraging more junior resources with extended timeline. Higher total hours but lower blended rate.",
    },
  ]);

  await db.insert(approvals).values([
    {
      dealId: deal1.id, status: "pending", approverName: "Jennifer Walsh", approverRole: "Practice Director",
      approverEmail: "jwalsh@armanino.com",
      riskSummary: "Medium risk. Margin within acceptable range. Client relationship strong but scope complexity is high.",
      aiNarrative: "This $425K Technology Consulting engagement for Acme Corporation represents a 27% margin with a senior-balanced team. The engagement covers ERP modernization across architecture design, implementation, testing, and project management. Key risk factors include high complexity offset by a strong 5-year client relationship. Similar deals in the Technology Consulting practice have an 89% approval rate at this margin band.",
    },
  ]);

  await db.insert(promptResponses).values([
    { dealId: deal1.id, question: "How many geographic regions are involved?", answer: "2 regions", category: "Complexity", impactMultiplier: "1.1", sortOrder: 1 },
    { dealId: deal1.id, question: "Are there regulatory/compliance requirements?", answer: "Yes - SOX compliance", category: "Compliance", impactMultiplier: "1.15", sortOrder: 2 },
    { dealId: deal1.id, question: "What is the expected data volume?", answer: "Large (10M+ records)", category: "Complexity", impactMultiplier: "1.1", sortOrder: 3 },
    { dealId: deal1.id, question: "How many integrations are required?", answer: "5-8 integrations", category: "Integration", impactMultiplier: "1.2", sortOrder: 4 },
    { dealId: deal1.id, question: "Is there an existing system being replaced?", answer: "Yes - legacy ERP", category: "Migration", impactMultiplier: "1.1", sortOrder: 5 },
  ]);

  await db.insert(activityLog).values([
    { dealId: deal1.id, action: "deal_created", description: "Deal created by Michael Torres", userName: "Michael Torres" },
    { dealId: deal1.id, action: "scope_updated", description: "Added 4 scope items to the deal", userName: "Michael Torres" },
    { dealId: deal1.id, action: "pricing_updated", description: "Pricing grid populated with team composition", userName: "Michael Torres" },
    { dealId: deal1.id, action: "ai_estimation", description: "AI estimated effort based on complexity prompts", userName: "System" },
    { dealId: deal1.id, action: "scenario_generated", description: "3 pricing scenarios generated by AI", userName: "System" },
    { dealId: deal1.id, action: "submitted_for_approval", description: "Deal submitted for approval to Jennifer Walsh", userName: "Michael Torres" },
  ]);

  console.log("Database seeded successfully");
}
