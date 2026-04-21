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
import { useGetBondForm, useGetClient } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

const STORAGE_KEY = "bond-wizard-state";

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

export function BondApplicationWizard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const bondFormIdParam = params.get("bondFormId");
  const clientIdParam = params.get("clientId");

  const [state, setState] = useState<WizardState>(() => {
    const saved = loadSavedState();
    if (bondFormIdParam) {
      const formId = parseInt(bondFormIdParam);
      return {
        ...initialWizardState,
        bondFormId: formId,
        bondFormName: "",
        bondFormType: "",
        bondFormClassCode: "",
        currentStep: 1,
      };
    }
    if (clientIdParam) {
      const clientIdNum = parseInt(clientIdParam);
      return {
        ...initialWizardState,
        clientId: clientIdNum,
        clientName: "",
      };
    }
    return saved || { ...initialWizardState };
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

  const { data: preselectedForm } = useGetBondForm(
    state.bondFormId!,
    { query: { queryKey: [`/api/bond-forms/${state.bondFormId}`] as const, enabled: !!bondFormIdParam && !!state.bondFormId && !state.bondFormName } }
  );

  const { data: preselectedClient } = useGetClient(
    parseInt(clientIdParam || "0"),
    { query: { queryKey: [`/api/clients/${clientIdParam}`] as const, enabled: !!clientIdParam && state.clientId === parseInt(clientIdParam) && !state.clientName } }
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
      if (state.currentStep === 1) {
        goToStep(2);
      }
    }
  }, [preselectedForm]);

  useEffect(() => {
    if (preselectedClient && !state.clientName) {
      handleUpdate({
        clientId: preselectedClient.id,
        clientName: preselectedClient.companyName,
        principalCompanyName: preselectedClient.companyName || "",
        principalFirstName: preselectedClient.firstName || "",
        principalLastName: preselectedClient.lastName || "",
        principalEmail: preselectedClient.email || "",
        principalPhone: preselectedClient.phone || "",
        principalAddress: preselectedClient.addressLine1 || "",
        principalCity: preselectedClient.city || "",
        principalState: preselectedClient.state || "",
        principalZip: preselectedClient.zipCode || "",
      });
    }
  }, [preselectedClient]);

  const handleDashboard = () => {
    localStorage.removeItem(STORAGE_KEY);
    setLocation("/agent/dashboard");
  };

  const renderStep = () => {
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

  const isMobile = useIsMobile();
  const progress = ((state.currentStep - 1) / WIZARD_STEPS.length) * 100 + (100 / WIZARD_STEPS.length) * 0.5;

  const showRhsPanel = state.currentStep === 2 || state.currentStep === 3 || state.currentStep === 4;

  return (
    <div className="animate-fadeUp">
      <div className={showRhsPanel ? "max-w-[960px] mx-auto" : "max-w-[640px] mx-auto"}>
        {isMobile ? (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => state.currentStep > 1 ? handleBack() : setLocation("/agent/dashboard")}
              className="flex items-center gap-1 text-[12px] font-medium text-[var(--slate-500)] cursor-pointer border-none bg-transparent p-[4px_6px] rounded-[var(--r)] transition-all hover:bg-[var(--slate-100)] font-[inherit] shrink-0"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
            <div className="flex-1 flex items-center gap-1">
              {WIZARD_STEPS.map((_, i) => {
                const stepNum = i + 1;
                const isDone = state.currentStep > stepNum;
                const isCurrent = state.currentStep === stepNum;
                return (
                  <div
                    key={i}
                    className={`h-1 rounded-full flex-1 transition-all duration-250 ${
                      isDone ? "bg-[var(--green)]"
                        : isCurrent ? "bg-[var(--coral)]"
                        : "bg-[var(--slate-200)]"
                    }`}
                  />
                );
              })}
            </div>
            <span className="text-[11px] text-[var(--slate-400)] font-medium shrink-0">
              {state.currentStep}/{WIZARD_STEPS.length}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-7">
              <button
                onClick={() => state.currentStep > 1 ? handleBack() : setLocation("/agent/dashboard")}
                className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--slate-500)] cursor-pointer border-none bg-transparent p-[6px_10px] rounded-[var(--r)] transition-all hover:bg-[var(--slate-100)] hover:text-[var(--slate-800)] font-[inherit]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <span className="text-[12.5px] text-[var(--slate-400)] font-medium ml-auto">
                Step {state.currentStep} of {WIZARD_STEPS.length}
              </span>
            </div>

            <div className="flex gap-1.5 justify-center mb-4">
              {WIZARD_STEPS.map((_, i) => {
                const stepNum = i + 1;
                const isDone = state.currentStep > stepNum;
                const isCurrent = state.currentStep === stepNum;
                return (
                  <div
                    key={i}
                    className={`h-[7px] rounded-full transition-all duration-250 cursor-pointer ${
                      isDone ? "w-[7px] bg-[var(--green)]"
                        : isCurrent ? "w-5 bg-[var(--coral)]"
                        : "w-[7px] bg-[var(--slate-200)]"
                    }`}
                    onClick={() => stepNum <= state.currentStep && goToStep(stepNum)}
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
