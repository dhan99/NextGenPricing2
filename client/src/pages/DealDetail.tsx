import React, { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useDeal, useUpdateDeal, useScopeCatalog, useScopeTemplates, useApplyScopeTemplate, useErpRescale, useDealScopeItems, useAddScopeItem, useRemoveScopeItem, useRoles, useDealPricing, useUpdatePricingLine, useDealScenarios, useSelectScenario, useDealApprovals, useSubmitApproval, useUpdateApproval, useDealPrompts, useUpdatePrompt, useEngagementInputSpec, useAIDealSimilarity, useAIEffortEstimation, useAIMarginAdvisor, useAIScenarioRecommendation, useAIRiskSummary, useDealIntappScreening, useRunIntappScreening, useIntappOverride, useAddIntappMitigation, useUpdateIntappMitigation, useWorkdayLatestValidation, useWorkdayCostCenters, useRunWorkdayValidation, useLinkWorkdayCostCenter, useOverrideWorkdayValidation, usePromptSets, useCongaTemplates, useDealEngagementLetters, useGenerateEngagementLetter, useAgentApproveDeal, useAgentDiscardDeal, useAgentOpenWizard, useAgentResubmit, useDealMarginTarget, openProtectedDoc } from "@/hooks/use-api";
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
  { num: 6, label: "Approve" },
  { num: 7, label: "Summary" },
];

export function DealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = parseInt(params?.id || "0");
  const { data: deal, isLoading } = useDeal(dealId);
  const { data: approvalsForGating } = useDealApprovals(dealId);
  const [currentStep, setCurrentStep] = useState(1);
  const { hasPermission, persona } = useAuth();
  const qc = useQueryClient();
  const [reviewBlockers, setReviewBlockers] = useState(0);
  const [reviewOverride, setReviewOverride] = useState(false);
  const reviewBlocked = currentStep === 5 && reviewBlockers > 0 && !reviewOverride;
  const isAgentDraft = deal?.status === "pendingReviewAgent";
  const summaryUnlocked = (approvalsForGating || []).length > 0 || isAgentDraft;
  const summaryGated = currentStep === 6 && !summaryUnlocked;
  const advanceBlocked = reviewBlocked || summaryGated;

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
      <DealBanner deal={deal} currentStep={currentStep} navigateToStep={navigateToStep} summaryUnlocked={summaryUnlocked} />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <SendBackHistoryBanner deal={deal} />
        {currentStep === 1 && <SetupStep deal={deal} />}
        {currentStep === 2 && <ScopeStep deal={deal} />}
        {currentStep === 3 && <AssumptionsStep deal={deal} />}
        {currentStep === 4 && <PricingStep deal={deal} />}
        {currentStep === 5 && <ReviewStep deal={deal} navigateToStep={navigateToStep} onReadiness={(b) => setReviewBlockers(b)} override={reviewOverride} setOverride={setReviewOverride} />}
        {currentStep === 6 && <ApprovalStep deal={deal} />}
        {currentStep === 7 && (summaryUnlocked
          ? (
            <div className="space-y-6">
              {isAgentDraft && <AgentDraftReviewBanner deal={deal} navigateToStep={navigateToStep} />}
              <SummaryStep deal={deal} />
            </div>
          )
          : <div className="max-w-2xl mx-auto card p-8 text-center">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-1">Summary locked</h2>
              <p className="text-sm text-muted-foreground mb-4">Submit this deal for approval to unlock the proposal summary.</p>
              <button onClick={() => navigateToStep(6)} className="btn-primary inline-flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Go to Approve
              </button>
            </div>)}

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

          <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <span>Step {currentStep} of {STEPS.length}</span>
            {summaryGated && (
              <span id="summary-gate-hint" className="text-[11px] font-medium text-amber-700 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Click Submit for Approval to unlock the Summary
              </span>
            )}
          </div>

          {isAgentDraft && currentStep === 7 && (
            <AgentResubmitButton dealId={deal.id} navigateToStep={navigateToStep} />
          )}
          {currentStep < STEPS.length ? (
            <button
              onClick={() => !advanceBlocked && navigateToStep(Math.min(STEPS.length, currentStep + 1))}
              disabled={advanceBlocked}
              aria-describedby={summaryGated ? "summary-gate-hint" : undefined}
              title={
                summaryGated
                  ? "Click Submit for Approval first to unlock the Summary."
                  : reviewBlocked
                    ? `Resolve ${reviewBlockers} blocker${reviewBlockers > 1 ? "s" : ""} or override to continue`
                    : undefined
              }
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                advanceBlocked
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
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
      {hasPermission("runAI") && (
        <AskDealPadAI context={{
          screen: STEP_KEYS[currentStep] || "wizard-setup",
          screenLabel: `${STEPS[currentStep - 1]?.label || "Wizard"} · ${deal.dealNumber}`,
          dealId: deal.id,
          deal,
          extra: {
            overrideCount: (deal.pricingLines || []).filter((l: any) => l.rateOverridden).length,
            pricingLineCount: (deal.pricingLines || []).length,
          },
        }} />
      )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <select className={inputClass} value={form.serviceLine} onChange={(e) => setForm({ ...form, serviceLine: e.target.value })}>
                    <option value="">— Select service line —</option>
                    {["Tax-PHB", "Tax-Corporate", "Audit", "Risk Assurance", "Cloud Services", "Digital Transformation", "Compliance Consulting"].map((sl) => (
                      <option key={sl} value={sl}>{sl}</option>
                    ))}
                  </select>
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
                  <select className={inputClass} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                    <option value="">— Select region —</option>
                    {["West", "Central", "East", "National"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
  const erpRescale = useErpRescale();
  const estimation = useAIEffortEstimation();
  const isErpDeal = (deal.serviceLine || "") === "ERP Implementation";
  const ei: Record<string, any> = (deal.engagementInputs as any) || {};
  // Mirror server/erp-scaling.ts validateErpInputs so the Scope step can warn
  // BEFORE the user clicks Apply. Numeric fields must be present, integer,
  // and within range; modules must be a non-empty subset of the allowed set.
  const erpInputErrors: { field: string; message: string }[] = (() => {
    if (!isErpDeal) return [];
    const out: { field: string; message: string }[] = [];
    const ranges: Record<string, { min: number; max: number; label: string }> = {
      entities: { min: 1, max: 50, label: "Entities" },
      countries: { min: 1, max: 50, label: "Countries" },
      integrations: { min: 0, max: 100, label: "Integrations" },
      conversions: { min: 0, max: 200, label: "Data-conversion objects" },
      ricefw: { min: 0, max: 500, label: "RICEFW objects" },
    };
    for (const [k, r] of Object.entries(ranges)) {
      const v = ei[k];
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        out.push({ field: k, message: `${r.label} is required.` }); continue;
      }
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        out.push({ field: k, message: `${r.label} must be a whole number.` }); continue;
      }
      if (n < r.min || n > r.max) {
        out.push({ field: k, message: `${r.label} must be between ${r.min} and ${r.max}.` });
      }
    }
    const allowedMods = ["FI", "CO", "MM", "SD", "PP", "WM", "HR"];
    let mods: string[] = [];
    if (Array.isArray(ei.modules)) mods = ei.modules.map((x: any) => String(x).toUpperCase());
    else if (typeof ei.modules === "string" && ei.modules.trim() !== "")
      mods = ei.modules.split(/[,\s]+/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    if (mods.length === 0) out.push({ field: "modules", message: "Select at least one ERP module." });
    else {
      const bad = mods.filter((x) => !allowedMods.includes(x));
      if (bad.length) out.push({ field: "modules", message: `Unknown ERP module(s): ${bad.join(", ")}.` });
    }
    return out;
  })();
  const erpInputsValid = erpInputErrors.length === 0;
  const erpInputsSummary = (() => {
    if (!isErpDeal) return null;
    const ent = ei.entities ?? "1", ctr = ei.countries ?? "1";
    const mods = Array.isArray(ei.modules) ? ei.modules.join("/")
      : (typeof ei.modules === "string" && ei.modules.trim()) ? ei.modules.split(/[,\s]+/).filter(Boolean).join("/")
      : "FI/CO";
    return `${ent} entit${Number(ent) === 1 ? "y" : "ies"} · ${ctr} countr${Number(ctr) === 1 ? "y" : "ies"} · modules: ${mods} · ${ei.integrations ?? 0} integrations · ${ei.conversions ?? 0} conversions · ${ei.ricefw ?? 0} RICEFW`;
  })();
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
        {isErpDeal && !erpInputsValid && (
          <div className="rounded-xl border border-red-300 bg-red-50/70 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-900">Engagement inputs needed for ERP scaling</p>
              <p className="text-xs text-red-900/90 mt-0.5 leading-relaxed">
                Fill in the engagement inputs on the <span className="font-medium">Assumptions</span> step before applying the ERP template. Defaults are not used — applying without these would silently understate hours.
              </p>
              <ul className="mt-2 text-xs text-red-900/90 list-disc pl-5 space-y-0.5">
                {erpInputErrors.map((e) => (
                  <li key={e.field}>{e.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {isErpDeal && erpInputsValid && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">SAP Activate scaling</p>
              <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">
                Hours scale from engagement parameters (entities, countries, modules, integrations, conversions, RICEFW). Edit them in <span className="font-medium">Engagement Inputs</span> on the Assumptions step, then click below to re-apply.
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">{erpInputsSummary}</p>
              {erpRescale.isError && (
                <p className="text-[11px] text-red-700 mt-1.5">{(erpRescale.error as any)?.body?.detail || (erpRescale.error as any)?.message || "Re-scale failed."}</p>
              )}
            </div>
            <button
              onClick={() => erpRescale.mutate({ dealId: deal.id })}
              disabled={erpRescale.isPending}
              className="btn-primary text-sm shrink-0"
            >
              {erpRescale.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Re-scale items
            </button>
          </div>
        )}

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
                    {si.notes && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-block font-mono">{si.notes}</p>
                    )}
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
              {(templates || []).map((tpl: any) => {
                const isErpTpl = tpl.name === "ERP Implementation (S/4HANA)";
                const blockedByInputs = isErpTpl && !erpInputsValid;
                const disabled = applyTemplate.isPending || blockedByInputs;
                return (
                  <button
                    key={tpl.id}
                    disabled={disabled}
                    title={blockedByInputs ? "Fill in engagement inputs on the Assumptions step before applying the ERP template." : undefined}
                    onClick={() => {
                      if ((scopeItems || []).length > 0 && !confirm(`Add ${tpl.items?.length || 0} items from "${tpl.name}" to your scope?\n\nExisting items are kept; duplicates are skipped.`)) return;
                      applyTemplate.mutate({ dealId: deal.id, templateId: tpl.id });
                    }}
                    className="text-left p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                      <span className="text-xs text-muted-foreground">{tpl.items?.length || 0} items</span>
                    </div>
                    {tpl.description && <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>}
                    {tpl.serviceLine && <span className="badge bg-secondary text-secondary-foreground mt-2">{tpl.serviceLine}</span>}
                    {blockedByInputs && (
                      <p className="text-[11px] text-red-700 mt-2 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Fill engagement inputs first
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            {applyTemplate.isError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <p className="font-semibold">{(applyTemplate.error as any)?.body?.error || "Could not apply template."}</p>
                {(applyTemplate.error as any)?.body?.detail && (
                  <p className="mt-0.5">{(applyTemplate.error as any).body.detail}</p>
                )}
                {Array.isArray((applyTemplate.error as any)?.body?.errors) && (
                  <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                    {(applyTemplate.error as any).body.errors.map((e: any, i: number) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
              const qty = si.quantity ?? 1;
              const baseHrs = parseFloat(si.adjustedHours || si.scopeItem?.defaultHours || "0");
              const mult = parseFloat(si.complexityMultiplier || "1");
              return sum + baseHrs * qty * mult;
            }, 0);
            return (
              <>
                <div className="space-y-2.5">
                  {billable.map((si: any) => {
                    const qty = si.quantity ?? 1;
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              {f.type === "multiselect" ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((opt: string) => {
                    const selected = (() => {
                      const v = value;
                      if (Array.isArray(v)) return v.includes(opt);
                      return typeof v === "string" && v.split(/[,\s]+/).map(s => s.trim()).includes(opt);
                    })();
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          const cur: string[] = (() => {
                            const v = value;
                            if (Array.isArray(v)) return [...v];
                            if (typeof v === "string" && v.trim()) return v.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
                            return [];
                          })();
                          const next = selected ? cur.filter(x => x !== opt) : [...cur, opt];
                          const nextStr = next.join(",");
                          setField(f.key, nextStr);
                          commitField(f.key, nextStr);
                        }}
                        className={cn(
                          "px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:border-primary"
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : f.type === "select" ? (
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
              ) : f.type === "text" ? (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={(e) => commitField(f.key, e.target.value)}
                  disabled={updateDeal.isPending}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
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
    (s: number, i: any) => s + parseFloat(i.adjustedHours || 0) * parseFloat(i.complexityMultiplier || 1) * (i.quantity ?? 1),
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
  // Tax codes are namespaced as TAX-DIR-*, TAX-IND-*, TAX-TP-*, TAX-INT-*,
  // TAX-CON-*, TAX-MA-*, TAX-PMO-*. Re-bucket those by their second segment
  // so workstream subtotals appear in the panel for Complex Tax engagements.
  const taxGroups: Record<string, any[]> = {};
  Object.keys(groups).forEach((g) => {
    if (g === "TAX") {
      groups[g].forEach((it) => {
        const code: string = it.scopeItem?.code || it.code || "";
        const parts = code.split("-");
        const sub = parts.length >= 3 ? `TAX-${parts[1]}` : "TAX";
        if (!taxGroups[sub]) taxGroups[sub] = [];
        taxGroups[sub].push(it);
      });
      delete groups[g];
    }
  });
  Object.assign(groups, taxGroups);

  const groupOrder = [
    // SAP Activate phases — render in canonical order so reviewers see
    // Prepare → Explore → Realize → Deploy → Run for ERP deals.
    "ERPPREP", "ERPEXPL", "ERPRLZE", "ERPDPLY", "ERPRUN",
    "TAX-DIR", "TAX-IND", "TAX-TP", "TAX-INT", "TAX-CON", "TAX-MA", "TAX-PMO",
    "IMPL", "TEST", "PMO", "TRN",
  ];
  const orderedGroupKeys = [
    ...groupOrder.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !groupOrder.includes(g)).sort(),
  ];

  const groupLabel: Record<string, string> = {
    ERPPREP: "Prepare (SAP Activate)",
    ERPEXPL: "Explore (SAP Activate)",
    ERPRLZE: "Realize (SAP Activate)",
    ERPDPLY: "Deploy (SAP Activate)",
    ERPRUN: "Run (SAP Activate)",
    IMPL: "Implementation",
    TEST: "Testing & QA",
    PMO: "Project Management",
    TRN: "Training & Enablement",
    "TAX-DIR": "Direct Tax / Provision",
    "TAX-IND": "Indirect Tax",
    "TAX-TP":  "Transfer Pricing",
    "TAX-INT": "International / Pillar 2",
    "TAX-CON": "Tax Controversy",
    "TAX-MA":  "M&A Tax DD",
    "TAX-PMO": "Tax Engagement Mgmt",
    OTHER: "Other",
  };

  const allocatedHoursForCell = (itemHours: number, roleHours: number) =>
    totalScopeHours > 0 ? (itemHours / totalScopeHours) * roleHours : 0;

  const itemRowFee = (itemHours: number) =>
    lines.reduce((sum: number, l: any) => {
      const h = allocatedHoursForCell(itemHours, parseFloat(l.hours || 0));
      return sum + h * parseFloat(l.rate || 0);
    }, 0);

  const itemRowCost = (itemHours: number) =>
    lines.reduce((sum: number, l: any) => {
      const h = allocatedHoursForCell(itemHours, parseFloat(l.hours || 0));
      return sum + h * parseFloat(l.costRate || 0);
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
              const groupHours = groupItems.reduce((s, i) => s + parseFloat(i.adjustedHours || 0) * parseFloat(i.complexityMultiplier || 1) * (i.quantity ?? 1), 0);
              const groupFee = itemRowFee(groupHours);
              const groupCost = itemRowCost(groupHours);
              const groupMargin = groupFee - groupCost;
              const groupMarginPct = groupFee > 0 ? (groupMargin / groupFee) * 100 : 0;
              return (
                <React.Fragment key={`grp-${g}`}>
                  <tr className="bg-amber-50/40">
                    <td className="px-6 py-2 text-xs font-bold text-foreground uppercase tracking-wide" colSpan={2 + lines.length + 1}>
                      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                        <span className="text-primary">{g}</span>
                        <span className="text-muted-foreground normal-case font-medium">{groupLabel[g] || g}</span>
                        <span className="text-muted-foreground font-normal">· {groupItems.length} items · {formatNumber(groupHours)} hrs</span>
                        <span className="text-muted-foreground font-normal">· Fee {formatCurrency(groupFee)}</span>
                        <span className="text-muted-foreground font-normal">· Cost {formatCurrency(groupCost)}</span>
                        <span className={cn("font-semibold normal-case", groupMargin >= 0 ? "text-success" : "text-destructive")}>· Margin {formatCurrency(groupMargin)} ({groupMarginPct.toFixed(1)}%)</span>
                      </div>
                    </td>
                  </tr>
                  {groupItems.map((item: any) => {
                    const code = item.scopeItem?.code || "—";
                    const name = item.scopeItem?.name || "Unnamed";
                    const itemHours = parseFloat(item.adjustedHours || 0) * parseFloat(item.complexityMultiplier || 1) * (item.quantity ?? 1);
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

// =============================================================================
// RateCell — per-step rate override editor.
// Click to open a popover with: new rate input, justification textarea, plus
// "Save Override", "Reset to Standard", and "Cancel" actions. The cell shows
// the active rate plus a tiny baseline + variance subtitle when overridden.
// =============================================================================
function RateCell({ line, dealId, updateLine }: { line: any; dealId: number; updateLine: any }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const standardRate = parseFloat(line.standardRate ?? line.rate ?? "0");
  const currentRate = parseFloat(line.rate ?? "0");
  const variancePct = standardRate > 0 ? ((currentRate - standardRate) / standardRate * 100) : 0;
  const overridden = !!line.rateOverridden;

  const [draftRate, setDraftRate] = useState<string>(String(currentRate));
  const [draftReason, setDraftReason] = useState<string>(line.overrideReason || "");

  // Reset local draft whenever the popover opens or upstream rate changes.
  useEffect(() => {
    if (open) {
      setDraftRate(String(currentRate));
      setDraftReason(line.overrideReason || "");
    }
  }, [open, currentRate, line.overrideReason]);

  const submitOverride = () => {
    const newRate = parseFloat(draftRate || "0");
    if (!Number.isFinite(newRate) || newRate <= 0) return;
    const isOverride = Math.abs(newRate - standardRate) > 0.01;
    if (isOverride && draftReason.trim().length < 5) {
      // Force a meaningful justification on overrides — empty/short reasons
      // would defeat the audit trail this feature exists to provide.
      return;
    }
    updateLine.mutate({
      dealId,
      id: line.id,
      data: {
        hours: line.hours,
        rate: String(newRate),
        costRate: line.costRate,
        overrideReason: isOverride ? draftReason.trim() : null,
        overrideBy: isOverride ? (user?.name || "PDL") : null,
      },
    });
    setOpen(false);
  };

  const resetToStandard = () => {
    updateLine.mutate({
      dealId,
      id: line.id,
      data: {
        hours: line.hours,
        rate: String(standardRate),
        costRate: line.costRate,
        overrideReason: null,
        overrideBy: null,
      },
    });
    setOpen(false);
  };

  const varianceTone =
    !overridden ? "text-muted-foreground"
    : variancePct < 0 ? "text-emerald-700"
    : Math.abs(variancePct) > 10 ? "text-rose-700"
    : "text-amber-700";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex flex-col items-end gap-0.5 px-2 py-1 rounded transition-colors",
          "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30",
          overridden && "ring-1 ring-amber-300 bg-amber-50/80",
        )}
        title={overridden ? `Override of standard ${formatCurrency(standardRate)}/hr` : "Click to override rate"}
      >
        <span className={cn("text-sm font-semibold tabular-nums", overridden ? "text-amber-900" : "text-foreground")}>
          {formatCurrency(currentRate)}
        </span>
        {overridden && (
          <span className={cn("text-[10px] font-medium tabular-nums leading-none", varianceTone)}>
            std {formatCurrency(standardRate)} · {variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-80 rounded-xl border border-border bg-card shadow-xl p-4 text-left">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Override rate</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {line.role?.name} · standard {formatCurrency(standardRate)}/hr
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">New rate ($/hr)</label>
            <input
              type="number"
              step="1"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              autoFocus
            />
            {(() => {
              const r = parseFloat(draftRate || "0");
              if (!Number.isFinite(r) || r <= 0 || standardRate <= 0) return null;
              const v = (r - standardRate) / standardRate * 100;
              const tone = Math.abs(v) < 0.01 ? "text-muted-foreground"
                : v < 0 ? "text-emerald-700"
                : Math.abs(v) > 10 ? "text-rose-700" : "text-amber-700";
              return (
                <p className={cn("text-[11px] mt-1 font-medium tabular-nums", tone)}>
                  Variance vs standard: {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                  {Math.abs(v) > 10 && " — Finance review recommended"}
                </p>
              );
            })()}

            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-3">
              Justification {Math.abs(parseFloat(draftRate || "0") - standardRate) > 0.01 && <span className="text-rose-600">*</span>}
            </label>
            <textarea
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              rows={3}
              placeholder="e.g. Strategic discount for first-year client; partner sponsor approved."
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
            {Math.abs(parseFloat(draftRate || "0") - standardRate) > 0.01 && draftReason.trim().length > 0 && draftReason.trim().length < 5 && (
              <p className="text-[11px] text-rose-700 mt-1">Justification must be at least 5 characters.</p>
            )}

            <div className="flex items-center justify-between gap-2 mt-4">
              {overridden ? (
                <button
                  onClick={resetToStandard}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset to standard
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={submitOverride}
                  disabled={
                    Math.abs(parseFloat(draftRate || "0") - standardRate) > 0.01 &&
                    draftReason.trim().length < 5
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PricingStep({ deal }: { deal: any }) {
  const { data: pricingLines } = useDealPricing(deal.id);
  const updateLine = useUpdatePricingLine();
  const marginAdvisor = useAIMarginAdvisor();
  const updateDeal = useUpdateDeal();
  const { data: marginTarget } = useDealMarginTarget(deal.id);
  const targetMargin = marginTarget?.percent ?? 35;
  const targetSourceLabel = marginTarget?.sourceLabel ?? "Firm default";
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [overrideInput, setOverrideInput] = useState<string>("");
  useEffect(() => {
    setOverrideInput(deal.targetMarginPercent != null ? String(deal.targetMarginPercent) : "");
  }, [deal.targetMarginPercent]);
  const { data: scenariosForBadge } = useDealScenarios(deal.id);
  const selectedScenario = (scenariosForBadge || []).find((s: any) => s.isRecommended);
  const overrideLines = (pricingLines || []).filter((l: any) => l.rateOverridden);
  const overrideCount = overrideLines.length;
  const overrideFeeImpact = overrideLines.reduce((acc: number, l: any) => {
    const std = parseFloat(l.standardRate || l.rate || "0");
    const cur = parseFloat(l.rate || "0");
    const hrs = parseFloat(l.hours || "0");
    return acc + (cur - std) * hrs;
  }, 0);

  useEffect(() => {
    if (pricingLines && pricingLines.length > 0) {
      marginAdvisor.mutate({ pricingLines, dealId: deal.id });
    }
  }, [pricingLines?.length, deal.id, targetMargin, targetSourceLabel]);

  // Per-line subtotal: Σ (hours × rate). Per-line invariant on the server is
  // rate × hours = fee, so this matches what the user sees in each row.
  const lineSubtotal = (pricingLines || []).reduce((acc: any, l: any) => ({
    hours: acc.hours + parseFloat(l.hours || 0),
    fee: acc.fee + parseFloat(l.fee || 0),
    cost: acc.cost + parseFloat(l.cost || 0),
    margin: acc.margin + parseFloat(l.margin || 0),
  }), { hours: 0, fee: 0, cost: 0, margin: 0 });

  // Engagement-input uplift / rounding are deal-level adjustments. Surfacing
  // them in the grid footer (rather than silently inflating totalFee) is the
  // whole point of Task #45 — the user must always be able to reconcile the
  // displayed Total to the rows above.
  const ei: any = (deal as any).engagementInputs || {};
  const lineItemRounding = parseFloat(ei.lineItemRounding ?? "0") || 0;
  const techAdminFeePct = parseFloat(ei.techAdminFeePct ?? "0") || 0;
  // Per-line rounding (legacy economics): each line's raw fee is rounded
  // to the nearest step BEFORE summing, matching the server's
  // computeDealTotalsFromLines and the historical pricing engine.
  const roundedSubtotal = lineItemRounding > 0
    ? (pricingLines || []).reduce((s: number, l: any) => {
        const raw = parseFloat(l.fee || 0);
        return s + Math.round(raw / lineItemRounding) * lineItemRounding;
      }, 0)
    : lineSubtotal.fee;
  const roundingAdjustment = roundedSubtotal - lineSubtotal.fee;
  const techAdminFee = roundedSubtotal * (techAdminFeePct / 100);
  const totalFeeWithUplift = roundedSubtotal + techAdminFee;

  // Grid totals are now the deal-level totals (post-uplift / rounding) so they
  // tie to deals.totalFee, the proposal, the engagement letter, and Ask AI.
  const totals = {
    hours: lineSubtotal.hours,
    fee: totalFeeWithUplift,
    cost: lineSubtotal.cost,
    margin: totalFeeWithUplift - lineSubtotal.cost,
  };

  const marginPct = totals.fee > 0 ? ((totals.fee - totals.cost) / totals.fee) * 100 : 0;
  const warnThreshold = Math.max(0, targetMargin - 10);
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
    { label: "Margin %", value: `${marginPct.toFixed(1)}%`, tone: marginPct >= targetMargin ? "success" as const : marginPct >= warnThreshold ? "warning" as const : "danger" as const },
    { label: "Total Hours", value: formatNumber(totals.hours), tone: "default" as const },
    { label: "Effective Rate", value: blendedRate > 0 ? `${formatCurrency(blendedRate)}/hr` : "—", tone: "default" as const },
    { label: `vs Target (${targetMargin}% — ${targetSourceLabel})`, value: `${vsTarget >= 0 ? "+" : ""}${vsTarget.toFixed(1)}%`, tone: vsTarget >= 0 ? "success" as const : "danger" as const, accent: true },
  ];

  const handleSaveOverride = () => {
    const trimmed = overrideInput.trim();
    if (trimmed === "") {
      updateDeal.mutate({ id: deal.id, data: { targetMarginPercent: null } });
      return;
    }
    const parsed = parseFloat(trimmed);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
      updateDeal.mutate({ id: deal.id, data: { targetMarginPercent: parsed } });
    }
  };

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
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Margin Target</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {targetMargin}% <span className="text-xs font-normal text-muted-foreground">· {targetSourceLabel}</span>
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Deal Override (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                step="0.1"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="—"
                className="w-24 px-2 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              onClick={handleSaveOverride}
              disabled={updateDeal.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
            >
              {overrideInput.trim() === "" ? "Clear" : "Save"}
            </button>
          </div>
        </div>
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
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Pricing Grid</h2>
              {overrideCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-300"
                  title={`${overrideCount} line${overrideCount === 1 ? "" : "s"} overridden${
                    overrideFeeImpact !== 0
                      ? ` · net fee impact ${overrideFeeImpact >= 0 ? "+" : ""}${formatCurrency(overrideFeeImpact)}`
                      : ""
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {overrideCount} rate override{overrideCount === 1 ? "" : "s"}
                  {overrideFeeImpact !== 0 && (
                    <span className="font-normal opacity-80 ml-1">
                      ({overrideFeeImpact >= 0 ? "+" : ""}{formatCurrency(overrideFeeImpact)})
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right"><p className="text-xs text-muted-foreground">Blended Rate</p><p className="text-sm font-bold text-foreground">{totals.hours > 0 ? formatCurrency(totals.fee / totals.hours) : "--"}/hr</p></div>
            </div>
          </div>
          {overrideCount > 0 && (
            <div className="px-6 py-2.5 bg-amber-50/70 border-b border-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>{overrideCount} role{overrideCount === 1 ? "" : "s"}</strong> on this deal use a non-standard rate. Each override is captured in the audit log with the justification you provided and will be surfaced to Finance during approval review.
              </p>
            </div>
          )}
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
                  <tr key={line.id} className={cn("hover:bg-muted/30", line.rateOverridden && "bg-amber-50/40")}>
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
                    <td className="px-4 py-3 text-right">
                      <RateCell line={line} dealId={deal.id} updateLine={updateLine} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{formatCurrency(line.costRate)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">{formatCurrency(line.fee)}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">{formatCurrency(line.cost)}</td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-success">{formatCurrency(line.margin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td className="px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground" colSpan={2}>Subtotal (Σ rate × hours)</td>
                  <td className="px-4 py-2 text-right text-sm text-foreground">{formatNumber(lineSubtotal.hours)}</td>
                  <td className="px-4 py-2" colSpan={2}></td>
                  <td className="px-4 py-2 text-right text-sm text-foreground">{formatCurrency(lineSubtotal.fee)}</td>
                  <td className="px-4 py-2 text-right text-sm text-muted-foreground">{formatCurrency(lineSubtotal.cost)}</td>
                  <td className="px-6 py-2 text-right text-sm text-muted-foreground">{formatCurrency(lineSubtotal.fee - lineSubtotal.cost)}</td>
                </tr>
                {Math.abs(roundingAdjustment) > 0.005 && (
                  <tr className="bg-muted/30">
                    <td className="px-6 py-2 text-xs text-muted-foreground" colSpan={5}>
                      Line-item rounding (nearest ${formatNumber(lineItemRounding)})
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-foreground">
                      {roundingAdjustment >= 0 ? "+" : ""}{formatCurrency(roundingAdjustment)}
                    </td>
                    <td className="px-4 py-2"></td>
                    <td className="px-6 py-2"></td>
                  </tr>
                )}
                {techAdminFeePct > 0 && (
                  <tr className="bg-muted/30">
                    <td className="px-6 py-2 text-xs text-muted-foreground" colSpan={5}>
                      Tech &amp; Admin ({techAdminFeePct}%)
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-foreground">
                      +{formatCurrency(techAdminFee)}
                    </td>
                    <td className="px-4 py-2"></td>
                    <td className="px-6 py-2"></td>
                  </tr>
                )}
                <tr className="bg-muted/50 font-semibold border-t border-border">
                  <td className="px-6 py-3 text-sm text-foreground" colSpan={2}>Total</td>
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
            <span className="text-sm text-muted-foreground">Overall Margin <span className="text-xs">(target {targetMargin}% — {targetSourceLabel})</span></span>
            <span className={cn("text-lg font-bold", marginPct >= targetMargin ? "text-success" : marginPct >= warnThreshold ? "text-warning" : "text-destructive")}>{marginPct.toFixed(1)}%</span>
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
                <p className="text-xs text-muted-foreground mt-1">Target: {marginAdvisor.data.targetMargin}%{marginAdvisor.data.targetSource ? ` (${marginAdvisor.data.targetSource})` : ""}</p>
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
  const { data: marginTarget } = useDealMarginTarget(deal.id);
  const targetMargin = marginTarget?.percent ?? 35;

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
                    <span className={cn("text-sm font-bold", parseFloat(scenario.marginPercent) >= targetMargin ? "text-success" : "text-warning")}>{formatPercent(scenario.marginPercent || 0)}</span>
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

function DealBanner({ deal, currentStep, navigateToStep, summaryUnlocked }: { deal: any; currentStep: number; navigateToStep: (n: number) => void; summaryUnlocked: boolean }) {
  const { data: approvals } = useDealApprovals(deal.id);
  const { data: publishedSets } = usePromptSets({ status: "published", serviceLine: deal.serviceLine });
  const [moreOpen, setMoreOpen] = useState(false);

  const pendingApprovals = (approvals || []).filter((a: any) => a.status === "pending" || a.status === "pending_lead_review" || a.status === "pending_bu_approval").length;
  const { data: marginTarget } = useDealMarginTarget(deal.id);
  const targetMargin = marginTarget?.percent ?? 35;
  const targetSourceLabel = marginTarget?.sourceLabel ?? "Firm default";
  const marginVal = parseFloat(deal.marginPercent || 0);
  const marginDelta = marginVal - targetMargin;
  const marginGood = marginDelta >= 0;
  const activePromptSet = (publishedSets || [])[0];

  const dynamics = deal.dynamicsLink;
  const lastSaved = formatRelativeTime(deal.updatedAt);
  const dynamicsSyncedAt = dynamics?.lastSyncedAt ? formatRelativeTime(dynamics.lastSyncedAt) : null;

  const stepProgress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const activeStep = STEPS.find(s => s.num === currentStep);

  return (
    <div className="border-b border-border bg-gradient-to-b from-card to-background">
      {/* === MOBILE HEADER (compact) === */}
      <div className="sm:hidden px-3 pt-3 pb-2">
        {/* Row 1: back · title · more */}
        <div className="flex items-center gap-1.5">
          <Link href="/deals">
            <button className="shrink-0 w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Back to engagements">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <h1 className="flex-1 min-w-0 text-[15px] font-bold text-foreground truncate leading-tight">{deal.title}</h1>
          <div className="relative shrink-0">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMoreOpen(false), 150)}
              className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-30">
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

        {/* Row 2: deal# · client · service line — single truncated line */}
        <div className="ml-7 mt-0.5 text-[11px] text-muted-foreground truncate">
          <span className="font-medium text-foreground/70">{deal.dealNumber}</span>
          {deal.client?.name && <> · {deal.client.name}</>}
          {deal.serviceLine && <> · {deal.serviceLine}</>}
        </div>

        {/* Row 3: horizontal-scroll badges (status, margin, CRM, approvals) */}
        <div className="ml-7 mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 -mr-3 pr-3">
          <span className={cn("shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full", getStatusColor(deal.status))}>
            {getStatusLabel(deal.status)}
          </span>
          {marginVal > 0 && (
            <span className={cn(
              "shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full",
              marginGood ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
            )}>
              {marginGood ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
              {marginVal.toFixed(1)}% vs {targetMargin}%
            </span>
          )}
          {dynamics ? (
            <Link href="/integrations/dynamics">
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Database className="w-2.5 h-2.5" />
                {dynamics.opportunityNumber}
              </span>
            </Link>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
              <Database className="w-2.5 h-2.5" />
              No CRM
            </span>
          )}
          {pendingApprovals > 0 && (
            <button
              onClick={() => navigateToStep(6)}
              className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
            >
              <Clock className="w-2.5 h-2.5" />
              {pendingApprovals} pending
            </button>
          )}
        </div>
      </div>

      {/* === DESKTOP HEADER (original layout) === */}
      <div className="hidden sm:block px-6 lg:px-8 pt-5 pb-3">
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
                  {marginVal.toFixed(1)}% · {marginGood ? "+" : ""}{marginDelta.toFixed(1)} vs {targetMargin}% ({targetSourceLabel})
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

      {/* === Wizard step rail === */}
      {/* Mobile: sticky compact rail with current-step label inline */}
      <div className="sm:hidden sticky top-0 z-20 bg-background border-b border-border px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Step {currentStep} of {STEPS.length}
          </span>
          <span className="text-[11px] font-semibold text-primary truncate ml-2">
            {activeStep?.label}
          </span>
        </div>
        <div className="relative">
          <div className="absolute left-2.5 right-2.5 top-1/2 h-0.5 bg-border -translate-y-1/2" />
          <div
            className="absolute left-2.5 top-1/2 h-0.5 bg-primary -translate-y-1/2 transition-all duration-300"
            style={{ width: `calc(${stepProgress}% * (100% - 20px) / 100%)` }}
          />
          <div className="relative flex items-center justify-between">
            {STEPS.map((step) => {
              const isDone = step.num < currentStep;
              const isActive = step.num === currentStep;
              const isLocked = step.num === 7 && !summaryUnlocked;
              return (
                <button
                  key={step.num}
                  onClick={() => { if (!isLocked) navigateToStep(step.num); }}
                  disabled={isLocked}
                  className={cn("relative", isLocked && "cursor-not-allowed opacity-50")}
                  title={isLocked ? "Submit for Approval first to unlock the Summary" : `Step ${step.num}: ${step.label}`}
                >
                  <span
                    className={cn(
                      "block w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all border-2 bg-background",
                      isActive && "border-primary text-primary scale-110 shadow-sm",
                      isDone && "border-primary bg-primary text-primary-foreground",
                      !isActive && !isDone && "border-border text-muted-foreground"
                    )}
                  >
                    {isDone ? <Check className="w-2.5 h-2.5" /> : step.num}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop: full rail with labels */}
      <div className="hidden sm:block px-6 lg:px-8 pb-3">
        <div className="relative">
          <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-border -translate-y-1/2" />
          <div
            className="absolute left-3 top-1/2 h-0.5 bg-primary -translate-y-1/2 transition-all duration-300"
            style={{ width: `calc(${stepProgress}% * (100% - 24px) / 100%)` }}
          />
          <div className="relative flex items-center justify-between">
            {STEPS.map((step) => {
              const isDone = step.num < currentStep;
              const isActive = step.num === currentStep;
              const isLocked = step.num === 7 && !summaryUnlocked;
              return (
                <button
                  key={step.num}
                  onClick={() => { if (!isLocked) navigateToStep(step.num); }}
                  disabled={isLocked}
                  className={cn("group relative flex flex-col items-center gap-1.5", isLocked && "cursor-not-allowed opacity-50")}
                  title={isLocked ? "Submit for Approval first to unlock the Summary" : `Step ${step.num}: ${step.label}`}
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

function ReviewStep({ deal, navigateToStep, onReadiness, override, setOverride }: { deal: any; navigateToStep: (s: number) => void; onReadiness: (blockers: number) => void; override: boolean; setOverride: (v: boolean) => void }) {
  const { data: pricingLines } = useDealPricing(deal.id);
  const { data: scopeItems } = useDealScopeItems(deal.id);
  const { data: approvals } = useDealApprovals(deal.id);
  const qc = useQueryClient();

  const lines = pricingLines || [];
  const items = scopeItems || [];

  // Totals must mirror the Pricing grid AND the server's
  // computeDealTotalsFromLines (server/routes.ts) so the Review card,
  // the grid footer, deal.totalFee, the proposal, and the engagement
  // letter all show the same number. That means applying the engagement-
  // input deal-level adjustments (per-line rounding + tech-admin uplift)
  // on top of the raw Σ line.fee — not just the raw sum.
  const lineSubtotalFee = lines.reduce((s: number, l: any) => s + parseFloat(l.fee || 0), 0);
  const sumCost = lines.reduce((s: number, l: any) => s + parseFloat(l.cost || 0), 0);
  const sumHours = lines.reduce((s: number, l: any) => s + parseFloat(l.hours || 0), 0);
  const ei: any = (deal as any).engagementInputs || {};
  const lineItemRounding = parseFloat(ei.lineItemRounding ?? "0") || 0;
  const techAdminFeePct = parseFloat(ei.techAdminFeePct ?? "0") || 0;
  const roundedSubtotal = lineItemRounding > 0
    ? lines.reduce((s: number, l: any) => {
        const raw = parseFloat(l.fee || 0);
        return s + Math.round(raw / lineItemRounding) * lineItemRounding;
      }, 0)
    : lineSubtotalFee;
  const techAdminFee = roundedSubtotal * (techAdminFeePct / 100);
  const sumFee = roundedSubtotal + techAdminFee;
  const marginPct = sumFee > 0 ? ((sumFee - sumCost) / sumFee) * 100 : 0;
  const effRate = sumHours > 0 ? sumFee / sumHours : 0;
  const { data: marginTarget } = useDealMarginTarget(deal.id);
  const targetMargin = marginTarget?.percent ?? 35;
  const targetSourceLabel = marginTarget?.sourceLabel ?? "Firm default";
  const vsTarget = marginPct - targetMargin;

  // Calc parity: Σ line fees vs deal.totalFee
  const dealTotalFee = parseFloat(deal.totalFee || "0");
  const calcParity = Math.abs(sumFee - dealTotalFee) < 1;

  // Scope summary: group billable items by code prefix and allocate fee proportionally to total scope hours.
  const billable = items.filter((si: any) => !si.scopeItem?.isAssembly);
  const itemHours = (si: any) =>
    parseFloat(si.adjustedHours || 0) * parseFloat(si.complexityMultiplier || 1) * (si.quantity ?? 1);
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
  const plTrigger = evaluatePracticeLeadTrigger({ totalFee: sumFee, marginPercent: marginPct, scopeItemCount: billable.length, targetMarginPercent: targetMargin });
  const isNewClient = (deal.dealType || "").toLowerCase() === "new";

  // Build a list of missing required fields so we can name them in the fix UI.
  const missingFields = ([
    ["Client", deal.client?.name],
    ["Deal type", deal.dealType],
    ["Service line", deal.serviceLine],
    ["Business unit", deal.businessUnit],
    ["Start date", deal.startDate],
    ["End date", deal.endDate],
    ["PDL", deal.pdlName],
  ] as Array<[string, any]>)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  type CheckAction = { label: string; onClick: () => void };
  type Check = { ok: boolean | "warn" | "info"; label: string; hint?: string; action?: CheckAction };
  const recalcAction: CheckAction = {
    label: "Recalculate",
    onClick: async () => {
      try {
        const r = await fetch(`/api/deals/${deal.id}/recalc-totals`, { method: "POST" });
        if (!r.ok) throw new Error(await r.text());
      } catch (e) {
        console.error("recalc failed", e);
      } finally {
        qc.invalidateQueries({ queryKey: ["deal", deal.id] });
        qc.invalidateQueries({ queryKey: ["deal-pricing", deal.id] });
      }
    },
  };
  const checks: Check[] = [
    {
      ok: calcParity,
      label: calcParity ? "Calc parity verified" : "Calc parity mismatch",
      hint: calcParity ? undefined : `Pricing lines total ${formatCurrency(sumFee)} but deal header reads ${formatCurrency(dealTotalFee)} (off by ${formatCurrency(Math.abs(sumFee - dealTotalFee))}).`,
      action: calcParity ? undefined : recalcAction,
    },
    {
      ok: requiredFieldsOk,
      label: requiredFieldsOk ? "Required fields complete" : "Required fields missing",
      hint: requiredFieldsOk ? undefined : `Missing: ${missingFields.join(", ")}.`,
      action: requiredFieldsOk ? undefined : { label: "Open Setup", onClick: () => navigateToStep(1) },
    },
    {
      ok: marginOk,
      label: marginOk ? `Margin above target (${targetMargin}% — ${targetSourceLabel})` : `Margin ${marginPct.toFixed(1)}% is below target (${targetMargin}% — ${targetSourceLabel})`,
      hint: marginOk ? undefined : "Adjust hours, role mix, or fees to lift margin, or compare alternative pricing options.",
      action: marginOk ? undefined : { label: "Open Pricing", onClick: () => navigateToStep(4) },
    },
    {
      ok: ratesAssigned,
      label: ratesAssigned ? `Rate table assigned (${lines.length} role${lines.length === 1 ? "" : "s"})` : "Rate table not fully assigned",
      hint: ratesAssigned ? undefined : "Some pricing lines have no billable rate.",
      action: ratesAssigned ? undefined : { label: "Open Pricing", onClick: () => navigateToStep(4) },
    },
    {
      ok: crmLinked,
      label: crmLinked ? `CRM opportunity linked (${deal.dynamicsLink.opportunityNumber})` : "CRM opportunity not yet linked",
      hint: crmLinked ? undefined : "Link a Dynamics 365 opportunity so the deal can sync after approval.",
      action: crmLinked ? undefined : { label: "Link in Setup", onClick: () => navigateToStep(1) },
    },
    plTrigger.required
      ? {
          ok: "warn" as const,
          label: "Practice Lead approval required",
          hint: `${plTrigger.reason}. The approval will route to the Practice Lead automatically.`,
        }
      : { ok: true as const, label: "Within auto-approval thresholds" },
    isNewClient
      ? { ok: "info" as const, label: "New client — QRM notification sent" }
      : { ok: "info" as const, label: "Existing client — no QRM notification required" },
  ];
  const blockers = checks.filter((c) => c.ok === false).length;
  const ready = blockers === 0;

  // Surface readiness up to the wizard so the Next button can be gated.
  useEffect(() => {
    onReadiness(blockers);
  }, [blockers, onReadiness]);
  // Auto-clear the override the moment the deal becomes clean.
  useEffect(() => {
    if (ready && override) setOverride(false);
  }, [ready, override, setOverride]);

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
      {/* Section header — same pattern as the Pricing step */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review &amp; Submit</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Confirm totals, resolve any open items, and route the deal for approval.</p>
        </div>
        <div className="flex items-center gap-2">
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
          {ready ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle className="w-3 h-3" />
              Ready to submit
            </span>
          ) : override ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
              <ShieldAlert className="w-3 h-3" />
              Overridden — {blockers} open
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
              <XCircle className="w-3 h-3" />
              {blockers} blocker{blockers > 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => openProtectedDoc(`/api/deals/${deal.id}/proposal`).catch((err) => alert(err?.message || "Failed to open proposal"))}
            title="Opens a printable summary — use your browser's Print dialog to save as PDF."
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Download PDF Summary
          </button>
        </div>
      </div>

      {/* KPI strip — same compact card pattern used on the Pricing step */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <ReviewKpiCard label="Total Fees" value={formatCurrency(sumFee)} />
        <ReviewKpiCard label="Margin" value={`${marginPct.toFixed(1)}%`} tone={marginOk ? "success" : "warning"} />
        <ReviewKpiCard label="Hours" value={formatNumber(sumHours)} />
        <ReviewKpiCard label="Eff. Rate" value={effRate > 0 ? `${formatCurrency(effRate)}/hr` : "—"} />
        <ReviewKpiCard
          label={`vs Target (${targetMargin}% — ${targetSourceLabel})`}
          value={`${vsTarget >= 0 ? "+" : ""}${vsTarget.toFixed(1)}%`}
          tone={vsTarget >= 0 ? "success" : "danger"}
          accent
        />
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
            {ready ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Ready
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {blockers} blocker{blockers > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ul className="space-y-3">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                {c.ok === true && <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
                {c.ok === false && <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
                {c.ok === "warn" && <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
                {c.ok === "info" && <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn(
                      "leading-snug",
                      c.ok === true && "text-foreground",
                      c.ok === false && "text-rose-700 font-medium",
                      c.ok === "warn" && "text-primary",
                      c.ok === "info" && "text-muted-foreground",
                    )}>{c.label}</span>
                    {c.action && (
                      <button
                        type="button"
                        onClick={c.action.onClick}
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/50 text-foreground transition-colors"
                      >
                        {c.action.label}
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {c.hint && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{c.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {!ready && (
            <div className={cn(
              "mt-5 pt-4 border-t border-border flex items-start gap-3",
              override ? "" : ""
            )}>
              <ShieldAlert className={cn("w-4 h-4 mt-0.5 shrink-0", override ? "text-amber-600" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Override and continue</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {override
                    ? "Open issues will be flagged on the approval record for the reviewer."
                    : "Bypass the checklist and proceed to approval. Use only when blockers will be resolved out-of-band."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverride(!override)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors",
                  override
                    ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                    : "bg-card text-foreground border-border hover:bg-muted/50"
                )}
              >
                {override ? <><CheckCircle className="w-3.5 h-3.5" /> Override active</> : <>Override</>}
              </button>
            </div>
          )}
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

function ReviewKpiCard({ label, value, tone = "default", accent = false }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger"; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 bg-card",
        accent && tone === "success" && "border-emerald-300 bg-emerald-50/60",
        accent && tone === "danger" && "border-rose-300 bg-rose-50/60",
        !accent && "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">{label}</p>
      <p className={cn(
        "text-lg font-bold mt-1 leading-none tabular-nums",
        tone === "default" && "text-foreground",
        tone === "success" && "text-emerald-700",
        tone === "warning" && "text-amber-700",
        tone === "danger" && "text-rose-700",
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

  const handleAdvanceToBu = (approval: any) => {
    const reviewerName = persona?.name || approval.approverName || "Service Line Lead";
    const stamp = `[Stage 1 — Lead Review by ${reviewerName}] ${reviewComment || "Approved for BU sign-off"}`;
    const merged = approval.comments ? `${approval.comments}\n${stamp}` : stamp;
    updateApproval.mutate({
      id: approval.id,
      data: {
        status: "pending_bu_approval",
        approverRole: "BU Approver",
        approverName: "Business Unit Approver",
        comments: merged,
      },
    });
    setReviewComment("");
  };

  const handleDecision = (approval: any, status: "approved" | "rejected") => {
    const reviewerName = persona?.name || approval.approverName || "Reviewer";
    const stageLabel = approval.status === "pending_bu_approval" ? "Stage 2 — BU Approval" : "Stage 1 — Lead Review";
    const stamp = `[${stageLabel} ${status === "approved" ? "approved" : "rejected"} by ${reviewerName}] ${reviewComment || ""}`.trim();
    const merged = approval.comments ? `${approval.comments}\n${stamp}` : stamp;
    updateApproval.mutate({
      id: approval.id,
      data: { status, comments: merged },
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
                disabled={blocked || submitApproval.isPending}
                title={blocked ? "Resolve the Intapp conflict above before submitting." : ""}
                className="btn-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                onClick={() => {
                  if (submitApproval.isPending) return;
                  if (!screening) runScreen.mutate({ dealId: deal.id, userName: persona?.name });
                  submitApproval.mutate({ dealId: deal.id, data: { approverName: "Sarah Chen", approverRole: "Service Line Lead", status: "pending_lead_review", notes: "Stage 1 of 2 — awaiting Service Line Lead review", submittedBy: persona?.name } });
                }}>
                {blocked && <ShieldAlert className="w-4 h-4" />}
                {submitApproval.isPending ? "Submitting…" : blocked ? "Blocked by Intapp conflict" : "Submit for Approval"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(approvals || []).map((approval: any) => {
              const isLeadStage = approval.status === "pending_lead_review" || approval.status === "pending";
              const isBuStage = approval.status === "pending_bu_approval";
              const isFinal = approval.status === "approved" || approval.status === "rejected";
              const stage1State = isLeadStage ? "active" : "done";
              const stage2State = isBuStage ? "active" : isFinal ? (approval.status === "approved" ? "done" : "rejected") : "pending";
              return (
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

                {/* Two-stage approval tracker */}
                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/40 border border-border">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2",
                      stage1State === "done" && "bg-emerald-600 text-white border-emerald-600",
                      stage1State === "active" && "bg-amber-500 text-white border-amber-500 animate-pulse",
                    )}>
                      {stage1State === "done" ? <Check className="w-3.5 h-3.5" /> : "1"}
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-foreground">Lead Review</div>
                      <div className="text-muted-foreground">Service Line Lead</div>
                    </div>
                  </div>
                  <div className={cn("flex-1 h-0.5", stage1State === "done" ? "bg-emerald-500" : "bg-border border-t border-dashed")} />
                  <div className="flex items-center gap-2">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2",
                      stage2State === "done" && "bg-emerald-600 text-white border-emerald-600",
                      stage2State === "active" && "bg-violet-600 text-white border-violet-600 animate-pulse",
                      stage2State === "rejected" && "bg-rose-600 text-white border-rose-600",
                      stage2State === "pending" && "bg-background text-muted-foreground border-border",
                    )}>
                      {stage2State === "done" ? <Check className="w-3.5 h-3.5" /> : stage2State === "rejected" ? <XCircle className="w-3.5 h-3.5" /> : "2"}
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-foreground">BU Approval</div>
                      <div className="text-muted-foreground">Business Unit Approver</div>
                    </div>
                  </div>
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

                {canApprove && (isLeadStage || isBuStage) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <label className="label mb-2">{isLeadStage ? "Lead Review Comments (optional)" : "BU Approval Comments (optional)"}</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="input-field min-h-[80px] resize-y mb-3"
                      placeholder={isLeadStage ? "Notes for the BU Approver..." : "Final approval notes..."}
                    />
                    <div className="flex items-center gap-3">
                      {isLeadStage ? (
                        <button
                          onClick={() => handleAdvanceToBu(approval)}
                          disabled={updateApproval.isPending}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-violet-600 hover:bg-violet-700 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                          Approve & Send to BU
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDecision(approval, "approved")}
                          disabled={updateApproval.isPending}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Final Approve
                        </button>
                      )}
                      <button
                        onClick={() => handleDecision(approval, "rejected")}
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
                  {approval.decidedAt && isFinal && <span className="text-xs text-muted-foreground">Decided: {new Date(approval.decidedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStep({ deal }: { deal: any }) {
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const { data: marginTarget } = useDealMarginTarget(deal.id);
  const summaryTarget = marginTarget?.percent ?? 35;
  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Action buttons — full-width stacked on mobile, inline on desktop */}
      <div className="grid grid-cols-1 sm:flex sm:gap-3 sm:justify-end sm:flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openProtectedDoc(`/api/deals/${deal.id}/proposal`).catch((err) => alert(err?.message || "Failed to open proposal"))}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <FileText className="w-4 h-4" />
          Generate Proposal
        </button>
        <button
          onClick={() => setLetterModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <FileText className="w-4 h-4" />
          Generate Engagement Letter
        </button>
        <Link href={`/deals/${deal.id}/change-orders`}>
          <button className="px-4 py-2 rounded-lg border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-all flex items-center justify-center gap-2 w-full sm:w-auto">
            <GitBranch className="w-4 h-4" />
            Change Orders
          </button>
        </Link>
      </div>
      <div className="card overflow-hidden">
        {/* Hero — stacked on mobile (fee under title), side-by-side on desktop */}
        <div className="bg-primary px-4 sm:px-8 py-4 sm:py-6 text-primary-foreground">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-sm opacity-80 uppercase sm:normal-case tracking-wider sm:tracking-normal">Deal Summary</p>
              <h2 className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1 leading-tight break-words">{deal.title}</h2>
              <p className="text-[11px] sm:text-sm opacity-80 mt-1 truncate">{deal.dealNumber} | {deal.client?.name}</p>
            </div>
            <div className="sm:text-right shrink-0 border-t sm:border-t-0 border-white/20 pt-3 sm:pt-0">
              <p className="text-2xl sm:text-3xl font-bold leading-none">{formatCurrency(deal.totalFee || 0)}</p>
              <p className="text-[11px] sm:text-sm opacity-80 mt-1">Total Engagement Fee</p>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-6 mb-4 sm:mb-8">
            <div className="text-center p-2.5 sm:p-4 bg-muted/50 rounded-xl">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1 uppercase tracking-wider sm:normal-case sm:tracking-normal">Total Cost</p>
              <p className="text-sm sm:text-lg font-bold text-foreground">{formatCurrency(deal.totalCost || 0)}</p>
            </div>
            <div className="text-center p-2.5 sm:p-4 bg-muted/50 rounded-xl">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1 uppercase tracking-wider sm:normal-case sm:tracking-normal">Margin</p>
              <p className={cn("text-sm sm:text-lg font-bold", parseFloat(deal.marginPercent) >= summaryTarget ? "text-success" : "text-warning")}>{formatPercent(deal.marginPercent || 0)}</p>
            </div>
            <div className="text-center p-2.5 sm:p-4 bg-muted/50 rounded-xl">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1 uppercase tracking-wider sm:normal-case sm:tracking-normal">Total Hours</p>
              <p className="text-sm sm:text-lg font-bold text-foreground">{formatNumber(deal.totalHours || 0)}</p>
            </div>
            <div className="text-center p-2.5 sm:p-4 bg-muted/50 rounded-xl">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1 uppercase tracking-wider sm:normal-case sm:tracking-normal">Blended Rate</p>
              <p className="text-sm sm:text-lg font-bold text-foreground">{formatCurrency(deal.blendedRate || 0)}/hr</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
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

      <EngagementLettersPanel dealId={deal.id} onGenerate={() => setLetterModalOpen(true)} />

      {letterModalOpen && (
        <EngagementLetterModal
          deal={deal}
          onClose={() => setLetterModalOpen(false)}
        />
      )}
    </div>
  );
}

function AgentResubmitButton({ dealId, navigateToStep }: { dealId: number; navigateToStep: (n: number) => void }) {
  const { persona } = useAuth();
  const resubmit = useAgentResubmit();
  return (
    <button
      onClick={async () => {
        await resubmit.mutateAsync({ dealId, userName: persona?.name });
        navigateToStep(7);
      }}
      disabled={resubmit.isPending}
      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
      data-testid="button-agent-resubmit"
    >
      {resubmit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      Resubmit to Agent Review
    </button>
  );
}

function ReviewerEditsDiff({
  snapshot,
  deal,
  editedAt,
  editedBy,
}: {
  snapshot: any;
  deal: any;
  editedAt: string;
  editedBy?: string;
}) {
  const num = (v: any) => (v == null || v === "" ? NaN : typeof v === "number" ? v : parseFloat(v));
  const fmtMoney = (v: any) => {
    const n = num(v);
    return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
  };
  const fmtNum = (v: any, digits = 1) => {
    const n = num(v);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
  };
  const fmtPct = (v: any) => {
    const n = num(v);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
  };
  const sameNum = (a: any, b: any) => {
    const na = num(a), nb = num(b);
    if (!Number.isFinite(na) && !Number.isFinite(nb)) return true;
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
    return Math.abs(na - nb) < 0.005;
  };
  const sameStr = (a: any, b: any) => (a ?? "") === (b ?? "");

  const totalsRows = [
    { label: "Total Fee", before: snapshot.totalFee, after: deal.totalFee, fmt: fmtMoney, isNum: true },
    { label: "Total Cost", before: snapshot.totalCost, after: deal.totalCost, fmt: fmtMoney, isNum: true },
    { label: "Total Hours", before: snapshot.totalHours, after: deal.totalHours, fmt: (v: any) => fmtNum(v, 1), isNum: true },
    { label: "Margin %", before: snapshot.marginPercent, after: deal.marginPercent, fmt: fmtPct, isNum: true },
    { label: "Blended Rate", before: snapshot.blendedRate, after: deal.blendedRate, fmt: (v: any) => `$${fmtNum(v, 0)}`, isNum: true },
  ];

  const fieldRows = [
    { label: "Service Line", before: snapshot.serviceLine, after: deal.serviceLine },
    { label: "Business Unit", before: snapshot.businessUnit, after: deal.businessUnit },
    { label: "Complexity", before: snapshot.complexity, after: deal.complexity },
  ];

  const beforeScope: Array<{ code?: string; name?: string; hours?: any }> = Array.isArray(snapshot.scopeItems) ? snapshot.scopeItems : [];
  const afterScopeRaw: any[] = Array.isArray(deal.scopeItems) ? deal.scopeItems : [];
  const afterScope = afterScopeRaw.map((s) => ({
    code: s.scopeItem?.code,
    name: s.scopeItem?.name,
    hours: s.adjustedHours,
  }));
  const keyOf = (s: { code?: string; name?: string }) => s.code || s.name || "";
  const beforeMap = new Map(beforeScope.map((s) => [keyOf(s), s]));
  const afterMap = new Map(afterScope.map((s) => [keyOf(s), s]));
  const removed = beforeScope.filter((s) => !afterMap.has(keyOf(s)));
  const added = afterScope.filter((s) => !beforeMap.has(keyOf(s)));
  const changedHours = afterScope
    .filter((s) => beforeMap.has(keyOf(s)))
    .map((s) => ({ now: s, was: beforeMap.get(keyOf(s))! }))
    .filter(({ now, was }) => !sameNum(now.hours, was.hours));

  const beforePromptResponses: any[] = Array.isArray(snapshot.promptResponses) ? snapshot.promptResponses : [];
  const afterPromptResponses: any[] = Array.isArray(deal.promptResponses) ? deal.promptResponses : [];
  const promptBeforeMap = new Map(beforePromptResponses.map((p) => [p.question, p]));
  const changedPrompts = afterPromptResponses
    .filter((p) => promptBeforeMap.has(p.question))
    .map((p) => ({ now: p, was: promptBeforeMap.get(p.question) }))
    .filter(({ now, was }) => !sameStr(now.answer, was.answer) || !sameNum(now.impactMultiplier, was.impactMultiplier));

  const fieldChangeCount =
    totalsRows.filter((r) => !sameNum(r.before, r.after)).length +
    fieldRows.filter((r) => !sameStr(r.before, r.after)).length +
    changedPrompts.length;
  const totalChanges = fieldChangeCount + added.length + removed.length + changedHours.length;

  return (
    <div
      className="p-4 rounded-md bg-blue-50/60 border border-blue-200"
      data-testid="reviewer-edits-diff"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Pencil className="w-4 h-4 text-blue-700" /> Reviewer edits
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Changes made by {editedBy || "reviewer"} in the wizard, compared to the original agent draft · {formatRelativeTime(editedAt)}
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex-shrink-0">
          {totalChanges} {totalChanges === 1 ? "change" : "changes"}
        </span>
      </div>

      {totalChanges === 0 ? (
        <p className="text-xs text-muted-foreground">No reviewer edits detected — current values match the original agent draft.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Totals</p>
            <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-stone-50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-1.5 font-semibold">Metric</th>
                    <th className="px-3 py-1.5 font-semibold">Before</th>
                    <th className="px-3 py-1.5 font-semibold">After</th>
                    <th className="px-3 py-1.5 font-semibold text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsRows.map((r) => {
                    const changed = !sameNum(r.before, r.after);
                    const nb = num(r.before), na = num(r.after);
                    const delta = Number.isFinite(na) && Number.isFinite(nb) ? na - nb : NaN;
                    return (
                      <tr key={r.label} className={cn("border-t border-stone-100", changed && "bg-amber-50/40")}>
                        <td className="px-3 py-1.5 text-foreground">{r.label}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.fmt(r.before)}</td>
                        <td className={cn("px-3 py-1.5", changed ? "font-semibold text-foreground" : "text-foreground")}>{r.fmt(r.after)}</td>
                        <td className={cn("px-3 py-1.5 text-right tabular-nums",
                          !changed ? "text-muted-foreground" : delta > 0 ? "text-emerald-700" : "text-red-700")}>
                          {!changed || !Number.isFinite(delta) ? "—" : `${delta > 0 ? "+" : ""}${r.fmt(delta)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {fieldRows.some((r) => !sameStr(r.before, r.after)) && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Header fields</p>
              <ul className="space-y-1">
                {fieldRows
                  .filter((r) => !sameStr(r.before, r.after))
                  .map((r) => (
                    <li key={r.label} className="text-xs flex items-center gap-2">
                      <span className="text-muted-foreground w-32 flex-shrink-0">{r.label}</span>
                      <span className="text-muted-foreground line-through">{r.before || "—"}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{r.after || "—"}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {(added.length > 0 || removed.length > 0 || changedHours.length > 0) && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Scope items <span className="text-muted-foreground/70 normal-case font-normal">({beforeScope.length} → {afterScope.length})</span>
              </p>
              <div className="space-y-1.5">
                {added.map((s, i) => (
                  <div key={`add-${i}`} className="flex items-center gap-2 text-xs" data-testid="scope-added">
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Added</span>
                    {s.code && <span className="font-mono text-muted-foreground">{s.code}</span>}
                    <span className="font-semibold text-foreground truncate">{s.name || "—"}</span>
                    <span className="text-muted-foreground ml-auto flex-shrink-0">{fmtNum(s.hours, 1)} hrs</span>
                  </div>
                ))}
                {removed.map((s, i) => (
                  <div key={`rem-${i}`} className="flex items-center gap-2 text-xs" data-testid="scope-removed">
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">Removed</span>
                    {s.code && <span className="font-mono text-muted-foreground">{s.code}</span>}
                    <span className="font-semibold text-foreground line-through truncate">{s.name || "—"}</span>
                    <span className="text-muted-foreground ml-auto flex-shrink-0">{fmtNum(s.hours, 1)} hrs</span>
                  </div>
                ))}
                {changedHours.map(({ now, was }, i) => {
                  const nb = num(was.hours), na = num(now.hours);
                  const delta = Number.isFinite(na) && Number.isFinite(nb) ? na - nb : NaN;
                  return (
                    <div key={`chg-${i}`} className="flex items-center gap-2 text-xs" data-testid="scope-hours-changed">
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Hours</span>
                      {now.code && <span className="font-mono text-muted-foreground">{now.code}</span>}
                      <span className="font-semibold text-foreground truncate">{now.name || "—"}</span>
                      <span className="ml-auto flex-shrink-0 text-muted-foreground">
                        <span className="line-through">{fmtNum(was.hours, 1)}</span>
                        <ChevronRight className="inline w-3 h-3 mx-0.5" />
                        <span className="font-semibold text-foreground">{fmtNum(now.hours, 1)} hrs</span>
                        {Number.isFinite(delta) && (
                          <span className={cn("ml-1", delta > 0 ? "text-emerald-700" : "text-red-700")}>
                            ({delta > 0 ? "+" : ""}{fmtNum(delta, 1)})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {changedPrompts.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Assumptions</p>
              <ul className="space-y-1.5">
                {changedPrompts.map(({ now, was }, i) => {
                  const answerChanged = !sameStr(now.answer, was.answer);
                  const multChanged = !sameNum(now.impactMultiplier, was.impactMultiplier);
                  return (
                    <li key={`prompt-${i}`} className="text-xs">
                      <p className="text-foreground font-medium truncate">{now.question}</p>
                      {answerChanged && (
                        <p className="text-muted-foreground">
                          <span className="line-through">{was.answer || "—"}</span>
                          <ChevronRight className="inline w-3 h-3 mx-1" />
                          <span className="font-semibold text-foreground">{now.answer || "—"}</span>
                        </p>
                      )}
                      {multChanged && (
                        <p className="text-muted-foreground mt-0.5">
                          <span className="text-[10px] uppercase tracking-wider mr-1">Impact ×</span>
                          <span className="line-through">{fmtNum(was.impactMultiplier, 2)}</span>
                          <ChevronRight className="inline w-3 h-3 mx-1" />
                          <span className="font-semibold text-foreground">{fmtNum(now.impactMultiplier, 2)}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SendBackHistoryBanner({ deal }: { deal: any }) {
  const [dismissed, setDismissed] = useState(false);
  const activities = (deal.activities || []) as any[];
  const sendBacks = activities
    .filter((a) => a.action === "sent_back_from_crm")
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (dismissed || sendBacks.length === 0 || deal.status === "approved") return null;

  const latest = sendBacks[0];
  const earlier = sendBacks.slice(1);

  return (
    <div className="card p-0 overflow-hidden border-amber-300 mb-6" data-testid="send-back-history-banner">
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-white flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold">Sales sent this deal back for revision</h2>
          <p className="text-xs opacity-90 mt-0.5">
            Address the feedback below before re-submitting for approval.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/80 hover:text-white p-1 rounded transition-colors"
          title="Dismiss"
          data-testid="button-dismiss-send-back"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2 text-xs text-amber-900 mb-1.5">
            <span className="font-semibold">Latest feedback</span>
            <span className="text-amber-700/70">·</span>
            <span>{latest.userName || "Sales"}</span>
            <span className="text-amber-700/70">·</span>
            <span>{formatRelativeTime(latest.createdAt)}</span>
            {latest.metadata?.opportunityNumber && (
              <>
                <span className="text-amber-700/70">·</span>
                <span>{latest.metadata.opportunityNumber}</span>
              </>
            )}
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {latest.metadata?.reason || latest.description}
          </p>
        </div>

        {earlier.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
              Earlier send-backs ({earlier.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {earlier.map((a) => (
                <li key={a.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-semibold text-foreground">{a.userName || "Sales"}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(a.createdAt)}</span>
                    {a.metadata?.opportunityNumber && (
                      <>
                        <span>·</span>
                        <span>{a.metadata.opportunityNumber}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {a.metadata?.reason || a.description}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function AgentDraftReviewBanner({ deal, navigateToStep }: { deal: any; navigateToStep: (n: number) => void }) {
  const { persona } = useAuth();
  const approve = useAgentApproveDeal();
  const discard = useAgentDiscardDeal();
  const openWizard = useAgentOpenWizard();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activities = (deal.activities || []) as any[];
  const agentSteps = activities
    .filter((a) => a?.metadata?.agentRun && a.action !== "agent_complete" && a.action !== "agent_draft_snapshot")
    .map((a) => ({ ...a.metadata.agentRun, action: a.action, ts: a.createdAt, userName: a.userName }))
    .reverse();

  const tsOf = (a: any) => new Date(a?.createdAt || 0).getTime();
  const resubmitActivity = activities
    .filter((a) => a.action === "agent_resubmit")
    .sort((a, b) => tsOf(b) - tsOf(a))[0];
  const snapshotActivity = activities
    .filter((a) => a.action === "agent_draft_snapshot" && (!resubmitActivity || tsOf(a) <= tsOf(resubmitActivity)))
    .sort((a, b) => tsOf(b) - tsOf(a))[0];
  const snapshot = snapshotActivity?.metadata?.agentRun?.snapshot;

  const handleApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync({ dealId: deal.id, userName: persona?.name });
      navigateToStep(7);
    } catch (e: any) {
      setError(e?.message || "Approve failed");
    }
  };
  const handleDiscard = async () => {
    setError(null);
    try {
      await discard.mutateAsync({ dealId: deal.id, userName: persona?.name });
      window.location.href = "/deals";
    } catch (e: any) {
      setError(e?.message || "Discard failed");
    }
  };
  const handleOpenWizard = async () => {
    setError(null);
    try {
      await openWizard.mutateAsync({ dealId: deal.id, userName: persona?.name });
      navigateToStep(1);
    } catch (e: any) {
      setError(e?.message || "Open wizard failed");
    }
  };

  return (
    <div className="card p-0 overflow-hidden border-purple-300" data-testid="agent-draft-banner">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
        <div className="flex items-start gap-3">
          <Sparkles className="w-6 h-6 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-bold">Pending Review · Agent Draft</h2>
            <p className="text-sm opacity-90 mt-0.5">
              The Autonomous Agent has drafted scope, assumptions, pricing, scenarios, and risk for this deal.
              Review the values below and choose an action.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleApprove}
            disabled={approve.isPending || discard.isPending || openWizard.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            data-testid="button-agent-approve"
          >
            {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve & Submit
          </button>
          <button
            onClick={handleOpenWizard}
            disabled={approve.isPending || discard.isPending || openWizard.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-stone-300 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
            data-testid="button-agent-open-wizard"
          >
            {openWizard.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            Open in Wizard
          </button>
          {!confirmDiscard ? (
            <button
              onClick={() => setConfirmDiscard(true)}
              disabled={approve.isPending || discard.isPending || openWizard.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
              data-testid="button-agent-discard"
            >
              <Archive className="w-4 h-4" /> Discard Draft
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-300">
              <span className="text-xs text-red-800">Confirm discard?</span>
              <button onClick={handleDiscard} disabled={discard.isPending}
                className="px-2 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                {discard.isPending ? "…" : "Yes, discard"}
              </button>
              <button onClick={() => setConfirmDiscard(false)}
                className="px-2 py-1 rounded border border-stone-300 text-xs">Cancel</button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {deal.aiSummary && (
          <div className="p-3 rounded-md bg-purple-50 border border-purple-200">
            <p className="text-[11px] uppercase tracking-wider text-purple-700 font-semibold mb-1">Agent Risk Narrative</p>
            <p className="text-sm text-foreground">{deal.aiSummary}</p>
          </div>
        )}

        {snapshot && resubmitActivity && (
          <ReviewerEditsDiff
            snapshot={snapshot}
            deal={deal}
            editedAt={resubmitActivity.createdAt}
            editedBy={resubmitActivity.userName}
          />
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" /> Agent Run Details
          </h3>
          {agentSteps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No agent activity recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {agentSteps.map((s, idx) => (
                <li key={idx} className="p-3 rounded-md border border-stone-200 bg-stone-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">
                          {s.step}
                        </span>
                        <p className="text-sm font-semibold text-foreground">{s.label}</p>
                        {s.needsReview && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold uppercase">
                            Needs Review
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.summary}</p>
                      {s.step === "prompts" && Array.isArray(s.output?.prompts) && s.output.prompts.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {s.output.prompts.map((p: any, i: number) => (
                            <li key={i} className="text-[11px] flex items-start gap-2 leading-snug">
                              <span className={cn("inline-block mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                                p.confidence >= 0.7 ? "bg-emerald-500" : p.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500")} />
                              <span className="flex-1 min-w-0">
                                <span className="text-foreground font-medium">{p.question}</span>
                                <span className="text-muted-foreground"> → </span>
                                <span className="text-foreground">{p.answer}</span>
                                {p.rationale && (
                                  <span className="text-muted-foreground italic"> · {p.rationale}</span>
                                )}
                              </span>
                              <span className={cn("font-semibold flex-shrink-0",
                                p.confidence >= 0.7 ? "text-emerald-700" : p.confidence >= 0.5 ? "text-amber-700" : "text-red-700")}>
                                {Math.round((p.confidence || 0) * 100)}%
                              </span>
                              {p.needsReview && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold uppercase flex-shrink-0">
                                  Review
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex flex-col items-end flex-shrink-0">
                      {typeof s.confidence === "number" && (
                        <span className={cn("font-semibold", s.confidence >= 0.7 ? "text-emerald-700" : s.confidence >= 0.5 ? "text-amber-700" : "text-red-700")}>
                          {Math.round(s.confidence * 100)}% confidence
                        </span>
                      )}
                      <span>{formatRelativeTime(s.ts)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function EngagementLettersPanel({ dealId, onGenerate }: { dealId: number; onGenerate: () => void }) {
  const { data: letters = [], isLoading } = useDealEngagementLetters(dealId);
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Engagement Letters</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Generated via Conga Composer document automation</p>
        </div>
        <button onClick={onGenerate} className="text-sm text-primary hover:underline flex items-center gap-1">
          <Plus className="w-4 h-4" /> Generate
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : letters.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl">
          No engagement letters generated yet for this deal.
        </div>
      ) : (
        <div className="space-y-2">
          {letters.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/40 transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", l.status === "failed" ? "bg-red-100 text-red-600" : "bg-primary/10 text-primary")}>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{l.templateName}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.externalRef || "—"} · {l.source} · by {l.generatedBy || "system"} · {new Date(l.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase",
                  l.status === "failed" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                  {l.status}
                </span>
                {l.status === "generated" && (
                  <a href={`/api/conga/letters/${l.id}/download`} target="_blank" rel="noopener noreferrer"
                     className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1">
                    <Download className="w-3 h-3" /> Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EngagementLetterModal({ deal, onClose }: { deal: any; onClose: () => void }) {
  const { data: tmplResp, isLoading } = useCongaTemplates();
  const generate = useGenerateEngagementLetter();
  const templates: any[] = tmplResp?.templates || [];
  const matchedKey = (() => {
    const sl = (deal.serviceLine || "").toLowerCase();
    if (sl.includes("audit")) return "audit-fy26";
    if (sl.includes("tax")) return "tax-provision";
    if (sl.includes("advisory") || sl.includes("strateg")) return "advisory-strategy";
    if (sl.includes("consult") || sl.includes("erp") || sl.includes("implement")) return "consulting-implementation";
    return null;
  })();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId == null && templates.length) {
      const m = matchedKey ? templates.find((t) => t.key === matchedKey) : null;
      setSelectedId((m || templates[0]).id);
    }
  }, [templates, matchedKey, selectedId]);

  const onGenerate = async () => {
    if (!selectedId) return;
    try {
      const res: any = await generate.mutateAsync({ dealId: deal.id, templateId: selectedId });
      onClose();
      if (res?.id) window.open(`/api/conga/letters/${res.id}/download`, "_blank", "noopener,noreferrer");
    } catch {/* react-query exposes via .error */}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Generate Engagement Letter</h2>
            <p className="text-xs text-muted-foreground">{deal.title} · {deal.dealNumber}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates registered. Configure templates in Admin → Engagement Letters.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Choose Template</p>
              {templates.map((t) => (
                <label key={t.id} className={cn("block p-3 border rounded-lg cursor-pointer transition-all",
                  selectedId === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                  <div className="flex items-start gap-3">
                    <input type="radio" name="tmpl" checked={selectedId === t.id} onChange={() => setSelectedId(t.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm">{t.name}</p>
                        {matchedKey === t.key && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold uppercase">Suggested</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.practice} · {t.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {generate.error && (
            <p className="mt-4 text-sm text-red-600">{(generate.error as any).message || "Generation failed"}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            onClick={onGenerate}
            disabled={!selectedId || generate.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generate.isPending ? "Generating…" : "Generate Letter"}
          </button>
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

  // One-line summary for mobile collapsed state
  const summaryLine = isBlocked
    ? `Blocked · ${openHitCount} of ${allHits.length} unresolved`
    : isOverridden
      ? `Overridden by QRM · ${allHits.length} hit(s) on record`
      : isMitigated
        ? `Mitigated · ${allHits.length} hit(s) cleared`
        : isReview
          ? `${allHits.length} finding${allHits.length !== 1 ? "s" : ""} · ${openHitCount} open · may proceed with mitigations`
          : isClear
            ? "No compliance issues found"
            : "Awaiting screening";

  return (
    <div className={`card p-3 sm:p-5 border ${banner.cls}`}>
      <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
        <div className="shrink-0 mt-0.5 sm:mt-0">{banner.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start sm:items-center gap-1.5 sm:gap-2 flex-wrap">
            <h3 className="text-[13px] sm:text-sm font-semibold text-foreground leading-snug">{banner.title}</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              <IntappResultBadge result={screening.result} />
              <IntappRiskBadge tier={screening.riskTier} />
              <span className="hidden sm:inline-flex"><IntappSourceBadge source={screening.source} /></span>
              {screening.externalRef && <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground">{screening.externalRef}</span>}
            </div>
          </div>
          {/* Mobile: 1-line summary. Desktop: full narrative. */}
          <p className="sm:hidden text-[11px] text-muted-foreground mt-1 line-clamp-2">{summaryLine}</p>
          <p className="hidden sm:block text-xs text-muted-foreground mt-1.5 whitespace-pre-line">{screening.narrative}</p>
        </div>
        <button onClick={() => runScreen.mutate({ dealId: deal.id, userName: persona?.name })}
          disabled={runScreen.isPending}
          title="Re-screen"
          className="shrink-0 inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50">
          {runScreen.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Re-screen</span>
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
    <div className={`card border ${tone} p-3 sm:p-5 space-y-3 sm:space-y-4`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start sm:items-center gap-1.5 sm:gap-2 flex-wrap">
            <h3 className="text-[13px] sm:text-sm font-semibold text-foreground leading-snug">Workday Validation</h3>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Source · Simulation</span>
            {isOverridden && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Override on file</span>}
          </div>
          <p className="text-[12px] sm:text-sm text-foreground mt-1 sm:mt-0.5 leading-snug">
            {isLoading ? "Loading…" : latest?.summary || "No validation has been run yet."}
          </p>
          {/* Mobile actions row — full-width buttons under the summary */}
          <div className="sm:hidden flex items-center gap-2 mt-2">
            <button onClick={() => runValidation.mutate({ dealId: deal.id, userName: persona?.name })}
              disabled={runValidation.isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-[11px] font-medium hover:bg-stone-50 disabled:opacity-50">
              {runValidation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-run
            </button>
            <button onClick={() => setShowLink(!showLink)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-[11px] font-medium hover:bg-stone-50">
              <GitBranch className="w-3.5 h-3.5" />
              {cc ? "Re-link" : "Link CC"}
            </button>
          </div>
        </div>
        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
