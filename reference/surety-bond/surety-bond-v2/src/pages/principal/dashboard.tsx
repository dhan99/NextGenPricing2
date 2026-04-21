import { useState, useCallback, useEffect, useMemo } from "react";
import { useListBonds, useListRenewableBonds, useRenewBond } from "@workspace/api-client-react";
import type { BondApplication } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, ShieldCheck, FileText, Clock, RefreshCw, Sparkles, Info, RotateCcw, CalendarClock, Loader2, TrendingUp, CreditCard, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useStatusExplainer, type StatusExplainerResult } from "@/hooks/use-ai-underwriting";
import { useToast } from "@/hooks/use-toast";

type MetricFilter = "active" | "pending_payment" | "all" | "premium" | "under_review" | "renewals";
const PAGE_SIZE = 10;

const explainerCache = new Map<string, StatusExplainerResult>();

function StatusExplainerInline({ status, bondType, bondAmount }: { status: string; bondType: string; bondAmount: number }) {
  const cacheKey = `${status}:${bondType}:${bondAmount}`;
  const [explainer, setExplainer] = useState<StatusExplainerResult | null>(explainerCache.get(cacheKey) ?? null);
  const [showDetails, setShowDetails] = useState(false);
  const { explain } = useStatusExplainer();

  useEffect(() => {
    const cached = explainerCache.get(cacheKey);
    if (cached) { setExplainer(cached); return; }
    explain(status, bondType, bondAmount).then((r) => {
      if (r) { explainerCache.set(cacheKey, r); setExplainer(r); }
    });
  }, [cacheKey]);

  if (!explainer) return null;

  return (
    <div className="relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 text-[10.5px] text-[var(--accent)] mt-1 min-w-0 max-w-full">
        <Sparkles className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate min-w-0">{explainer.explanation}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
          className="text-[10px] text-[var(--accent)] hover:text-[var(--accent-dark)] font-semibold shrink-0 ml-0.5 bg-transparent border-none cursor-pointer"
        >
          {showDetails ? "Less" : "More"}
        </button>
      </div>
      {showDetails && (
        <div className="absolute z-50 bottom-full mb-2 left-0 w-[calc(100vw-80px)] max-w-64 p-3 glass-card text-left animate-scaleIn">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--accent)] flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" /> Status Explained</span>
            <button onClick={(e) => { e.stopPropagation(); setShowDetails(false); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--slate-900)] bg-transparent border-none cursor-pointer">✕</button>
          </div>
          <div className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <p>{explainer.explanation}</p>
            <p className="font-medium text-[var(--slate-900)]">{explainer.nextSteps}</p>
            {explainer.estimatedTimeline && (
              <p className="text-[var(--accent)] text-[10px]"><CalendarClock className="h-2.5 w-2.5 inline mr-0.5" />{explainer.estimatedTimeline}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-card p-3 sm:p-5 space-y-2 sm:space-y-3">
      <div className="skeleton h-3 w-16 sm:w-24 rounded" />
      <div className="skeleton h-6 sm:h-8 w-12 sm:w-16 rounded" />
      <div className="skeleton h-2 w-14 sm:w-20 rounded" />
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function PrincipalDashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Principal";
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: bonds, isLoading, refetch } = useListBonds({}, { query: { queryKey: ["listBonds", "principal-dashboard"], refetchOnMount: "always", refetchOnWindowFocus: "always", staleTime: 0 } });
  const { data: renewalBonds } = useListRenewableBonds(
    { daysUntilExpiry: 90 },
    { query: { queryKey: ["renewableBonds", "90"] } }
  );
  const renewBond = useRenewBond();
  const [refreshing, setRefreshing] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(isMobile);
  const [briefShowAll, setBriefShowAll] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleStartRenewal = async (bondId: number) => {
    setRenewingId(bondId);
    try {
      const result = await renewBond.mutateAsync({ id: bondId });
      const renewedBond = result as BondApplication;
      toast({ title: "Renewal Created", description: "A renewal draft has been created. Redirecting..." });
      setLocation(`/principal/bonds/${renewedBond.id}`);
    } catch {
      toast({ title: "Renewal Failed", description: "Could not create renewal. Please try again.", variant: "destructive" });
    } finally {
      setRenewingId(null);
    }
  };

  const [selectedFilter, setSelectedFilter] = useState<MetricFilter>("active");

  const handleFilterChange = (filter: MetricFilter) => {
    setSelectedFilter(filter);
    setPage(1);
  };

  const allBonds = bonds || [];
  const UNDER_REVIEW_STATUSES = ["submitted", "under_review", "requires_referral", "referred", "indemnity_in_review", "pending_information"];
  const activeBonds = allBonds.filter(b => b.status !== "draft");
  const pendingPaymentBonds = allBonds.filter(b => b.status === "pending_payment" || b.status === "payment_requested");
  const underReviewBonds = allBonds.filter(b => UNDER_REVIEW_STATUSES.includes(b.status));
  const totalPremium = allBonds.reduce((sum, b) => {
    const p = parseFloat(b.premium || "0");
    return sum + (isNaN(p) ? 0 : p);
  }, 0);

  const renewableBondsList = renewalBonds || [];
  const morningBriefItems = useMemo(() => {
    const items: { icon: React.ElementType; color: string; bg: string; text: string; action: MetricFilter | null }[] = [];
    if (pendingPaymentBonds.length > 0) {
      items.push({
        icon: CreditCard,
        color: "var(--s-amber)",
        bg: "var(--s-amber-bg)",
        text: `${pendingPaymentBonds.length} bond${pendingPaymentBonds.length > 1 ? "s" : ""} awaiting your payment`,
        action: "pending_payment",
      });
    }
    if (renewableBondsList.length > 0) {
      items.push({
        icon: RotateCcw,
        color: "var(--s-purple)",
        bg: "var(--s-purple-bg)",
        text: `${renewableBondsList.length} bond${renewableBondsList.length > 1 ? "s" : ""} eligible for renewal`,
        action: "renewals",
      });
    }
    const issuedBonds = allBonds.filter(b => b.status === "issued");
    if (issuedBonds.length > 0) {
      items.push({
        icon: ShieldCheck,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: `${issuedBonds.length} bond${issuedBonds.length > 1 ? "s" : ""} currently issued & active`,
        action: "active",
      });
    }
    const pendingBonds = allBonds.filter(b => ["submitted", "under_review", "requires_referral", "referred", "indemnity_in_review", "pending_information"].includes(b.status));
    if (pendingBonds.length > 0) {
      items.push({
        icon: Clock,
        color: "var(--s-blue)",
        bg: "var(--s-blue-bg)",
        text: `${pendingBonds.length} application${pendingBonds.length > 1 ? "s" : ""} under review`,
        action: "under_review",
      });
    }
    if (items.length === 0) {
      items.push({
        icon: ShieldCheck,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: "All caught up! Your bond portfolio looks great.",
        action: null,
      });
    }
    return items;
  }, [allBonds, pendingPaymentBonds, renewableBondsList]);

  const metrics: { key: MetricFilter; label: string; value: number | string; sub: string; valueColor?: string; icon: React.ElementType; gradient: string }[] = [
    { key: "active", label: "Active Bonds", value: activeBonds.length, sub: "Currently active", valueColor: "var(--s-green)", icon: ShieldCheck, gradient: "from-emerald-500 to-teal-600" },
    { key: "pending_payment", label: "Pending Payment", value: pendingPaymentBonds.length, sub: pendingPaymentBonds.length > 0 ? "Action needed" : "All clear", valueColor: "var(--s-amber)", icon: CreditCard, gradient: "from-amber-500 to-orange-600" },
    { key: "all", label: "Total Bonds", value: allBonds.length, sub: "All applications", valueColor: "var(--s-blue)", icon: TrendingUp, gradient: "from-blue-500 to-indigo-600" },
    { key: "premium", label: "Total Premium", value: formatCurrency(totalPremium), sub: "Annual", icon: FileText, gradient: "from-violet-500 to-purple-600" },
  ];

  const displayedBonds = (() => {
    switch (selectedFilter) {
      case "active": return activeBonds;
      case "pending_payment": return pendingPaymentBonds;
      case "under_review": return underReviewBonds;
      case "renewals": return renewableBondsList;
      case "all": return allBonds;
      case "premium": return activeBonds;
      default: return activeBonds;
    }
  })();

  const totalItems = displayedBonds.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const pagedBonds = displayedBonds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sectionTitle = (() => {
    switch (selectedFilter) {
      case "active": return "My Active Bonds";
      case "pending_payment": return "Pending Payment";
      case "under_review": return "Applications Under Review";
      case "renewals": return "Bonds Eligible for Renewal";
      case "all": return "All Bonds";
      case "premium": return "My Active Bonds";
      default: return "My Active Bonds";
    }
  })();

  return (
    <div className="min-w-0">
      {!isMobile && (
        <div className="flex items-start justify-between mb-6 gap-2 flex-wrap sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">{getGreeting()}, {firstName}</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">Your bond portfolio overview</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-[var(--r)] border border-[var(--border-color)] bg-[var(--card)] hover:bg-[var(--slate-100)] transition-all disabled:opacity-50 cursor-pointer shrink-0"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 text-[var(--text-muted)] ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {!isLoading && morningBriefItems.length > 0 && (
        <div className="glass-card p-4 mb-4 animate-slideInLeft overflow-hidden">
          <button
            onClick={() => setBriefCollapsed(!briefCollapsed)}
            className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer p-0 font-[inherit]"
          >
            <div className="w-6 h-6 rounded-lg gradient-accent flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider">AI Morning Brief</span>
            <span className="text-[11px] font-semibold text-[var(--accent)] ml-1">{morningBriefItems.length}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-muted)] ml-auto transition-transform ${briefCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!briefCollapsed && (
            <div className="space-y-1 mt-3">
              {(isMobile && !briefShowAll ? morningBriefItems.slice(0, 3) : morningBriefItems).map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (item.action) handleFilterChange(item.action); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && item.action) handleFilterChange(item.action); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--slate-100)] transition-all no-underline group ${item.action ? "cursor-pointer" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                    </div>
                    <span className="text-[13px] text-[var(--slate-900)] group-hover:text-[var(--accent)] transition-colors">{item.text}</span>
                    {item.action && <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                  </div>
                );
              })}
              {isMobile && morningBriefItems.length > 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBriefShowAll(!briefShowAll); }}
                  className="w-full text-center text-[11px] font-semibold text-[var(--accent)] py-2 mt-1 rounded-lg hover:bg-[var(--slate-100)] transition-colors min-h-[36px]"
                >
                  {briefShowAll ? "Show less" : `Show ${morningBriefItems.length - 3} more`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isMobile && (
        <div className="mb-4">
          <Link
            href="/principal/new-bond"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[var(--r-lg)] gradient-accent text-white text-sm font-semibold hover:opacity-90 transition-all no-underline"
          >
            <Plus className="h-4 w-4" />
            Apply for a Bond
          </Link>
        </div>
      )}

      {isMobile ? (
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[42px] rounded-lg" />)
          ) : (
            metrics.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => handleFilterChange(m.key)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border transition-all cursor-pointer bg-[var(--card)] font-[inherit] min-w-0 overflow-hidden ${
                    selectedFilter === m.key
                      ? "border-[var(--accent)] bg-[var(--accent-50)] shadow-sm"
                      : "border-[var(--border-color)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <div className={`w-5 h-5 rounded bg-gradient-to-br ${m.gradient} flex items-center justify-center shrink-0`}>
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[13px] font-bold leading-tight" style={m.valueColor ? { color: m.valueColor } : { color: "var(--slate-900)" }}>{m.value}</span>
                    <span className="text-[8px] font-semibold text-[var(--text-muted)] uppercase leading-tight truncate max-w-full">{m.label}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.key}
                  onClick={() => handleFilterChange(m.key)}
                  className={`glass-card p-3 cursor-pointer transition-all relative overflow-hidden ${
                    selectedFilter === m.key
                      ? "border-[var(--accent)] !bg-[var(--accent-50)]"
                      : ""
                  }`}
                >
                  {selectedFilter === m.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] gradient-accent" />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${m.gradient} flex items-center justify-center opacity-80 shrink-0`}>
                      <Icon className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider truncate">{m.label}</div>
                      <div className="text-[18px] font-black text-[var(--slate-900)] leading-tight" style={m.valueColor ? { color: m.valueColor } : {}}>
                        {m.value}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="text-sm font-bold text-[var(--slate-900)] mb-2">{sectionTitle}</div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card p-5 flex items-center gap-4">
              <div className="skeleton w-11 h-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : pagedBonds.length === 0 ? (
        <div className="glass-card p-14 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
          <h3 className="text-base font-bold text-[var(--slate-900)] mb-1.5">No bonds yet</h3>
          <p className="text-[13.5px] text-[var(--text-muted)] max-w-[320px] mx-auto mb-5 leading-relaxed">Start your first application using the button above.</p>
          <Link
            href="/principal/new-bond"
            className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-[var(--r)] text-[13px] font-semibold text-white no-underline gradient-accent hover:opacity-90 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Apply for a Bond
          </Link>
        </div>
      ) : (
        <div className={`${isMobile ? "space-y-2" : "space-y-3"} min-w-0`} style={{ maxHeight: "calc(100dvh - 340px)", overflowY: "auto" }}>
          {pagedBonds.map(bond => (
            <div
              key={bond.id}
              className={`glass-card hover:shadow-lg cursor-pointer ${
                isMobile ? 'p-3.5 overflow-hidden' : 'p-5 flex items-center gap-4'
              }`}
              onClick={() => setLocation(`/principal/bonds/${bond.id}`)}
            >
              {isMobile ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-[13px] text-[var(--slate-900)] truncate min-w-0">{bond.obligeeName}</div>
                    <StatusBadge status={bond.status} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[12px] font-medium text-[var(--slate-600)]">{formatCurrency(bond.bondAmount)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">{formatDate(bond.createdAt)}</span>
                  </div>
                  <StatusExplainerInline status={bond.status} bondType={bond.bondType} bondAmount={Number(bond.bondAmount)} />
                </>
              ) : (
                <>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--accent-50)]">
                    <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[var(--slate-900)]">{bond.obligeeName}</div>
                    <div className="text-[12.5px] text-[var(--text-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
                      {bond.bondNumber || `Bond #${bond.id}`} · Applied: {formatDate(bond.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[var(--slate-900)]">{formatCurrency(bond.bondAmount)}</div>
                    <div className="mt-1 flex items-center gap-1.5 justify-end">
                      <StatusBadge status={bond.status} />
                      <StatusExplainerInline status={bond.status} bondType={bond.bondType} bondAmount={Number(bond.bondAmount)} />
                    </div>
                  </div>
                  <Link href={`/principal/bonds/${bond.id}`} className="shrink-0 no-underline">
                    <button className="px-3 py-1.5 text-xs font-semibold border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--accent)] hover:bg-[var(--slate-100)] cursor-pointer transition-all">
                      Details →
                    </button>
                  </Link>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {totalItems > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12.5px] text-[var(--text-muted)]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-medium text-[var(--text-muted)] mx-2">{page} / {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {renewalBonds && renewalBonds.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw className="h-4 w-4 text-[var(--s-amber)]" />
            <span className="text-sm font-bold text-[var(--slate-900)]">Upcoming Renewals</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--s-amber-bg)] text-[var(--s-amber)] text-[10px] font-semibold">{renewalBonds.length}</span>
          </div>
          <div className="space-y-2">
            {renewalBonds.map((bond) => {
              const now = new Date();
              const daysLeft = bond.expirationDate
                ? Math.ceil((new Date(bond.expirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              const isRenewing = renewingId === bond.id;
              return (
                <div
                  key={`renewal-${bond.id}`}
                  className={`glass-card border-[var(--s-amber)]/20 ${isMobile ? "p-3.5" : "p-4 flex items-center gap-4"}`}
                >
                  {isMobile ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[13px] text-[var(--slate-900)] truncate min-w-0">{bond.obligeeName}</div>
                        <span className={`text-[11px] font-bold shrink-0 ${daysLeft <= 14 ? "text-[var(--s-red)]" : daysLeft <= 30 ? "text-[var(--s-amber)]" : "text-[var(--text-muted)]"}`}>
                          {daysLeft}d left
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-muted)]">
                        <span>{bond.bondNumber}</span>
                        <span>·</span>
                        <span>{formatCurrency(bond.bondAmount)}</span>
                        <span>·</span>
                        <span>Exp {bond.expirationDate ? formatDate(bond.expirationDate) : "N/A"}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartRenewal(bond.id); }}
                        disabled={isRenewing}
                        className="mt-2 w-full px-3 py-1.5 text-[11px] font-semibold rounded-[var(--r)] bg-[var(--s-amber)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1 border-none transition-all min-h-[36px]"
                      >
                        {isRenewing && <Loader2 className="h-3 w-3 animate-spin" />}
                        {isRenewing ? "Creating..." : "Start Renewal"}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-[var(--s-amber-bg)] flex items-center justify-center shrink-0">
                        <CalendarClock className="h-5 w-5 text-[var(--s-amber)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--slate-900)]">{bond.obligeeName}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {bond.bondNumber} · {formatCurrency(bond.bondAmount)} · Expires {bond.expirationDate ? formatDate(bond.expirationDate) : "N/A"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-bold ${daysLeft <= 14 ? "text-[var(--s-red)]" : daysLeft <= 30 ? "text-[var(--s-amber)]" : "text-[var(--text-muted)]"}`}>
                          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStartRenewal(bond.id); }}
                          disabled={isRenewing}
                          className="mt-1 px-3 py-1 text-[11px] font-semibold rounded-[var(--r)] bg-[var(--s-amber)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 border-none transition-all"
                        >
                          {isRenewing && <Loader2 className="h-3 w-3 animate-spin" />}
                          {isRenewing ? "Creating..." : "Start Renewal"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
