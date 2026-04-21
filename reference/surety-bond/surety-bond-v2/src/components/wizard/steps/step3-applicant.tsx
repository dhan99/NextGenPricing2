import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPhoneNumber } from "@/lib/phone-mask";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { EmailInput } from "@/components/ui/email-input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronRight, ChevronLeft, User, Building, ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { useGetBondForm, useListObligees } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { AIFormAssistant } from "@/components/ai/ai-form-assistant";
import { SmartAlerts } from "@/components/ai/smart-alerts";
import { useObligeeSearch } from "@/hooks/use-ai-underwriting";
import type { WizardState } from "../wizard-types";

interface Step3Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Applicant({ state, onUpdate, onNext, onBack }: Step3Props) {
  const [obligeeOpen, setObligeeOpen] = useState(false);
  const obligeeInputRef = useRef<HTMLInputElement>(null);
  const obligeeDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: bondFormDetail } = useGetBondForm(
    state.bondFormId!,
    { query: { queryKey: [`/api/bond-forms/${state.bondFormId}`] as const, enabled: !!state.bondFormId } }
  );

  const { data: allObligees } = useListObligees();
  const { results: aiObligeeResults, loading: aiObligeeLoading, searchObligees } = useObligeeSearch();

  useEffect(() => {
    if (obligeeDebounceRef.current) clearTimeout(obligeeDebounceRef.current);
    if (state.obligeeName.length >= 2) {
      obligeeDebounceRef.current = setTimeout(() => {
        searchObligees(state.obligeeName);
      }, 300);
    }
    return () => {
      if (obligeeDebounceRef.current) clearTimeout(obligeeDebounceRef.current);
    };
  }, [state.obligeeName]);

  useEffect(() => {
    if (bondFormDetail && bondFormDetail.obligees && bondFormDetail.obligees.length > 0) {
      const ob = bondFormDetail.obligees[0];
      if (!state.obligeeName) {
        onUpdate({
          obligeeName: ob.name || "",
          obligeeAddress: ob.addressLine1 || "",
          obligeeCity: ob.city || "",
          obligeeState: ob.state || "",
          obligeeZip: ob.zipCode || "",
        });
      }
    }
  }, [bondFormDetail]);

  const selectObligee = (obligee: { name: string; addressLine1?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }) => {
    onUpdate({
      obligeeName: obligee.name,
      obligeeAddress: obligee.addressLine1 || "",
      obligeeCity: obligee.city || "",
      obligeeState: obligee.state || "",
      obligeeZip: obligee.zipCode || "",
    });
    setObligeeOpen(false);
  };

  const localFiltered = (allObligees ?? []).filter((ob) => {
    if (!state.obligeeName) return true;
    return ob.name.toLowerCase().includes(state.obligeeName.toLowerCase());
  });

  const aiOnlyResults = aiObligeeResults.filter(
    (ai) => !localFiltered.some((local) => local.id === ai.id)
  );

  const filteredObligees = [
    ...localFiltered,
    ...aiOnlyResults.map((ai) => ({
      id: ai.id,
      name: ai.name,
      addressLine1: ai.addressLine1,
      city: ai.city,
      state: ai.state,
      zipCode: ai.zipCode,
      additionalName: null as string | null,
      addressLine2: null as string | null,
      country: "United States",
      createdAt: "",
    })),
  ];

  const canProceed =
    state.principalCompanyName.trim().length > 0 &&
    state.obligeeName.trim().length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">About the Applicant</h2>
          <p className="text-sm text-muted-foreground">
            Confirm principal and obligee information.
          </p>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Principal Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Company Name</Label>
                <Input
                  className="h-10"
                  value={state.principalCompanyName}
                  onChange={(e) => onUpdate({ principalCompanyName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input className="h-10" value={state.principalFirstName} onChange={(e) => onUpdate({ principalFirstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input className="h-10" value={state.principalLastName} onChange={(e) => onUpdate({ principalLastName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <EmailInput className="h-10" value={state.principalEmail} onChange={(val) => onUpdate({ principalEmail: val })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input className="h-10" type="tel" placeholder="(555) 123-4567" value={state.principalPhone} onChange={(e) => onUpdate({ principalPhone: formatPhoneNumber(e.target.value) })} maxLength={14} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Address</Label>
                <AddressAutocomplete
                  value={state.principalAddress}
                  onChange={(val) => onUpdate({ principalAddress: val })}
                  onSelect={(s) => onUpdate({ principalAddress: s.address, principalCity: s.city, principalState: s.state, principalZip: s.zip })}
                  placeholder="Start typing an address..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input className="h-10" value={state.principalCity} onChange={(e) => onUpdate({ principalCity: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input className="h-10" value={state.principalState} onChange={(e) => onUpdate({ principalState: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ZIP</Label>
                  <Input className="h-10" value={state.principalZip} onChange={(e) => onUpdate({ principalZip: e.target.value })} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" /> Obligee Information
              </h3>
              {bondFormDetail?.obligees && bondFormDetail.obligees.length > 0 && (
                <span className="text-xs text-muted-foreground">Auto-filled from bond form</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Obligee Name *</Label>
                <Popover open={obligeeOpen} onOpenChange={setObligeeOpen}>
                  <PopoverAnchor asChild>
                    <div className="relative">
                      <Input
                        className="h-10 pr-8"
                        value={state.obligeeName}
                        onChange={(e) => {
                          onUpdate({ obligeeName: e.target.value });
                          if (e.target.value.length > 0 && !obligeeOpen) {
                            setObligeeOpen(true);
                          }
                        }}
                        onFocus={() => { if (filteredObligees.length > 0) setObligeeOpen(true); }}
                        placeholder="Type or select an obligee..."
                        ref={obligeeInputRef}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-10 w-8 p-0"
                        onClick={() => setObligeeOpen(!obligeeOpen)}
                      >
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <Command shouldFilter={false}>
                      <CommandList>
                        <CommandEmpty>
                          {aiObligeeLoading ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                            </span>
                          ) : (
                            "No matching obligee — your custom name will be used."
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredObligees.map((ob) => (
                            <CommandItem
                              key={ob.id}
                              value={ob.name}
                              onSelect={() => selectObligee(ob)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  state.obligeeName === ob.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">{ob.name}</span>
                                {(ob.city || ob.state) && (
                                  <span className="text-xs text-muted-foreground">
                                    {[ob.city, ob.state].filter(Boolean).join(", ")}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Address</Label>
                <AddressAutocomplete
                  value={state.obligeeAddress}
                  onChange={(val) => onUpdate({ obligeeAddress: val })}
                  onSelect={(s) => onUpdate({
                    obligeeAddress: s.address,
                    obligeeCity: s.city,
                    obligeeState: s.state,
                    obligeeZip: s.zip,
                  })}
                  placeholder="Start typing an address..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input className="h-10" value={state.obligeeCity} onChange={(e) => onUpdate({ obligeeCity: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input className="h-10" value={state.obligeeState} onChange={(e) => onUpdate({ obligeeState: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ZIP</Label>
                  <Input className="h-10" value={state.obligeeZip} onChange={(e) => onUpdate({ obligeeZip: e.target.value })} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Account Info
          </Button>
          <Button onClick={onNext} disabled={!canProceed} className="gap-2">
            Bond Information <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="hidden lg:block sticky top-4 space-y-4">
        <AIFormAssistant
          currentStep={3}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          bondAmount={state.bondAmount}
          principalCompanyName={state.principalCompanyName}
          principalState={state.principalState}
          obligeeName={state.obligeeName}
          effectiveDate={state.effectiveDate}
          expirationDate={state.expirationDate}
          onApplySuggestion={(field, value) => onUpdate({ [field]: value })}
        />

        <SmartAlerts
          context={{
            bondType: state.bondFormType,
            state: state.principalState,
          }}
          compact
        />
      </div>

      <div className="lg:hidden col-span-1 space-y-4">
        <AIFormAssistant
          currentStep={3}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          bondAmount={state.bondAmount}
          principalCompanyName={state.principalCompanyName}
          principalState={state.principalState}
          obligeeName={state.obligeeName}
          effectiveDate={state.effectiveDate}
          expirationDate={state.expirationDate}
          onApplySuggestion={(field, value) => onUpdate({ [field]: value })}
        />

        <SmartAlerts
          context={{
            bondType: state.bondFormType,
            state: state.principalState,
          }}
          compact
        />
      </div>
    </div>
  );
}
