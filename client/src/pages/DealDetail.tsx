import React, { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useDeal, useUpdateDeal, useScopeCatalog, useScopeTemplates, useApplyScopeTemplate, useDealScopeItems, useAddScopeItem, useRemoveScopeItem, useRoles, useDealPricing, useUpdatePricingLine, useDealScenarios, useSelectScenario, useDealApprovals, useSubmitApproval, useUpdateApproval, useDealPrompts, useUpdatePrompt, useEngagementInputSpec, useAIDealSimilarity, useAIEffortEstimation, useAIMarginAdvisor, useAIScenarioRecommendation, useAIRiskSummary, useDealIntappScreening, useRunIntappScreening, useIntappOverride, useAddIntappMitigation, useUpdateIntappMitigation, useWorkdayLatestValidation, useWorkdayCostCenters, useRunWorkdayValidation, useLinkWorkdayCostCenter, useOverrideWorkdayValidation, usePromptSets } from "@/hooks/use-api";
import { ResultBadge as IntappResultBadge, RiskBadge as IntappRiskBadge, SourceBadge as IntappSourceBadge } from "./Intapp";
import { ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { formatCurrency, formatPercent, formatNumber, formatRelativeTime, getStatusColor, getStatusLabel, cn } from "@/lib/utils";
import { evaluatePracticeLeadTrigger } from "@shared/policy";
import { ArrowLeft, Check, ChevronRight, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Target, FileText, Shield, CheckCircle, XCircle, Clock, Loader2, Plus, Trash2, Lightbulb, RefreshCw, Pencil, Save, GitBranch, Layers, X, Database, Save as SaveIcon, MessageSquare, ArrowUpRight, ArrowDownRight, MoreHorizontal, Copy, Archive, Download } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { AskDealPadAI } from "@/components/AskDealPadAI";

const STEP_KEYS = ["", "wizard-setup", "wizard-scope", "wizard-assumptions", "wizard-pricing", "wizard-review", "wizard-approval", "wizard-summary"];

const STEPS = [
  { num: 1, label: "Setup" },
  { num: 2, label: "Scope" },
  { num: 3, label: "Assumptions" },
  { num: 4, label: "Pricing" },
  { num: 5, label: "Review" },
  { num: 6, label: "Approval" },
  { num: 7, label: "Summary" },
];

export function DealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = parseInt(params?.id || "0");
  const { data: deal, isLoading } = useDeal(dealId);
  const [currentStep, setCurrentStep] = useState(1);
  const { hasPermission, persona } = useAuth();
  const qc = useQueryClient();

  const navigateToStep = useCallback((step: number) => {
    qc.invalidateQueries({ queryKey: ["deal", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-scope", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-prompts", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-scenarios", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-approvals", dealId] });
    setCurrentStep(step);
  }, [dealId, qc]);

  useEffect(() => {
    if (deal?.currentStep) {
      // Clamp to the current step range. Older deals may have a saved step from
      // before "Scenarios" was collapsed into a drawer on Pricing.
      const next = Math.min(STEPS.length, Math.max(1, deal.currentStep));
      setCurrentStep(next);
    }
  }, [deal?.currentStep]);

  if (isLoading) return <div className="p-8 flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!deal) return <div className="p-8 text-center text-muted-foreground">Deal not found</div>;

  return (
    <div className="flex flex-col min-h-screen">
      <DealBanner deal={deal} currentStep={currentStep} navigateToStep={navigateToStep} />

      <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {currentStep === 1 && <SetupStep deal={deal} />}
        {currentStep === 2 && <ScopeStep deal={deal} />}
        {currentStep === 3 && <AssumptionsStep deal={deal} />}
        {currentStep === 4 && <PricingStep deal={deal} />}
        {currentStep === 5 && <ReviewStep deal={deal} />}
        {currentStep === 6 && <ApprovalStep deal={deal} />}
        {currentStep === 7 && <SummaryStep deal={deal} />}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={() => navigateToStep(Math.max(1, currentStep - 1))}
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
              onClick={() => navigateToStep(Math.min(STEPS.length, currentStep + 1))}
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
      <AskDealPadAI context={{
        screen: STEP_KEYS[currentStep] || "wizard-setup",
        screenLabel: `${STEPS[currentStep - 1]?.label || "Wizard"} · ${deal.dealNumber}`,
        dealId: deal.id,
        deal,
      }} />
    </div>
  );
}

function SetupStep({ deal }: { deal: any }) {
  const { persona } = useAuth();
  const canEdit = persona?.permissions.editDeals ?? false;
  const similarity = useAIDealSimilarity();
  const updateDeal = useUpdateDeal();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: deal.title || "",
    dealType: deal.dealType || "new",
    complexity: deal.complexity || "medium",
    businessUnit: deal.businessUnit || "",
    serviceLine: deal.serviceLine || "",
    startDate: deal.startDate || "",
    endDate: deal.endDate || "",
    pdlName: deal.pdlName || "",
    region: deal.region || "",
  });

  useEffect(() => {
    setForm({
      title: deal.title || "",
      dealType: deal.dealType || "new",
      complexity: deal.complexity || "medium",
      businessUnit: deal.businessUnit || "",
      serviceLine: deal.serviceLine || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
      pdlName: deal.pdlName || "",
      region: deal.region || "",
    });
  }, [deal]);

  useEffect(() => {
    if (deal.clientId) {
      similarity.mutate({ clientId: deal.clientId, serviceLine: deal.serviceLine, businessUnit: deal.businessUnit });
    }
  }, [deal.clientId]);

  const handleSave = () => {
    updateDeal.mutate({ id: deal.id, data: form }, {
      onSuccess: () => setEditing(false),
    });
  };

  const handleCancel = () => {
    setForm({
      title: deal.title || "",
      dealType: deal.dealType || "new",
      complexity: deal.complexity || "medium",
      businessUnit: deal.businessUnit || "",
      serviceLine: deal.serviceLine || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
      pdlName: deal.pdlName || "",
      region: deal.region || "",
    });
    setEditing(false);
  };

  const inputClass = "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";
  const selectClass = "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Deal Information</h2>
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            {editing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateDeal.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {updateDeal.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {editing ? (
              <>
                <div className="col-span-2">
                  <label className="label">Deal Title</label>
                  <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Deal Number</label>
                  <p className="mt-1 text-sm text-muted-foreground">{deal.dealNumber}</p>
                </div>
                <div>
                  <label className="label">Deal Type</label>
                  <select className={selectClass} value={form.dealType} onChange={(e) => setForm({ ...form, dealType: e.target.value })}>
                    <option value="new">New</option>
                    <option value="renewal">Renewal</option>
                    <option value="extension">Extension</option>
                    <option value="change_order">Change Order</option>
                  </select>
                </div>
                <div>
                  <label className="label">Complexity</label>
                  <select className={selectClass} value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label">Business Unit</label>
                  <input className={inputClass} value={form.businessUnit} onChange={(e) => setForm({ ...form, businessUnit: e.target.value })} />
                </div>
                <div>
                  <label className="label">Service Line</label>
                  <input className={inputClass} value={form.serviceLine} onChange={(e) => setForm({ ...form, serviceLine: e.target.value })} />
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">PDL</label>
                  <input className={inputClass} value={form.pdlName} onChange={(e) => setForm({ ...form, pdlName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Region</label>
                  <input className={inputClass} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
  const { data: templates } = useScopeTemplates(deal.serviceLine || null);
  const addItem = useAddScopeItem();
  const removeItem = useRemoveScopeItem();
  const applyTemplate = useApplyScopeTemplate();
  const estimation = useAIEffortEstimation();
  const [searchTerm, setSearchTerm] = useState("");
  const [hasEstimated, setHasEstimated] = useState(false);
  const [showAllPractices, setShowAllPractices] = useState(false);

  const matchesServiceLine = (item: any) => {
    if (showAllPractices) return true;
    if (!deal.serviceLine) return true;
    if (!item.serviceLines) return true; // cross-cutting items always show
    return item.serviceLines.split(",").map((s: string) => s.trim()).includes(deal.serviceLine);
  };

  const filteredCatalog = (catalog || []).filter((item: any) => {
    const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && matchesServiceLine(item);
  });

  const addedIds = new Set((scopeItems || []).map((si: any) => si.scopeItemId));

  // Group deal scope items: parents (assemblies) followed by their children
  const groupedScope = (() => {
    const items = scopeItems || [];
    const parents = items.filter((si: any) => si.scopeItem?.isAssembly);
    const orphans = items.filter((si: any) => !si.scopeItem?.isAssembly && !parents.some((p: any) => p.scopeItem?.id === si.scopeItem?.parentId));
    const childrenByParent = new Map<number, any[]>();
    for (const si of items) {
      const pid = si.scopeItem?.parentId;
      if (pid && parents.some((p: any) => p.scopeItem?.id === pid)) {
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid)!.push(si);
      }
    }
    return { parents, orphans, childrenByParent };
  })();

  const [scopeError, setScopeError] = useState("");

  const runEstimation = () => {
    if ((scopeItems || []).length === 0) {
      setScopeError("Add at least one scope item before estimating effort.");
      return;
    }
    setScopeError("");
    setHasEstimated(true);
    const billableItems = (scopeItems || []).filter((si: any) => !si.scopeItem?.isAssembly);
    estimation.mutate({
      scopeItems: billableItems.map((si: any) => ({ ...si.scopeItem, defaultHours: si.adjustedHours || si.scopeItem?.defaultHours })),
      complexity: deal.complexity,
      prompts: deal.promptResponses || [],
      startDate: deal.startDate,
      endDate: deal.endDate,
    });
  };

  const scopeItemCount = (scopeItems || []).filter((si: any) => !si.scopeItem?.isAssembly).length;
  useEffect(() => {
    if (hasEstimated && scopeItemCount > 0 && !estimation.isPending) {
      const timer = setTimeout(() => {
        const billableItems = (scopeItems || []).filter((si: any) => !si.scopeItem?.isAssembly);
        estimation.mutate({
          scopeItems: billableItems.map((si: any) => ({ ...si.scopeItem, defaultHours: si.adjustedHours || si.scopeItem?.defaultHours })),
          complexity: deal.complexity,
          prompts: deal.promptResponses || [],
          startDate: deal.startDate,
          endDate: deal.endDate,
        });
      }, 400);
      return () => clearTimeout(timer);
    }
    if (hasEstimated && scopeItemCount === 0) {
      estimation.reset();
    }
    if (scopeItemCount > 0) {
      setScopeError("");
    }
  }, [scopeItemCount]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Deal Scope Items</h2>
            <span className="text-sm text-muted-foreground">{(scopeItems || []).length} items added</span>
          </div>
          {(scopeItems || []).length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">No scope items yet. Pick a starter template below or browse the catalog.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedScope.parents.map((parent: any) => {
                const kids = groupedScope.childrenByParent.get(parent.scopeItem?.id) || [];
                return (
                  <div key={parent.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-amber-50/40">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{parent.scopeItem?.code}</span>
                          <p className="text-sm font-semibold text-foreground">{parent.scopeItem?.name}</p>
                          <span className="badge bg-accent text-accent-foreground">Assembly</span>
                          {kids.length > 0 && <span className="text-xs text-muted-foreground">{kids.length} child{kids.length !== 1 ? "ren" : ""}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{parent.adjustedHours || parent.scopeItem?.defaultHours} hrs (x{parent.complexityMultiplier} multiplier)</p>
                      </div>
                      <button onClick={() => removeItem.mutate({ dealId: deal.id, id: parent.id })} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {kids.map((kid: any) => (
                      <div key={kid.id} className="flex items-center justify-between p-2.5 pl-8 border-t border-border bg-muted/20">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">↳ {kid.scopeItem?.code}</span>
                            <p className="text-sm text-foreground">{kid.scopeItem?.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{kid.adjustedHours || kid.scopeItem?.defaultHours} hrs</p>
                        </div>
                        <button onClick={() => removeItem.mutate({ dealId: deal.id, id: kid.id })} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {groupedScope.orphans.map((si: any) => (
                <div key={si.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{si.scopeItem?.code}</span>
                      <p className="text-sm font-medium text-foreground">{si.scopeItem?.name}</p>
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

        {(templates || []).length > 0 && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Starter Templates</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {deal.serviceLine ? `Curated for ${deal.serviceLine}` : "Generic templates"} · click to bulk-add a starter scope set
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(templates || []).map((tpl: any) => (
                <button
                  key={tpl.id}
                  disabled={applyTemplate.isPending}
                  onClick={() => {
                    if ((scopeItems || []).length > 0 && !confirm(`Add ${tpl.items?.length || 0} items from "${tpl.name}" to your scope?\n\nExisting items are kept; duplicates are skipped.`)) return;
                    applyTemplate.mutate({ dealId: deal.id, templateId: tpl.id });
                  }}
                  className="text-left p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                    <span className="text-xs text-muted-foreground">{tpl.items?.length || 0} items</span>
                  </div>
                  {tpl.description && <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>}
                  {tpl.serviceLine && <span className="badge bg-secondary text-secondary-foreground mt-2">{tpl.serviceLine}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Scope Catalog</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {showAllPractices || !deal.serviceLine
                  ? `Showing all practices · ${filteredCatalog.length} items`
                  : `Filtered to ${deal.serviceLine} · ${filteredCatalog.length} items`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {deal.serviceLine && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={showAllPractices} onChange={(e) => setShowAllPractices(e.target.checked)} className="rounded" />
                  Show all practices
                </label>
              )}
              <input type="text" placeholder="Search catalog..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field text-sm w-56" />
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredCatalog.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{item.code}</span>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <span className="badge bg-secondary text-secondary-foreground">{item.category}</span>
                    {item.isAssembly && <span className="badge bg-accent text-accent-foreground">Assembly</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description} | Default: {item.defaultHours} hrs
                    {item.isAssembly && " · adding cascades children"}
                  </p>
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
            {filteredCatalog.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No items match. {!showAllPractices && deal.serviceLine && "Try enabling \"Show all practices\"."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-4">Calculated Scope Preview</h3>
          {(() => {
            const billable = (scopeItems || []).filter((si: any) => !si.scopeItem?.isAssembly);
            if (billable.length === 0) {
              return <p className="text-xs text-muted-foreground">Add scope items to see the calculated preview.</p>;
            }
            const total = billable.reduce((sum: number, si: any) => {
              const qty = si.quantity || 1;
              const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "0");
              const mult = parseFloat(si.complexityMultiplier || "1");
              return sum + baseHrs * qty * mult;
            }, 0);
            return (
              <>
                <div className="space-y-2.5">
                  {billable.map((si: any) => {
                    const qty = si.quantity || 1;
                    const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "0");
                    const mult = parseFloat(si.complexityMultiplier || "1");
                    const totalHrs = baseHrs * qty * mult;
                    return (
                      <div key={si.id} className="flex items-start justify-between text-sm">
                        <span className="text-foreground flex-1 pr-2 leading-snug">{si.scopeItem?.name}</span>
                        <div className="text-right flex-shrink-0">
                          <div className="text-foreground font-medium">×{qty}</div>
                          <div className="text-xs text-muted-foreground">~{totalHrs.toFixed(0)} hrs</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border mt-4 pt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total Estimated Hours</span>
                  <span className="text-lg font-bold text-foreground">
                    {total.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Assemblies are shown as groupings only; hours come from their child items.
                </p>
              </>
            );
          })()}
        </div>

        <div className="rounded-xl p-5 border border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">AI Suggestion</h3>
          </div>
          {!estimation.data && !estimation.isPending && (
            <>
              <p className="text-xs text-foreground leading-relaxed mb-3">
                Run AI Effort Estimation to size this scope against comparable deals in
                {deal.serviceLine ? ` ${deal.serviceLine}` : " your practice"}.
              </p>
              <button onClick={runEstimation} disabled={estimation.isPending} className="btn-primary w-full text-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Estimate Effort
              </button>
            </>
          )}
          {estimation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sizing against comparable deals...
            </div>
          )}
          {scopeError && (
            <div className="flex items-start gap-2 px-3 py-2.5 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs">{scopeError}</p>
            </div>
          )}
          {estimation.data && (
            <div className="space-y-3">
              <p className="text-xs text-foreground leading-relaxed">{estimation.data.narrative}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Total Hours</p>
                  <p className="text-2xl font-bold text-foreground">{estimation.data.totalHours?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Suggested Resources</p>
                  <p className="text-2xl font-bold text-foreground">{estimation.data.totalHeadcount ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">~{estimation.data.totalFTE} FTE · {estimation.data.projectWeeks} wks</p>
                </div>
              </div>
              {estimation.data.weeksSource === "default" && (
                <p className="text-[11px] text-amber-700 bg-amber-100/60 rounded px-2 py-1">
                  Using 12-week default. Set start/end dates on Setup for a tighter resource estimate.
                </p>
              )}
              {estimation.data.comparableDeals && estimation.data.comparableDeals.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Comparable Deals</p>
                  <ul className="space-y-1">
                    {estimation.data.comparableDeals.slice(0, 4).map((d: any, i: number) => (
                      <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                        <span>{d.label || `${d.client} (${d.year})`}: {d.hours?.toLocaleString()} hrs{d.entities ? `, ${d.entities} entities` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Role Distribution</p>
                {estimation.data.roleDistribution?.map((r: any) => (
                  <div key={r.role} className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-foreground">{r.role}</span>
                    <span className="text-xs text-muted-foreground">{r.hours} hrs · {r.percentage}%</span>
                  </div>
                ))}
              </div>
              <button onClick={runEstimation} disabled={estimation.isPending} className="text-xs text-primary hover:underline">Re-run estimation</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PROMPT_OPTIONS: Record<string, string[]> = {
  "How many geographic regions are involved?": ["1 region|1.0", "2 regions|1.1", "3+ regions|1.2"],
  "Are there regulatory/compliance requirements?": ["None|1.0", "Standard compliance|1.05", "SOX/HIPAA compliance|1.15", "Multi-framework|1.25"],
  "What is the expected data volume?": ["Small (<100K records)|0.9", "Medium (100K-1M)|1.0", "Large (1M-10M)|1.1", "Very Large (10M+)|1.2"],
  "How many integrations are required?": ["None|1.0", "1-2 integrations|1.05", "3-4 integrations|1.1", "5-8 integrations|1.2", "9+ integrations|1.3"],
  "Is there an existing system being replaced?": ["No (greenfield)|0.95", "Yes - modern system|1.05", "Yes - legacy system|1.1", "Yes - multiple systems|1.2"],
  "What is the client's technical maturity?": ["High maturity|0.9", "Moderate maturity|1.0", "Low maturity|1.1", "Very low maturity|1.2"],
  "Is there a hard deadline or external dependency?": ["Flexible timeline|0.95", "Preferred deadline|1.0", "Hard deadline|1.1", "Regulatory deadline|1.2"],
};

function AssumptionsStep({ deal }: { deal: any }) {
  const { data: prompts, refetch } = useDealPrompts(deal.id);
  const updatePrompt = useUpdatePrompt();

  const handleAnswer = (prompt: any, optionStr: string) => {
    const [answer, multiplier] = optionStr.split("|");
    updatePrompt.mutate({ dealId: deal.id, promptId: prompt.id, answer, impactMultiplier: multiplier });
  };

  const items = prompts || deal.promptResponses || [];
  const answeredCount = items.filter((p: any) => p.answer).length;
  const totalMultiplier = items.reduce((m: number, p: any) => m * parseFloat(p.impactMultiplier || "1"), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <EngagementInputsCard deal={deal} />
        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground">Complexity Drivers</h2>
            <span className="text-xs font-medium text-muted-foreground">{answeredCount} of {items.length} answered</span>
          </div>
          <p className="text-sm text-muted-foreground mb-6">These project-specific factors fine-tune the AI effort estimation through compounding multipliers.</p>
          <div className="space-y-4">
            {items.map((p: any) => {
              const options = PROMPT_OPTIONS[p.question] || [];
              return (
                <div key={p.id} className={cn("p-4 rounded-lg border-2 transition-colors", p.answer ? "border-border bg-card" : "border-dashed border-primary/30 bg-primary/5")}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">{p.category}</span>
                        {!p.answer && <span className="text-[10px] font-medium text-primary">Needs answer</span>}
                      </div>
                      <p className="text-sm font-medium text-foreground mb-3">{p.question}</p>
                      {options.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {options.map((opt) => {
                            const [label, mult] = opt.split("|");
                            const isSelected = p.answer === label;
                            return (
                              <button
                                key={label}
                                onClick={() => handleAnswer(p, opt)}
                                disabled={updatePrompt.isPending}
                                className={cn(
                                  "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                                )}
                              >
                                {label}
                                <span className={cn("ml-1.5 opacity-60", isSelected ? "text-primary-foreground" : "")}>{mult}x</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground">{p.answer || "Not answered"}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Impact</p>
                      <p className={cn("text-lg font-bold", parseFloat(p.impactMultiplier) > 1 ? "text-amber-600" : parseFloat(p.impactMultiplier) < 1 ? "text-emerald-600" : "text-muted-foreground")}>{parseFloat(p.impactMultiplier).toFixed(2)}x</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No prompt responses configured for this deal.</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Impact Summary</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-card rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Combined Multiplier</p>
              <p className={cn("text-3xl font-bold", totalMultiplier > 1.15 ? "text-amber-600" : totalMultiplier > 1 ? "text-foreground" : "text-emerald-600")}>{totalMultiplier.toFixed(2)}x</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Answered</p>
                <p className="text-xl font-bold text-foreground">{answeredCount}<span className="text-sm font-normal text-muted-foreground">/{items.length}</span></p>
              </div>
              <div className="bg-card rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Unanswered</p>
                <p className="text-xl font-bold text-foreground">{items.length - answeredCount}</p>
              </div>
            </div>
            {answeredCount < items.length && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">Answer all prompts for the most accurate effort estimation.</p>
              </div>
            )}
            {answeredCount === items.length && items.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">All complexity factors answered. Estimation will use {totalMultiplier.toFixed(2)}x adjustment.</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">Each response adjusts the baseline effort estimation. Multipliers above 1.0x increase hours; below 1.0x decrease them.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EngagementInputsCard({ deal }: { deal: any }) {
  const { data: spec, isLoading } = useEngagementInputSpec(deal.serviceLine);
  const updateDeal = useUpdateDeal();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Hydrate draft from saved engagementInputs (or preset defaults) once spec loads
  useEffect(() => {
    if (!spec) return;
    const saved = (deal.engagementInputs as Record<string, string>) || {};
    const merged: Record<string, string> = { ...spec.defaults, ...saved };
    setDraft(merged);
  }, [spec, deal.id]);

  if (isLoading || !spec) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading engagement inputs...
        </div>
      </div>
    );
  }

  const setField = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const commitField = (key: string, value: string) => {
    const merged = { ...((deal.engagementInputs as Record<string, string>) || {}), ...draft, [key]: value };
    updateDeal.mutate(
      { id: deal.id, data: { engagementInputs: merged } },
      {
        onSuccess: () => {
          setSavedKey(key);
          setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1200);
        },
      }
    );
  };

  const isTaxPHB = deal.serviceLine === "Tax-PHB";

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Engagement Inputs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isTaxPHB
              ? "Structured pricing inputs from Armanino's Tax PHB workbook. These flow into the pricing engine and govern rounding, fees, and margin targets."
              : "Generic engagement inputs. A service-line-specific preset will appear when this deal's service line is recognized."}
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
          {spec.label}
        </span>
      </div>

      {spec.sourceWorkbook && (
        <p className="text-[11px] text-muted-foreground mb-4">
          Source: <span className="font-mono">{spec.sourceWorkbook}</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {spec.fields.map((f: any) => {
          const value = draft[f.key] ?? "";
          const justSaved = savedKey === f.key;
          return (
            <div key={f.key} className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                {f.label}
                {justSaved && (
                  <span className="ml-2 text-[10px] font-normal text-emerald-600 inline-flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> saved
                  </span>
                )}
              </label>
              {f.type === "select" ? (
                <select
                  value={value}
                  onChange={(e) => {
                    setField(f.key, e.target.value);
                    commitField(f.key, e.target.value);
                  }}
                  disabled={updateDeal.isPending}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {f.options.map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  {f.prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{f.prefix}</span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={value}
                    onChange={(e) => setField(f.key, e.target.value)}
                    onBlur={(e) => commitField(f.key, e.target.value)}
                    disabled={updateDeal.isPending}
                    className={cn(
                      "w-full py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      f.prefix ? "pl-7 pr-3" : "px-3",
                      f.suffix ? "pr-8" : ""
                    )}
                  />
                  {f.suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{f.suffix}</span>
                  )}
                </div>
              )}
              {f.help && <p className="text-[11px] text-muted-foreground leading-snug">{f.help}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScopeBreakdownPanel({ dealId, pricingLines }: { dealId: number; pricingLines: any[] }) {
  const { data: scopeItems } = useDealScopeItems(dealId);
  const items = scopeItems || [];
  const lines = pricingLines || [];

  const totalScopeHours = items.reduce(
    (s: number, i: any) => s + parseFloat(i.adjustedHours || 0) * parseFloat(i.complexityMultiplier || 1) * (i.quantity || 1),
    0
  );
  const roleHourTotals: Record<number, number> = {};
  lines.forEach((l: any) => { roleHourTotals[l.roleId] = parseFloat(l.hours || 0); });

  // Group scope items by category prefix derived from the code (IMPL, TEST, PMO, TRN, etc.)
  const groups: Record<string, any[]> = {};
  items.forEach((item: any) => {
    const code: string = item.scopeItem?.code || item.code || "OTHER";
    const prefix = code.includes("-") ? code.split("-")[0] : "OTHER";
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(item);
  });
  const groupOrder = ["IMPL", "TEST", "PMO", "TRN"];
  const orderedGroupKeys = [
    ...groupOrder.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !groupOrder.includes(g)).sort(),
  ];

  const groupLabel: Record<string, string> = {
    IMPL: "Implementation",
    TEST: "Testing & QA",
    PMO: "Project Management",
    TRN: "Training & Enablement",
    OTHER: "Other",
  };

  const allocatedHoursForCell = (itemHours: number, roleHours: number) =>
    totalScopeHours > 0 ? (itemHours / totalScopeHours) * roleHours : 0;

  const itemRowFee = (itemHours: number) =>
    lines.reduce((sum: number, l: any) => {
      const h = allocatedHoursForCell(itemHours, parseFloat(l.hours || 0));
      return sum + h * parseFloat(l.rate || 0);
    }, 0);

  const itemRowHours = (itemHours: number) =>
    lines.reduce((sum: number, l: any) => sum + allocatedHoursForCell(itemHours, parseFloat(l.hours || 0)), 0);

  if (items.length === 0 || lines.length === 0) return null;

  return (
    <div className="card overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Scope Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            High-level pricing decomposed by scope item, proportionally allocated across roles.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground font-semibold">
          Derived view
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Scope Item</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase">Effort hrs</th>
              {lines.map((l: any) => (
                <th key={l.id} className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                  {l.role?.name} hrs
                </th>
              ))}
              <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orderedGroupKeys.map((g) => {
              const groupItems = groups[g];
              const groupHours = groupItems.reduce((s, i) => s + parseFloat(i.adjustedHours || 0) * parseFloat(i.complexityMultiplier || 1) * (i.quantity || 1), 0);
              const groupFee = itemRowFee(groupHours);
              return (
                <React.Fragment key={`grp-${g}`}>
                  <tr className="bg-amber-50/40">
                    <td className="px-6 py-2 text-xs font-bold text-foreground uppercase tracking-wide" colSpan={2 + lines.length + 1}>
                      <span className="text-primary">{g}</span>
                      <span className="text-muted-foreground ml-2 normal-case font-medium">{groupLabel[g] || g}</span>
                      <span className="text-muted-foreground ml-3 font-normal">·  {groupItems.length} items · {formatNumber(groupHours)} hrs · {formatCurrency(groupFee)}</span>
                    </td>
                  </tr>
                  {groupItems.map((item: any) => {
                    const code = item.scopeItem?.code || "—";
                    const name = item.scopeItem?.name || "Unnamed";
                    const itemHours = parseFloat(item.adjustedHours || 0) * parseFloat(item.complexityMultiplier || 1) * (item.quantity || 1);
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-6 py-2.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-mono text-primary font-semibold">{code}</span>
                            <span className="text-sm text-foreground">{name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-foreground font-medium">{formatNumber(itemHours)}</td>
                        {lines.map((l: any) => {
                          const h = allocatedHoursForCell(itemHours, parseFloat(l.hours || 0));
                          return (
                            <td key={l.id} className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                              {h > 0.05 ? h.toFixed(1) : "—"}
                            </td>
                          );
                        })}
                        <td className="px-6 py-2.5 text-right font-semibold text-foreground tabular-nums">{formatCurrency(itemRowFee(itemHours))}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="px-6 py-3 text-foreground">Totals</td>
              <td className="px-3 py-3 text-right text-foreground tabular-nums">{formatNumber(totalScopeHours)}</td>
              {lines.map((l: any) => (
                <td key={l.id} className="px-3 py-3 text-right text-foreground tabular-nums">{formatNumber(parseFloat(l.hours || 0))}</td>
              ))}
              <td className="px-6 py-3 text-right text-foreground tabular-nums">
                {formatCurrency(lines.reduce((s: number, l: any) => s + parseFloat(l.fee || 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PricingStep({ deal }: { deal: any }) {
  const { data: pricingLines } = useDealPricing(deal.id);
  const updateLine = useUpdatePricingLine();
  const marginAdvisor = useAIMarginAdvisor();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { data: scenariosForBadge } = useDealScenarios(deal.id);
  const selectedScenario = (scenariosForBadge || []).find((s: any) => s.isRecommended);

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
  const targetMargin = 35;
  const vsTarget = marginPct - targetMargin;
  const blendedRate = totals.hours > 0 ? totals.fee / totals.hours : 0;

  // Cost breakdown by role bucket (Staff, Senior, Manager, Senior Manager, Director, Partner).
  const levelOrder = ["Partner", "Director", "Manager", "Senior", "Staff"];
  const levelLabels: Record<string, string> = {
    Partner: "Partner",
    Director: "Managing Director",
    Manager: "Manager / Sr. Manager",
    Senior: "Senior",
    Staff: "Staff",
  };
  const levelTints: Record<string, string> = {
    Partner: "bg-rose-500",
    Director: "bg-purple-500",
    Manager: "bg-blue-500",
    Senior: "bg-emerald-500",
    Staff: "bg-amber-500",
  };
  const costByLevel = new Map<string, { cost: number; hours: number; fee: number }>();
  (pricingLines || []).forEach((l: any) => {
    const lvl = l.role?.level || "Staff";
    const cur = costByLevel.get(lvl) || { cost: 0, hours: 0, fee: 0 };
    cur.cost += parseFloat(l.cost || 0);
    cur.hours += parseFloat(l.hours || 0);
    cur.fee += parseFloat(l.fee || 0);
    costByLevel.set(lvl, cur);
  });
  const maxCostByLevel = Math.max(1, ...Array.from(costByLevel.values()).map((v) => v.cost));

  const kpiCards = [
    { label: "Total Proposed Fees", value: formatCurrency(totals.fee), tone: "default" as const },
    { label: "Standard Cost", value: formatCurrency(totals.cost), tone: "muted" as const },
    { label: "Gross Margin $", value: formatCurrency(totals.margin), tone: "default" as const },
    { label: "Margin %", value: `${marginPct.toFixed(1)}%`, tone: marginPct >= targetMargin ? "success" as const : marginPct >= 25 ? "warning" as const : "danger" as const },
    { label: "Total Hours", value: formatNumber(totals.hours), tone: "default" as const },
    { label: "Effective Rate", value: blendedRate > 0 ? `${formatCurrency(blendedRate)}/hr` : "—", tone: "default" as const },
    { label: `vs Target (${targetMargin}%)`, value: `${vsTarget >= 0 ? "+" : ""}${vsTarget.toFixed(1)}%`, tone: vsTarget >= 0 ? "success" as const : "danger" as const, accent: true },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <PricingOptionsDrawer deal={deal} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <div className="lg:col-span-4 flex items-center justify-between gap-4 -mb-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pricing</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Tune hours and margins live, or compare alternative pricing options.</p>
        </div>
        <button
          onClick={() => setOptionsOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/40 text-sm font-medium text-foreground transition-colors"
        >
          <Layers className="w-4 h-4 text-primary" />
          Compare Pricing Options
          {selectedScenario && (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle className="w-3 h-3" />
              {selectedScenario.name}
            </span>
          )}
        </button>
      </div>
      <div className="lg:col-span-3 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {kpiCards.map((c) => (
            <div
              key={c.label}
              className={cn(
                "rounded-xl border px-3 py-3 bg-card",
                c.accent && c.tone === "success" && "border-emerald-300 bg-emerald-50/60",
                c.accent && c.tone === "danger" && "border-rose-300 bg-rose-50/60",
                !c.accent && "border-border"
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">{c.label}</p>
              <p className={cn(
                "text-lg font-bold mt-1 leading-none",
                c.tone === "success" && "text-emerald-700",
                c.tone === "danger" && "text-rose-700",
                c.tone === "warning" && "text-amber-700",
                (c.tone === "default" || c.tone === "muted") && "text-foreground",
              )}>
                {c.value}
              </p>
            </div>
          ))}
        </div>
        <ScopeBreakdownPanel dealId={deal.id} pricingLines={pricingLines || []} />
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

      <div className="space-y-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Cost Breakdown by Role</h3>
          {costByLevel.size === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Add pricing lines to see breakdown.</p>
          ) : (
            <div className="space-y-3">
              {levelOrder.filter((lvl) => costByLevel.has(lvl)).map((lvl) => {
                const v = costByLevel.get(lvl)!;
                const pct = (v.cost / maxCostByLevel) * 100;
                return (
                  <div key={lvl}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground font-medium">{levelLabels[lvl]}</span>
                      <span className="text-foreground font-semibold tabular-nums">{formatCurrency(v.cost)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", levelTints[lvl])} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>{formatNumber(v.hours)} hrs</span>
                      <span>{formatCurrency(v.fee)} fee</span>
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-bold text-foreground tabular-nums">{formatCurrency(totals.cost)}</span>
              </div>
            </div>
          )}
        </div>

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

function PricingOptionsDrawer({ deal, open, onClose }: { deal: any; open: boolean; onClose: () => void }) {
  const { data: scenarios } = useDealScenarios(deal.id);
  const selectScenario = useSelectScenario();
  const recommendation = useAIScenarioRecommendation();
  const { persona } = useAuth();

  useEffect(() => {
    if (open && deal.id) recommendation.mutate({ dealId: deal.id });
  }, [open, deal.id]);

  const selectedScenario = (scenarios || []).find((s: any) => s.isRecommended);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-[1100px] bg-background shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pricing Options</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Compare alternatives and select the recommended option for this engagement.</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedScenario && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">Selected: {selectedScenario.name}</span>
              </div>
            )}
            <button onClick={onClose} className="p-2 rounded hover:bg-muted/40" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {recommendation.data?.narrative && (
            <div className="card p-4 border-primary/20 bg-primary/5">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-foreground leading-relaxed">{recommendation.data.narrative}</p>
              </div>
            </div>
          )}

          {(!scenarios || scenarios.length === 0) ? (
            <div className="card p-12 text-center text-sm text-muted-foreground">
              No pricing options have been generated for this deal yet.
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(scenarios || []).map((scenario: any) => {
          const isSelected = scenario.isRecommended;
          return (
            <div key={scenario.id} className={cn(
              "card overflow-hidden transition-all",
              isSelected ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
            )}>
              {isSelected && (
                <div className="bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold text-center uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Selected
                </div>
              )}
              <div className="p-6">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-bold text-foreground">{scenario.name}</h3>
                  {scenario.scenarioType === "option_2" && !isSelected && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">AI Pick</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4">{scenario.description}</p>

                <div className="space-y-3 mb-5">
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

                <button
                  onClick={() => selectScenario.mutate({ dealId: deal.id, scenarioId: scenario.id, userName: persona?.name })}
                  disabled={isSelected || selectScenario.isPending}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                    isSelected
                      ? "bg-primary/10 text-primary cursor-default"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {isSelected ? (
                    <><CheckCircle className="w-4 h-4" /> Selected</>
                  ) : selectScenario.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
                  ) : (
                    "Select This Scenario"
                  )}
                </button>

                {scenario.aiReasoning && (
                  <div className="bg-muted/50 rounded-lg p-3 mt-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">{scenario.aiReasoning}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DealBanner({ deal, currentStep, navigateToStep }: { deal: any; currentStep: number; navigateToStep: (n: number) => void }) {
  const { data: approvals } = useDealApprovals(deal.id);
  const { data: publishedSets } = usePromptSets({ status: "published", serviceLine: deal.serviceLine });
  const [moreOpen, setMoreOpen] = useState(false);

  const pendingApprovals = (approvals || []).filter((a: any) => a.status === "pending").length;
  const targetMargin = 35;
  const marginVal = parseFloat(deal.marginPercent || 0);
  const marginDelta = marginVal - targetMargin;
  const marginGood = marginDelta >= 0;
  const activePromptSet = (publishedSets || [])[0];

  const dynamics = deal.dynamicsLink;
  const lastSaved = formatRelativeTime(deal.updatedAt);
  const dynamicsSyncedAt = dynamics?.lastSyncedAt ? formatRelativeTime(dynamics.lastSyncedAt) : null;

  const stepProgress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="border-b border-border bg-gradient-to-b from-card to-background">
      <div className="px-8 pt-5 pb-3">
        {/* Title row */}
        <div className="flex items-start gap-4">
          <Link href="/deals">
            <button className="mt-1 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Back to engagements">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>

          {/* Amber accent bar */}
          <div className="self-stretch w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">{deal.title}</h1>
              <span className={cn("inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full", getStatusColor(deal.status))}>
                {getStatusLabel(deal.status)}
              </span>
              {marginVal > 0 && (
                <span className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                  marginGood ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                )}>
                  {marginGood ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {marginVal.toFixed(1)}% · {marginGood ? "+" : ""}{marginDelta.toFixed(1)} vs {targetMargin}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground/70">{deal.dealNumber}</span>
              <span className="text-border">·</span>
              <span>{deal.client?.name}</span>
              <span className="text-border">·</span>
              <span>{deal.serviceLine}</span>
              {deal.businessUnit && (<><span className="text-border">·</span><span>{deal.businessUnit}</span></>)}
            </div>

            {/* Trust chips */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {dynamics ? (
                <Link href="/integrations/dynamics">
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors">
                    <Database className="w-3 h-3" />
                    CRM linked: {dynamics.opportunityNumber}
                    {dynamicsSyncedAt && <span className="text-blue-600/70">· synced {dynamicsSyncedAt}</span>}
                  </span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                  <Database className="w-3 h-3" />
                  CRM not linked
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border">
                <SaveIcon className="w-3 h-3" />
                Auto-saved · {lastSaved}
              </span>

              {activePromptSet && (
                <Link href="/admin/prompt-sets">
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 cursor-pointer transition-colors">
                    <MessageSquare className="w-3 h-3" />
                    Prompt set v{activePromptSet.version} · {activePromptSet.name}
                  </span>
                </Link>
              )}

              {pendingApprovals > 0 && (
                <button
                  onClick={() => navigateToStep(6)}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  <Clock className="w-3 h-3" />
                  {pendingApprovals} approval{pendingApprovals !== 1 ? "s" : ""} pending
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMoreOpen(false), 150)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-20">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors" onClick={() => window.print()}>
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  Export PDF
                </button>
                <button disabled className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed" title="Coming soon">
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate deal
                </button>
                <button disabled className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed border-t border-border" title="Coming soon">
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slim wizard rail */}
      <div className="px-8 pb-3">
        <div className="relative">
          {/* Baseline */}
          <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-border -translate-y-1/2" />
          <div
            className="absolute left-3 top-1/2 h-0.5 bg-primary -translate-y-1/2 transition-all duration-300"
            style={{ width: `calc(${stepProgress}% * (100% - 24px) / 100%)` }}
          />
          <div className="relative flex items-center justify-between">
            {STEPS.map((step) => {
              const isDone = step.num < currentStep;
              const isActive = step.num === currentStep;
              return (
                <button
                  key={step.num}
                  onClick={() => navigateToStep(step.num)}
                  className="group relative flex flex-col items-center gap-1.5"
                  title={`Step ${step.num}: ${step.label}`}
                >
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all border-2 bg-background",
                      isActive && "border-primary text-primary scale-110 shadow-sm",
                      isDone && "border-primary bg-primary text-primary-foreground",
                      !isActive && !isDone && "border-border text-muted-foreground group-hover:border-foreground/40 group-hover:text-foreground"
                    )}
                  >
                    {isDone ? <Check className="w-3 h-3" /> : step.num}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium whitespace-nowrap transition-colors",
                      isActive ? "text-primary" : isDone ? "text-foreground/70" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ deal }: { deal: any }) {
  const { data: pricingLines } = useDealPricing(deal.id);
  const { data: scopeItems } = useDealScopeItems(deal.id);
  const { data: approvals } = useDealApprovals(deal.id);

  const lines = pricingLines || [];
  const items = scopeItems || [];

  // Totals (single source of truth: pricing lines)
  const sumFee = lines.reduce((s: number, l: any) => s + parseFloat(l.fee || 0), 0);
  const sumCost = lines.reduce((s: number, l: any) => s + parseFloat(l.cost || 0), 0);
  const sumHours = lines.reduce((s: number, l: any) => s + parseFloat(l.hours || 0), 0);
  const marginPct = sumFee > 0 ? ((sumFee - sumCost) / sumFee) * 100 : 0;
  const effRate = sumHours > 0 ? sumFee / sumHours : 0;
  const targetMargin = 35;
  const vsTarget = marginPct - targetMargin;

  // Calc parity: Σ line fees vs deal.totalFee
  const dealTotalFee = parseFloat(deal.totalFee || "0");
  const calcParity = Math.abs(sumFee - dealTotalFee) < 1;

  // Scope summary: group billable items by code prefix and allocate fee proportionally to total scope hours.
  const billable = items.filter((si: any) => !si.scopeItem?.isAssembly);
  const itemHours = (si: any) =>
    parseFloat(si.adjustedHours || 0) * parseFloat(si.complexityMultiplier || 1) * (si.quantity || 1);
  const totalScopeHours = billable.reduce((s: number, si: any) => s + itemHours(si), 0);
  const groupLabels: Record<string, string> = {
    IMPL: "Implementation",
    TEST: "Testing & QA",
    PMO: "Project Management",
    TRN: "Training & Enablement",
    OTHER: "Other",
  };
  const groupOrder = ["IMPL", "TEST", "PMO", "TRN"];
  const groups: Record<string, { label: string; hours: number; fee: number; count: number }> = {};
  billable.forEach((si: any) => {
    const code: string = si.scopeItem?.code || "OTHER";
    const prefix = code.includes("-") ? code.split("-")[0] : "OTHER";
    if (!groups[prefix]) groups[prefix] = { label: groupLabels[prefix] || prefix, hours: 0, fee: 0, count: 0 };
    const h = itemHours(si);
    groups[prefix].hours += h;
    groups[prefix].fee += totalScopeHours > 0 ? (h / totalScopeHours) * sumFee : 0;
    groups[prefix].count += 1;
  });
  const orderedGroups = [
    ...groupOrder.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !groupOrder.includes(g)).sort(),
  ];
  const scopeTotal = Object.values(groups).reduce((s, g) => s + g.fee, 0);

  // Validation checklist — every check is wired to live business logic via the
  // shared POLICY module so the UI can never disagree with server enforcement.
  const requiredFieldsOk = !!(deal.client?.name && deal.dealType && deal.serviceLine && deal.businessUnit && deal.startDate && deal.endDate && deal.pdlName);
  const ratesAssigned = lines.length > 0 && lines.every((l: any) => parseFloat(l.rate || 0) > 0);
  const crmLinked = !!deal.dynamicsLink?.opportunityNumber;
  const marginOk = marginPct >= targetMargin;
  const plTrigger = evaluatePracticeLeadTrigger({ totalFee: sumFee, marginPercent: marginPct, scopeItemCount: billable.length });
  const isNewClient = (deal.dealType || "").toLowerCase() === "new";

  type Check = { ok: boolean | "warn" | "info"; label: string };
  const checks: Check[] = [
    { ok: calcParity, label: `Calc parity verified${calcParity ? "" : ` (off by ${formatCurrency(Math.abs(sumFee - dealTotalFee))})`}` },
    { ok: requiredFieldsOk, label: "Required fields complete" },
    { ok: marginOk, label: `Margin above BU target (${targetMargin}%)` },
    { ok: ratesAssigned, label: `Rate table assigned${lines.length > 0 ? ` (${lines.length} roles)` : ""}` },
    { ok: crmLinked, label: crmLinked ? `CRM opportunity linked (${deal.dynamicsLink.opportunityNumber})` : "CRM opportunity not yet linked" },
    plTrigger.required
      ? { ok: "warn" as const, label: `${plTrigger.reason} — Practice Lead approval required` }
      : { ok: true as const, label: "Within auto-approval thresholds" },
    isNewClient
      ? { ok: "info" as const, label: "New client — QRM notification sent" }
      : { ok: "info" as const, label: "Existing client — no QRM notification required" },
  ];
  const blockers = checks.filter((c) => c.ok === false).length;

  // Approval routing preview
  const pendingApproval = (approvals || []).find((a: any) => a.status === "pending");
  const approvedApproval = (approvals || []).find((a: any) => a.status === "approved");
  const stages = [
    { label: "PDL Submit", sub: deal.pdlName || "PDL", state: "done" as const },
    {
      label: "Practice Lead Review",
      sub: pendingApproval?.approverName || approvedApproval?.approverName || "D. Martinez",
      state: approvedApproval ? ("done" as const) : pendingApproval ? ("active" as const) : ("pending" as const),
    },
    { label: "BU Approval", sub: "Pending", state: approvedApproval ? ("active" as const) : ("pending" as const) },
    { label: "CRM Push", sub: "Auto", state: "pending" as const },
  ];

  return (
    <div className="space-y-6">
      {/* Calc Parity pill — top right */}
      <div className="flex items-center justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border",
            calcParity
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
          )}
        >
          {calcParity ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          Calc Parity: {calcParity ? "Verified" : "Mismatch"}
        </span>
      </div>

      {/* Hero card */}
      <div className="card p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-foreground tracking-tight truncate">{deal.client?.name || deal.title}</h2>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {[deal.serviceLine, deal.businessUnit, billable.length ? `${billable.length} scope items` : null, deal.dealType ? `${deal.dealType.charAt(0).toUpperCase() + deal.dealType.slice(1)} Project` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 lg:justify-end">
            <ReviewKpi label="Total Fees" value={formatCurrency(sumFee)} />
            <ReviewKpi label="Margin" value={`${marginPct.toFixed(1)}%`} tone={marginOk ? "success" : "warning"} />
            <ReviewKpi label="Hours" value={formatNumber(sumHours)} />
            <ReviewKpi label="Eff. Rate" value={effRate > 0 ? `${formatCurrency(effRate)}` : "—"} tone="primary" />
            <ReviewKpi
              label="vs Target"
              value={`${vsTarget >= 0 ? "↑ +" : "↓ "}${vsTarget.toFixed(1)}%`}
              tone={vsTarget >= 0 ? "success" : "danger"}
            />
          </div>
        </div>
      </div>

      {/* Scope summary + Validation checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Scope Summary</h3>
          </div>
          {orderedGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No scope items added yet.</p>
          ) : (
            <div className="space-y-1">
              {orderedGroups.map((key) => {
                const g = groups[key];
                return (
                  <div key={key} className="flex items-baseline justify-between py-2 border-b border-border last:border-b-0">
                    <div className="flex items-baseline gap-3 min-w-0">
                      <span className="text-xs font-mono font-semibold text-primary">{key}</span>
                      <span className="text-sm text-foreground truncate">{g.label}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">· {g.count} {g.count === 1 ? "item" : "items"} · {formatNumber(g.hours)} hrs</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(g.fee)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-foreground/80">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-base font-bold text-foreground tabular-nums">{formatCurrency(scopeTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Validation Checklist</h3>
            {blockers > 0 ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {blockers} blocker{blockers > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Ready
              </span>
            )}
          </div>
          <ul className="space-y-2.5">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                {c.ok === true && <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
                {c.ok === false && <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
                {c.ok === "warn" && <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
                {c.ok === "info" && <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                <span className={cn(
                  "leading-snug",
                  c.ok === true && "text-foreground",
                  c.ok === false && "text-rose-700",
                  c.ok === "warn" && "text-primary",
                  c.ok === "info" && "text-muted-foreground",
                )}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Approval routing preview */}
      <div className="card p-6">
        <h3 className="text-base font-semibold text-foreground mb-5">Approval Routing Preview</h3>
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {stages.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex flex-col items-center min-w-[120px]">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2",
                  s.state === "done" && "bg-emerald-600 text-white border-emerald-600",
                  s.state === "active" && "bg-primary text-primary-foreground border-primary",
                  s.state === "pending" && "bg-muted text-muted-foreground border-border",
                )}>
                  {s.state === "done" ? <CheckCircle className="w-5 h-5" /> : s.state === "active" ? <ChevronRight className="w-5 h-5" /> : i + 1}
                </div>
                <p className={cn(
                  "text-xs font-semibold mt-2 text-center whitespace-nowrap",
                  s.state === "done" && "text-foreground",
                  s.state === "active" && "text-primary",
                  s.state === "pending" && "text-muted-foreground",
                )}>{s.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 text-center whitespace-nowrap">{s.sub}</p>
              </div>
              {i < stages.length - 1 && (
                <div className="flex-1 flex items-center pt-5 min-w-[40px]">
                  <div className={cn(
                    "h-0.5 w-full",
                    stages[i + 1].state !== "pending" || s.state === "done" ? "bg-primary/60" : "border-t border-dashed border-border bg-transparent"
                  )} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewKpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "primary" }) {
  return (
    <div className="text-right min-w-[80px]">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className={cn(
        "text-xl font-bold mt-0.5 tabular-nums",
        tone === "default" && "text-foreground",
        tone === "success" && "text-emerald-600",
        tone === "warning" && "text-amber-600",
        tone === "danger" && "text-rose-600",
        tone === "primary" && "text-primary",
      )}>{value}</p>
    </div>
  );
}

function ApprovalStep({ deal }: { deal: any }) {
  const { data: approvals } = useDealApprovals(deal.id);
  const submitApproval = useSubmitApproval();
  const updateApproval = useUpdateApproval();
  const { hasPermission, persona } = useAuth();
  const [reviewComment, setReviewComment] = useState("");
  const canApprove = hasPermission("approveDeals");

  const handleDecision = (approvalId: number, status: "approved" | "rejected") => {
    updateApproval.mutate({
      id: approvalId,
      data: {
        status,
        comments: reviewComment || `${status === "approved" ? "Approved" : "Rejected"} by ${persona?.name || "Reviewer"}`,
      },
    });
    setReviewComment("");
  };

  const { data: screening } = useDealIntappScreening(deal.id);
  const runScreen = useRunIntappScreening();
  const blocked = screening?.result === "conflict";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <IntappCompliancePanel deal={deal} />
      <WorkdayDealPanel deal={deal} />
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Approval Status</h2>
        {(approvals || []).length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No approval requests submitted yet.</p>
            {hasPermission("editDeals") && (
              <button
                disabled={blocked}
                title={blocked ? "Resolve the Intapp conflict above before submitting." : ""}
                className="btn-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                onClick={() => {
                  if (!screening) runScreen.mutate({ dealId: deal.id, userName: persona?.name });
                  submitApproval.mutate({ dealId: deal.id, data: { approverName: "Practice Leader", approverRole: "Service Line Lead", status: "pending", notes: "Auto-submitted for review", submittedBy: persona?.name } });
                }}>
                {blocked && <ShieldAlert className="w-4 h-4" />}
                {blocked ? "Blocked by Intapp conflict" : "Submit for Approval"}
              </button>
            )}
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
                  <div className="bg-muted/50 rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Comments</p>
                    <p className="text-sm text-foreground">{approval.comments}</p>
                  </div>
                )}

                {canApprove && approval.status === "pending" && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <label className="label mb-2">Review Comments (optional)</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="input-field min-h-[80px] resize-y mb-3"
                      placeholder="Add comments about your decision..."
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDecision(approval.id, "approved")}
                        disabled={updateApproval.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve Deal
                      </button>
                      <button
                        onClick={() => handleDecision(approval.id, "rejected")}
                        disabled={updateApproval.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject Deal
                      </button>
                    </div>
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
      <div className="flex gap-3 justify-end">
        <a
          href={`/api/deals/${deal.id}/proposal`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Generate Proposal
        </a>
        <Link href={`/deals/${deal.id}/change-orders`}>
          <button className="px-4 py-2 rounded-lg border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-all flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Change Orders
          </button>
        </Link>
      </div>
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

// ============ INTAPP COMPLIANCE PANEL ============
// Suggested mitigation actions per Intapp hit type. Used as quick-pick chips
// in the per-hit mitigation modal so QRM doesn't have to retype boilerplate
// for the most common compliance clearances.
const HIT_ACTION_PRESETS: Record<string, string[]> = {
  sanctions_watchlist: [
    "Enhanced Due Diligence (EDD) file completed and attached",
    "OFAC false-positive confirmed by Compliance",
    "Engagement declined — client offboarded",
  ],
  pep: [
    "PEP source-of-wealth verified; EDD on file",
    "QRM Lead sign-off obtained",
  ],
  industry_restriction: [
    "Partner sponsor confirmed and recorded",
    "Independence clearance obtained from QRM",
  ],
  independence: [
    "Independence checklist validated with QRM",
    "Engagement partner rotated per policy",
  ],
  conflict_of_interest: [
    "Conflict waiver letter received from both clients",
    "Information barrier (ethical wall) established",
  ],
  regulatory_review: [
    "Regulatory due-diligence questionnaire attached",
  ],
  fee_threshold: [
    "Practice Partner concurrence recorded",
    "QRM Lead concurrent review completed",
  ],
};

function IntappCompliancePanel({ deal }: { deal: any }) {
  const { data: screening, isLoading } = useDealIntappScreening(deal.id);
  const runScreen = useRunIntappScreening();
  const override = useIntappOverride();
  const updateMit = useUpdateIntappMitigation();
  const addMit = useAddIntappMitigation();
  const { persona } = useAuth();
  const [showOverride, setShowOverride] = useState(false);
  const [justification, setJustification] = useState("");
  // Per-hit mitigation modal state. `mitHitId === null` means the modal is
  // open for a "general" mitigation not tied to a specific hit.
  const [mitModalHitId, setMitModalHitId] = useState<number | null | undefined>(undefined);
  const [mitAction, setMitAction] = useState("");
  const [mitNotes, setMitNotes] = useState("");
  const [mitResolve, setMitResolve] = useState(true);
  const isQRM = persona?.role === "qrm";
  const canMitigate = ["qrm", "pdl", "sll"].includes(persona?.role || "");

  const closeMitModal = () => {
    setMitModalHitId(undefined);
    setMitAction(""); setMitNotes(""); setMitResolve(true);
  };
  const openMitModal = (hitId: number | null, presetAction?: string) => {
    setMitModalHitId(hitId);
    setMitAction(presetAction || "");
    setMitNotes("");
    setMitResolve(true);
  };

  if (isLoading) {
    return (
      <div className="card p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking Intapp Risk &amp; Compliance...
      </div>
    );
  }

  if (!screening) {
    return (
      <div className="card p-5 border-amber-200 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">No Intapp screening on file</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Run a conflicts/sanctions/PEP/independence screening before submitting this deal for approval.
            </p>
          </div>
          <button onClick={() => runScreen.mutate({ dealId: deal.id, userName: persona?.name })}
            disabled={runScreen.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
            {runScreen.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Run screening
          </button>
        </div>
      </div>
    );
  }

  const isBlocked = screening.result === "conflict";
  const isOverridden = screening.result === "override_approved";
  const isClear = screening.result === "clear";
  const isReview = screening.result === "review";
  const isMitigated = screening.result === "mitigated";

  const allHits: any[] = screening.hits || [];
  const allMits: any[] = screening.mitigations || [];
  const mitsByHit = new Map<number, any[]>();
  const orphanMits: any[] = [];
  for (const m of allMits) {
    if (m.hitId == null) orphanMits.push(m);
    else {
      const arr = mitsByHit.get(m.hitId) || [];
      arr.push(m);
      mitsByHit.set(m.hitId, arr);
    }
  }
  const isHitResolved = (h: any) =>
    (mitsByHit.get(h.id) || []).some(m => m.status === "resolved" || m.status === "completed");
  const openHitCount = allHits.filter(h => !isHitResolved(h)).length;

  const banner = isBlocked
    ? { cls: "border-red-200 bg-red-50/60", icon: <ShieldAlert className="w-5 h-5 text-red-700" />, title: "Submission BLOCKED — Intapp conflict detected" }
    : isOverridden
      ? { cls: "border-violet-200 bg-violet-50/60", icon: <Unlock className="w-5 h-5 text-violet-700" />, title: "QRM override applied — proceed with documented justification" }
      : isMitigated
        ? { cls: "border-sky-200 bg-sky-50/60", icon: <ShieldCheck className="w-5 h-5 text-sky-700" />, title: `Mitigated — all ${allHits.length} hit(s) cleared with documented mitigations` }
        : isReview
          ? { cls: "border-amber-200 bg-amber-50/60", icon: <ShieldAlert className="w-5 h-5 text-amber-700" />, title: "Review required — mitigations recommended" }
          : isClear
            ? { cls: "border-emerald-200 bg-emerald-50/60", icon: <ShieldCheck className="w-5 h-5 text-emerald-700" />, title: "Cleared by Intapp — no compliance issues" }
            : { cls: "border-stone-200 bg-stone-50", icon: <Shield className="w-5 h-5 text-stone-600" />, title: "Screening pending" };

  const handleOverride = () => {
    if (justification.trim().length < 10) return;
    override.mutate({ dealId: deal.id, justification, userName: persona?.name, userRole: persona?.role });
    setJustification("");
    setShowOverride(false);
  };

  return (
    <div className={`card p-5 border ${banner.cls}`}>
      <div className="flex items-start gap-3 mb-3">
        {banner.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{banner.title}</h3>
            <IntappResultBadge result={screening.result} />
            <IntappRiskBadge tier={screening.riskTier} />
            <IntappSourceBadge source={screening.source} />
            {screening.externalRef && <span className="text-[10px] font-mono text-muted-foreground">{screening.externalRef}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-line">{screening.narrative}</p>
        </div>
        <button onClick={() => runScreen.mutate({ dealId: deal.id, userName: persona?.name })}
          disabled={runScreen.isPending}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50">
          {runScreen.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-screen
        </button>
      </div>

      {allHits.length > 0 && (
        <div className="space-y-2 mt-3 pt-3 border-t border-stone-200/60">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Findings ({allHits.length - openHitCount}/{allHits.length} mitigated)
            </div>
          </div>
          {allHits.map((h: any) => {
            const hitMits = mitsByHit.get(h.id) || [];
            const resolved = isHitResolved(h);
            return (
              <div key={h.id} className={cn("p-3 rounded-md text-xs",
                resolved
                  ? "bg-emerald-50 border border-emerald-100"
                  : h.severity === "high"
                    ? "bg-red-50 border border-red-100"
                    : h.severity === "medium"
                      ? "bg-amber-50 border border-amber-100"
                      : "bg-stone-50 border border-stone-200"
              )}>
                <div className="flex items-center gap-2 flex-wrap">
                  {resolved && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                  <span className="font-semibold text-foreground capitalize">{h.hitType.replace(/_/g, " ")}</span>
                  <IntappRiskBadge tier={h.severity} />
                  {resolved && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700">
                      Mitigated
                    </span>
                  )}
                  {h.matchedEntity && <span className="text-muted-foreground">· {h.matchedEntity}</span>}
                  {h.externalRef && <span className="text-[10px] font-mono text-muted-foreground">{h.externalRef}</span>}
                  {canMitigate && !resolved && (
                    <button onClick={() => openMitModal(h.id)}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                      <Plus className="w-3 h-3" /> Mitigate
                    </button>
                  )}
                </div>
                <p className="text-muted-foreground mt-1">{h.description}</p>
                <p className="text-foreground mt-1"><span className="font-medium">Recommendation:</span> {h.recommendation}</p>

                {hitMits.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-stone-200/70 space-y-1">
                    {hitMits.map((m: any) => {
                      const done = m.status === "resolved" || m.status === "completed";
                      return (
                        <div key={m.id} className="flex items-start gap-2 text-[11px] text-foreground">
                          {done
                            ? <CheckCircle className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                            : <Clock className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div><span className="font-medium">{m.action}</span>
                              {m.notes && <span className="text-muted-foreground"> — {m.notes}</span>}
                            </div>
                            <div className="text-muted-foreground text-[10px]">
                              {done && m.resolvedBy
                                ? `Resolved by ${m.resolvedBy}${m.resolvedAt ? ` · ${new Date(m.resolvedAt).toLocaleDateString()}` : ""}`
                                : `Pending · logged ${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}`}
                            </div>
                          </div>
                          {!done && canMitigate && (
                            <button
                              onClick={() => updateMit.mutate({ id: m.id, dealId: deal.id, status: "resolved" } as any)}
                              disabled={updateMit.isPending}
                              className="text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-50">
                              Mark resolved
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {orphanMits.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-200/60">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            General mitigations (not tied to a specific hit)
          </div>
          {orphanMits.map((m: any) => {
            const done = m.status === "resolved" || m.status === "completed";
            return (
              <div key={m.id} className="text-xs text-foreground py-1 flex items-center gap-2">
                {done ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-amber-600" />}
                <span className="font-medium">{m.action}</span>
                {m.notes && <span className="text-muted-foreground">— {m.notes}</span>}
                {m.resolvedBy && <span className="text-muted-foreground">— by {m.resolvedBy}</span>}
                {!done && canMitigate && (
                  <button
                    onClick={() => updateMit.mutate({ id: m.id, dealId: deal.id, status: "resolved" } as any)}
                    disabled={updateMit.isPending}
                    className="ml-auto text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-50">
                    Mark resolved
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canMitigate && allHits.length === 0 && (
        <div className="mt-3 pt-3 border-t border-stone-200/60">
          <button onClick={() => openMitModal(null)}
            className="text-[11px] font-medium text-primary hover:underline">
            + Add general mitigation note
          </button>
        </div>
      )}

      {mitModalHitId !== undefined && canMitigate && (
        <MitigationModal
          hit={mitModalHitId == null ? null : allHits.find(h => h.id === mitModalHitId) || null}
          action={mitAction}
          setAction={setMitAction}
          notes={mitNotes}
          setNotes={setMitNotes}
          resolve={mitResolve}
          setResolve={setMitResolve}
          presets={
            mitModalHitId != null
              ? (HIT_ACTION_PRESETS[(allHits.find(h => h.id === mitModalHitId) || {}).hitType] || [])
              : []
          }
          submitting={addMit.isPending}
          onCancel={closeMitModal}
          onSubmit={() => {
            if (mitAction.trim().length < 3) return;
            addMit.mutate({
              screeningId: screening.id,
              dealId: deal.id,
              hitId: mitModalHitId ?? undefined,
              action: mitAction,
              notes: mitNotes,
              status: mitResolve ? "resolved" : "pending",
            } as any, { onSuccess: closeMitModal });
          }}
        />
      )}

      {isBlocked && isQRM && (
        <div className="mt-4 pt-3 border-t border-red-200">
          {!showOverride ? (
            <button onClick={() => setShowOverride(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700">
              <Unlock className="w-3.5 h-3.5" /> QRM override
            </button>
          ) : (
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Justification (audit-logged, required)</label>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)}
                className="w-full min-h-[80px] px-3 py-2 border border-stone-300 rounded-md text-sm resize-y focus:outline-none focus:border-primary"
                placeholder="Document the partner concurrence, mitigation actions, and policy basis for the override..." />
              <div className="flex items-center gap-2">
                <button onClick={handleOverride} disabled={justification.trim().length < 10 || override.isPending}
                  className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50">
                  Apply override
                </button>
                <button onClick={() => { setShowOverride(false); setJustification(""); }}
                  className="px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {isBlocked && !isQRM && (
        <div className="mt-3 pt-3 border-t border-red-200 text-xs text-muted-foreground">
          Switch to a QRM persona (e.g., David Kim) to apply an override, or attach mitigations from the Intapp admin page.
        </div>
      )}
    </div>
  );
}

function MitigationModal({
  hit, action, setAction, notes, setNotes, resolve, setResolve,
  presets, submitting, onCancel, onSubmit,
}: {
  hit: any | null;
  action: string; setAction: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  resolve: boolean; setResolve: (v: boolean) => void;
  presets: string[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-lg shadow-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              {hit ? "Log mitigation for hit" : "Log general mitigation"}
            </h3>
          </div>
          {hit && (
            <div className="mt-2 p-2.5 rounded-md bg-stone-50 border border-stone-200 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground capitalize">{hit.hitType.replace(/_/g, " ")}</span>
                <IntappRiskBadge tier={hit.severity} />
                {hit.matchedEntity && <span className="text-muted-foreground">· {hit.matchedEntity}</span>}
              </div>
              <p className="text-muted-foreground mt-1">{hit.description}</p>
              <p className="text-foreground mt-1"><span className="font-medium">Recommendation:</span> {hit.recommendation}</p>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {presets.length > 0 && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Suggested actions</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {presets.map(p => (
                  <button key={p} type="button" onClick={() => setAction(p)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-md border transition-colors",
                      action === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
                    )}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Mitigation action *</label>
            <input type="text" value={action} onChange={(e) => setAction(e.target.value)}
              placeholder="e.g., Obtained partner concurrence; EDD on file"
              className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Document evidence, file references, or partner sign-offs"
              className="mt-1 w-full min-h-[70px] px-3 py-2 border border-stone-300 rounded-md text-sm resize-y focus:outline-none focus:border-primary" />
          </div>

          <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)}
              className="mt-0.5" />
            <span>
              <span className="font-medium">Mark this hit as resolved.</span>
              <span className="text-muted-foreground"> When every hit on the screening has a resolved mitigation, the screening auto-transitions to <span className="font-semibold">Mitigated</span> and submission unblocks.</span>
            </span>
          </label>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={submitting || action.trim().length < 3}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {resolve ? "Save & resolve hit" : "Save mitigation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkdayDealPanel({ deal }: { deal: any }) {
  const { data: latest, isLoading } = useWorkdayLatestValidation(deal.id);
  const { data: costCenters = [] } = useWorkdayCostCenters();
  const runValidation = useRunWorkdayValidation();
  const link = useLinkWorkdayCostCenter();
  const override = useOverrideWorkdayValidation();
  const { persona } = useAuth();
  const [justification, setJustification] = useState("");
  const [showLink, setShowLink] = useState(false);

  const canOverride = persona?.role === "fin" || persona?.role === "sll";
  const status = latest?.status || "unvalidated";
  const isBlocker = status === "over_budget" || status === "staffing_shortfall";
  const isWarning = status === "rate_variance";
  const isOverridden = !!latest?.overriddenBy;

  const tone =
    isOverridden ? "border-amber-300 bg-amber-50"
    : isBlocker ? "border-red-300 bg-red-50"
    : isWarning ? "border-amber-300 bg-amber-50"
    : status === "clean" ? "border-emerald-300 bg-emerald-50"
    : "border-stone-200 bg-stone-50";

  const Icon = isBlocker ? XCircle : isWarning ? AlertTriangle : status === "clean" ? CheckCircle : Clock;
  const iconColor = isBlocker ? "text-red-600" : isWarning || isOverridden ? "text-amber-700" : status === "clean" ? "text-emerald-600" : "text-stone-500";

  const cc = latest?.costCenter;
  const headroom = latest?.budgetHeadroom != null ? parseFloat(latest.budgetHeadroom) : null;
  const usedPct = latest?.budgetUsedPct != null ? parseFloat(latest.budgetUsedPct) : null;

  return (
    <div className={`card border ${tone} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 ${iconColor}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Workday Validation</h3>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Source · Simulation</span>
              {isOverridden && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Override on file</span>}
            </div>
            <p className="text-sm text-foreground mt-0.5">
              {isLoading ? "Loading…" : latest?.summary || "No validation has been run yet."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => runValidation.mutate({ dealId: deal.id, userName: persona?.name })}
            disabled={runValidation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-medium hover:bg-stone-50 disabled:opacity-50">
            {runValidation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-run
          </button>
          <button onClick={() => setShowLink(!showLink)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-medium hover:bg-stone-50">
            <GitBranch className="w-3.5 h-3.5" />
            {cc ? "Re-link" : "Link Cost Center"}
          </button>
        </div>
      </div>

      {showLink && (
        <div className="rounded-md bg-white border border-stone-200 p-3">
          <label className="label">Workday Cost Center</label>
          <select className="input-field"
            defaultValue={deal.workdayCostCenterId || ""}
            onChange={(e) => {
              const v = e.target.value ? parseInt(e.target.value) : null;
              link.mutate({ dealId: deal.id, costCenterId: v, userName: persona?.name }, { onSuccess: () => setShowLink(false) });
            }}>
            <option value="">— Unlinked —</option>
            {costCenters.map((c: any) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.businessUnit || "—"})</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-white border border-stone-200 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Cost Center</p>
          {cc ? (
            <>
              <p className="text-sm font-semibold text-foreground mt-0.5">{cc.code}</p>
              <p className="text-xs text-muted-foreground truncate">{cc.name}</p>
            </>
          ) : <p className="text-sm text-muted-foreground mt-1">Not linked</p>}
        </div>
        <div className="rounded-md bg-white border border-stone-200 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Budget Headroom</p>
          {headroom != null ? (
            <>
              <p className={`text-sm font-bold mt-0.5 ${headroom < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(headroom)}</p>
              {usedPct != null && (
                <div className="mt-1 h-1 rounded-full bg-stone-100 overflow-hidden">
                  <div className={`h-full ${usedPct > 100 ? "bg-red-500" : usedPct > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                </div>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground mt-1">—</p>}
        </div>
        <div className="rounded-md bg-white border border-stone-200 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Findings</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{latest?.findings?.length || 0}</p>
          <p className="text-xs text-muted-foreground">
            {latest?.findings?.filter((f: any) => f.severity === "blocker").length || 0} blocker · {latest?.findings?.filter((f: any) => f.severity === "warning").length || 0} warn
          </p>
        </div>
      </div>

      {latest?.findings && latest.findings.length > 0 && (
        <div className="space-y-1.5">
          {latest.findings.map((f: any) => (
            <div key={f.id} className={`text-xs p-2 rounded border ${
              f.severity === "blocker" ? "bg-red-50 border-red-200 text-red-800"
              : f.severity === "warning" ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-white border-stone-200 text-stone-700"}`}>
              <span className="font-semibold uppercase tracking-wider mr-2">{f.findingType}</span>{f.message}
            </div>
          ))}
        </div>
      )}

      {isBlocker && !isOverridden && (
        <div className="border-t border-stone-200 pt-3">
          <p className="text-xs font-semibold text-red-700 mb-1">⚠️ Approval submission is blocked until this validation passes or is overridden.</p>
          <label className="label">Override Justification</label>
          <textarea className="input-field min-h-[60px]" value={justification} onChange={(e) => setJustification(e.target.value)}
            placeholder="Required if Finance or Service Line Lead waives the block (≥5 chars)." />
          {!canOverride && <p className="text-xs text-red-600 mt-1">Only Finance or Service Line Lead can override.</p>}
          <button disabled={!canOverride || justification.trim().length < 5 || override.isPending}
            className="btn-primary mt-2 text-xs disabled:opacity-50"
            onClick={() => override.mutate({ id: latest.id, justification, userName: persona?.name, role: persona?.role }, { onSuccess: () => setJustification("") })}>
            {override.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Apply Override"}
          </button>
        </div>
      )}
      {isOverridden && (
        <div className="border-t border-stone-200 pt-3 text-xs">
          <p className="font-semibold text-amber-900">Override applied by {latest.overriddenBy}</p>
          <p className="text-amber-800 mt-0.5">"{latest.overrideJustification}"</p>
        </div>
      )}
    </div>
  );
}
