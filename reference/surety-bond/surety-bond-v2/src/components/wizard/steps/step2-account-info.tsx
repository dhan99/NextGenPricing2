import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPhoneNumber } from "@/lib/phone-mask";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { EmailInput } from "@/components/ui/email-input";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, ChevronRight, ChevronLeft, Plus, Building2, Loader2 } from "lucide-react";
import { useListClients, useCreateClient, useConfirmClient, useValidateClientAddress } from "@workspace/api-client-react";
import { AddressValidationModal } from "@/components/clients/address-validation-modal";
import { useAuth } from "@/hooks/use-auth";
import { ClientPreFillBanner } from "@/components/ai/client-prefill-banner";
import { RiskPreScreen } from "@/components/ai/risk-pre-screen";
import type { WizardState } from "../wizard-types";

interface Step2Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface NewAccountForm {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
}

const emptyAccount: NewAccountForm = {
  companyName: "", firstName: "", lastName: "", email: "", phone: "",
  addressLine1: "", city: "", state: "", zipCode: "",
};

export function Step2AccountInfo({ state, onUpdate, onNext, onBack }: Step2Props) {
  const [accountSearch, setAccountSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newAccount, setNewAccount] = useState<NewAccountForm>(emptyAccount);
  const [validationResult, setValidationResult] = useState<{
    original: { addressLine1: string; addressLine2?: string; city: string; state: string; zipCode: string; country?: string };
    standardized: { addressLine1: string; addressLine2: string; city: string; state: string; zipCode: string; country: string; isStandardized: boolean; confidence: "high" | "medium" | "low"; suggestions: string[] };
  } | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [addressValidated, setAddressValidated] = useState(false);
  const [createError, setCreateError] = useState("");
  const { agentId } = useAuth();

  const clientParams = { search: accountSearch, limit: 5 };
  const { data: clients, isLoading: clientsLoading } = useListClients(
    clientParams,
    { query: { queryKey: ["/api/clients", clientParams] as const, enabled: accountSearch.length >= 2 } }
  );

  const createMutation = useCreateClient();
  const confirmMutation = useConfirmClient();
  const validateMutation = useValidateClientAddress();

  const handleSelectClient = (client: { id: number; companyName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; addressLine1?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }) => {
    onUpdate({
      clientId: client.id,
      clientName: client.companyName,
      principalCompanyName: client.companyName,
      principalFirstName: client.firstName || "",
      principalLastName: client.lastName || "",
      principalEmail: client.email || "",
      principalPhone: client.phone || "",
      principalAddress: client.addressLine1 || "",
      principalCity: client.city || "",
      principalState: client.state || "",
      principalZip: client.zipCode || "",
    });
    setShowCreate(false);
  };

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!state.effectiveDate) {
      const eff = new Date(today);
      const exp = new Date(today);
      exp.setFullYear(exp.getFullYear() + 1);
      onUpdate({
        effectiveDate: today,
        expirationDate: exp.toISOString().split("T")[0],
      });
    } else if (!state.expirationDate) {
      const eff = new Date(state.effectiveDate);
      eff.setFullYear(eff.getFullYear() + 1);
      onUpdate({ expirationDate: eff.toISOString().split("T")[0] });
    }
  }, []);

  const handleEffectiveDateChange = (date: string) => {
    onUpdate({ effectiveDate: date });
    if (date) {
      const eff = new Date(date);
      eff.setFullYear(eff.getFullYear() + 1);
      onUpdate({ expirationDate: eff.toISOString().split("T")[0] });
    }
  };

  const handleValidateAddress = () => {
    if (!newAccount.addressLine1 || !newAccount.city || !newAccount.state || !newAccount.zipCode) return;

    validateMutation.mutate(
      {
        data: {
          addressLine1: newAccount.addressLine1,
          city: newAccount.city,
          state: newAccount.state,
          zipCode: newAccount.zipCode,
          country: "United States",
        },
      },
      {
        onSuccess: (result) => {
          setValidationResult(result as typeof validationResult);
          setShowValidationModal(true);
        },
      }
    );
  };

  const handleAcceptStandardized = () => {
    if (validationResult?.standardized) {
      setNewAccount((prev) => ({
        ...prev,
        addressLine1: validationResult.standardized.addressLine1,
        city: validationResult.standardized.city,
        state: validationResult.standardized.state,
        zipCode: validationResult.standardized.zipCode,
      }));
    }
    setShowValidationModal(false);
    setAddressValidated(true);
  };

  const handleKeepOriginal = () => {
    setShowValidationModal(false);
    setAddressValidated(true);
  };

  const handleCreateAccount = () => {
    if (!newAccount.companyName.trim()) return;
    setCreateError("");

    createMutation.mutate(
      {
        data: {
          companyName: newAccount.companyName,
          firstName: newAccount.firstName || undefined,
          lastName: newAccount.lastName || undefined,
          email: newAccount.email || undefined,
          phone: newAccount.phone || undefined,
          addressLine1: newAccount.addressLine1 || undefined,
          city: newAccount.city || undefined,
          state: newAccount.state || undefined,
          zipCode: newAccount.zipCode || undefined,
          country: "United States",
          createdByAgentId: agentId || undefined,
          skipAvailabilityCheck: true,
        },
      },
      {
        onSuccess: (data) => {
          confirmMutation.mutate(
            { id: data.id },
            {
              onSuccess: () => {
                handleSelectClient({
                  id: data.id,
                  companyName: data.companyName,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  email: data.email,
                  phone: data.phone,
                  addressLine1: data.addressLine1,
                  city: data.city,
                  state: data.state,
                  zipCode: data.zipCode,
                });
              },
              onError: () => {
                handleSelectClient({
                  id: data.id,
                  companyName: data.companyName,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  email: data.email,
                  phone: data.phone,
                  addressLine1: data.addressLine1,
                  city: data.city,
                  state: data.state,
                  zipCode: data.zipCode,
                });
              },
            }
          );
        },
        onError: (error: unknown) => {
          const apiErr = error as { data?: Record<string, unknown>; message?: string };
          const errorData = apiErr?.data as Record<string, unknown> | undefined;
          if (errorData?.error === "duplicate_client" && errorData.existingClientId) {
            handleSelectClient({
              id: errorData.existingClientId as number,
              companyName: newAccount.companyName,
              firstName: newAccount.firstName || undefined,
              lastName: newAccount.lastName || undefined,
              email: newAccount.email || undefined,
              phone: newAccount.phone || undefined,
              addressLine1: newAccount.addressLine1 || undefined,
              city: newAccount.city || undefined,
              state: newAccount.state || undefined,
              zipCode: newAccount.zipCode || undefined,
            });
          } else {
            const message = (errorData?.message as string) || apiErr?.message || "Failed to create account. Please try again.";
            setCreateError(message);
          }
        },
      }
    );
  };

  const hasAddress = newAccount.addressLine1 && newAccount.city && newAccount.state && newAccount.zipCode;
  const canProceed = state.clientId !== null && state.effectiveDate && state.expirationDate;

  const showAiSidebar = !!(state.clientId && state.bondFormName);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Account Information</h2>
        <p className="text-sm text-muted-foreground">
          Set bond term dates and select or create an account.
        </p>
        {state.bondFormName && (
          <div className="mt-2 flex items-center gap-2 text-[12.5px]">
            <span className="text-[var(--text-muted)]">Bond Form:</span>
            <span className="font-semibold text-[var(--slate-800)]">{state.bondFormName}</span>
            {state.bondFormClassCode && (
              <Badge variant="secondary" className="text-[10px] py-0">{state.bondFormClassCode}</Badge>
            )}
          </div>
        )}
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium text-sm">Bond Term</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input
                type="date"
                className="h-11"
                value={state.effectiveDate}
                onChange={(e) => handleEffectiveDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiration Date</Label>
              <Input
                type="date"
                className="h-11"
                value={state.expirationDate}
                onChange={(e) => onUpdate({ expirationDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Account</h3>
            {!showCreate && !state.clientId && (
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> New Account
              </Button>
            )}
          </div>

          {state.clientId ? (
            <Card className="bg-emerald-500/5 border-emerald-500/30">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="font-medium text-sm">{state.clientName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs text-emerald-500">Account verified</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onUpdate({ clientId: null, clientName: "" });
                    setShowCreate(false);
                  }}
                >
                  Change
                </Button>
              </CardContent>
            </Card>
          ) : !showCreate ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search existing accounts..."
                  className="pl-10 h-11"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </div>

              {clientsLoading && accountSearch.length >= 2 && (
                <p className="text-xs text-muted-foreground">Searching...</p>
              )}

              {clients?.data && clients.data.length > 0 && (
                <div className="space-y-1.5">
                  {clients.data.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/50 cursor-pointer transition-colors"
                      onClick={() => handleSelectClient(c)}
                    >
                      <div>
                        <p className="text-sm font-medium">{c.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.city}{c.state ? `, ${c.state}` : ""}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">{c.accountStatus}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {accountSearch.length >= 2 && clients?.data && clients.data.length === 0 && !clientsLoading && (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground mb-2">No accounts found</p>
                  <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Create New Account
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Company Name *</Label>
                  <Input
                    className="h-10"
                    placeholder="Business name"
                    value={newAccount.companyName}
                    onChange={(e) => setNewAccount({ ...newAccount, companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">First Name</Label>
                  <Input className="h-10" value={newAccount.firstName} onChange={(e) => setNewAccount({ ...newAccount, firstName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last Name</Label>
                  <Input className="h-10" value={newAccount.lastName} onChange={(e) => setNewAccount({ ...newAccount, lastName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <EmailInput className="h-10" value={newAccount.email} onChange={(val) => setNewAccount({ ...newAccount, email: val })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-10" type="tel" placeholder="(555) 123-4567" value={newAccount.phone} onChange={(e) => setNewAccount({ ...newAccount, phone: formatPhoneNumber(e.target.value) })} maxLength={14} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Address</Label>
                    {addressValidated && (
                      <span className="text-xs text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Validated
                      </span>
                    )}
                  </div>
                  <AddressAutocomplete
                    value={newAccount.addressLine1}
                    onChange={(val) => { setNewAccount({ ...newAccount, addressLine1: val }); setAddressValidated(false); }}
                    onSelect={(s) => { setNewAccount({ ...newAccount, addressLine1: s.address, city: s.city, state: s.state, zipCode: s.zip }); setAddressValidated(false); }}
                    placeholder="Start typing an address..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input className="h-10" value={newAccount.city} onChange={(e) => { setNewAccount({ ...newAccount, city: e.target.value }); setAddressValidated(false); }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">State</Label>
                    <Input className="h-10" value={newAccount.state} onChange={(e) => { setNewAccount({ ...newAccount, state: e.target.value }); setAddressValidated(false); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ZIP</Label>
                    <Input className="h-10" value={newAccount.zipCode} onChange={(e) => { setNewAccount({ ...newAccount, zipCode: e.target.value }); setAddressValidated(false); }} />
                  </div>
                </div>
              </div>
              {createError && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-md">{createError}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewAccount(emptyAccount); setAddressValidated(false); setCreateError(""); }}>Cancel</Button>
                {hasAddress && !addressValidated && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleValidateAddress}
                    disabled={validateMutation.isPending}
                    className="gap-1"
                  >
                    {validateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Validate Address
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={!newAccount.companyName.trim() || createMutation.isPending}
                  onClick={handleCreateAccount}
                  className="gap-1"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Create & Use Account
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Bond Form
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          About the Applicant <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {showValidationModal && validationResult && (
        <AddressValidationModal
          open={showValidationModal}
          onOpenChange={setShowValidationModal}
          original={validationResult.original}
          standardized={validationResult.standardized}
          onAcceptStandardized={handleAcceptStandardized}
          onKeepOriginal={handleKeepOriginal}
        />
      )}
    </div>

    {showAiSidebar && (
      <div className="hidden lg:block sticky top-4 space-y-4">
        <ClientPreFillBanner
          clientId={state.clientId!}
          clientName={state.clientName}
          clientEmail={state.principalEmail}
          clientPhone={state.principalPhone}
          clientAddress={state.principalAddress}
          clientCity={state.principalCity}
          clientState={state.principalState}
          clientZip={state.principalZip}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          onApplyPreFill={(fields) => onUpdate(fields as Partial<WizardState>)}
        />
        <RiskPreScreen
          clientId={state.clientId!}
          clientName={state.clientName}
          clientState={state.principalState}
          bondFormName={state.bondFormName}
          bondFormType={state.bondFormType}
          bondAmount={state.bondAmount}
        />
      </div>
    )}
    </div>
  );
}
