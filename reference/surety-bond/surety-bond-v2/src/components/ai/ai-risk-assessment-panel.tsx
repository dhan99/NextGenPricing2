import { useEffect } from "react";
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, TrendingUp, Loader2, Sparkles, CheckCircle2, XCircle, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAIRiskAssessment, type AIRiskAssessment } from "@/hooks/use-ai-underwriting";

interface AIRiskAssessmentPanelProps {
  bondData: {
    bondType: string;
    bondAmount: number;
    classCode: string;
    state: string | null;
    principalCompanyName: string;
    obligeeName: string;
    riskScore: number | null;
    riskLevel: string | null;
    riskFlags: string[];
    underwritingAnswers: Record<string, string>;
    companyDeclaredBankruptcy?: string | null;
    companyClaimWithSurety?: string | null;
    companyDeniedBonding?: string | null;
  };
  autoRun?: boolean;
}

const riskConfig = {
  low: { icon: ShieldCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200 dark:border-emerald-800/50", gradient: "from-emerald-50 dark:from-emerald-950/30 to-green-50 dark:to-green-950/20" },
  medium: { icon: Shield, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-blue-200 dark:border-blue-800/50", gradient: "from-blue-50 dark:from-blue-950/30 to-sky-50 dark:to-sky-950/20" },
  high: { icon: ShieldAlert, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-200 dark:border-amber-800/50", gradient: "from-amber-50 dark:from-amber-950/30 to-orange-50 dark:to-orange-950/20" },
  critical: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/50", border: "border-red-200 dark:border-red-800/50", gradient: "from-red-50 dark:from-red-950/30 to-rose-50 dark:to-rose-950/20" },
};

export function AIRiskAssessmentPanel({ bondData, autoRun = true }: AIRiskAssessmentPanelProps) {
  const { data, loading, assess } = useAIRiskAssessment();

  useEffect(() => {
    if (autoRun && bondData.bondAmount > 0) {
      assess(bondData);
    }
  }, [autoRun, bondData.bondAmount, bondData.riskScore, bondData.classCode]);

  if (loading) {
    return (
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/80 to-blue-50/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                <Sparkles className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">AI Risk Analysis Running</p>
              <p className="text-xs text-violet-500 dark:text-violet-400">Analyzing application data and generating assessment...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const config = riskConfig[data.overallRisk];
  const RiskIcon = config.icon;

  return (
    <Card className={`${config.border} bg-gradient-to-br ${config.gradient} overflow-hidden`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center`}>
              <RiskIcon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold">AI Risk Assessment</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color} capitalize`}>
                {data.overallRisk} Risk
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Confidence: {data.confidence}%</span>
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{data.summary}</p>

        {data.keyFindings.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Key Findings</p>
            <ul className="space-y-1">
              {data.keyFindings.map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Info className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.redFlags.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600 mb-1.5">Red Flags</p>
            <ul className="space-y-1">
              {data.redFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                  <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.mitigatingFactors.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1.5">Mitigating Factors</p>
            <ul className="space-y-1">
              {data.mitigatingFactors.map((factor, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recommendations.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Recommendations</p>
            <ul className="space-y-1">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-violet-500 shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
