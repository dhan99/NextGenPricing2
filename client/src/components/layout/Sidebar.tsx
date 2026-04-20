import { useLocation, Link } from "wouter";
import { LayoutDashboard, FileText, Settings, ChevronDown, BookOpen, DollarSign, Layers, BarChart3, Database, ShieldAlert, Briefcase, MessageSquare, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function Sidebar() {
  const [location] = useLocation();
  const { hasPermission } = useAuth();
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));

  const showDeals = hasPermission("viewDeals");

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, show: true },
    { name: "Engagements", href: "/deals", icon: FileText, show: true },
    { name: "Analytics", href: "/analytics", icon: BarChart3, show: hasPermission("viewDeals") },
    { name: "Dynamics CRM", href: "/integrations/dynamics", icon: Database, show: true, dividerBefore: true },
    { name: "Intapp Risk", href: "/integrations/intapp", icon: ShieldAlert, show: true },
    { name: "Workday", href: "/integrations/workday", icon: Briefcase, show: true },
    { name: "Architecture", href: "/architecture", icon: Layers, show: true, dividerBefore: true },
  ];

  const showAdmin = true;
  const adminNavigation = [
    { name: "Rate Cards", href: "/admin/rate-cards", icon: DollarSign, show: true },
    { name: "Scope Catalog", href: "/admin/scope-catalog", icon: BookOpen, show: true },
    { name: "Prompt Sets", href: "/admin/prompt-sets", icon: MessageSquare, show: true },
    { name: "Engagement Letters", href: "/admin/engagement-letters", icon: FileText, show: true },
    { name: "Margin Targets", href: "/admin/margin-targets", icon: Target, show: true },
  ];

  return (
    <aside className="w-64 bg-sidebar-bg h-screen sticky top-0 flex flex-col border-r border-sidebar-accent">
      <Link href="/">
        <div className="px-6 py-6 border-b border-sidebar-accent cursor-pointer flex items-center justify-center" style={{ backgroundColor: "#fef3e7" }}>
          <img src="/armanino-logo.svg" alt="Armanino" className="h-8 w-auto" />
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.filter(n => n.show).map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <div key={item.href}>
              {item.dividerBefore && (
                <div className="my-2 mx-3 border-t border-sidebar-accent" />
              )}
              <Link href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-accent"
                )}>
                  <item.icon className="w-4.5 h-4.5" />
                  {item.name}
                </div>
              </Link>
            </div>
          );
        })}

        {showAdmin && (
          <div className="pt-4">
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-accent transition-all"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4.5 h-4.5" />
                Admin
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", adminOpen && "rotate-180")} />
            </button>
            {adminOpen && (
              <div className="ml-4 mt-1 space-y-1">
                {adminNavigation.filter(n => n.show).map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-accent"
                      )}>
                        <item.icon className="w-4 h-4" />
                        {item.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-accent text-[10px] text-sidebar-muted">
        2026 Armanino LLP · DealPad PoC
      </div>
    </aside>
  );
}
