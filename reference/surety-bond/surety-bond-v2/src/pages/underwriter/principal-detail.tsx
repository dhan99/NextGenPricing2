import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useListBonds } from "@workspace/api-client-react";
import {
  ArrowLeft, User, Mail, Phone, MapPin, Building, Shield, ShieldCheck, ShieldAlert,
  AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, RefreshCw, ArrowUpRight
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

const API_BASE = "";

function useCreditRating(principalId: number) {
  return useQuery({
    queryKey: ["credit-rating", principalId],
    queryFn: async () => {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/api/principals/${principalId}/credit-rating`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) throw new Error("Failed to fetch credit rating");
      return res.json();
    },
    enabled: !!principalId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

function useRiskRating(principalId: number) {
  return useQuery({
    queryKey: ["risk-rating", principalId],
    queryFn: async () => {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/api/principals/${principalId}/risk-rating`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) throw new Error("Failed to fetch risk rating");
      return res.json();
    },
    enabled: !!principalId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

function usePrincipal(principalId: number) {
  return useQuery({
    queryKey: ["principal", principalId],
    queryFn: async () => {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/api/principals/${principalId}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) throw new Error("Failed to fetch principal");
      return res.json();
    },
    enabled: !!principalId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

const impactIcon = (impact: string) => {
  if (impact === "positive") return <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--s-green)' }} />;
  if (impact === "negative") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
};

function CreditScoreGauge({ score, min, max }: { score: number; min: number; max: number }) {
  const pct = ((score - min) / (max - min)) * 100;
  const color = score >= 750 ? "#059669" : score >= 700 ? "#0284C7" : score >= 650 ? "#D97706" : score >= 600 ? "#EA580C" : "#DC2626";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#E2E8F0" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 3.27} ${327 - pct * 3.27}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color }}>{score}</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Score</span>
        </div>
      </div>
    </div>
  );
}

function RiskScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#059669" : score >= 60 ? "#0284C7" : score >= 40 ? "#D97706" : "#DC2626";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#E2E8F0" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${score * 3.27} ${327 - score * 3.27}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color }}>{score}</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Risk</span>
        </div>
      </div>
    </div>
  );
}

export function UnderwriterPrincipalDetail() {
  const [, params] = useRoute("/underwriter/principals/:id");
  const principalId = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const { data: principal, isLoading: principalLoading } = usePrincipal(principalId);
  const { data: creditRating, isLoading: creditLoading, refetch: refetchCredit } = useCreditRating(principalId);
  const { data: riskRating, isLoading: riskLoading, refetch: refetchRisk } = useRiskRating(principalId);
  const { data: bonds } = useListBonds({}, { query: { staleTime: 0, refetchOnMount: "always" } });

  const principalBonds = (bonds || []).filter((b: any) => b.principalId === principalId);

  if (principalLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/underwriter/review")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <div className={`flex items-center justify-between ${isMobile ? 'gap-2' : ''}`}>
        <div>
          <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold tracking-tight`}>
            {principal?.companyName || `${principal?.firstName} ${principal?.lastName}`}
          </h1>
          {!isMobile && <p className="text-sm text-muted-foreground mt-1">Principal Credit & Risk Analysis</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { refetchCredit(); refetchRisk(); }}>
            <RefreshCw className="h-3.5 w-3.5" /> {isMobile ? 'Refresh' : 'Refresh Reports'}
          </Button>
        </div>
      </div>

      {principal && (
        <Card>
          <CardContent className={isMobile ? 'p-3' : 'p-5'}>
            <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-start gap-4'}`}>
              <div className={`${isMobile ? 'h-10 w-10 text-base' : 'h-12 w-12 text-lg'} rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold`}>
                {(principal.companyName || principal.firstName || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {principal.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {principal.email}
                  </div>
                )}
                {principal.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {principal.phone}
                  </div>
                )}
                {principal.state && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {principal.city ? `${principal.city}, ` : ""}{principal.state}
                  </div>
                )}
                {principal.businessType && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building className="h-3.5 w-3.5" /> {principal.businessType}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 ${isMobile ? 'gap-3' : 'gap-6'}`}>
        <Card>
          <CardContent className={isMobile ? 'p-3' : 'p-6'}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Credit Rating</h3>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Equifax</span>
                </div>
              </div>
            </div>

            {creditLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : creditRating ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <CreditScoreGauge score={creditRating.creditScore} min={creditRating.scoreRange.min} max={creditRating.scoreRange.max} />
                  <div className="text-right space-y-1">
                    <div className="text-lg font-bold">{creditRating.creditRating}</div>
                    <div className="text-xs text-muted-foreground">
                      Range: {creditRating.scoreRange.min}–{creditRating.scoreRange.max}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key Factors</h4>
                  {creditRating.factors.map((f: any) => (
                    <div key={f.factor} className="flex items-center gap-2 text-sm p-2 rounded bg-slate-50">
                      {impactIcon(f.impact)}
                      <span className="font-medium flex-1">{f.factor}</span>
                      <span className="text-xs text-muted-foreground">{f.detail}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center pt-2 border-t">
                  <div>
                    <div className="text-lg font-bold">{creditRating.tradelines.totalAccounts}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Total Accounts</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{creditRating.tradelines.openAccounts}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Open</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-500">{creditRating.tradelines.delinquentAccounts}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Delinquent</div>
                  </div>
                </div>

                {(creditRating.publicRecords.bankruptcies > 0 || creditRating.publicRecords.liens > 0) && (
                  <div className="p-3 rounded bg-red-50 border border-red-200 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-semibold text-red-700">Public Records</span>
                    </div>
                    {creditRating.publicRecords.bankruptcies > 0 && (
                      <p className="text-red-600 text-xs">Bankruptcies: {creditRating.publicRecords.bankruptcies}</p>
                    )}
                    {creditRating.publicRecords.liens > 0 && (
                      <p className="text-red-600 text-xs">Liens: {creditRating.publicRecords.liens}</p>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground text-right">
                  Report generated: {new Date(creditRating.reportDate).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Unable to load credit data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className={isMobile ? 'p-3' : 'p-6'}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-purple-100 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Risk Rating</h3>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">LexisNexis</span>
                </div>
              </div>
            </div>

            {riskLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : riskRating ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <RiskScoreGauge score={riskRating.compositeRiskScore} />
                  <div className="text-right space-y-1">
                    <div className="text-lg font-bold">{riskRating.riskTier} Risk</div>
                    <div className="inline-block px-2 py-1 rounded text-xs font-bold" style={{
                      background: riskRating.recommendation === "approve" ? 'var(--s-green-bg)' :
                        riskRating.recommendation === "approve_with_conditions" ? 'var(--s-purple-bg)' :
                        riskRating.recommendation === "refer_to_senior" ? 'var(--s-amber-bg)' :
                        'color-mix(in srgb, var(--color-destructive) 10%, transparent)',
                      color: riskRating.recommendation === "approve" ? 'var(--s-green)' :
                        riskRating.recommendation === "approve_with_conditions" ? 'var(--s-purple)' :
                        riskRating.recommendation === "refer_to_senior" ? 'var(--s-amber)' :
                        'var(--color-destructive)'
                    }}>
                      {riskRating.recommendation.replace(/_/g, " ").toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Components</h4>
                  {riskRating.components.map((c: any) => (
                    <div key={c.name} className="flex items-center gap-2 text-sm">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs font-bold">{c.score}/100</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${c.score}%`,
                              backgroundColor: c.score >= 70 ? "#059669" : c.score >= 50 ? "#D97706" : "#DC2626",
                            }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="p-2 rounded bg-slate-50 text-center">
                    <div className="text-xs text-muted-foreground uppercase">Identity</div>
                    <div className="text-sm font-bold" style={{ color: riskRating.identityVerification.status === "verified" ? 'var(--s-green)' : 'var(--s-amber)' }}>
                      {riskRating.identityVerification.status === "verified" ? "Verified" : "Review Required"}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 text-center">
                    <div className="text-xs text-muted-foreground uppercase">OFAC / PEP</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--s-green)' }}>Clear</div>
                  </div>
                </div>

                {riskRating.adverseMedia.found && (
                  <div className="p-3 rounded text-sm" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" style={{ color: 'var(--s-amber)' }} />
                      <span className="font-semibold" style={{ color: 'var(--s-amber)' }}>
                        {riskRating.adverseMedia.count} adverse media mention(s) found
                      </span>
                    </div>
                  </div>
                )}

                {riskRating.litigationHistory.civilCases > 0 && (
                  <div className="p-3 rounded bg-slate-50 border text-sm">
                    <span className="font-medium">Litigation:</span>{" "}
                    <span className="text-muted-foreground">
                      {riskRating.litigationHistory.civilCases} civil case(s)
                      {riskRating.litigationHistory.bankruptcyFilings > 0 && `, ${riskRating.litigationHistory.bankruptcyFilings} bankruptcy filing(s)`}
                    </span>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground text-right">
                  Report generated: {new Date(riskRating.reportDate).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Unable to load risk data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className={isMobile ? 'p-3' : 'p-6'}>
          <h3 className="font-semibold mb-4">Bond History ({principalBonds.length})</h3>
          {principalBonds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No bonds found for this principal</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Bond #</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Amount</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {principalBonds.map((bond: any) => (
                    <tr key={bond.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{bond.bondNumber}</td>
                      <td className="px-3 py-2 capitalize">{bond.bondType.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 font-semibold">{formatCurrency(bond.bondAmount)}</td>
                      <td className="px-3 py-2"><StatusBadge status={bond.status} /></td>
                      <td className="px-3 py-2">
                        <Link href={`/underwriter/bonds/${bond.id}`}>
                          <ArrowUpRight className="h-4 w-4 text-[var(--accent)] cursor-pointer" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
