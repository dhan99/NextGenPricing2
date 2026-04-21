import { useState, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Download, CheckCircle2, Upload, Home, Loader2, CreditCard, FileText, Receipt, Printer, ExternalLink, FileUp, AlertCircle, Mail, Send, Copy, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isValidEmail } from "@/lib/email-validation";
import { useCreateBond, useUpdateBond, useUpdateBondStatus, useCreatePrincipal, listPrincipals, useIssueBond, useUploadCompletedBond, BondType } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AIRiskAssessmentPanel } from "@/components/ai/ai-risk-assessment-panel";
import type { WizardState } from "../wizard-types";

interface Step6Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onBack: () => void;
  onDashboard: () => void;
}

export function Step6Payment({ state, onUpdate, onBack, onDashboard }: Step6Props) {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createBond = useCreateBond();
  const updateBond = useUpdateBond();
  const updateStatus = useUpdateBondStatus();
  const createPrincipal = useCreatePrincipal();
  const issueBond = useIssueBond();
  const uploadCompleted = useUploadCompletedBond();
  const { agentId, token } = useAuth();

  const billingType = state.billingType || "agency_bill";
  const billingAddress = state.usePrincipalAsBilling ? state.principalAddress : state.billingAddress;
  const billingCity = state.usePrincipalAsBilling ? state.principalCity : state.billingCity;
  const billingState = state.usePrincipalAsBilling ? state.principalState : state.billingState;
  const billingZip = state.usePrincipalAsBilling ? state.principalZip : state.billingZip;

  const bondAmount = parseFloat(state.bondAmount) || 0;
  const premium = state.premiumCalculated || 0;
  const surchargeAmt = state.surcharge || Math.round(premium * 0.03);
  const serviceFee = Math.round(premium * 0.05);
  const stampingFee = Math.round(premium * 0.0025);
  const total = premium + surchargeAmt + serviceFee + stampingFee;

  const createPrincipalAndBond = async () => {
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

    if (state.bondId) {
      const updated = await updateBond.mutateAsync({
        id: state.bondId,
        data: {
          principalId: principalId as any,
          bondType: (Object.values(BondType).includes(state.bondFormType as BondType) ? state.bondFormType : "contractor_license") as any,
          obligeeName: state.obligeeName,
          bondAmount: bondAmount,
          effectiveDate: state.effectiveDate || undefined,
          expirationDate: state.expirationDate || undefined,
          description: state.bondDescription || undefined,
          notes: state.underwritingNotes || undefined,
        },
      });
      return updated;
    }

    const bond = await createBond.mutateAsync({
      data: {
        bondType: (Object.values(BondType).includes(state.bondFormType as BondType) ? state.bondFormType : "contractor_license") as BondType,
        classCode: state.bondFormClassCode ? String(state.bondFormClassCode) : state.bondFormType || undefined,
        obligeeName: state.obligeeName,
        bondAmount: bondAmount,
        premium: state.premiumCalculated || undefined,
        surcharge: state.surcharge || undefined,
        commission: state.commission || undefined,
        netPremium: state.netPremium || undefined,
        effectiveDate: state.effectiveDate || undefined,
        expirationDate: state.expirationDate || undefined,
        description: state.bondDescription || undefined,
        principalId: principalId,
        agentId: state.uwSelectedAgentId || agentId || undefined,
        notes: state.underwritingNotes || undefined,
        riskScore: state.riskScore || undefined,
        riskLevel: state.riskLevel || undefined,
        triageDecision: state.triageDecision || undefined,
        underwritingData: state.underwritingAnswers ? { answers: state.underwritingAnswers, flags: state.riskFlags } : undefined,
        billingType: billingType as "agency_bill" | "direct_bill" | "credit_card",
        billingAddress: billingAddress || undefined,
        billingCity: billingCity || undefined,
        billingState: billingState || undefined,
        billingZip: billingZip || undefined,
      },
    });

    return bond;
  };

  const handleBuyBond = async () => {
    setPurchasing(true);
    setError(null);

    try {
      const bond = await createPrincipalAndBond();
      const triageDecision = state.triageDecision || "instant_issue";

      if (triageDecision === "instant_issue") {
        const issueResult = await issueBond.mutateAsync({
          id: bond.id,
          data: {
            billingType: billingType as "agency_bill" | "direct_bill" | "credit_card",
            billingAddress: billingAddress || undefined,
            billingCity: billingCity || undefined,
            billingState: billingState || undefined,
            billingZip: billingZip || undefined,
          },
        });

        onUpdate({
          bondId: issueResult.bond.id,
          bondNumber: issueResult.bondNumber,
          isPurchased: true,
        });
      } else {
        const statusMap: Record<string, string> = {
          requires_referral: "requires_referral",
          indemnity_review: "indemnity_in_review",
        };
        const initialStatus = statusMap[triageDecision] || "submitted";

        await updateStatus.mutateAsync({
          id: bond.id,
          data: { status: initialStatus as "submitted" | "requires_referral" | "indemnity_in_review" },
        });

        onUpdate({
          bondId: bond.id,
          bondNumber: bond.bondNumber,
          isPurchased: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bond. Please try again.");
      setPurchasing(false);
    }
  };

  const handleRequestCCPayment = async () => {
    setSendingPaymentRequest(true);
    setError(null);

    try {
      const bond = await createPrincipalAndBond();

      const triageDecision = state.triageDecision || "instant_issue";
      if (triageDecision !== "instant_issue") {
        const statusMap: Record<string, string> = {
          requires_referral: "requires_referral",
          indemnity_review: "indemnity_in_review",
        };
        const initialStatus = statusMap[triageDecision] || "submitted";
        await updateStatus.mutateAsync({
          id: bond.id,
          data: { status: initialStatus as "submitted" | "requires_referral" | "indemnity_in_review" },
        });
      } else {
        await updateStatus.mutateAsync({
          id: bond.id,
          data: { status: "pending_payment" },
        });
      }

      const ccEmail = state.ccPrincipalEmail || bond.principal?.email || state.principalEmail;
      const ccPhone = state.ccPrincipalPhone || bond.principal?.phone || state.principalPhone;

      const apiBase = "/api";

      const response = await fetch(`${apiBase}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          bondId: bond.id,
          principalEmail: ccEmail,
          principalPhone: ccPhone,
          amount: total.toString(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create payment request");
      }

      const paymentData = await response.json();

      onUpdate({
        bondId: bond.id,
        bondNumber: bond.bondNumber,
        ccPaymentRequested: true,
        ccPaymentToken: paymentData.token,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send payment request.");
      setSendingPaymentRequest(false);
    }
  };

  const handleUploadCompleted = async () => {
    if (!uploadFileName || !state.bondId) return;
    try {
      await uploadCompleted.mutateAsync({
        id: state.bondId,
        data: { fileName: uploadFileName },
      });
      setUploadSuccess(true);
    } catch {
      setError("Failed to record uploaded bond.");
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFileName(file.name);
    }
  };

  const openDocument = (docType: string) => {
    if (!state.bondId) return;
    window.open(`/api/bonds/${state.bondId}/documents/${docType}/view?token=${encodeURIComponent(token || '')}`, "_blank");
  };

  const paymentLink = useMemo(() => {
    if (!state.ccPaymentToken) return "";
    const base = window.location.origin;
    const basePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    return `${base}${basePath}/pay/${state.ccPaymentToken}`;
  }, [state.ccPaymentToken]);

  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = paymentLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (billingType === "credit_card" && state.ccPaymentRequested) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="text-center py-4 sm:py-8">
          <div className="w-14 h-14 sm:w-20 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Send className="h-7 w-7 sm:h-10 sm:w-10 text-primary" />
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">Payment Request Sent!</h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto px-2">
            A secure payment link has been generated for the principal at{" "}
            <span className="font-medium text-foreground break-all">{state.ccPrincipalEmail || state.principalEmail}</span>.
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Bond Number</p>
                <p className="text-base sm:text-xl font-bold font-mono truncate">{state.bondNumber}</p>
              </div>
              <Badge className="bg-amber-500 text-white text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 shrink-0 w-fit">
                Awaiting Payment
              </Badge>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Total Due</span>
                <p className="font-medium text-base sm:text-lg text-primary">{formatCurrency(total)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Payment Method</span>
                <p className="font-medium text-xs sm:text-sm">Credit Card (via email link)</p>
              </div>
            </div>
            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5 text-primary" /> Payment Link for Principal
              </p>
              <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                <div className="flex-1 bg-background border border-border rounded-md px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-mono break-all select-all min-w-0">
                  {paymentLink}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 shrink-0 h-8 sm:h-9 text-xs w-full sm:w-auto"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy</>
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs h-8"
                  onClick={() => window.open(paymentLink, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" /> Open in New Tab
                </Button>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Share this link with the principal to complete payment. In production, this would be sent automatically via email.
              </p>
            </div>

            <Separator />
            <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
              <p>The bond will be purchased and recorded once payment is received.</p>
              <p className="text-[11px] sm:text-xs">The payment link expires in 48 hours. The principal will verify their identity via a one-time code sent to their phone before entering card details.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center pt-2 sm:pt-4">
          <Button onClick={onDashboard} className="gap-2 w-full sm:w-auto">
            <Home className="h-4 w-4" /> Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (state.isPurchased) {
    const isInstantIssue = state.triageDecision === "instant_issue" || !state.triageDecision;

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="text-center py-4 sm:py-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500" />
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">
            {isInstantIssue ? "Bond Issued Successfully!" : "Bond Application Submitted!"}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground px-2">
            {isInstantIssue
              ? "Your bond has been issued. Download your documents below."
              : "Your application has been submitted for underwriting review."}
          </p>
        </div>

        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Bond Number</p>
                <p className="text-base sm:text-xl font-bold font-mono truncate">{state.bondNumber}</p>
              </div>
              <Badge className={`text-white text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 shrink-0 w-fit ${isInstantIssue ? "bg-emerald-500" : "bg-amber-500"}`}>
                {isInstantIssue ? "Issued" : "Under Review"}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Principal</span>
                <p className="font-medium text-xs sm:text-sm truncate">{state.principalCompanyName || state.clientName}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Obligee</span>
                <p className="font-medium text-xs sm:text-sm truncate">{state.obligeeName}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Bond Amount</span>
                <p className="font-medium text-xs sm:text-sm">{formatCurrency(bondAmount)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Cost</span>
                <p className="font-medium text-xs sm:text-sm">{formatCurrency(total)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Payment Method</span>
                <p className="font-medium text-xs sm:text-sm capitalize">{billingType.replace(/_/g, " ")}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Effective Period</span>
                <p className="font-medium text-xs sm:text-sm">{state.effectiveDate} to {state.expirationDate}</p>
              </div>
              {billingAddress && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Billing Address</span>
                  <p className="font-medium text-xs sm:text-sm">{[billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(", ")}</p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bond Premium</span>
                <span>{formatCurrency(premium)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Surcharge</span>
                <span>{formatCurrency(surchargeAmt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service Fee</span>
                <span>{formatCurrency(serviceFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stamping Fee</span>
                <span>{formatCurrency(stampingFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total Paid</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <AIRiskAssessmentPanel
          bondData={{
            bondType: state.bondFormType,
            bondAmount: bondAmount,
            classCode: state.bondFormClassCode || state.bondFormType || "_default",
            state: state.principalState || null,
            principalCompanyName: state.principalCompanyName || state.clientName,
            obligeeName: state.obligeeName,
            riskScore: state.riskScore,
            riskLevel: state.riskLevel,
            riskFlags: state.riskFlags || [],
            underwritingAnswers: (state.underwritingAnswers || {}) as Record<string, string>,
            companyDeclaredBankruptcy: state.companyDeclaredBankruptcy,
            companyClaimWithSurety: state.companyClaimWithSurety,
            companyDeniedBonding: state.companyDeniedBonding,
          }}
          autoRun
        />

        {isInstantIssue && (
          <Card className="border-border/50">
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Download Documents
              </h3>
              <div className="space-y-1 sm:space-y-2">
                <button
                  onClick={() => openDocument("bond_document")}
                  className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline w-full text-left py-2 px-2 rounded hover:bg-primary/5 transition-colors min-h-[40px]"
                >
                  <FileText className="h-4 w-4 shrink-0" /> Bond Document Package
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50 shrink-0" />
                </button>
                <button
                  onClick={() => openDocument("invoice")}
                  className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline w-full text-left py-2 px-2 rounded hover:bg-primary/5 transition-colors min-h-[40px]"
                >
                  <Receipt className="h-4 w-4 shrink-0" /> Bond Invoice
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50 shrink-0" />
                </button>
                <button
                  onClick={() => openDocument("application")}
                  className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline w-full text-left py-2 px-2 rounded hover:bg-primary/5 transition-colors min-h-[40px]"
                >
                  <Printer className="h-4 w-4 shrink-0" /> Bond Application
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50 shrink-0" />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardContent className="p-3 sm:p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadSuccess ? (
              <div className="flex items-center gap-3 text-emerald-600">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Completed Bond Uploaded</p>
                  <p className="text-xs text-muted-foreground truncate">{uploadFileName}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <FileUp className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Upload Completed Bond</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                      Once the bond is signed and executed, upload the completed document for reporting.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleFileSelect} className="gap-1 h-8">
                    <Upload className="h-3.5 w-3.5" /> Select File
                  </Button>
                  {uploadFileName && (
                    <>
                      <span className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[200px]">{uploadFileName}</span>
                      <Button size="sm" onClick={handleUploadCompleted} className="gap-1 ml-auto h-8">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Upload
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center pt-2 sm:pt-4">
          <Button onClick={onDashboard} className="gap-2 w-full sm:w-auto">
            <Home className="h-4 w-4" /> Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const isCreditCard = billingType === "credit_card";
  const ccPhone = (state.ccPrincipalPhone || state.principalPhone || "").replace(/\D/g, "");
  const ccEmail = state.ccPrincipalEmail || state.principalEmail || "";
  const ccReady = isCreditCard && state.ccOtpConsent && ccPhone.length === 10 && !!ccEmail.trim() && isValidEmail(ccEmail);
  const directBillReady = billingType === "direct_bill" && (
    (state.usePrincipalAsBilling && state.principalAddress && state.principalCity && state.principalState && state.principalZip) ||
    (!state.usePrincipalAsBilling && state.billingAddress && state.billingCity && state.billingState && state.billingZip)
  );
  const agencyBillReady = billingType === "agency_bill";

  const canPurchase = state.conditionsAccepted && state.termsAccepted && (agencyBillReady || directBillReady || ccReady);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold mb-1">Payment & Confirmation</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Review your total and complete the purchase.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Application Summary
          </h3>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bond Premium</span>
              <span>{formatCurrency(premium)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Surcharge</span>
              <span>{formatCurrency(surchargeAmt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Fee</span>
              <span>{formatCurrency(serviceFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stamping Fee</span>
              <span>{formatCurrency(stampingFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-sm sm:text-base">
              <span>Total Due</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
          {state.commission ? (
            <div className="text-[11px] sm:text-xs text-muted-foreground border-t pt-2 mt-2">
              Agent Commission: {formatCurrency(state.commission)} &middot; Net Premium to Surety: {formatCurrency(state.netPremium || 0)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Billing Method
          </h3>
          <div className="p-2.5 sm:p-3 bg-muted/30 rounded-lg text-xs sm:text-sm">
            <span className="font-medium capitalize">{billingType.replace(/_/g, " ")}</span>
            {billingType === "direct_bill" && billingAddress && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                Billing to: {[billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(", ")}
              </p>
            )}
            {isCreditCard && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 break-all">
                Payment link will be emailed to {state.ccPrincipalEmail || state.principalEmail}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 text-xs sm:text-sm text-red-400">
            {error}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardContent className="p-3 sm:p-4">
          <div className="text-center space-y-3 sm:space-y-4">
            <ShieldCheck className="h-8 w-8 sm:h-10 sm:w-10 text-primary mx-auto" />
            <div>
              <p className="text-sm font-medium">Secure Purchase</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Your information is protected with 256-bit SSL encryption.
              </p>
            </div>

            {isCreditCard ? (
              <Button
                className="w-full h-11 sm:h-12 text-sm sm:text-base gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
                onClick={handleRequestCCPayment}
                disabled={sendingPaymentRequest || !canPurchase}
              >
                {sendingPaymentRequest ? (
                  <>
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 sm:h-5 sm:w-5" /> Request Payment — {formatCurrency(total)}
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="w-full h-11 sm:h-12 text-sm sm:text-base gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                onClick={handleBuyBond}
                disabled={purchasing || !canPurchase}
              >
                {purchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" /> Buy Bond — {formatCurrency(total)}
                  </>
                )}
              </Button>
            )}

            {(!state.conditionsAccepted || !state.termsAccepted) && (
              <p className="text-[11px] sm:text-xs text-amber-500">
                Please accept all conditions in the previous step before purchasing.
              </p>
            )}
            {billingType === "direct_bill" && !directBillReady && (
              <p className="text-[11px] sm:text-xs text-amber-500">
                Please fill in all billing address fields for Direct Bill on the Summary step.
              </p>
            )}
            {isCreditCard && !ccReady && (
              <p className="text-[11px] sm:text-xs text-amber-500">
                Please fill in the principal's phone and email, and accept the OTP consent on the Summary step.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-start pt-2 sm:pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          Back to Summary
        </Button>
      </div>
    </div>
  );
}
