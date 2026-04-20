import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { TrendingUp, DollarSign, Clock, Target, Award, BarChart3, Activity, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useMarginTargets } from "@/hooks/use-api";

function firmTargetFromResponse(resp: any): number {
  if (resp && typeof resp.firmDefault === "number") return resp.firmDefault;
  if (resp && resp.firmDefault != null) return parseFloat(resp.firmDefault);
  return 35;
}

const COLORS = ["#DA720F", "#78716c", "#d97706", "#a8a29e", "#92400e"];
const STATUS_COLORS: Record<string, string> = { draft: "#a8a29e", submitted: "#d97706", approved: "#16a34a", rejected: "#dc2626" };

export function Analytics() {
  const { data: targetData } = useMarginTargets();
  const firmTarget = firmTargetFromResponse(targetData);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/overview");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-stone-200 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-stone-200 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            {[1,2].map(i => <div key={i} className="h-72 bg-stone-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, pipelineSummary, serviceLineBreakdown, marginDistribution, complexityBreakdown, monthlyTrend } = data;

  const pipelineData = Object.entries(pipelineSummary).map(([status, d]: [string, any]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    count: d.count,
    revenue: d.totalFee,
    fill: STATUS_COLORS[status] || "#78716c",
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Historical trends, win rates, and pipeline insights</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary">{summary.totalDeals} Total Deals</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Pipeline", value: formatCurrency(summary.totalPipeline), icon: DollarSign, sub: `${summary.totalDeals} deals` },
          { label: "Win Rate", value: `${summary.winRate}%`, icon: Target, sub: `${summary.approvedCount} won / ${summary.rejectedCount} lost` },
          { label: "Avg Margin", value: `${summary.avgMargin}%`, icon: TrendingUp, sub: `Firm target: ${firmTarget}%` },
          { label: "Avg Cycle Time", value: `${summary.avgCycleTime}d`, icon: Clock, sub: "Draft to decision" },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">{kpi.label}</span>
              <kpi.icon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-1">Monthly Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Deal volume and revenue over time</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#78716c" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#78716c" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#78716c" }} />
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "1px solid #e7e5e4", fontSize: "12px" }}
                formatter={(value: any, name: string) => [
                  name === "revenue" ? formatCurrency(value) : value,
                  name === "revenue" ? "Revenue" : name === "deals" ? "Deals" : "Avg Margin %"
                ]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              <Line yAxisId="left" type="monotone" dataKey="deals" stroke="#DA720F" strokeWidth={2} dot={{ fill: "#DA720F", r: 4 }} name="Deals" />
              <Line yAxisId="right" type="monotone" dataKey="avgMargin" stroke="#78716c" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "#78716c", r: 3 }} name="Avg Margin %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-1">Pipeline by Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Deal count and revenue by stage</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#78716c" }} />
              <YAxis tick={{ fontSize: 12, fill: "#78716c" }} />
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "1px solid #e7e5e4", fontSize: "12px" }}
                formatter={(value: any, name: string) => [name === "revenue" ? formatCurrency(value) : value, name === "revenue" ? "Revenue" : "Count"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {pipelineData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-1">Margin Distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Deals grouped by margin range</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={marginDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#78716c" }} />
              <YAxis type="category" dataKey="range" tick={{ fontSize: 12, fill: "#78716c" }} width={60} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e7e5e4", fontSize: "12px" }} />
              <Bar dataKey="count" fill="#DA720F" radius={[0, 6, 6, 0]} name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-1">Complexity Mix</h3>
          <p className="text-xs text-muted-foreground mb-4">Deal distribution by complexity</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={complexityBreakdown.filter((c: any) => c.count > 0)}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="count"
                nameKey="complexity"
              >
                {complexityBreakdown.filter((c: any) => c.count > 0).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e7e5e4", fontSize: "12px" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Key Metrics
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Performance indicators</p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Win Rate</span>
                <span className="text-sm font-semibold text-foreground">{summary.winRate}%</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(parseFloat(summary.winRate), 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Margin vs Firm Target ({firmTarget}%)</span>
                <span className="text-sm font-semibold text-foreground">{summary.avgMargin}%</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((parseFloat(summary.avgMargin) / firmTarget) * 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Avg Deal Size</span>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(summary.avgDealSize)}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Avg Cycle Time</span>
                <span className="text-sm font-semibold text-foreground">{summary.avgCycleTime} days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {serviceLineBreakdown.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Service Line Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Line</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deals</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Won</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Win Rate</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Fee</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {serviceLineBreakdown.map((sl: any) => (
                  <tr key={sl.serviceLine} className="hover:bg-stone-50/50">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{sl.serviceLine}</td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">{sl.totalDeals}</td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">{sl.approvedDeals}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span className={`font-semibold ${parseFloat(sl.winRate) >= 50 ? "text-green-600" : "text-amber-600"}`}>{sl.winRate}%</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-foreground">{formatCurrency(sl.totalFee)}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span className={`font-semibold ${parseFloat(sl.avgMargin) >= 25 ? "text-green-600" : parseFloat(sl.avgMargin) >= 15 ? "text-amber-600" : "text-red-600"}`}>
                        {sl.avgMargin}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
