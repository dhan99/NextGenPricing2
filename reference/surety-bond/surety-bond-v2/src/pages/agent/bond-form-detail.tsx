import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, Building2, MapPin, CheckCircle2, XCircle, PlusCircle } from "lucide-react";
import { useGetBondForm } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

export function BondFormDetail() {
  const isMobile = useIsMobile();
  const [, params] = useRoute("/agent/bond-form-library/:id");
  const [, navigate] = useLocation();
  const formId = parseInt(params?.id || "0");

  const { data: form, isLoading, error } = useGetBondForm(formId);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 sm:space-y-4 p-3 sm:p-0">
        <div className="h-6 sm:h-8 bg-muted rounded w-2/3 sm:w-1/3" />
        <div className="h-40 sm:h-64 bg-muted rounded" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Bond form not found</h2>
        <p className="text-muted-foreground mt-2">The requested bond form could not be loaded.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/agent/bond-form-library")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fadeUp">
        <div className={`flex items-center gap-3 ${isMobile ? 'mb-3' : 'mb-6'}`}>
          <Button variant="ghost" size="sm" onClick={() => navigate("/agent/bond-form-library")} className="min-h-[36px]">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        {isMobile && (
          <Button
            className="w-full gap-2 mb-3 min-h-[44px]"
            onClick={() => navigate(`/agent/bond-wizard?bondFormId=${form.id}`)}
          >
            <PlusCircle className="h-4 w-4" />
            Start New Application
          </Button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className={isMobile ? 'px-3 py-2.5' : ''}>
                <div className="flex items-start justify-between">
                  <div className={isMobile ? 'space-y-1' : 'space-y-2'}>
                    <CardTitle className={isMobile ? 'text-base leading-tight' : 'text-xl'}>{form.name}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">Class {form.classCode}</code>
                      {form.bondType === "renewable" ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">Renewable</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-600">Non-renewable</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className={isMobile ? 'px-3 pb-3' : ''}>
                {isMobile ? (
                  <div className="divide-y divide-border/50">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Category</span>
                      <span className="text-sm font-semibold text-right">{form.category}{form.subcategory ? ` / ${form.subcategory}` : ''}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">State</span>
                      <span className="text-sm font-semibold">{form.state || "National"}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Country</span>
                      <span className="text-sm font-semibold">{form.country}</span>
                    </div>
                    {form.aggregateLimit != null && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Agg. Limit</span>
                        <span className="text-sm font-semibold">${Number(form.aggregateLimit).toLocaleString()}</span>
                      </div>
                    )}
                    {form.cancellationProvision && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cancellation</span>
                        <span className="text-sm font-semibold">{form.cancellationProvision}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">E-File</span>
                      <div className="flex items-center gap-1.5">
                        {form.requiresEfile ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        <span className="text-sm font-semibold">{form.requiresEfile ? "Required" : "No"}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Auto-Fill</span>
                      <div className="flex items-center gap-1.5">
                        {form.autoFills ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        <span className="text-sm font-semibold">{form.autoFills ? "Enabled" : "No"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Category</p>
                        <p className="text-sm font-medium">{form.category}</p>
                        {form.subcategory && <p className="text-xs text-muted-foreground">{form.subcategory}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">State</p>
                        <p className="text-sm font-medium">{form.state || "National"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Country</p>
                        <p className="text-sm font-medium">{form.country}</p>
                      </div>
                      {form.aggregateLimit != null && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Aggregate Limit</p>
                          <p className="text-sm font-medium">${Number(form.aggregateLimit).toLocaleString()}</p>
                        </div>
                      )}
                      {form.cancellationProvision && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cancellation</p>
                          <p className="text-sm font-medium">{form.cancellationProvision}</p>
                        </div>
                      )}
                    </div>
                    <Separator className="my-4" />
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        {form.requiresEfile ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        <span className="text-sm">E-File {form.requiresEfile ? "Required" : "Not Required"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {form.autoFills ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                        <span className="text-sm">Auto-Fill {form.autoFills ? "Enabled" : "Disabled"}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {form.obligees && form.obligees.length > 0 && (
              <Card>
                <CardHeader className={isMobile ? 'px-3 py-2.5' : ''}>
                  <CardTitle className={`${isMobile ? 'text-sm' : 'text-lg'} flex items-center gap-2`}>
                    <Building2 className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
                    Obligees ({form.obligees.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className={isMobile ? 'px-3 pb-3' : ''}>
                  <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
                    {form.obligees.map((obligee, idx) => (
                      <div key={idx} className={`bg-muted/50 rounded-lg ${isMobile ? 'p-2.5' : 'p-3'}`}>
                        <p className={`font-medium ${isMobile ? 'text-[13px]' : 'text-sm'}`}>{obligee.name}</p>
                        {obligee.additionalName && (
                          <p className="text-xs text-muted-foreground">{obligee.additionalName}</p>
                        )}
                        {(obligee.addressLine1 || obligee.city) && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>
                              {[obligee.addressLine1, obligee.addressLine2, obligee.city, obligee.state, obligee.zipCode]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {!isMobile && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={() => navigate(`/agent/bond-wizard?bondFormId=${form.id}`)}
                  >
                    <PlusCircle className="h-5 w-5" />
                    Start New Application
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Create a new bond application using this form
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
    </div>
  );
}
