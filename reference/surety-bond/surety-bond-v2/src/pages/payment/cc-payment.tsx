import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  CreditCard,
  Phone,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Home,
  KeyRound,
  Building2,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/themes/theme-provider";
import { initTheme } from "@/hooks/use-dark-mode";

type PaymentStep = "loading" | "otp_request" | "otp_verify" | "payment" | "success" | "error" | "expired";

interface PaymentDetails {
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
  expiresAt: string;
}

export function CCPaymentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [step, setStep] = useState<PaymentStep>("loading");
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [monthTouched, setMonthTouched] = useState(false);
  const [yearTouched, setYearTouched] = useState(false);

  const handleMonthBlur = () => {
    setMonthTouched(true);
    if (cardExpMonth.length === 1 && parseInt(cardExpMonth, 10) >= 1) {
      setCardExpMonth(cardExpMonth.padStart(2, "0"));
    }
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const monthError = (() => {
    if (!monthTouched || !cardExpMonth) return "";
    const m = parseInt(cardExpMonth, 10);
    if (isNaN(m) || m < 1 || m > 12) return "Month must be 01-12";
    if (cardExpMonth.length === 2 && yearTouched && cardExpYear.length === 4) {
      const y = parseInt(cardExpYear, 10);
      if (y === currentYear && m < currentMonth) return "Card is expired";
    }
    return "";
  })();

  const yearError = (() => {
    if (!yearTouched || !cardExpYear) return "";
    const y = parseInt(cardExpYear, 10);
    if (isNaN(y)) return "Enter a valid year";
    if (cardExpYear.length === 4 && y < currentYear) return "Card is expired";
    if (cardExpYear.length === 4 && y > currentYear + 20) return "Enter a valid year";
    return "";
  })();

  const cardExpValid = (() => {
    if (cardExpMonth.length !== 2 || !cardExpYear || cardExpYear.length !== 4) return false;
    const m = parseInt(cardExpMonth, 10);
    const y = parseInt(cardExpYear, 10);
    if (isNaN(m) || m < 1 || m > 12) return false;
    if (y < currentYear) return false;
    if (y === currentYear && m < currentMonth) return false;
    if (y > currentYear + 20) return false;
    return true;
  })();
  const [txnResult, setTxnResult] = useState<{ transactionId: string; cardType: string; cardLast4: string; amount: string } | null>(null);

  const { setPersona } = useTheme();

  const apiBase = "/api";

  useEffect(() => {
    initTheme();
    setPersona("principal");
  }, [setPersona]);

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/payment-requests/${token}`)
      .then(async (res) => {
        if (res.status === 410) {
          setStep("expired");
          return;
        }
        if (!res.ok) throw new Error("Payment request not found");
        const data = await res.json();
        setDetails(data);

        if (data.paymentStatus === "completed") {
          setStep("success");
        } else if (data.otpVerified) {
          setStep("payment");
        } else {
          setStep("otp_request");
        }
      })
      .catch(() => {
        setStep("error");
        setError("This payment link is invalid or has expired.");
      });
  }, [token, apiBase]);

  const handleSendOtp = async () => {
    setOtpSending(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to send code");
      }
      if (resData.devOtp) {
        setDevOtpHint(resData.devOtp);
      }
      setOtpSent(true);
      setStep("otp_verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpVerifying(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }
      setStep("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/payment-requests/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardExpMonth,
          cardExpYear,
          cardCvc,
          cardholderName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Payment failed");
      }
      setTxnResult(data);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const stepNumbers = { otp_request: 1, otp_verify: 1, payment: 2, success: 3 } as Record<string, number>;
  const currentStepNum = stepNumbers[step] || 0;

  const headerBar = (
    <div className="bg-[var(--card)] border-b border-[var(--border-color)] px-4 py-3 transition-colors">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-sm text-[var(--slate-900)]">Surety Demo App — Secure Payment</h1>
          <p className="text-xs text-[var(--text-muted)]">Surety Demo App Portal</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--s-green)]">
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">256-bit SSL</span>
        </div>
      </div>
    </div>
  );

  const progressBar = step !== "loading" && step !== "error" && step !== "expired" && (
    <div className="max-w-lg mx-auto px-4 pt-4">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(n => (
          <div key={n} className="flex-1 flex items-center gap-2">
            <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              n <= currentStepNum ? 'gradient-accent' : 'bg-[var(--slate-200)]'
            }`} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        <span className={currentStepNum >= 1 ? 'text-[var(--accent)]' : ''}>Verify</span>
        <span className={currentStepNum >= 2 ? 'text-[var(--accent)]' : ''}>Pay</span>
        <span className={currentStepNum >= 3 ? 'text-[var(--accent)]' : ''}>Done</span>
      </div>
    </div>
  );

  const inputClass = "w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all font-mono";

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg)] transition-colors">
        {headerBar}
        <div className="flex items-center justify-center pt-32">
          <div className="text-center space-y-4 animate-fadeUp">
            <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[var(--text-muted)]">Loading payment details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "expired") {
    return (
      <div className="min-h-screen bg-[var(--bg)] transition-colors">
        {headerBar}
        <div className="flex items-center justify-center p-4 pt-16">
          <div className="glass-card p-8 max-w-md w-full text-center space-y-4 animate-scaleIn">
            <div className="w-16 h-16 bg-[var(--s-amber-bg)] rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-[var(--s-amber)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--slate-900)]">Link Expired</h2>
            <p className="text-[var(--text-muted)]">
              This payment link has expired. Please contact your bonding agent to request a new payment link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-[var(--bg)] transition-colors">
        {headerBar}
        <div className="flex items-center justify-center p-4 pt-16">
          <div className="glass-card p-8 max-w-md w-full text-center space-y-4 animate-scaleIn">
            <div className="w-16 h-16 bg-[var(--s-red-bg)] rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-[var(--s-red)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--slate-900)]">Something Went Wrong</h2>
            <p className="text-[var(--text-muted)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] transition-colors">
      {headerBar}
      {progressBar}

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {details && step !== "success" && (
          <div className="glass-card p-4 border-[var(--accent)]/20 animate-fadeUp">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider">Bond</span>
              <span className="font-mono text-sm font-medium text-[var(--slate-900)]">{details.bondNumber}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider">Obligee</span>
              <span className="text-sm text-[var(--slate-900)]">{details.obligeeName}</span>
            </div>
            <div className="h-px bg-[var(--border-color)] my-3" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--slate-900)]">Amount Due</span>
              <span className="text-xl font-black text-[var(--accent)]">{formatAmount(details.amount || "0")}</span>
            </div>
          </div>
        )}

        {step === "otp_request" && details && (
          <div className="glass-card p-6 space-y-4 animate-fadeUp">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-[var(--accent-50)] rounded-full flex items-center justify-center mx-auto">
                <Phone className="h-7 w-7 text-[var(--accent)]" />
              </div>
              <h2 className="text-lg font-bold text-[var(--slate-900)]">Verify Your Identity</h2>
              <p className="text-sm text-[var(--text-muted)]">
                We'll send a one-time code to your phone ending in <span className="font-mono font-medium text-[var(--slate-900)]">***{details.phoneLast4}</span> and your email on file.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-[var(--s-red)] bg-[var(--s-red-bg)] p-3 rounded-xl animate-scaleIn">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              className="w-full h-12 gradient-accent text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer border-none disabled:opacity-50"
              onClick={handleSendOtp}
              disabled={otpSending}
            >
              {otpSending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending Code...</>
              ) : (
                <><KeyRound className="h-4 w-4" /> Send Verification Code</>
              )}
            </button>
          </div>
        )}

        {step === "otp_verify" && details && (
          <div className="glass-card p-6 space-y-4 animate-fadeUp">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-[var(--accent-50)] rounded-full flex items-center justify-center mx-auto">
                <KeyRound className="h-7 w-7 text-[var(--accent)]" />
              </div>
              <h2 className="text-lg font-bold text-[var(--slate-900)]">Enter Verification Code</h2>
              <p className="text-sm text-[var(--text-muted)]">
                A 6-digit code has been sent to <span className="font-mono font-medium text-[var(--slate-900)]">***{details.phoneLast4}</span> and your email.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-[var(--s-red)] bg-[var(--s-red-bg)] p-3 rounded-xl animate-scaleIn">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Verification Code</label>
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className={`${inputClass} text-center text-2xl tracking-[0.4em] h-14`}
                maxLength={6}
              />
            </div>

            <button
              className="w-full h-12 gradient-accent text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer border-none disabled:opacity-50"
              onClick={handleVerifyOtp}
              disabled={otpVerifying || otpCode.length !== 6}
            >
              {otpVerifying ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
              ) : (
                <><ShieldCheck className="h-4 w-4" /> Verify & Continue</>
              )}
            </button>

            {devOtpHint && (
              <div className="flex items-center gap-2 text-xs bg-[var(--s-amber-bg)] text-[var(--s-amber)] p-3 rounded-xl border border-[var(--s-amber)]/20 animate-scaleIn">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Dev mode — Your code is: <span className="font-mono font-bold">{devOtpHint}</span></span>
              </div>
            )}

            <button
              className="text-xs text-[var(--accent)] hover:underline w-full text-center bg-transparent border-none cursor-pointer"
              onClick={handleSendOtp}
              disabled={otpSending}
            >
              {otpSending ? "Resending..." : "Didn't receive the code? Resend"}
            </button>
          </div>
        )}

        {step === "payment" && details && (
          <div className="glass-card p-6 space-y-4 animate-fadeUp">
            <div className="text-center space-y-1">
              <div className="w-14 h-14 bg-[var(--accent-50)] rounded-full flex items-center justify-center mx-auto">
                <CreditCard className="h-7 w-7 text-[var(--accent)]" />
              </div>
              <h2 className="text-lg font-bold text-[var(--slate-900)]">Payment Details</h2>
              <p className="text-xs text-[var(--text-muted)]">Identity verified. Enter your card information below.</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-[var(--s-red)] bg-[var(--s-red-bg)] p-3 rounded-xl animate-scaleIn">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Cardholder Name</label>
                <input
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="Name on card"
                  className={inputClass.replace('font-mono', '')}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Card Number</label>
                <div className="relative">
                  <input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="4111 1111 1111 1111"
                    className={`${inputClass} pl-10`}
                    maxLength={19}
                  />
                  <CreditCard className="h-4 w-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">Test card: 4111 1111 1111 1111 (VISA)</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Month</label>
                  <input
                    value={cardExpMonth}
                    onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    onBlur={handleMonthBlur}
                    placeholder="MM"
                    className={`${inputClass} ${monthError ? "border-[var(--s-red)] ring-[var(--s-red)]/20" : ""}`}
                    maxLength={2}
                  />
                  {monthError && <p className="text-xs text-[var(--s-red)] mt-0.5">{monthError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Year</label>
                  <input
                    value={cardExpYear}
                    onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    onBlur={() => setYearTouched(true)}
                    placeholder="YYYY"
                    className={`${inputClass} ${yearError ? "border-[var(--s-red)] ring-[var(--s-red)]/20" : ""}`}
                    maxLength={4}
                  />
                  {yearError && <p className="text-xs text-[var(--s-red)] mt-0.5">{yearError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">CVC</label>
                  <input
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="111"
                    className={inputClass}
                    maxLength={4}
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Test: 111</p>
                </div>
              </div>
            </div>

            <button
              className="w-full h-12 gradient-accent text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 hover:shadow-lg transition-all cursor-pointer border-none disabled:opacity-50 text-base"
              onClick={handlePayment}
              disabled={processing || !cardNumber || !cardExpValid || !cardCvc || !cardholderName}
            >
              {processing ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Processing Payment...</>
              ) : (
                <><Lock className="h-5 w-5" /> Pay {formatAmount(details.amount || "0")}</>
              )}
            </button>

            <div className="relative flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-[var(--border-color)]" />
              <span className="text-[11px] text-[var(--text-muted)] font-medium">or pay with</span>
              <div className="flex-1 h-px bg-[var(--border-color)]" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled
                className="h-11 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--text-muted)] opacity-60 cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.51-3.23 0-1.44.64-2.2.52-3.06-.4C3.79 16.18 4.36 9.2 8.87 8.96c1.28.07 2.15.74 2.9.78.97-.2 1.9-.95 3.18-.85 1.34.14 2.35.66 3.02 1.66-2.7 1.62-2.06 5.18.46 6.2-.54 1.4-1.24 2.78-2.38 3.53zM12.03 8.9C11.9 6.74 13.64 4.94 15.72 4.8c.28 2.38-2.2 4.18-3.69 4.1z"/></svg>
                Apple Pay
              </button>
              <button
                disabled
                className="h-11 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--text-muted)] opacity-60 cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M3.22 7.31c-.14.37-.22.79-.22 1.25v6.88c0 .46.08.88.22 1.25.14.37.35.69.61.95.26.26.58.47.95.61.37.14.79.22 1.25.22h11.94c.46 0 .88-.08 1.25-.22.37-.14.69-.35.95-.61.26-.26.47-.58.61-.95.14-.37.22-.79.22-1.25V8.56c0-.46-.08-.88-.22-1.25-.14-.37-.35-.69-.61-.95-.26-.26-.58-.47-.95-.61A3.07 3.07 0 0017.97 5.5H6.03c-.46 0-.88.08-1.25.22-.37.14-.69.35-.95.61-.26.26-.47.58-.61.95zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5S10.07 8.5 12 8.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
                Google Pay
              </button>
            </div>
            <p className="text-[10px] text-center text-[var(--text-muted)] mt-1">
              Apple Pay and Google Pay coming soon
            </p>

            <p className="text-xs text-center text-[var(--text-muted)]">
              Your card information is transmitted securely and never stored.
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="glass-card p-8 text-center space-y-4 animate-scaleIn border-[var(--accent)]/20">
            <div className="w-20 h-20 bg-[var(--accent-50)] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-[var(--accent)]" />
            </div>
            <h2 className="text-2xl font-black text-[var(--slate-900)]">Payment Successful!</h2>
            <p className="text-[var(--text-muted)]">
              Your payment has been processed and the bond has been issued.
            </p>

            {txnResult && (
              <div className="glass-card p-4 text-sm text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Transaction ID</span>
                  <span className="font-mono text-xs text-[var(--slate-900)]">{txnResult.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Card</span>
                  <span className="text-[var(--slate-900)]">{txnResult.cardType} ending in {txnResult.cardLast4}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Amount</span>
                  <span className="font-bold text-[var(--accent)]">{formatAmount(txnResult.amount || "0")}</span>
                </div>
              </div>
            )}

            {details && (
              <div className="glass-card p-3 text-sm text-left">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Bond Number</span>
                  <span className="font-mono font-medium text-[var(--slate-900)]">{details.bondNumber}</span>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                className="w-full h-11 gradient-accent text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer border-none"
                onClick={() => {
                  const base = import.meta.env.BASE_URL || "/";
                  window.location.href = `${base}principal/dashboard`;
                }}
              >
                <Home className="h-4 w-4" /> Go to My Dashboard
              </button>
              <p className="text-xs text-[var(--text-muted)]">
                You may also close this window. A confirmation email will be sent shortly.
              </p>
            </div>
          </div>
        )}

        <div className="text-center py-4">
          <p className="text-xs text-[var(--text-muted)]">
            Powered by Surety Demo App &middot; Surety Demo App Portal
          </p>
        </div>
      </div>
    </div>
  );
}
