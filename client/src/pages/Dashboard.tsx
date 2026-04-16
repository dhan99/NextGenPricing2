import { useDashboardSummary, useDeals, useActivity } from "@/hooks/use-api";
import { formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { TrendingUp, DollarSign, Clock, AlertCircle, ArrowRight, FileText, Activity, ShieldCheck, Layers, Network, BookOpen, BarChart3, Shield, Eye, Pencil, CheckCircle, Sparkles } from "lucide-react";
import { useAuth, type PersonaRole } from "@/context/AuthContext";

const ROLE_ACCENT: Record<PersonaRole, { bg: string; border: string; text: string; badge: string; gradient: string }> = {
  pdl: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700", gradient: "from-orange-500 to-amber-500" },
  sll: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", gradient: "from-blue-500 to-indigo-500" },
  po: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", gradient: "from-emerald-500 to-teal-500" },
  fin: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", badge: "bg-violet-100 text-violet-700", gradient: "from-violet-500 to-purple-500" },
  qrm: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700", gradient: "from-red-500 to-rose-500" },
  it: { bg: "bg-stone-50", border: "border-stone-200", text: "text-stone-700", badge: "bg-stone-100 text-stone-700", gradient: "from-stone-500 to-zinc-500" },
};

const ROLE_GREETING: Record<PersonaRole, { title: string; subtitle: string }> = {
  pdl: { title: "Deal Command Center", subtitle: "Create, scope, price, and submit deals. Your AI-powered workspace for winning engagements." },
  sll: { title: "Pipeline Overview", subtitle: "Review deals awaiting your approval and monitor service line performance." },
  po: { title: "Pricing Governance", subtitle: "Manage rate cards, scope catalogs, and ensure pricing standards across all deals." },
  fin: { title: "Financial Analytics", subtitle: "Validate margins, review scenarios, and monitor deal profitability metrics." },
  qrm: { title: "Risk & Compliance", subtitle: "Oversee deal risk profiles, review AI risk summaries, and monitor compliance." },
  it: { title: "System Overview", subtitle: "View architecture, integration points, and technical infrastructure status." },
};

interface QuickAction {
  label: string;
  href: string;
  icon: any;
  description: string;
  permission?: string;
}

const ROLE_ACTIONS: Record<PersonaRole, QuickAction[]> = {
  pdl: [
    { label: "New Deal", href: "/deals/new", icon: FileText, description: "Start a new pricing engagement" },
    { label: "My Deals", href: "/deals", icon: Layers, description: "View and manage all your deals" },
    { label: "Architecture", href: "/architecture-i", icon: Network, description: "Interactive system diagram" },
  ],
  sll: [
    { label: "Review Deals", href: "/deals", icon: CheckCircle, description: "Deals pending your review" },
    { label: "Pipeline", href: "/deals", icon: BarChart3, description: "Service line pipeline view" },
    { label: "Architecture", href: "/architecture-i", icon: Network, description: "System architecture overview" },
  ],
  po: [
    { label: "Rate Cards", href: "/admin/rate-cards", icon: DollarSign, description: "Manage billing rate cards" },
    { label: "Scope Catalog", href: "/admin/scope-catalog", icon: BookOpen, description: "Configure scope templates" },
    { label: "View Deals", href: "/deals", icon: Eye, description: "Review deal pricing" },
  ],
  fin: [
    { label: "View Deals", href: "/deals", icon: BarChart3, description: "Analyze deal margins" },
    { label: "Pipeline", href: "/deals", icon: TrendingUp, description: "Financial pipeline metrics" },
    { label: "Architecture", href: "/architecture", icon: Layers, description: "System documentation" },
  ],
  qrm: [
    { label: "Risk Review", href: "/deals", icon: Shield, description: "Review deal risk profiles" },
    { label: "Compliance", href: "/deals", icon: ShieldCheck, description: "Audit compliance status" },
    { label: "Architecture", href: "/architecture", icon: Layers, description: "Security architecture" },
  ],
  it: [
    { label: "Architecture", href: "/architecture-i", icon: Network, description: "Interactive system diagram" },
    { label: "Static View", href: "/architecture", icon: Layers, description: "Architecture documentation" },
  ],
};

export function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: deals } = useDeals();
  const { data: activity } = useActivity();
  const { hasPermission, persona } = useAuth();

  const role = persona?.role || "pdl";
  const accent = ROLE_ACCENT[role];
  const greeting = ROLE_GREETING[role];
  const actions = ROLE_ACTIONS[role];

  const kpiSets: Record<PersonaRole, { label: string; value: string; icon: any; href?: string }[]> = {
    pdl: [
      { label: "Total Pipeline", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals" },
      { label: "Pending Approvals", value: String(summary?.pendingApprovals ?? "--"), icon: AlertCircle, href: "/deals" },
    ],
    sll: [
      { label: "Total Pipeline", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Deals to Review", value: String(summary?.pendingApprovals ?? "--"), icon: CheckCircle, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
    ],
    po: [
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp },
      { label: "Total Pipeline", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign },
      { label: "Rate Compliance", value: "98%", icon: ShieldCheck, href: "/admin/rate-cards" },
    ],
    fin: [
      { label: "Total Pipeline", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Pending Review", value: String(summary?.pendingApprovals ?? "--"), icon: Clock, href: "/deals" },
    ],
    qrm: [
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Pending Reviews", value: String(summary?.pendingApprovals ?? "--"), icon: AlertCircle, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp },
      { label: "Risk Flags", value: "2", icon: Shield, href: "/deals" },
    ],
    it: [
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText },
      { label: "Integrations", value: "5", icon: Network, href: "/architecture-i" },
      { label: "System Health", value: "99.9%", icon: CheckCircle, href: "/architecture-i" },
      { label: "API Endpoints", value: "12", icon: Layers, href: "/architecture" },
    ],
  };

  const kpis = kpiSets[role];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className={`rounded-2xl p-6 mb-8 border ${accent.border} ${accent.bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${accent.badge}`}>
                {persona?.fullTitle}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{greeting.title}</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">{greeting.subtitle}</p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {hasPermission("createDeals") && (
              <Link href="/deals/new">
                <button className="btn-primary">
                  <FileText className="w-4 h-4" />
                  New Deal
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => {
          const content = (
            <div className={`card p-5 transition-all ${kpi.href ? "hover:shadow-md hover:border-primary/30 cursor-pointer" : ""}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground font-medium">{kpi.label}</span>
                <kpi.icon className={`w-5 h-5 ${accent.text}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              {kpi.href && (
                <div className="flex items-center gap-1 mt-2">
                  <span className={`text-xs font-medium ${accent.text}`}>View details</span>
                  <ArrowRight className={`w-3 h-3 ${accent.text}`} />
                </div>
              )}
            </div>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>{content}</Link>
          ) : (
            <div key={kpi.label}>{content}</div>
          );
        })}
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {actions.map((action) => (
            <Link key={action.label} href={action.href}>
              <div className={`card p-5 hover:shadow-md transition-all cursor-pointer group border-l-4 ${accent.border}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.bg}`}>
                    <action.icon className={`w-5 h-5 ${accent.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {hasPermission("viewDeals") && (
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
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">No deals yet.</div>
              )}
            </div>
          </div>
        )}

        <div className={hasPermission("viewDeals") ? "" : "lg:col-span-3"}>
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
      </div>

      {summary?.statusBreakdown && summary.statusBreakdown.length > 0 && hasPermission("viewDeals") && (
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
