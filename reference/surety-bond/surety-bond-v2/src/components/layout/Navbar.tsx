import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Bell, Menu, MessageSquareText, LayoutDashboard, GitPullRequest, Sparkles, FileStack, X, ShieldCheck, Library, Users, Shield, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/themes/theme-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function Navbar() {
  const { role, logout } = useAuth();
  const { theme } = useTheme();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const navLinks = role === "agent"
    ? [
        { href: "/agent/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/agent/clients", label: "Clients", icon: Users },
        { href: "/agent/bond-form-library", label: "Bond Form Library", icon: Library },
        { href: "/agent/bonds", label: "Pipeline", icon: GitPullRequest },
        { href: "/agent/underwriting", label: "Underwriting", icon: Shield },
        { href: "/agent/renewals", label: "Renewals", icon: RefreshCw },
        { href: "/agent/conversations", label: "AI Chats", icon: MessageSquareText },
      ]
    : [
        { href: "/principal/dashboard", label: "My Bonds", icon: FileStack },
        { href: "/chat", label: `${theme.aiName} AI`, icon: Sparkles },
      ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-8">

        <div className="flex items-center gap-8">
          <Link href={role === "agent" ? "/agent/dashboard" : "/principal/dashboard"} className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
            {theme.logoImage ? (
              <img src={`${import.meta.env.BASE_URL}${theme.logoImage}`} alt={theme.brandName} className="h-8 w-auto dark:invert" />
            ) : (
              <>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${theme.logoGradient} text-white shadow-md ${theme.logoShadow}`}>
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <span className="font-display text-lg font-extrabold tracking-tight hidden sm:inline-block text-foreground">
                  {theme.brandName}
                </span>
              </>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150
                    ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"}
                  `}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "opacity-70"}`} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-lg h-11 w-11 sm:h-9 sm:w-9">
            <Bell className="h-4.5 w-4.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 hidden md:flex">
                <Avatar className="h-9 w-9 border-2 border-primary/20">
                  <AvatarFallback className={`bg-gradient-to-br ${theme.avatarBg} text-primary font-bold text-xs`}>
                    {role === "agent" ? "AG" : "PR"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-semibold">
                    {role === "agent" ? "Agent Portal" : "Principal Portal"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {role === "agent" ? theme.agentEmail : theme.principalEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-11 w-11 rounded-lg"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
          <SheetHeader className="p-5 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              {theme.logoImage ? (
                <SheetTitle>
                  <img src={`${import.meta.env.BASE_URL}${theme.logoImage}`} alt={theme.brandName} className="h-8 w-auto dark:invert" />
                </SheetTitle>
              ) : (
                <>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${theme.logoGradient} text-white shadow-md ${theme.logoShadow}`}>
                    <ShieldCheck className="h-4.5 w-4.5" />
                  </div>
                  <SheetTitle className="font-display text-lg font-extrabold tracking-tight">
                    {theme.brandName}
                  </SheetTitle>
                </>
              )}
            </div>
            <SheetDescription className="sr-only">Navigation menu</SheetDescription>
          </SheetHeader>

          <div className="px-3 py-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 text-xs font-semibold text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {role === "agent" ? "Agent Portal" : "Principal Portal"}
            </div>
          </div>

          <nav className="flex-1 flex flex-col gap-1 px-3 py-2">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px]
                    ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"}
                  `}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "opacity-70"}`} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border/60 p-4">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-10 w-10 border-2 border-primary/20">
                <AvatarFallback className={`bg-gradient-to-br ${theme.avatarBg} text-primary font-bold text-xs`}>
                  {role === "agent" ? "AG" : "PR"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">
                  {role === "agent" ? "Agent Portal" : "Principal Portal"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {role === "agent" ? theme.agentEmail : theme.principalEmail}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
              onClick={() => { handleLogout(); setMobileOpen(false); }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
