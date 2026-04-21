import { useState, useMemo, useCallback } from "react";
import { Link, useSearch } from "wouter";
import { useListBonds } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpRight, ArrowUp, ArrowDown, ArrowUpDown, ShieldCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

type SortKey = "client" | "bondNumber" | "product" | "amount" | "premium" | "status" | "created";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 25;
const APPROVED_GROUP_STATUSES = ["approved", "issued", "payment_approved", "pending_payment", "pending_issue", "referral_approved"];

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

export function UnderwriterBondsList() {
  const isMobile = useIsMobile();
  const searchString = useSearch();
  const initialStatus = new URLSearchParams(searchString).get("status") || "all";
  const { data: bonds, isLoading } = useListBonds({}, { query: { staleTime: 0, refetchOnMount: "always" } });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setPage(1);
  }, []);

  const allBonds = bonds || [];

  const filteredBonds = useMemo(() => {
    let list = allBonds;
    if (statusFilter === "approved_group") {
      list = list.filter(b => APPROVED_GROUP_STATUSES.includes(b.status));
    } else if (statusFilter !== "all") {
      list = list.filter(b => b.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b =>
        b.bondNumber.toLowerCase().includes(q) ||
        b.bondType.toLowerCase().includes(q) ||
        b.obligeeName.toLowerCase().includes(q) ||
        (b.principal?.companyName || "").toLowerCase().includes(q) ||
        (b.principal?.firstName || "").toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "client": {
            const na = (a.principal?.companyName || `${a.principal?.firstName} ${a.principal?.lastName}`).toLowerCase();
            const nb = (b.principal?.companyName || `${b.principal?.firstName} ${b.principal?.lastName}`).toLowerCase();
            cmp = na.localeCompare(nb);
            break;
          }
          case "bondNumber": cmp = a.bondNumber.localeCompare(b.bondNumber); break;
          case "product": cmp = (a.bondType || "").localeCompare(b.bondType || ""); break;
          case "amount": cmp = Number(a.bondAmount || 0) - Number(b.bondAmount || 0); break;
          case "premium": cmp = Number(a.premium || 0) - Number(b.premium || 0); break;
          case "status": cmp = (a.status || "").localeCompare(b.status || ""); break;
          case "created": cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [allBonds, searchQuery, statusFilter, sortKey, sortDir]);

  const totalItems = filteredBonds.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const pagedBonds = filteredBonds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalItems);

  const thClass = "text-left px-4 py-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--slate-900)] transition-colors bg-[var(--bg)] border-b border-[var(--border-color)]";

  return (
    <div>
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${isMobile ? 'gap-0 mb-2 sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : 'gap-4 mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4'}`}>
        {!isMobile && (
          <div>
            <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">All Bonds</h1>
            <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
              Complete view of all bond applications across all agents and principals.
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder="Search bonds..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-[var(--text-muted)]" />
                <SelectValue placeholder="All Statuses" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="approved_group">Approved / Issued</SelectItem>
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
            ) : pagedBonds.length === 0 ? (
              <div className="px-4 py-12 text-center text-[var(--text-muted)]">
                <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No bonds found
              </div>
            ) : (
              pagedBonds.map((bond) => (
                <Link key={bond.id} href={`/underwriter/bonds/${bond.id}`} className="no-underline">
                  <div className="px-4 py-3.5 hover:bg-[var(--slate-100)] active:bg-[var(--slate-200)] transition-colors cursor-pointer">
                    <div className="font-semibold text-[13px] text-[var(--slate-900)]">
                      {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--slate-600)]">{formatCurrency(bond.bondAmount)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">·</span>
                      <BondTypeBadge type={bond.bondType} />
                      <span className="text-[11px] text-[var(--text-muted)]">·</span>
                      <StatusBadge status={bond.status} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {([
                    ["bondNumber", "Bond #"],
                    ["client", "Principal"],
                    ["product", "Type"],
                    ["amount", "Amount"],
                    ["premium", "Premium"],
                    ["status", "Status"],
                    ["created", "Created"],
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
                  <th className="px-4 py-3 w-10 bg-[var(--bg)] border-b border-[var(--border-color)]" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={8}><SkeletonRow /></td></tr>
                  ))
                ) : pagedBonds.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-muted)]">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No bonds found
                    </td>
                  </tr>
                ) : (
                  pagedBonds.map((bond) => (
                    <tr key={bond.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--slate-100)] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{bond.bondNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--slate-900)]">
                          {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                        </div>
                      </td>
                      <td className="px-4 py-3"><BondTypeBadge type={bond.bondType} /></td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(bond.bondAmount)}</td>
                      <td className="px-4 py-3">{bond.premium ? formatCurrency(bond.premium) : "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={bond.status} /></td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {new Date(bond.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/underwriter/bonds/${bond.id}`}>
                          <span className="text-[var(--accent)] hover:text-[var(--accent-dark)] cursor-pointer">
                            <ArrowUpRight className="h-4 w-4" />
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <span className="text-[12.5px] text-[var(--text-muted)]">
              {totalItems <= PAGE_SIZE
                ? `Showing ${totalItems} results`
                : `Showing ${startItem}–${endItem} of ${totalItems}`}
            </span>
            {totalPages > 1 && (
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
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
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-[var(--border-color)] rounded-[var(--r)] bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--slate-100)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(totalPages)}
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
