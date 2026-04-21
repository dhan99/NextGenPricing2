import { Check } from "lucide-react";

interface WizardProgressProps {
  currentStep: number;
  steps: string[];
}

export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((label, idx) => {
          const stepNum = idx + 1;
          const isCompleted = currentStep > stepNum;
          const isCurrent = currentStep === stepNum;

          return (
            <div key={idx} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                    isCompleted
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : isCurrent
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 text-muted-foreground bg-muted/30"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <span
                  className={`text-[10px] mt-1.5 text-center leading-tight max-w-[80px] ${
                    isCurrent ? "text-primary font-medium" : isCompleted ? "text-emerald-500" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mt-[-18px] ${
                    isCompleted ? "bg-emerald-500" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
