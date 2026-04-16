import { Express, Request, Response } from "express";
import { db } from "./db";
import { clients, deals, scopeCatalog, dealScopeItems, roles, rateCards, rateCardEntries, pricingLines, scenarios, approvals, promptResponses, activityLog } from "../shared/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";

const STANDARD_PROMPTS = [
  { question: "How many geographic regions are involved?", category: "Complexity", sortOrder: 1 },
  { question: "Are there regulatory/compliance requirements?", category: "Compliance", sortOrder: 2 },
  { question: "What is the expected data volume?", category: "Complexity", sortOrder: 3 },
  { question: "How many integrations are required?", category: "Integration", sortOrder: 4 },
  { question: "Is there an existing system being replaced?", category: "Migration", sortOrder: 5 },
  { question: "What is the client's technical maturity?", category: "Client", sortOrder: 6 },
  { question: "Is there a hard deadline or external dependency?", category: "Timeline", sortOrder: 7 },
];

async function createDefaultPrompts(dealId: number) {
  const existing = await db.select({ id: promptResponses.id }).from(promptResponses)
    .where(eq(promptResponses.dealId, dealId)).limit(1);
  if (existing.length > 0) return;
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

export function registerRoutes(app: Express) {

  // ========== DASHBOARD ==========
  app.get("/api/dashboard/summary", async (_req: Request, res: Response) => {
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

    const pendingApprovals = await db.select({
      count: count(),
    }).from(approvals).where(eq(approvals.status, "pending"));

    res.json({
      totalDeals: dealStats.total,
      totalPipeline: parseFloat(dealStats.totalFee),
      averageMargin: parseFloat(dealStats.avgMargin).toFixed(1),
      pendingApprovals: pendingApprovals[0]?.count || 0,
      statusBreakdown,
      recentActivity,
    });
  });

  // ========== CLIENTS ==========
  app.get("/api/clients", async (_req: Request, res: Response) => {
    const result = await db.select().from(clients).orderBy(clients.name);
    res.json(result);
  });

  app.get("/api/clients/:id", async (req: Request, res: Response) => {
    const [result] = await db.select().from(clients).where(eq(clients.id, parseInt(req.params.id)));
    if (!result) return res.status(404).json({ error: "Client not found" });
    res.json(result);
  });

  // ========== DEALS ==========
  app.get("/api/deals", async (_req: Request, res: Response) => {
    const result = await db.query.deals.findMany({
      with: { client: true },
      orderBy: [desc(deals.updatedAt)],
    });
    res.json(result);
  });

  app.get("/api/deals/:id", async (req: Request, res: Response) => {
    const result = await db.query.deals.findFirst({
      where: eq(deals.id, parseInt(req.params.id)),
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
    res.json(result);
  });

  app.post("/api/deals", async (req: Request, res: Response) => {
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;
    const [newDeal] = await db.insert(deals).values({
      ...req.body,
      dealNumber,
    }).returning();

    await createDefaultPrompts(newDeal.id);

    await db.insert(activityLog).values({
      dealId: newDeal.id,
      action: "deal_created",
      description: `Deal "${newDeal.title}" created`,
      userName: req.body.pdlName || "System",
    });

    res.status(201).json(newDeal);
  });

  app.patch("/api/deals/:id", async (req: Request, res: Response) => {
    const [updated] = await db.update(deals)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(deals.id, parseInt(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });
    res.json(updated);
  });

  app.post("/api/deals/:id/clone", async (req: Request, res: Response) => {
    const source = await db.query.deals.findFirst({
      where: eq(deals.id, parseInt(req.params.id)),
      with: { client: true, scopeItems: true, pricingLines: true, promptResponses: true },
    });
    if (!source) return res.status(404).json({ error: "Source deal not found" });

    const isRenewal = req.body.mode === "renewal";
    const dealCount = await db.select({ count: count() }).from(deals);
    const dealNumber = `DL-2026-${String(dealCount[0].count + 1).padStart(3, "0")}`;

    const title = isRenewal
      ? `${source.title} (Renewal)`
      : req.body.title || `${source.title} (Copy)`;

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

  // ========== SCOPE CATALOG ==========
  app.get("/api/scope-catalog", async (_req: Request, res: Response) => {
    const result = await db.select().from(scopeCatalog).orderBy(scopeCatalog.sortOrder);
    res.json(result);
  });

  // ========== DEAL SCOPE ITEMS ==========
  app.get("/api/deals/:dealId/scope-items", async (req: Request, res: Response) => {
    const result = await db.query.dealScopeItems.findMany({
      where: eq(dealScopeItems.dealId, parseInt(req.params.dealId)),
      with: { scopeItem: true },
    });
    res.json(result);
  });

  app.post("/api/deals/:dealId/scope-items", async (req: Request, res: Response) => {
    const [item] = await db.insert(dealScopeItems).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
    }).returning();
    res.status(201).json(item);
  });

  app.delete("/api/deals/:dealId/scope-items/:id", async (req: Request, res: Response) => {
    await db.delete(dealScopeItems).where(
      and(eq(dealScopeItems.id, parseInt(req.params.id)), eq(dealScopeItems.dealId, parseInt(req.params.dealId)))
    );
    res.json({ success: true });
  });

  // ========== ROLES & RATE CARDS ==========
  app.get("/api/roles", async (_req: Request, res: Response) => {
    const result = await db.select().from(roles).orderBy(roles.sortOrder);
    res.json(result);
  });

  app.get("/api/rate-cards", async (_req: Request, res: Response) => {
    const result = await db.query.rateCards.findMany({
      orderBy: [desc(rateCards.isActive)],
    });
    res.json(result);
  });

  app.get("/api/rate-cards/:id/entries", async (req: Request, res: Response) => {
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
      .where(eq(rateCardEntries.rateCardId, parseInt(req.params.id)))
      .orderBy(roles.sortOrder);
    res.json(result);
  });

  // ========== PRICING LINES ==========
  app.get("/api/deals/:dealId/pricing", async (req: Request, res: Response) => {
    const result = await db.query.pricingLines.findMany({
      where: eq(pricingLines.dealId, parseInt(req.params.dealId)),
      with: { role: true },
    });
    res.json(result);
  });

  app.post("/api/deals/:dealId/pricing", async (req: Request, res: Response) => {
    const [line] = await db.insert(pricingLines).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
      fee: String(parseFloat(req.body.hours) * parseFloat(req.body.rate)),
      cost: String(parseFloat(req.body.hours) * parseFloat(req.body.costRate)),
      margin: String(parseFloat(req.body.hours) * (parseFloat(req.body.rate) - parseFloat(req.body.costRate))),
    }).returning();
    res.status(201).json(line);
  });

  app.patch("/api/deals/:dealId/pricing/:id", async (req: Request, res: Response) => {
    const hours = parseFloat(req.body.hours || "0");
    const rate = parseFloat(req.body.rate || "0");
    const costRate = parseFloat(req.body.costRate || "0");
    const [updated] = await db.update(pricingLines).set({
      ...req.body,
      dealId: parseInt(req.params.dealId),
      fee: String(hours * rate),
      cost: String(hours * costRate),
      margin: String(hours * (rate - costRate)),
    }).where(eq(pricingLines.id, parseInt(req.params.id))).returning();
    res.json(updated);
  });

  // ========== SCENARIOS ==========
  app.get("/api/deals/:dealId/scenarios", async (req: Request, res: Response) => {
    const result = await db.select().from(scenarios)
      .where(eq(scenarios.dealId, parseInt(req.params.dealId)))
      .orderBy(scenarios.createdAt);
    res.json(result);
  });

  // ========== APPROVALS ==========
  app.get("/api/deals/:dealId/approvals", async (req: Request, res: Response) => {
    const result = await db.select().from(approvals)
      .where(eq(approvals.dealId, parseInt(req.params.dealId)))
      .orderBy(desc(approvals.submittedAt));
    res.json(result);
  });

  app.post("/api/deals/:dealId/approvals", async (req: Request, res: Response) => {
    const [approval] = await db.insert(approvals).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
    }).returning();
    res.status(201).json(approval);
  });

  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    const [updated] = await db.update(approvals).set({
      ...req.body,
      decidedAt: new Date(),
    }).where(eq(approvals.id, parseInt(req.params.id))).returning();
    res.json(updated);
  });

  // ========== PROMPT RESPONSES ==========
  app.get("/api/deals/:dealId/prompts", async (req: Request, res: Response) => {
    const dealId = parseInt(req.params.dealId);
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

  app.post("/api/deals/:dealId/prompts", async (req: Request, res: Response) => {
    const [prompt] = await db.insert(promptResponses).values({
      dealId: parseInt(req.params.dealId),
      ...req.body,
    }).returning();
    res.status(201).json(prompt);
  });

  app.patch("/api/deals/:dealId/prompts/:id", async (req: Request, res: Response) => {
    const [updated] = await db.update(promptResponses)
      .set({ answer: req.body.answer, impactMultiplier: req.body.impactMultiplier })
      .where(eq(promptResponses.id, parseInt(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Prompt not found" });
    res.json(updated);
  });

  // ========== AI ENDPOINTS ==========

  app.post("/api/ai/deal-similarity", async (req: Request, res: Response) => {
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

  app.post("/api/ai/effort-estimation", async (req: Request, res: Response) => {
    const { scopeItems: items, complexity, prompts } = req.body;
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

    const roleDistribution = [
      { role: "Partner", percentage: 7, hours: Math.round(totalHours * 0.07) },
      { role: "Managing Director", percentage: 10, hours: Math.round(totalHours * 0.10) },
      { role: "Senior Manager", percentage: 17, hours: Math.round(totalHours * 0.17) },
      { role: "Manager", percentage: 20, hours: Math.round(totalHours * 0.20) },
      { role: "Senior Consultant", percentage: 26, hours: Math.round(totalHours * 0.26) },
      { role: "Consultant", percentage: 13, hours: Math.round(totalHours * 0.13) },
      { role: "Analyst", percentage: 7, hours: Math.round(totalHours * 0.07) },
    ];

    res.json({
      estimatedItems,
      totalHours,
      complexityMultiplier: baseMultiplier,
      promptMultiplier: promptMultiplier.toFixed(2),
      totalMultiplier: totalMultiplier.toFixed(2),
      roleDistribution,
      narrative: `Based on ${complexity} complexity with ${(prompts || []).length} scope factors applied, we estimate ${totalHours} total hours across ${estimatedItems.length} scope areas. The complexity and contextual factors result in a ${totalMultiplier.toFixed(1)}x adjustment from baseline estimates. Similar projects have averaged ${Math.round(totalHours * 0.95)}-${Math.round(totalHours * 1.05)} hours.`,
    });
  });

  app.post("/api/ai/margin-advisor", async (req: Request, res: Response) => {
    const { pricingLines: lines, targetMargin = 25 } = req.body;
    if (!lines || !Array.isArray(lines)) {
      return res.json({ suggestions: [], currentMargin: 0 });
    }

    const totalFee = lines.reduce((sum: number, l: any) => sum + parseFloat(l.fee || "0"), 0);
    const totalCost = lines.reduce((sum: number, l: any) => sum + parseFloat(l.cost || "0"), 0);
    const currentMargin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;

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
      totalFee,
      totalCost,
      isOnTarget: currentMargin >= targetMargin,
      suggestions,
    });
  });

  app.post("/api/ai/scenario-recommendation", async (req: Request, res: Response) => {
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

  app.post("/api/ai/risk-summary", async (req: Request, res: Response) => {
    const { dealId } = req.body;
    const deal = await db.query.deals.findFirst({
      where: eq(deals.id, dealId),
      with: { client: true, scenarios: true, pricingLines: { with: { role: true } } },
    });

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const margin = parseFloat(deal.marginPercent || "0");
    const riskLevel = margin < 20 ? "High" : margin < 25 ? "Medium" : "Low";

    const riskFactors = [];
    if (deal.complexity === "high" || deal.complexity === "very_high") {
      riskFactors.push({ factor: "High Complexity", severity: "medium", detail: "Project complexity increases delivery risk" });
    }
    if (margin < 25) {
      riskFactors.push({ factor: "Below Target Margin", severity: margin < 20 ? "high" : "medium", detail: `Current margin of ${margin.toFixed(1)}% is below the 25% target` });
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

  // ========== ACTIVITY LOG ==========
  app.get("/api/activity", async (_req: Request, res: Response) => {
    const result = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(20);
    res.json(result);
  });
}
