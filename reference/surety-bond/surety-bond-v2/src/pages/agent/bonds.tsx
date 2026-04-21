import { useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Search, Filter, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePaginatedBonds } from "@/hooks/use-paginated-bonds";

type SortKey = "client" | "state" | "product" | "premium" | "status" | "created";
type SortDir = "asc" | "desc";

function getSortIcon(columnKey: SortKey, activeKey: SortKey | null, dir: SortDir) {
  if (activeKey !== columnKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 border-b border-[var(--border-color)]">
      <div className="skeleton h-4 w-24 sm:w-36 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-10 sm:w-12 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-14 sm:w-20 rounded flex-shrink-0 hidden sm:block" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0 hidden sm:block" />
      <div className="skeleton h-4 w-12 sm:w-16 rounded flex-shrink-0" />
      <div className="skeleton h-4 w-14 sm:w-20 rounded flex-shrink-0 hidden sm:block" />
    </div>
  );
}

const DESKTOP_PAGE_SIZE = 25;
const MOBILE_PAGE_SIZE = 10;

export function AgentBondsList() {
  const isMobile = useIsMobile();
  const PAGE_SIZE = isMobile ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const initialStatus = new URLSearchParams(searchString).get("status") || "all";
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: response, isLoading } = usePaginatedBonds({
    page,
    limit: PAGE_SIZE,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
    sortBy: sortKey || undefined,
    sortDir: sortKey ? sortDir : undefined,
  });

  const sortedBonds = response?.data || [];
  const pagination = response?.pagination || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setPage(1);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const thClass = "px-4 py-[9px] text-left text-[11px] font-bold uppercase tracking-[.06em] text-[var(--text-muted)] bg-[var(--bg)] border-b border-[var(--border-color)] cursor-pointer select-none hover:text-[var(--slate-900)] transition-colors";

  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div>
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${isMobile ? 'gap-0 mb-2 sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : 'gap-3 mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4'}`}>
        {!isMobile && (
          <div>
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">Applications</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">Track and manage every bond application.</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <form
            className="relative w-full sm:w-64"
            onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(); }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search clients or bond IDs..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={handleSearchSubmit}
              className="w-full py-[9px] pl-[38px] pr-3 border border-[var(--border-color)] rounded-[var(--r)] text-[13px] bg-[var(--card)] text-[var(--text)] font-[inherit] transition-all focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10"
            />
          </form>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-[var(--text-muted)]" />
                <SelectValue placeholder="All Statuses" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="quoted">Quoted</SelectItem>
              <SelectItem value="requires_referral">Requires Referral</SelectItem>
              <SelectItem value="referred">Referred</SelectItem>
              <SelectItem value="indemnity_in_review">Indemnity Review</SelectItem>
              <SelectItem value="pending_information">Pending Info</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending_payment">Pending Payment</SelectItem>
              <SelectItem value="payment_approved">Payment Approved</SelectItem>
              <SelectItem value="referral_approved">Referral Approved</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {isMobile ? (
          <div className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : sortedBonds.length === 0 ? (
              <div className="px-4 py-12 text-center text-[var(--text-muted)]">No applications found.</div>
            ) : (
              sortedBonds.map((bond: any) => (
                <div
                  key={bond.id}
                  className="px-4 py-3.5 hover:bg-[var(--slate-100)] active:bg-[var(--slate-200)] transition-colors cursor-pointer"
                  onClick={() => {
                    if (bond.status === "payment_approved" || bond.status === "referral_approved") {
                      setLocation(`/agent/bonds/${bond.id}/application-summary`);
                    } else {
                      setLocation(`/agent/bonds/${bond.id}`);
                    }
                  }}
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
                    {bond.principal?.state && (
                      <>
                        <span className="text-[11px] text-[var(--text-muted)]">·</span>
                        <span className="text-[11px] text-[var(--text-muted)]">{bond.principal.state}</span>
                      </>
                    )}
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <StatusBadge status={bond.status} />
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">
                      {format(new Date(bond.updatedAt || bond.createdAt), "MMM d")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={thClass} onClick={() => handleSort("client")}>
                    <span className="flex items-center gap-1">Client {getSortIcon("client", sortKey, sortDir)}</span>
                  </th>
                  <th className={thClass} onClick={() => handleSort("state")}>
                    <span className="flex items-center gap-1">State {getSortIcon("state", sortKey, sortDir)}</span>
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
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={7}><SkeletonRow /></td></tr>
                  ))
                ) : sortedBonds.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--text-muted)]">No applications found.</td></tr>
                ) : (
                  sortedBonds.map((bond: any) => (
                    <tr key={bond.id} className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--slate-100)] cursor-pointer transition-colors" onClick={() => {
                      if (bond.status === "payment_approved" || bond.status === "referral_approved") {
                        setLocation(`/agent/bonds/${bond.id}/application-summary`);
                      } else {
                        setLocation(`/agent/bonds/${bond.id}`);
                      }
                    }}>
                      <td className="px-4 py-[13px]">
                        <div className="font-semibold text-[var(--slate-900)]">
                          {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">{bond.bondNumber}</div>
                      </td>
                      <td className="px-4 py-[13px] text-[var(--text-muted)]">
                        {bond.principal?.state || "—"}
                      </td>
                      <td className="px-4 py-[13px]">
                        <BondTypeBadge type={bond.bondType} />
                      </td>
                      <td className="px-4 py-[13px] text-[var(--slate-700)] font-mono">
                        {bond.premium ? `$${bond.premium.toLocaleString()}` : `$${bond.bondAmount.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-[13px]">
                        <StatusBadge status={bond.status} />
                      </td>
                      <td className="px-4 py-[13px] text-[var(--text-muted)] whitespace-nowrap">
                        {format(new Date(bond.updatedAt || bond.createdAt), "MMM d, yyyy")}
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

        {pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <span className="text-[12.5px] text-[var(--text-muted)]">
              {pagination.total <= PAGE_SIZE
                ? `Showing ${pagination.total} results`
                : `Showing ${startItem}–${endItem} of ${pagination.total}`}
            </span>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="flex items-center gap-0.5 mx-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`min-w-[28px] h-7 text-xs font-medium border rounded-[var(--r)] cursor-pointer transition-colors ${
                          pageNum === page
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "border-[var(--border-color)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)]"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={page === pagination.totalPages}
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  disabled={page === pagination.totalPages}
                  onClick={() => setPage(pagination.totalPages)}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
