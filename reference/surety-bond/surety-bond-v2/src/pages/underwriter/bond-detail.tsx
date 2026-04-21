import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useGetBond, useUpdateUnderwritingDecision,
  useGetBondEndorsements, useProcessEndorsement
} from "@workspace/api-client-react";
import { initialWizardState } from "@/components/wizard/wizard-types";
import type { WizardState } from "@/components/wizard/wizard-types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, FileText, User, Building, MapPin,
  Mail, Phone, Shield, ShieldAlert, ShieldCheck, AlertTriangle, ClipboardList, MessageSquareText, PenLine, Send, Loader2, ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export function UnderwriterBondDetail() {
  const isMobile = useIsMobile();
  const [, params] = useRoute("/underwriter/bonds/:id");
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [decisionNotes, setDecisionNotes] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogData, setEmailDialogData] = useState<{ bondId: number; agentEmail: string; agentName: string; decision: string } | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [useOneTimeEmail, setUseOneTimeEmail] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const { token } = useAuth();

  const { data: bond, isLoading, refetch: refetchBond } = useGetBond(id, { query: { enabled: !!id, queryKey: ["getBond", id], staleTime: 0, refetchOnMount: "always" } });
  const { data: endorsements = [], refetch: refetchEndorsements } = useGetBondEndorsements(id, { query: { enabled: !!id, queryKey: ["endorsements", id], staleTime: 0, refetchOnMount: "always" } });
  const processEndorsement = useProcessEndorsement();
  const decisionMutation = useUpdateUnderwritingDecision();

  const handleDecision = async (decision: string) => {
    try {
      const result = await decisionMutation.mutateAsync({
        id,
        data: {
          decision: decision as "approved" | "declined" | "referred" | "requires_referral" | "pending_information",
          notes: decisionNotes || undefined,
        },
      });
      toast({
        title: decision === "approved" ? "Bond Approved" : decision === "declined" ? "Bond Declined" : "Decision Updated",
        description: "Bond decision updated successfully.",
      });

      const resultData = result as any;
      if ((decision === "approved" || decision === "declined") && resultData?.agentInfo) {
        setEmailDialogData({
          bondId: id,
          agentEmail: resultData.agentInfo.email,
          agentName: resultData.agentInfo.name,
          decision: resultData.status === "referral_approved" ? "referral_approved" : decision,
        });
        setNotifyEmail(resultData.agentInfo.email);
        setUseOneTimeEmail(false);
        setEmailDialogOpen(true);
      } else if (decision === "approved" || decision === "declined") {
        setLocation("/underwriter/dashboard");
      }
    } catch (error) {
      toast({
        title: "Decision Failed",
        description: error instanceof Error ? error.message : "Could not update decision",
        variant: "destructive",
      });
    }
  };

  const handleManualIssue = () => {
    if (!bond) return;
    const b = bond as Record<string, unknown>;
    const principal = (b.principal || {}) as Record<string, string>;
    const agent = (b.agent || {}) as Record<string, unknown>;
    const premium = typeof b.premium === "number" ? b.premium : null;

    const wizardState: WizardState = {
      ...initialWizardState,
      currentStep: 5,
      bondId: id,
      bondNumber: (b.bondNumber as string) || "",
      bondFormType: (b.bondType as string) || "contractor_license",
      bondFormName: (b.bondType as string) || "",
      bondAmount: String(b.bondAmount || "0"),
      premiumCalculated: premium,
      surcharge: typeof b.surcharge === "number" ? b.surcharge : (premium ? Math.round(premium * 0.03) : null),
      commission: typeof b.commission === "number" ? b.commission : null,
      netPremium: typeof b.netPremium === "number" ? b.netPremium : null,
      riskScore: typeof b.riskScore === "number" ? b.riskScore : null,
      riskLevel: (b.riskLevel as string) || null,
      triageDecision: "instant_issue",
      obligeeName: (b.obligeeName as string) || "",
      effectiveDate: b.effectiveDate ? String(b.effectiveDate).split("T")[0] : "",
      expirationDate: b.expirationDate ? String(b.expirationDate).split("T")[0] : "",
      bondDescription: (b.description as string) || "",
      principalCompanyName: principal.companyName || "",
      principalFirstName: principal.firstName || "",
      principalLastName: principal.lastName || "",
      principalEmail: principal.email || "",
      principalPhone: principal.phone || "",
      principalAddress: principal.address || "",
      principalCity: principal.city || "",
      principalState: principal.state || "",
      principalZip: principal.zip || "",
      billingType: "",
      billingAddress: (b.billingAddress as string) || "",
      billingCity: (b.billingCity as string) || "",
      billingState: (b.billingState as string) || "",
      billingZip: (b.billingZip as string) || "",
      conditionsAccepted: true,
      termsAccepted: true,
      uwSelectedAgentId: typeof agent.id === "number" ? agent.id : null,
      uwSelectedAgentName: agent.firstName ? `${agent.firstName} ${agent.lastName}` : "",
      uwCreated: true,
    };

    localStorage.setItem("uw-bond-wizard-state", JSON.stringify(wizardState));
    setLocation("/underwriter/bond-wizard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 sm:h-64">
        <div className="animate-spin h-6 w-6 sm:h-8 sm:w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bond) {
    return (
      <div className="text-center py-12 px-4">
        <Shield className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
        <h2 className="text-lg sm:text-xl font-semibold">Bond not found</h2>
        <p className="text-sm text-muted-foreground mt-1">The requested bond could not be loaded.</p>
      </div>
    );
  }

  const riskLevelConfig: Record<string, { icon: typeof Shield; colorVar: string; bgVar: string; label: string }> = {
    low: { icon: ShieldCheck, colorVar: "var(--s-green)", bgVar: "var(--s-green-bg)", label: "Low Risk" },
    medium: { icon: Shield, colorVar: "var(--s-purple)", bgVar: "var(--s-purple-bg)", label: "Medium Risk" },
    high: { icon: ShieldAlert, colorVar: "var(--s-amber)", bgVar: "var(--s-amber-bg)", label: "High Risk" },
    very_high: { icon: AlertTriangle, colorVar: "var(--color-destructive)", bgVar: "color-mix(in srgb, var(--color-destructive) 10%, transparent)", label: "Very High Risk" },
  };

  const rlConfig = riskLevelConfig[bond.riskLevel || "medium"] || riskLevelConfig.medium;
  const RiskIcon = rlConfig.icon;

  const canDecide = ["submitted", "quoted", "requires_referral", "referred", "indemnity_in_review", "pending_information"].includes(bond.status);
  const canManualIssue = ["approved", "referral_approved", "payment_approved"].includes(bond.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/underwriter/review")} className="gap-1 h-8 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <h1 className="text-base sm:text-lg font-bold tracking-tight">{bond.bondNumber}</h1>
            <StatusBadge status={bond.status} />
            <span className="text-sm font-semibold">{formatCurrency(bond.bondAmount)}</span>
          </div>
          <span className="text-xs sm:text-sm text-muted-foreground mt-0.5 block truncate">
            {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canDecide && (
            <>
              <Button className="text-white min-h-[44px]" style={{ background: 'var(--s-green)' }} onClick={() => handleDecision("approved")} disabled={decisionMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
              </Button>
              <Button variant="outline" className="min-h-[44px]" style={{ color: 'var(--s-amber)', borderColor: 'color-mix(in srgb, var(--s-amber) 30%, transparent)' }} onClick={() => handleDecision("pending_information")} disabled={decisionMutation.isPending}>
                <Clock className="h-4 w-4 mr-1.5" /> Request Info
              </Button>
              <Button variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10 min-h-[44px]" onClick={() => handleDecision("declined")} disabled={decisionMutation.isPending}>
                <XCircle className="h-4 w-4 mr-1.5" /> Decline
              </Button>
            </>
          )}
          {canManualIssue && (
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white min-h-[44px]" onClick={handleManualIssue}>
              <FileText className="h-4 w-4 mr-1.5" /> Issue Bond
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className={isMobile ? 'p-3' : 'p-6'}>
              <h3 className={`font-semibold ${isMobile ? 'text-sm mb-2' : 'mb-4'}`}>Bond Details</h3>
              {isMobile ? (
                <div className="text-sm divide-y divide-border/50">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Bond Type</span>
                    <BondTypeBadge type={bond.bondType} />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Obligee</span>
                    <span className="text-sm font-semibold text-right">{bond.obligeeName}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Bond Amount</span>
                    <span className="text-sm font-semibold">{formatCurrency(bond.bondAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Premium</span>
                    <span className="text-sm font-semibold">{bond.premium ? formatCurrency(bond.premium) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Effective</span>
                    <span className="text-sm font-semibold">{bond.effectiveDate ? format(new Date(bond.effectiveDate), "MMM d, yyyy") : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Expiration</span>
                    <span className="text-sm font-semibold">{bond.expirationDate ? format(new Date(bond.expirationDate), "MMM d, yyyy") : "—"}</span>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Bond Type</span>
                  <div className="mt-1"><BondTypeBadge type={bond.bondType} /></div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Obligee</span>
                  <p className="font-medium">{bond.obligeeName}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Bond Amount</span>
                  <p className="font-semibold text-lg">{formatCurrency(bond.bondAmount)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Premium</span>
                  <p className="font-medium">{bond.premium ? formatCurrency(bond.premium) : "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Effective Date</span>
                  <p>{bond.effectiveDate ? format(new Date(bond.effectiveDate), "MMM d, yyyy") : "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Expiration Date</span>
                  <p>{bond.expirationDate ? format(new Date(bond.expirationDate), "MMM d, yyyy") : "—"}</p>
                </div>
              </div>
              )}
              {bond.description && (
                <div className="mt-4 p-3 rounded-[var(--r)] bg-[var(--slate-50)] text-sm text-muted-foreground">
                  {bond.description}
                </div>
              )}
            </CardContent>
          </Card>

          {(() => {
            const uwData = (bond as Record<string, unknown>).underwritingData as { flags?: string[] } | undefined;
            const uwFlags = uwData?.flags || [];
            return (uwFlags.length > 0 || bond.notes) ? true : false;
          })() && (
            <Card style={{ borderColor: 'color-mix(in srgb, var(--s-purple) 20%, transparent)', background: 'color-mix(in srgb, var(--s-purple) 5%, var(--card))' }}>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--slate-900)' }}>
                  <ClipboardList className="h-5 w-5" style={{ color: 'var(--s-purple)' }} />
                  Underwriter Points
                </h3>

                {(() => {
                  const uwData = (bond as Record<string, unknown>).underwritingData as { flags?: string[] } | undefined;
                  const uwFlags = uwData?.flags || [];
                  return uwFlags.length > 0 ? (
                  <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--s-purple)' }}>Referral Reasons</p>
                    <ul className="space-y-1.5">
                      {uwFlags.map((flag: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--slate-900)' }}>
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--s-purple)' }} />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
                })()}

                {bond.notes && (
                  <div className={`${((bond as Record<string, unknown>).underwritingData as { flags?: string[] } | undefined)?.flags?.length ? "pt-3" : ""}`} style={((bond as Record<string, unknown>).underwritingData as { flags?: string[] } | undefined)?.flags?.length ? { borderTop: '1px solid color-mix(in srgb, var(--s-purple) 20%, transparent)' } : {}}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--s-purple)' }}>
                      <MessageSquareText className="h-3.5 w-3.5" />
                      Comments
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--slate-900)' }}>{bond.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {bond.riskLevel && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">AI Risk Assessment</h3>
                <div className="p-4 rounded-lg border" style={{ background: rlConfig.bgVar }}>
                  <div className="flex items-center gap-3 mb-2">
                    <RiskIcon className="h-6 w-6" style={{ color: rlConfig.colorVar }} />
                    <div>
                      <span className="font-semibold text-lg">{rlConfig.label}</span>
                      {bond.riskScore !== undefined && (
                        <span className="text-sm text-muted-foreground ml-3">Score: {bond.riskScore}/100</span>
                      )}
                    </div>
                  </div>
                  {bond.triageDecision && (
                    <p className="text-sm text-muted-foreground capitalize mt-1">
                      Triage Decision: {bond.triageDecision.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {(bond.status === "issued" || bond.status === "requires_referral") && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-[var(--accent)]" />
                  Endorsements / Riders
                </h3>
                {endorsements.length > 0 ? (
                  <div className="space-y-3">
                    {endorsements.map((e) => (
                      <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border bg-[var(--slate-50)]">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium capitalize">{e.endorsementType?.replace(/_/g, " ")}</span>
                            <Badge variant={e.status === "applied" ? "default" : e.status === "rejected" ? "destructive" : e.status === "pending_payment" ? "outline" : "secondary"} className="text-xs">
                              {e.status === "pending_payment" ? "Awaiting Payment" : e.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                          {(() => {
                            const ch = (e.changes || {}) as Record<string, unknown>;
                            const hasDetails = ch.firstName || ch.lastName || ch.companyName || ch.bondAmount || ch.extensionMonths || ch.obligeeName || ch.address;
                            if (!hasDetails) return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                {(ch.firstName || ch.lastName || ch.companyName) && (
                                  <p className="text-xs" style={{ color: 'var(--accent)' }}>New Name: {[ch.firstName, ch.lastName].filter(Boolean).join(' ')}{ch.companyName ? ` (${ch.companyName})` : ''}</p>
                                )}
                                {ch.bondAmount && (
                                  <p className="text-xs" style={{ color: 'var(--accent)' }}>New Bond Amount: {formatCurrency(ch.bondAmount as string)}</p>
                                )}
                                {ch.extensionMonths && (
                                  <p className="text-xs" style={{ color: 'var(--accent)' }}>Term Extension: {String(ch.extensionMonths)} months</p>
                                )}
                                {ch.obligeeName && (
                                  <p className="text-xs" style={{ color: 'var(--accent)' }}>New Obligee: {String(ch.obligeeName)}</p>
                                )}
                                {(ch.address || ch.city || ch.state || ch.zip) && (
                                  <p className="text-xs" style={{ color: 'var(--accent)' }}>New Address: {[ch.address, ch.city, ch.state, ch.zip].filter(Boolean).join(', ')}</p>
                                )}
                              </div>
                            );
                          })()}
                          {e.status === "pending_payment" && e.changes?.premiumDelta && (
                            <p className="text-xs font-medium" style={{ color: 'var(--s-amber)' }}>
                              Additional premium: {formatCurrency(e.changes.totalDue || e.changes.premiumDelta)}
                            </p>
                          )}
                        </div>
                        {e.status === "pending" && (
                          <div className="flex gap-1 shrink-0 ml-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              style={{ color: 'var(--s-green)', borderColor: 'var(--s-green)' }}
                              onClick={async () => {
                                try {
                                  await processEndorsement.mutateAsync({ id, eid: e.id, data: { status: "approved" } });
                                  refetchEndorsements();
                                  refetchBond();
                                  toast({ title: "Endorsement Approved" });
                                } catch { toast({ title: "Failed to process endorsement", variant: "destructive" }); }
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/20 hover:bg-destructive/5 h-8"
                              onClick={async () => {
                                try {
                                  await processEndorsement.mutateAsync({ id, eid: e.id, data: { status: "rejected" } });
                                  refetchEndorsements();
                                  refetchBond();
                                  toast({ title: "Endorsement Rejected" });
                                } catch { toast({ title: "Failed to process endorsement", variant: "destructive" }); }
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic text-center py-4">No endorsements for this bond.</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Underwriter Notes</h3>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add underwriting notes for this bond..."
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isMobile && (
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card)] text-sm font-semibold"
            >
              <span className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> Principal & Timeline</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          <div className={isMobile && !sidebarExpanded ? 'hidden' : ''}>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" /> Principal
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">
                  {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                </p>
                {bond.principal?.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {bond.principal.email}
                  </div>
                )}
                {bond.principal?.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {bond.principal.phone}
                  </div>
                )}
                {bond.principal?.state && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {bond.principal.city ? `${bond.principal.city}, ` : ""}{bond.principal.state}
                  </div>
                )}
              </div>
              {bond.principalId && (
                <Link to={`/underwriter/principals/${bond.principalId}`}>
                  <Button variant="outline" size="sm" className="w-full mt-3 gap-1.5 text-[var(--accent)] border-[var(--accent)]/30 hover:bg-[var(--accent-50)]">
                    <Shield className="h-3.5 w-3.5" /> Credit & Risk Reports
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">Timeline</h3>
              <div className="space-y-3 text-sm">
                {bond.createdAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--slate-300)]" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{format(new Date(bond.createdAt), "MMM d, yyyy")}</span>
                  </div>
                )}
                {bond.submittedAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                    <span className="text-muted-foreground">Submitted:</span>
                    <span>{format(new Date(bond.submittedAt), "MMM d, yyyy")}</span>
                  </div>
                )}
                {bond.referredAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: 'var(--s-amber)' }} />
                    <span className="text-muted-foreground">Referred:</span>
                    <span>{format(new Date(bond.referredAt), "MMM d, yyyy")}</span>
                  </div>
                )}
                {bond.approvedAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: 'var(--s-green)' }} />
                    <span className="text-muted-foreground">Approved:</span>
                    <span>{format(new Date(bond.approvedAt), "MMM d, yyyy")}</span>
                  </div>
                )}
                {bond.declinedAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">Declined:</span>
                    <span>{format(new Date(bond.declinedAt), "MMM d, yyyy")}</span>
                  </div>
                )}
                {bond.issuedAt && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                    <span className="text-muted-foreground">Issued:</span>
                    <span>{format(new Date(bond.issuedAt), "MMM d, yyyy")}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>

      <Dialog open={emailDialogOpen} onOpenChange={(open) => { if (!open) { setEmailDialogOpen(false); setEmailDialogData(null); setLocation("/underwriter/dashboard"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" style={{ color: 'var(--s-purple)' }} />
              Notify Agent
            </DialogTitle>
            <DialogDescription>
              Send an email notification to the agent about this {emailDialogData?.decision === "referral_approved" ? "approval" : "decline"} decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <span className="font-medium">{emailDialogData?.agentName}</span>
                <span className="text-muted-foreground ml-1">({emailDialogData?.agentEmail})</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="oneTimeEmailDetail"
                checked={useOneTimeEmail}
                onChange={(e) => {
                  setUseOneTimeEmail(e.target.checked);
                  if (!e.target.checked && emailDialogData) {
                    setNotifyEmail(emailDialogData.agentEmail);
                  }
                }}
                className="rounded border-border"
              />
              <Label htmlFor="oneTimeEmailDetail" className="text-sm font-normal cursor-pointer">
                Send to a different email (one-time)
              </Label>
            </div>

            {useOneTimeEmail && (
              <div className="space-y-1.5">
                <Label htmlFor="notifyEmailInputDetail" className="text-xs text-muted-foreground">One-time notification email</Label>
                <Input
                  id="notifyEmailInputDetail"
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="alternate@email.com"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 text-white"
                style={{ background: 'var(--accent)' }}
                onClick={async () => {
                  if (!emailDialogData || !notifyEmail) return;
                  setSendingNotification(true);
                  try {
                    const res = await fetch(`/api/bonds/${emailDialogData.bondId}/notify-agent`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        notificationType: "decision",
                        email: useOneTimeEmail ? notifyEmail : undefined,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      toast({ title: "Notification Sent", description: `Email sent to ${data.sentTo}` });
                      setEmailDialogOpen(false);
                      setEmailDialogData(null);
                      setLocation("/underwriter/dashboard");
                    } else {
                      toast({ title: "Send Failed", description: data.error || "Could not send notification. You can retry or update the email.", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "Send Failed", description: "Network error. You can retry.", variant: "destructive" });
                  } finally {
                    setSendingNotification(false);
                  }
                }}
                disabled={sendingNotification || !notifyEmail}
              >
                {sendingNotification ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Notification
              </Button>
              <Button variant="outline" onClick={() => { setEmailDialogOpen(false); setEmailDialogData(null); setLocation("/underwriter/dashboard"); }} disabled={sendingNotification}>
                Skip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
