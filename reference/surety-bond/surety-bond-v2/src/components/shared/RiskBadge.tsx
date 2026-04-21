import { Shield, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BondRiskProfileLevel } from "@workspace/api-client-react";

interface RiskBadgeProps {
  level: BondRiskProfileLevel | string;
  score?: number;
  className?: string;
  showScore?: boolean;
}

export function RiskBadge({ level, score, className, showScore = false }: RiskBadgeProps) {
  const getConfig = () => {
    switch (level?.toLowerCase()) {
      case 'low':
        return {
          icon: ShieldCheck,
          text: "Low Risk",
          colorVar: "var(--s-green)",
          bgVar: "var(--s-green-bg)",
        };
      case 'medium':
        return {
          icon: Shield,
          text: "Medium Risk",
          colorVar: "var(--s-purple)",
          bgVar: "var(--s-purple-bg)",
        };
      case 'high':
        return {
          icon: ShieldAlert,
          text: "High Risk",
          colorVar: "var(--s-amber)",
          bgVar: "var(--s-amber-bg)",
        };
      case 'very_high':
        return {
          icon: ShieldOff,
          text: "Very High Risk",
          colorVar: "var(--color-destructive)",
          bgVar: "color-mix(in srgb, var(--color-destructive) 10%, transparent)",
        };
      default:
        return {
          icon: Shield,
          text: "Pending Assessment",
          colorVar: undefined,
          bgVar: undefined,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-full border text-xs font-semibold shadow-sm transition-colors min-h-[28px]", !config.colorVar && "bg-muted text-muted-foreground border-border", className)}
      style={config.colorVar ? { background: config.bgVar, color: config.colorVar, borderColor: config.colorVar } : {}}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{config.text}</span>
      {showScore && score !== undefined && (
        <span className="ml-1 pl-1.5 border-l border-current/20 opacity-90 shrink-0">
          Score: {score}
        </span>
      )}
    </div>
  );
}
