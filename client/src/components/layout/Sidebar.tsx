import { useLocation, Link } from "wouter";
import { LayoutDashboard, FileText, Settings, ChevronDown, BookOpen, DollarSign, Layers, LogOut, Shield, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function Sidebar() {
  const [location] = useLocation();
  const { persona, hasPermission, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));

  const showDeals = hasPermission("viewDeals");

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, show: true },
    { name: "Deals", href: "/deals", icon: FileText, show: true },
    { name: "Analytics", href: "/analytics", icon: BarChart3, show: hasPermission("viewDeals") },
    { name: "Architecture", href: "/architecture", icon: Layers, show: true },
  ];

  const showAdmin = true;
  const adminNavigation = [
    { name: "Rate Cards", href: "/admin/rate-cards", icon: DollarSign, show: true },
    { name: "Scope Catalog", href: "/admin/scope-catalog", icon: BookOpen, show: true },
  ];

  const roleColor: Record<string, string> = {
    pdl: "bg-orange-500",
    sll: "bg-blue-500",
    po: "bg-emerald-500",
    fin: "bg-violet-500",
    qrm: "bg-red-500",
    it: "bg-stone-500",
  };

  return (
    <aside className="w-64 bg-sidebar-bg min-h-screen flex flex-col border-r border-sidebar-accent">
      <Link href="/">
        <div className="px-6 py-6 border-b border-sidebar-accent cursor-pointer flex items-center justify-center" style={{ backgroundColor: "#fef3e7" }}>
          <img src="/armanino-logo.svg" alt="Armanino" className="h-8 w-auto" />
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.filter(n => n.show).map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
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

      {persona && (
        <div className="px-3 py-3 border-t border-sidebar-accent">
          <div className="flex items-center gap-2 mb-2 px-2">
            <Shield className="w-3.5 h-3.5 text-sidebar-muted" />
            <span className="text-[10px] uppercase tracking-wider text-sidebar-muted font-semibold">Active Role</span>
          </div>
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className={`w-9 h-9 rounded-full ${roleColor[persona.role] || "bg-stone-500"} flex items-center justify-center`}>
              <span className="text-white text-xs font-bold">{persona.initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-fg text-sm font-medium truncate">{persona.name}</p>
              <p className="text-sidebar-muted text-xs truncate">{persona.fullTitle}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-sidebar-muted hover:text-red-400 hover:bg-sidebar-accent transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Switch Persona
          </button>
        </div>
      )}
    </aside>
  );
}
