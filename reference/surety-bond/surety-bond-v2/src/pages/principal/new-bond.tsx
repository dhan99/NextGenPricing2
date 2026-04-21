import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCreateBond, useUpdateBond, useGetBond, useUpdateBondStatus, useListObligees, BondType } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, ArrowRight, CheckCircle2, Building, FileText, Upload, ChevronsUpDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, cn } from "@/lib/utils";

export function PrincipalNewBond() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const createBond = useCreateBond();
  const updateBond = useUpdateBond();
  const updateStatus = useUpdateBondStatus();
  const [obligeeOpen, setObligeeOpen] = useState(false);
  const { data: allObligees } = useListObligees();

  const params = new URLSearchParams(searchString);
  const draftParam = params.get("draft");

  const { data: draftBond } = useGetBond(
    Number(draftParam),
    { query: { enabled: !!draftParam, queryKey: ["getBond", Number(draftParam)] } }
  );

  const [draftId, setDraftId] = useState<number | null>(draftParam ? Number(draftParam) : null);
  const [formData, setFormData] = useState<{
    bondType: BondType;
    obligeeName: string;
    bondAmount: string;
    description: string;
    agentEmail: string;
  }>({
    bondType: "contractor_license",
    obligeeName: "",
    bondAmount: "",
    description: "",
    agentEmail: "",
  });

  const hasLoadedDraft = useRef(false);

  useEffect(() => {
    if (draftBond && !hasLoadedDraft.current) {
      hasLoadedDraft.current = true;
      setFormData({
        bondType: draftBond.bondType,
        obligeeName: draftBond.obligeeName,
        bondAmount: String(draftBond.bondAmount),
        description: draftBond.description || "",
        agentEmail: "",
      });
      setDraftId(draftBond.id);
    }
  }, [draftBond]);

  const saveDraftRef = useRef(draftId);
  saveDraftRef.current = draftId;

  const saveDraft = useCallback(async (currentFormData: typeof formData) => {
    try {
      const currentDraftId = saveDraftRef.current;
      if (currentDraftId) {
        await updateBond.mutateAsync({
          id: currentDraftId,
          data: {
            bondType: currentFormData.bondType,
            obligeeName: currentFormData.obligeeName || undefined,
            bondAmount: currentFormData.bondAmount ? Number(currentFormData.bondAmount) : undefined,
            description: currentFormData.description || undefined,
            ...(currentFormData.agentEmail ? { agentEmail: currentFormData.agentEmail } : {}),
          } as Record<string, unknown>
        });
      } else {
        const bond = await createBond.mutateAsync({
          data: {
            bondType: currentFormData.bondType,
            obligeeName: currentFormData.obligeeName || "TBD",
            bondAmount: Number(currentFormData.bondAmount) || 0,
            description: currentFormData.description || undefined,
            principalId: 1,
            ...(currentFormData.agentEmail ? { agentEmail: currentFormData.agentEmail } : {}),
          } as Record<string, unknown>
        });
        setDraftId(bond.id);
        saveDraftRef.current = bond.id;
      }
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  }, [updateBond, createBond]);

  const nextStep = async () => {
    await saveDraft(formData);
    setStep(s => Math.min(3, s + 1));
  };

  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const filteredObligees = (allObligees ?? []).filter((ob) => {
    if (!formData.obligeeName) return true;
    return ob.name.toLowerCase().includes(formData.obligeeName.toLowerCase());
  });

  const selectObligee = (obligee: { name: string }) => {
    setFormData({ ...formData, obligeeName: obligee.name });
    setObligeeOpen(false);
  };

  const handleSubmit = async () => {
    try {
      let bondId = draftId;
      let agentLinked = false;
      if (!bondId) {
        const bond = await createBond.mutateAsync({
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description,
            principalId: 1,
            ...(formData.agentEmail ? { agentEmail: formData.agentEmail } : {}),
          } as Record<string, unknown>
        });
        bondId = bond.id;
        agentLinked = !!(bond as Record<string, unknown>).agentLinked;
      } else {
        const updated = await updateBond.mutateAsync({
          id: bondId,
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description,
            ...(formData.agentEmail ? { agentEmail: formData.agentEmail } : {}),
          } as Record<string, unknown>
        });
        agentLinked = !!(updated as Record<string, unknown>).agentId;
      }

      await updateStatus.mutateAsync({
        id: bondId!,
        data: { status: "submitted" }
      });
      
      toast({
        title: "Application Submitted",
        description: "Your bond application has been successfully submitted for review.",
      });

      if (formData.agentEmail && !agentLinked) {
        toast({
          title: "Agent Not Found",
          description: `No agent was found with email "${formData.agentEmail}". You can update this later.`,
          variant: "destructive",
        });
      }
      
      setLocation("/principal/dashboard");
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Please check your inputs and try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
      <div className="max-w-3xl mx-auto">
        <div className={isMobile ? 'mb-2' : 'mb-6 sm:mb-8'}>
          {!isMobile && <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">Apply for a Bond</h1>}
          {!isMobile && <p className="text-[13.5px] text-[var(--text-muted)] mt-2">Complete this simple form to get your bond processed instantly.</p>}
          {draftId && (
            <p className="text-xs text-primary mt-1 font-medium">Continuing from saved draft</p>
          )}
        </div>

        <div className="flex items-center justify-between mb-8 sm:mb-12 relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border/60 -z-10" />
          {[
            { num: 1, label: "Your Details", icon: <Building className="h-4 w-4" /> },
            { num: 2, label: "Bond Info", icon: <FileText className="h-4 w-4" /> },
            { num: 3, label: "Review", icon: <CheckCircle2 className="h-4 w-4" /> }
          ].map((s) => (
            <div key={s.num} className="flex flex-col items-center gap-1.5 sm:gap-2 bg-[var(--slate-50)] px-1.5 sm:px-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold border-2 transition-colors text-sm ${
                step >= s.num 
                  ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/20" 
                  : "bg-background border-border text-muted-foreground"
              }`}>
                {step > s.num ? <CheckCircle2 className="h-5 w-5" /> : s.num}
              </div>
              <span className={`text-[10px] sm:text-xs font-semibold text-center ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <Card className="shadow-xl shadow-black/5 border-border/50 overflow-hidden bg-card">
          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 sm:p-8 space-y-4 sm:space-y-6"
                >
                  <div className="bg-[var(--s-blue-bg)] p-3 sm:p-4 rounded-xl border border-blue-200 flex gap-3 sm:gap-4">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <strong>Good news!</strong> Since you are an existing customer, we've pre-filled your business information. Please verify it is correct before proceeding.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input value="Acme Construction Corp" disabled className="bg-muted/50 h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tax ID / EIN</Label>
                      <Input value="XX-XXXX421" disabled className="bg-muted/50 h-12" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Business Address</Label>
                      <Input value="123 Builder Lane, Suite 100, New York, NY 10001" disabled className="bg-muted/50 h-12" />
                    </div>
                  </div>

                  <div className="pt-4 sm:pt-6 flex justify-end">
                    <Button onClick={nextStep} className="px-6 sm:px-8 shadow-md min-h-[44px]">
                      Confirm & Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div 
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 sm:p-8 space-y-4 sm:space-y-6"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Bond Type</Label>
                      <Select value={formData.bondType} onValueChange={(v: string) => setFormData({...formData, bondType: v as BondType})}>
                        <SelectTrigger className="h-12 bg-background border-border">
                          <SelectValue placeholder="Select a bond type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contractor_license">Contractor License</SelectItem>
                          <SelectItem value="performance">Performance Bond</SelectItem>
                          <SelectItem value="payment">Payment Bond</SelectItem>
                          <SelectItem value="permit">Permit Bond</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Obligee Name (Requiring the bond)</Label>
                        <Popover open={obligeeOpen} onOpenChange={setObligeeOpen}>
                          <PopoverAnchor asChild>
                            <div className="relative">
                              <Input 
                                placeholder="Type or select an obligee..." 
                                className="h-12 pr-8"
                                value={formData.obligeeName}
                                onChange={(e) => {
                                  setFormData({...formData, obligeeName: e.target.value});
                                  if (e.target.value.length > 0 && !obligeeOpen) {
                                    setObligeeOpen(true);
                                  }
                                }}
                                onFocus={() => { if (filteredObligees.length > 0) setObligeeOpen(true); }}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-12 w-8 p-0"
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
                                <CommandEmpty>No matching obligee — your custom name will be used.</CommandEmpty>
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
                                          formData.obligeeName === ob.name ? "opacity-100" : "opacity-0"
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
                      <div className="space-y-2">
                        <Label>Required Bond Amount ($)</Label>
                        <Input 
                          type="number" 
                          placeholder="50000" 
                          className="h-12"
                          value={formData.bondAmount}
                          onChange={(e) => setFormData({...formData, bondAmount: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Project Description (Optional)</Label>
                      <textarea 
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                        placeholder="Briefly describe what this bond is for..."
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Agent Email (Optional)</Label>
                      <Input
                        type="email"
                        placeholder="agent@example.com"
                        className="h-12"
                        value={formData.agentEmail}
                        onChange={(e) => setFormData({...formData, agentEmail: e.target.value})}
                      />
                      <p className="text-xs text-muted-foreground">If you have an agent, enter their email to link this bond to them.</p>
                    </div>
                  </div>

                  <div className="pt-4 sm:pt-6 flex justify-between gap-3">
                    <Button variant="ghost" onClick={prevStep} className="min-h-[44px]">
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button 
                      onClick={nextStep} 
                      className="px-6 sm:px-8 shadow-md min-h-[44px]"
                      disabled={!formData.obligeeName || !formData.bondAmount}
                    >
                      Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div 
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 sm:p-8 space-y-6 sm:space-y-8"
                >
                  <div className="bg-[var(--slate-50)] p-4 sm:p-6 rounded-xl border border-[var(--border-color)] space-y-4">
                    <h3 className="font-semibold text-lg border-b border-border/50 pb-2">Review Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 text-sm">
                      <div className="text-muted-foreground">Bond Type</div>
                      <div className="font-medium capitalize">{formData.bondType.replace('_', ' ')}</div>
                      
                      <div className="text-muted-foreground">Obligee</div>
                      <div className="font-medium">{formData.obligeeName}</div>
                      
                      <div className="text-muted-foreground">Amount</div>
                      <div className="font-medium text-primary">{formatCurrency(Number(formData.bondAmount))}</div>

                      {formData.agentEmail && (
                        <>
                          <div className="text-muted-foreground">Agent Email</div>
                          <div className="font-medium">{formData.agentEmail}</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-border/60 rounded-xl p-6 sm:p-8 text-center bg-background transition-colors hover:border-primary/50 cursor-pointer group">
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                    <h4 className="font-medium mb-1 text-sm sm:text-base">Attach Supporting Documents (Optional)</h4>
                    <p className="text-xs text-muted-foreground mb-4">Financials, contracts, or application forms</p>
                    <Button variant="outline" size="sm" className="bg-card min-h-[44px]">Select Files</Button>
                  </div>

                  <div className="pt-2 flex justify-between gap-3">
                    <Button variant="ghost" onClick={prevStep} className="min-h-[44px]">
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button 
                      onClick={handleSubmit} 
                      className="px-6 sm:px-8 text-white shadow-lg min-h-[44px]"
                      style={{ background: 'var(--s-green)' }}
                      disabled={createBond.isPending || updateStatus.isPending}
                    >
                      {createBond.isPending || updateStatus.isPending ? "Submitting..." : "Submit Application"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
