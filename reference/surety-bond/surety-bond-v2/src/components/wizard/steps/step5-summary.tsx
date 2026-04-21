import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, ChevronLeft, Edit3, FileText, Mail, CreditCard, Phone, MapPin, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/phone-mask";
import { isValidEmail } from "@/lib/email-validation";
import { EmailInput } from "@/components/ui/email-input";
import type { WizardState } from "../wizard-types";

interface Step5Props {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onGoToStep: (step: number) => void;
}

export function Step5Summary({ state, onUpdate, onNext, onBack, onGoToStep }: Step5Props) {
  useEffect(() => {
    if (state.billingType === "credit_card" && !state.ccPrincipalEmail && state.principalEmail) {
      onUpdate({ ccPrincipalEmail: state.principalEmail });
    }
  }, [state.billingType]);

  const bondAmount = parseFloat(state.bondAmount) || 0;
  const premium = state.premiumCalculated || 0;
  const surchargeAmt = state.surcharge || Math.round(premium * 0.03);
  const serviceFee = Math.round(premium * 0.05);
  const stampingFee = Math.round(premium * 0.0025);
  const total = premium + surchargeAmt + serviceFee + stampingFee;

  const phoneDigits = (state.ccPrincipalPhone || "").replace(/\D/g, "");

  const billingValid = (() => {
    if (state.billingType === "credit_card") {
      return (
        phoneDigits.length === 10 &&
        state.ccOtpConsent &&
        !!state.ccPrincipalEmail?.trim() &&
        isValidEmail(state.ccPrincipalEmail)
      );
    }
    if (state.billingType === "direct_bill") {
      if (state.usePrincipalAsBilling) return true;
      return (
        !!state.billingAddress?.trim() &&
        !!state.billingCity?.trim() &&
        !!state.billingState?.trim() &&
        !!state.billingZip?.trim()
      );
    }
    return true;
  })();

  const canProceed =
    state.conditionsAccepted &&
    state.termsAccepted &&
    !!state.billingType &&
    billingValid;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Application Summary</h2>
        <p className="text-sm text-muted-foreground">
          Review all details before proceeding to payment.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Account / Principal</h3>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(3)} className="h-7 text-xs gap-1">
              <Edit3 className="h-3 w-3" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Company</span>
              <p className="font-medium">{state.principalCompanyName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Contact</span>
              <p>{state.principalFirstName} {state.principalLastName}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Email</span>
              <p>{state.principalEmail || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Phone</span>
              <p>{state.principalPhone || "—"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Address</span>
              <p>{state.principalAddress}{state.principalCity ? `, ${state.principalCity}` : ""}{state.principalState ? `, ${state.principalState}` : ""} {state.principalZip}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Obligee</h3>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(3)} className="h-7 text-xs gap-1">
              <Edit3 className="h-3 w-3" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Name</span>
              <p className="font-medium">{state.obligeeName || "—"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Address</span>
              <p>{state.obligeeAddress}{state.obligeeCity ? `, ${state.obligeeCity}` : ""}{state.obligeeState ? `, ${state.obligeeState}` : ""} {state.obligeeZip}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Bond Details</h3>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(4)} className="h-7 text-xs gap-1">
              <Edit3 className="h-3 w-3" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Bond Form</span>
              <p className="font-medium">{state.bondFormName || state.customBondFormName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Bond Amount</span>
              <p className="font-medium">{formatCurrency(bondAmount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Effective Date</span>
              <p>{state.effectiveDate || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Expiration Date</span>
              <p>{state.expirationDate || "—"}</p>
            </div>
            {state.attorneyInFact && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Attorney-in-Fact</span>
                <p>{state.attorneyInFact}</p>
              </div>
            )}
            {state.bondDescription && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Description</span>
                <p className="text-xs">{state.bondDescription}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-medium text-sm">Cost Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bond Premium</span>
              <span>{formatCurrency(premium)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Surcharge</span>
              <span>{formatCurrency(surchargeAmt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Fee</span>
              <span>{formatCurrency(serviceFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stamping Fee</span>
              <span>{formatCurrency(stampingFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total Due</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Documents
          </h3>
          <div className="space-y-1.5 text-sm">
            <a href="#" className="text-primary hover:underline block">Application Summary (PDF)</a>
            <a href="#" className="text-primary hover:underline block">Certificates of Authority</a>
            <a href="#" className="text-primary hover:underline block">Bond Form Draft</a>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Billing & Preferences
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              {[
                { value: "agency_bill", label: "Agency Bill" },
                { value: "direct_bill", label: "Direct Bill" },
                { value: "credit_card", label: "Credit Card" },
              ].map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="billingType"
                    checked={state.billingType === type.value}
                    onChange={() => onUpdate({
                      billingType: type.value,
                      ccPaymentRequested: false,
                      ccPaymentToken: "",
                    })}
                    className="accent-primary"
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>

            {!state.billingType && (
              <p className="text-xs text-amber-500">
                Please select a billing method to proceed.
              </p>
            )}

            {state.billingType === "agency_bill" && (
              <p className="text-xs text-muted-foreground">
                The premium will be billed to your agency account. Invoice will be generated upon issuance.
              </p>
            )}

            {state.billingType === "direct_bill" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-2 text-xs text-blue-500 bg-blue-500/5 p-2.5 rounded-lg border border-blue-500/10">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>A customer receiving an invoice directly from Surety Demo App must submit payment within 35 days from the purchase date.</span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.usePrincipalAsBilling}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      onUpdate({
                        usePrincipalAsBilling: checked,
                        billingAddress: checked ? state.principalAddress : "",
                        billingCity: checked ? state.principalCity : "",
                        billingState: checked ? state.principalState : "",
                        billingZip: checked ? state.principalZip : "",
                      });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Use principal address as billing address
                  </span>
                </label>

                {state.usePrincipalAsBilling ? (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Billing Address</p>
                    <p>{state.principalAddress || "—"}</p>
                    <p>{[state.principalCity, state.principalState, state.principalZip].filter(Boolean).join(", ") || "—"}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Billing Address</Label>
                      <Input
                        value={state.billingAddress}
                        onChange={(e) => onUpdate({ billingAddress: e.target.value })}
                        placeholder="Street address"
                        className="h-9 mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">City</Label>
                        <Input
                          value={state.billingCity}
                          onChange={(e) => onUpdate({ billingCity: e.target.value })}
                          placeholder="City"
                          className="h-9 mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">State</Label>
                        <Input
                          value={state.billingState}
                          onChange={(e) => onUpdate({ billingState: e.target.value })}
                          placeholder="ST"
                          className="h-9 mt-1"
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">ZIP</Label>
                        <Input
                          value={state.billingZip}
                          onChange={(e) => onUpdate({ billingZip: e.target.value })}
                          placeholder="ZIP"
                          className="h-9 mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {state.billingType === "credit_card" && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Choose one of the following options:
                </p>
                <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-lg border border-primary/20 bg-primary/5">
                  <input type="radio" checked readOnly className="accent-primary" />
                  <span className="text-sm font-medium">Request payment by email</span>
                </label>
                <div className="space-y-3 pl-1">
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Principal's Cell Phone
                    </Label>
                    <Input
                      value={state.ccPrincipalPhone}
                      onChange={(e) => onUpdate({ ccPrincipalPhone: formatPhoneNumber(e.target.value) })}
                      placeholder="(555) 555-1234"
                      className="h-9 mt-1"
                      maxLength={14}
                    />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.ccOtpConsent}
                      onChange={(e) => onUpdate({ ccOtpConsent: e.target.checked })}
                      className="accent-primary mt-1"
                    />
                    <span className="text-xs text-muted-foreground">
                      Principal consents to receive a text message with a one-time authentication code to this number in order to make payment.
                    </span>
                  </label>
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Principal's Email Address
                    </Label>
                    <EmailInput
                      value={state.ccPrincipalEmail}
                      onChange={(val) => onUpdate({ ccPrincipalEmail: val })}
                      placeholder="principal@email.com"
                      className="h-9 mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.emailCopy}
                onChange={(e) => onUpdate({ emailCopy: e.target.checked })}
                className="accent-primary"
              />
              <span className="text-sm flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Send email copy of documents
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-medium text-sm">Conditions</h3>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.conditionsAccepted}
              onChange={(e) => onUpdate({ conditionsAccepted: e.target.checked })}
              className="accent-primary mt-1"
            />
            <span className="text-sm text-muted-foreground">
              I confirm all information provided is accurate and complete. I understand that providing false or misleading information may result in bond denial or cancellation.
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.termsAccepted}
              onChange={(e) => onUpdate({ termsAccepted: e.target.checked })}
              className="accent-primary mt-1"
            />
            <span className="text-sm text-muted-foreground">
              I agree to the Terms and Conditions, Privacy Policy, and authorize the surety company to obtain credit reports and financial information as necessary.
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Bond Information
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          Payment <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
