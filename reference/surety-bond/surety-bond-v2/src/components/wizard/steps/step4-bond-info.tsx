import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, ChevronLeft, Calculator, Upload, DollarSign, AlertCircle, TrendingDown, Shield, ShieldAlert, ShieldCheck, Loader2, Send, Info, X, CheckCircle2, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useGetBondForm, useGetUnderwritingQuestions, useCalculatePremium, useEvaluateRisk, useCreateBond, useUpdateBondStatus, useCreatePrincipal, listPrincipals, BondType, type CreateBondRequest } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AIFormAssistant } from "@/components/ai/ai-form-assistant";
import { SmartAlerts } from "@/components/ai/smart-alerts";
import { DocumentChecklist } from "@/components/ai/document-checklist";
import { usePremiumEstimate } from "@/hooks/use-ai-underwriting";
import type { WizardState } from "../wizard-types";

interface Step4Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onDashboard?: () => void;
}

const ATTORNEYS_IN_FACT = [
  "Sarah Mitchell — AG-TX-2019-4421",
  "James Thornton — AG-TX-2017-3380",
  "Karen Rodriguez — AG-CA-2020-5512",
];

type CompanyInfoAnswer = "yes" | "no";

export function Step4BondInfo({ state, onUpdate, onNext, onBack, onDashboard }: Step4Props) {
  const { user } = useAuth();
  const uwAnswers = state.underwritingAnswers || {};
  const setUwAnswers = (answers: Record<number, string>) => {
    onUpdate({
      underwritingAnswers: answers,
      premiumCalculated: null,
      surcharge: null,
      commission: null,
      netPremium: null,
      riskScore: null,
      riskLevel: null,
      triageDecision: null,
      riskFlags: [],
    });
  };
  const uploadedFiles = state.uploadedFiles || [];
  const setUploadedFiles = (files: string[]) => onUpdate({ uploadedFiles: files });
  const [isCalculating, setIsCalculating] = useState(false);
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [showReferralSuccess, setShowReferralSuccess] = useState(false);
  const [referralComment, setReferralComment] = useState("");
  const [isSendingReferral, setIsSendingReferral] = useState(false);

  const classCode = state.bondFormClassCode || state.bondFormType || "_default";

  const { data: premiumEstimate, loading: estimateLoading, estimate: fetchEstimate } = usePremiumEstimate();
  const estimateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    const amt = parseFloat(state.bondAmount) || 0;
    if (amt <= 0 || !state.bondFormType) return;
    estimateTimerRef.current = setTimeout(() => {
      fetchEstimate({
        bondType: state.bondFormType,
        bondAmount: amt,
        state: state.principalState || null,
        classCode: state.bondFormClassCode || null,
        riskLevel: null,
      });
    }, 500);
    return () => { if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current); };
  }, [state.bondAmount, state.bondFormType, state.principalState, state.bondFormClassCode]);

  const { data: bondFormDetail } = useGetBondForm(
    state.bondFormId!,
    { query: { queryKey: [`/api/bond-forms/${state.bondFormId}`] as const, enabled: !!state.bondFormId } }
  );

  const { data: uwQuestions, isLoading: questionsLoading } = useGetUnderwritingQuestions(
    classCode,
    { query: { queryKey: [`/api/underwriting/questions/${classCode}`] as const, enabled: !!classCode } }
  );

  const premiumMutation = useCalculatePremium();
  const riskMutation = useEvaluateRisk();
  const createBond = useCreateBond();
  const updateStatus = useUpdateBondStatus();
  const createPrincipal = useCreatePrincipal();

  const bondAmount = parseFloat(state.bondAmount) || 0;
  const aggregateLimit = bondFormDetail?.aggregateLimit ?? null;
  const aggregateRemaining = aggregateLimit !== null ? aggregateLimit - bondAmount : null;

  const hasBondAmount = state.bondAmount.trim() !== "" && bondAmount > 0;
  const hasAttorney = state.attorneyInFact.trim() !== "";
  const baseFieldsValid = hasBondAmount && hasAttorney;

  const needsUnderwritingQuestions = bondAmount > 5000;
  const needsCompanyInfo = bondAmount > 25000;

  const companyInfoComplete = !needsCompanyInfo || (
    state.companyDeclaredBankruptcy !== null &&
    state.companyClaimWithSurety !== null &&
    state.companyDeniedBonding !== null
  );

  const requiresReferral = needsCompanyInfo && (
    state.companyDeclaredBankruptcy === "yes" ||
    state.companyClaimWithSurety === "yes" ||
    state.companyDeniedBonding === "yes"
  );

  const uwQuestionsReady = !questionsLoading && uwQuestions !== undefined;
  const allUwQuestionsAnswered = !needsUnderwritingQuestions || (
    uwQuestionsReady && (
      uwQuestions && uwQuestions.length > 0
        ? uwQuestions.every((q) => {
            const answer = uwAnswers[q.id];
            return answer !== undefined && answer !== "";
          })
        : true
    )
  );

  const calculatePremiumEnabled = baseFieldsValid && !isCalculating && (
    bondAmount <= 5000
      ? true
      : (allUwQuestionsAnswered && companyInfoComplete)
  );

  const premiumHasBeenCalculated = state.premiumCalculated !== null;

  const summaryEnabled = premiumHasBeenCalculated && !requiresReferral && !state.referredToUnderwriter;

  const handleCalculatePremium = async () => {
    if (bondAmount <= 0) return;
    setIsCalculating(true);
    try {
      const premiumResult = await premiumMutation.mutateAsync({
        data: {
          bondAmount,
          classCode,
          state: state.principalState || null,
          answers: uwAnswers as Record<string, string>,
        },
      });

      const riskResult = await riskMutation.mutateAsync({
        data: {
          bondAmount,
          classCode,
          state: state.principalState || null,
          answers: uwAnswers as Record<string, string>,
          bondFormId: state.bondFormId || null,
        },
      });

      const finalTriageDecision = requiresReferral ? "requires_referral" : riskResult.triageDecision;

      const referralFlags: string[] = [];
      if (state.companyDeclaredBankruptcy === "yes") referralFlags.push("The company has declared bankruptcy.");
      if (state.companyClaimWithSurety === "yes") referralFlags.push("The company has been in a claim with a surety.");
      if (state.companyDeniedBonding === "yes") referralFlags.push("The company has been denied bonding in the past.");

      const combinedFlags = [...referralFlags, ...(riskResult.flags || [])];

      onUpdate({
        premiumCalculated: premiumResult.ratedPremium,
        surcharge: premiumResult.surcharge,
        commission: premiumResult.commission,
        netPremium: premiumResult.netPremium,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        triageDecision: finalTriageDecision,
        riskFlags: combinedFlags,
      });
    } catch (error) {
      console.error("Premium calculation failed:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleFileUpload = () => {
    setUploadedFiles([...uploadedFiles, `Financial_Statement_${uploadedFiles.length + 1}.pdf`]);
  };

  const handleSendToUnderwriter = () => {
    setShowReferralDialog(true);
  };

  const handleConfirmReferral = async () => {
    setIsSendingReferral(true);
    try {
      let bondId = state.bondId;

      if (!bondId) {
        const firstName = state.principalFirstName || "Unknown";
        const lastName = state.principalLastName || "Unknown";
        const email = state.principalEmail || "noreply@bondclicktrust.com";
        const phone = state.principalPhone || "000-000-0000";
        const companyName = state.principalCompanyName || state.clientName || undefined;

        let principalId: number;
        const existingPrincipals = await listPrincipals();

        const match = existingPrincipals.find(
          (p) =>
            p.email.toLowerCase() === email.toLowerCase() &&
            (!companyName || !p.companyName || p.companyName.toLowerCase() === companyName.toLowerCase())
        );

        if (match) {
          principalId = match.id;
        } else {
          const principal = await createPrincipal.mutateAsync({
            data: {
              firstName,
              lastName,
              companyName,
              email,
              phone,
              address: state.principalAddress || undefined,
              city: state.principalCity || undefined,
              state: state.principalState || undefined,
              zip: state.principalZip || undefined,
            },
          });
          principalId = principal.id;
        }

        const agentId = state.uwSelectedAgentId || user?.agentId || user?.id;
        const bondTypeValue = Object.values(BondType).includes(state.bondFormType as BondType)
          ? state.bondFormType as BondType
          : "contractor_license" as BondType;

        const bondData: CreateBondRequest = {
          bondType: bondTypeValue,
          classCode: state.bondFormClassCode ? String(state.bondFormClassCode) : state.bondFormType || undefined,
          obligeeName: state.obligeeName || "TBD",
          bondAmount,
          premium: state.premiumCalculated || undefined,
          surcharge: state.surcharge || undefined,
          commission: state.commission || undefined,
          netPremium: state.netPremium || undefined,
          effectiveDate: state.effectiveDate || undefined,
          expirationDate: state.expirationDate || undefined,
          description: state.bondDescription || undefined,
          principalId,
          agentId: agentId || undefined,
          notes: referralComment || state.underwritingNotes || undefined,
          riskScore: state.riskScore || undefined,
          riskLevel: state.riskLevel || undefined,
          triageDecision: state.triageDecision || undefined,
          underwritingData: state.underwritingAnswers
            ? { answers: state.underwritingAnswers, flags: state.riskFlags }
            : undefined,
        };

        const created = await createBond.mutateAsync({ data: bondData });
        bondId = created.id;
        onUpdate({ bondId: created.id, bondNumber: created.bondNumber || "" });
      }

      await updateStatus.mutateAsync({
        id: bondId!,
        data: {
          status: "requires_referral",
          notes: referralComment || "Referred to underwriter for review.",
        },
      });

      onUpdate({
        referralComments: referralComment,
        referredToUnderwriter: true,
      });

      setShowReferralDialog(false);
      setShowReferralSuccess(true);
    } catch (error) {
      console.error("Failed to send referral:", error);
    } finally {
      setIsSendingReferral(false);
    }
  };

  const handleReturnToDashboard = () => {
    if (onDashboard) {
      onDashboard();
    }
  };

  const handleBondAmountChange = (value: string) => {
    onUpdate({
      bondAmount: value,
      premiumCalculated: null,
      surcharge: null,
      commission: null,
      netPremium: null,
      riskScore: null,
      riskLevel: null,
      triageDecision: null,
      riskFlags: [],
      companyDeclaredBankruptcy: null,
      companyClaimWithSurety: null,
      companyDeniedBonding: null,
      referredToUnderwriter: false,
    });
  };

  const handleCompanyInfoChange = (field: string, value: CompanyInfoAnswer) => {
    onUpdate({
      [field]: value,
      premiumCalculated: null,
      surcharge: null,
      commission: null,
      netPremium: null,
      riskScore: null,
      riskLevel: null,
      triageDecision: null,
      riskFlags: [],
    });
  };

  const triageConfig = {
    instant_issue: { icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30", label: "Instant Issue" },
    requires_referral: { icon: Shield, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", label: "Requires Referral" },
    indemnity_review: { icon: ShieldAlert, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", label: "Indemnity Review Required" },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Bond Information</h2>
        <p className="text-sm text-muted-foreground">
          Enter bond details, calculate premium, and upload supporting documents.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium text-sm">Bond Details</h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Bond Description <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Describe the purpose of this bond..."
              value={state.bondDescription}
              onChange={(e) => onUpdate({ bondDescription: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Bond Amount ($) *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="h-11 pl-9"
                  placeholder="50000"
                  value={state.bondAmount}
                  onChange={(e) => handleBondAmountChange(e.target.value)}
                />
              </div>
              {aggregateLimit !== null && bondAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining aggregate for this class: {formatCurrency(Math.max(0, aggregateLimit))}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Attorney-in-Fact *</Label>
              <Select value={state.attorneyInFact} onValueChange={(v) => onUpdate({ attorneyInFact: v })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select attorney-in-fact" />
                </SelectTrigger>
                <SelectContent>
                  {ATTORNEYS_IN_FACT.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsCompanyInfo && (
            <div className="space-y-4 mt-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-2">
                <p className="text-sm font-medium">Has the company ever declared bankruptcy?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyDeclaredBankruptcy === "yes" ? "default" : "outline"}
                    className={`px-4 ${state.companyDeclaredBankruptcy === "yes" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyDeclaredBankruptcy", "yes")}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyDeclaredBankruptcy === "no" ? "default" : "outline"}
                    className={`px-4 ${state.companyDeclaredBankruptcy === "no" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyDeclaredBankruptcy", "no")}
                  >
                    No
                  </Button>
                </div>
                {state.companyDeclaredBankruptcy === "yes" && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>This option will require underwriter approval. The company has declared bankruptcy.</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Has the company ever been in a claim with a surety?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyClaimWithSurety === "yes" ? "default" : "outline"}
                    className={`px-4 ${state.companyClaimWithSurety === "yes" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyClaimWithSurety", "yes")}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyClaimWithSurety === "no" ? "default" : "outline"}
                    className={`px-4 ${state.companyClaimWithSurety === "no" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyClaimWithSurety", "no")}
                  >
                    No
                  </Button>
                </div>
                {state.companyClaimWithSurety === "yes" && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>This option will require underwriter approval. The company has been in a claim with a surety.</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Has the company ever been denied bonding in the past?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyDeniedBonding === "yes" ? "default" : "outline"}
                    className={`px-4 ${state.companyDeniedBonding === "yes" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyDeniedBonding", "yes")}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state.companyDeniedBonding === "no" ? "default" : "outline"}
                    className={`px-4 ${state.companyDeniedBonding === "no" ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleCompanyInfoChange("companyDeniedBonding", "no")}
                  >
                    No
                  </Button>
                </div>
                {state.companyDeniedBonding === "yes" && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>This option will require underwriter approval. The company has been denied bonding in the past.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {bondAmount > 0 && (
            <div className="bg-muted/30 p-3 rounded-lg border border-border/50 text-sm">
              <span className="text-muted-foreground">Bond Amount: </span>
              <span className="font-semibold">{formatCurrency(bondAmount)}</span>
            </div>
          )}

          {aggregateLimit !== null && (
            <div className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
              aggregateRemaining !== null && aggregateRemaining < 0
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-blue-500/10 border-blue-500/30"
            }`}>
              <TrendingDown className="h-4 w-4" />
              <div>
                <span className="text-muted-foreground">Aggregate Limit: </span>
                <span className="font-semibold">{formatCurrency(aggregateLimit)}</span>
                {bondAmount > 0 && aggregateRemaining !== null && (
                  <>
                    <span className="text-muted-foreground"> | Remaining: </span>
                    <span className={`font-semibold ${aggregateRemaining < 0 ? "text-red-400" : "text-emerald-500"}`}>
                      {formatCurrency(Math.max(0, aggregateRemaining))}
                    </span>
                    {aggregateRemaining < 0 && (
                      <span className="text-red-400 text-xs ml-2">(Exceeds limit)</span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {bondAmount > 0 && state.bondFormType && !premiumHasBeenCalculated && (
            <div className="bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Premium Estimate</span>
                {estimateLoading && <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
              </div>
              {premiumEstimate ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-violet-700 dark:text-violet-300">
                      {formatCurrency(premiumEstimate.lowEstimate)} &ndash; {formatCurrency(premiumEstimate.highEstimate)}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      premiumEstimate.confidence === "high" ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" :
                      premiumEstimate.confidence === "medium" ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" :
                      "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                    }`}>
                      {premiumEstimate.confidence} confidence
                    </span>
                  </div>
                  {premiumEstimate.factors.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {premiumEstimate.factors.map((f, i) => (
                        <span key={i} className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-violet-400 italic">{premiumEstimate.disclaimer}</p>
                </>
              ) : !estimateLoading ? (
                <p className="text-[11px] text-violet-400">Enter bond amount for an estimate</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {hasBondAmount && state.bondFormName && (
        <DocumentChecklist
          bondType={state.bondFormType}
          bondFormName={state.bondFormName}
          bondAmount={bondAmount}
          state={state.principalState}
          riskLevel={state.riskLevel}
          companyName={state.principalCompanyName}
          hasHistory={!!state.clientId}
          documentsCollected={state.documentsCollected || []}
          onUpdateDocuments={(docs) => onUpdate({ documentsCollected: docs })}
        />
      )}

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Documents and Attachments
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium mb-1">Financial Statements <span className="text-muted-foreground text-xs">(optional)</span></p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleFileUpload} className="gap-1">
                  <Upload className="h-3.5 w-3.5" /> Choose
                </Button>
                <span className="text-xs text-muted-foreground">
                  {uploadedFiles.filter(f => f.includes("Financial")).length > 0 
                    ? `${uploadedFiles.filter(f => f.includes("Financial")).length} file(s)` 
                    : "None"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Additional Docs <span className="text-muted-foreground text-xs">(optional)</span></p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleFileUpload} className="gap-1">
                  <Upload className="h-3.5 w-3.5" /> Choose
                </Button>
                <span className="text-xs text-muted-foreground">
                  {uploadedFiles.filter(f => !f.includes("Financial")).length > 0 
                    ? `${uploadedFiles.filter(f => !f.includes("Financial")).length} file(s)` 
                    : "None"}
                </span>
              </div>
            </div>
          </div>
          {uploadedFiles.length > 0 && (
            <div className="space-y-1 mt-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <Upload className="h-3 w-3" /> {f}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {needsUnderwritingQuestions && (
        <>
          {uwQuestions && uwQuestions.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  <path d="M9 3c-1 1-1.5 3 0 4M15 3c1 1 1.5 3 0 4" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold">Looks like we need a few more details!</p>
                <p className="text-sm text-foreground/80 mt-0.5">
                  Your application needs a few more details in order to calculate premium.
                </p>
              </div>
            </div>
          )}

          <Card className="border-border/50">
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" /> Underwriting Questions
              </h3>
              <p className="text-xs text-muted-foreground">
                These questions are tailored to the selected bond type. Answers affect risk scoring and premium rates.
              </p>
              {questionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading questions...
                </div>
              ) : uwQuestions && uwQuestions.length > 0 ? (
                uwQuestions.map((q) => (
                  <div key={q.id} className="space-y-1.5">
                    <p className="text-sm font-medium">{q.questionText}</p>
                    {q.answerType === "boolean" ? (
                      <Select
                        value={uwAnswers[q.id] || ""}
                        onValueChange={(v) => setUwAnswers({ ...uwAnswers, [q.id]: v })}
                      >
                        <SelectTrigger className="w-48 h-9">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : q.answerType === "select" && q.options ? (
                      <Select
                        value={uwAnswers[q.id] || ""}
                        onValueChange={(v) => setUwAnswers({ ...uwAnswers, [q.id]: v })}
                      >
                        <SelectTrigger className="w-48 h-9">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {(q.options as string[]).map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : q.answerType === "number" ? (
                      <Input
                        type="number"
                        className="w-48 h-9"
                        placeholder="0"
                        value={uwAnswers[q.id] || ""}
                        onChange={(e) => setUwAnswers({ ...uwAnswers, [q.id]: e.target.value })}
                      />
                    ) : (
                      <Input
                        className="w-48 h-9"
                        placeholder="Answer..."
                        value={uwAnswers[q.id] || ""}
                        onChange={(e) => setUwAnswers({ ...uwAnswers, [q.id]: e.target.value })}
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-2">No specific underwriting questions for this bond type.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex justify-center">
            <Button
              onClick={handleCalculatePremium}
              disabled={!calculatePremiumEnabled || premiumHasBeenCalculated}
              className="gap-2"
            >
              {isCalculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              {isCalculating ? "Calculating..." : requiresReferral ? "Calculate Estimated Premium*" : "Calculate Premium"}
            </Button>
          </div>

          {premiumHasBeenCalculated && (
            <div className="space-y-3">
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground font-medium">
                  {requiresReferral ? "Estimated Premium*" : "Rated Premium"}
                </p>
                <p className="text-3xl font-bold">{formatCurrency(state.premiumCalculated!)}</p>
                {requiresReferral && (
                  <p className="text-xs text-muted-foreground mt-1">*Subject to change based on underwriter review of selected options.</p>
                )}
              </div>

              {!requiresReferral && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg">
                    <div className="text-xs text-muted-foreground">Rated Premium</div>
                    <div className="text-lg font-bold text-emerald-500">{formatCurrency(state.premiumCalculated!)}</div>
                  </div>
                  {state.surcharge !== null && (
                    <div className="bg-muted/30 border border-border/50 px-3 py-2 rounded-lg">
                      <div className="text-xs text-muted-foreground">Surcharge</div>
                      <div className="text-lg font-semibold">{formatCurrency(state.surcharge)}</div>
                    </div>
                  )}
                  {state.commission !== null && (
                    <div className="bg-muted/30 border border-border/50 px-3 py-2 rounded-lg">
                      <div className="text-xs text-muted-foreground">Commission</div>
                      <div className="text-lg font-semibold text-blue-500">{formatCurrency(state.commission)}</div>
                    </div>
                  )}
                  {state.netPremium !== null && (
                    <div className="bg-muted/30 border border-border/50 px-3 py-2 rounded-lg">
                      <div className="text-xs text-muted-foreground">Net Premium</div>
                      <div className="text-lg font-semibold">{formatCurrency(state.netPremium)}</div>
                    </div>
                  )}
                </div>
              )}

              {state.triageDecision && !requiresReferral && (
                <div className={`p-3 rounded-lg border flex items-start gap-3 ${
                  triageConfig[state.triageDecision as keyof typeof triageConfig]?.bg || "bg-muted/30 border-border/50"
                }`}>
                  {(() => {
                    const cfg = triageConfig[state.triageDecision as keyof typeof triageConfig];
                    if (!cfg) return null;
                    const Icon = cfg.icon;
                    return <Icon className={`h-5 w-5 mt-0.5 ${cfg.color}`} />;
                  })()}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${
                        triageConfig[state.triageDecision as keyof typeof triageConfig]?.color
                      }`}>
                        {triageConfig[state.triageDecision as keyof typeof triageConfig]?.label}
                      </span>
                      {state.riskScore !== null && (
                        <span className="text-xs text-muted-foreground">
                          Risk Score: {state.riskScore}/100
                        </span>
                      )}
                    </div>
                    {state.riskFlags && state.riskFlags.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {state.riskFlags.map((flag, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">•</span> {flag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {premiumHasBeenCalculated && requiresReferral && !state.referredToUnderwriter && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  <path d="M9 3c-1 1-1.5 3 0 4M15 3c1 1 1.5 3 0 4" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Hi! It's your underwriter.</p>
                <p className="text-sm text-foreground/80 mt-1">
                  Your application must be referred due to the following:
                </p>
                <ul className="mt-2 space-y-1">
                  {state.riskFlags && state.riskFlags.map((flag, i) => (
                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">•</span> {flag}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-foreground/80 mt-3">
                  This application requires closer review before we can proceed.
                </p>
                <p className="text-sm text-foreground/80">
                  When you're done filling it out, send it over and I'll take a closer look.
                </p>
                <div className="mt-4">
                  <Button onClick={handleSendToUnderwriter} className="gap-2">
                    <Send className="h-4 w-4" /> Send to Underwriter
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> About the Applicant
        </Button>
        <Button onClick={onNext} disabled={!summaryEnabled} className="gap-2">
          Summary <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      </div>

      <div className="hidden lg:block sticky top-4 space-y-4">
        <AIFormAssistant
          currentStep={4}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          bondAmount={state.bondAmount}
          principalCompanyName={state.principalCompanyName}
          principalState={state.principalState}
          obligeeName={state.obligeeName}
          effectiveDate={state.effectiveDate}
          expirationDate={state.expirationDate}
          onApplySuggestion={(field, value) => onUpdate({ [field]: value })}
        />

        {premiumHasBeenCalculated && (
          <SmartAlerts
            context={{
              bondType: state.bondFormType,
              bondAmount: bondAmount,
              state: state.principalState,
              riskLevel: state.riskLevel || undefined,
              riskScore: state.riskScore || undefined,
              triageDecision: state.triageDecision || undefined,
            }}
          />
        )}

        <DocumentChecklist
          bondType={state.bondFormType}
          bondFormName={state.bondFormName}
          bondAmount={bondAmount}
          state={state.principalState}
          riskLevel={state.riskLevel || null}
          companyName={state.principalCompanyName}
          hasHistory={state.companyClaimWithSurety === "yes" || state.companyDeniedBonding === "yes"}
          documentsCollected={state.documentsCollected || []}
          onUpdateDocuments={(docs) => onUpdate({ documentsCollected: docs })}
        />
      </div>

      <div className="lg:hidden col-span-1 space-y-4">
        <AIFormAssistant
          currentStep={4}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          bondAmount={state.bondAmount}
          principalCompanyName={state.principalCompanyName}
          principalState={state.principalState}
          obligeeName={state.obligeeName}
          effectiveDate={state.effectiveDate}
          expirationDate={state.expirationDate}
          onApplySuggestion={(field, value) => onUpdate({ [field]: value })}
        />

        {premiumHasBeenCalculated && (
          <SmartAlerts
            context={{
              bondType: state.bondFormType,
              bondAmount: bondAmount,
              state: state.principalState,
              riskLevel: state.riskLevel || undefined,
              riskScore: state.riskScore || undefined,
              triageDecision: state.triageDecision || undefined,
            }}
          />
        )}

        <DocumentChecklist
          bondType={state.bondFormType}
          bondFormName={state.bondFormName}
          bondAmount={bondAmount}
          state={state.principalState}
          riskLevel={state.riskLevel || null}
          companyName={state.principalCompanyName}
          hasHistory={state.companyClaimWithSurety === "yes" || state.companyDeniedBonding === "yes"}
          documentsCollected={state.documentsCollected || []}
          onUpdateDocuments={(docs) => onUpdate({ documentsCollected: docs })}
        />
      </div>

      {showReferralDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Refer Application to Underwriter</h3>
              <button onClick={() => setShowReferralDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              While your application is in review, you will not be able to make changes.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please do not enter any personally identifiable information (for example, social security numbers, passport number, driver's license number, etc.)
            </p>
            <div className="space-y-2 mb-4">
              <Label className="text-sm font-medium">Comments</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add any comments for the underwriter..."
                value={referralComment}
                onChange={(e) => setReferralComment(e.target.value)}
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleConfirmReferral}
                disabled={isSendingReferral}
                className="gap-2 w-full"
              >
                {isSendingReferral ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isSendingReferral ? "Sending..." : "Send to Underwriter"}
              </Button>
              <button
                onClick={() => setShowReferralDialog(false)}
                className="text-sm text-primary hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showReferralSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6 text-center">
            <h3 className="text-lg font-semibold mb-3">Refer Application to Underwriter</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Your application referral has been sent. Your underwriter will review the request and let you know their decision as soon as possible.
            </p>
            <div className="mt-5">
              <Button onClick={handleReturnToDashboard} className="gap-2">
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
