import { useDeals, useArchiveDeal, useRestoreDeal } from "@/hooks/use-api";
import { formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { useState } from "react";
import { Search, FileText, Plus, LayoutGrid, List, Filter, Copy, RefreshCw, MoreVertical, Loader2, Archive, ArchiveRestore, Database, Unlink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCloneDeal } from "@/hooks/use-api";
import { useLocation } from "wouter";

export function DealsList() {
  const [archiveView, setArchiveView] = useState<"active" | "archived" | "all">("active");
  const { data: deals, isLoading } = useDeals({
    includeArchived: archiveView === "all",
    onlyArchived: archiveView === "archived",
  });
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get("status") || "all";
  const initialSearch = urlParams.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialFilter);
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "standalone">("all");
  const [viewMode, setViewMode] = useState<"table" | "card">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "card" : "table"
  );

  const filtered = (deals || []).filter((d: any) => {
    const matchesSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.dealNumber.toLowerCase().includes(search.toLowerCase()) ||
      d.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.dynamicsLink?.opportunityNumber?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    const matchesLink = linkFilter === "all"
      || (linkFilter === "linked" && d.dynamicsLink)
      || (linkFilter === "standalone" && !d.dynamicsLink);
    return matchesSearch && matchesStatus && matchesLink;
  });

  const standaloneCount = (deals || []).filter((d: any) => !d.dynamicsLink && !d.archivedAt).length;

  const { hasPermission, persona } = useAuth();
  const cloneDeal = useCloneDeal();
  const archiveDeal = useArchiveDeal();
  const restoreDeal = useRestoreDeal();
  const [, navigate] = useLocation();
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const statuses = ["all", "draft", "pendingReviewAgent", "in_progress", "submitted", "approved", "rejected"];

  const handleClone = (dealId: number, mode: "clone" | "renewal") => {
    setActionMenuId(null);
    cloneDeal.mutate({ dealId, mode, pdlName: persona?.name }, {
      onSuccess: (newDeal: any) => navigate(`/deals/${newDeal.id}`),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="sticky top-0 z-20 bg-background -mx-4 sm:mx-0 px-4 sm:px-0 -mt-4 sm:mt-0 pt-3 sm:pt-0 pb-3 sm:pb-0 mb-4 sm:mb-6 border-b border-border sm:border-0 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-base sm:text-2xl font-bold text-foreground tracking-tight truncate">Engagements</h1>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">
            {filtered.length} engagement{filtered.length !== 1 ? "s" : ""}
            {standaloneCount > 0 && archiveView === "active" && (
              <span className="ml-2 hidden sm:inline-flex items-center gap-1 text-amber-700">
                <Unlink className="w-3 h-3" /> {standaloneCount} not linked to a Dynamics opportunity
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="card mb-4 sm:mb-6">
        {/* Desktop / tablet: full filter bar with in-card search */}
        <div className="hidden sm:flex px-4 py-3 items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search deals, clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : getStatusLabel(s)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["all", "linked", "standalone"] as const).map((f) => (
              <button key={f} onClick={() => setLinkFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  linkFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {f === "all" ? "All" : f === "linked" ? "D365 linked" : "Standalone"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["active", "archived", "all"] as const).map((v) => (
              <button key={v} onClick={() => setArchiveView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  archiveView === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {v === "active" ? "Active" : v === "archived" ? "Archived" : "All"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "card" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile: compact single-row scroll of filter chips. Search lives in the topbar. */}
        <div className="sm:hidden px-2 py-2">
          {search && (
            <div className="flex items-center gap-1.5 mb-2 px-1 text-[11px] text-muted-foreground">
              <Search className="w-3 h-3" />
              <span className="truncate">Filtering by "{search}"</span>
              <button onClick={() => setSearch("")} className="ml-auto text-primary font-medium">Clear</button>
            </div>
          )}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                }`}
              >
                {s === "all" ? "All" : getStatusLabel(s)}
              </button>
            ))}
            <span className="shrink-0 w-px h-4 bg-border mx-1" aria-hidden="true" />
            {(["all", "linked", "standalone"] as const).map((f) => (
              <button key={f} onClick={() => setLinkFilter(f)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  linkFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                }`}>
                {f === "all" ? "All deals" : f === "linked" ? "D365" : "Standalone"}
              </button>
            ))}
            <span className="shrink-0 w-px h-4 bg-border mx-1" aria-hidden="true" />
            {(["active", "archived", "all"] as const).map((v) => (
              <button key={v} onClick={() => setArchiveView(v)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  archiveView === v ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                }`}>
                {v === "active" ? "Active" : v === "archived" ? "Archived" : "All states"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="card overflow-x-auto hidden md:block">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deal</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Line</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margin</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                {hasPermission("createDeals") && (
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((deal: any) => (
                <tr key={deal.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => window.location.href = `/deals/${deal.id}`}>
                  <td className="px-6 py-4">
                    <Link href={`/deals/${deal.id}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground">{deal.title}</p>
                          {deal.archivedAt && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">
                              <Archive className="w-2.5 h-2.5" /> Archived
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">{deal.dealNumber}{deal.parentDealId ? " (cloned)" : ""}</p>
                          {deal.dynamicsLink ? (
                            <span title={`${deal.dynamicsLink.accountName} · ${deal.dynamicsLink.stage}`}
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <Database className="w-2.5 h-2.5" /> {deal.dynamicsLink.opportunityNumber}
                            </span>
                          ) : (
                            <span title="Not linked to any Dynamics 365 opportunity"
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              <Unlink className="w-2.5 h-2.5" /> Standalone
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{deal.client?.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{deal.serviceLine || "--"}</td>
                  <td className="px-6 py-4"><span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span></td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-foreground">{formatCurrency(deal.totalFee || 0)}</td>
                  <td className="px-6 py-4 text-right text-sm text-foreground">{formatPercent(deal.marginPercent || 0)}</td>
                  <td className="px-6 py-4 text-right text-sm text-muted-foreground">{parseFloat(deal.totalHours || 0).toLocaleString()}</td>
                  {hasPermission("createDeals") && (
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActionMenuId(actionMenuId === deal.id ? null : deal.id)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {actionMenuId === deal.id && (
                          <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-44">
                            <button
                              onClick={() => handleClone(deal.id, "clone")}
                              disabled={cloneDeal.isPending}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Clone Deal
                            </button>
                            <button
                              onClick={() => handleClone(deal.id, "renewal")}
                              disabled={cloneDeal.isPending}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Renew Deal
                            </button>
                            <div className="my-1 border-t border-border" />
                            {deal.archivedAt ? (
                              <button
                                onClick={() => {
                                  setActionMenuId(null);
                                  restoreDeal.mutate({ dealId: deal.id, userName: persona?.name });
                                }}
                                disabled={restoreDeal.isPending}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5" />
                                Restore Deal
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setActionMenuId(null);
                                  const msg = deal.dynamicsLink
                                    ? `Archive "${deal.title}"?\n\nThe deal stays in the database with full history. It will be hidden from active lists, and the linked D365 opportunity ${deal.dynamicsLink.opportunityNumber} will be unlinked so it can be re-scoped.`
                                    : `Archive "${deal.title}"?\n\nThe deal stays in the database with full history but will be hidden from active lists. You can restore it later from the Archived view.`;
                                  if (confirm(msg)) {
                                    archiveDeal.mutate({ dealId: deal.id, userName: persona?.name });
                                  }
                                }}
                                disabled={archiveDeal.isPending}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                <Archive className="w-3.5 h-3.5" />
                                Archive Deal
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center text-muted-foreground text-sm">No deals match your filters.</div>
          )}
        </div>
      ) : null}

      {/* Card view: shown when card mode selected, OR forced on mobile when table mode is active */}
      {(viewMode === "card" || viewMode === "table") && (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 ${viewMode === "table" ? "md:hidden" : ""}`}>
          {filtered.map((deal: any) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground text-sm">{deal.title}</p>
                      {deal.archivedAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">
                          <Archive className="w-2.5 h-2.5" /> Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{deal.dealNumber}</p>
                      {deal.dynamicsLink ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          <Database className="w-2.5 h-2.5" /> {deal.dynamicsLink.opportunityNumber}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          <Unlink className="w-2.5 h-2.5" /> Standalone
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{deal.client?.name}</p>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Fee</p>
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(deal.totalFee || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="text-sm font-semibold text-foreground">{formatPercent(deal.marginPercent || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hours</p>
                    <p className="text-sm font-semibold text-foreground">{parseFloat(deal.totalHours || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
