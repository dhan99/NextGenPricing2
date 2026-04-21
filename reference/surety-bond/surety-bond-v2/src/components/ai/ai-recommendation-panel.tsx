import { useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, TrendingUp, DollarSign, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAIRecommendation } from "@/hooks/use-ai-underwriting";

interface AIRecommendationPanelProps {
  bondId: number;
  onApplyDecision?: (decision: string) => void;
}

const decisionConfig = {
  approve: { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200 dark:border-emerald-800/50", label: "Approve", gradient: "from-emerald-50 dark:from-emerald-950/30 to-green-50 dark:to-green-950/20" },
  approve_with_conditions: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-200 dark:border-amber-800/50", label: "Approve with Conditions", gradient: "from-amber-50 dark:from-amber-950/30 to-yellow-50 dark:to-yellow-950/20" },
  decline: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/50", border: "border-red-200 dark:border-red-800/50", label: "Decline", gradient: "from-red-50 dark:from-red-950/30 to-rose-50 dark:to-rose-950/20" },
  request_info: { icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-blue-200 dark:border-blue-800/50", label: "Request More Information", gradient: "from-blue-50 dark:from-blue-950/30 to-sky-50 dark:to-sky-950/20" },
};

const severityColors = {
  low: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50",
  medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50",
  high: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50",
};

export function AIRecommendationPanel({ bondId, onApplyDecision }: AIRecommendationPanelProps) {
  const { data, loading, error, getRecommendation } = useAIRecommendation();

  useEffect(() => {
    if (bondId) {
      getRecommendation(bondId);
    }
  }, [bondId]);

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
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">AI Analyzing Application</p>
              <p className="text-xs text-violet-500 dark:text-violet-400">Generating underwriting recommendation...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  const config = decisionConfig[data.decision];
  const DecisionIcon = config.icon;

  return (
    <Card className={`${config.border} bg-gradient-to-br ${config.gradient} overflow-hidden`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center`}>
              <DecisionIcon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold">AI Recommendation</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Confidence: {data.confidence}%</span>
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{data.reasoning}</p>

        {data.riskFactors.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Risk Factors</p>
            <div className="space-y-1.5">
              {data.riskFactors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${severityColors[factor.severity]}`}>
                    {factor.severity.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-medium">{factor.factor}</p>
                    <p className="text-xs text-muted-foreground">{factor.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.conditions.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-1.5">Required Conditions</p>
            <ul className="space-y-1">
              {data.conditions.map((condition, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <span>{condition}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.additionalInfoNeeded.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1.5">Additional Information Needed</p>
            <ul className="space-y-1">
              {data.additionalInfoNeeded.map((info, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <FileText className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                  <span>{info}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.suggestedPremiumAdjustment !== null && data.suggestedPremiumAdjustment !== 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--glass-bg)] border border-current/10">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs">
              Suggested premium adjustment: <strong className={data.suggestedPremiumAdjustment > 0 ? "text-amber-600" : "text-emerald-600"}>
                {data.suggestedPremiumAdjustment > 0 ? "+" : ""}{data.suggestedPremiumAdjustment}%
              </strong>
            </span>
          </div>
        )}

        {onApplyDecision && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Apply AI recommendation as your decision:</p>
            <Button
              size="sm"
              variant="outline"
              className={`gap-1.5 ${config.color} border-current/30 hover:${config.bg}`}
              onClick={() => {
                const mapped = data.decision === "approve_with_conditions" ? "approved" : data.decision === "approve" ? "approved" : data.decision === "decline" ? "declined" : "pending_information";
                onApplyDecision(mapped);
              }}
            >
              <Sparkles className="h-3 w-3" /> Apply: {config.label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
