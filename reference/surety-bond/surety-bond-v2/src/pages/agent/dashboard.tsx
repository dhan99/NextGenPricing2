import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useGetDashboardStats, useListBonds, useListRenewableBonds } from "@workspace/api-client-react";
import { ArrowUpRight, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Plus, Sparkles, CreditCard, AlertTriangle, Clock, TrendingUp, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";

type SortKey = "client" | "product" | "premium" | "status" | "created";
type SortDir = "asc" | "desc";

const PENDING_PAYMENT_STATUSES = ["pending_payment"];
const ACTIVE_STATUSES = ["submitted", "quoted", "requires_referral", "referred", "indemnity_in_review", "pending_information", "approved", "pending_payment", "payment_approved", "referral_approved", "pending_issue", "issued"];
const REFERRAL_STATUSES = ["requires_referral", "referred"];
const PAGE_SIZE = 10;

function getSortIcon(columnKey: SortKey, activeKey: SortKey | null, dir: SortDir) {
  if (activeKey !== columnKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
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

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4">
      <div className="skeleton h-4 w-24 sm:w-32 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-14 sm:w-20 rounded flex-shrink-0 hidden sm:block" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0 hidden sm:block" />
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function AgentDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Agent";
  const isMobile = useIsMobile();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDashboardStats(
    { query: { queryKey: ["dashboardStats", "agent"], refetchOnWindowFocus: "always", refetchOnMount: "always", staleTime: 0 } }
  );
  const { data: bonds, isLoading: bondsLoading, refetch: refetchBonds } = useListBonds(
    {}, { query: { queryKey: ["listBonds", "agent-dashboard"], refetchOnWindowFocus: "always", refetchOnMount: "always", staleTime: 0 } }
  );
  const { data: renewalBonds } = useListRenewableBonds(
    { daysUntilExpiry: 90 },
    { query: { queryKey: ["renewableBonds", "agent-90"] } }
  );
  const [refreshing, setRefreshing] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(isMobile);
  const [briefShowAll, setBriefShowAll] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchStats(), refetchBonds()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchStats, refetchBonds]);
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
  const renewableBondIds = new Set((renewalBonds || []).map((b: any) => b.id));

  const filteredBonds = useMemo(() => {
    let list: typeof allBonds;
    switch (selectedMetric) {
      case 0:
        list = allBonds.filter(b => b.status !== "draft");
        break;
      case 1:
        list = allBonds.filter(b => PENDING_PAYMENT_STATUSES.includes(b.status));
        break;
      case 2:
        list = allBonds.filter(b => ACTIVE_STATUSES.includes(b.status));
        break;
      case 3:
        list = allBonds.filter(b => renewableBondIds.has(b.id));
        break;
      default:
        list = allBonds;
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "client": {
            const nameA = (a.principal?.companyName || `${a.principal?.firstName} ${a.principal?.lastName}`).toLowerCase();
            const nameB = (b.principal?.companyName || `${b.principal?.firstName} ${b.principal?.lastName}`).toLowerCase();
            cmp = nameA.localeCompare(nameB);
            break;
          }
          case "product":
            cmp = (a.bondType || "").localeCompare(b.bondType || "");
            break;
          case "premium":
            cmp = (a.premium || a.bondAmount || 0) - (b.premium || b.bondAmount || 0);
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
    }
    return list;
  }, [allBonds, selectedMetric, sortKey, sortDir, renewableBondIds]);

  const totalItems = filteredBonds.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const pagedBonds = filteredBonds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingPaymentCount = allBonds.filter(b => PENDING_PAYMENT_STATUSES.includes(b.status)).length;
  const referralCount = allBonds.filter(b => REFERRAL_STATUSES.includes(b.status)).length;
  const renewalCount = (renewalBonds || []).length;

  const morningBriefItems = useMemo(() => {
    const items: { icon: React.ElementType; color: string; bg: string; text: string; href: string }[] = [];
    if (pendingPaymentCount > 0) {
      items.push({
        icon: CreditCard,
        color: "var(--s-amber)",
        bg: "var(--s-amber-bg)",
        text: `${pendingPaymentCount} bond${pendingPaymentCount > 1 ? 's' : ''} awaiting payment`,
        href: "/agent/bonds?status=pending_payment",
      });
    }
    if (referralCount > 0) {
      items.push({
        icon: AlertTriangle,
        color: "var(--s-purple)",
        bg: "var(--s-purple-bg)",
        text: `${referralCount} referral${referralCount > 1 ? 's' : ''} pending UW review`,
        href: "/agent/underwriting",
      });
    }
    const recentBonds = allBonds.filter(b => {
      const created = new Date(b.createdAt);
      const today = new Date();
      return created.toDateString() === today.toDateString();
    });
    if (recentBonds.length > 0) {
      items.push({
        icon: TrendingUp,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: `${recentBonds.length} new application${recentBonds.length > 1 ? 's' : ''} submitted today`,
        href: "/agent/bonds?status=submitted",
      });
    }
    if (items.length === 0) {
      items.push({
        icon: ShieldCheck,
        color: "var(--s-green)",
        bg: "var(--s-green-bg)",
        text: "All caught up! No immediate actions needed.",
        href: "/agent/bonds",
      });
    }
    return items;
  }, [allBonds, pendingPaymentCount, referralCount]);

  const metrics = [
    { label: "Applications", value: statsLoading ? "—" : stats?.totalApplications, sub: "Total this month", icon: TrendingUp, gradient: "from-emerald-500 to-teal-600" },
    { label: "Pending Payment", value: statsLoading ? "—" : pendingPaymentCount, sub: "Action needed", valueColor: "var(--s-amber)", icon: CreditCard, gradient: "from-amber-500 to-orange-600" },
    { label: "Bond Portfolio", value: allBonds.filter(b => ACTIVE_STATUSES.includes(b.status)).length, sub: "Active policies", icon: ShieldCheck, gradient: "from-blue-500 to-indigo-600" },
    { label: "Renewals Due", value: statsLoading ? "—" : renewalCount, sub: "Next 90 days", valueColor: "var(--s-amber)", icon: Clock, gradient: "from-violet-500 to-purple-600" },
  ];

  const sectionTitles = ["Recent Applications", "Pending Payment", "Active Bond Portfolio", "Renewals Due"];

  const thClass = "px-4 py-[9px] text-left text-[11px] font-bold uppercase tracking-[.06em] text-[var(--text-muted)] bg-[var(--bg)] border-b border-[var(--border-color)] cursor-pointer select-none hover:text-[var(--slate-900)] transition-colors";

  return (
    <div>
      {!isMobile && (
        <div className="flex items-start justify-between mb-6 gap-2 flex-wrap sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">{getGreeting()}, {firstName}</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">Here's what needs your attention today</p>
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

      {!bondsLoading && morningBriefItems.length > 0 && (
        <div className="glass-card p-4 mb-4 animate-slideInLeft">
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
            href="/agent/bond-wizard"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[var(--r-lg)] gradient-accent text-white text-sm font-semibold hover:opacity-90 transition-all no-underline"
          >
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        </div>
      )}

      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-2 mb-4`}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                onClick={() => handleMetricClick(i)}
                className={`glass-card ${isMobile ? 'p-2.5' : 'p-3'} cursor-pointer transition-all duration-200 relative overflow-hidden ${
                  selectedMetric === i
                    ? "border-[var(--accent)] !bg-[var(--accent-50)]"
                    : ""
                }`}
              >
                {selectedMetric === i && (
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

      <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: "calc(100dvh - 320px)", minHeight: 300 }}>
        <div className="flex items-center justify-between p-[12px_20px] border-b border-[var(--border-color)] shrink-0">
          <h3 className="text-sm font-bold text-[var(--slate-900)]">{sectionTitles[selectedMetric] || "Recent Bond Applications"}</h3>
          <Link
            href="/agent/bonds"
            className="text-xs font-semibold text-[var(--accent)] hover:underline no-underline flex items-center gap-1"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {isMobile ? (
          <div className="divide-y divide-[var(--border-color)] overflow-y-auto flex-1">
            {bondsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
            ) : pagedBonds.length === 0 ? (
              <div className="px-4 py-12 text-center text-[var(--text-muted)]">
                <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                No pending applications.
              </div>
            ) : (
              pagedBonds.map(bond => (
                <div
                  key={bond.id}
                  className="px-4 py-3.5 hover:bg-[var(--slate-100)] active:bg-[var(--slate-200)] transition-colors cursor-pointer"
                  onClick={() => setLocation(`/agent/bonds/${bond.id}`)}
                >
                  <div className="font-semibold text-[13px] text-[var(--slate-900)]">
                    {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[12px] font-medium text-[var(--slate-600)]">
                      {bond.premium ? `$${bond.premium.toLocaleString()}` : `$${bond.bondAmount.toLocaleString()}`}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <BondTypeBadge type={bond.bondType} />
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <StatusBadge status={bond.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={thClass} onClick={() => handleSort("client")}>
                    <span className="flex items-center gap-1">Client {getSortIcon("client", sortKey, sortDir)}</span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("product")}>
                    <span className="flex items-center gap-1">Product {getSortIcon("product", sortKey, sortDir)}</span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("premium")}>
                    <span className="flex items-center gap-1">Premium {getSortIcon("premium", sortKey, sortDir)}</span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("status")}>
                    <span className="flex items-center gap-1">Status {getSortIcon("status", sortKey, sortDir)}</span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("created")}>
                    <span className="flex items-center gap-1">Created {getSortIcon("created", sortKey, sortDir)}</span>
                  </th>
                  <th className="px-4 py-[9px] text-left text-[11px] font-bold uppercase tracking-[.06em] text-[var(--text-muted)] bg-[var(--bg)] border-b border-[var(--border-color)]"></th>
                </tr>
              </thead>
              <tbody>
                {bondsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={6}><SkeletonRow /></td></tr>
                  ))
                ) : pagedBonds.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    No pending applications.
                  </td></tr>
                ) : (
                  pagedBonds.map(bond => (
                    <tr key={bond.id} className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--slate-100)] cursor-pointer transition-colors" onClick={() => setLocation(`/agent/bonds/${bond.id}`)}>
                      <td className="px-4 py-[13px]">
                        <div className="font-semibold text-[var(--slate-900)]">
                          {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">{bond.bondNumber}</div>
                      </td>
                      <td className="px-4 py-[13px] text-[var(--slate-700)]">
                        <BondTypeBadge type={bond.bondType} />
                      </td>
                      <td className="px-4 py-[13px] text-[var(--slate-700)] font-mono">
                        {bond.premium ? `$${bond.premium.toLocaleString()}` : `$${bond.bondAmount.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-[13px]">
                        <StatusBadge status={bond.status} />
                      </td>
                      <td className="px-4 py-[13px] text-[var(--text-muted)]">
                        {new Date(bond.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-[13px]">
                        <span className="text-xs font-semibold text-[var(--accent)]">Open →</span>
                      </td>
                    </tr>
                  ))
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
  );
}
