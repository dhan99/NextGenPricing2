import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useListBonds, useListClients, useListBondForms } from "@workspace/api-client-react";
import type { BondFormListResponse, ClientListResponse } from "@workspace/api-client-react";
import { useAISearch, type AISearchResult } from "@/hooks/use-ai-underwriting";
import {
  LayoutDashboard, GitPullRequest, Users, Library, RefreshCw, Shield,
  CreditCard, Sparkles, ShieldCheck, Search, FileText, ArrowRight, Command, X,
  Loader2, Plus
} from "lucide-react";

function isNaturalLanguageQuery(q: string): boolean {
  const words = q.trim().split(/\s+/);
  if (words.length >= 4) return true;
  const nlKeywords = ["expiring", "over", "under", "above", "below", "between", "find", "show", "list", "all", "recent", "pending", "approved", "declined", "active", "issued", "construction", "license", "court", "high", "low", "this quarter", "this month", "last", "next"];
  const lower = q.toLowerCase();
  return nlKeywords.some((kw) => lower.includes(kw));
}

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
  category: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setLocation] = useLocation();
  const { role } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [aiMode, setAiMode] = useState(false);
  const { data: aiResults, loading: aiLoading, search: aiSearch, reset: resetAI } = useAISearch();

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      setAiMode(false);
      resetAI();
      return;
    }
    const t = setTimeout(() => {
      const trimmed = query.trim();
      setDebouncedQuery(trimmed);
      const shouldUseAI = isNaturalLanguageQuery(trimmed);
      setAiMode(shouldUseAI);
      if (shouldUseAI) {
        aiSearch(trimmed);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const searchEnabled = debouncedQuery.length >= 2 && !aiMode;

  const { data: bondsRaw, isLoading: bondsLoading } = useListBonds(
    {},
    { query: { queryKey: ["listBonds", "palette"], enabled: searchEnabled } }
  );

  const { data: clientsRaw, isLoading: clientsLoading } = useListClients(
    { search: debouncedQuery, limit: 5 },
    { query: { queryKey: ["listClients", "palette", debouncedQuery], enabled: searchEnabled } }
  );

  const { data: bondFormsRaw, isLoading: formsLoading } = useListBondForms(
    { search: debouncedQuery, limit: 5 },
    { query: { queryKey: ["listBondForms", "palette", debouncedQuery], enabled: searchEnabled } }
  );

  const isSearching = aiMode ? aiLoading : (searchEnabled && (bondsLoading || clientsLoading || formsLoading));

  const filteredBonds = searchEnabled && bondsRaw
    ? (Array.isArray(bondsRaw) ? bondsRaw : []).filter((b) => {
        const q = debouncedQuery.toLowerCase();
        return (
          b.bondNumber?.toLowerCase().includes(q) ||
          b.obligeeName?.toLowerCase().includes(q) ||
          b.principal?.companyName?.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q)
        );
      }).slice(0, 5)
    : [];

  const clients = searchEnabled && clientsRaw
    ? (clientsRaw as ClientListResponse).data?.slice(0, 5) ?? []
    : [];

  const bondForms = searchEnabled && bondFormsRaw
    ? (bondFormsRaw as BondFormListResponse).data?.slice(0, 5) ?? []
    : [];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery("");
        setDebouncedQuery("");
        setSelectedIndex(0);
        setAiMode(false);
        resetAI();
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const navigationItems: PaletteItem[] = [
    ...(role === "agent" ? [
      { id: "agent-dash", label: "Dashboard", description: "Agent overview", icon: LayoutDashboard, href: "/agent/dashboard", category: "Navigation" },
      { id: "agent-apps", label: "Applications", description: "View all bond applications", icon: GitPullRequest, href: "/agent/bonds", category: "Navigation" },
      { id: "agent-clients", label: "Clients", description: "Manage your clients", icon: Users, href: "/agent/clients", category: "Navigation" },
      { id: "agent-library", label: "Bond Library", description: "Browse bond forms", icon: Library, href: "/agent/bond-form-library", category: "Navigation" },
      { id: "agent-renewals", label: "Renewals", description: "Upcoming renewals", icon: RefreshCw, href: "/agent/renewals", category: "Navigation" },
      { id: "agent-referrals", label: "Referrals", description: "Underwriting referrals", icon: Shield, href: "/agent/underwriting", category: "Navigation" },
      { id: "new-bond", label: "New Bond Application", description: "Start a new application", icon: FileText, href: "/agent/bond-wizard", category: "Actions" },
    ] : []),
    ...(role === "principal" ? [
      { id: "prin-dash", label: "Dashboard", description: "Principal overview", icon: LayoutDashboard, href: "/principal/dashboard", category: "Navigation" },
      { id: "prin-payments", label: "Payments", description: "View payment history", icon: CreditCard, href: "/principal/payments", category: "Navigation" },
      { id: "prin-chat", label: "BondAssist AI", description: "Chat with AI assistant", icon: Sparkles, href: "/chat", category: "Navigation" },
    ] : []),
    ...(role === "underwriter" ? [
      { id: "uw-dash", label: "Dashboard", description: "Underwriter overview", icon: LayoutDashboard, href: "/underwriter/dashboard", category: "Navigation" },
      { id: "uw-review", label: "Review Queue", description: "Bonds pending review", icon: ShieldCheck, href: "/underwriter/review", category: "Navigation" },
      { id: "uw-bonds", label: "All Bonds", description: "View all bonds", icon: GitPullRequest, href: "/underwriter/bonds", category: "Navigation" },
      { id: "uw-new", label: "New Application", description: "Create bond on behalf of agent", icon: Plus, href: "/underwriter/bond-wizard", category: "Navigation" },
    ] : []),
  ];

  const filteredNavItems = query.trim()
    ? navigationItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        (item.description || "").toLowerCase().includes(query.toLowerCase())
      )
    : navigationItems;

  const getBondPath = useCallback((bondId: number | string) => {
    if (role === "principal") return `/principal/bonds/${bondId}`;
    if (role === "underwriter") return `/underwriter/bonds/${bondId}`;
    return `/agent/bonds/${bondId}`;
  }, [role]);

  const getClientPath = useCallback((clientId: number | string) => {
    return `/agent/clients/${clientId}`;
  }, []);

  const getFormPath = useCallback((formId: number | string) => {
    return `/agent/bond-form-library/${formId}`;
  }, []);

  const showBondSearch = true;
  const showClientSearch = role === "agent";
  const showFormSearch = role === "agent";

  const hasEntityResults = filteredBonds.length > 0 || (showClientSearch && clients.length > 0) || (showFormSearch && bondForms.length > 0);
  const hasAIResults = aiResults && (aiResults.bonds.length > 0 || (showClientSearch && aiResults.clients.length > 0) || (showFormSearch && aiResults.bondForms.length > 0));
  const showEntityResults = debouncedQuery.length >= 2 && (aiMode ? hasAIResults : hasEntityResults);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const navigate = useCallback((path: string) => {
    setLocation(path);
    setOpen(false);
    setQuery("");
  }, [setLocation]);

  const handleSelectNav = useCallback((item: PaletteItem) => {
    if (item.href) setLocation(item.href);
    if (item.action) item.action();
    setOpen(false);
    setQuery("");
  }, [setLocation]);

  type SelectableItem = { type: "nav"; item: PaletteItem } | { type: "bond"; path: string } | { type: "client"; path: string } | { type: "form"; path: string };

  const allSelectableItems: SelectableItem[] = (() => {
    const items: SelectableItem[] = [];
    if (showEntityResults && !aiMode) {
      filteredBonds.forEach(b => items.push({ type: "bond", path: getBondPath(b.id) }));
      if (showClientSearch) clients.forEach(c => items.push({ type: "client", path: getClientPath(c.id) }));
      if (showFormSearch) bondForms.forEach(f => items.push({ type: "form", path: getFormPath(f.id) }));
    } else if (showEntityResults && aiMode && aiResults) {
      aiResults.bonds.forEach(b => items.push({ type: "bond", path: getBondPath(b.id) }));
      if (showClientSearch) aiResults.clients.forEach(c => items.push({ type: "client", path: getClientPath(c.id) }));
      if (showFormSearch) aiResults.bondForms.forEach(f => items.push({ type: "form", path: getFormPath(f.id) }));
    }
    filteredNavItems.forEach(item => items.push({ type: "nav", item }));
    return items;
  })();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, allSelectableItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && allSelectableItems[selectedIndex]) {
        e.preventDefault();
        const sel = allSelectableItems[selectedIndex];
        if (sel.type === "nav") {
          handleSelectNav(sel.item);
        } else {
          navigate(sel.path);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, allSelectableItems, selectedIndex, handleSelectNav, navigate]);

  if (!open) return null;

  const navCategories = [...new Set(filteredNavItems.map(i => i.category))];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[560px] mx-4 glass rounded-2xl overflow-hidden animate-scaleIn" style={{ background: 'var(--card)' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
          <Search className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, bonds, clients, or ask a question..."
            className="flex-1 bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none border-none"
          />
          {aiMode && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 text-[10px] font-semibold shrink-0">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <kbd className="hidden sm:inline-flex h-5 items-center px-1.5 rounded text-[10px] font-mono font-semibold bg-[var(--slate-100)] text-[var(--text-muted)] border border-[var(--border-color)]">ESC</kbd>
            <button onClick={() => setOpen(false)} className="sm:hidden p-1 text-[var(--text-muted)] bg-transparent border-none cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto py-2">
          {isSearching && (
            <div className="px-4 py-4 text-center text-[13px] text-[var(--text-muted)] flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {aiMode ? "AI is searching..." : "Searching..."}
            </div>
          )}

          {showEntityResults && !isSearching && (
            <>
              {aiMode && aiResults?.interpretation && (
                <div className="flex items-center gap-1.5 px-4 pt-2 pb-1.5">
                  <Sparkles className="h-3 w-3 text-violet-500" />
                  <span className="text-[10px] font-semibold text-violet-500">AI Search</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-1 truncate">— {aiResults.interpretation}</span>
                </div>
              )}

              {aiMode && aiResults ? (
                <AISearchResults results={aiResults} navigate={navigate} getBondPath={getBondPath} getClientPath={getClientPath} getFormPath={getFormPath} showClients={showClientSearch} showForms={showFormSearch} selectedIndex={selectedIndex} entityStartIndex={0} />
              ) : (
                (() => {
                  let entityIdx = 0;
                  return (
                    <>
                      {filteredBonds.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
                            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Applications</span>
                          </div>
                          {filteredBonds.map((bond) => {
                            const idx = entityIdx++;
                            return (
                              <button
                                key={bond.id}
                                onClick={() => navigate(getBondPath(bond.id))}
                                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === idx ? "bg-[var(--slate-100)]" : ""}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">
                                    {bond.bondNumber} — {bond.obligeeName}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                                    {bond.principal?.companyName || "Unknown"} · {bond.status}
                                  </div>
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {showClientSearch && clients.length > 0 && (
                        <div className={filteredBonds.length > 0 ? "border-t border-[var(--border-color)]" : ""}>
                          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
                            <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Clients</span>
                          </div>
                          {clients.map((client) => {
                            const idx = entityIdx++;
                            return (
                              <button
                                key={client.id}
                                onClick={() => navigate(getClientPath(client.id))}
                                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === idx ? "bg-[var(--slate-100)]" : ""}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">{client.companyName}</div>
                                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                                    {[client.city, client.state].filter(Boolean).join(", ") || client.email || "Client"}
                                  </div>
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {showFormSearch && bondForms.length > 0 && (
                        <div className={(filteredBonds.length > 0 || clients.length > 0) ? "border-t border-[var(--border-color)]" : ""}>
                          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
                            <Library className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Bond Forms</span>
                          </div>
                          {bondForms.map((form) => {
                            const idx = entityIdx++;
                            return (
                              <button
                                key={form.id}
                                onClick={() => navigate(getFormPath(form.id))}
                                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === idx ? "bg-[var(--slate-100)]" : ""}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">{form.name}</div>
                                  <div className="text-[11px] text-[var(--text-muted)] truncate">{form.state} · {form.category}</div>
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()
              )}

              {filteredNavItems.length > 0 && (
                <div className="border-t border-[var(--border-color)] mt-1" />
              )}
            </>
          )}

          {!isSearching && filteredNavItems.length === 0 && !showEntityResults ? (
            <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
              No results found for "{query}"
            </div>
          ) : (
            !isSearching && filteredNavItems.length > 0 && navCategories.map(cat => (
              <div key={cat}>
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                  {cat}
                </div>
                {filteredNavItems.filter(i => i.category === cat).map((item) => {
                  const navIdx = filteredNavItems.indexOf(item);
                  const entityCount = allSelectableItems.length - filteredNavItems.length;
                  const globalIdx = entityCount + navIdx;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectNav(item)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer border-none bg-transparent ${
                        globalIdx === selectedIndex
                          ? "bg-[var(--accent-50)] text-[var(--accent-dark)]"
                          : "text-[var(--text)] hover:bg-[var(--slate-100)]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">{item.label}</div>
                        {item.description && (
                          <div className="text-[11px] text-[var(--text-muted)] truncate">{item.description}</div>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 opacity-40 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 bg-[var(--slate-100)] rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 bg-[var(--slate-100)] rounded text-[10px]">↵</kbd> Select</span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            <span>K to toggle</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AISearchResultsProps {
  results: AISearchResult;
  navigate: (path: string) => void;
  getBondPath: (id: number | string) => string;
  getClientPath: (id: number | string) => string;
  getFormPath: (id: number | string) => string;
  showClients: boolean;
  showForms: boolean;
  selectedIndex: number;
  entityStartIndex: number;
}

function AISearchResults({ results, navigate, getBondPath, getClientPath, getFormPath, showClients, showForms, selectedIndex, entityStartIndex }: AISearchResultsProps) {
  const hasBonds = results.bonds.length > 0;
  const hasClients = showClients && results.clients.length > 0;
  const hasForms = showForms && results.bondForms.length > 0;
  let idx = entityStartIndex;

  return (
    <>
      {hasBonds && (
        <div>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
            <FileText className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Applications</span>
          </div>
          {results.bonds.map((bond) => {
            const currentIdx = idx++;
            return (
              <button
                key={bond.id}
                onClick={() => navigate(getBondPath(bond.id))}
                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === currentIdx ? "bg-[var(--slate-100)]" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">
                    {bond.bondNumber} — {bond.obligeeName}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {bond.principalName} · {bond.status} · ${bond.bondAmount}
                  </div>
                  <div className="text-[10px] text-violet-500 truncate mt-0.5">
                    <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{bond.relevance}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>
      )}

      {hasClients && (
        <div className={hasBonds ? "border-t border-[var(--border-color)]" : ""}>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
            <Users className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Clients</span>
          </div>
          {results.clients.map((client) => {
            const currentIdx = idx++;
            return (
              <button
                key={client.id}
                onClick={() => navigate(getClientPath(client.id))}
                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === currentIdx ? "bg-[var(--slate-100)]" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">{client.companyName}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {[client.city, client.state].filter(Boolean).join(", ") || "Client"}
                  </div>
                  <div className="text-[10px] text-violet-500 truncate mt-0.5">
                    <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{client.relevance}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>
      )}

      {hasForms && (
        <div className={(hasBonds || hasClients) ? "border-t border-[var(--border-color)]" : ""}>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
            <Library className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Bond Forms</span>
          </div>
          {results.bondForms.map((form) => {
            const currentIdx = idx++;
            return (
              <button
                key={form.id}
                onClick={() => navigate(getFormPath(form.id))}
                className={`w-full text-left px-4 py-2 hover:bg-[var(--slate-100)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3 ${selectedIndex === currentIdx ? "bg-[var(--slate-100)]" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--slate-900)] truncate">{form.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{form.state || "All states"} · {form.category}</div>
                  <div className="text-[10px] text-violet-500 truncate mt-0.5">
                    <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{form.relevance}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
