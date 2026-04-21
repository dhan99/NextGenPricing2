import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useListBonds, useUpdateUnderwritingDecision } from "@workspace/api-client-react";
import { Shield, ShieldAlert, ShieldCheck, Search, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, XCircle, Clock, FileText, User, MessageSquareText, Sparkles, Loader2, ArrowUpDown, BarChart3, Mail, Send } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AIRecommendationPanel } from "@/components/ai/ai-recommendation-panel";
import { useBatchTriage, useComparableBonds, useDecisionSummary } from "@/hooks/use-ai-underwriting";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";

type StatusFilter = "all" | "requires_referral" | "referred" | "pending_information";

const REVIEW_STATUSES = ["requires_referral", "referred", "indemnity_in_review", "pending_information"];

function getUwFlags(bond: { underwritingData?: unknown }): string[] {
  const data = bond.underwritingData as Record<string, unknown> | null | undefined;
  if (!data || !Array.isArray(data.flags)) return [];
  return data.flags as string[];
}

const urgencyConfig = {
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  high: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  medium: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  low: { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const REVIEW_PAGE_SIZE = 10;

export function UnderwriterReview() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBondId, setSelectedBondId] = useState<number | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [smartSortActive, setSmartSortActive] = useState(false);
  const [aiDraftIndicator, setAiDraftIndicator] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { data: triageData, loading: triageLoading, triage } = useBatchTriage();
  const { data: comparablesData, loading: comparablesLoading, findComparables } = useComparableBonds();
  const { loading: summaryLoading, generateSummary } = useDecisionSummary();

  const { data: bondsResponse, refetch } = useListBonds(
    { query: { queryKey: ["/api/bonds", "uw-review"] as const, refetchInterval: 5000, refetchOnWindowFocus: true } }
  );

  const decisionMutation = useUpdateUnderwritingDecision();

  const bonds = bondsResponse?.filter(
    (b) => REVIEW_STATUSES.includes(b.status)
  ) || [];

  const filteredBonds = (() => {
    let list = bonds.filter((b) => {
      if (statusFilter === "requires_referral" && b.status !== "requires_referral") return false;
      if (statusFilter === "referred" && b.status !== "referred") return false;
      if (statusFilter === "pending_information" && b.status !== "pending_information" && b.status !== "indemnity_in_review") return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.bondNumber.toLowerCase().includes(q) ||
        b.bondType.toLowerCase().includes(q) ||
        b.obligeeName.toLowerCase().includes(q) ||
        (b.principal?.companyName || "").toLowerCase().includes(q) ||
        (b.principal?.firstName || "").toLowerCase().includes(q)
      );
    });

    if (smartSortActive && triageData?.items) {
      const priorityMap = new Map(triageData.items.map((item) => [item.id, item]));
      list = [...list].sort((a, b) => {
        const pa = priorityMap.get(a.id)?.priority ?? 999;
        const pb = priorityMap.get(b.id)?.priority ?? 999;
        return pa - pb;
      });
    }
    return list;
  })();

  const triageMap = smartSortActive && triageData?.items
    ? new Map(triageData.items.map((item) => [item.id, item]))
    : null;

  const selectedBond = bonds.find((b) => b.id === selectedBondId);

  useEffect(() => {
    if (selectedBondId) {
      findComparables(selectedBondId);
    }
    setPendingDecision(null);
    setPendingDecisionBondId(null);
    setDecisionNotes("");
    setAiDraftIndicator(false);
  }, [selectedBondId]);

  const handleSmartSort = async () => {
    if (smartSortActive) {
      setSmartSortActive(false);
      return;
    }
    const result = await triage();
    if (result && result.items.length > 0) {
      setSmartSortActive(true);
    } else {
      toast({ title: "Smart Sort", description: "Could not generate triage data. Try again later.", variant: "destructive" });
    }
  };

  const [pendingDecisionBondId, setPendingDecisionBondId] = useState<number | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogData, setEmailDialogData] = useState<{ bondId: number; agentEmail: string; agentName: string; decision: string } | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [useOneTimeEmail, setUseOneTimeEmail] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const { token } = useAuth();

  const handleDecisionClick = async (decision: string) => {
    if (!selectedBondId) return;
    if (!pendingDecision) {
      setPendingDecision(decision);
      setPendingDecisionBondId(selectedBondId);
      const result = await generateSummary(selectedBondId, decision);
      if (result?.notes) {
        setDecisionNotes(result.notes);
        setAiDraftIndicator(true);
      }
      return;
    }
    await submitDecision(decision);
  };

  const submitDecision = async (decision: string) => {
    if (!selectedBondId) return;
    if (pendingDecisionBondId !== null && pendingDecisionBondId !== selectedBondId) {
      toast({ title: "Decision Mismatch", description: "Bond selection changed. Please start over.", variant: "destructive" });
      setPendingDecision(null);
      setPendingDecisionBondId(null);
      setDecisionNotes("");
      setAiDraftIndicator(false);
      return;
    }
    try {
      const result = await decisionMutation.mutateAsync({
        id: selectedBondId,
        data: {
          decision: decision as "approved" | "declined" | "referred" | "requires_referral" | "pending_information",
          notes: decisionNotes || undefined,
        },
      });
      toast({
        title: decision === "approved" ? "Bond Approved" : decision === "declined" ? "Bond Declined" : "Decision Updated",
        description: `Bond decision updated successfully.`,
      });

      const resultData = result as any;
      if ((decision === "approved" || decision === "declined") && resultData?.agentInfo) {
        setEmailDialogData({
          bondId: selectedBondId,
          agentEmail: resultData.agentInfo.email,
          agentName: resultData.agentInfo.name,
          decision: resultData.status === "referral_approved" ? "referral_approved" : decision,
        });
        setNotifyEmail(resultData.agentInfo.email);
        setUseOneTimeEmail(false);
        setEmailDialogOpen(true);
      } else if (decision === "approved" || decision === "declined") {
        setLocation("/underwriter/dashboard");
      }

      setPendingDecision(null);
      setPendingDecisionBondId(null);
      setAiDraftIndicator(false);
      if (decision !== "approved" && decision !== "declined") {
        setSelectedBondId(null);
        setDecisionNotes("");
        refetch();
      }
    } catch (error) {
      toast({
        title: "Decision Failed",
        description: error instanceof Error ? error.message : "Could not update decision",
        variant: "destructive",
      });
    }
  };

  const handleSendNotification = async () => {
    if (!emailDialogData || !notifyEmail) return;
    setSendingNotification(true);
    try {
      const res = await fetch(`/api/bonds/${emailDialogData.bondId}/notify-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notificationType: "decision",
          email: useOneTimeEmail ? notifyEmail : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Notification Sent", description: `Email sent to ${data.sentTo}` });
        setEmailDialogOpen(false);
        setEmailDialogData(null);
        setLocation("/underwriter/dashboard");
      } else {
        toast({ title: "Send Failed", description: data.error || "Could not send notification. You can retry or update the email.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Send Failed", description: "Network error. You can retry.", variant: "destructive" });
    } finally {
      setSendingNotification(false);
    }
  };

  const handleSkipNotification = () => {
    setEmailDialogOpen(false);
    setEmailDialogData(null);
    setLocation("/underwriter/dashboard");
  };

  const riskLevelConfig = {
    low: { icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200", label: "Low Risk" },
    medium: { icon: Shield, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-200", label: "Medium Risk" },
    high: { icon: ShieldAlert, color: "text-amber-500", bg: "bg-amber-50", border: "border-amber-200", label: "High Risk" },
    very_high: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50", border: "border-red-200", label: "Very High Risk" },
  };

  const statusCounts = {
    requires_referral: bonds.filter((b) => b.status === "requires_referral").length,
    referred: bonds.filter((b) => b.status === "referred").length,
    pending_information: bonds.filter((b) => b.status === "pending_information" || b.status === "indemnity_in_review").length,
  };

  const filterCards: { key: StatusFilter; label: string; count: number; borderColor: string; bgColor: string; textColor: string }[] = [
    { key: "requires_referral", label: "Requires Referral", count: statusCounts.requires_referral, borderColor: "border-amber-500/30", bgColor: "bg-amber-500/5", textColor: "text-amber-600" },
    { key: "referred", label: "Referred", count: statusCounts.referred, borderColor: "border-orange-500/30", bgColor: "bg-orange-500/5", textColor: "text-orange-600" },
    { key: "pending_information", label: "Pending Info", count: statusCounts.pending_information, borderColor: "border-yellow-500/30", bgColor: "bg-yellow-500/5", textColor: "text-yellow-600" },
  ];

  const activeFilterLabel = statusFilter === "all"
    ? "All Pending Review"
    : filterCards.find(c => c.key === statusFilter)?.label || "Pending Review";

  const reviewTotalPages = Math.max(1, Math.ceil(filteredBonds.length / REVIEW_PAGE_SIZE));
  const clampedReviewPage = Math.min(reviewPage, reviewTotalPages);
  const pagedReviewBonds = filteredBonds.slice((clampedReviewPage - 1) * REVIEW_PAGE_SIZE, clampedReviewPage * REVIEW_PAGE_SIZE);

  useEffect(() => { setReviewPage(1); }, [statusFilter, searchQuery, smartSortActive]);
  useEffect(() => {
    if (reviewPage > reviewTotalPages) setReviewPage(reviewTotalPages);
  }, [reviewPage, reviewTotalPages]);

  return (
    <div className={`space-y-4 ${isMobile ? 'space-y-3' : 'space-y-6'}`}>
      {!isMobile && (
        <div className="sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <h1 className="text-2xl font-bold">Underwriting Review Queue</h1>
          <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
            Review referred and submitted applications. Approve, decline, or request additional information.
          </p>
        </div>
      )}

      <div className={isMobile ? 'sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2 space-y-3' : 'contents'}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {filterCards.map((card) => (
          <Card
            key={card.key}
            className={`${card.borderColor} ${card.bgColor} cursor-pointer transition-all hover:shadow-md ${
              statusFilter === card.key ? "ring-2 ring-[var(--accent)] shadow-sm" : ""
            }`}
            onClick={() => setStatusFilter(statusFilter === card.key ? "all" : card.key)}
          >
            <CardContent className="p-2 sm:p-3 text-center">
              <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold ${card.textColor}`}>{card.count}</div>
              <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-muted-foreground`}>{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isMobile ? "Search bonds..." : "Search by bond number, type, obligee, or principal..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={smartSortActive ? "default" : "outline"}
          size="sm"
          className={`gap-1.5 shrink-0 ${smartSortActive ? "bg-violet-600 hover:bg-violet-700" : ""}`}
          onClick={handleSmartSort}
          disabled={triageLoading}
        >
          {triageLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isMobile ? "Sort" : "Smart Sort"}
        </Button>
      </div>
      </div>

      {smartSortActive && triageData?.summary && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-sm">
          <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
          <span className="text-violet-700">{triageData.summary}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 items-start">
        <div className="space-y-3" style={{ maxHeight: "calc(100dvh - 260px)", overflowY: "auto" }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background z-10 py-1">
            {activeFilterLabel} ({filteredBonds.length})
          </h2>
          {filteredBonds.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter !== "all" ? `No bonds with "${activeFilterLabel}" status` : "All caught up — no bonds pending review"}
                </p>
              </CardContent>
            </Card>
          ) : (
            pagedReviewBonds.map((bond) => {
              const rlConfig = riskLevelConfig[(bond.riskLevel as keyof typeof riskLevelConfig)] || riskLevelConfig.medium;
              const RiskIcon = rlConfig.icon;
              return (
                <Card
                  key={bond.id}
                  className={`border-border/50 cursor-pointer transition-all hover:border-[var(--accent)]/50 ${
                    selectedBondId === bond.id ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/20 shadow-sm" : ""
                  }`}
                  onClick={() => setSelectedBondId(bond.id)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs sm:text-sm font-semibold">{bond.bondNumber}</span>
                          <StatusBadge status={bond.status} />
                        </div>
                        <p className="text-sm font-medium">
                          {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                        </p>
                        <p className="text-sm truncate text-muted-foreground">{bond.obligeeName}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground capitalize">{bond.bondType.replace(/_/g, " ")}</span>
                          <span className="text-sm font-semibold">{formatCurrency(bond.bondAmount)}</span>
                        </div>
                        {bond.notes && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-purple-600">
                            <MessageSquareText className="h-3 w-3" />
                            <span className="truncate">Has agent notes</span>
                          </div>
                        )}
                        {triageMap?.get(bond.id) && (() => {
                          const item = triageMap.get(bond.id)!;
                          const cfg = urgencyConfig[item.urgency];
                          return (
                            <div className={`flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                              <BarChart3 className="h-3 w-3" />
                              <span className="font-medium capitalize">{item.urgency}</span>
                              <span className="text-[10px] opacity-70">— {item.rationale}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {bond.riskLevel && (
                          <div className={`flex items-center gap-1 ${rlConfig.color}`}>
                            <RiskIcon className="h-4 w-4" />
                            <span className="text-xs font-medium">{bond.riskScore ?? "—"}</span>
                          </div>
                        )}
                        {triageMap?.get(bond.id) && (
                          <span className="text-[10px] font-bold text-violet-500">#{triageMap.get(bond.id)!.priority}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {filteredBonds.length > REVIEW_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 pb-1">
              <span className="text-[12px] text-muted-foreground">
                {(clampedReviewPage - 1) * REVIEW_PAGE_SIZE + 1}–{Math.min(clampedReviewPage * REVIEW_PAGE_SIZE, filteredBonds.length)} of {filteredBonds.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={clampedReviewPage === 1}
                  onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-medium text-[var(--text-muted)] mx-2">{clampedReviewPage} / {reviewTotalPages}</span>
                <button
                  disabled={clampedReviewPage === reviewTotalPages}
                  onClick={() => setReviewPage(p => Math.min(reviewTotalPages, p + 1))}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          {selectedBond ? (
            <Card className="border-border/50 sticky top-4">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Bond Review</h3>
                  <Link to={`/underwriter/bonds/${selectedBond.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                      Full Detail <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Bond Number</span>
                      <p className="font-mono font-semibold">{selectedBond.bondNumber}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Status</span>
                      <div className="mt-0.5"><StatusBadge status={selectedBond.status} /></div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Principal</span>
                      <p className="font-medium">
                        {selectedBond.principal?.companyName || `${selectedBond.principal?.firstName} ${selectedBond.principal?.lastName}`}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Bond Amount</span>
                      <p className="font-semibold">{formatCurrency(selectedBond.bondAmount)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Type</span>
                      <p className="capitalize">{selectedBond.bondType.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Premium</span>
                      <p>{selectedBond.premium ? formatCurrency(selectedBond.premium) : "—"}</p>
                    </div>
                  </div>

                  {selectedBond.principalId && (
                    <Link to={`/underwriter/principals/${selectedBond.principalId}`}>
                      <div className="flex items-center gap-2 p-2 rounded-[var(--r)] bg-[var(--accent-50)] border border-[var(--accent)]/20 cursor-pointer hover:bg-[var(--accent-light)] transition-colors mt-2">
                        <User className="h-4 w-4 text-[var(--accent)]" />
                        <span className="text-xs font-semibold text-[var(--accent)]">View Principal — Credit & Risk Reports</span>
                      </div>
                    </Link>
                  )}

                  {(getUwFlags(selectedBond).length > 0 || selectedBond.notes) && (
                    <div className="p-3 rounded-lg border border-purple-200 bg-purple-50">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Underwriter Points</span>
                      </div>

                      {getUwFlags(selectedBond).length > 0 && (
                        <div className="mb-2">
                          <ul className="space-y-1">
                            {getUwFlags(selectedBond).map((flag, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-purple-900">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                                {flag}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedBond.notes && (
                        <div className={`${getUwFlags(selectedBond).length > 0 ? "pt-2 border-t border-purple-200" : ""}`}>
                          <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <MessageSquareText className="h-3 w-3" /> Comments
                          </p>
                          <p className="text-sm text-purple-900 leading-relaxed whitespace-pre-wrap">{selectedBond.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedBond.riskLevel && (
                    <div className={`p-3 rounded-lg border ${
                      (riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig] || riskLevelConfig.medium).bg
                    } ${
                      (riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig] || riskLevelConfig.medium).border
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {(() => {
                          const cfg = riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig] || riskLevelConfig.medium;
                          const Icon = cfg.icon;
                          return <Icon className={`h-4 w-4 ${cfg.color}`} />;
                        })()}
                        <span className="text-sm font-semibold">
                          {(riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig] || riskLevelConfig.medium).label}
                        </span>
                        {selectedBond.riskScore !== undefined && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            Score: {selectedBond.riskScore}/100
                          </span>
                        )}
                      </div>
                      {selectedBond.triageDecision && (
                        <p className="text-xs text-muted-foreground capitalize">
                          Triage: {selectedBond.triageDecision.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <AIRecommendationPanel
                  bondId={selectedBond.id}
                  onApplyDecision={pendingDecision ? undefined : (decision) => {
                    handleDecisionClick(decision);
                  }}
                />

                {(comparablesLoading || (comparablesData && comparablesData.comparables.length > 0)) && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4 text-blue-500" /> Similar Past Bonds
                    </h4>
                    {comparablesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Finding comparable bonds...
                      </div>
                    ) : (
                      <>
                        {comparablesData?.insight && (
                          <p className="text-xs text-muted-foreground italic">{comparablesData.insight}</p>
                        )}
                        <div className="space-y-2">
                          {comparablesData?.comparables.map((comp) => (
                            <div key={comp.id} className="p-2.5 rounded-lg border border-border/50 bg-muted/30 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-semibold">{comp.bondNumber}</span>
                                <div className="flex items-center gap-1.5">
                                  <StatusBadge status={comp.status} />
                                  <span className="text-[10px] text-blue-600 font-medium">{comp.similarity}% match</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{comp.principalName}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="font-medium">{formatCurrency(comp.bondAmount)}</span>
                                {comp.riskLevel && (
                                  <>
                                    <span className="text-muted-foreground">·</span>
                                    <span className={`font-medium capitalize ${
                                      comp.riskLevel === "low" ? "text-emerald-600" :
                                      comp.riskLevel === "high" ? "text-red-600" : "text-blue-600"
                                    }`}>{comp.riskLevel} risk</span>
                                  </>
                                )}
                                {comp.premium && (
                                  <>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="text-emerald-600">Premium: {formatCurrency(comp.premium)}</span>
                                  </>
                                )}
                              </div>
                              {comp.relevantFactors.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {comp.relevantFactors.map((f, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px]">{f}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold">Underwriting Decision</h4>
                  <div className="space-y-2">
                    {!pendingDecision ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleDecisionClick("approved")}
                          disabled={summaryLoading || decisionMutation.isPending}
                        >
                          {summaryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-yellow-600 border-yellow-600/50 hover:bg-yellow-600/10"
                          onClick={() => handleDecisionClick("pending_information")}
                          disabled={summaryLoading || decisionMutation.isPending}
                        >
                          {summaryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Request Info
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() => handleDecisionClick("declined")}
                          disabled={summaryLoading || decisionMutation.isPending}
                        >
                          {summaryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Decline
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border border-violet-200 bg-violet-50/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {pendingDecision === "approved" ? "Approve" : pendingDecision === "declined" ? "Decline" : "Request Info"} — Review AI-drafted notes
                          </span>
                          <button
                            onClick={() => { setPendingDecision(null); setDecisionNotes(""); setAiDraftIndicator(false); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="relative">
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="Decision notes..."
                            value={decisionNotes}
                            onChange={(e) => {
                              setDecisionNotes(e.target.value);
                              setAiDraftIndicator(false);
                            }}
                          />
                          {aiDraftIndicator && (
                            <span className="absolute top-1.5 right-2 text-[10px] text-violet-500 font-medium flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5" /> AI Draft
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className={`gap-1.5 flex-1 ${
                              pendingDecision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" :
                              pendingDecision === "declined" ? "bg-red-600 hover:bg-red-700" :
                              "bg-yellow-600 hover:bg-yellow-700"
                            }`}
                            onClick={() => submitDecision(pendingDecision)}
                            disabled={decisionMutation.isPending}
                          >
                            {decisionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Confirm {pendingDecision === "approved" ? "Approve" : pendingDecision === "declined" ? "Decline" : "Request Info"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <Shield className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a bond to review</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={emailDialogOpen} onOpenChange={(open) => { if (!open) handleSkipNotification(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-500" />
              Notify Agent
            </DialogTitle>
            <DialogDescription>
              Send an email notification to the agent about this {emailDialogData?.decision === "referral_approved" ? "approval" : "decline"} decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <span className="font-medium">{emailDialogData?.agentName}</span>
                <span className="text-muted-foreground ml-1">({emailDialogData?.agentEmail})</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="oneTimeEmail"
                checked={useOneTimeEmail}
                onChange={(e) => {
                  setUseOneTimeEmail(e.target.checked);
                  if (!e.target.checked && emailDialogData) {
                    setNotifyEmail(emailDialogData.agentEmail);
                  }
                }}
                className="rounded border-border"
              />
              <Label htmlFor="oneTimeEmail" className="text-sm font-normal cursor-pointer">
                Send to a different email (one-time)
              </Label>
            </div>

            {useOneTimeEmail && (
              <div className="space-y-1.5">
                <Label htmlFor="notifyEmailInput" className="text-xs text-muted-foreground">One-time notification email</Label>
                <Input
                  id="notifyEmailInput"
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="alternate@email.com"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleSendNotification}
                disabled={sendingNotification || !notifyEmail}
              >
                {sendingNotification ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Notification
              </Button>
              <Button variant="outline" onClick={handleSkipNotification} disabled={sendingNotification}>
                Skip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
