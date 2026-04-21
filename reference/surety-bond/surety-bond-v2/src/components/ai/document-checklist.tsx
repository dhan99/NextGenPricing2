import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, ChevronDown, ChevronUp, CheckSquare, Square, Sparkles, Loader2 } from "lucide-react";
import { useDocumentChecklist } from "@/hooks/use-ai-underwriting";

interface DocumentChecklistProps {
  bondType: string;
  bondFormName: string;
  bondAmount: number;
  state: string;
  riskLevel: string | null;
  companyName: string;
  hasHistory: boolean;
  documentsCollected: string[];
  onUpdateDocuments: (docs: string[]) => void;
}

export function DocumentChecklist({
  bondType,
  bondFormName,
  bondAmount,
  state,
  riskLevel,
  companyName,
  hasHistory,
  documentsCollected,
  onUpdateDocuments,
}: DocumentChecklistProps) {
  const { data, loading, fetchChecklist } = useDocumentChecklist();
  const [expanded, setExpanded] = useState(false);
  const fetchedRef = useRef("");

  const dedupeKey = `${bondType}-${bondFormName}-${bondAmount}-${state}-${riskLevel}-${companyName}-${hasHistory}`;

  useEffect(() => {
    if (
      bondType &&
      bondFormName &&
      bondAmount > 0 &&
      dedupeKey !== fetchedRef.current
    ) {
      fetchedRef.current = dedupeKey;
      fetchChecklist({
        bondType,
        bondFormName,
        bondAmount,
        state,
        riskLevel,
        companyName,
        hasHistory,
      });
    }
  }, [dedupeKey]);

  if (!bondType || !bondFormName || bondAmount <= 0) return null;

  const toggleDoc = (docName: string) => {
    if (documentsCollected.includes(docName)) {
      onUpdateDocuments(documentsCollected.filter((d) => d !== docName));
    } else {
      onUpdateDocuments([...documentsCollected, docName]);
    }
  };

  const priorityColors = {
    required: "bg-red-500/10 text-red-600 border-red-500/30",
    recommended: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    optional: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  };

  const categoryIcons: Record<string, string> = {
    financial: "💰",
    legal: "⚖️",
    identity: "🪪",
    business: "🏢",
    project: "📋",
  };

  const totalDocs = data?.documents.length || 0;
  const collectedCount = data?.documents.filter((d) =>
    documentsCollected.includes(d.name)
  ).length || 0;

  return (
    <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-violet-500/10">
              <ClipboardList className="h-4 w-4 text-violet-500" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Document Checklist</span>
                <Sparkles className="h-3 w-3 text-violet-400" />
              </div>
              {loading ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating checklist...
                </span>
              ) : data ? (
                <span className="text-xs text-muted-foreground">
                  {collectedCount}/{totalDocs} collected
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && totalDocs > 0 && (
              <div className="h-1.5 w-16 bg-violet-500/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${(collectedCount / totalDocs) * 100}%` }}
                />
              </div>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {expanded && data && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3">{data.summary}</p>
            {data.documents.map((doc) => {
              const isCollected = documentsCollected.includes(doc.name);
              return (
                <button
                  key={doc.name}
                  onClick={() => toggleDoc(doc.name)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    isCollected
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-background border-border/50 hover:border-violet-500/30"
                  }`}
                >
                  {isCollected ? (
                    <CheckSquare className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isCollected ? "line-through text-muted-foreground" : ""}`}>
                        {categoryIcons[doc.category] || "📄"} {doc.name}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${priorityColors[doc.priority]}`}>
                        {doc.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
