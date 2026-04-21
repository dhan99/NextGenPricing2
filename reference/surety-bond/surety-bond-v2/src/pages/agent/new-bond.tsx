import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCreateBond, useUpdateBond, useGetBond, useListPrincipals, useUpdateBondStatus, BondType } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, SendHorizontal } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/utils";

export function AgentNewBond() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const createBond = useCreateBond();
  const updateBond = useUpdateBond();
  const updateStatus = useUpdateBondStatus();
  const { data: principals, isLoading: principalsLoading } = useListPrincipals();

  const params = new URLSearchParams(searchString);
  const draftParam = params.get("draft");
  const renewFromId = params.get("renewFrom");
  const isRenewal = !!renewFromId;

  const { data: existingDraft } = useGetBond(
    Number(draftParam),
    { query: { enabled: !!draftParam, queryKey: ["getBond", Number(draftParam)] } }
  );

  const [draftId, setDraftId] = useState<number | null>(draftParam ? Number(draftParam) : null);

  const [formData, setFormData] = useState<{
    principalId: string;
    bondType: BondType;
    obligeeName: string;
    bondAmount: string;
    description: string;
    notes: string;
  }>({
    principalId: "",
    bondType: "contractor_license",
    obligeeName: "",
    bondAmount: "",
    description: "",
    notes: "",
  });

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (existingDraft && !hasLoaded.current) {
      hasLoaded.current = true;
      setFormData({
        principalId: String(existingDraft.principalId),
        bondType: existingDraft.bondType,
        obligeeName: existingDraft.obligeeName,
        bondAmount: String(existingDraft.bondAmount),
        description: existingDraft.description || "",
        notes: existingDraft.notes || "",
      });
      setDraftId(existingDraft.id);
    }
  }, [existingDraft]);

  const isValid = formData.principalId && formData.obligeeName && formData.bondAmount;

  const handleSaveDraft = async () => {
    if (!isValid) return;
    try {
      if (draftId) {
        await updateBond.mutateAsync({
          id: draftId,
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description || undefined,
            notes: formData.notes || undefined,
          }
        });
      } else {
        const bond = await createBond.mutateAsync({
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description || undefined,
            principalId: Number(formData.principalId),
            agentId: 1,
            notes: formData.notes || undefined,
          }
        });
        setDraftId(bond.id);
      }
      toast({
        title: "Draft Saved",
        description: "Bond application saved as draft.",
      });
      setLocation("/agent/dashboard");
    } catch (error) {
      toast({ title: "Save Failed", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      let bondId = draftId;
      if (bondId) {
        await updateBond.mutateAsync({
          id: bondId,
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description || undefined,
            notes: formData.notes || undefined,
          }
        });
      } else {
        const bond = await createBond.mutateAsync({
          data: {
            bondType: formData.bondType,
            obligeeName: formData.obligeeName,
            bondAmount: Number(formData.bondAmount),
            description: formData.description || undefined,
            principalId: Number(formData.principalId),
            agentId: 1,
            notes: formData.notes || undefined,
          }
        });
        bondId = bond.id;
      }
      await updateStatus.mutateAsync({
        id: bondId!,
        data: { status: "submitted" }
      });
      toast({
        title: "Application Submitted",
        description: "Bond application submitted to underwriting.",
      });
      setLocation("/agent/dashboard");
    } catch (error) {
      toast({ title: "Submission Failed", variant: "destructive" });
    }
  };

  return (
    <div className="animate-fadeUp max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <Link href="/agent/dashboard" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">
            {isRenewal ? "Renew Bond" : "Create New Bond"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            {isRenewal
              ? "Review and submit this renewal application on behalf of the principal."
              : "Create a bond application on behalf of a principal."}
          </p>
        </div>

        <Card className="shadow-xl shadow-black/5 border-border/50 overflow-hidden bg-card">
          <CardContent className="p-4 sm:p-8 space-y-5">
            <div className="space-y-2">
              <Label>Principal</Label>
              <Select
                value={formData.principalId}
                onValueChange={(v) => setFormData({ ...formData, principalId: v })}
                disabled={!!draftId}
              >
                <SelectTrigger className="h-12 bg-background border-border">
                  <SelectValue placeholder={principalsLoading ? "Loading..." : "Select a principal"} />
                </SelectTrigger>
                <SelectContent>
                  {principals?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.companyName || `${p.firstName} ${p.lastName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bond Type</Label>
              <Select value={formData.bondType} onValueChange={(v: string) => setFormData({ ...formData, bondType: v as BondType })}>
                <SelectTrigger className="h-12 bg-background border-border">
                  <SelectValue placeholder="Select a bond type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor_license">Contractor License</SelectItem>
                  <SelectItem value="performance">Performance Bond</SelectItem>
                  <SelectItem value="payment">Payment Bond</SelectItem>
                  <SelectItem value="permit">Permit Bond</SelectItem>
                  <SelectItem value="court">Court Bond</SelectItem>
                  <SelectItem value="fidelity">Fidelity Bond</SelectItem>
                  <SelectItem value="notary">Notary Bond</SelectItem>
                  <SelectItem value="customs">Customs Bond</SelectItem>
                  <SelectItem value="tax">Tax Bond</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Obligee Name</Label>
                <Input
                  placeholder="e.g. State of New York"
                  className="h-12"
                  value={formData.obligeeName}
                  onChange={(e) => setFormData({ ...formData, obligeeName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bond Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="50000"
                  className="h-12"
                  value={formData.bondAmount}
                  onChange={(e) => setFormData({ ...formData, bondAmount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Description (Optional)</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                placeholder="Briefly describe what this bond is for..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes for Underwriting (Optional)</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                placeholder="Any notes for the underwriting team..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            {formData.bondAmount && (
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <p className="text-sm text-muted-foreground">Estimated Bond Amount</p>
                <p className="text-xl font-bold text-[var(--accent)]">{formatCurrency(Number(formData.bondAmount))}</p>
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={!isValid || createBond.isPending || updateBond.isPending}
                className="min-h-[44px]"
              >
                <Save className="mr-2 h-4 w-4" /> Save as Draft
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createBond.isPending || updateBond.isPending || updateStatus.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 min-h-[44px]"
              >
                <SendHorizontal className="mr-2 h-4 w-4" />
                {createBond.isPending || updateBond.isPending || updateStatus.isPending ? "Submitting..." : "Submit to Underwriting"}
              </Button>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
