import { useDashboardSummary, useDeals, useActivity } from "@/hooks/use-api";
import { formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { TrendingUp, DollarSign, Clock, AlertCircle, ArrowRight, FileText, Activity } from "lucide-react";

export function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: deals } = useDeals();
  const { data: activity } = useActivity();

  const kpis = [
    { label: "Total Pipeline", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, color: "text-primary" },
    { label: "Active Deals", value: summary?.totalDeals ?? "--", icon: FileText, color: "text-info" },
    { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, color: "text-success" },
    { label: "Pending Approvals", value: summary?.pendingApprovals ?? "--", icon: AlertCircle, color: "text-warning" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your pricing pipeline</p>
        </div>
        <Link href="/deals/new">
          <button className="btn-primary">
            <FileText className="w-4 h-4" />
            New Deal
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">{kpi.label}</span>
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent Deals</h2>
            <Link href="/deals">
              <span className="text-sm text-primary font-medium hover:underline cursor-pointer flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {deals?.slice(0, 5).map((deal: any) => (
              <Link key={deal.id} href={`/deals/${deal.id}`}>
                <div className="px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-foreground text-sm truncate">{deal.title}</p>
                        <span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">{deal.dealNumber}</span>
                        <span className="text-xs text-muted-foreground">{deal.client?.name}</span>
                        <span className="text-xs text-muted-foreground">{deal.serviceLine}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-foreground text-sm">{formatCurrency(deal.totalFee || 0)}</p>
                      <p className="text-xs text-muted-foreground">{formatPercent(deal.marginPercent || 0)} margin</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {(!deals || deals.length === 0) && (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">No deals yet. Create your first deal to get started.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Recent Activity
            </h2>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {activity?.slice(0, 8).map((item: any) => (
              <div key={item.id} className="px-6 py-3">
                <p className="text-sm text-foreground">{item.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{item.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {summary?.statusBreakdown && summary.statusBreakdown.length > 0 && (
        <div className="mt-6 card p-6">
          <h2 className="font-semibold text-foreground mb-4">Pipeline by Status</h2>
          <div className="flex items-center gap-3">
            {summary.statusBreakdown.map((s: any) => (
              <div key={s.status} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">{getStatusLabel(s.status)}</span>
                  <span className="text-xs font-bold text-foreground">{s.count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min((s.count / (summary.totalDeals || 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
