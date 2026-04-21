import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhoneNumber } from "@/lib/phone-mask";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { EmailInput } from "@/components/ui/email-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Building2 } from "lucide-react";
import { AddressValidationModal } from "./address-validation-modal";
import {
  useCreateClient,
  useCheckClientAvailability,
  useValidateClientAddress,
  useConfirmClient,
} from "@workspace/api-client-react";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

interface CreateClientWizardProps {
  onSuccess: (clientId: number) => void;
  onCancel: () => void;
  agentId?: number;
}

interface FormData {
  companyName: string;
  dbaName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  taxId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

type WizardStep = "form" | "availability" | "address-validation" | "confirmed";

export function CreateClientWizard({ onSuccess, onCancel, agentId }: CreateClientWizardProps) {
  const [step, setStep] = useState<WizardStep>("form");
  const [form, setForm] = useState<FormData>({
    companyName: "", dbaName: "", firstName: "", lastName: "",
    email: "", phone: "", taxId: "",
    addressLine1: "", addressLine2: "", city: "", state: "", zipCode: "", country: "United States",
  });
  const [validationResult, setValidationResult] = useState<{
    original: { addressLine1: string; addressLine2?: string; city: string; state: string; zipCode: string; country?: string };
    standardized: { addressLine1: string; addressLine2: string; city: string; state: string; zipCode: string; country: string; isStandardized: boolean; confidence: "high" | "medium" | "low"; suggestions: string[] };
  } | null>(null);
  const [useStandardized, setUseStandardized] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);

  const availParams = {
    companyName: form.companyName,
    state: form.state,
  };
  const { data: availability, isLoading: checkingAvailability } = useCheckClientAvailability(
    availParams,
    { query: { queryKey: ["/api/clients/check-availability", availParams] as const, enabled: step === "availability" && form.companyName.length > 0 } }
  );

  const validateMutation = useValidateClientAddress();
  const createMutation = useCreateClient();
  const confirmMutation = useConfirmClient();

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setAvailabilityChecked(false);
  };

  const handleCheckAvailability = () => {
    setStep("availability");
    setAvailabilityChecked(true);
  };

  const handleValidateAddress = () => {
    validateMutation.mutate(
      { data: { addressLine1: form.addressLine1, addressLine2: form.addressLine2 || undefined, city: form.city, state: form.state, zipCode: form.zipCode, country: form.country } },
      {
        onSuccess: (data) => {
          setValidationResult(data as typeof validationResult);
          setShowValidationModal(true);
          setStep("address-validation");
        },
      }
    );
  };

  const handleAcceptStandardized = () => {
    setUseStandardized(true);
    setShowValidationModal(false);
    handleCreateClient(true);
  };

  const handleKeepOriginal = () => {
    setUseStandardized(false);
    setShowValidationModal(false);
    handleCreateClient(false);
  };

  const handleCreateClient = (standardized: boolean) => {
    const addr = standardized && validationResult?.standardized
      ? {
          addressLine1: validationResult.standardized.addressLine1,
          addressLine2: validationResult.standardized.addressLine2 || undefined,
          city: validationResult.standardized.city,
          state: validationResult.standardized.state,
          zipCode: validationResult.standardized.zipCode,
          country: validationResult.standardized.country,
        }
      : {
          addressLine1: form.addressLine1 || undefined,
          addressLine2: form.addressLine2 || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          zipCode: form.zipCode || undefined,
          country: form.country || undefined,
        };

    createMutation.mutate(
      {
        data: {
          companyName: form.companyName,
          dbaName: form.dbaName || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          taxId: form.taxId || undefined,
          ...addr,
          createdByAgentId: agentId,
        },
      },
      {
        onSuccess: (data) => {
          confirmMutation.mutate(
            { id: data.id },
            {
              onSuccess: () => {
                setStep("confirmed");
                onSuccess(data.id);
              },
              onError: () => {
                setStep("confirmed");
                onSuccess(data.id);
              },
            }
          );
        },
      }
    );
  };

  const canProceed = form.companyName.trim().length > 0;
  const hasAddress = form.addressLine1 && form.city && form.state && form.zipCode;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            New Client Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input id="companyName" value={form.companyName} onChange={e => updateField("companyName", e.target.value)} placeholder="Enter business name" />
            </div>
            <div>
              <Label htmlFor="dbaName">DBA Name</Label>
              <Input id="dbaName" value={form.dbaName} onChange={e => updateField("dbaName", e.target.value)} placeholder="Doing business as" />
            </div>
            <div>
              <Label htmlFor="taxId">Tax ID / EIN</Label>
              <Input id="taxId" value={form.taxId} onChange={e => updateField("taxId", e.target.value)} placeholder="XX-XXXXXXX" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">Contact First Name</Label>
              <Input id="firstName" value={form.firstName} onChange={e => updateField("firstName", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="lastName">Contact Last Name</Label>
              <Input id="lastName" value={form.lastName} onChange={e => updateField("lastName", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <EmailInput id="email" value={form.email} onChange={(val) => updateField("email", val)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={e => updateField("phone", formatPhoneNumber(e.target.value))} placeholder="(555) 123-4567" maxLength={14} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="addressLine1">Street Address</Label>
                <AddressAutocomplete
                  value={form.addressLine1}
                  onChange={(val) => updateField("addressLine1", val)}
                  onSelect={(s) => {
                    updateField("addressLine1", s.address);
                    updateField("city", s.city);
                    updateField("state", s.state);
                    updateField("zipCode", s.zip);
                  }}
                  placeholder="Start typing an address..."
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="addressLine2">Suite / Unit</Label>
                <Input id="addressLine2" value={form.addressLine2} onChange={e => updateField("addressLine2", e.target.value)} placeholder="Suite 100" />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={e => updateField("city", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Select value={form.state} onValueChange={v => updateField("state", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input id="zipCode" value={form.zipCode} onChange={e => updateField("zipCode", e.target.value)} placeholder="10001" />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={form.country} onChange={e => updateField("country", e.target.value)} />
              </div>
            </div>
          </div>

          {step === "availability" && availabilityChecked && (
            <div className={`p-3 rounded-lg border ${availability?.available ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
              {checkingAvailability ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking availability...
                </div>
              ) : availability?.available ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Account is available
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm text-amber-600 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Existing account match found
                  </div>
                  {Array.isArray((availability as Record<string, unknown>)?.matchReasons) && ((availability as Record<string, unknown>).matchReasons as string[]).length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {((availability as Record<string, unknown>).matchReasons as string[]).map((reason: string, i: number) => (
                        <p key={i} className="text-xs text-amber-700">{reason}</p>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">
                    {availability?.existingAccounts.map(a => {
                      const account = a as typeof a & { email?: string };
                      return (
                        <div key={account.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">{account.accountStatus}</Badge>
                          <span>{account.companyName}</span>
                          {account.email && <span>({account.email})</span>}
                          {account.city && account.state && <span>— {account.city}, {account.state}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>

            {!availabilityChecked ? (
              <Button onClick={handleCheckAvailability} disabled={!canProceed}>
                Check Availability
              </Button>
            ) : hasAddress ? (
              <Button
                onClick={handleValidateAddress}
                disabled={validateMutation.isPending || createMutation.isPending || checkingAvailability || availability?.available !== true}
              >
                {validateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Validating...</>
                ) : checkingAvailability ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Checking...</>
                ) : (
                  "Validate Address & Create"
                )}
              </Button>
            ) : (
              <Button
                onClick={() => handleCreateClient(false)}
                disabled={createMutation.isPending || checkingAvailability || availability?.available !== true}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                ) : (
                  "Create Account"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {validationResult && (
        <AddressValidationModal
          open={showValidationModal}
          onOpenChange={setShowValidationModal}
          original={validationResult.original as { addressLine1: string; city: string; state: string; zipCode: string; country?: string }}
          standardized={validationResult.standardized}
          onAcceptStandardized={handleAcceptStandardized}
          onKeepOriginal={handleKeepOriginal}
          loading={createMutation.isPending}
        />
      )}
    </>
  );
}
