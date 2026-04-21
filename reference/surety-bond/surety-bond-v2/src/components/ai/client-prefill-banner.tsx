import { useState, useEffect } from "react";
import { Sparkles, Check, ChevronDown, ChevronUp, Loader2, History, Zap } from "lucide-react";
import { useClientPreFill, type AIClientPreFill } from "@/hooks/use-ai-underwriting";

interface ClientPreFillBannerProps {
  clientId: number | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  bondFormName: string;
  bondFormType: string;
  onApplyPreFill: (fields: Partial<Record<string, string>>) => void;
}

export function ClientPreFillBanner({
  clientId,
  clientName,
  clientEmail,
  clientPhone,
  clientAddress,
  clientCity,
  clientState,
  clientZip,
  bondFormName,
  bondFormType,
  onApplyPreFill,
}: ClientPreFillBannerProps) {
  const { history, preFill, loading, preFillLoading, fetchHistory, generatePreFill, reset } = useClientPreFill();
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (clientId) {
      setApplied(false);
      fetchHistory(clientId);
    } else {
      reset();
      setApplied(false);
    }
  }, [clientId, fetchHistory, reset]);

  useEffect(() => {
    if (history && history.totalBonds > 0 && clientId && bondFormName) {
      generatePreFill({
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        clientCity,
        clientState,
        clientZip,
        newBondType: bondFormType,
        newBondFormName: bondFormName,
        bondHistory: history.bonds.map((b: any) => ({
          bondType: b.bondType,
          obligeeName: b.obligeeName,
          obligeeAddress: b.obligeeAddress || "",
          obligeeCity: b.obligeeCity || "",
          obligeeState: b.obligeeState || "",
          obligeeZip: b.obligeeZip || "",
          bondAmount: b.bondAmount,
          billingType: b.billingType,
          description: b.description,
          status: b.status,
        })),
        principal: history.principal,
      });
    }
  }, [history, clientId, bondFormName, bondFormType, clientName, clientEmail, clientPhone, clientAddress, clientCity, clientState, clientZip, generatePreFill]);

  const handleApply = (fields: AIClientPreFill) => {
    const updates: Record<string, string> = {};
    if (fields.principalCompanyName) updates.principalCompanyName = fields.principalCompanyName;
    if (fields.principalFirstName) updates.principalFirstName = fields.principalFirstName;
    if (fields.principalLastName) updates.principalLastName = fields.principalLastName;
    if (fields.principalEmail) updates.principalEmail = fields.principalEmail;
    if (fields.principalPhone) updates.principalPhone = fields.principalPhone;
    if (fields.principalAddress) updates.principalAddress = fields.principalAddress;
    if (fields.principalCity) updates.principalCity = fields.principalCity;
    if (fields.principalState) updates.principalState = fields.principalState;
    if (fields.principalZip) updates.principalZip = fields.principalZip;
    if (fields.obligeeName) updates.obligeeName = fields.obligeeName;
    if (fields.obligeeAddress) updates.obligeeAddress = fields.obligeeAddress;
    if (fields.obligeeCity) updates.obligeeCity = fields.obligeeCity;
    if (fields.obligeeState) updates.obligeeState = fields.obligeeState;
    if (fields.obligeeZip) updates.obligeeZip = fields.obligeeZip;
    if (fields.bondAmount) updates.bondAmount = fields.bondAmount;
    if (fields.bondDescription) updates.bondDescription = fields.bondDescription;
    if (fields.billingType) updates.billingType = fields.billingType;
    onApplyPreFill(updates);
    setApplied(true);
  };

  if (!clientId || loading) return null;

  if (history && history.totalBonds === 0) return null;

  if (preFillLoading) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--accent)]/30 bg-[var(--accent-50)] p-4 flex items-center gap-3 animate-fadeUp">
        <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
          <Loader2 className="h-4.5 w-4.5 text-[var(--accent)] animate-spin" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--slate-800)]">Analyzing client history...</p>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
            Found {history?.totalBonds || 0} prior bond(s) for {clientName}. Preparing smart pre-fill.
          </p>
        </div>
      </div>
    );
  }

  if (!preFill) return null;

  if (applied) {
    return (
      <div className="rounded-[var(--r-lg)] border border-emerald-300 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex items-center gap-3 animate-fadeUp">
        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
          <Check className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">Application pre-filled from history</p>
          <p className="text-[11.5px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            {preFill.fieldsFromHistory.length} fields auto-populated. Review and adjust as needed on the next steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--accent)]/30 bg-gradient-to-r from-[var(--accent-50)] to-card overflow-hidden animate-fadeUp">
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[13px] font-bold text-[var(--slate-900)]">Returning Client Detected</p>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                AI Pre-Fill
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 sm:pl-11">
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-muted)] leading-relaxed line-clamp-3">
              {preFill.message}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <History className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
              <span className="text-[11px] text-[var(--text-muted)]">
                {history?.totalBonds} prior bond(s) · {preFill.confidence}% confidence
              </span>
            </div>
          </div>

          <div className="flex sm:flex-col sm:items-end items-center gap-2">
            <button
              onClick={() => handleApply(preFill)}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-[var(--r)] text-[12px] font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
              style={{ background: 'var(--accent)' }}
            >
              <Zap className="h-3.5 w-3.5" />
              Auto-Fill ({preFill.fieldsFromHistory.length} fields)
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-[var(--r)] text-[12px] font-medium text-[var(--slate-600)] bg-card border border-[var(--border-color)] hover:bg-[var(--slate-50)] transition-colors whitespace-nowrap"
            >
              {expanded ? "Hide" : "Preview"}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border-color)] bg-card p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            {preFill.principalCompanyName && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Principal</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.principalCompanyName}</span>
              </div>
            )}
            {(preFill.principalFirstName || preFill.principalLastName) && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Contact</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.principalFirstName} {preFill.principalLastName}</span>
              </div>
            )}
            {preFill.principalEmail && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Email</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.principalEmail}</span>
              </div>
            )}
            {preFill.principalPhone && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Phone</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.principalPhone}</span>
              </div>
            )}
            {preFill.obligeeName && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Obligee</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.obligeeName}</span>
              </div>
            )}
            {preFill.bondAmount && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Bond Amount</span>
                <span className="font-medium text-[var(--slate-800)]">${Number(preFill.bondAmount).toLocaleString()}</span>
              </div>
            )}
            {preFill.principalState && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">State</span>
                <span className="font-medium text-[var(--slate-800)] truncate ml-2">{preFill.principalCity}, {preFill.principalState} {preFill.principalZip}</span>
              </div>
            )}
            {preFill.billingType && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Billing</span>
                <span className="font-medium text-[var(--slate-800)]">{preFill.billingType.replace(/_/g, " ")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
