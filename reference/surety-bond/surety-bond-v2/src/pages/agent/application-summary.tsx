import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useGetBond, useIssueBond, useUpdateBondStatus, useGetBondEndorsements,
  BondStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, ShieldCheck, CreditCard, Receipt,
  Building, User, MapPin, CheckCircle2, Clock, DollarSign, Send,
  Info, Phone, Mail, Copy, Link2, ExternalLink, Home, PartyPopper,
  PenLine, AlertTriangle, TrendingUp, TrendingDown
} from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/phone-mask";
import { isValidEmail } from "@/lib/email-validation";
import { EmailInput } from "@/components/ui/email-input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useAuth } from "@/hooks/use-auth";

export function ApplicationSummary() {
  const [, params] = useRoute("/agent/bonds/:id/application-summary");
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const { data: bond, isLoading } = useGetBond(id, {
    query: { enabled: !!id, queryKey: ["getBond", id], staleTime: 0, refetchOnMount: "always" },
  });
  const { data: endorsements = [] } = useGetBondEndorsements(id, {
    query: { enabled: !!id, queryKey: ["getBondEndorsements", id], staleTime: 0, refetchOnMount: "always" },
  });
  const issueBondMutation = useIssueBond();
  const updateStatus = useUpdateBondStatus();
  const [issuedBondNumber, setIssuedBondNumber] = useState<string | null>(null);
  const [selectedBilling, setSelectedBilling] = useState<string>("agency_bill");
  const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
  const [usePrincipalAsBilling, setUsePrincipalAsBilling] = useState(true);
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [ccPrincipalPhone, setCcPrincipalPhone] = useState("");
  const [ccPrincipalEmail, setCcPrincipalEmail] = useState("");
  const [ccOtpConsent, setCcOtpConsent] = useState(false);
  const [ccPaymentRequested, setCcPaymentRequested] = useState(false);
  const [ccPaymentToken, setCcPaymentToken] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [billingConfirmed, setBillingConfirmed] = useState(false);

  const paymentLink = useMemo(() => {
    if (!ccPaymentToken) return "";
    const base = window.location.origin;
    const basePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    return `${base}${basePath}/pay/${ccPaymentToken}`;
  }, [ccPaymentToken]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 sm:h-64 p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin h-6 w-6 sm:h-8 sm:w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-xs sm:text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!bond) return <div>Bond not found</div>;

  const isAlreadyIssued = bond.status === "issued";
  const hasApprovedEndorsements = endorsements.some((e) => e.status === "approved" || e.status === "applied");
  const isReissue = hasApprovedEndorsements;

  if (issuedBondNumber || isAlreadyIssued) {
    const displayBondNumber = issuedBondNumber || bond.bondNumber;
    return (
      <div className="max-w-xl mx-auto py-12 px-4 animate-fadeUp">
        <Card className="border-emerald-300/50 shadow-lg">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--slate-900)]">{isReissue ? "Bond Re-Issued Successfully!" : "Bond Issued Successfully!"}</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                {isReissue
                  ? "The bond has been re-issued with the approved endorsement changes. New documents and invoices have been generated."
                  : "The bond has been issued and all documents have been generated."}
              </p>
            </div>
            <div className="bg-[var(--slate-50)] border border-[var(--border-color)] rounded-[var(--r-lg)] p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bond Number</span>
                <span className="font-semibold text-[var(--slate-900)]">{displayBondNumber}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status="issued" />
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-medium">{bond.principal?.companyName || "—"}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bond Amount</span>
                <span className="font-medium">{formatCurrency(bond.bondAmount)}</span>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLocation(`/agent/bonds/${id}`)}
              >
                <FileText className="h-4 w-4 mr-2" />
                View Bond Details
              </Button>
              <Button
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                onClick={() => setLocation("/agent/dashboard")}
              >
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const premium = bond.premium || 0;
  const surcharge = Math.round(premium * 0.03);
  const serviceFee = Math.round(premium * 0.05);
  const stampingFee = Math.round(premium * 0.0025);
  const total = premium + surcharge + serviceFee + stampingFee;

  const isReferralApproved = bond.status === "referral_approved" && !billingConfirmed;
  const isPaymentApproved = bond.status === "payment_approved" || billingConfirmed;

  const handleIssueBond = async () => {
    try {
      const result = await issueBondMutation.mutateAsync({
        id,
        data: {
          billingType: (bond.billingType as "agency_bill" | "direct_bill" | "credit_card") || "agency_bill",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["getBond", id] });
      queryClient.invalidateQueries({ queryKey: ["listBonds"] });
      queryClient.invalidateQueries({ queryKey: ["getDashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["getBondEndorsements", id] });
      setIssuedBondNumber(result.bondNumber);
    } catch (err) {
      toast({
        title: "Issuance Failed",
        description: err instanceof Error ? err.message : "Could not issue bond",
        variant: "destructive",
      });
    }
  };

  const handleSendCCPayment = async () => {
    setSendingPaymentRequest(true);
    try {
      const email = ccPrincipalEmail || bond.principal?.email || "";
      const phone = ccPrincipalPhone || bond.principal?.phone || "";
      const apiBase = "/api";

      const response = await fetch(`${apiBase}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          bondId: bond.id,
          principalEmail: email,
          principalPhone: phone,
          amount: total.toString(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create payment request");
      }

      const paymentData = await response.json();

      await updateStatus.mutateAsync({
        id,
        data: { status: "pending_payment" },
      });

      setCcPaymentToken(paymentData.token);
      setCcPaymentRequested(true);
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not send payment request",
        variant: "destructive",
      });
    } finally {
      setSendingPaymentRequest(false);
    }
  };

  const handleDirectBill = async () => {
    try {
      const addr = usePrincipalAsBilling ? (bond.principal?.address || "") : billingAddress;
      const city = usePrincipalAsBilling ? (bond.principal?.city || "") : billingCity;
      const st = usePrincipalAsBilling ? (bond.principal?.state || "") : billingState;
      const zip = usePrincipalAsBilling ? (bond.principal?.zip || "") : billingZip;
      const apiBase = "/api";
      const res = await fetch(`${apiBase}/bonds/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          billingType: "direct_bill",
          billingAddress: addr,
          billingCity: city,
          billingState: st,
          billingZip: zip,
        }),
      });
      if (!res.ok) throw new Error("Failed to save billing info");
      setBillingConfirmed(true);
      await updateStatus.mutateAsync({
        id,
        data: { status: "payment_approved" },
      });
      queryClient.invalidateQueries({ queryKey: ["getBond", id] });
      toast({
        title: "Direct Bill Selected",
        description: "Bond moved to Payment Approved. You can now issue the bond.",
      });
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not update status",
        variant: "destructive",
      });
    }
  };

  const handleAgencyBill = async () => {
    try {
      const apiBase = "/api";
      const res = await fetch(`${apiBase}/bonds/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ billingType: "agency_bill" }),
      });
      if (!res.ok) throw new Error("Failed to save billing info");
      setBillingConfirmed(true);
      await updateStatus.mutateAsync({
        id,
        data: { status: "payment_approved" },
      });
      queryClient.invalidateQueries({ queryKey: ["getBond", id] });
      toast({
        title: "Agency Bill Selected",
        description: "Bond moved to Payment Approved. You can now issue the bond.",
      });
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not update status",
        variant: "destructive",
      });
    }
  };

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

  if (ccPaymentRequested) {
    const sentEmail = ccPrincipalEmail || bond.principal?.email || "";
    return (
      <div className="animate-fadeUp max-w-2xl mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="h-10 w-10 text-[var(--accent)]" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Payment Request Sent!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            A secure payment link has been generated for the principal at{" "}
            <span className="font-medium text-foreground">{sentEmail}</span>.
          </p>
        </div>

        <Card className="border-[var(--accent)]/20 bg-[var(--accent)]/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bond Number</p>
                <p className="text-xl font-bold font-mono">{bond.bondNumber}</p>
              </div>
              <Badge className="bg-amber-500 text-white text-sm px-3 py-1">
                Awaiting Payment
              </Badge>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Due</span>
                <p className="font-medium text-lg text-[var(--accent)]">{formatCurrency(total)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Payment Method</span>
                <p className="font-medium">Credit Card (via email link)</p>
              </div>
            </div>
            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5 text-[var(--accent)]" /> Payment Link for Principal
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-xs font-mono truncate select-all">
                  {paymentLink}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 shrink-0 h-9"
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
                  className="gap-1 text-xs"
                  onClick={() => window.open(paymentLink, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" /> Open in New Tab
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with the principal to complete payment. In production, this would be sent automatically via email.
              </p>
            </div>

            <Separator />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>The bond status will be updated once payment is received.</p>
              <p className="text-xs">The payment link expires in 48 hours. The principal will verify their identity via a one-time code sent to their phone before entering card details.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation(`/agent/bonds/${id}`)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Bond Detail
          </Button>
          <Button onClick={() => setLocation("/agent/dashboard")} className="gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white">
            <Home className="h-4 w-4" /> Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeUp max-w-4xl mx-auto">
      <div className="bg-card border border-[var(--border-color)] rounded-[var(--r-lg)] p-4 sm:p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Link
            href={`/agent/bonds/${id}`}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Bond Detail
          </Link>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--slate-900)]">
                Application Summary
              </h1>
              <StatusBadge status={bond.status} />
            </div>
            <p className="text-base font-medium text-muted-foreground">
              {bond.bondNumber} &mdash;{" "}
              {bond.principal?.companyName ||
                `${bond.principal?.firstName} ${bond.principal?.lastName}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                Bond Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Bond Number
                  </span>
                  <p className="text-sm font-semibold mt-0.5">{bond.bondNumber}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Bond Type
                  </span>
                  <div className="mt-0.5">
                    <BondTypeBadge type={bond.bondType} />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Bond Amount
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {formatCurrency(bond.bondAmount)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Effective Date
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {bond.effectiveDate
                      ? format(new Date(bond.effectiveDate), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-[var(--accent)]" />
                Principal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Name
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {bond.principal?.companyName ||
                      `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Email
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {bond.principal?.email || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Phone
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {bond.principal?.phone || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Location
                  </span>
                  <p className="text-sm font-semibold mt-0.5">
                    {bond.principal?.state || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {endorsements.filter((e) => e.status === "approved" || e.status === "applied").length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
                  <PenLine className="h-4 w-4 text-amber-600" />
                  Re-Issue Rationale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-900/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This bond requires re-issuance due to the following approved endorsement changes. New bond documents and invoices will be generated upon issuance.</span>
                </div>
                {endorsements.filter((e) => e.status === "approved" || e.status === "applied").map((e) => {
                  const changes = e.changes || {};
                  const label = (e.endorsementType || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                  return (
                    <div key={e.id} className="p-3 rounded-lg border bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{label}</span>
                        <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300">{e.status}</Badge>
                      </div>
                      {e.description && (
                        <p className="text-xs text-muted-foreground">{e.description}</p>
                      )}
                      <div className="space-y-1">
                        {changes.bondAmount && (
                          <div className="flex items-center gap-2 text-xs">
                            {Number(changes.bondAmount) > Number(bond.bondAmount)
                              ? <TrendingUp className="h-3 w-3 text-amber-600" />
                              : <TrendingDown className="h-3 w-3 text-emerald-600" />
                            }
                            <span>Bond Amount: {formatCurrency(bond.bondAmount)} → {formatCurrency(changes.bondAmount)}</span>
                          </div>
                        )}
                        {changes.premiumDelta && (
                          <div className="flex items-center gap-2 text-xs">
                            <DollarSign className="h-3 w-3 text-amber-600" />
                            <span>Premium Change: {changes.premiumDelta > 0 ? "+" : ""}{formatCurrency(changes.premiumDelta)}</span>
                          </div>
                        )}
                        {changes.extensionMonths && (
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-blue-600" />
                            <span>Term Extension: {changes.extensionMonths} months</span>
                          </div>
                        )}
                        {changes.obligeeName && (
                          <div className="flex items-center gap-2 text-xs">
                            <Building className="h-3 w-3 text-blue-600" />
                            <span>New Obligee: {changes.obligeeName}</span>
                          </div>
                        )}
                        {(changes.firstName || changes.lastName || changes.companyName) && (
                          <div className="flex items-center gap-2 text-xs">
                            <User className="h-3 w-3 text-blue-600" />
                            <span>Name Change: {[changes.firstName, changes.lastName].filter(Boolean).join(" ")}{changes.companyName ? ` (${changes.companyName})` : ""}</span>
                          </div>
                        )}
                        {changes.address && (
                          <div className="flex items-center gap-2 text-xs">
                            <MapPin className="h-3 w-3 text-blue-600" />
                            <span>Address Change: {changes.address}{changes.city ? `, ${changes.city}` : ""}{changes.state ? `, ${changes.state}` : ""} {changes.zip || ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[var(--accent)]" />
                Premium Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Premium</span>
                  <span className="font-medium">{formatCurrency(premium)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Surcharge (3%)</span>
                  <span className="font-medium">{formatCurrency(surcharge)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service Fee (5%)</span>
                  <span className="font-medium">{formatCurrency(serviceFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stamping Fee (0.25%)</span>
                  <span className="font-medium">{formatCurrency(stampingFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>Total Due</span>
                  <span className="text-[var(--accent)]">{formatCurrency(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {isReferralApproved && (
            <Card className="border-[var(--accent)]/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-[var(--accent)]" />
                  Billing & Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-6">
                  {[
                    { value: "agency_bill", label: "Agency Bill" },
                    { value: "direct_bill", label: "Direct Bill" },
                    { value: "credit_card", label: "Credit Card" },
                  ].map((type) => (
                    <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="billingType"
                        checked={selectedBilling === type.value}
                        onChange={() => setSelectedBilling(type.value)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="text-sm">{type.label}</span>
                    </label>
                  ))}
                </div>

                {selectedBilling === "agency_bill" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      The premium will be billed to your agency account. Invoice will be generated upon issuance.
                    </p>
                    <Button
                      className="w-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                      onClick={handleAgencyBill}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {updateStatus.isPending ? "Processing..." : "Confirm Agency Bill"}
                    </Button>
                  </>
                )}

                {selectedBilling === "direct_bill" && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-2 text-xs text-blue-500 bg-blue-500/5 p-2.5 rounded-lg border border-blue-500/10">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>A customer receiving an invoice directly from Surety Demo App must submit payment within 35 days from the purchase date.</span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePrincipalAsBilling}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUsePrincipalAsBilling(checked);
                          if (checked) {
                            setBillingAddress("");
                            setBillingCity("");
                            setBillingState("");
                            setBillingZip("");
                          }
                        }}
                        className="accent-[var(--accent)]"
                      />
                      <span className="text-sm flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Use principal address as billing address
                      </span>
                    </label>

                    {usePrincipalAsBilling ? (
                      <div className="p-3 bg-muted/50 rounded-lg text-sm">
                        <p className="font-medium text-xs text-muted-foreground mb-1">Billing Address</p>
                        <p>{bond.principal?.address || "—"}</p>
                        <p>{[bond.principal?.city, bond.principal?.state, bond.principal?.zip].filter(Boolean).join(", ") || "—"}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Billing Address</Label>
                          <AddressAutocomplete
                            value={billingAddress}
                            onChange={(val) => setBillingAddress(val)}
                            onSelect={(suggestion) => {
                              setBillingAddress(suggestion.address);
                              setBillingCity(suggestion.city);
                              setBillingState(suggestion.state);
                              setBillingZip(suggestion.zip);
                            }}
                            placeholder="Start typing an address..."
                            className="h-9 mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">City</Label>
                            <Input
                              value={billingCity}
                              onChange={(e) => setBillingCity(e.target.value)}
                              placeholder="City"
                              className="h-9 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">State</Label>
                            <Input
                              value={billingState}
                              onChange={(e) => setBillingState(e.target.value)}
                              placeholder="ST"
                              className="h-9 mt-1"
                              maxLength={2}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">ZIP</Label>
                            <Input
                              value={billingZip}
                              onChange={(e) => setBillingZip(e.target.value)}
                              placeholder="ZIP"
                              className="h-9 mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                      onClick={handleDirectBill}
                      disabled={updateStatus.isPending || (!usePrincipalAsBilling && (!billingAddress.trim() || !billingCity.trim() || !billingState.trim() || !billingZip.trim()))}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {updateStatus.isPending ? "Processing..." : "Confirm Direct Bill"}
                    </Button>
                  </div>
                )}

                {selectedBilling === "credit_card" && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Choose one of the following options:
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5">
                      <input type="radio" checked readOnly className="accent-[var(--accent)]" />
                      <span className="text-sm font-medium">Request payment by email</span>
                    </label>
                    <div className="space-y-3 pl-1">
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Principal's Cell Phone
                        </Label>
                        <Input
                          value={ccPrincipalPhone}
                          onChange={(e) => setCcPrincipalPhone(formatPhoneNumber(e.target.value))}
                          placeholder="(555) 555-1234"
                          className="h-9 mt-1"
                          maxLength={14}
                        />
                      </div>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ccOtpConsent}
                          onChange={(e) => setCcOtpConsent(e.target.checked)}
                          className="accent-[var(--accent)] mt-1"
                        />
                        <span className="text-xs text-muted-foreground">
                          Principal consents to receive a text message with a one-time authentication code to this number in order to make payment.
                        </span>
                      </label>
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Principal's Email Address
                        </Label>
                        <EmailInput
                          value={ccPrincipalEmail}
                          onChange={(val) => setCcPrincipalEmail(val)}
                          placeholder="principal@email.com"
                          className="h-9 mt-1"
                        />
                      </div>
                    </div>

                    <Button
                      className="w-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white"
                      onClick={handleSendCCPayment}
                      disabled={sendingPaymentRequest || !ccOtpConsent || ccPrincipalPhone.replace(/\D/g, "").length !== 10 || !ccPrincipalEmail.trim() || !isValidEmail(ccPrincipalEmail)}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendingPaymentRequest ? "Sending..." : `Send CC Payment Link — ${formatCurrency(total)}`}
                    </Button>

                    {(!ccOtpConsent || ccPrincipalPhone.replace(/\D/g, "").length !== 10 || !ccPrincipalEmail.trim() || !isValidEmail(ccPrincipalEmail)) && (ccPrincipalPhone || ccPrincipalEmail) && (
                      <p className="text-xs text-amber-500">
                        Please fill in the principal's phone and email, and accept the OTP consent before sending.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isPaymentApproved && (
            <Card className="border-emerald-300/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Ready to Issue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Payment has been approved. You can now issue this bond.
                </p>
                <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-[var(--r)] text-sm">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">
                    {bond.billingType === "credit_card" ? "Credit Card Payment" : bond.billingType === "agency_bill" ? "Agency Bill" : "Direct Bill"} confirmed
                  </span>
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={issueBondMutation.isPending}
                  onClick={handleIssueBond}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {issueBondMutation.isPending ? (isReissue ? "Re-Issuing..." : "Issuing...") : (isReissue ? "Re-Issue Bond" : "Issue Bond")}
                </Button>
              </CardContent>
            </Card>
          )}

          {!isReferralApproved && !isPaymentApproved && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    This bond is currently{" "}
                    <span className="font-medium">{bond.status.replace(/_/g, " ")}</span>.
                    No payment actions available.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
