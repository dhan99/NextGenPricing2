import { useState, useEffect, useRef } from "react";
import { Sparkles, Lightbulb, AlertTriangle, XCircle, Wand2, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useAIFormAssistance, type AIFormAssistance } from "@/hooks/use-ai-underwriting";

interface AIFormAssistantProps {
  currentStep: number;
  bondFormName: string;
  bondFormType: string;
  bondAmount: string;
  principalCompanyName: string;
  principalState: string;
  obligeeName: string;
  effectiveDate: string;
  expirationDate: string;
  onApplySuggestion?: (field: string, value: string) => void;
}

export function AIFormAssistant({
  currentStep,
  bondFormName,
  bondFormType,
  bondAmount,
  principalCompanyName,
  principalState,
  obligeeName,
  effectiveDate,
  expirationDate,
  onApplySuggestion,
}: AIFormAssistantProps) {
  const { data, loading, getAssistance } = useAIFormAssistance();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastRequestRef = useRef("");

  useEffect(() => {
    if (dismissed) return;

    const requestKey = JSON.stringify({
      currentStep, bondFormName, bondFormType, bondAmount,
      principalCompanyName, principalState, obligeeName,
      effectiveDate, expirationDate,
    });

    if (requestKey === lastRequestRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const filledFields: string[] = [];
      const emptyRequiredFields: string[] = [];

      if (bondFormName) filledFields.push("bondFormName");
      else emptyRequiredFields.push("bondFormName");

      if (principalCompanyName) filledFields.push("principalCompanyName");
      else if (currentStep >= 3) emptyRequiredFields.push("principalCompanyName");

      if (obligeeName) filledFields.push("obligeeName");
      else if (currentStep >= 3) emptyRequiredFields.push("obligeeName");

      if (bondAmount) filledFields.push("bondAmount");
      else if (currentStep >= 4) emptyRequiredFields.push("bondAmount");

      if (effectiveDate) filledFields.push("effectiveDate");
      else if (currentStep >= 2) emptyRequiredFields.push("effectiveDate");

      if (expirationDate) filledFields.push("expirationDate");
      else if (currentStep >= 2) emptyRequiredFields.push("expirationDate");

      if (principalState) filledFields.push("principalState");
      if (bondFormType) filledFields.push("bondFormType");

      getAssistance({
        currentStep,
        bondFormName,
        bondFormType,
        bondAmount,
        principalCompanyName,
        principalState,
        obligeeName,
        effectiveDate,
        expirationDate,
        filledFields,
        emptyRequiredFields,
      }).then(() => {
        lastRequestRef.current = requestKey;
      });
    }, 1500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentStep, bondFormName, bondFormType, bondAmount, principalCompanyName, principalState, obligeeName, effectiveDate, expirationDate, dismissed]);

  if (dismissed) return null;
  if (!data && !loading) return null;

  const iconMap = {
    tip: <Lightbulb className="h-3.5 w-3.5 text-blue-500 shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />,
    auto_fill: <Wand2 className="h-3.5 w-3.5 text-violet-500 shrink-0" />,
  };

  const bgMap = {
    tip: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50",
    warning: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50",
    error: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50",
    auto_fill: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800/50",
  };

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/80 dark:from-violet-950/40 to-blue-50/50 dark:to-blue-950/30 overflow-hidden transition-all">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-violet-100/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 flex-1">
          {loading ? (
            <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-violet-500" />
          )}
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">AI Assistant</span>
          {data && (
            <span className="text-xs text-violet-500 font-medium ml-1">
              {data.completenessScore}% complete
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className="p-0.5 rounded hover:bg-violet-200/50 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-violet-400" />
        </button>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-violet-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-violet-400" />
        )}
      </div>

      {!collapsed && data && (
        <div className="px-4 pb-3 space-y-2">
          {data.overallTip && (
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{data.overallTip}</p>
          )}

          {data.suggestions.length > 0 && (
            <div className="space-y-1.5">
              {data.suggestions.map((suggestion, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${bgMap[suggestion.type]}`}
                >
                  {iconMap[suggestion.type]}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">{suggestion.message}</p>
                    {suggestion.type === "auto_fill" && suggestion.value && onApplySuggestion && (
                      <button
                        onClick={() => onApplySuggestion(suggestion.field, suggestion.value!)}
                        className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 underline decoration-dotted"
                      >
                        Apply suggestion: {suggestion.value}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="w-full bg-violet-200/50 rounded-full h-1.5 mt-2">
            <div
              className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${data.completenessScore}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
