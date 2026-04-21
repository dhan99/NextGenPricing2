import { useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { WizardProgress } from "@/components/wizard/wizard-progress";
import { Step1BondForm } from "@/components/wizard/steps/step1-bond-form";
import { Step2AccountInfo } from "@/components/wizard/steps/step2-account-info";
import { Step3Applicant } from "@/components/wizard/steps/step3-applicant";
import { Step4BondInfo } from "@/components/wizard/steps/step4-bond-info";
import { Step5Summary } from "@/components/wizard/steps/step5-summary";
import { Step6Payment } from "@/components/wizard/steps/step6-payment";
import { type WizardState, initialWizardState, WIZARD_STEPS } from "@/components/wizard/wizard-types";
import { useGetBondForm } from "@workspace/api-client-react";
import { ArrowLeft, Search, UserCheck, Building2 } from "lucide-react";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_KEY = "uw-bond-wizard-state";

const UW_WIZARD_STEPS = ["Select Agent", ...WIZARD_STEPS];

interface Agent {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  agencyName: string;
  licenseNumber: string;
}

function loadSavedState(): WizardState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.isPurchased) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    }
  } catch {}
  return null;
}

function saveState(state: WizardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function AgentPickerStep({
  selectedAgentId,
  onSelectAgent,
}: {
  selectedAgentId: number | null;
  onSelectAgent: (agent: Agent) => void;
}) {
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`/api/agents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAgents(data);
        }
      } catch (e) {
        console.error("Failed to fetch agents:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [token]);

  const filtered = agents.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.agencyName || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center space-y-1 sm:space-y-2">
        <h2 className="text-lg sm:text-xl font-bold text-[var(--slate-900)]">Select Agent</h2>
        <p className="text-xs sm:text-sm text-[var(--slate-500)]">
          Choose the agent on whose behalf this application is being created
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--slate-400)]" />
        <input
          type="text"
          placeholder="Search agents by name, email, or agency..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-lg border border-[var(--border-color)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
        />
      </div>

      {loading ? (
        <div className="space-y-2 sm:space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-[var(--border-color)] p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 sm:h-4 bg-muted rounded w-1/3" />
                  <div className="h-2 sm:h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-[var(--slate-400)]">
          <Building2 className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{search ? "No agents match your search" : "No agents found"}</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-2.5 max-h-[50vh] overflow-y-auto">
          {filtered.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                className={`w-full text-left rounded-lg border-2 p-3 sm:p-4 transition-all cursor-pointer ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
                    : "border-[var(--border-color)] hover:border-[var(--slate-300)] hover:bg-[var(--slate-50)]"
                }`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${
                    isSelected ? "bg-[var(--accent)] text-white" : "bg-[var(--slate-100)] text-[var(--slate-600)]"
                  }`}>
                    {agent.firstName[0]}{agent.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm sm:text-[15px] text-[var(--slate-900)] truncate">
                        {agent.firstName} {agent.lastName}
                      </span>
                      {isSelected && <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--accent)] shrink-0" />}
                    </div>
                    <div className="text-[11px] sm:text-xs text-[var(--slate-500)] truncate">{agent.email}</div>
                    {agent.agencyName && (
                      <div className="text-[11px] sm:text-xs text-[var(--slate-400)] truncate mt-0.5">
                        {agent.agencyName}
                        {agent.licenseNumber && <span className="ml-2">Lic: {agent.licenseNumber}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UWBondApplicationWizard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const bondFormIdParam = params.get("bondFormId");
  const isMobile = useIsMobile();

  const [state, setState] = useState<WizardState>(() => {
    const saved = loadSavedState();
    if (bondFormIdParam) {
      const formId = parseInt(bondFormIdParam);
      return {
        ...initialWizardState,
        uwCreated: true,
        bondFormId: formId,
        bondFormName: "",
        bondFormType: "",
        bondFormClassCode: "",
        currentStep: 0,
      };
    }
    return saved || { ...initialWizardState, uwCreated: true, currentStep: 0 };
  });

  const handleUpdate = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      saveState(next);
      return next;
    });
  }, []);

  const goToStep = useCallback((step: number) => {
    handleUpdate({ currentStep: step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [handleUpdate]);

  const handleNext = useCallback(() => {
    goToStep(state.currentStep + 1);
  }, [state.currentStep, goToStep]);

  const handleBack = useCallback(() => {
    goToStep(state.currentStep - 1);
  }, [state.currentStep, goToStep]);

  const handleSelectAgent = useCallback((agent: Agent) => {
    handleUpdate({
      uwSelectedAgentId: agent.id,
      uwSelectedAgentName: `${agent.firstName} ${agent.lastName}`,
      uwCreated: true,
    });
  }, [handleUpdate]);

  const handleAgentConfirm = useCallback(() => {
    if (state.uwSelectedAgentId) {
      goToStep(1);
    }
  }, [state.uwSelectedAgentId, goToStep]);

  const { data: preselectedForm } = useGetBondForm(
    state.bondFormId!,
    { query: { queryKey: [`/api/bond-forms/${state.bondFormId}`] as const, enabled: !!bondFormIdParam && !!state.bondFormId && !state.bondFormName } }
  );

  useEffect(() => {
    if (preselectedForm && !state.bondFormName) {
      const categoryMap: Record<string, string> = {
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
      const derivedType = categoryMap[(preselectedForm as Record<string, string>).category] || "contractor_license";
      handleUpdate({
        bondFormName: preselectedForm.name,
        bondFormType: derivedType,
        bondFormClassCode: preselectedForm.classCode || "",
      });
    }
  }, [preselectedForm]);

  const handleDashboard = () => {
    localStorage.removeItem(STORAGE_KEY);
    setLocation("/underwriter/dashboard");
  };

  const renderStep = () => {
    if (state.currentStep === 0) {
      return (
        <div>
          <AgentPickerStep
            selectedAgentId={state.uwSelectedAgentId}
            onSelectAgent={handleSelectAgent}
          />
          {state.uwSelectedAgentId && (
            <div className="mt-4 sm:mt-6 flex justify-end">
              <button
                onClick={handleAgentConfirm}
                className="px-5 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm font-semibold text-white gradient-accent transition-all hover:opacity-90 cursor-pointer"
              >
                Continue with {state.uwSelectedAgentName}
              </button>
            </div>
          )}
        </div>
      );
    }

    switch (state.currentStep) {
      case 1:
        return <Step1BondForm state={state} onUpdate={handleUpdate} onNext={handleNext} />;
      case 2:
        return <Step2AccountInfo state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <Step3Applicant state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />;
      case 4:
        return <Step4BondInfo state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} onDashboard={handleDashboard} />;
      case 5:
        return <Step5Summary state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} onGoToStep={goToStep} />;
      case 6:
        return <Step6Payment state={state} onUpdate={handleUpdate} onBack={handleBack} onDashboard={handleDashboard} />;
      default:
        return null;
    }
  };

  const totalSteps = UW_WIZARD_STEPS.length;
  const effectiveStep = state.currentStep + 1;
  const progress = ((effectiveStep - 1) / totalSteps) * 100 + (100 / totalSteps) * 0.5;

  const showRhsPanel = state.currentStep === 2 || state.currentStep === 3 || state.currentStep === 4;

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
      <div className={showRhsPanel ? "max-w-[960px] mx-auto" : "max-w-[640px] mx-auto"}>
        {state.uwSelectedAgentId && state.currentStep > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2 px-1">
            <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
              <UserCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[var(--accent)]" />
            </div>
            <span className="text-[11px] sm:text-xs text-[var(--slate-500)]">
              Creating on behalf of <span className="font-semibold text-[var(--slate-700)]">{state.uwSelectedAgentName}</span>
            </span>
          </div>
        )}

        {isMobile ? (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => {
                if (state.currentStep > 0) handleBack();
                else setLocation("/underwriter/dashboard");
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[var(--slate-500)] cursor-pointer border-none bg-transparent p-[4px_6px] rounded-[var(--r)] transition-all hover:bg-[var(--slate-100)] font-[inherit] shrink-0"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
            <div className="flex-1 flex items-center gap-1">
              {UW_WIZARD_STEPS.map((_, i) => {
                const isDone = effectiveStep > i + 1;
                const isCurrent = effectiveStep === i + 1;
                return (
                  <div
                    key={i}
                    className={`h-1 rounded-full flex-1 transition-all duration-250 ${
                      isDone ? "bg-[var(--violet)]"
                        : isCurrent ? "bg-[var(--coral)]"
                        : "bg-[var(--slate-200)]"
                    }`}
                  />
                );
              })}
            </div>
            <span className="text-[11px] text-[var(--slate-400)] font-medium shrink-0">
              {effectiveStep}/{totalSteps}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-7">
              <button
                onClick={() => {
                  if (state.currentStep > 0) handleBack();
                  else setLocation("/underwriter/dashboard");
                }}
                className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--slate-500)] cursor-pointer border-none bg-transparent p-[6px_10px] rounded-[var(--r)] transition-all hover:bg-[var(--slate-100)] hover:text-[var(--slate-800)] font-[inherit]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <span className="text-[12.5px] text-[var(--slate-400)] font-medium ml-auto">
                Step {effectiveStep} of {totalSteps} — {UW_WIZARD_STEPS[state.currentStep]}
              </span>
            </div>

            <div className="flex gap-1.5 justify-center mb-4">
              {UW_WIZARD_STEPS.map((_, i) => {
                const isDone = effectiveStep > i + 1;
                const isCurrent = effectiveStep === i + 1;
                return (
                  <div
                    key={i}
                    className={`h-[7px] rounded-full transition-all duration-250 cursor-pointer ${
                      isDone ? "w-[7px] bg-[var(--violet)]"
                        : isCurrent ? "w-5 bg-[var(--coral)]"
                        : "w-[7px] bg-[var(--slate-200)]"
                    }`}
                    onClick={() => {
                      const targetStep = i;
                      if (targetStep <= state.currentStep) goToStep(targetStep);
                    }}
                  />
                );
              })}
            </div>

            <div className="bg-[var(--slate-200)] rounded-full h-1 mb-8 overflow-hidden">
              <div
                className="h-full bg-[var(--coral)] rounded-full transition-[width] duration-400 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}

        {renderStep()}
      </div>
    </div>
  );
}
