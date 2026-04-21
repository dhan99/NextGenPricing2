import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, FileText, Users, Library, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { useListBonds, useListClients, useListBondForms } from "@workspace/api-client-react";
import type { BondFormListResponse, ClientListResponse } from "@workspace/api-client-react";
import { useAISearch, type AISearchResult } from "@/hooks/use-ai-underwriting";
import { useAuth } from "@/hooks/use-auth";

function isNaturalLanguageQuery(q: string): boolean {
  const words = q.trim().split(/\s+/);
  if (words.length >= 4) return true;
  const nlKeywords = ["expiring", "over", "under", "above", "below", "between", "find", "show", "list", "all", "recent", "pending", "approved", "declined", "active", "issued", "construction", "license", "court", "high", "low", "this quarter", "this month", "last", "next"];
  const lower = q.toLowerCase();
  return nlKeywords.some((kw) => lower.includes(kw));
}

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const enabled = debouncedQuery.length >= 2 && !aiMode;

  const { data: bondsRaw, isLoading: bondsLoading } = useListBonds(
    {},
    { query: { queryKey: ["listBonds", "search"], enabled } }
  );

  const { data: clientsRaw, isLoading: clientsLoading } = useListClients(
    { search: debouncedQuery, limit: 5 },
    { query: { queryKey: ["listClients", "search", debouncedQuery], enabled } }
  );

  const { data: bondFormsRaw, isLoading: formsLoading } = useListBondForms(
    { search: debouncedQuery, limit: 5 },
    { query: { queryKey: ["listBondForms", "search", debouncedQuery], enabled } }
  );

  const isLoading = aiMode ? aiLoading : (enabled && (bondsLoading || clientsLoading || formsLoading));

  const filteredBonds = enabled && bondsRaw
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

  const clients = enabled && clientsRaw
    ? (clientsRaw as ClientListResponse).data?.slice(0, 5) ?? []
    : [];

  const bondForms = enabled && bondFormsRaw
    ? (bondFormsRaw as BondFormListResponse).data?.slice(0, 5) ?? []
    : [];

  const { user } = useAuth();
  const role = user?.role || "agent";

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

  const showClientSearch = role === "agent";
  const showFormSearch = role === "agent";

  const hasStandardResults = filteredBonds.length > 0 || (showClientSearch && clients.length > 0) || (showFormSearch && bondForms.length > 0);
  const hasAIResults = aiResults && (aiResults.bonds.length > 0 || (showClientSearch && aiResults.clients.length > 0) || (showFormSearch && aiResults.bondForms.length > 0));
  const hasResults = aiMode ? hasAIResults : hasStandardResults;
  const showDropdown = open && debouncedQuery.length >= 2;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigate = useCallback((path: string) => {
    setLocation(path);
    setQuery("");
    setOpen(false);
  }, [setLocation]);

  return (
    <div ref={containerRef} className="flex-1 max-w-[360px] relative">
      <Search className="absolute left-[10px] top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-[var(--slate-400)] pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search bonds, clients..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="w-full py-[7px] pl-9 pr-3 border-[1.5px] border-[var(--border-color)] rounded-[var(--r)] text-[13px] text-[var(--text)] bg-[var(--slate-50)] font-[inherit] transition-all focus:outline-none focus:border-[var(--accent)] focus:bg-card focus:shadow-[0_0_0_3px_rgba(5,150,105,0.1)]"
      />

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-[var(--border-color)] rounded-[var(--r)] shadow-lg z-[60] max-h-[420px] overflow-y-auto">
          {aiMode && (
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1.5 border-b border-[var(--border-color)]">
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span className="text-[10px] font-semibold text-violet-600">AI Search</span>
              {aiResults?.interpretation && !aiLoading && (
                <span className="text-[10px] text-[var(--slate-400)] ml-1 truncate">&mdash; {aiResults.interpretation}</span>
              )}
            </div>
          )}

          {isLoading && (
            <div className="px-4 py-5 text-center text-[13px] text-[var(--slate-400)] flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {aiMode ? "AI is searching..." : "Searching\u2026"}
            </div>
          )}

          {!isLoading && !hasResults && (
            <div className="px-4 py-6 text-center text-[13px] text-[var(--slate-400)]">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {aiMode && aiResults ? (
            <AISearchResults results={aiResults} navigate={navigate} getBondPath={getBondPath} getClientPath={getClientPath} getFormPath={getFormPath} showClients={showClientSearch} showForms={showFormSearch} />
          ) : (
            <>
              {filteredBonds.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                    <FileText className="h-3.5 w-3.5 text-[var(--slate-400)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--slate-400)]">
                      Applications
                    </span>
                  </div>
                  {filteredBonds.map((bond) => (
                    <button
                      key={bond.id}
                      onClick={() => navigate(getBondPath(bond.id))}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--slate-50)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                          {bond.bondNumber} &mdash; {bond.obligeeName}
                        </div>
                        <div className="text-[11px] text-[var(--slate-400)] truncate">
                          {bond.principal?.companyName || "Unknown"} &middot; {bond.status}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {showClientSearch && clients.length > 0 && (
                <div className={filteredBonds.length > 0 ? "border-t border-[var(--border-color)]" : ""}>
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                    <Users className="h-3.5 w-3.5 text-[var(--slate-400)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--slate-400)]">
                      Clients
                    </span>
                  </div>
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => navigate(getClientPath(client.id))}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--slate-50)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                          {client.companyName}
                        </div>
                        <div className="text-[11px] text-[var(--slate-400)] truncate">
                          {[client.city, client.state].filter(Boolean).join(", ") || client.email || "Client"}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {showFormSearch && bondForms.length > 0 && (
                <div className={(filteredBonds.length > 0 || clients.length > 0) ? "border-t border-[var(--border-color)]" : ""}>
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                    <Library className="h-3.5 w-3.5 text-[var(--slate-400)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--slate-400)]">
                      Bond Forms
                    </span>
                  </div>
                  {bondForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => navigate(getFormPath(form.id))}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--slate-50)] transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                          {form.name}
                        </div>
                        <div className="text-[11px] text-[var(--slate-400)] truncate">
                          {form.state} &middot; {form.category}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
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
}

function AISearchResults({ results, navigate, getBondPath, getClientPath, getFormPath, showClients, showForms }: AISearchResultsProps) {
  const hasBonds = results.bonds.length > 0;
  const hasClients = showClients && results.clients.length > 0;
  const hasForms = showForms && results.bondForms.length > 0;

  return (
    <>
      {hasBonds && (
        <div>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <FileText className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
              Applications
            </span>
          </div>
          {results.bonds.map((bond) => (
            <button
              key={bond.id}
              onClick={() => navigate(getBondPath(bond.id))}
              className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                  {bond.bondNumber} &mdash; {bond.obligeeName}
                </div>
                <div className="text-[11px] text-[var(--slate-400)] truncate">
                  {bond.principalName} &middot; {bond.status} &middot; ${bond.bondAmount}
                </div>
                <div className="text-[10px] text-violet-500 truncate mt-0.5">
                  <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{bond.relevance}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      {hasClients && (
        <div className={hasBonds ? "border-t border-[var(--border-color)]" : ""}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <Users className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
              Clients
            </span>
          </div>
          {results.clients.map((client) => (
            <button
              key={client.id}
              onClick={() => navigate(getClientPath(client.id))}
              className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                  {client.companyName}
                </div>
                <div className="text-[11px] text-[var(--slate-400)] truncate">
                  {[client.city, client.state].filter(Boolean).join(", ") || "Client"}
                </div>
                <div className="text-[10px] text-violet-500 truncate mt-0.5">
                  <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{client.relevance}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      {hasForms && (
        <div className={(hasBonds || hasClients) ? "border-t border-[var(--border-color)]" : ""}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <Library className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
              Bond Forms
            </span>
          </div>
          {results.bondForms.map((form) => (
            <button
              key={form.id}
              onClick={() => navigate(getFormPath(form.id))}
              className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors cursor-pointer border-none bg-transparent font-[inherit] flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--slate-800)] truncate">
                  {form.name}
                </div>
                <div className="text-[11px] text-[var(--slate-400)] truncate">
                  {form.state || "All states"} &middot; {form.category}
                </div>
                <div className="text-[10px] text-violet-500 truncate mt-0.5">
                  <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{form.relevance}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--slate-300)] shrink-0" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
