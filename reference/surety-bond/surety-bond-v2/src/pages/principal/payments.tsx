import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  CreditCard,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Receipt,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

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

export function PrincipalPayments() {
  const isMobile = useIsMobile();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activePayStep, setActivePayStep] = useState<PayStep>("idle");
  const [error, setError] = useState("");

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

  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const { token: authToken } = useAuth();
  const apiBase = "/api";

  const fetchPayments = () => {
    setLoading(true);
    fetch(`${apiBase}/payment-requests/list`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load payments");
        const data = await res.json();
        setPayments(data);
      })
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const isExpired = (expiresAt: string) => new Date() > new Date(expiresAt);

  const resetPaymentState = () => {
    setActivePayStep("idle");
    setError("");
    setOtpCode("");
    setCardNumber("");
    setCardExpMonth("");
    setCardExpYear("");
    setCardCvc("");
    setCardholderName("");
    setTxnResult(null);
  };

  const handleExpand = (payment: PaymentItem) => {
    if (expandedId === payment.id) {
      setExpandedId(null);
      resetPaymentState();
      return;
    }
    resetPaymentState();
    setExpandedId(payment.id);
    if (payment.paymentStatus === "completed") {
      setActivePayStep("idle");
    } else if (payment.otpVerified) {
      setActivePayStep("payment");
    } else {
      setActivePayStep("otp_request");
    }
  };

  const handleSendOtp = async (token: string) => {
    setOtpSending(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setActivePayStep("otp_verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async (token: string) => {
    setOtpVerifying(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      setActivePayStep("payment");
      fetchPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handlePayment = async (token: string) => {
    setProcessing(true);
    setError("");
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
      setActivePayStep("success");
      fetchPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const filteredPayments = payments.filter(p => {
    if (filter === "pending") return p.paymentStatus === "pending";
    if (filter === "completed") return p.paymentStatus === "completed";
    return true;
  });

  const pendingCount = payments.filter(p => p.paymentStatus === "pending").length;
  const completedCount = payments.filter(p => p.paymentStatus === "completed").length;
  const pendingTotal = payments.filter(p => p.paymentStatus === "pending").reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
      {!isMobile && (
        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <div>
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">Payments</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">View and pay outstanding bond premiums</p>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 ${isMobile ? 'sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : ''}`}>
        {([
          { key: "pending" as const, label: "Pending", value: pendingCount, sub: `${formatAmount(pendingTotal.toString())} total due`, icon: Clock, iconColor: "var(--s-amber)", valueColor: "var(--s-amber)" },
          { key: "completed" as const, label: "Completed", value: completedCount, sub: "Payments processed", icon: CheckCircle2, iconColor: "var(--s-green)", valueColor: "var(--s-green)" },
          { key: "all" as const, label: "Total", value: payments.length, sub: "All payment requests", icon: Receipt, iconColor: "var(--primary)", valueColor: undefined },
        ]).map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-card border rounded-[var(--r-lg)] p-[12px_14px] sm:p-[18px_20px] cursor-pointer transition-all duration-200 relative overflow-hidden ${
                filter === card.key
                  ? "border-[var(--accent)] bg-[var(--accent-50)]"
                  : "border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-md"
              }`}
            >
              {filter === card.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'var(--accent)' }} />
              )}
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-4 w-4" style={{ color: card.iconColor }} />
                <span className="text-xs font-medium text-[var(--text-muted)]">{card.label}</span>
              </div>
              <div className="text-[26px] font-extrabold text-[var(--slate-900)] leading-none" style={card.valueColor ? { color: card.valueColor } : {}}>{card.value}</div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-1">{card.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-[var(--border-color)] rounded-[var(--r-lg)] overflow-hidden">
        <div className="flex items-center justify-between p-[14px_20px] border-b border-[var(--border-color)]">
          <h3 className="text-sm font-bold text-[var(--slate-800)]">Payment Requests</h3>
          <div className="flex items-center gap-1">
            {(["all", "pending", "completed"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  filter === f
                    ? "bg-primary/10 text-primary"
                    : "text-[var(--text-muted)] hover:bg-[var(--slate-50)]"
                }`}
              >
                {f === "all" ? "All" : f === "pending" ? `Pending (${pendingCount})` : `Completed (${completedCount})`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 text-center">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-[var(--text-muted)] text-sm">
              {filter === "pending" ? "No pending payments." : filter === "completed" ? "No completed payments." : "No payment requests found."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {filteredPayments.map(payment => {
              const expanded = expandedId === payment.id;
              const expired = isExpired(payment.expiresAt) && payment.paymentStatus !== "completed";

              return (
                <div key={payment.id}>
                  <div
                    className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${
                      expanded ? "bg-primary/5" : "hover:bg-[#FAFCFF]"
                    }`}
                    onClick={() => handleExpand(payment)}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{
                      background: payment.paymentStatus === "completed" ? 'var(--s-green-bg)' : expired ? 'color-mix(in srgb, var(--color-destructive) 10%, transparent)' : 'var(--s-amber-bg)',
                      color: payment.paymentStatus === "completed" ? 'var(--s-green)' : expired ? 'var(--color-destructive)' : 'var(--s-amber)'
                    }}>
                      {payment.paymentStatus === "completed" ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : expired ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--slate-900)]">{payment.bondNumber}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{
                          background: payment.paymentStatus === "completed" ? 'var(--s-green-bg)' : expired ? 'color-mix(in srgb, var(--color-destructive) 10%, transparent)' : 'var(--s-amber-bg)',
                          color: payment.paymentStatus === "completed" ? 'var(--s-green)' : expired ? 'var(--color-destructive)' : 'var(--s-amber)'
                        }}>
                          {payment.paymentStatus === "completed" ? "Paid" : expired ? "Expired" : "Pending"}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {payment.obligeeName} &middot; {new Date(payment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-sm" style={{
                        color: payment.paymentStatus === "completed" ? 'var(--s-green)' : 'var(--slate-900)'
                      }}>
                        {formatAmount(payment.amount || "0")}
                      </div>
                      {payment.paymentStatus === "completed" && payment.cardLast4 && (
                        <div className="text-[11px] text-[var(--text-muted)]">{payment.cardType} ****{payment.cardLast4}</div>
                      )}
                    </div>

                    <div className="shrink-0 text-[var(--text-muted)]">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-5 pb-5 bg-[var(--slate-50)] border-t border-[var(--border-color)]">
                      <div className="max-w-lg mx-auto pt-4 space-y-4">
                        <Card className="border-primary/20 bg-primary/5">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Bond</span>
                              <span className="font-mono text-sm font-medium">{payment.bondNumber}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Obligee</span>
                              <span className="text-sm">{payment.obligeeName}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Amount Due</span>
                              <span className="text-lg font-bold text-primary">{formatAmount(payment.amount || "0")}</span>
                            </div>
                          </CardContent>
                        </Card>

                        {payment.paymentStatus === "completed" && (
                          <Card className="border" style={{ borderColor: 'var(--s-green)', background: 'var(--s-green-bg)' }}>
                            <CardContent className="p-5 text-center space-y-3">
                              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'var(--s-green-bg)' }}>
                                <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--s-green)' }} />
                              </div>
                              <h3 className="text-lg font-bold" style={{ color: 'var(--s-green)' }}>Payment Complete</h3>
                              <div className="space-y-1.5 text-sm">
                                {payment.cardLast4 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Card</span>
                                    <span>{payment.cardType} ending in {payment.cardLast4}</span>
                                  </div>
                                )}
                                {payment.paidAt && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Paid On</span>
                                    <span>{new Date(payment.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Amount</span>
                                  <span className="font-medium" style={{ color: 'var(--s-green)' }}>{formatAmount(payment.amount || "0")}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {expired && payment.paymentStatus !== "completed" && (
                          <Card>
                            <CardContent className="p-5 text-center space-y-3">
                              <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                              <h3 className="font-bold text-red-600">Payment Link Expired</h3>
                              <p className="text-sm text-muted-foreground">
                                This payment link has expired. Please contact your bonding agent to request a new one.
                              </p>
                            </CardContent>
                          </Card>
                        )}

                        {!expired && payment.paymentStatus === "pending" && activePayStep === "otp_request" && (
                          <Card className="border-border/50">
                            <CardContent className="p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                              <div className="text-center space-y-2">
                                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                  <ShieldCheck className="h-7 w-7 text-primary" />
                                </div>
                                <h2 className="text-lg font-bold">Verify Your Identity</h2>
                                <p className="text-sm text-muted-foreground">
                                  For your security, we need to verify your identity before processing the payment.
                                  We'll send a one-time code to your phone ending in <span className="font-mono font-medium text-foreground">***{payment.phoneLast4}</span> and your email on file.
                                </p>
                              </div>
                              {error && (
                                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg">
                                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                                </div>
                              )}
                              <Button className="w-full h-11 gap-2" onClick={() => handleSendOtp(payment.token)} disabled={otpSending}>
                                {otpSending ? (
                                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending Code...</>
                                ) : (
                                  <><KeyRound className="h-4 w-4" /> Send Verification Code</>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        )}

                        {!expired && payment.paymentStatus === "pending" && activePayStep === "otp_verify" && (
                          <Card className="border-border/50">
                            <CardContent className="p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                              <div className="text-center space-y-2">
                                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                  <KeyRound className="h-7 w-7 text-primary" />
                                </div>
                                <h2 className="text-lg font-bold">Enter Verification Code</h2>
                                <p className="text-sm text-muted-foreground">
                                  A 6-digit code has been sent to your phone ending in <span className="font-mono font-medium text-foreground">***{payment.phoneLast4}</span> and your email on file. Please check both.
                                </p>
                              </div>
                              {error && (
                                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg">
                                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                                </div>
                              )}
                              <div>
                                <Label className="text-sm">Verification Code</Label>
                                <Input
                                  value={otpCode}
                                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                  placeholder="Enter 6-digit code"
                                  className="h-12 text-center text-xl font-mono tracking-[0.3em] mt-1"
                                  maxLength={6}
                                />
                              </div>
                              <Button className="w-full h-11 gap-2" onClick={() => handleVerifyOtp(payment.token)} disabled={otpVerifying || otpCode.length !== 6}>
                                {otpVerifying ? (
                                  <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                                ) : (
                                  <><ShieldCheck className="h-4 w-4" /> Verify & Continue</>
                                )}
                              </Button>
                              <button
                                className="text-xs text-primary hover:underline w-full text-center"
                                onClick={() => handleSendOtp(payment.token)}
                                disabled={otpSending}
                              >
                                {otpSending ? "Resending..." : "Didn't receive the code? Resend"}
                              </button>
                            </CardContent>
                          </Card>
                        )}

                        {!expired && payment.paymentStatus === "pending" && activePayStep === "payment" && (
                          <Card className="border-border/50">
                            <CardContent className="p-6 space-y-4">
                              <div className="text-center space-y-1">
                                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                  <CreditCard className="h-7 w-7 text-primary" />
                                </div>
                                <h2 className="text-lg font-bold">Payment Details</h2>
                                <p className="text-xs text-muted-foreground">Enter your card information below to complete this payment.</p>
                              </div>
                              {error && (
                                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 p-2.5 rounded-lg">
                                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                                </div>
                              )}
                              <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <Label className="text-xs">Cardholder Name</Label>
                                  <Input value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} placeholder="Name on card" className="h-10 mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Card Number</Label>
                                  <div className="relative">
                                    <Input value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="4111 1111 1111 1111" className="h-10 mt-1 pl-10 font-mono" maxLength={19} />
                                    <CreditCard className="h-4 w-4 text-muted-foreground absolute left-3 top-[50%] -translate-y-[50%] mt-0.5" />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">Test card: 4111 1111 1111 1111 (VISA)</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-xs">Month</Label>
                                    <Input value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="MM" className="h-10 mt-1 font-mono" maxLength={2} />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year</Label>
                                    <Input value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" className="h-10 mt-1 font-mono" maxLength={4} />
                                  </div>
                                  <div>
                                    <Label className="text-xs">CVC</Label>
                                    <Input value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="111" className="h-10 mt-1 font-mono" maxLength={4} />
                                    <p className="text-xs text-muted-foreground mt-0.5">Test: 111</p>
                                  </div>
                                </div>
                              </div>
                              <Button
                                className="w-full h-12 text-base gap-2 shadow-lg"
                                onClick={(e) => { e.stopPropagation(); handlePayment(payment.token); }}
                                disabled={processing || !cardNumber || !cardExpMonth || !cardExpYear || !cardCvc || !cardholderName}
                              >
                                {processing ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing Payment...</> : <><Lock className="h-5 w-5" /> Pay {formatAmount(payment.amount || "0")}</>}
                              </Button>
                              <p className="text-xs text-center text-muted-foreground">Your card information is transmitted securely and never stored.</p>
                            </CardContent>
                          </Card>
                        )}

                        {activePayStep === "success" && txnResult && (
                          <Card className="border-primary/30 bg-primary/5">
                            <CardContent className="p-6 text-center space-y-3">
                              <div className="w-16 h-16 bg-primary/15 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="h-8 w-8 text-primary" />
                              </div>
                              <h2 className="text-xl font-bold">Payment Successful!</h2>
                              <p className="text-sm text-muted-foreground">Your payment has been processed and the bond has been issued.</p>
                              <div className="space-y-1.5 text-sm pt-2">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Transaction ID</span>
                                  <span className="font-mono text-xs">{txnResult.transactionId}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Card</span>
                                  <span>{txnResult.cardType} ending in {txnResult.cardLast4}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Amount</span>
                                  <span className="font-medium text-primary">{formatAmount(txnResult.amount || "0")}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
