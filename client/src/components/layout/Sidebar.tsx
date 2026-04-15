import { useLocation, Link } from "wouter";
import { LayoutDashboard, FileText, Settings, ChevronDown, BookOpen, DollarSign, BarChart3, Shield, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Deals", href: "/deals", icon: FileText },
  { name: "Architecture", href: "/architecture", icon: Layers },
];

const adminNavigation = [
  { name: "Rate Cards", href: "/admin/rate-cards", icon: DollarSign },
  { name: "Scope Catalog", href: "/admin/scope-catalog", icon: BookOpen },
];

export function Sidebar() {
  const [location] = useLocation();
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));

  return (
    <aside className="w-64 bg-sidebar-bg min-h-screen flex flex-col border-r border-sidebar-accent">
      <Link href="/">
        <div className="px-6 py-5 border-b border-sidebar-accent cursor-pointer hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <div>
              <h1 className="text-sidebar-fg font-semibold text-lg tracking-tight">DealPad</h1>
              <p className="text-sidebar-muted text-xs">Pricing & Scoping</p>
            </div>
          </div>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
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
              {adminNavigation.map((item) => {
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
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-accent">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sidebar-fg text-xs font-medium">MT</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-fg text-sm font-medium truncate">Michael Torres</p>
            <p className="text-sidebar-muted text-xs truncate">Practice Dev Leader</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
