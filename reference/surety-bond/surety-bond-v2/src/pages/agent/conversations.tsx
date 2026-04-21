import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListBondConversations } from "@workspace/api-client-react";
import { 
  Search, MessageSquareText, Calendar, ChevronRight, Filter, ClipboardCheck
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { useIsMobile } from "@/hooks/use-mobile";


function parseExtractedData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export function AgentConversationsList() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { data: conversations, isLoading } = useListBondConversations({});

  const getTypeBadge = (type: string) => {
    switch(type) {
      case 'new_application': return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">New App</Badge>;
      case 'referral': return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Referral</Badge>;
      case 'renewal': return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">Renewal</Badge>;
      case 'endorsement': return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Endorsement</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
        <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${isMobile ? 'gap-0 mb-2 sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : 'gap-4 mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4'}`}>
          {!isMobile && (
            <div>
              <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">AI Conversations</h1>
              <p className="text-[13.5px] text-[var(--text-muted)] mt-1">Monitor live and completed AI-driven applications.</p>
            </div>
          )}
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search principal..." className="pl-9 bg-card shadow-sm border-muted h-11" />
            </div>
            <Button variant="outline" className="shrink-0 bg-card shadow-sm min-h-[44px]">
              <Filter className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Filter</span>
            </Button>
          </div>
        </div>

        {/* Desktop table */}
        <Card className="shadow-sm border-muted overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/40 uppercase border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold">Type & Status</th>
                  <th className="px-6 py-4 font-semibold">Principal / Lead</th>
                  <th className="px-6 py-4 font-semibold">AI Risk Profile</th>
                  <th className="px-6 py-4 font-semibold">Extracted Value</th>
                  <th className="px-6 py-4 font-semibold">Started</th>
                  <th className="px-6 py-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      Loading conversations...
                    </td>
                  </tr>
                ) : conversations?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <MessageSquareText className="h-8 w-8 mx-auto mb-3 opacity-20" />
                      No AI conversations found.
                    </td>
                  </tr>
                ) : (
                  conversations?.map((conv) => {
                    const extracted = parseExtractedData(conv.extractedData);
                    const isReferral = conv.conversationType === 'referral';
                    const isPendingUnderwriting = isReferral && conv.status === 'completed';

                    return (
                      <tr key={conv.id} className={`hover:bg-muted/30 transition-colors group ${isPendingUnderwriting ? 'border-l-2 border-l-purple-400' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            {getTypeBadge(conv.conversationType)}
                            {isPendingUnderwriting ? (
                              <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-purple-700 tracking-wider">
                                <ClipboardCheck className="h-3 w-3" />
                                Pending Underwriting
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                {conv.status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">
                          {conv.referralName || conv.title.split(' with ')[1] || "Unknown Client"}
                          {conv.referralEmail && <div className="text-xs text-muted-foreground font-normal mt-0.5">{conv.referralEmail}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <RiskBadge 
                            level={conv.riskLevel || 'pending'} 
                            score={conv.riskScore} 
                            showScore={!!conv.riskScore} 
                          />
                        </td>
                        <td className="px-6 py-4">
                          {extracted.bondAmount ? (
                            <span className="font-semibold font-mono">
                              ${Number(extracted.bondAmount).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Gathering...</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            {format(new Date(conv.createdAt), "MMM d, yyyy")}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={`transition-all min-h-[44px] ${isPendingUnderwriting ? 'text-purple-700 hover:bg-purple-50 hover:text-purple-800' : 'group-hover:bg-primary/10 group-hover:text-primary'}`}
                            onClick={() => setLocation(conv.bondId ? `/agent/bonds/${conv.bondId}` : `/agent/conversations/${conv.id}`)}
                          >
                            {isPendingUnderwriting ? "Review for UW" : "Review"}
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile card layout */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading conversations...</div>
          ) : conversations?.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <MessageSquareText className="h-8 w-8 mx-auto mb-3 opacity-20" />
              No AI conversations found.
            </div>
          ) : (
            conversations?.map((conv) => {
              const extracted = parseExtractedData(conv.extractedData);
              const isReferral = conv.conversationType === 'referral';
              const isPendingUnderwriting = isReferral && conv.status === 'completed';

              return (
                <Card
                  key={conv.id}
                  className={`p-4 cursor-pointer hover:bg-muted/30 transition-colors active:scale-[0.99] border-border/60 ${isPendingUnderwriting ? 'border-l-2 border-l-purple-400' : ''}`}
                  onClick={() => setLocation(conv.bondId ? `/agent/bonds/${conv.bondId}` : `/agent/conversations/${conv.id}`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      {getTypeBadge(conv.conversationType)}
                      {isPendingUnderwriting ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-purple-700">
                          <ClipboardCheck className="h-3 w-3" /> UW
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">{conv.status}</span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <p className="font-semibold text-foreground mb-2">
                    {conv.referralName || conv.title.split(' with ')[1] || "Unknown Client"}
                  </p>
                  {conv.referralEmail && <p className="text-xs text-muted-foreground mb-2">{conv.referralEmail}</p>}
                  <div className="flex items-center justify-between gap-3">
                    <RiskBadge 
                      level={conv.riskLevel || 'pending'} 
                      score={conv.riskScore} 
                      showScore={!!conv.riskScore} 
                    />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 opacity-70" />
                      {format(new Date(conv.createdAt), "MMM d")}
                    </div>
                  </div>
                  {typeof extracted.bondAmount === 'string' || typeof extracted.bondAmount === 'number' ? (
                    <div className="mt-2 pt-2 border-t border-border/50 text-sm">
                      <span className="text-muted-foreground text-xs">Value: </span>
                      <span className="font-semibold font-mono">${Number(extracted.bondAmount).toLocaleString()}</span>
                    </div>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>
    </div>
  );
}
