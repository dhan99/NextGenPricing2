import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/themes/theme-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { GlobalSearch } from "./GlobalSearch";
import { CommandPalette } from "./CommandPalette";
import {
  LayoutDashboard, GitPullRequest, Library, Users, RefreshCw, MessageSquareText,
  FileStack, Sparkles, Shield, Bell, Plus, LogOut, Menu, X,
  Home, CreditCard, ShieldCheck, PanelLeftClose, PanelLeft,
  Sun, Moon, Monitor, Command, ChevronRight
} from "lucide-react";
import type { PersonaMode } from "@/themes/theme-config";

const SIDEBAR_COLLAPSED_KEY = "v2-sidebar-collapsed";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { role, logout, user } = useAuth();
  const { theme, persona, setPersona } = useTheme();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"; } catch { return false; }
  });
  const isMobile = useIsMobile();
  const { mode: themeMode, setMode: setThemeMode } = useDarkMode();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (role && persona !== role) setPersona(role as PersonaMode);
  }, [role]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const agentLinks = [
    { href: "/agent/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/agent/bonds", label: "Applications", icon: GitPullRequest },
    { href: "/agent/clients", label: "Clients", icon: Users },
    { href: "/agent/bond-form-library", label: "Bond Library", icon: Library },
    { href: "/agent/renewals", label: "Renewals", icon: RefreshCw },
    { href: "/agent/underwriting", label: "Referrals", icon: Shield },
    { href: "/agent/conversations", label: "AI Chats", icon: MessageSquareText },
  ];

  const principalLinks = [
    { href: "/principal/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/principal/payments", label: "Payments", icon: CreditCard },
    { href: "/chat", label: "BondAssist AI", icon: Sparkles },
  ];

  const underwriterLinks = [
    { href: "/underwriter/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/underwriter/review", label: "Review Queue", icon: ShieldCheck },
    { href: "/underwriter/bonds", label: "All Bonds", icon: GitPullRequest },
    { href: "/underwriter/bond-wizard", label: "New Application", icon: Plus },
  ];

  const navLinks = persona === "agent" ? agentLinks : persona === "underwriter" ? underwriterLinks : principalLinks;
  const isActive = (href: string) => location === href || (href !== "/" && location.startsWith(href + "/"));
  const roleLabels: Record<string, string> = { agent: "Agent", principal: "Principal", underwriter: "Underwriter" };
  const userName = user?.displayName || roleLabels[persona] || "User";
  const userInitials = userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const currentUser = { initials: userInitials, name: userName, label: roleLabels[persona] || "User" };

  const ctaHref = persona === "agent" ? "/agent/bond-wizard" : persona === "underwriter" ? "/underwriter/bond-wizard" : "/principal/new-bond";
  const ctaLabel = persona === "agent" ? "New Application" : persona === "underwriter" ? "New Application" : "Apply for Bond";
  const ctaIcon = <Plus className="h-4 w-4" />;

  const sidebarWidth = collapsed && !isMobile ? "var(--sidebar-collapsed-w)" : "var(--sidebar-w)";

  const breadcrumbParts = location.split("/").filter(Boolean);
  const breadcrumbs = breadcrumbParts.map((part, i) => ({
    label: part.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    href: "/" + breadcrumbParts.slice(0, i + 1).join("/"),
  }));

  const mobilePageTitle = (() => {
    const activeLink = navLinks.find(l => isActive(l.href));
    if (activeLink) return activeLink.label;
    const lastPart = location.split("/").filter(Boolean).pop() || "Dashboard";
    return lastPart.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  })();

  const mobilePageSubtitle = (() => {
    const subtitleMap: Record<string, string> = {
      "/agent/dashboard": "Here's what needs your attention today",
      "/agent/bonds": "Track and manage every bond application.",
      "/agent/clients": "Manage your client accounts",
      "/agent/bond-form-library": "Browse available bond forms",
      "/agent/renewals": "Manage bonds approaching expiration and initiate renewals.",
      "/agent/underwriting": "Review referred applications and make underwriting decisions.",
      "/agent/conversations": "Monitor live and completed AI-driven applications.",
      "/agent/bond-wizard": "Create a new bond application",
      "/principal/dashboard": "Your bond portfolio overview",
      "/principal/payments": "View and pay outstanding bond premiums",
      "/principal/new-bond": "Complete this simple form to get your bond processed instantly.",
      "/chat": "AI-powered bond assistance",
      "/underwriter/dashboard": "Review referrals, assess risk, and manage bond decisions.",
      "/underwriter/review": "Review referred and submitted applications.",
      "/underwriter/bonds": "Complete view of all bond applications across all agents and principals.",
      "/underwriter/bond-wizard": "Create a new bond application",
    };
    return subtitleMap[location] || null;
  })();

  const themeIcons = { light: Sun, dark: Moon, system: Monitor };
  const nextTheme = (): "light" | "dark" | "system" => {
    if (themeMode === "light") return "dark";
    if (themeMode === "dark") return "system";
    return "light";
  };
  const ThemeIcon = themeIcons[themeMode];

  return (
    <div className="flex h-screen bg-[var(--bg)] transition-colors duration-300 overflow-hidden max-w-[100vw]">
      <CommandPalette />

      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen z-50 flex flex-col border-r border-[var(--border-color)]
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        `}
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--card)',
          backgroundImage: `linear-gradient(180deg, color-mix(in srgb, var(--accent) 3%, var(--card)) 0%, var(--card) 60%)`,
        }}
      >
        <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-5'} py-4 border-b border-[var(--border-color)]`}>
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt="Surety Demo App"
            className={`shrink-0 dark:brightness-0 dark:invert transition-all duration-300 ${collapsed && !isMobile ? 'h-8 w-auto' : 'h-10 w-auto'}`}
          />
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1 bg-transparent border-none cursor-pointer">
              <X className="h-5 w-5 text-[var(--slate-400)]" />
            </button>
          )}
        </div>

        <nav className={`flex-1 ${collapsed && !isMobile ? 'px-2' : 'px-[10px]'} py-1.5 mt-2 overflow-y-auto`}>
          {(!collapsed || isMobile) && (
            <div className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)] px-[10px] pt-3 pb-1 animate-fadeIn">
              {currentUser.label}
            </div>
          )}
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href + label}
                href={href}
                title={collapsed && !isMobile ? label : undefined}
                className={`
                  relative flex items-center ${collapsed && !isMobile ? 'justify-center' : 'gap-[10px]'} py-[9px] px-[10px] rounded-[var(--r)] text-[13.5px] font-medium
                  cursor-pointer transition-all duration-200 no-underline group
                  ${active
                    ? "bg-[var(--accent-50)] text-[var(--accent)] font-semibold"
                    : "text-[var(--text-muted)] hover:bg-[var(--slate-100)] hover:text-[var(--slate-900)]"
                  }
                `}
              >
                {active && (
                  <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] gradient-accent rounded-full" />
                )}
                <Icon className={`h-[17px] w-[17px] shrink-0 transition-transform duration-200 ${active ? 'opacity-100' : 'opacity-60'} group-hover:scale-110`} />
                {(!collapsed || isMobile) && <span className="animate-fadeIn">{label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={`${collapsed && !isMobile ? 'px-2' : 'px-[10px]'} py-3.5 border-t border-[var(--border-color)] space-y-2`}>
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-[var(--r)] text-[12px] text-[var(--text-muted)] hover:bg-[var(--slate-100)] hover:text-[var(--slate-900)] transition-all cursor-pointer border-none bg-transparent"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!collapsed && <span className="font-medium">Collapse</span>}
            </button>
          )}

          {collapsed && !isMobile ? (
            <Link
              href={ctaHref}
              className="w-full h-10 flex items-center justify-center rounded-[var(--r)] text-white cursor-pointer transition-all hover:opacity-90 no-underline gradient-accent"
              title={ctaLabel}
            >
              {ctaIcon}
            </Link>
          ) : (
            <Link
              href={ctaHref}
              className="w-full py-[10px] flex items-center justify-center gap-[7px] rounded-[var(--r)] text-[13.5px] font-bold text-white cursor-pointer transition-all hover:opacity-90 hover:shadow-lg no-underline gradient-accent"
            >
              {ctaIcon}
              {ctaLabel}
            </Link>
          )}

          {isMobile && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-[9px] px-[8px] py-[9px] rounded-[var(--r)] text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--slate-100)] hover:text-[var(--slate-900)] transition-all cursor-pointer border-none bg-transparent"
            >
              <Users className="h-[17px] w-[17px] opacity-60" />
              Switch Account
            </button>
          )}

          <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center' : 'gap-[9px] px-[8px]'} pt-1`}>
            <div
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 gradient-accent"
            >
              {currentUser.initials}
            </div>
            {(!collapsed || isMobile) && (
              <div className="flex-1 min-w-0 animate-fadeIn">
                <div className="text-[12.5px] font-semibold text-[var(--slate-800)] truncate">
                  {currentUser.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {currentUser.label}
                </div>
              </div>
            )}
            {(!collapsed || isMobile) && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--s-red)] hover:bg-[var(--s-red-bg)] transition-colors cursor-pointer border-none bg-transparent"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full min-w-0 transition-all duration-300 overflow-hidden" style={{ marginLeft: isMobile ? 0 : sidebarWidth }}>
        <header className="bg-[var(--card)] border-b border-[var(--border-color)] px-4 sm:px-7 h-14 flex items-center gap-3 sticky top-0 z-40 transition-colors duration-300">
          {isMobile && (
            <>
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 rounded-[var(--r)] hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent"
              >
                <Menu className="h-5 w-5 text-[var(--text-muted)]" />
              </button>
              {!sidebarOpen && (
                <div className="flex items-center gap-2 animate-fadeIn min-w-0">
                  <img
                    src={`${import.meta.env.BASE_URL}logo.svg`}
                    alt="Surety Demo App"
                    className="h-6 w-auto shrink-0 dark:brightness-0 dark:invert"
                  />
                  <div className="min-w-0">
                    <span className="text-[14px] font-bold text-[var(--slate-900)] truncate block leading-tight">
                      {mobilePageTitle}
                    </span>
                    {mobilePageSubtitle && (
                      <span className="text-[10px] text-[var(--text-muted)] truncate block leading-tight">
                        {mobilePageSubtitle}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {!isMobile && breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
              {breadcrumbs.map((bc, i) => (
                <span key={bc.href} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="font-semibold text-[var(--slate-900)]">{bc.label}</span>
                  ) : (
                    <Link href={bc.href} className="hover:text-[var(--accent)] transition-colors no-underline text-[var(--text-muted)]">{bc.label}</Link>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={() => setThemeMode(nextTheme())}
            className="w-[34px] h-[34px] border border-[var(--border-color)] rounded-[var(--r)] bg-transparent flex items-center justify-center text-[var(--text-muted)] cursor-pointer transition-all hover:border-[var(--slate-300)] hover:bg-[var(--slate-100)]"
            title={`Theme: ${themeMode}`}
          >
            <ThemeIcon className="h-[14px] w-[14px]" />
          </button>

          <button
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
              window.dispatchEvent(event);
            }}
            className="hidden sm:flex items-center gap-1.5 h-[34px] px-3 border border-[var(--border-color)] rounded-[var(--r)] bg-transparent text-[var(--text-muted)] cursor-pointer transition-all hover:border-[var(--slate-300)] hover:bg-[var(--slate-100)] text-[12px]"
          >
            <Command className="h-3 w-3" />
            <span>K</span>
          </button>

          <button className="w-[34px] h-[34px] border border-[var(--border-color)] rounded-[var(--r)] bg-transparent flex items-center justify-center text-[var(--text-muted)] cursor-pointer transition-all hover:border-[var(--slate-300)] hover:bg-[var(--slate-100)]">
            <Bell className="h-[14px] w-[14px]" />
          </button>

          <Link
            href={ctaHref}
            className="hidden sm:flex items-center gap-1.5 py-[7px] px-4 rounded-[var(--r)] text-[13px] font-semibold text-white cursor-pointer transition-all hover:opacity-90 hover:shadow-lg no-underline gradient-accent"
          >
            <Plus className="h-[13px] w-[13px]" /> {ctaLabel}
          </Link>
        </header>

        <main className={`flex-1 p-4 sm:p-7 overflow-y-auto overflow-x-hidden ${isMobile ? 'pb-24' : ''}`}>
          <div className={isMobile ? '' : 'animate-fadeUp'}>
            {children}
          </div>
        </main>
      </div>

      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 glass z-50 pb-[env(safe-area-inset-bottom,6px)] pt-1.5 border-t border-[var(--border-color)]">
          <div className="flex justify-around items-center">
            {(persona === "agent"
              ? [
                  { href: "/agent/dashboard", label: "Dashboard", icon: Home },
                  { href: "/agent/bonds", label: "Applications", icon: GitPullRequest },
                  { href: "/agent/bond-form-library", label: "Library", icon: Library },
                  { href: "/agent/renewals", label: "Renewals", icon: RefreshCw },
                ]
              : persona === "underwriter"
              ? [
                  { href: "/underwriter/dashboard", label: "Dashboard", icon: Home },
                  { href: "/underwriter/review", label: "Review", icon: ShieldCheck },
                  { href: "/underwriter/bonds", label: "All Bonds", icon: GitPullRequest },
                  { href: "/underwriter/bond-wizard", label: "New", icon: Plus },
                ]
              : [
                  { href: "/principal/dashboard", label: "Dashboard", icon: Home },
                  { href: "/principal/dashboard", label: "Bonds", icon: FileStack },
                  { href: "/chat", label: "AI Chat", icon: Sparkles },
                ]
            ).map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href + label}
                  href={href}
                  className={`flex flex-col items-center gap-[3px] py-1 px-3 text-[9.5px] font-semibold uppercase tracking-[.04em] transition-colors no-underline ${
                    active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <Icon className="h-[21px] w-[21px]" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
