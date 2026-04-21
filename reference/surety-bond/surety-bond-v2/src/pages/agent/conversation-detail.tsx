import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetBondConversation } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, ShieldCheck, User, CheckCircle2, Clock } from "lucide-react";
import { Link } from "wouter";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTheme } from "@/themes/theme-provider";

export function AgentConversationDetail() {
  const { theme } = useTheme();
  const [, params] = useRoute("/agent/conversations/:id");
  const id = parseInt(params?.id || "0");

  const { data: convData, isLoading } = useGetBondConversation(id, {
    query: { enabled: !!id, queryKey: ["getBondConversation", id] }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 sm:h-64 p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin h-6 w-6 sm:h-8 sm:w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-xs sm:text-sm text-muted-foreground">Loading details...</span>
        </div>
      </div>
    );
  }

  if (!convData) return <div>Conversation not found</div>;

  let extracted = {};
  try { if (convData.extractedData) extracted = JSON.parse(convData.extractedData); } catch(e) {}

  return (
    <div className="animate-fadeUp">
        <div className="mb-4 sm:mb-6">
          <Link href="/agent/conversations" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to AI Chats
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--slate-900)] flex items-center gap-2 sm:gap-3 flex-wrap">
                  AI Transcript
                  <Badge variant="outline" className="bg-primary/5 uppercase text-xs">{convData.conversationType.replace('_', ' ')}</Badge>
                </h1>
                <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Started {format(new Date(convData.createdAt), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              <div className="px-3 py-1 bg-card border rounded-lg shadow-sm text-sm font-medium">
                Status: <span className="capitalize text-primary">{convData.status}</span>
              </div>
            </div>

            <Card className="shadow-sm border-muted">
              <CardContent className="p-0">
                <div className="flex flex-col divide-y divide-border/50">
                  {convData.messages?.map((msg, i) => (
                    <div key={msg.id} className={cn("p-4 sm:p-6 flex gap-3 sm:gap-4", msg.role === 'assistant' ? "bg-[var(--slate-50)]" : "")}>
                      <div className="shrink-0 mt-1">
                        {msg.role === 'assistant' ? (
                          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-sm">
                            <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[var(--slate-200)] flex items-center justify-center border">
                            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">
                            {msg.role === 'assistant' ? `${theme.aiName} AI` : 'Applicant'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.createdAt), "h:mm a")}
                          </span>
                        </div>
                        <p className="text-foreground leading-relaxed text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6">
            <Card className="shadow-md border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-primary to-primary/50"></div>
              <CardHeader className="pb-3 bg-muted/10">
                <CardTitle className="text-base sm:text-lg">Risk Profile Assessment</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex flex-col gap-4 sm:gap-5">
                <div className="flex items-center justify-between bg-card p-3 sm:p-4 rounded-xl border shadow-sm">
                  <span className="font-medium text-muted-foreground text-sm">Calculated Risk</span>
                  <RiskBadge level={convData.riskLevel || 'pending'} score={convData.riskScore} showScore className="text-sm px-3 py-1.5" />
                </div>
                
                {convData.riskFlags && (
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">AI Analysis Notes</h4>
                    <div className="space-y-2">
                      {JSON.parse(convData.riskFlags).map((flag: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-muted/30 p-2.5 rounded-lg text-sm border border-transparent hover:border-border transition-colors">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-foreground/90">{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-muted">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">Extracted Application Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(extracted).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No structured data extracted yet.</p>
                  ) : (
                    Object.entries(extracted).map(([key, val]) => (
                      <div key={key} className="flex flex-col py-2 border-b last:border-0 border-border/50">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-sm font-medium mt-1 break-words">{String(val)}</span>
                      </div>
                    ))
                  )}
                </div>
                
                {convData.bondId && (
                  <Button className="w-full mt-6 min-h-[44px]" asChild>
                    <Link href={`/agent/bonds/${convData.bondId}`}>
                      View Created Application <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
    </div>
  );
}
