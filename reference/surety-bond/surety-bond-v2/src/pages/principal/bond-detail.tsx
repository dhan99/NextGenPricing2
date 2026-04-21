import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetBond } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Download, FileText, MessageSquare, ExternalLink, Sparkles, CalendarClock, Loader2, CreditCard, DollarSign, ShieldCheck, KeyRound, CheckCircle2, AlertCircle, Clock, Lock, Mail, Phone, MapPin, Building, Ban, XCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatusExplainer } from "@/hooks/use-ai-underwriting";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { downloadDocumentAsPdf } from "@/utils/download-pdf";

interface PaymentItem {
  id: number;
  token: string;
  principalEmail: string;
  phoneLast4: string;
  otpVerified: boolean;
  paymentStatus: string;
  amount: string;
  bondNumber: string;
  obligeeName: string;
  bondAmount: string;
  bondType: string;
  bondId: number;
  cardLast4: string | null;
  cardType: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
}

type PayStep = "idle" | "otp_request" | "otp_verify" | "payment" | "success";

export function PrincipalBondDetail() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const bondId = parseInt(id || "0", 10);
  
  const { data: bond, isLoading, refetch: refetchBond } = useGetBond(bondId, { query: { staleTime: 0, refetchOnMount: "always" } });
  const { data: statusExplainer, loading: explainerLoading, explain } = useStatusExplainer();
  const { token: authToken } = useAuth();
  const { toast } = useToast();

  const [paymentItem, setPaymentItem] = useState<PaymentItem | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payStep, setPayStep] = useState<PayStep>("idle");
  const [payError, setPayError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [txnResult, setTxnResult] = useState<{ transactionId: string; cardType: string; cardLast4: string; amount: string } | null>(null);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelProvision, setCancelProvision] = useState("flat_cancellation");
  const [cancelPending, setCancelPending] = useState(false);

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showNonRenewDialog, setShowNonRenewDialog] = useState(false);
  const [nonRenewReason, setNonRenewReason] = useState("");
  const [nonRenewPending, setNonRenewPending] = useState(false);

  const apiBase = "/api";

  useEffect(() => {
    if (bond) {
      explain(bond.status, bond.bondType, Number(bond.bondAmount));
    }
  }, [bond?.id, bond?.status]);

  useEffect(() => {
    if (!bondId) return;
    setPaymentLoading(true);
    fetch(`${apiBase}/payment-requests/list`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data: PaymentItem[] = await res.json();
        const match = data.find(p => p.bondId === bondId && p.paymentStatus === "pending");
        if (match) {
          setPaymentItem(match);
          if (match.otpVerified) {
            setPayStep("payment");
          } else {
            setPayStep("otp_request");
          }
        }
      })
      .catch(() => {})
      .finally(() => setPaymentLoading(false));
  }, [bondId]);

  const formatCardNum = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const handleSendOtp = async (token: string) => {
    setOtpSending(true);
    setPayError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/send-otp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setPayStep("otp_verify");
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async (token: string) => {
    setOtpVerifying(true);
    setPayError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      setPayStep("payment");
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handlePayment = async (token: string) => {
    setProcessing(true);
    setPayError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardExpMonth,
          cardExpYear,
          cardCvc,
          cardholderName,
          authenticatedSession: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      setTxnResult(data);
      setPayStep("success");
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) return <div className="p-3 sm:p-8"><Skeleton className="h-[200px] sm:h-[400px] w-full max-w-3xl mx-auto rounded-xl"/></div>;
  if (!bond) return <div className="min-h-screen text-center p-12">Bond not found.</div>;

  const isPaymentPending = bond.status === "pending_payment" || bond.status === "payment_requested";

  return (
    <div className={`${isMobile ? '' : 'animate-fadeUp'} max-w-5xl mx-auto`}>
        <Link href="/principal/dashboard">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground min-h-[36px] text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Dashboard
          </Button>
        </Link>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card className="shadow-lg shadow-black/5 border-border/50 overflow-hidden">
              <div className={`bg-primary/5 border-b border-border/50 ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
                <div className="flex items-center flex-wrap gap-2">
                  <h1 className={`${isMobile ? 'text-sm' : 'text-base sm:text-lg'} font-bold text-[var(--slate-900)]`}>{bond.obligeeName}</h1>
                  <StatusBadge status={bond.status} />
                </div>
                <div className="flex items-center flex-wrap gap-2 mt-1">
                  <BondTypeBadge type={bond.bondType} />
                  <span className={`${isMobile ? 'text-sm' : 'text-sm sm:text-base'} font-bold text-primary`}>{formatCurrency(bond.bondAmount)}</span>
                </div>
              </div>
              <CardContent className={isMobile ? 'px-3 py-1' : 'p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4'}>
                {isMobile ? (
                  <div className="divide-y divide-border/50">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reference</span>
                      <span className="font-mono font-semibold text-xs">{bond.bondNumber}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Submitted</span>
                      <span className="text-sm font-semibold">{formatDate(bond.createdAt)}</span>
                    </div>
                    {bond.description && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider shrink-0 mr-3">Description</span>
                        <span className="text-sm text-foreground truncate text-right">{bond.description}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Reference</div>
                      <div className="font-mono font-medium text-xs break-all">{bond.bondNumber}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Submitted</div>
                      <div className="text-sm font-medium">{formatDate(bond.createdAt)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                      <div className="text-sm text-foreground truncate">{bond.description || "N/A"}</div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-md shadow-black/5 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bond.status === "issued" ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl" style={{ background: 'var(--s-green-bg)', border: '1px solid var(--s-green)' }}>
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 shrink-0" style={{ color: 'var(--s-green)' }} />
                      <div>
                        <div className="font-semibold text-[var(--slate-900)]">Final Bond Document.pdf</div>
                        <div className="text-xs text-[var(--text-muted)]">Issued on {formatDate(bond.issuedAt)}</div>
                      </div>
                    </div>
                    <Button
                      className="text-white shadow-sm min-h-[44px] w-full sm:w-auto"
                      style={{ background: 'var(--s-green)' }}
                      onClick={async () => {
                        toast({ title: "Generating PDF...", description: "Please wait while the document is being prepared." });
                        try {
                          await downloadDocumentAsPdf(
                            `/api/bonds/${id}/documents/bond_document/view`,
                            authToken || "",
                            `Bond_Document_${bond.bondNumber}.pdf`
                          );
                          toast({ title: "Download complete", description: "Your bond document has been saved." });
                        } catch {
                          window.open(`/api/bonds/${id}/documents/bond_document/view?token=${encodeURIComponent(authToken || '')}`, '_blank');
                        }
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                  </div>
                ) : (
                  <div className="text-center p-6 sm:p-8 bg-[var(--slate-50)] rounded-xl border border-dashed border-[var(--border-color)]">
                    <p className="text-sm text-muted-foreground">Official documents will appear here once the bond is issued.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {bond.status === 'issued' && (
              <>
                {(bond as any).nonRenew && (
                  <div className="rounded-xl border-2 p-3 sm:p-4" style={{ borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                        <XCircle className="h-5 w-5" style={{ color: 'var(--s-amber)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--slate-900)] text-sm sm:text-base">Marked as Non-Renew</h3>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-1">
                          This bond will not be renewed at expiration.
                        </p>
                        {(bond as any).nonRenewReason && (
                          <p className="text-sm mt-1" style={{ color: 'var(--s-amber)' }}>Reason: {(bond as any).nonRenewReason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <Card className="shadow-md shadow-black/5 border-border/50">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Bond Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="min-h-[44px] flex-1"
                        style={{ color: 'var(--s-amber)', borderColor: 'var(--s-amber)' }}
                        onClick={() => setShowNonRenewDialog(true)}
                      >
                        <XCircle className="h-4 w-4 mr-2" /> {(bond as any).nonRenew ? "Non-Renew (Active)" : "Mark Non-Renew"}
                      </Button>
                      <Button
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 border-destructive/20 min-h-[44px] flex-1"
                        onClick={() => setShowCancelDialog(true)}
                      >
                        <Ban className="h-4 w-4 mr-2" /> Cancel Bond
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {isPaymentPending && paymentItem && (
              <Card className="shadow-lg shadow-black/5 overflow-hidden" style={{ borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>
                <div className="p-4 sm:p-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--s-amber-bg)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: 'var(--s-amber)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--slate-900)]">Payment Required</h3>
                    <p className="text-xs" style={{ color: 'var(--s-amber)' }}>Premium payment is due for this bond</p>
                  </div>
                </div>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4 p-3 bg-card rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                    <span className="text-sm text-muted-foreground">Amount Due</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(paymentItem.amount || "0")}</span>
                  </div>

                  {payStep === "success" && txnResult && (
                    <div className="text-center space-y-3 p-4">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'var(--s-green-bg)' }}>
                        <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--s-green)' }} />
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: 'var(--s-green)' }}>Payment Complete!</h3>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Card</span><span>{txnResult.cardType} ending in {txnResult.cardLast4}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium" style={{ color: 'var(--s-green)' }}>${parseFloat(txnResult.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </div>
                  )}

                  {payStep === "otp_request" && (
                    <div className="space-y-4">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                          <ShieldCheck className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-bold">Verify Your Identity</h3>
                        <p className="text-xs text-muted-foreground">We'll send a one-time code to your phone ending in <span className="font-mono font-medium">***{paymentItem.phoneLast4}</span> and your email on file.</p>
                      </div>
                      {payError && <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg"><AlertCircle className="h-4 w-4 shrink-0" />{payError}</div>}
                      <Button className="w-full h-11 gap-2" onClick={() => handleSendOtp(paymentItem.token)} disabled={otpSending}>
                        {otpSending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending Code...</> : <><KeyRound className="h-4 w-4" /> Send Verification Code</>}
                      </Button>
                    </div>
                  )}

                  {payStep === "otp_verify" && (
                    <div className="space-y-4">
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                          <KeyRound className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-bold">Enter Verification Code</h3>
                        <p className="text-xs text-muted-foreground">A 6-digit code has been sent to your phone ending in <span className="font-mono font-medium">***{paymentItem.phoneLast4}</span> and your email on file.</p>
                      </div>
                      {payError && <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg"><AlertCircle className="h-4 w-4 shrink-0" />{payError}</div>}
                      <div>
                        <Label className="text-sm">Verification Code</Label>
                        <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit code" className="h-12 text-center text-xl font-mono tracking-[0.3em] mt-1" maxLength={6} />
                      </div>
                      <Button className="w-full h-11 gap-2" onClick={() => handleVerifyOtp(paymentItem.token)} disabled={otpVerifying || otpCode.length !== 6}>
                        {otpVerifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : <><ShieldCheck className="h-4 w-4" /> Verify & Continue</>}
                      </Button>
                      <button className="text-xs text-primary hover:underline w-full text-center" onClick={() => handleSendOtp(paymentItem.token)} disabled={otpSending}>
                        {otpSending ? "Resending..." : "Didn't receive the code? Resend"}
                      </button>
                    </div>
                  )}

                  {payStep === "payment" && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                          <CreditCard className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-bold">Payment Details</h3>
                        <p className="text-xs text-muted-foreground">Enter your card information to complete this payment.</p>
                      </div>
                      {payError && <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg"><AlertCircle className="h-4 w-4 shrink-0" />{payError}</div>}
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Cardholder Name</Label>
                          <Input value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} placeholder="Name on card" className="h-10 mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Card Number</Label>
                          <Input value={cardNumber} onChange={(e) => setCardNumber(formatCardNum(e.target.value))} placeholder="1234 5678 9012 3456" className="h-10 font-mono mt-1" maxLength={19} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Month</Label>
                            <Input value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="MM" className="h-10 mt-1" maxLength={2} />
                          </div>
                          <div>
                            <Label className="text-xs">Year</Label>
                            <Input value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" className="h-10 mt-1" maxLength={4} />
                          </div>
                          <div>
                            <Label className="text-xs">CVC</Label>
                            <Input value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" className="h-10 mt-1" maxLength={4} type="password" />
                          </div>
                        </div>
                      </div>
                      <Button className="w-full h-11 gap-2" onClick={() => handlePayment(paymentItem.token)} disabled={processing || !cardNumber || !cardExpMonth || !cardExpYear || !cardCvc || !cardholderName}>
                        {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><Lock className="h-4 w-4" /> Pay {formatCurrency(paymentItem.amount || "0")}</>}
                      </Button>
                      <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1"><Lock className="h-3 w-3" /> Secured with 256-bit encryption</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {isPaymentPending && !paymentItem && !paymentLoading && (
              <Card className="shadow-md shadow-black/5" style={{ borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>
                <CardContent className="p-5 text-center space-y-2">
                  <Clock className="h-8 w-8 mx-auto" style={{ color: 'var(--s-amber)' }} />
                  <h3 className="font-semibold text-[var(--slate-900)]">Payment Pending</h3>
                  <p className="text-sm text-muted-foreground">A payment request is being prepared for this bond. Please check back shortly or visit the Payments page.</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {isMobile && (
              <button
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card)] text-sm font-semibold"
              >
                <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> Status & Contact</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            <div className={isMobile && !sidebarExpanded ? 'hidden' : 'space-y-6'}>
            <Card className="shadow-md shadow-black/5 border-[var(--border-color)]">
              <CardHeader>
                <CardTitle className="text-base">Status Tracker</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <TimelineStep 
                  title="Application Received" 
                  date={formatDate(bond.createdAt)} 
                  active={true} 
                  completed={true} 
                />
                <TimelineStep 
                  title="Under Review" 
                  date="Agent is reviewing your details"
                  active={["quoted", "requires_referral", "referred", "indemnity_in_review", "pending_information", "approved", "declined", "issued"].includes(bond.status)} 
                  completed={["approved", "declined", "issued"].includes(bond.status)} 
                />
                <TimelineStep 
                  title="Decision Made" 
                  date={bond.status === "declined" ? "Declined" : bond.status === "approved" || bond.status === "issued" ? "Approved" : "Pending"}
                  active={["approved", "declined", "issued"].includes(bond.status)} 
                  completed={["issued"].includes(bond.status)} 
                  error={bond.status === "declined"}
                />
                <TimelineStep 
                  title="Bond Issued" 
                  date={bond.status === "issued" ? "Available for download" : "Pending"}
                  active={bond.status === "issued"} 
                  completed={bond.status === "issued"} 
                  isLast={true}
                />
              </CardContent>
            </Card>

            <Card className="shadow-md shadow-black/5" style={{ borderColor: 'var(--s-purple)', background: 'var(--s-purple-bg)' }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--s-purple)' }} /> Status Explained
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {explainerLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading explanation...
                  </div>
                ) : statusExplainer ? (
                  <>
                    <p className="text-sm text-[var(--text-muted)]">{statusExplainer.explanation}</p>
                    <p className="text-sm font-medium text-[var(--slate-900)]">{statusExplainer.nextSteps}</p>
                    {statusExplainer.estimatedTimeline && (
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--s-purple)' }}>
                        <CalendarClock className="h-3 w-3" /> {statusExplainer.estimatedTimeline}
                      </p>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>

            {bond.principal && (
              <Card className="shadow-md shadow-black/5 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" /> Your Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{bond.principal.companyName || "Individual"}</p>
                    <p className="text-xs text-muted-foreground">{bond.principal.firstName} {bond.principal.lastName}</p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {bond.principal.email && (
                      <div className="flex items-center gap-2 text-xs">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <a href={`mailto:${bond.principal.email}`} className="text-primary hover:underline truncate">{bond.principal.email}</a>
                      </div>
                    )}
                    {bond.principal.phone && (
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{bond.principal.phone}</span>
                      </div>
                    )}
                    {(bond.principal.address || bond.principal.city) && (
                      <div className="flex items-start gap-2 text-xs">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="leading-tight">
                          {bond.principal.address && <>{bond.principal.address}<br/></>}
                          {[bond.principal.city, bond.principal.state].filter(Boolean).join(", ")} {bond.principal.zip || ""}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-md shadow-black/5 border-border/50 bg-primary/5 border-primary/20">
              <CardContent className="p-5 sm:p-6 text-center">
                <MessageSquare className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Need help?</h3>
                <p className="text-sm text-muted-foreground mb-4">Contact your agent directly regarding this application.</p>
                {bond?.agent?.email ? (
                  <a href={`mailto:${bond.agent.email}`} className="w-full">
                    <Button variant="outline" className="w-full bg-background min-h-[44px] gap-2">
                      <Mail className="h-4 w-4" />
                      {bond.agent.email}
                    </Button>
                  </a>
                ) : (
                  <Button variant="outline" className="w-full bg-background min-h-[44px]" disabled>No agent assigned</Button>
                )}
                {bond?.agent?.name && (
                  <p className="text-xs text-muted-foreground mt-2">Agent: {bond.agent.name}</p>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        </div>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Cancel Bond
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              This action will cancel bond <span className="font-semibold">{bond?.bondNumber}</span>. This cannot be undone.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Cancellation Provision</label>
              <Select value={cancelProvision} onValueChange={setCancelProvision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat_cancellation">Flat Cancellation</SelectItem>
                  <SelectItem value="pro_rata">Pro Rata</SelectItem>
                  <SelectItem value="short_rate">Short Rate</SelectItem>
                  <SelectItem value="release_only">Release Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason for Cancellation</label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Provide a reason for cancellation..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Keep Bond</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelPending}
              onClick={async () => {
                setCancelPending(true);
                try {
                  const res = await fetch(`${apiBase}/bonds/${bondId}/cancel`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({ reason: cancelReason, cancellationProvision: cancelProvision }),
                  });
                  if (res.ok) {
                    toast({ title: "Bond Cancelled", description: "The bond has been cancelled." });
                    setShowCancelDialog(false);
                    setCancelReason("");
                    refetchBond();
                  } else {
                    const data = await res.json();
                    toast({ title: "Cancellation Failed", description: data.message || "Could not cancel bond", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Error", description: "Network error", variant: "destructive" });
                } finally {
                  setCancelPending(false);
                }
              }}
            >
              {cancelPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNonRenewDialog} onOpenChange={setShowNonRenewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--s-amber)' }}>
              <XCircle className="h-5 w-5" /> {(bond as any)?.nonRenew ? "Remove Non-Renew Flag" : "Mark Bond as Non-Renew"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(bond as any)?.nonRenew ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This bond is currently marked as <span className="font-semibold" style={{ color: 'var(--s-amber)' }}>non-renew</span>. 
                  It will not appear in the renewal queue.
                </p>
                {(bond as any).nonRenewReason && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--s-amber)' }}>Current Reason</p>
                    <p className="text-sm">{(bond as any).nonRenewReason}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Reason for Reversal</label>
                  <Textarea
                    value={nonRenewReason}
                    onChange={(e) => setNonRenewReason(e.target.value)}
                    placeholder="Why is this bond being restored for renewal?"
                    className="min-h-[80px]"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Marking bond <span className="font-semibold">{bond?.bondNumber}</span> as non-renew will 
                  remove it from the renewal queue. The bond remains active until its expiration date.
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">Reason for Non-Renewal</label>
                  <Textarea
                    value={nonRenewReason}
                    onChange={(e) => setNonRenewReason(e.target.value)}
                    placeholder="Provide a reason for non-renewal..."
                    className="min-h-[80px]"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNonRenewDialog(false); setNonRenewReason(""); }}>
              Cancel
            </Button>
            <Button
              className="text-white"
              style={{ background: (bond as any)?.nonRenew ? 'var(--s-green)' : 'var(--s-amber)' }}
              disabled={!nonRenewReason.trim() || nonRenewPending}
              onClick={async () => {
                setNonRenewPending(true);
                try {
                  const res = await fetch(`${apiBase}/bonds/${bondId}/non-renew`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({ nonRenew: !(bond as any).nonRenew, reason: nonRenewReason }),
                  });
                  if (res.ok) {
                    toast({
                      title: (bond as any).nonRenew ? "Non-Renew Removed" : "Marked Non-Renew",
                      description: (bond as any).nonRenew
                        ? "This bond will appear in the renewal queue again."
                        : "This bond will not appear in the renewal queue.",
                    });
                    setShowNonRenewDialog(false);
                    setNonRenewReason("");
                    refetchBond();
                  } else {
                    const data = await res.json();
                    toast({ title: "Failed", description: data.message || "Could not update non-renew status", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Error", description: "Network error", variant: "destructive" });
                } finally {
                  setNonRenewPending(false);
                }
              }}
            >
              {nonRenewPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {(bond as any)?.nonRenew ? "Restore for Renewal" : "Confirm Non-Renew"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TimelineStepProps {
  title: string;
  date: string;
  active: boolean;
  completed: boolean;
  isLast?: boolean;
  error?: boolean;
}

function TimelineStep({ title, date, active, completed, isLast, error }: TimelineStepProps) {
  let indicatorColor = "bg-background border-border text-muted-foreground";
  if (error) indicatorColor = "bg-destructive border-destructive text-white";
  else if (completed) indicatorColor = "bg-primary border-primary text-primary-foreground";
  else if (active) indicatorColor = "bg-background border-primary text-primary shadow-[0_0_0_4px_rgba(var(--primary),0.1)]";

  return (
    <div className="relative flex gap-4">
      {!isLast && (
        <div className={`absolute left-[11px] top-7 bottom-[-16px] w-0.5 ${completed ? "bg-primary/30" : "bg-border/50"}`} />
      )}
      <div className={`relative z-10 h-6 w-6 rounded-full border-2 flex items-center justify-center font-bold text-[10px] mt-0.5 transition-colors ${indicatorColor}`}>
        {completed && !error ? "✓" : error ? "!" : ""}
      </div>
      <div>
        <div className={`text-sm font-semibold ${active || completed ? "text-foreground" : "text-muted-foreground"}`}>{title}</div>
        <div className={`text-xs mt-0.5 ${error ? "text-destructive font-medium" : "text-muted-foreground"}`}>{date}</div>
      </div>
    </div>
  );
}
