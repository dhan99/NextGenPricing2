import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useDeal, useUpdateDeal, useScopeCatalog, useDealScopeItems, useAddScopeItem, useRemoveScopeItem, useRoles, useDealPricing, useUpdatePricingLine, useDealScenarios, useDealApprovals, useSubmitApproval, useDealPrompts, useCloneDeal, useAIDealSimilarity, useAIEffortEstimation, useAIMarginAdvisor, useAIScenarioRecommendation, useAIRiskSummary } from "@/hooks/use-api";
import { formatCurrency, formatPercent, formatNumber, getStatusColor, getStatusLabel, cn } from "@/lib/utils";
import { ArrowLeft, Check, ChevronRight, Sparkles, AlertTriangle, TrendingUp, Target, FileText, Shield, CheckCircle, XCircle, Clock, Loader2, Plus, Trash2, Lightbulb, Copy, RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

const STEPS = [
  { num: 1, label: "Setup" },
  { num: 2, label: "Scope" },
  { num: 3, label: "Assumptions" },
  { num: 4, label: "Pricing" },
  { num: 5, label: "Scenarios" },
  { num: 6, label: "Review" },
  { num: 7, label: "Approval" },
  { num: 8, label: "Summary" },
];

export function DealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = parseInt(params?.id || "0");
  const { data: deal, isLoading } = useDeal(dealId);
  const [currentStep, setCurrentStep] = useState(1);
  const { hasPermission, persona } = useAuth();
  const cloneDeal = useCloneDeal();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (deal?.currentStep) setCurrentStep(deal.currentStep);
  }, [deal?.currentStep]);

  if (isLoading) return <div className="p-8 flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!deal) return <div className="p-8 text-center text-muted-foreground">Deal not found</div>;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-border bg-card px-8 py-4">
        <div className="flex items-center gap-4 mb-3">
          <Link href="/deals"><span className="text-muted-foreground hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></span></Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">{deal.title}</h1>
              <span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-sm text-muted-foreground">{deal.dealNumber}</span>
              <span className="text-sm text-muted-foreground">{deal.client?.name}</span>
              <span className="text-sm text-muted-foreground">{deal.serviceLine}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {hasPermission("createDeals") && (
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={() => cloneDeal.mutate({ dealId: deal.id, mode: "clone", pdlName: persona?.name }, { onSuccess: (d: any) => navigate(`/deals/${d.id}`) })}
                  disabled={cloneDeal.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone
                </button>
                <button
                  onClick={() => cloneDeal.mutate({ dealId: deal.id, mode: "renewal", pdlName: persona?.name }, { onSuccess: (d: any) => navigate(`/deals/${d.id}`) })}
                  disabled={cloneDeal.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Renew
                </button>
              </div>
            )}
            <div className="flex items-center gap-6 text-right">
              <div><p className="text-xs text-muted-foreground">Total Fee</p><p className="text-lg font-bold text-foreground">{formatCurrency(deal.totalFee || 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">Margin</p><p className="text-lg font-bold text-foreground">{formatPercent(deal.marginPercent || 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">Hours</p><p className="text-lg font-bold text-foreground">{formatNumber(deal.totalHours || 0)}</p></div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((step, i) => (
            <button
              key={step.num}
              onClick={() => setCurrentStep(step.num)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                currentStep === step.num
                  ? "bg-primary text-primary-foreground"
                  : step.num < currentStep
                  ? "bg-success/10 text-success"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {step.num < currentStep ? <Check className="w-3.5 h-3.5" /> : <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs">{step.num}</span>}
              {step.label}
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground ml-1" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {currentStep === 1 && <SetupStep deal={deal} />}
        {currentStep === 2 && <ScopeStep deal={deal} />}
        {currentStep === 3 && <AssumptionsStep deal={deal} />}
        {currentStep === 4 && <PricingStep deal={deal} />}
        {currentStep === 5 && <ScenariosStep deal={deal} />}
        {currentStep === 6 && <ReviewStep deal={deal} />}
        {currentStep === 7 && <ApprovalStep deal={deal} />}
        {currentStep === 8 && <SummaryStep deal={deal} />}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
              currentStep === 1
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-foreground border border-border hover:bg-muted"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            {currentStep > 1 ? STEPS[currentStep - 2].label : "Previous"}
          </button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Step {currentStep} of {STEPS.length}
          </div>

          {currentStep < STEPS.length ? (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length, currentStep + 1))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              {STEPS[currentStep].label}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <Link href="/deals">
              <span className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer">
                Back to Deals
                <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupStep({ deal }: { deal: any }) {
  const similarity = useAIDealSimilarity();

  useEffect(() => {
    if (deal.clientId) {
      similarity.mutate({ clientId: deal.clientId, serviceLine: deal.serviceLine, businessUnit: deal.businessUnit });
    }
  }, [deal.clientId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Deal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Deal Title</label><p className="mt-1 text-sm text-foreground">{deal.title}</p></div>
            <div><label className="label">Deal Number</label><p className="mt-1 text-sm text-foreground">{deal.dealNumber}</p></div>
            <div><label className="label">Deal Type</label><p className="mt-1 text-sm text-foreground capitalize">{deal.dealType}</p></div>
            <div><label className="label">Complexity</label><p className="mt-1 text-sm text-foreground capitalize">{deal.complexity}</p></div>
            <div><label className="label">Business Unit</label><p className="mt-1 text-sm text-foreground">{deal.businessUnit || "--"}</p></div>
            <div><label className="label">Service Line</label><p className="mt-1 text-sm text-foreground">{deal.serviceLine || "--"}</p></div>
            <div><label className="label">Start Date</label><p className="mt-1 text-sm text-foreground">{deal.startDate || "--"}</p></div>
            <div><label className="label">End Date</label><p className="mt-1 text-sm text-foreground">{deal.endDate || "--"}</p></div>
            <div><label className="label">PDL</label><p className="mt-1 text-sm text-foreground">{deal.pdlName || "--"}</p></div>
            <div><label className="label">Region</label><p className="mt-1 text-sm text-foreground">{deal.region || "--"}</p></div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Client Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Client</label><p className="mt-1 text-sm text-foreground">{deal.client?.name}</p></div>
            <div><label className="label">Industry</label><p className="mt-1 text-sm text-foreground">{deal.client?.industry || "--"}</p></div>
            <div><label className="label">Segment</label><p className="mt-1 text-sm text-foreground">{deal.client?.segment || "--"}</p></div>
            <div><label className="label">Relationship</label><p className="mt-1 text-sm text-foreground">{deal.client?.relationshipYears ? `${deal.client.relationshipYears} years` : "--"}</p></div>
            <div><label className="label">Contact</label><p className="mt-1 text-sm text-foreground">{deal.client?.contactName || "--"}</p></div>
            <div><label className="label">Email</label><p className="mt-1 text-sm text-foreground">{deal.client?.contactEmail || "--"}</p></div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">AI Deal Insights</h3>
          </div>
          {similarity.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Analyzing similar deals...</div>}
          {similarity.data && (
            <div className="space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{similarity.data.insights?.recommendation}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Avg Margin</p>
                  <p className="text-lg font-bold text-foreground">{similarity.data.insights?.averageMargin}%</p>
                </div>
                <div className="bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Similar Deals</p>
                  <p className="text-lg font-bold text-foreground">{similarity.data.insights?.dealCount}</p>
                </div>
              </div>
              {similarity.data.similarDeals?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Similar Deals</p>
                  {similarity.data.similarDeals.map((d: any, i: number) => (
                    <div key={i} className="bg-card rounded-lg p-3 mb-2">
                      <p className="text-sm font-medium text-foreground">{d.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">{formatCurrency(d.totalFee || 0)}</span>
                        <span className="text-xs text-muted-foreground">{d.marginPercent}% margin</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopeStep({ deal }: { deal: any }) {
  const { data: catalog } = useScopeCatalog();
  const { data: scopeItems } = useDealScopeItems(deal.id);
  const addItem = useAddScopeItem();
  const removeItem = useRemoveScopeItem();
  const estimation = useAIEffortEstimation();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCatalog = (catalog || []).filter((item: any) =>
    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addedIds = new Set((scopeItems || []).map((si: any) => si.scopeItemId));

  const runEstimation = () => {
    estimation.mutate({
      scopeItems: (scopeItems || []).map((si: any) => ({ ...si.scopeItem, defaultHours: si.adjustedHours || si.scopeItem?.defaultHours })),
      complexity: deal.complexity,
      prompts: deal.promptResponses || [],
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Deal Scope Items</h2>
            <span className="text-sm text-muted-foreground">{(scopeItems || []).length} items added</span>
          </div>
          {(scopeItems || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No scope items added yet. Browse the catalog below to add items.</p>
          ) : (
            <div className="space-y-2">
              {(scopeItems || []).map((si: any) => (
                <div key={si.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{si.scopeItem?.code}</span>
                      <p className="text-sm font-medium text-foreground">{si.scopeItem?.name}</p>
                      {si.scopeItem?.isAssembly && <span className="badge bg-accent text-accent-foreground">Assembly</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{si.adjustedHours || si.scopeItem?.defaultHours} hrs (x{si.complexityMultiplier} multiplier)</p>
                  </div>
                  <button onClick={() => removeItem.mutate({ dealId: deal.id, id: si.id })} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Scope Catalog</h2>
            <div className="relative w-64">
              <input type="text" placeholder="Search catalog..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field text-sm" />
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredCatalog.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{item.code}</span>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <span className="badge bg-secondary text-secondary-foreground">{item.category}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description} | Default: {item.defaultHours} hrs</p>
                </div>
                <button
                  disabled={addedIds.has(item.id)}
                  onClick={() => addItem.mutate({ dealId: deal.id, data: { scopeItemId: item.id, adjustedHours: item.defaultHours, complexityMultiplier: "1.0" } })}
                  className={cn("p-1.5 rounded-lg transition-colors", addedIds.has(item.id) ? "text-success" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}
                >
                  {addedIds.has(item.id) ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">AI Effort Estimation</h3>
          </div>
          <button onClick={runEstimation} disabled={estimation.isPending || (scopeItems || []).length === 0} className="btn-primary w-full mb-4">
            {estimation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {estimation.isPending ? "Estimating..." : "Estimate Effort"}
          </button>
          {estimation.data && (
            <div className="space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{estimation.data.narrative}</p>
              <div className="bg-card rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Estimated Hours</p>
                <p className="text-2xl font-bold text-foreground">{estimation.data.totalHours?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role Distribution</p>
                {estimation.data.roleDistribution?.map((r: any) => (
                  <div key={r.role} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-foreground">{r.role}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{r.hours} hrs</span>
                      <span className="text-xs text-muted-foreground">{r.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssumptionsStep({ deal }: { deal: any }) {
  const { data: prompts } = useDealPrompts(deal.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Complexity & Scope Prompts</h2>
          <p className="text-sm text-muted-foreground mb-6">These questions drive effort multipliers and adjust the scope estimation based on project-specific factors.</p>
          <div className="space-y-4">
            {(prompts || deal.promptResponses || []).map((p: any) => (
              <div key={p.id} className="p-4 border border-border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{p.question}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="badge bg-secondary text-secondary-foreground">{p.category}</span>
                      <span className="text-sm text-foreground font-medium">{p.answer || "Not answered"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Impact</p>
                    <p className={cn("text-sm font-bold", parseFloat(p.impactMultiplier) > 1 ? "text-warning" : "text-success")}>{p.impactMultiplier}x</p>
                  </div>
                </div>
              </div>
            ))}
            {(!prompts || prompts.length === 0) && (!deal.promptResponses || deal.promptResponses.length === 0) && (
              <p className="text-sm text-muted-foreground py-8 text-center">No prompt responses configured for this deal.</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="card p-6 bg-accent/30">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-accent-foreground" />
            <h3 className="font-semibold text-foreground">Impact Summary</h3>
          </div>
          {(() => {
            const items = prompts || deal.promptResponses || [];
            const totalMultiplier = items.reduce((m: number, p: any) => m * parseFloat(p.impactMultiplier || "1"), 1);
            return (
              <div className="space-y-3">
                <div className="bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Combined Multiplier</p>
                  <p className="text-2xl font-bold text-foreground">{totalMultiplier.toFixed(2)}x</p>
                </div>
                <div className="bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Factors Applied</p>
                  <p className="text-2xl font-bold text-foreground">{items.length}</p>
                </div>
                <p className="text-xs text-muted-foreground">Each prompt response adjusts the baseline effort estimation. Higher multipliers increase estimated hours.</p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function PricingStep({ deal }: { deal: any }) {
  const { data: pricingLines } = useDealPricing(deal.id);
  const updateLine = useUpdatePricingLine();
  const marginAdvisor = useAIMarginAdvisor();

  useEffect(() => {
    if (pricingLines && pricingLines.length > 0) {
      marginAdvisor.mutate({ pricingLines, targetMargin: 25 });
    }
  }, [pricingLines?.length]);

  const totals = (pricingLines || []).reduce((acc: any, l: any) => ({
    hours: acc.hours + parseFloat(l.hours || 0),
    fee: acc.fee + parseFloat(l.fee || 0),
    cost: acc.cost + parseFloat(l.cost || 0),
    margin: acc.margin + parseFloat(l.margin || 0),
  }), { hours: 0, fee: 0, cost: 0, margin: 0 });

  const marginPct = totals.fee > 0 ? ((totals.fee - totals.cost) / totals.fee) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Pricing Grid</h2>
            <div className="flex items-center gap-4">
              <div className="text-right"><p className="text-xs text-muted-foreground">Blended Rate</p><p className="text-sm font-bold text-foreground">{totals.hours > 0 ? formatCurrency(totals.fee / totals.hours) : "--"}/hr</p></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Level</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Rate</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Cost Rate</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Fee</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Cost</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(pricingLines || []).map((line: any) => (
                  <tr key={line.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3 text-sm font-medium text-foreground">{line.role?.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{line.role?.level}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        defaultValue={line.hours}
                        onBlur={(e) => {
                          const hours = e.target.value;
                          updateLine.mutate({ dealId: deal.id, id: line.id, data: { hours, rate: line.rate, costRate: line.costRate } });
                        }}
                        className="w-20 text-right text-sm font-medium text-foreground bg-transparent border border-transparent hover:border-input focus:border-primary rounded px-2 py-1 outline-none transition-colors"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-foreground">{formatCurrency(line.rate)}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{formatCurrency(line.costRate)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">{formatCurrency(line.fee)}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{formatCurrency(line.cost)}</td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-success">{formatCurrency(line.margin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-6 py-3 text-sm text-foreground" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">{formatNumber(totals.hours)}</td>
                  <td className="px-4 py-3" colSpan={2}></td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">{formatCurrency(totals.fee)}</td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">{formatCurrency(totals.cost)}</td>
                  <td className="px-6 py-3 text-right text-sm text-success">{formatCurrency(totals.margin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Overall Margin</span>
            <span className={cn("text-lg font-bold", marginPct >= 25 ? "text-success" : marginPct >= 20 ? "text-warning" : "text-destructive")}>{marginPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div>
        <div className="card p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Margin Advisor</h3>
          </div>
          {marginAdvisor.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Analyzing margins...</div>}
          {marginAdvisor.data && (
            <div className="space-y-4">
              <div className="bg-card rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Current Margin</p>
                <p className={cn("text-2xl font-bold", marginAdvisor.data.isOnTarget ? "text-success" : "text-warning")}>{marginAdvisor.data.currentMargin}%</p>
                <p className="text-xs text-muted-foreground mt-1">Target: {marginAdvisor.data.targetMargin}%</p>
              </div>
              {marginAdvisor.data.suggestions?.map((s: any, i: number) => (
                <div key={i} className={cn("bg-card rounded-lg p-3 border-l-3", s.priority === "high" ? "border-l-primary" : s.priority === "info" ? "border-l-success" : "border-l-warning")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Lightbulb className="w-3.5 h-3.5 text-primary" />
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                  {s.impact && <p className="text-xs font-semibold text-primary mt-2">{s.impact}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScenariosStep({ deal }: { deal: any }) {
  const { data: scenarios } = useDealScenarios(deal.id);
  const recommendation = useAIScenarioRecommendation();

  useEffect(() => {
    if (deal.id) recommendation.mutate({ dealId: deal.id });
  }, [deal.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Pricing Scenarios</h2>
        {recommendation.data?.recommendation && (
          <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-lg">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI Recommended: {recommendation.data.recommendation.scenarioName}</span>
          </div>
        )}
      </div>

      {recommendation.data?.narrative && (
        <div className="card p-4 border-primary/20 bg-primary/5">
          <p className="text-sm text-foreground leading-relaxed">{recommendation.data.narrative}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(scenarios || []).map((scenario: any) => (
          <div key={scenario.id} className={cn("card overflow-hidden", scenario.isRecommended && "ring-2 ring-primary")}>
            {scenario.isRecommended && (
              <div className="bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold text-center uppercase tracking-wider">AI Recommended</div>
            )}
            <div className="p-6">
              <h3 className="text-lg font-bold text-foreground mb-1">{scenario.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{scenario.description}</p>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Fee</span>
                  <span className="text-sm font-bold text-foreground">{formatCurrency(scenario.totalFee || 0)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Cost</span>
                  <span className="text-sm text-foreground">{formatCurrency(scenario.totalCost || 0)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Hours</span>
                  <span className="text-sm text-foreground">{formatNumber(scenario.totalHours || 0)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Margin</span>
                  <span className={cn("text-sm font-bold", parseFloat(scenario.marginPercent) >= 25 ? "text-success" : "text-warning")}>{formatPercent(scenario.marginPercent || 0)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Blended Rate</span>
                  <span className="text-sm text-foreground">{formatCurrency(scenario.blendedRate || 0)}/hr</span>
                </div>
              </div>

              {scenario.aiReasoning && (
                <div className="bg-muted/50 rounded-lg p-3 mt-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">{scenario.aiReasoning}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewStep({ deal }: { deal: any }) {
  const riskSummary = useAIRiskSummary();

  useEffect(() => {
    if (deal.id) riskSummary.mutate({ dealId: deal.id });
  }, [deal.id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Executive Summary</h2>
          {riskSummary.data && (
            <div className="space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{riskSummary.data.narrative}</p>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Total Fee</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(riskSummary.data.executiveSummary?.totalFee || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Margin</p>
                  <p className="text-xl font-bold text-foreground">{formatPercent(riskSummary.data.executiveSummary?.marginPercent || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                  <p className="text-xl font-bold text-foreground">{formatNumber(riskSummary.data.executiveSummary?.totalHours || 0)}</p>
                </div>
              </div>
            </div>
          )}
          {riskSummary.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Generating executive summary...</div>}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Deal Details</h2>
          <div className="grid grid-cols-2 gap-y-3 gap-x-8">
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Deal Number</span><span className="text-sm font-medium text-foreground">{deal.dealNumber}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Client</span><span className="text-sm font-medium text-foreground">{deal.client?.name}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Deal Type</span><span className="text-sm font-medium text-foreground capitalize">{deal.dealType}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Complexity</span><span className="text-sm font-medium text-foreground capitalize">{deal.complexity}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Business Unit</span><span className="text-sm font-medium text-foreground">{deal.businessUnit}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Service Line</span><span className="text-sm font-medium text-foreground">{deal.serviceLine}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Start Date</span><span className="text-sm font-medium text-foreground">{deal.startDate}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">End Date</span><span className="text-sm font-medium text-foreground">{deal.endDate}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">PDL</span><span className="text-sm font-medium text-foreground">{deal.pdlName}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Blended Rate</span><span className="text-sm font-medium text-foreground">{formatCurrency(deal.blendedRate || 0)}/hr</span></div>
          </div>
        </div>
      </div>

      <div>
        {riskSummary.data && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-foreground" />
              <h3 className="font-semibold text-foreground">Risk Assessment</h3>
            </div>
            <div className="mb-4">
              <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold",
                riskSummary.data.riskLevel === "Low" ? "bg-success/10 text-success" :
                riskSummary.data.riskLevel === "Medium" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
              )}>
                {riskSummary.data.riskLevel === "Low" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {riskSummary.data.riskLevel} Risk
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 mb-4">
              <p className="text-xs text-muted-foreground">Approval Likelihood</p>
              <p className="text-sm font-bold text-foreground">{riskSummary.data.approvalLikelihood}</p>
            </div>
            <div className="space-y-3">
              {riskSummary.data.riskFactors?.map((f: any, i: number) => (
                <div key={i} className={cn("p-3 rounded-lg border-l-3",
                  f.severity === "positive" ? "bg-success/5 border-l-success" :
                  f.severity === "high" ? "bg-destructive/5 border-l-destructive" :
                  f.severity === "medium" ? "bg-warning/5 border-l-warning" : "bg-muted/50 border-l-muted-foreground"
                )}>
                  <p className="text-sm font-medium text-foreground">{f.factor}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalStep({ deal }: { deal: any }) {
  const { data: approvals } = useDealApprovals(deal.id);
  const submitApproval = useSubmitApproval();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Approval Status</h2>
        {(approvals || []).length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No approval requests submitted yet.</p>
            <button className="btn-primary mt-4" onClick={() => {
              submitApproval.mutate({ dealId: deal.id, data: { approverName: "Practice Leader", approverRole: "Service Line Lead", status: "pending", notes: "Auto-submitted for review" } });
            }}>Submit for Approval</button>
          </div>
        ) : (
          <div className="space-y-4">
            {(approvals || []).map((approval: any) => (
              <div key={approval.id} className="border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center",
                      approval.status === "approved" ? "bg-success/10" : approval.status === "rejected" ? "bg-destructive/10" : "bg-warning/10"
                    )}>
                      {approval.status === "approved" ? <CheckCircle className="w-5 h-5 text-success" /> :
                       approval.status === "rejected" ? <XCircle className="w-5 h-5 text-destructive" /> :
                       <Clock className="w-5 h-5 text-warning" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{approval.approverName || "Approver"}</p>
                      <p className="text-xs text-muted-foreground">{approval.approverRole || "Reviewer"}</p>
                    </div>
                  </div>
                  <span className={`badge ${getStatusColor(approval.status)}`}>{getStatusLabel(approval.status)}</span>
                </div>

                {approval.aiNarrative && (
                  <div className="bg-primary/5 rounded-lg p-4 mb-3 border border-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Generated Summary</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{approval.aiNarrative}</p>
                  </div>
                )}

                {approval.riskSummary && (
                  <div className="bg-muted/50 rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Risk Summary</p>
                    <p className="text-sm text-foreground">{approval.riskSummary}</p>
                  </div>
                )}

                {approval.comments && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Comments</p>
                    <p className="text-sm text-foreground">{approval.comments}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Submitted: {new Date(approval.submittedAt).toLocaleDateString()}</span>
                  {approval.decidedAt && <span className="text-xs text-muted-foreground">Decided: {new Date(approval.decidedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStep({ deal }: { deal: any }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card overflow-hidden">
        <div className="bg-primary px-8 py-6 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Deal Summary</p>
              <h2 className="text-2xl font-bold mt-1">{deal.title}</h2>
              <p className="text-sm opacity-80 mt-1">{deal.dealNumber} | {deal.client?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{formatCurrency(deal.totalFee || 0)}</p>
              <p className="text-sm opacity-80 mt-1">Total Engagement Fee</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="text-center p-4 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(deal.totalCost || 0)}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Margin</p>
              <p className={cn("text-lg font-bold", parseFloat(deal.marginPercent) >= 25 ? "text-success" : "text-warning")}>{formatPercent(deal.marginPercent || 0)}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Total Hours</p>
              <p className="text-lg font-bold text-foreground">{formatNumber(deal.totalHours || 0)}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Blended Rate</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(deal.blendedRate || 0)}/hr</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Engagement Details</h3>
              <div className="space-y-2">
                {[
                  ["Business Unit", deal.businessUnit],
                  ["Service Line", deal.serviceLine],
                  ["Deal Type", deal.dealType],
                  ["Complexity", deal.complexity],
                  ["Region", deal.region],
                  ["Duration", `${deal.startDate} to ${deal.endDate}`],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-foreground capitalize">{value || "--"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Client Information</h3>
              <div className="space-y-2">
                {[
                  ["Client", deal.client?.name],
                  ["Industry", deal.client?.industry],
                  ["Segment", deal.client?.segment],
                  ["Contact", deal.client?.contactName],
                  ["Email", deal.client?.contactEmail],
                  ["Relationship", deal.client?.relationshipYears ? `${deal.client.relationshipYears} years` : "--"],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-foreground">{value || "--"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {deal.notes && (
            <div className="mt-6 p-4 bg-muted/50 rounded-xl">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-sm text-foreground">{deal.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
