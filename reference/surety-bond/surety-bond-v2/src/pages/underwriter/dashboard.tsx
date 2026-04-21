import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useListBonds } from "@workspace/api-client-react";
import { ShieldCheck, Clock, CheckCircle2, XCircle, ArrowUpRight, FileText, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Sparkles, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Plus, Timer } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { formatCurrency } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const REVIEW_STATUSES = ["requires_referral", "referred", "indemnity_in_review", "pending_information"];
const PAGE_SIZE = 10;

function getAgingInfo(createdAt: string) {
  const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
  if (hours < 24) {
    return { label: `${hours}h`, color: "var(--s-green)", bg: "var(--s-green-bg)", urgency: "fresh" };
  }
  const days = Math.floor(hours / 24);
  if (days <= 2) {
    return { label: `${days}d`, color: "var(--s-amber)", bg: "var(--s-amber-bg)", urgency: "aging" };
  }
  return { label: `${days}d`, color: "var(--color-destructive)", bg: "color-mix(in srgb, var(--color-destructive) 10%, transparent)", urgency: "stale" };
}

type SortKey = "client" | "agent" | "product" | "amount" | "status" | "created";
type SortDir = "asc" | "desc";

function getSortIcon(columnKey: SortKey, activeKey: SortKey | null, dir: SortDir) {
  if (activeKey !== columnKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function SkeletonCard() {
  return (
    <div className="glass-card p-3 sm:p-5 space-y-2 sm:space-y-3">
      <div className="skeleton h-6 sm:h-8 w-6 sm:w-8 rounded-lg" />
      <div className="skeleton h-5 sm:h-7 w-10 sm:w-12 rounded" />
      <div className="skeleton h-3 w-14 sm:w-20 rounded" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 border-b border-[var(--border-color)]">
      <div className="skeleton h-4 w-24 sm:w-32 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-14 sm:w-20 rounded flex-shrink-0 hidden sm:block" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0 hidden sm:block" />
    </div>
  );
}

export function UnderwriterDashboard() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { data: bonds, isLoading, refetch } = useListBonds(
    {}, { query: { queryKey: ["listBonds", "uw-dashboard"], refetchInterval: 5000, refetchOnWindowFocus: "always", staleTime: 0 } }
  );
  const [refreshing, setRefreshing] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(isMobile);
  const [briefShowAll, setBriefShowAll] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  const [selectedMetric, setSelectedMetric] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleMetricClick = (i: number) => {
    setSelectedMetric(i);
    setPage(1);
  };

  const allBonds = bonds || [];

  const pendingReview = allBonds.filter(b => REVIEW_STATUSES.includes(b.status));
  const approvedBonds = allBonds.filter(b => b.status === "approved" || b.status === "issued" || b.status === "payment_approved" || b.status === "pending_payment" || b.status === "pending_issue" || b.status === "referral_approved");
  const declinedBonds = allBonds.filter(b => b.status === "declined");
  const totalPremium = approvedBonds.reduce((sum, b) => sum + Number(b.premium || 0), 0);

  const metrics = [
    { label: "Pending Review", value: pendingReview.length, icon: Clock, gradient: "from-amber-500 to-orange-600", valueColor: "var(--s-amber)" },
    { label: "Approved / Issued", value: approvedBonds.length, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-600", valueColor: "var(--s-green)" },
    { label: "Declined", value: declinedBonds.length, icon: XCircle, gradient: "from-red-500 to-rose-600", valueColor: "var(--s-red)" },
    { label: "Total Premium", value: formatCurrency(totalPremium), icon: FileText, gradient: "from-violet-500 to-purple-600" },
  ];

  const filteredBonds = useMemo(() => {
    let list: typeof allBonds;
    switch (selectedMetric) {
      case 0: list = pendingReview; break;
      case 1: list = approvedBonds; break;
      case 2: list = declinedBonds; break;
      case 3: list = approvedBonds; break;
      default: list = allBonds;
    }
    if (!sortKey) return list;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "client": {
          const nameA = (a.principal?.companyName || `${a.principal?.firstName} ${a.principal?.lastName}`).toLowerCase();
          const nameB = (b.principal?.companyName || `${b.principal?.firstName} ${b.principal?.lastName}`).toLowerCase();
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case "agent":
          cmp = (a.bondNumber || "").localeCompare(b.bondNumber || "");
          break;
        case "product":
          cmp = (a.bondType || "").localeCompare(b.bondType || "");
          break;
        case "amount":
          cmp = Number(a.bondAmount || 0) - Number(b.bondAmount || 0);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        case "created":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allBonds, selectedMetric, sortKey, sortDir]);

  const totalItems = filteredBonds.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const pagedBonds = filteredBonds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sectionTitle = ["Pending Review", "Approved / Issued", "Declined", "Premium (Approved)"][selectedMetric] || "All Bonds";

  const morningBrief = useMemo(() => {
    const items: { icon: React.ElementType; color: string; bg: string; text: string; href: string }[] = [];
    if (pendingReview.length > 0) {
      items.push({
        icon: AlertTriangle,
        color: "var(--s-amber)",
        bg: "var(--s-amber-bg)",
        text: `${pendingReview.length} referral${pendingReview.length > 1 ? 's' : ''} awaiting your review`,
        href: "/underwriter/review",
      });
    }
    if (approvedBonds.length > 0) {
      items.push({
        icon: CheckCircle2,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: `${approvedBonds.length} bond${approvedBonds.length > 1 ? 's' : ''} approved this period`,
        href: "/underwriter/bonds?status=approved_group",
      });
    }
    if (items.length === 0) {
      items.push({
        icon: ShieldCheck,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: "Review queue is clear. All caught up!",
        href: "/underwriter/bonds",
      });
    }
    return items;
  }, [pendingReview, approvedBonds]);

  const thClass = "text-left px-4 py-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--slate-900)] transition-colors bg-[var(--bg)] border-b border-[var(--border-color)]";

  return (
    <div>
      {!isMobile && (
        <div className="flex items-start justify-between gap-2 flex-wrap mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">Underwriter Dashboard</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
              Review referrals, assess risk, and manage bond decisions.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-[var(--r)] border border-[var(--border-color)] bg-[var(--card)] hover:bg-[var(--slate-100)] transition-all disabled:opacity-50 cursor-pointer shrink-0"
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 text-[var(--text-muted)] ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="mb-4">
          <Link
            href="/underwriter/bond-wizard"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[var(--r-lg)] gradient-accent text-white text-sm font-semibold hover:opacity-90 transition-all no-underline"
          >
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        </div>
      )}

      {!isLoading && morningBrief.length > 0 && (
        <div className="glass-card p-4 mb-4 animate-slideInLeft">
          <button
            onClick={() => setBriefCollapsed(!briefCollapsed)}
            className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer p-0 font-[inherit]"
          >
            <div className="w-6 h-6 rounded-lg gradient-accent flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wider">AI Morning Brief</span>
            <span className="text-[11px] font-semibold text-[var(--accent)] ml-1">{morningBrief.length}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-muted)] ml-auto transition-transform ${briefCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!briefCollapsed && (
            <div className="space-y-1 mt-3">
              {(isMobile && !briefShowAll ? morningBrief.slice(0, 3) : morningBrief).map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={i}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--slate-100)] transition-all no-underline group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                    </div>
                    <span className="text-[13px] font-medium text-[var(--slate-900)] flex-1">{item.text}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                );
              })}
              {isMobile && morningBrief.length > 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBriefShowAll(!briefShowAll); }}
                  className="w-full text-center text-[11px] font-semibold text-[var(--accent)] py-2 mt-1 rounded-lg hover:bg-[var(--slate-100)] transition-colors min-h-[36px]"
                >
                  {briefShowAll ? "Show less" : `Show ${morningBrief.length - 3} more`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isMobile && (
        <div className="flex gap-2 mb-4">
          <Link
            href="/underwriter/review"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-[var(--r-lg)] border border-[var(--border-color)] bg-[var(--card)] text-sm font-semibold text-[var(--slate-700)] hover:bg-[var(--slate-100)] transition-all no-underline"
          >
            <ShieldCheck className="h-4 w-4" />
            Review Queue
          </Link>
        </div>
      )}

      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-2 mb-4`}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          metrics.map((m, i) => {
            const Icon = m.icon;
            const isSelected = selectedMetric === i;
            return (
              <div
                key={m.label}
                onClick={() => handleMetricClick(i)}
                className={`glass-card ${isMobile ? 'p-2.5' : 'p-3'} cursor-pointer transition-all relative overflow-hidden ${
                  isSelected ? "border-[var(--accent)] !bg-[var(--accent-50)]" : ""
                }`}
              >
                {isSelected && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] gradient-accent" />
                )}
                <div className="flex items-center gap-2">
                  <div className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} rounded-md bg-gradient-to-br ${m.gradient} flex items-center justify-center opacity-80 shrink-0`}>
                    <Icon className={`${isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-white`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} font-semibold text-[var(--text-muted)] uppercase tracking-wider truncate`}>{m.label}</div>
                    <div className={`${isMobile ? 'text-[15px]' : 'text-[18px]'} font-black text-[var(--slate-900)] leading-tight`} style={m.valueColor ? { color: m.valueColor } : {}}>
                      {m.value}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col" style={{ maxHeight: "calc(100dvh - 320px)", minHeight: 300 }}>
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="text-sm font-bold text-[var(--slate-900)] uppercase tracking-wider">{sectionTitle}</h2>
        </div>
        <div className="glass-card overflow-hidden flex flex-col flex-1">
          {isMobile ? (
            <div className="divide-y divide-[var(--border-color)] overflow-y-auto flex-1">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
              ) : pagedBonds.length === 0 ? (
                <div className="px-4 py-12 text-center text-[var(--text-muted)]">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No bonds in this category
                </div>
              ) : (
                pagedBonds.map((bond) => {
                  const isPending = REVIEW_STATUSES.includes(bond.status);
                  const aging = isPending ? getAgingInfo(bond.createdAt) : null;
                  return (
                    <div
                      key={bond.id}
                      className="px-4 py-3.5 hover:bg-[var(--slate-100)] active:bg-[var(--slate-200)] transition-colors cursor-pointer"
                      onClick={() => setLocation(`/underwriter/bonds/${bond.id}`)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[13px] text-[var(--slate-900)] truncate min-w-0">
                          {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                        </div>
                        {aging && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: aging.bg, color: aging.color }}
                            title={`Waiting ${aging.label}`}
                          >
                            <Timer className="h-2.5 w-2.5" />
                            {aging.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[12px] font-medium text-[var(--slate-600)]">
                          {formatCurrency(bond.bondAmount)}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">·</span>
                        <BondTypeBadge type={bond.bondType} />
                        <span className="text-[11px] text-[var(--text-muted)]">·</span>
                        <StatusBadge status={bond.status} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {([
                      ["client", "Principal"],
                      ["product", "Bond Type"],
                      ["amount", "Amount"],
                      ["status", "Status"],
                      ["created", "Submitted"],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className={thClass}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {label} {getSortIcon(key, sortKey, sortDir)}
                        </span>
                      </th>
                    ))}
                    <th onClick={() => handleSort("created")} className={thClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Timer className="h-3 w-3" /> Age {getSortIcon("created", sortKey, sortDir)}
                      </span>
                    </th>
                    <th className="px-4 py-3 w-10 bg-[var(--bg)] border-b border-[var(--border-color)]" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={7}><SkeletonRow /></td></tr>
                    ))
                  ) : pagedBonds.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-muted)]">
                        <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No bonds in this category
                      </td>
                    </tr>
                  ) : (
                    pagedBonds.map((bond) => {
                      const isPending = REVIEW_STATUSES.includes(bond.status);
                      const aging = isPending ? getAgingInfo(bond.createdAt) : null;
                      return (
                        <tr key={bond.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--slate-100)] transition-colors cursor-pointer" onClick={() => setLocation(`/underwriter/bonds/${bond.id}`)}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[var(--slate-900)]">
                              {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] font-mono">{bond.bondNumber}</div>
                          </td>
                          <td className="px-4 py-3"><BondTypeBadge type={bond.bondType} /></td>
                          <td className="px-4 py-3 font-semibold font-mono">{formatCurrency(bond.bondAmount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={bond.status} /></td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">
                            {new Date(bond.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-4 py-3">
                            {aging ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: aging.bg, color: aging.color }}
                              >
                                <Timer className="h-3 w-3" />
                                {aging.label}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/underwriter/bonds/${bond.id}`}>
                              <span className="text-[var(--accent)] hover:text-[var(--accent-dark)] cursor-pointer">
                                <ArrowUpRight className="h-4 w-4" />
                              </span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {totalItems > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border-color)] shrink-0">
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
        </div>
      </div>
    </div>
  );
}
