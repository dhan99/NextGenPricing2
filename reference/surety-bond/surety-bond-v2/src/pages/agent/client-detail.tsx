import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Building2, MapPin, User, Mail, Phone, FileText, CheckCircle2, Shield } from "lucide-react";
import { useGetClient, useValidateClientAddressById } from "@workspace/api-client-react";
import { AddressValidationModal } from "@/components/clients/address-validation-modal";

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" },
  reserved: { label: "Reserved", className: "border-amber-500/30 text-amber-600 bg-amber-500/10" },
  inactive: { label: "Inactive", className: "border-gray-500/30 text-gray-500 bg-gray-500/10" },
};

export function ClientDetail() {
  const [, params] = useRoute("/agent/clients/:id");
  const [, navigate] = useLocation();
  const clientId = parseInt(params?.id || "0");
  const [showValidation, setShowValidation] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    original: { addressLine1: string; city: string; state: string; zipCode: string; country?: string };
    standardized: { addressLine1: string; addressLine2: string; city: string; state: string; zipCode: string; country: string; isStandardized: boolean; confidence: "high" | "medium" | "low"; suggestions: string[] };
  } | null>(null);

  const { data: client, isLoading, error } = useGetClient(clientId);
  const validateMutation = useValidateClientAddressById();

  const handleValidateAddress = () => {
    if (!client) return;
    validateMutation.mutate(
      {
        id: clientId,
        data: {
          addressLine1: client.addressLine1 || "",
          city: client.city || "",
          state: client.state || "",
          zipCode: client.zipCode || "",
        },
      },
      {
        onSuccess: (data) => {
          setValidationResult(data as typeof validationResult);
          setShowValidation(true);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 sm:space-y-4 p-3 sm:p-0">
        <div className="h-6 sm:h-8 bg-muted rounded w-2/3 sm:w-1/3" />
        <div className="h-40 sm:h-64 bg-muted rounded" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Client not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/agent/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
      </div>
    );
  }

  const validatedAddr = client.validatedAddress as {
    addressLine1?: string; addressLine2?: string; city?: string; state?: string; zipCode?: string; country?: string; confidence?: string;
  } | null;

  return (
    <div className="animate-fadeUp">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/agent/clients")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      {client.companyName}
                    </CardTitle>
                    {client.dbaName && (
                      <p className="text-sm text-muted-foreground">DBA: {client.dbaName}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusConfig[client.accountStatus]?.className || ""}>
                    {statusConfig[client.accountStatus]?.label || client.accountStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contact Information
                    </h3>
                    <div className="space-y-2">
                      {(client.firstName || client.lastName) && (
                        <p className="text-sm">{[client.firstName, client.lastName].filter(Boolean).join(" ")}</p>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {client.email}
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {client.phone}
                        </div>
                      )}
                      {client.taxId && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          Tax ID: {client.taxId}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Address
                    </h3>
                    {client.addressLine1 ? (
                      <div className="space-y-1">
                        <p className="text-sm">{client.addressLine1}</p>
                        {client.addressLine2 && <p className="text-sm">{client.addressLine2}</p>}
                        <p className="text-sm">{[client.city, client.state, client.zipCode].filter(Boolean).join(", ")}</p>
                        <p className="text-sm text-muted-foreground">{client.country}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No address on file</p>
                    )}
                  </div>
                </div>

                {validatedAddr && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Validated Address
                      </h3>
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                        <p className="text-sm font-medium">{validatedAddr.addressLine1}</p>
                        {validatedAddr.addressLine2 && <p className="text-sm">{validatedAddr.addressLine2}</p>}
                        <p className="text-sm">{[validatedAddr.city, validatedAddr.state, validatedAddr.zipCode].filter(Boolean).join(", ")}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Confidence: {validatedAddr.confidence || "N/A"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={handleValidateAddress}
                  disabled={!client.addressLine1 || validateMutation.isPending}
                >
                  <MapPin className="h-4 w-4" />
                  {validateMutation.isPending ? "Validating..." : "Re-Validate Address"}
                </Button>
                <Button
                  className="w-full gap-2"
                  onClick={() => navigate(`/agent/bond-wizard?clientId=${clientId}`)}
                >
                  <Shield className="h-4 w-4" />
                  Start Bond Application
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Created</span>
                    <span>{new Date(client.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Updated</span>
                    <span>{new Date(client.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {client.createdByAgentId && (
                    <div className="flex justify-between">
                      <span>Created By</span>
                      <span>Agent #{client.createdByAgentId}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      {validationResult && (
        <AddressValidationModal
          open={showValidation}
          onOpenChange={setShowValidation}
          original={validationResult.original}
          standardized={validationResult.standardized}
          onAcceptStandardized={() => setShowValidation(false)}
          onKeepOriginal={() => setShowValidation(false)}
        />
      )}
    </div>
  );
}
