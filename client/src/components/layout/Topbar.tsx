import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { ChevronRight, Search, Bell, Sparkles, LogOut, Plus, Shield, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDeals } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

const ROUTE_LABELS: { match: RegExp; label: string; href?: string }[] = [
  { match: /^\/$/, label: "Dashboard", href: "/" },
  { match: /^\/deals$/, label: "Engagements", href: "/deals" },
  { match: /^\/deals\/new$/, label: "New Deal", href: "/deals/new" },
  { match: /^\/deals\/(\d+)\/renewal-leadsheet$/, label: "Renewal Leadsheet" },
  { match: /^\/deals\/(\d+)\/change-orders$/, label: "Change Orders" },
  { match: /^\/deals\/(\d+)$/, label: "Deal" },
  { match: /^\/analytics$/, label: "Analytics", href: "/analytics" },
  { match: /^\/admin\/rate-cards$/, label: "Rate Cards" },
  { match: /^\/admin\/scope-catalog$/, label: "Scope Catalog" },
  { match: /^\/admin\/prompt-sets$/, label: "Prompt Sets" },
  { match: /^\/integrations\/dynamics$/, label: "Dynamics CRM" },
  { match: /^\/integrations\/intapp$/, label: "Intapp Risk" },
  { match: /^\/integrations\/workday$/, label: "Workday" },
  { match: /^\/architecture/, label: "Architecture" },
];

const roleColor: Record<string, string> = {
  pdl: "bg-orange-500",
  sll: "bg-blue-500",
  po: "bg-emerald-500",
  fin: "bg-violet-500",
  qrm: "bg-red-500",
  it: "bg-stone-500",
};

function useBreadcrumb(pathname: string) {
  const dealMatch = pathname.match(/^\/deals\/(\d+)/);
  const dealId = dealMatch ? Number(dealMatch[1]) : null;
  const isDealsRoot = pathname === "/deals";

  const crumbs: { label: string; href?: string }[] = [];
  if (pathname === "/") {
    crumbs.push({ label: "Dashboard" });
  } else if (dealId) {
    crumbs.push({ label: "Engagements", href: "/deals" });
    crumbs.push({ label: `Deal #${dealId}`, href: `/deals/${dealId}` });
    if (/renewal-leadsheet$/.test(pathname)) crumbs.push({ label: "Renewal Leadsheet" });
    else if (/change-orders$/.test(pathname)) crumbs.push({ label: "Change Orders" });
    else if (pathname === `/deals/${dealId}/new`) crumbs.push({ label: "New" });
  } else if (isDealsRoot) {
    crumbs.push({ label: "Engagements" });
  } else {
    const found = ROUTE_LABELS.find((r) => r.match.test(pathname));
    if (pathname.startsWith("/admin/")) crumbs.push({ label: "Admin" });
    else if (pathname.startsWith("/integrations/")) crumbs.push({ label: "Integrations" });
    crumbs.push({ label: found?.label || "Page" });
  }
  return crumbs;
}

interface TopbarProps {
  onMobileNavToggle?: () => void;
}

export function Topbar({ onMobileNavToggle }: TopbarProps = {}) {
  const [location, navigate] = useLocation();
  const { persona, hasPermission, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const personaRef = useRef<HTMLDivElement>(null);

  const { data: deals } = useDeals();
  const pendingApprovals = (deals || []).filter((d: any) => d.status === "submitted").length;

  const crumbs = useBreadcrumb(location);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) setPersonaOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/deals?search=${encodeURIComponent(q)}` : "/deals");
  };

  const openAskAI = () => {
    window.dispatchEvent(new CustomEvent("dealpad:open-ask-ai"));
  };

  return (
    <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
      <div className="h-14 px-3 sm:px-6 flex items-center gap-2 sm:gap-4">
        {/* Mobile hamburger */}
        {onMobileNavToggle && (
          <button
            onClick={onMobileNavToggle}
            className="md:hidden h-9 w-9 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {/* Breadcrumb — hidden on small screens */}
        <nav className="hidden sm:flex items-center gap-1.5 text-sm min-w-0 flex-shrink-0">
          {crumbs.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {c.href && i < crumbs.length - 1 ? (
                <Link href={c.href}>
                  <span className="text-muted-foreground hover:text-foreground cursor-pointer truncate max-w-[160px]">{c.label}</span>
                </Link>
              ) : (
                <span className={cn("truncate max-w-[200px]", i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground")}>{c.label}</span>
              )}
            </div>
          ))}
        </nav>

        {/* Search */}
        <form onSubmit={submitSearch} className="flex-1 max-w-xl mx-auto min-w-0">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/40 border border-transparent focus:bg-background focus:border-input focus:ring-2 focus:ring-primary/20 text-base sm:text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
            />
          </div>
        </form>

        {/* Right cluster */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasPermission("createDeals") && (
            <Link href="/deals/new">
              <button className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">New Deal</span>
                <span className="md:hidden">New</span>
              </button>
            </Link>
          )}
          {hasPermission("createDeals") && (
            <Link href="/deals/new">
              <button
                className="sm:hidden h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center"
                aria-label="New Deal"
              >
                <Plus className="w-5 h-5" />
              </button>
            </Link>
          )}

          {hasPermission("runAI") && (
            <button
              onClick={openAskAI}
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium transition-colors"
              title="Ask DealPad AI"
            >
              <Sparkles className="w-4 h-4" />
              Ask AI
            </button>
          )}

          <Link href="/deals?status=submitted">
            <button className="relative h-9 w-9 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Pending approvals">
              <Bell className="w-4 h-4" />
              {pendingApprovals > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingApprovals > 9 ? "9+" : pendingApprovals}
                </span>
              )}
            </button>
          </Link>

          {persona && (
            <div className="relative" ref={personaRef}>
              <button
                onClick={() => setPersonaOpen((v) => !v)}
                className="flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold", roleColor[persona.role] || "bg-stone-500")}>
                  {persona.initials}
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <p className="text-xs font-semibold text-foreground truncate max-w-[140px]">{persona.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{persona.fullTitle}</p>
                </div>
              </button>

              {personaOpen && (
                <div className="absolute right-0 top-11 w-64 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold", roleColor[persona.role] || "bg-stone-500")}>
                      {persona.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{persona.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{persona.fullTitle}</p>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="w-3.5 h-3.5" />
                    Active role: <span className="font-medium text-foreground uppercase">{persona.role}</span>
                  </div>
                  <button
                    onClick={() => { setPersonaOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Switch persona
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
