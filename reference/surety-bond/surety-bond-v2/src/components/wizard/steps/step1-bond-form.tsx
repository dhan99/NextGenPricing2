import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, CheckCircle2, ChevronRight, Sparkles, Loader2, X, ArrowLeft } from "lucide-react";
import { useListBondForms } from "@workspace/api-client-react";
import { useBondFormMatcher } from "@/hooks/use-ai-underwriting";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WizardState } from "../wizard-types";

interface Step1Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
}

export function Step1BondForm({ state, onUpdate, onNext }: Step1Props) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [useCustom, setUseCustom] = useState(state.customBondForm);
  const [useAiSearch, setUseAiSearch] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: bondForms, isLoading } = useListBondForms(
    { search: search || undefined, limit: 10 },
    { query: { queryKey: ["/api/bond-forms", { search: search || undefined, limit: 10 }], enabled: !useCustom && !useAiSearch } }
  );

  const { data: aiMatches, loading: aiLoading, matchForms, reset: resetAi } = useBondFormMatcher();

  useEffect(() => {
    if (!useAiSearch) return;
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    if (aiQuery.trim().length < 3) {
      resetAi();
      return;
    }
    aiDebounceRef.current = setTimeout(() => {
      matchForms(aiQuery);
    }, 500);
    return () => {
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    };
  }, [aiQuery, useAiSearch]);

  const categoryToBondType = (category?: string | null): string => {
    if (!category) return "contractor_license";
    const map: Record<string, string> = {
      "Court Bonds": "court",
      "License & Permit Bonds": "permit",
      "Performance & Payment Bonds": "performance",
      "Tax Bonds": "tax",
      "Customs & Carnet": "customs",
      "Workers Compensation Bonds": "fidelity",
      "Lost Instrument Bonds": "fidelity",
      "Subdivision Bonds": "permit",
      "Maintenance & Warranty Bonds": "performance",
      "Supply & Install Bonds": "performance",
      "Reclamation Bonds": "permit",
      "Closure & Post-Closure Bonds": "permit",
      "Excise": "tax",
    };
    return map[category] || "other";
  };

  const handleSelectForm = (form: { id: number; name: string; bondType?: string | null; classCode?: string | null; category?: string | null }) => {
    onUpdate({
      bondFormId: form.id,
      bondFormName: form.name,
      bondFormType: categoryToBondType(form.category),
      bondFormClassCode: form.classCode != null ? String(form.classCode) : "",
      customBondForm: false,
      customBondFormName: "",
    });
  };

  const handleSelectAiMatch = (match: { id: number; name: string; classCode: string; category: string; bondType?: string }) => {
    onUpdate({
      bondFormId: match.id,
      bondFormName: match.name,
      bondFormType: categoryToBondType(match.category),
      bondFormClassCode: match.classCode != null ? String(match.classCode) : "",
      customBondForm: false,
      customBondFormName: "",
    });
  };

  const handleCustomForm = () => {
    setUseCustom(true);
    onUpdate({
      bondFormId: null,
      bondFormName: "",
      customBondForm: true,
    });
  };

  const handleCancelCustom = () => {
    setUseCustom(false);
    onUpdate({ customBondForm: false, customBondFormName: "" });
  };

  const canProceed = state.bondFormId !== null || (state.customBondForm && state.customBondFormName.trim().length > 0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const renderSearchToggle = () => {
    if (useCustom) return null;
    if (isMobile) {
      return (
        <div className="flex items-center gap-0 rounded-lg border border-border/60 overflow-hidden">
          <button
            onClick={() => { setUseAiSearch(false); resetAi(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-colors border-none cursor-pointer font-[inherit] ${
              !useAiSearch ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"
            }`}
          >
            <Search className="h-3 w-3" /> Library
          </button>
          <button
            onClick={() => { setUseAiSearch(true); setSearch(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-colors border-none cursor-pointer font-[inherit] ${
              useAiSearch ? "bg-violet-600 text-white" : "bg-transparent text-muted-foreground"
            }`}
          >
            <Sparkles className="h-3 w-3" /> AI Match
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-2">
        <Button variant={useAiSearch ? "outline" : "default"} size="sm" onClick={() => { setUseAiSearch(false); resetAi(); }} className="gap-1.5">
          <Search className="h-3.5 w-3.5" /> Library Search
        </Button>
        <Button variant={useAiSearch ? "default" : "outline"} size="sm" onClick={() => { setUseAiSearch(true); setSearch(""); }} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> AI Match
        </Button>
      </div>
    );
  };

  const renderSearchInput = () => {
    if (useCustom) return null;

    if (isMobile && !mobileSearchOpen) {
      return (
        <button
          onClick={() => setMobileSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-transparent text-muted-foreground text-sm cursor-pointer font-[inherit] text-left"
        >
          {useAiSearch ? <Sparkles className="h-3.5 w-3.5 text-violet-400 shrink-0" /> : <Search className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{useAiSearch ? 'Describe what you need...' : 'Search bond forms...'}</span>
        </button>
      );
    }

    if (isMobile && mobileSearchOpen) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <button
              onClick={() => { setMobileSearchOpen(false); }}
              className="p-1.5 rounded-md bg-transparent border-none cursor-pointer text-muted-foreground font-[inherit]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="relative flex-1">
              {useAiSearch ? (
                <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-violet-400" />
              ) : (
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Input
                ref={searchInputRef}
                placeholder={useAiSearch ? 'e.g. "plumber bond in Texas"...' : "Search by name, code, or category..."}
                className={`pl-8 h-9 text-sm ${useAiSearch ? "border-violet-500/30 focus-visible:ring-violet-500/30" : ""}`}
                value={useAiSearch ? aiQuery : search}
                onChange={(e) => useAiSearch ? setAiQuery(e.target.value) : setSearch(e.target.value)}
                autoFocus
              />
            </div>
            {(search || aiQuery) && (
              <button
                onClick={() => { setSearch(""); setAiQuery(""); resetAi(); }}
                className="p-1.5 rounded-md bg-transparent border-none cursor-pointer text-muted-foreground font-[inherit]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {renderResults()}
          </div>
        </div>
      );
    }

    if (useAiSearch) {
      return (
        <div className="relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-400" />
          <Input
            placeholder='Describe what you need, e.g. "plumber bond in Texas" or "auto dealer license bond"...'
            className="pl-10 h-12 border-violet-500/30 focus-visible:ring-violet-500/30"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
          />
        </div>
      );
    }

    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search bond forms by name, class code, or category..."
          className="pl-10 h-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    );
  };

  const renderResults = () => {
    if (useCustom) return null;

    if (useAiSearch) {
      return (
        <>
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-violet-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding matching bond forms...
            </div>
          )}
          {aiMatches && aiMatches.interpretation && (
            <p className="text-xs text-violet-500 italic mb-2">{aiMatches.interpretation}</p>
          )}
          {aiMatches && aiMatches.matches.length > 0 && (
            <div className={`space-y-2 ${isMobile ? '' : 'max-h-[360px] overflow-y-auto'}`}>
              {aiMatches.matches.map((match) => (
                <Card
                  key={match.id}
                  className={`cursor-pointer transition-all hover:border-violet-500/50 ${
                    state.bondFormId === match.id ? "border-violet-500 bg-violet-500/5" : "border-border/50"
                  }`}
                  onClick={() => { handleSelectAiMatch(match); if (isMobile) setMobileSearchOpen(false); }}
                >
                  <CardContent className={isMobile ? "p-3" : "p-4"}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${isMobile ? 'text-[13px]' : 'text-sm'}`}>{match.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{match.classCode}</Badge>
                          <span className="text-[10px] text-muted-foreground">{match.category}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge className="bg-violet-500/10 text-violet-600 border-violet-500/30 text-[10px]">
                          {match.relevanceScore}%
                        </Badge>
                        {state.bondFormId === match.id && <CheckCircle2 className="h-4 w-4 text-violet-500" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {aiMatches && aiMatches.matches.length === 0 && !aiLoading && aiQuery.length >= 3 && (
            <p className="text-sm text-muted-foreground text-center py-4">No matching bond forms found.</p>
          )}
        </>
      );
    }

    return (
      <>
        {isLoading && <p className="text-sm text-muted-foreground py-2">Loading bond forms...</p>}
        {!search && bondForms?.data && bondForms.data.length > 0 && (
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Popular Bond Forms</p>
        )}
        {bondForms && bondForms.data && bondForms.data.length > 0 && (
          <div className={`space-y-1.5 ${isMobile ? '' : 'max-h-[360px] overflow-y-auto'}`}>
            {bondForms.data.map((form) => (
              <Card
                key={form.id}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  state.bondFormId === form.id ? "border-primary bg-primary/5" : "border-border/50"
                }`}
                onClick={() => { handleSelectForm(form); if (isMobile) setMobileSearchOpen(false); }}
              >
                <CardContent className={`${isMobile ? 'p-3' : 'p-4'} flex items-center justify-between gap-2`}>
                  <div className="min-w-0">
                    <p className={`font-medium ${isMobile ? 'text-[13px]' : 'text-sm'}`}>{form.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {form.classCode && <Badge variant="secondary" className="text-[10px]">{form.classCode}</Badge>}
                      {form.category && <span className="text-[10px] text-muted-foreground truncate">{form.category}</span>}
                    </div>
                  </div>
                  {state.bondFormId === form.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {search && bondForms && bondForms.data && bondForms.data.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">No bond forms found for "{search}"</p>
        )}
      </>
    );
  };

  return (
    <div className={isMobile ? "space-y-3" : "space-y-6"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={`${isMobile ? 'text-base' : 'text-xl'} font-semibold`}>Select Bond Form</h2>
        {isMobile && !useCustom && renderSearchToggle()}
      </div>
      {!isMobile && (
        <p className="text-sm text-muted-foreground -mt-4">
          Search the bond form library or describe what you need.
        </p>
      )}

      {!isMobile && renderSearchToggle()}
      {renderSearchInput()}
      {(!isMobile || !mobileSearchOpen) && renderResults()}

      {!useCustom && (
        <div className={`border-t border-border/50 ${isMobile ? 'pt-3' : 'pt-4'}`}>
          <Button variant="outline" onClick={handleCustomForm} className={`gap-2 ${isMobile ? 'text-xs h-8' : ''}`}>
            <FileText className={isMobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
            I have my own form
          </Button>
        </div>
      )}

      {useCustom && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className={isMobile ? "text-xs" : ""}>Custom Bond Form Name</Label>
            <Input
              placeholder="Enter your bond form name..."
              className={isMobile ? "h-10" : "h-12"}
              value={state.customBondFormName}
              onChange={(e) => onUpdate({ customBondFormName: e.target.value })}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelCustom}>
            Back to library search
          </Button>
        </div>
      )}

      {state.bondFormId && !useCustom && (
        <Card className="bg-emerald-500/5 border-emerald-500/30">
          <CardContent className={`${isMobile ? 'p-3' : 'p-4'} flex items-center gap-3`}>
            <CheckCircle2 className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-500 flex-shrink-0`} />
            <div className="min-w-0">
              <p className={`font-medium ${isMobile ? 'text-[13px] truncate' : 'text-sm'}`}>Selected: {state.bondFormName}</p>
              {state.bondFormType && (
                <p className="text-[10px] text-muted-foreground capitalize">{state.bondFormType.replace(/_/g, " ")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className={`flex justify-end ${isMobile ? 'pt-2' : 'pt-4'}`}>
        <Button onClick={onNext} disabled={!canProceed} className={`gap-2 ${isMobile ? 'text-sm h-9' : ''}`}>
          {isMobile ? 'Next' : 'Account Information'} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
