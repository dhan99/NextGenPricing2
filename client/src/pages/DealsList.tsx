import { useDeals } from "@/hooks/use-api";
import { formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { useState } from "react";
import { Search, FileText, Plus, LayoutGrid, List, Filter } from "lucide-react";

export function DealsList() {
  const { data: deals, isLoading } = useDeals();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const filtered = (deals || []).filter((d: any) => {
    const matchesSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.dealNumber.toLowerCase().includes(search.toLowerCase()) ||
      d.client?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["all", "draft", "in_progress", "submitted", "approved", "rejected"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Deals</h1>
          <p className="text-muted-foreground text-sm mt-1">{filtered.length} deal{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/deals/new">
          <button className="btn-primary"><Plus className="w-4 h-4" /> New Deal</button>
        </Link>
      </div>

      <div className="card mb-6">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
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
      </div>

      {viewMode === "table" ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deal</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Line</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margin</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((deal: any) => (
                <tr key={deal.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => window.location.href = `/deals/${deal.id}`}>
                  <td className="px-6 py-4">
                    <Link href={`/deals/${deal.id}`}>
                      <div>
                        <p className="font-medium text-sm text-foreground">{deal.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{deal.dealNumber}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{deal.client?.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{deal.serviceLine || "--"}</td>
                  <td className="px-6 py-4"><span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span></td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-foreground">{formatCurrency(deal.totalFee || 0)}</td>
                  <td className="px-6 py-4 text-right text-sm text-foreground">{formatPercent(deal.marginPercent || 0)}</td>
                  <td className="px-6 py-4 text-right text-sm text-muted-foreground">{parseFloat(deal.totalHours || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center text-muted-foreground text-sm">No deals match your filters.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((deal: any) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{deal.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{deal.dealNumber}</p>
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
