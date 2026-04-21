import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useListBonds, useUpdateUnderwritingDecision } from "@workspace/api-client-react";
import { Shield, ShieldAlert, ShieldCheck, Search, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

const REVIEW_STATUSES = ["requires_referral", "referred", "indemnity_in_review", "pending_information"];

const UW_PAGE_SIZE_MOBILE = 10;
const UW_PAGE_SIZE_DESKTOP = 20;

export function UnderwritingReview() {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  const [selectedBondId, setSelectedBondId] = useState<number | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [uwPage, setUwPage] = useState(1);
  const [showStatusCards, setShowStatusCards] = useState(!isMobile);

  const { data: bondsResponse, refetch } = useListBonds(
    { query: { queryKey: ["/api/bonds", "underwriting-review"] as const, staleTime: 0, refetchOnMount: "always" } }
  );

  const decisionMutation = useUpdateUnderwritingDecision();

  const bonds = bondsResponse?.filter(
    (b) => REVIEW_STATUSES.includes(b.status)
  ) || [];

  const filteredBonds = bonds.filter((b) => {
    if (activeStatusFilter && b.status !== activeStatusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.bondNumber.toLowerCase().includes(q) ||
      b.bondType.toLowerCase().includes(q) ||
      b.obligeeName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
    );
  });

  const uwPageSize = isMobile ? UW_PAGE_SIZE_MOBILE : UW_PAGE_SIZE_DESKTOP;
  const uwTotalPages = Math.max(1, Math.ceil(filteredBonds.length / uwPageSize));
  const safePage = Math.min(uwPage, uwTotalPages);
  const paginatedBonds = filteredBonds.slice((safePage - 1) * uwPageSize, safePage * uwPageSize);
  const uwStartItem = (safePage - 1) * uwPageSize + 1;
  const uwEndItem = Math.min(safePage * uwPageSize, filteredBonds.length);

  const selectedBond = bonds.find((b) => b.id === selectedBondId);

  const handleDecision = async (decision: string) => {
    if (!selectedBondId) return;
    try {
      await decisionMutation.mutateAsync({
        id: selectedBondId,
        data: {
          decision: decision as "approved" | "declined" | "referred" | "requires_referral" | "pending_information",
          reason: decision === "declined" ? declineReason : undefined,
          notes: decisionNotes || undefined,
        },
      });
      setSelectedBondId(null);
      setDecisionNotes("");
      setDeclineReason("");
      refetch();
    } catch (error) {
      console.error("Failed to update decision:", error);
    }
  };

  const riskLevelConfig = {
    low: { icon: ShieldCheck, color: "text-emerald-500", label: "Low Risk" },
    medium: { icon: Shield, color: "text-blue-500", label: "Medium Risk" },
    high: { icon: ShieldAlert, color: "text-amber-500", label: "High Risk" },
    very_high: { icon: AlertTriangle, color: "text-red-500", label: "Very High Risk" },
  };

  const statusCounts = {
    requires_referral: bonds.filter((b) => b.status === "requires_referral").length,
    referred: bonds.filter((b) => b.status === "referred").length,
    indemnity_in_review: bonds.filter((b) => b.status === "indemnity_in_review").length,
    pending_information: bonds.filter((b) => b.status === "pending_information").length,
  };

  return (
    <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
      {!isMobile && (
        <div className="sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <h1 className="text-2xl font-bold">Underwriting Review</h1>
          <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
            Review referred applications and make underwriting decisions.
          </p>
        </div>
      )}

      {isMobile ? (
        <div className="sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2">
          <button
            onClick={() => setShowStatusCards(!showStatusCards)}
            className="flex items-center gap-2 w-full text-left bg-transparent border-none cursor-pointer p-0 font-[inherit]"
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status Breakdown</span>
            <span className="text-[11px] font-semibold text-primary">{bonds.length}</span>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${showStatusCards ? 'rotate-90' : ''}`} />
          </button>
          {showStatusCards && (
            <div className="grid grid-cols-2 gap-2 mt-2 animate-fadeUp">
              {([
                { key: "requires_referral", label: "Requires Referral", textClass: "text-amber-500", activeClass: "border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/15", inactiveClass: "border-amber-500/30 bg-amber-500/5" },
                { key: "referred", label: "Referred", textClass: "text-orange-500", activeClass: "border-orange-500 ring-2 ring-orange-500/30 bg-orange-500/15", inactiveClass: "border-orange-500/30 bg-orange-500/5" },
                { key: "indemnity_in_review", label: "Indemnity Review", textClass: "text-rose-500", activeClass: "border-rose-500 ring-2 ring-rose-500/30 bg-rose-500/15", inactiveClass: "border-rose-500/30 bg-rose-500/5" },
                { key: "pending_information", label: "Pending Info", textClass: "text-yellow-500", activeClass: "border-yellow-500 ring-2 ring-yellow-500/30 bg-yellow-500/15", inactiveClass: "border-yellow-500/30 bg-yellow-500/5" },
              ] as const).map(({ key, label, textClass, activeClass, inactiveClass }) => {
                const isActive = activeStatusFilter === key;
                const count = statusCounts[key as keyof typeof statusCounts];
                return (
                  <Card key={key} className={`cursor-pointer transition-all ${isActive ? activeClass : inactiveClass}`} onClick={() => { setActiveStatusFilter(isActive ? null : key); setSelectedBondId(null); setUwPage(1); }}>
                    <CardContent className="p-2 text-center">
                      <div className={`text-lg font-bold ${textClass}`}>{count}</div>
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { key: "requires_referral", label: "Requires Referral", activeClass: "border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/15", inactiveClass: "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60", textClass: "text-amber-500" },
            { key: "referred", label: "Referred", activeClass: "border-orange-500 ring-2 ring-orange-500/30 bg-orange-500/15", inactiveClass: "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/60", textClass: "text-orange-500" },
            { key: "indemnity_in_review", label: "Indemnity Review", activeClass: "border-rose-500 ring-2 ring-rose-500/30 bg-rose-500/15", inactiveClass: "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60", textClass: "text-rose-500" },
            { key: "pending_information", label: "Pending Info", activeClass: "border-yellow-500 ring-2 ring-yellow-500/30 bg-yellow-500/15", inactiveClass: "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/60", textClass: "text-yellow-500" },
          ] as const).map(({ key, label, activeClass, inactiveClass, textClass }) => {
            const isActive = activeStatusFilter === key;
            const count = statusCounts[key as keyof typeof statusCounts];
            return (
              <Card key={key} className={`cursor-pointer transition-all hover:shadow-md ${isActive ? activeClass : inactiveClass}`} onClick={() => { setActiveStatusFilter(isActive ? null : key); setSelectedBondId(null); setUwPage(1); }}>
                <CardContent className="p-3 text-center">
                  <div className={`text-2xl font-bold ${textClass}`}>{count}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {activeStatusFilter && (
        <div className="flex items-center gap-2">
          <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
            Filtering: <span className="font-medium text-foreground capitalize">{activeStatusFilter.replace(/_/g, " ")}</span>
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setActiveStatusFilter(null); setSelectedBondId(null); setUwPage(1); }}>
            Clear
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={isMobile ? "Search bonds..." : "Search by bond number, type, or obligee..."}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setUwPage(1); }}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Pending Review ({filteredBonds.length})
          </h2>
          {filteredBonds.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No bonds pending review</p>
              </CardContent>
            </Card>
          ) : (
            paginatedBonds.map((bond) => {
              const rlConfig = riskLevelConfig[(bond.riskLevel as keyof typeof riskLevelConfig)] || riskLevelConfig.medium;
              const RiskIcon = rlConfig.icon;
              return (
                <Card
                  key={bond.id}
                  className={`border-border/50 cursor-pointer transition-colors hover:border-primary/50 ${
                    selectedBondId === bond.id ? "border-primary ring-1 ring-primary/20" : ""
                  }`}
                  onClick={() => setSelectedBondId(bond.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold">{bond.bondNumber}</span>
                          <StatusBadge status={bond.status} />
                        </div>
                        <p className="text-sm truncate">{bond.obligeeName}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground capitalize">{bond.bondType.replace(/_/g, " ")}</span>
                          <span className="text-sm font-semibold">{formatCurrency(bond.bondAmount)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {bond.riskLevel && (
                          <div className={`flex items-center gap-1 ${rlConfig.color}`}>
                            <RiskIcon className="h-4 w-4" />
                            <span className="text-xs font-medium">{bond.riskScore ?? "—"}</span>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
          {filteredBonds.length > uwPageSize && (
            <div className={`flex items-center justify-between pt-2 ${isMobile ? 'gap-2' : ''}`}>
              <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} text-muted-foreground`}>
                {isMobile
                  ? `${uwStartItem}–${uwEndItem} of ${filteredBonds.length}`
                  : `Showing ${uwStartItem}–${uwEndItem} of ${filteredBonds.length}`
                }
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className={isMobile ? 'h-8 w-8 p-0' : 'h-8'}
                  onClick={() => setUwPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {!isMobile && <span className="ml-1">Prev</span>}
                </Button>
                <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} text-muted-foreground px-1`}>
                  {safePage}/{uwTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className={isMobile ? 'h-8 w-8 p-0' : 'h-8'}
                  onClick={() => setUwPage(p => Math.min(uwTotalPages, p + 1))}
                  disabled={safePage === uwTotalPages}
                >
                  {!isMobile && <span className="mr-1">Next</span>}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div>
          {selectedBond ? (
            <Card className="border-border/50 sticky top-4">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Bond Details</h3>
                  <Link to={`/agent/bonds/${selectedBond.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                      View Full Detail <ChevronRight className="h-3 w-3" />
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
                      <span className="text-xs text-muted-foreground">Type</span>
                      <p className="capitalize">{selectedBond.bondType.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Bond Amount</span>
                      <p className="font-semibold">{formatCurrency(selectedBond.bondAmount)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Premium</span>
                      <p>{selectedBond.premium ? formatCurrency(selectedBond.premium) : "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Obligee</span>
                      <p className="truncate">{selectedBond.obligeeName}</p>
                    </div>
                  </div>

                  {selectedBond.riskLevel && (
                    <div className={`p-3 rounded-lg border ${
                      riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig]?.color === "text-emerald-500"
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : selectedBond.riskLevel === "high"
                          ? "bg-amber-500/10 border-amber-500/30"
                          : selectedBond.riskLevel === "very_high"
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-blue-500/10 border-blue-500/30"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {(() => {
                          const cfg = riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig];
                          if (!cfg) return null;
                          const Icon = cfg.icon;
                          return <Icon className={`h-4 w-4 ${cfg.color}`} />;
                        })()}
                        <span className="text-sm font-semibold">
                          {riskLevelConfig[selectedBond.riskLevel as keyof typeof riskLevelConfig]?.label || selectedBond.riskLevel}
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

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold">Underwriting Decision</h4>
                  <div className="space-y-2">
                    <textarea
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Decision notes..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                    />
                    {selectedBond.status !== "approved" && selectedBond.status !== "declined" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDecision("requires_referral")}
                          disabled={decisionMutation.isPending}
                        >
                          <Shield className="h-3.5 w-3.5" /> Refer to UW
                        </Button>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
                          <Clock className="h-3.5 w-3.5" /> Decisions handled by Underwriter
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
    </div>
  );
}
