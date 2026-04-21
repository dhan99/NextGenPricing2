import { useEffect, useState } from "react";
import { AlertTriangle, Info, X, Bell, ShieldAlert, Calendar, TrendingUp, ChevronRight } from "lucide-react";
import { useSmartAlerts, type AISmartAlert } from "@/hooks/use-ai-underwriting";

interface SmartAlertsProps {
  context?: Record<string, unknown>;
  autoFetch?: boolean;
  compact?: boolean;
}

const severityConfig = {
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800/50", ring: "ring-blue-200 dark:ring-blue-800/50" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800/50", ring: "ring-amber-200 dark:ring-amber-800/50" },
  critical: { icon: ShieldAlert, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800/50", ring: "ring-red-200 dark:ring-red-800/50" },
};

const categoryIcon = {
  risk: ShieldAlert,
  compliance: Info,
  opportunity: TrendingUp,
  deadline: Calendar,
};

export function SmartAlerts({ context = {}, autoFetch = true, compact = false }: SmartAlertsProps) {
  const { alerts, loading, fetchAlerts, dismissAlert } = useSmartAlerts();
  const [expanded, setExpanded] = useState(true);

  const contextKey = JSON.stringify(context);
  useEffect(() => {
    if (autoFetch) {
      fetchAlerts(context);
    }
  }, [autoFetch, contextKey]);

  if (loading || alerts.length === 0) return null;

  if (compact) {
    return (
      <div className="space-y-1.5">
        {alerts.slice(0, 3).map((alert) => {
          const config = severityConfig[alert.severity];
          const CategoryIcon = categoryIcon[alert.category];
          return (
            <div
              key={alert.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.border} ${config.bg} text-xs`}
            >
              <CategoryIcon className={`h-3.5 w-3.5 ${config.color} shrink-0`} />
              <span className="flex-1 truncate">{alert.title}</span>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="p-0.5 rounded hover:bg-black/5"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/50 dark:from-violet-950/40 to-blue-50/30 dark:to-blue-950/20 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-violet-100/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Bell className="h-4 w-4 text-violet-500" />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
          Smart Alerts
        </span>
        <span className="text-xs text-violet-500 bg-violet-100 dark:bg-violet-900/50 px-1.5 py-0.5 rounded-full font-medium">
          {alerts.length}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 text-violet-400 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const SeverityIcon = config.icon;
            const CategoryIcon = categoryIcon[alert.category];

            return (
              <div
                key={alert.id}
                className={`rounded-lg border ${config.border} ${config.bg} p-3 space-y-1.5`}
              >
                <div className="flex items-start gap-2">
                  <SeverityIcon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold ${config.color}`}>{alert.title}</p>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <CategoryIcon className="h-2.5 w-2.5" />
                        {alert.category}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{alert.message}</p>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="p-0.5 rounded hover:bg-black/5 shrink-0"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
