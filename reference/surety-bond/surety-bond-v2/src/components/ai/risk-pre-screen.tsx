import { useState, useEffect, useRef, useCallback } from "react";

import { Shield, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, Loader2, TrendingUp } from "lucide-react";
import { useRiskPreScreen } from "@/hooks/use-ai-underwriting";
import { useAuth } from "@/hooks/use-auth";

const API_BASE = "/api";

interface RiskPreScreenProps {
  clientId: number | null;
  clientName: string;
  clientState: string;
  bondFormName: string;
  bondFormType: string;
  bondAmount: string;
}

export function RiskPreScreen({
  clientId,
  clientName,
  clientState,
  bondFormName,
  bondFormType,
  bondAmount,
}: RiskPreScreenProps) {
  const { data, loading, preScreen, reset } = useRiskPreScreen();
  const [expanded, setExpanded] = useState(false);
  const lastKeyRef = useRef<string>("");
  const lastClientRef = useRef<number | null>(null);

  const fetchHistoryAndPreScreen = useCallback(async () => {
    if (!clientId || !bondFormName) return;

    const key = `${clientId}-${bondFormType}-${bondFormName}-${bondAmount}-${clientName}-${clientState}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (lastClientRef.current !== clientId) {
      lastClientRef.current = clientId;
    }

    let bondHistory: any[] = [];
    try {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/clients/${clientId}/bond-history`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (res.ok) {
        const result = await res.json();
        bondHistory = (result.bonds || []).map((b: any) => ({
          bondType: b.bondType,
          bondAmount: b.bondAmount,
          status: b.status,
          riskScore: b.riskScore,
          riskLevel: b.riskLevel,
        }));
      }
    } catch {}

    preScreen({
      bondType: bondFormType,
      bondFormName,
      estimatedAmount: bondAmount || "Not specified",
      clientName,
      clientState: clientState || "",
      bondHistory,
    });
  }, [clientId, bondFormName, bondFormType, bondAmount, clientName, clientState, preScreen]);

  useEffect(() => {
    if (!clientId || !bondFormName) {
      reset();
      lastKeyRef.current = "";
      lastClientRef.current = null;
      return;
    }

    const timer = setTimeout(fetchHistoryAndPreScreen, 600);
    return () => clearTimeout(timer);
  }, [clientId, bondFormName, bondFormType, bondAmount, clientName, clientState, fetchHistoryAndPreScreen, reset]);

  if (!clientId || !bondFormName) return null;

  if (loading) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-color)] bg-card p-3.5 flex items-center gap-3 animate-fadeUp">
        <Loader2 className="h-4 w-4 text-[var(--text-muted)] animate-spin shrink-0" />
        <span className="text-[12px] text-[var(--text-muted)]">Running instant risk pre-screen...</span>
      </div>
    );
  }

  if (!data) return null;

  const signalConfig = {
    green: {
      colorVar: "var(--s-green)",
      bgVar: "var(--s-green-bg)",
      label: "Low Risk",
      Icon: ShieldCheck,
    },
    yellow: {
      colorVar: "var(--s-amber)",
      bgVar: "var(--s-amber-bg)",
      label: "Moderate Risk",
      Icon: Shield,
    },
    red: {
      colorVar: "var(--color-destructive)",
      bgVar: "color-mix(in srgb, var(--color-destructive) 10%, transparent)",
      label: "High Risk",
      Icon: ShieldAlert,
    },
  };

  const config = signalConfig[data.signal];
  const IconComponent = config.Icon;

  return (
    <div className="rounded-[var(--r-lg)] overflow-hidden animate-fadeUp" style={{ background: config.bgVar, border: `1px solid ${config.colorVar}` }}>
      <div
        className="p-3 sm:p-3.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: config.bgVar }}>
            <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: config.colorVar }} />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-[12px] font-bold" style={{ color: config.colorVar }}>{config.label}</span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-[var(--slate-100)] text-[var(--text-muted)]">
              Pre-Screen
            </span>
            <div className="ml-auto shrink-0">
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" style={{ color: config.colorVar }} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" style={{ color: config.colorVar }} />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mt-2 sm:pl-10">
          <p className="text-[11.5px] leading-relaxed line-clamp-2" style={{ color: config.colorVar }}>
            {data.summary}
          </p>
          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0.5 shrink-0">
            <div className="text-[11px] font-semibold" style={{ color: config.colorVar }}>
              {data.estimatedApprovalChance} chance
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{data.confidence}% confidence</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border-color)] bg-[var(--slate-50)] px-3 sm:px-3.5 py-2.5 sm:py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {data.keyFactors.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-wider mb-1.5">Key Factors</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.keyFactors.map((f, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-1 rounded-full font-medium"
                      style={{ background: config.bgVar, color: config.colorVar }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.suggestedActions.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-wider mb-1.5">Suggested Actions</div>
                <ul className="space-y-1">
                  {data.suggestedActions.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-[var(--slate-700)]">
                      <TrendingUp className="h-3 w-3 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
