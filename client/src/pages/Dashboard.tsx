import { useState, useMemo, useEffect } from "react";
import { useDashboardSummary, useDeals, useWorkdayDashboard } from "@/hooks/use-api";
import { formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { TrendingUp, DollarSign, AlertCircle, ArrowRight, FileText, ShieldCheck, Layers, Network, BarChart3, Shield, CheckCircle, Search, Sparkles, Lightbulb, RefreshCw, Briefcase, Settings2, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useAuth, type PersonaRole } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { AskDealPadAI } from "@/components/AskDealPadAI";

const ROLE_ACCENT: Record<PersonaRole, { bg: string; border: string; text: string; badge: string }> = {
  pdl: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  sll: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  po: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  fin: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  qrm: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  it: { bg: "bg-stone-50", border: "border-stone-200", text: "text-stone-700", badge: "bg-stone-100 text-stone-700" },
};

const ROLE_GREETING: Record<PersonaRole, { title: string; subtitle: string }> = {
  pdl: { title: "Deal Command Center", subtitle: "Create, scope, price, and submit deals. Your AI-powered workspace for winning engagements." },
  sll: { title: "Pipeline Overview", subtitle: "Review deals awaiting your approval and monitor service line performance." },
  po: { title: "Pricing Governance", subtitle: "Manage rate cards, scope catalogs, and ensure pricing standards across all deals." },
  fin: { title: "Financial Analytics", subtitle: "Validate margins, review scenarios, and monitor deal profitability metrics." },
  qrm: { title: "Risk & Compliance", subtitle: "Oversee deal risk profiles, review AI risk summaries, and monitor compliance." },
  it: { title: "System Overview", subtitle: "View architecture, integration points, and technical infrastructure status." },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

interface Insight { type: string; title: string; body: string; cta?: string; href?: string }

function InsightCard({ insight }: { insight: Insight }) {
  const styles: Record<string, { icon: any; bg: string; border: string; iconColor: string; pill: string }> = {
    suggestion: { icon: Sparkles, bg: "bg-emerald-50", border: "border-emerald-200", iconColor: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
    alert:      { icon: AlertCircle, bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-600", pill: "bg-amber-100 text-amber-700" },
    info:       { icon: Lightbulb, bg: "bg-blue-50", border: "border-blue-200", iconColor: "text-blue-600", pill: "bg-blue-100 text-blue-700" },
  };
  const s = styles[insight.type] || styles.info;
  const Icon = s.icon;
  return (
    <div className={`rounded-xl border p-3 ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${s.iconColor}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${s.pill}`}>{insight.title}</span>
      </div>
      <p className="text-xs text-foreground leading-relaxed">{insight.body}</p>
      {insight.cta && insight.href && (
        <Link href={insight.href}>
          <span className={`text-xs font-medium ${s.iconColor} inline-flex items-center gap-1 mt-2 hover:underline cursor-pointer`}>
            {insight.cta} <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </div>
  );
}

export function Dashboard() {
  const { data: summary } = useDashboardSummary();
  const { data: deals } = useDeals();
  const { hasPermission, persona } = useAuth();

  const role = (persona?.role || "pdl") as PersonaRole;
  const accent = ROLE_ACCENT[role];
  const greeting = ROLE_GREETING[role];

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  type SortKey = "client" | "serviceLine" | "status" | "margin" | "totalFee" | "dealNumber";
  type SortDir = "asc" | "desc";
  const [sortBy, setSortBy] = useState<SortKey>("totalFee");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "client" || key === "serviceLine" || key === "status" || key === "dealNumber" ? "asc" : "desc");
    }
  };

  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    const term = searchTerm.trim().toLowerCase();
    const list = deals.filter((d: any) => {
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      const haystack = `${d.title || ""} ${d.dealNumber || ""} ${d.client?.name || ""} ${d.serviceLine || ""}`.toLowerCase();
      const matchSearch = !term || haystack.includes(term);
      return matchStatus && matchSearch;
    });
    const accessor = (d: any): string | number => {
      switch (sortBy) {
        case "client": return (d.client?.name || d.title || "").toLowerCase();
        case "serviceLine": return (d.serviceLine || "").toLowerCase();
        case "status": return d.status || "";
        case "margin": return parseFloat(d.marginPercent || "0");
        case "totalFee": return parseFloat(d.totalFee || "0");
        case "dealNumber": return d.dealNumber || "";
      }
    };
    const sorted = [...list].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [deals, searchTerm, statusFilter, sortBy, sortDir]);

  // Intapp Risk dashboard data (QRM cockpit tile)
  const { data: intappDash } = useQuery<any>({
    queryKey: ["intapp-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/intapp/dashboard", {
        headers: {
          "x-user-name": persona?.name || "",
          "x-user-role": persona?.role || "",
        },
      });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: role === "qrm",
    refetchInterval: 30000,
  });

  // AI Insights
  const { data: insightsData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<{ capability: string; insights: Insight[] }>({
    queryKey: ["dashboard-insights", role],
    queryFn: async () => {
      const r = await fetch(`/api/ai/dashboard-insights?role=${role}`);
      return r.json();
    },
  });

  const askIntro = `Hi ${persona?.name.split(" ")[0] || "there"}! I can answer questions within your ${persona?.fullTitle || "role"} capability. Try asking about pipeline, margins, or approvals.`;

  const kpiSets: Record<PersonaRole, { label: string; value: string; icon: any; href?: string; valueClass?: string }[]> = {
    pdl: [
      { label: "Pipeline Value", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals", valueClass: "text-emerald-600" },
      { label: "Pending Approvals", value: String(summary?.pendingApprovals ?? "--"), icon: AlertCircle, href: "/deals?status=submitted", valueClass: "text-primary" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
    ],
    sll: [
      { label: "Pipeline Value", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Deals to Review", value: String(summary?.pendingApprovals ?? "--"), icon: CheckCircle, href: "/deals?status=submitted", valueClass: "text-primary" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals", valueClass: "text-emerald-600" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
    ],
    po: [
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, valueClass: "text-emerald-600" },
      { label: "Pipeline Value", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign },
      { label: "Rate Compliance", value: "98%", icon: ShieldCheck, href: "/admin/rate-cards" },
    ],
    fin: [
      { label: "Pipeline Value", value: summary ? formatCurrency(summary.totalPipeline) : "--", icon: DollarSign, href: "/deals" },
      { label: "Avg Margin", value: summary ? `${summary.averageMargin}%` : "--", icon: TrendingUp, href: "/deals", valueClass: "text-emerald-600" },
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText, href: "/deals" },
      { label: "Pending Review", value: String(summary?.pendingApprovals ?? "--"), icon: AlertCircle, href: "/deals?status=submitted" },
    ],
    qrm: [
      { label: "Active Conflicts", value: String(intappDash?.summary?.conflictCount ?? "--"), icon: Shield, href: "/integrations/intapp", valueClass: "text-red-600" },
      { label: "Reviews", value: String(intappDash?.summary?.reviewCount ?? "--"), icon: AlertCircle, href: "/integrations/intapp", valueClass: "text-amber-600" },
      { label: "Open Mitigations", value: String(intappDash?.summary?.openMitigations ?? "--"), icon: ShieldCheck, href: "/integrations/intapp" },
      { label: "Pending Reviews", value: String(summary?.pendingApprovals ?? "--"), icon: FileText, href: "/deals?status=submitted" },
    ],
    it: [
      { label: "Active Deals", value: String(summary?.totalDeals ?? "--"), icon: FileText },
      { label: "Integrations", value: "5", icon: Network },
      { label: "System Health", value: "99.9%", icon: CheckCircle, valueClass: "text-emerald-600" },
      { label: "API Endpoints", value: "12", icon: Layers },
    ],
  };

  const kpis = kpiSets[role];
  const showWorkday = role === "fin" || role === "sll" || role === "po" || role === "pdl";
  const showIntapp = role === "qrm";
  const hasOpsTab = showWorkday || showIntapp;

  type TabKey = "pipeline" | "ai" | "ops";
  const visibleTabs = useMemo(() => {
    const all: { key: TabKey; label: string; icon: any; visible: boolean }[] = [
      { key: "pipeline", label: "Pipeline", icon: Briefcase, visible: hasPermission("viewDeals") },
      { key: "ai", label: "AI Assistant", icon: Sparkles, visible: hasPermission("runAI") },
      { key: "ops", label: "Operations", icon: Settings2, visible: hasOpsTab },
    ];
    return all.filter((t) => t.visible);
  }, [hasPermission, hasOpsTab]);
  const visibleKeys = useMemo(() => visibleTabs.map((t) => t.key).join(","), [visibleTabs]);
  const [activeTab, setActiveTab] = useState<TabKey>(visibleTabs[0]?.key || "ai");
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab) && visibleTabs[0]) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleKeys, activeTab, visibleTabs]);

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto">
      {/* Hero: hidden on mobile to save vertical space — Topbar already shows persona context */}
      <div className="hidden sm:flex items-center justify-between mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${accent.badge}`}>
              {persona?.fullTitle}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{greeting.title}</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{greeting.subtitle}</p>
        </div>
      </div>

      {/* Mobile-only compact header — single row. The Topbar already provides search and a "+" New Deal button. */}
      <div className="sm:hidden sticky top-0 z-20 bg-background -mx-3 px-3 pt-2.5 pb-2 -mt-3 mb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[15px] font-bold text-foreground tracking-tight truncate">{greeting.title}</h1>
          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${accent.badge}`}>
            {persona?.role?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* KPIs: mobile compact 2-col grid · desktop 4-col grid */}
      <div className="sm:hidden grid grid-cols-2 gap-2 mb-3">
        {kpis.map((kpi) => {
          const content = (
            <div className="card p-2.5 flex flex-col">
              <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                <kpi.icon className={`w-3 h-3 shrink-0 ${accent.text}`} />
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
              </div>
              <p className={`text-base font-bold leading-tight truncate ${kpi.valueClass || "text-foreground"}`}>{kpi.value}</p>
            </div>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>{content}</Link>
          ) : (
            <div key={kpi.label}>{content}</div>
          );
        })}
      </div>

      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => {
          const content = (
            <div className={`card p-5 h-full flex flex-col transition-all ${kpi.href ? "hover:shadow-md hover:border-primary/30 cursor-pointer" : ""}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
                <kpi.icon className={`w-4 h-4 shrink-0 ${accent.text}`} />
              </div>
              <p className={`text-2xl font-bold leading-tight ${kpi.valueClass || "text-foreground"}`}>{kpi.value}</p>
            </div>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>{content}</Link>
          ) : (
            <div key={kpi.label}>{content}</div>
          );
        })}
      </div>

      {/* Tab bar */}
      {visibleTabs.length > 1 && (
        <div role="tablist" aria-label="Dashboard sections" className="border-b border-border mb-5 flex items-center gap-1 overflow-x-auto">
          {visibleTabs.map((t, idx) => {
            const Icon = t.icon;
            const isActive = t.key === activeTab;
            return (
              <button
                key={t.key}
                id={`dash-tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`dash-panel-${t.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(t.key)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const dir = e.key === "ArrowRight" ? 1 : -1;
                    const nextIdx = (idx + dir + visibleTabs.length) % visibleTabs.length;
                    setActiveTab(visibleTabs[nextIdx].key);
                    document.getElementById(`dash-tab-${visibleTabs[nextIdx].key}`)?.focus();
                  }
                }}
                className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-t-md ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* OPERATIONS TAB */}
      {activeTab === "ops" && (
        <div role="tabpanel" id="dash-panel-ops" aria-labelledby="dash-tab-ops">
          {showWorkday && <WorkdaySurface />}
          {showIntapp && !intappDash && (
            <div className="card p-8 text-center text-sm text-muted-foreground mb-6">Loading Intapp risk data…</div>
          )}
          {showIntapp && intappDash && (
        <div className="card mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-semibold text-foreground">Intapp Risk &amp; Compliance</h2>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{intappDash.mode === "live" ? "LIVE" : "Pilot · Simulated"}</span>
            </div>
            <Link href="/integrations/intapp" className="text-xs text-primary hover:underline flex items-center gap-1">
              Open cockpit <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Open Conflicts</h3>
              {(intappDash.openConflicts || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active conflicts. All screened deals are clear or mitigated.</p>
              ) : (
                <ul className="space-y-2">
                  {intappDash.openConflicts.slice(0, 5).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                      <Link href={`/deals/${c.dealId}`} className="hover:underline">
                        <div className="font-medium text-foreground">{c.dealNumber} · {c.clientName}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-md">{c.narrative}</div>
                      </Link>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{c.riskTier}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Activity</h3>
              {(intappDash.recentEvents || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No screening events yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {intappDash.recentEvents.slice(0, 6).map((e: any) => (
                    <li key={e.id} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted">{e.eventType}</span>
                      <span className="flex-1 truncate">{e.actor || "system"} · {new Date(e.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
          )}
        </div>
      )}
      {/* PIPELINE TAB */}
      {activeTab === "pipeline" && hasPermission("viewDeals") && (
        <div role="tabpanel" id="dash-panel-pipeline" aria-labelledby="dash-tab-pipeline" className="card mb-6">
            {/* Desktop / tablet: search + status dropdown */}
            <div className="hidden sm:flex px-5 py-3 border-b border-border items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px] relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search deals..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-sm py-2 pl-3 pr-8 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mobile: compact pill chips. Search lives in the topbar. */}
            <div className="sm:hidden px-2 py-2 border-b border-border">
              {searchTerm && (
                <div className="flex items-center gap-1.5 mb-2 px-1 text-[11px] text-muted-foreground">
                  <Search className="w-3 h-3" />
                  <span className="truncate">Filtering by "{searchTerm}"</span>
                  <button onClick={() => setSearchTerm("")} className="ml-auto text-primary font-medium">Clear</button>
                </div>
              )}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setStatusFilter(o.value)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      statusFilter === o.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div role="grid" aria-label="Deals" className="max-h-[640px] overflow-y-auto">
              {/* Desktop sortable column headers — sticky inside scroll container */}
              <div
                role="row"
                className="hidden sm:grid sticky top-0 z-10 px-5 py-2 border-b border-border bg-muted/40 backdrop-blur text-[10px] font-semibold uppercase tracking-wider text-muted-foreground gap-3"
                style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1fr) minmax(0,1fr)" }}
              >
                {([
                  { key: "client" as const, label: "Client / Title", align: "left" as const },
                  { key: "serviceLine" as const, label: "Service Line", align: "left" as const },
                  { key: "status" as const, label: "Status", align: "left" as const },
                  { key: "margin" as const, label: "Margin", align: "right" as const },
                  { key: "totalFee" as const, label: "Total Fee", align: "right" as const },
                  { key: "dealNumber" as const, label: "Deal #", align: "right" as const },
                ]).map((col) => {
                  const active = sortBy === col.key;
                  const Arrow = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <div
                      key={col.key}
                      role="columnheader"
                      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                      className={col.align === "right" ? "text-right" : "text-left"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        aria-label={`Sort by ${col.label}${active ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
                        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                          col.align === "right" ? "flex-row-reverse" : ""
                        } ${active ? "text-foreground" : ""}`}
                      >
                        <span className="truncate">{col.label}</span>
                        <Arrow className={`w-3 h-3 flex-shrink-0 ${active ? "text-primary" : "text-stone-400"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="divide-y divide-border">
              {filteredDeals.map((deal: any) => {
                const isExpanded = expandedDealId === deal.id;
                const marginNum = parseFloat(deal.marginPercent || "0");
                return (
                  <div key={deal.id}>
                    {/* Desktop: full row, click to navigate. Grid columns mirror the header. */}
                    <Link href={`/deals/${deal.id}`}>
                      <div
                        role="row"
                        className="hidden sm:grid items-center px-5 py-3 gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                        style={{ gridTemplateColumns: "minmax(0,2.4fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1fr) minmax(0,1fr)" }}
                      >
                        {/* Client / Title */}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{deal.client?.name || deal.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {deal.dealType || "New"} • {deal.title}
                          </p>
                        </div>
                        {/* Service Line */}
                        <div className="min-w-0 text-xs text-foreground truncate">{deal.serviceLine || "—"}</div>
                        {/* Status */}
                        <div className="min-w-0">
                          <span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span>
                        </div>
                        {/* Margin */}
                        <div className="min-w-0 text-right">
                          {marginNum > 0 ? (
                            <span className={`badge ${marginNum < 25 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {formatPercent(deal.marginPercent)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                        {/* Total Fee */}
                        <div className="min-w-0 text-right font-semibold text-foreground text-sm whitespace-nowrap">
                          {formatCurrency(deal.totalFee || 0)}
                        </div>
                        {/* Deal # */}
                        <div className="min-w-0 text-right text-xs text-muted-foreground truncate">{deal.dealNumber}</div>
                      </div>
                    </Link>

                    {/* Mobile: expandable card — priority info visible, rest collapses */}
                    <div className="sm:hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedDealId(isExpanded ? null : deal.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`deal-expand-${deal.id}`}
                        className="w-full text-left px-3 py-3 hover:bg-muted/50 active:bg-muted/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground text-[13px] truncate">{deal.client?.name || deal.title}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className={`badge ${getStatusColor(deal.status)}`}>{getStatusLabel(deal.status)}</span>
                              {marginNum > 0 && (
                                <span className={`badge ${marginNum < 25 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {formatPercent(deal.marginPercent)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5 shrink-0">
                            <div className="text-right">
                              <p className="font-semibold text-foreground text-[13px] whitespace-nowrap">{formatCurrency(deal.totalFee || 0)}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{deal.dealNumber}</p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div id={`deal-expand-${deal.id}`} className="px-3 pb-3 pt-1 bg-muted/20 border-t border-border/60">
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                            <div>
                              <dt className="text-muted-foreground uppercase tracking-wider">Service Line</dt>
                              <dd className="text-foreground font-medium mt-0.5 truncate">{deal.serviceLine || "—"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground uppercase tracking-wider">Deal Type</dt>
                              <dd className="text-foreground font-medium mt-0.5 truncate">{deal.dealType || "New"}</dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-muted-foreground uppercase tracking-wider">Title</dt>
                              <dd className="text-foreground font-medium mt-0.5">{deal.title}</dd>
                            </div>
                            {deal.totalHours && parseFloat(deal.totalHours) > 0 && (
                              <div>
                                <dt className="text-muted-foreground uppercase tracking-wider">Hours</dt>
                                <dd className="text-foreground font-medium mt-0.5">{parseFloat(deal.totalHours).toLocaleString()}</dd>
                              </div>
                            )}
                            {deal.pdlName && (
                              <div>
                                <dt className="text-muted-foreground uppercase tracking-wider">PDL</dt>
                                <dd className="text-foreground font-medium mt-0.5 truncate">{deal.pdlName}</dd>
                              </div>
                            )}
                          </dl>
                          <Link href={`/deals/${deal.id}`}>
                            <button className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all">
                              Open deal <ArrowRight className="w-3 h-3" />
                            </button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredDeals.length === 0 && (
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                  {searchTerm || statusFilter !== "all" ? "No deals match your filters." : "No deals yet."}
                </div>
              )}
              </div>
            </div>
        </div>
      )}

      {activeTab === "pipeline" && summary?.statusBreakdown && summary.statusBreakdown.length > 0 && hasPermission("viewDeals") && (
        <div className="card p-3 sm:p-6 mb-6">
          <h2 className="font-semibold text-foreground text-sm sm:text-base mb-3 sm:mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Pipeline by Status
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {summary.statusBreakdown.map((s: any) => (
              <div key={s.status} className="flex-1 min-w-0">
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

      {/* AI ASSISTANT TAB */}
      {activeTab === "ai" && (
        <div role="tabpanel" id="dash-panel-ai" aria-labelledby="dash-tab-ai" className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
          <div className="card">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-primary" />
                AI Insights
              </h2>
              <button
                onClick={() => refetchInsights()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${insightsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {insightsLoading && (
                <div className="text-xs text-muted-foreground text-center py-6">Loading insights...</div>
              )}
              {insightsData?.insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          </div>

          {hasPermission("runAI") && (
            <AskDealPadAI
              inline
              intro={askIntro}
              context={{ screen: "dashboard", screenLabel: greeting.title }}
            />
          )}
        </div>
      )}

      {activeTab === "ops" && !showWorkday && !showIntapp && (
        <div className="card p-12 text-center text-muted-foreground text-sm">
          No operations surfaces available for this role.
        </div>
      )}
    </div>
  );
}

function WorkdaySurface() {
  const { data } = useWorkdayDashboard();
  if (!data) return null;
  const c = data.counts || {};
  const items: Array<[string, number, string]> = [
    ["Clean", c.clean || 0, "bg-emerald-100 text-emerald-700"],
    ["Over Budget", c.over_budget || 0, "bg-red-100 text-red-700"],
    ["Staffing Short", c.staffing_shortfall || 0, "bg-red-100 text-red-700"],
    ["Rate Variance", c.rate_variance || 0, "bg-amber-100 text-amber-700"],
    ["Unvalidated", c.unvalidated || 0, "bg-stone-100 text-stone-600"],
  ];
  return (
    <div className="card mb-6 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-amber-50/40">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">Workday Validation Status</h2>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Pilot · Simulation</span>
        </div>
        <Link href="/integrations/workday">
          <span className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline cursor-pointer">
            Open Workday <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
        {items.map(([label, n, cls]) => (
          <div key={label} className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 inline-block text-lg font-bold px-3 py-0.5 rounded-md ${cls}`}>{n}</p>
          </div>
        ))}
      </div>
      {data.attention?.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 py-2 bg-stone-50 border-b border-border">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Deals Needing Attention</p>
          </div>
          <div className="divide-y divide-border max-h-56 overflow-y-auto">
            {data.attention.slice(0, 5).map((a: any) => (
              <Link key={a.dealId} href={`/deals/${a.dealId}`}>
                <div className="px-5 py-2.5 hover:bg-stone-50 cursor-pointer flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.dealNumber} · {a.summary}</p>
                  </div>
                  <span className={`badge whitespace-nowrap ${
                    a.status === "over_budget" || a.status === "staffing_shortfall" ? "bg-red-100 text-red-700"
                    : a.status === "rate_variance" ? "bg-amber-100 text-amber-700"
                    : "bg-stone-100 text-stone-600"}`}>
                    {a.overridden ? "Overridden · " : ""}{a.status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
