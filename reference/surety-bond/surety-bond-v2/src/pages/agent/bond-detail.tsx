import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { 
  useGetBond, useUpdateBondStatus, useGetBondDocuments, useGetBondComments, useAddBondComment,
  useRenewBond, useIssueBond, useGetBondEndorsements, useCreateBondEndorsement,
  useCancelBond, useGetBondLifecycle, useListObligees, useCalculatePremium, useEvaluateRisk, BondStatus
} from "@workspace/api-client-react";
import type { CreateEndorsementRequestEndorsementType, CancelBondRequestCancellationProvision, BondLifecycle, Endorsement, BondApplication } from "@workspace/api-zod";
import { 
  ArrowLeft, FileText, CheckCircle2, XCircle, Clock, Upload, 
  MessageSquare, User, Building, MapPin, Mail, Phone, Download, ShieldAlert, ClipboardList, RefreshCw,
  ExternalLink, Receipt, Printer, Ban, GitBranch, PenLine, AlertTriangle, Check, ChevronsUpDown, Search,
  Calculator, Loader2, TrendingUp, TrendingDown, Pencil, Save, X, ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/themes/theme-provider";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useObligeeSearch } from "@/hooks/use-ai-underwriting";
import { downloadDocumentAsPdf } from "@/utils/download-pdf";
import { useIsMobile } from "@/hooks/use-mobile";

export function AgentBondDetail() {
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const [, params] = useRoute("/agent/bonds/:id");
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  
  const { data: bond, isLoading: bondLoading, refetch: refetchBond } = useGetBond(id, { query: { enabled: !!id, queryKey: ["getBond", id], staleTime: 0, refetchOnMount: "always" }});
  const { data: documents } = useGetBondDocuments(id, { query: { enabled: !!id, queryKey: ["getBondDocuments", id], staleTime: 0, refetchOnMount: "always" }});
  const { data: comments, refetch: refetchComments } = useGetBondComments(id, { query: { enabled: !!id, queryKey: ["getBondComments", id], staleTime: 0, refetchOnMount: "always" }});
  
  const [, setLocation] = useLocation();
  const updateStatus = useUpdateBondStatus();
  const addComment = useAddBondComment();
  const renewBond = useRenewBond();
  const issueBondMutation = useIssueBond();
  const { token } = useAuth();

  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: endorsements, refetch: refetchEndorsements } = useGetBondEndorsements(id, { query: { enabled: !!id, queryKey: ["getBondEndorsements", id], staleTime: 0, refetchOnMount: "always" }});
  const { data: lifecycle } = useGetBondLifecycle(id, { query: { enabled: !!id, queryKey: ["getBondLifecycle", id], staleTime: 0, refetchOnMount: "always" }});
  const createEndorsement = useCreateBondEndorsement();

  const cancelBondMutation = useCancelBond();

  const [showEndorsementDialog, setShowEndorsementDialog] = useState(false);
  const [endorsementType, setEndorsementType] = useState<CreateEndorsementRequestEndorsementType>("name_change");
  const [endorsementDescription, setEndorsementDescription] = useState("");
  const [endorsementChangeValue, setEndorsementChangeValue] = useState("");

  const [nameFirst, setNameFirst] = useState("");
  const [nameLast, setNameLast] = useState("");
  const [nameCompany, setNameCompany] = useState("");

  const [addrStreet, setAddrStreet] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrZip, setAddrZip] = useState("");

  const [endorsementPremium, setEndorsementPremium] = useState<{ ratedPremium: number; delta: number; riskScore?: number; riskLevel?: string; riskFlags?: string[] } | null>(null);
  const [isCalcEndorsementPremium, setIsCalcEndorsementPremium] = useState(false);
  const premiumMutation = useCalculatePremium();
  const riskMutation = useEvaluateRisk();

  const [resending, setResending] = useState<"email" | "sms" | "both" | null>(null);
  const [pendingPaymentRequest, setPendingPaymentRequest] = useState<{ id: number; principalEmail: string; principalPhone: string; createdAt: string } | null>(null);

  const [sidebarExpanded, setSidebarExpanded] = useState(!isMobile);
  const [editingPrincipal, setEditingPrincipal] = useState(false);
  const [savingPrincipal, setSavingPrincipal] = useState(false);
  const [principalForm, setPrincipalForm] = useState({
    firstName: "", lastName: "", companyName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "",
  });

  const startEditPrincipal = () => {
    if (bond?.principal) {
      setPrincipalForm({
        firstName: bond.principal.firstName || "",
        lastName: bond.principal.lastName || "",
        companyName: bond.principal.companyName || "",
        email: bond.principal.email || "",
        phone: bond.principal.phone || "",
        address: bond.principal.address || "",
        city: bond.principal.city || "",
        state: bond.principal.state || "",
        zip: bond.principal.zip || "",
      });
    }
    setEditingPrincipal(true);
  };

  const savePrincipal = async () => {
    if (!bond?.principal?.id || !token) return;
    setSavingPrincipal(true);
    try {
      const res = await fetch(`/api/principals/${bond.principal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(principalForm),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Principal profile updated" });
      setEditingPrincipal(false);
      refetchBond();
    } catch {
      toast({ title: "Update failed", description: "Could not save principal changes.", variant: "destructive" });
    } finally {
      setSavingPrincipal(false);
    }
  };

  useEffect(() => {
    if (bond?.status === "pending_payment" && token) {
      fetch(`/api/payment-requests/list`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((payments: any[]) => {
          const pending = payments.find((p: any) => p.bondId === id && p.paymentStatus === "pending");
          if (pending) setPendingPaymentRequest({ id: pending.id, principalEmail: pending.principalEmail, principalPhone: pending.principalPhone, createdAt: pending.createdAt });
        })
        .catch(() => {});
    }
  }, [bond?.status, id, token]);

  const handleResendPayment = async (method: "email" | "sms" | "both") => {
    if (!pendingPaymentRequest) return;
    setResending(method);
    try {
      const res = await fetch(`/api/payment-requests/${pendingPaymentRequest.id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      const succeeded = [];
      const failed = [];
      if (data.results?.email === true) succeeded.push("email");
      else if (data.results?.email === false) failed.push("email");
      if (data.results?.sms === true) succeeded.push("SMS");
      else if (data.results?.sms === false) failed.push("SMS");
      const desc = failed.length > 0
        ? `Sent via ${succeeded.join(" & ")}. ${failed.join(" & ")} failed.`
        : `New payment link sent via ${succeeded.join(" & ")}. Expires in 7 days.`;
      toast({ title: "Payment Link Resent", description: desc });
    } catch (err) {
      toast({ title: "Resend Failed", description: err instanceof Error ? err.message : "Could not resend payment link", variant: "destructive" });
    } finally {
      setResending(null);
    }
  };

  const [obligeeOpen, setObligeeOpen] = useState(false);
  const [obligeeQuery, setObligeeQuery] = useState("");
  const { data: allObligees } = useListObligees();
  const { results: aiObligeeResults, loading: aiObligeeLoading, searchObligees } = useObligeeSearch();
  const obligeeDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (obligeeDebounceRef.current) clearTimeout(obligeeDebounceRef.current);
    if (obligeeQuery.length >= 2) {
      obligeeDebounceRef.current = setTimeout(() => searchObligees(obligeeQuery), 300);
    }
    return () => { if (obligeeDebounceRef.current) clearTimeout(obligeeDebounceRef.current); };
  }, [obligeeQuery]);

  const filteredObligees = (() => {
    const local = (allObligees ?? []).filter((ob: any) => {
      if (!obligeeQuery) return true;
      return ob.name.toLowerCase().includes(obligeeQuery.toLowerCase());
    }).slice(0, 20);
    const aiOnly = aiObligeeResults.filter(
      (ai: any) => !local.some((l: any) => l.name === ai.name)
    );
    return [...local, ...aiOnly];
  })();

  const resetEndorsementForm = useCallback(() => {
    setEndorsementDescription("");
    setEndorsementChangeValue("");
    setNameFirst("");
    setNameLast("");
    setNameCompany("");
    setAddrStreet("");
    setAddrCity("");
    setAddrState("");
    setAddrZip("");
    setObligeeQuery("");
    setEndorsementPremium(null);
    setIsCalcEndorsementPremium(false);
  }, []);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelProvision, setCancelProvision] = useState<CancelBondRequestCancellationProvision>("flat_cancellation");

  const [showNonRenewDialog, setShowNonRenewDialog] = useState(false);
  const [nonRenewReason, setNonRenewReason] = useState("");
  const [nonRenewPending, setNonRenewPending] = useState(false);

  const handleCalcEndorsementPremium = async () => {
    if (!bond || !endorsementChangeValue) return;
    setIsCalcEndorsementPremium(true);
    try {
      const newAmount = Number(endorsementChangeValue);
      const classCode = bond.classCode || bond.bondType || "permit";
      const premResult = await premiumMutation.mutateAsync({
        data: { bondAmount: newAmount, classCode, state: null, answers: {} },
      });
      const riskResult = await riskMutation.mutateAsync({
        data: { bondAmount: newAmount, classCode, state: null, answers: {}, bondFormId: null },
      });
      const currentPremium = Number(bond.premium || 0);
      setEndorsementPremium({
        ratedPremium: premResult.ratedPremium,
        delta: premResult.ratedPremium - currentPremium,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        riskFlags: riskResult.flags || [],
      });
    } catch (err) {
      console.error("Endorsement premium calc failed:", err);
    } finally {
      setIsCalcEndorsementPremium(false);
    }
  };

  if (bondLoading) {
    return (
      <div className="flex items-center justify-center h-40 sm:h-64 p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin h-6 w-6 sm:h-8 sm:w-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-xs sm:text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!bond) return <div>Bond not found</div>;

  const handleStatusChange = async (newStatus: BondStatus) => {
    try {
      await updateStatus.mutateAsync({
        id,
        data: { status: newStatus }
      });
      toast({
        title: "Status Updated",
        description: `Bond status changed to ${newStatus.replace('_', ' ')}`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        variant: "destructive"
      });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await addComment.mutateAsync({
        id,
        data: {
          authorName: "Agent (You)",
          authorRole: "agent",
          content: newComment,
          isInternal
        }
      });
      setNewComment("");
      refetchComments();
      toast({ title: "Comment Added" });
    } catch (error) {
      toast({ title: "Failed to add comment", variant: "destructive" });
    }
  };

  const InfoItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className={`${isMobile ? 'flex items-center justify-between' : 'flex flex-col'} py-2.5 border-b last:border-0 border-border/50`}>
      <span className={`text-xs text-muted-foreground font-medium uppercase tracking-wider ${isMobile ? 'shrink-0' : ''}`}>{label}</span>
      <span className={`text-sm font-semibold text-foreground ${isMobile ? 'text-right' : 'mt-1'}`}>{value || '-'}</span>
    </div>
  );

  return (
    <div className="animate-fadeUp">
      <div className="bg-card border border-[var(--border-color)] rounded-[var(--r-lg)] p-3 sm:p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/agent/bonds" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
            </Link>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--slate-900)]">{bond.bondNumber}</h1>
                <StatusBadge status={bond.status} />
                <span className="text-sm font-semibold text-[var(--slate-900)]">{formatCurrency(bond.bondAmount)}</span>
              </div>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                <span className="text-xs sm:text-sm text-muted-foreground truncate">
                  {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}
                </span>
                {bond.bondType && <BondTypeBadge type={bond.bondType} />}
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto">
              {bond.status === 'submitted' && (
                <Button onClick={() => handleStatusChange('quoted')} className="shadow-sm min-h-[44px] flex-1 md:flex-initial">
                  Quote
                </Button>
              )}
              {(bond.status === 'requires_referral' || bond.status === 'referred' || bond.status === 'indemnity_in_review' || bond.status === 'pending_information') && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r)] text-sm" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)', color: 'var(--s-amber)' }}>
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Pending Underwriter Review</span>
                </div>
              )}
              {bond.status === 'approved' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r)] text-sm" style={{ background: 'var(--s-green-bg)', border: '1px solid var(--s-green)', color: 'var(--s-green)' }}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Approved by Underwriter</span>
                </div>
              )}
              {(bond.status === 'payment_approved' || bond.status === 'referral_approved') && (
                <Button
                  className="bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white shadow-sm min-h-[44px] flex-1 md:flex-initial"
                  onClick={() => setLocation(`/agent/bonds/${id}/application-summary`)}
                >
                  <Receipt className="h-4 w-4 mr-1 sm:mr-2" /> Application Summary
                </Button>
              )}
              {bond.status === 'pending_payment' && (
                <div className="flex flex-col gap-3 px-4 py-3 rounded-[var(--r)]" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--s-amber)' }}>
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Awaiting CC Payment from Principal</span>
                  </div>
                  {pendingPaymentRequest && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <span className="text-xs shrink-0" style={{ color: 'var(--s-amber)' }}>Resend link:</span>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5 bg-card"
                          style={{ borderColor: 'var(--s-amber)' }}
                          disabled={resending !== null}
                          onClick={() => handleResendPayment("email")}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {resending === "email" ? "Sending..." : "Email"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5 bg-card"
                          style={{ borderColor: 'var(--s-amber)' }}
                          disabled={resending !== null}
                          onClick={() => handleResendPayment("sms")}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {resending === "sms" ? "Sending..." : "SMS"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-white"
                          style={{ background: 'var(--s-amber)' }}
                          disabled={resending !== null}
                          onClick={() => handleResendPayment("both")}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${resending === "both" ? "animate-spin" : ""}`} />
                          {resending === "both" ? "Sending..." : "Both"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {bond.status === 'issued' && (
                <>
                  <Button
                    variant="outline"
                    className="border-primary/30 text-primary hover:bg-primary/5 min-h-[44px] flex-1 md:flex-initial"
                    disabled={renewBond.isPending}
                    onClick={async () => {
                      try {
                        const renewed = await renewBond.mutateAsync({ id });
                        toast({
                          title: "Renewal Draft Created",
                          description: "A new draft has been created from this bond.",
                        });
                        const renewedBond = renewed as BondApplication;
                        setLocation(`/agent/bonds/${renewedBond.id}`);
                      } catch (error) {
                        toast({ title: "Renewal Failed", variant: "destructive" });
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1 sm:mr-2" />
                    {renewBond.isPending ? "Creating..." : "Renew Bond"}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-[44px] flex-1 md:flex-initial"
                    onClick={() => setShowEndorsementDialog(true)}
                  >
                    <PenLine className="h-4 w-4 mr-1 sm:mr-2" /> Endorsement
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-[44px] flex-1 md:flex-initial"
                    style={{ color: 'var(--s-amber)', borderColor: 'var(--s-amber)' }}
                    onClick={() => setShowNonRenewDialog(true)}
                  >
                    <XCircle className="h-4 w-4 mr-1 sm:mr-2" /> {(bond as any).nonRenew ? "Non-Renew (Active)" : "Mark Non-Renew"}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 border-destructive/20 min-h-[44px] flex-1 md:flex-initial"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <Ban className="h-4 w-4 mr-1 sm:mr-2" /> Cancel Bond
                  </Button>
                </>
              )}
            </div>
          </div>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">

            {bond.status === 'issued' && (bond as any).nonRenew && (
              <div className="rounded-xl border-2 p-3 sm:p-4" style={{ borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                    <XCircle className="h-5 w-5" style={{ color: 'var(--s-amber)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">Marked as Non-Renew</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      This bond will not appear in the renewal queue. It remains active until its expiration date.
                    </p>
                    {(bond as any).nonRenewReason && (
                      <p className="text-sm mt-1" style={{ color: 'var(--s-amber)' }}>
                        Reason: {(bond as any).nonRenewReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bond.status === 'referral_approved' && endorsements && endorsements.some((e) => e.status === 'approved') && (
              <div className="rounded-xl border-2 p-3 sm:p-4" style={{ borderColor: 'var(--s-green)', background: 'var(--s-green-bg)' }}>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--s-green-bg)', border: '1px solid var(--s-green)' }}>
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: 'var(--s-green)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <h3 className="font-semibold text-sm sm:text-base">Endorsement Approved — Re-Issuance Required</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      The underwriter has approved the following changes. Proceed to Application Summary to select billing and re-issue the bond with updated documents.
                    </p>
                    <div className="space-y-2 mb-3">
                      {endorsements.filter((e) => e.status === 'approved').map((e) => {
                        const ch = (e.changes || {}) as Record<string, unknown>;
                        const typeLabel = (e.endorsementType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                        return (
                          <div key={e.id} className="flex flex-col gap-0.5 p-2.5 bg-card rounded-lg text-sm" style={{ border: '1px solid var(--s-green)' }}>
                            <span className="font-semibold">{typeLabel}</span>
                            {(ch.firstName || ch.lastName || ch.companyName) && (
                              <span className="text-xs text-muted-foreground">New Name: {[ch.firstName, ch.lastName].filter(Boolean).join(' ')}{ch.companyName ? ` (${ch.companyName})` : ''}</span>
                            )}
                            {ch.bondAmount && (
                              <span className="text-xs text-muted-foreground">Bond Amount: {formatCurrency(bond.bondAmount)} → {formatCurrency(ch.bondAmount as string)}</span>
                            )}
                            {ch.extensionMonths && (
                              <span className="text-xs text-muted-foreground">Term Extension: {String(ch.extensionMonths)} months</span>
                            )}
                            {ch.obligeeName && (
                              <span className="text-xs text-muted-foreground">New Obligee: {String(ch.obligeeName)}</span>
                            )}
                            {(ch.address || ch.city || ch.state || ch.zip) && (
                              <span className="text-xs text-muted-foreground">New Address: {[ch.address, ch.city, ch.state, ch.zip].filter(Boolean).join(', ')}</span>
                            )}
                            {ch.premiumDelta && (
                              <span className="text-xs text-muted-foreground">Premium Change: {Number(ch.premiumDelta) > 0 ? '+' : ''}{formatCurrency(ch.premiumDelta as string)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      className="text-white shadow-sm min-h-[44px]"
                      style={{ background: 'var(--s-green)' }}
                      onClick={() => setLocation(`/agent/bonds/${id}/application-summary`)}
                    >
                      <Receipt className="h-4 w-4 mr-2" /> Proceed to Application Summary
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {bond.notes && bond.status === 'submitted' && (
              <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 border-purple-200 bg-purple-50/80">
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-purple-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <h3 className="font-semibold text-purple-900 text-sm sm:text-base">Referred for Underwriting Review</h3>
                    <span className="text-[10px] uppercase font-bold bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">Human Review Required</span>
                  </div>
                  <p className="text-sm text-purple-800 leading-relaxed">
                    This application was submitted by a referring agent on behalf of the client. Underwriting must perform due diligence before approving or declining.
                  </p>
                  {bond.notes && (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">Agent Notes for Underwriting</p>
                      <p className="text-sm text-purple-900">{bond.notes}</p>
                    </div>
                  )}
                  <div className="mt-3">
                    <button
                      onClick={() => handleStatusChange('requires_referral')}
                      className="text-sm font-semibold text-purple-700 hover:text-purple-900 underline underline-offset-2 transition-colors min-h-[44px] inline-flex items-center"
                    >
                      Refer to Underwriter →
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Card className="shadow-sm border-muted">
              <CardHeader className={`bg-muted/10 border-b ${isMobile ? 'py-2.5 px-3' : 'pb-4'}`}>
                <CardTitle className={`${isMobile ? 'text-sm' : 'text-lg'} flex items-center gap-2`}>
                  <FileText className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-primary`} /> Bond Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className={`${isMobile ? 'px-3 py-1' : 'grid grid-cols-1 sm:grid-cols-2 gap-x-8 px-4 sm:px-6 py-2'}`}>
                  <InfoItem label="Bond Type" value={<BondTypeBadge type={bond.bondType} className="mt-1" />} />
                  <InfoItem label="Obligee Name" value={bond.obligeeName} />
                  <InfoItem label="Bond Amount" value={<span className={`font-mono ${isMobile ? 'text-sm' : 'text-base sm:text-lg'}`}>${bond.bondAmount.toLocaleString()}</span>} />
                  <InfoItem label="Calculated Premium" value={<span className="font-mono">${bond.premium?.toLocaleString() || '-'}</span>} />
                  <InfoItem label="Effective Date" value={bond.effectiveDate ? format(new Date(bond.effectiveDate), isMobile ? "MMM d, yyyy" : "MMMM d, yyyy") : '-'} />
                  <InfoItem label="Expiration Date" value={bond.expirationDate ? format(new Date(bond.expirationDate), isMobile ? "MMM d, yyyy" : "MMMM d, yyyy") : '-'} />
                  {bond.billingType && <InfoItem label="Billing Type" value={<span className="capitalize">{bond.billingType.replace(/_/g, ' ')}</span>} />}
                  {bond.bondNumber && <InfoItem label="Bond Number" value={<span className="font-mono">{bond.bondNumber}</span>} />}
                  <div className="col-span-1 sm:col-span-2 py-3 border-b border-border/50">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-2">Description / Scope of Work</span>
                    <p className="text-sm leading-relaxed text-foreground bg-muted/30 p-3 sm:p-4 rounded-lg border">{bond.description || 'No description provided.'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="comments" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-4 sm:mb-6 overflow-x-auto flex-nowrap">
                <TabsTrigger value="comments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-3 font-semibold text-xs sm:text-sm whitespace-nowrap min-h-[44px]">
                  Notes & Comments
                </TabsTrigger>
                <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-3 font-semibold text-xs sm:text-sm whitespace-nowrap min-h-[44px]">
                  Documents ({documents?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="ai-risk" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-3 font-semibold text-primary text-xs sm:text-sm whitespace-nowrap min-h-[44px]">
                  <ShieldAlert className="h-4 w-4 mr-1 sm:mr-2" /> AI Risk
                </TabsTrigger>
                <TabsTrigger value="endorsements" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-3 font-semibold text-xs sm:text-sm whitespace-nowrap min-h-[44px]">
                  <PenLine className="h-4 w-4 mr-1 sm:mr-2" /> Endorsements ({endorsements?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="lifecycle" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-3 font-semibold text-xs sm:text-sm whitespace-nowrap min-h-[44px]">
                  <GitBranch className="h-4 w-4 mr-1 sm:mr-2" /> Lifecycle
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="comments" className="mt-0">
                <Card className="shadow-sm border-muted">
                  <CardContent className="p-4 sm:p-6">
                    <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
                      {comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border" style={comment.isInternal ? { background: 'var(--s-amber-bg)', borderColor: 'var(--s-amber)' } : {}}>
                          <Avatar className="h-8 w-8 mt-1 border shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {comment.authorName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mb-1">
                              <span className="font-semibold text-sm">{comment.authorName}</span>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize">{comment.authorRole}</span>
                              {comment.isInternal && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: 'var(--s-amber)', background: 'var(--s-amber-bg)' }}>Internal</span>}
                            </div>
                            <span className="text-xs text-muted-foreground">{format(new Date(comment.createdAt), "MMM d, h:mm a")}</span>
                            <p className="text-sm text-foreground leading-relaxed mt-1">{comment.content}</p>
                          </div>
                        </div>
                      ))}
                      {comments?.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground italic">No comments yet.</div>
                      )}
                    </div>
                    
                    <Separator className="my-4 sm:my-6" />
                    
                    <div className="space-y-3">
                      <label className="text-sm font-semibold">Add a Note</label>
                      <Textarea 
                        placeholder="Type your message here..." 
                        className="min-h-[100px] resize-none bg-muted/20 text-base sm:text-sm"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                      />
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors min-h-[44px]">
                          <input 
                            type="checkbox" 
                            className="rounded border-input text-primary focus:ring-primary h-5 w-5 sm:h-4 sm:w-4"
                            checked={isInternal}
                            onChange={(e) => setIsInternal(e.target.checked)}
                          />
                          Internal note (hidden from principal)
                        </label>
                        <Button onClick={handleAddComment} disabled={!newComment.trim()} className="shadow-sm min-h-[44px] w-full sm:w-auto">
                          <MessageSquare className="h-4 w-4 mr-2" /> Post Note
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="documents" className="mt-0">
                <Card className="shadow-sm border-muted">
                  <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-3">
                    <CardTitle className="text-base font-semibold">Attached Files</CardTitle>
                    <Button variant="outline" size="sm" className="shadow-sm min-h-[44px]"><Upload className="h-4 w-4 mr-2" /> Request Docs</Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {bond.status === 'issued' && (
                      <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--s-green-bg)', border: '1px solid var(--s-green)' }}>
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--s-green)' }}>Generated Documents</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            onClick={() => { window.open(`/api/bonds/${id}/documents/bond_document/view?token=${encodeURIComponent(token || '')}`, '_blank'); }}
                            className="flex items-center gap-2 text-sm text-primary hover:underline py-2 px-3 rounded hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                          >
                            <FileText className="h-4 w-4" /> Bond Document
                            <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                          </button>
                          <button
                            onClick={() => { window.open(`/api/bonds/${id}/documents/invoice/view?token=${encodeURIComponent(token || '')}`, '_blank'); }}
                            className="flex items-center gap-2 text-sm text-primary hover:underline py-2 px-3 rounded hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                          >
                            <Receipt className="h-4 w-4" /> Invoice
                            <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                          </button>
                          <button
                            onClick={() => { window.open(`/api/bonds/${id}/documents/application/view?token=${encodeURIComponent(token || '')}`, '_blank'); }}
                            className="flex items-center gap-2 text-sm text-primary hover:underline py-2 px-3 rounded hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                          >
                            <Printer className="h-4 w-4" /> Application
                            <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {documents?.map((doc) => {
                        const docTypeMap: Record<string, string> = {
                          bond_document: "bond_document",
                          invoice: "invoice",
                          application: "application",
                        };
                        const viewDocType = docTypeMap[doc.documentType];
                        const handleDownload = async () => {
                          if (!viewDocType) {
                            toast({ title: "Download unavailable", description: "This document type cannot be downloaded as PDF.", variant: "destructive" });
                            return;
                          }
                          toast({ title: "Generating PDF...", description: "Please wait while the document is being prepared." });
                          try {
                            await downloadDocumentAsPdf(
                              `/api/bonds/${id}/documents/${viewDocType}/view`,
                              token || "",
                              doc.fileName
                            );
                            toast({ title: "Download complete", description: `${doc.fileName.replace('.html', '.pdf')} has been saved.` });
                          } catch (err) {
                            console.error("PDF download failed:", err);
                            toast({ title: "Opening document...", description: "PDF generation failed. Opening the document in a new tab instead." });
                            window.open(`/api/bonds/${id}/documents/${viewDocType}/view?token=${encodeURIComponent(token || '')}`, '_blank');
                          }
                        };
                        return (
                          <div key={doc.id} className="flex items-center justify-between p-3 sm:p-4 border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="truncate">
                                <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{doc.fileName}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{doc.documentType.replace('_', ' ')}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-muted-foreground group-hover:text-primary h-10 w-10"
                              onClick={handleDownload}
                              title="Download as PDF"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      {documents?.length === 0 && !bond.status?.includes('issued') && (
                        <div className="col-span-full text-center py-8 text-muted-foreground">No documents uploaded.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ai-risk" className="mt-0">
                <Card className="shadow-sm border-primary/20 bg-primary/5">
                  <CardContent className="p-6 sm:p-8 text-center flex flex-col items-center justify-center min-h-[200px] sm:h-64">
                    <ShieldAlert className="h-10 w-10 sm:h-12 sm:w-12 text-primary opacity-50 mb-4" />
                    <h3 className="text-base sm:text-lg font-bold">Risk Profile Available in AI Chats</h3>
                    <p className="text-muted-foreground max-w-md mt-2 mb-6 text-sm">
                      This application was processed by {theme.aiName}. To view the full AI risk assessment and conversation transcript, visit the AI Chats dashboard.
                    </p>
                    <Button asChild className="min-h-[44px]">
                      <Link href="/agent/conversations">Go to AI Chats</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="endorsements" className="mt-0">
                <Card className="shadow-sm border-muted">
                  <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-3">
                    <CardTitle className="text-base font-semibold">Endorsement History</CardTitle>
                    {bond.status === "issued" && (
                      <Button size="sm" onClick={() => setShowEndorsementDialog(true)} className="min-h-[44px]">
                        <PenLine className="h-4 w-4 mr-2" /> Request Endorsement
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {endorsements && endorsements.length > 0 ? (
                      <div className="space-y-3">
                        {endorsements.map((e: Endorsement) => (
                          <div key={e.id} className="flex items-start gap-4 p-4 border rounded-xl hover:bg-muted/20 transition-colors">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <PenLine className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm capitalize">{e.endorsementType?.replace(/_/g, " ")}</span>
                                <Badge variant={e.status === "applied" ? "default" : e.status === "approved" ? "outline" : e.status === "rejected" ? "destructive" : e.status === "pending_payment" ? "outline" : "secondary"} className="text-xs" style={e.status === "pending_payment" ? { borderColor: 'var(--s-amber)', background: 'var(--s-amber-bg)', color: 'var(--s-amber)' } : {}}>
                                  {e.status === "pending_payment" ? "Awaiting Payment" : e.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{e.description}</p>
                              {(() => {
                                const ch = (e.changes || {}) as Record<string, unknown>;
                                const hasDetails = ch.firstName || ch.lastName || ch.companyName || ch.bondAmount || ch.extensionMonths || ch.obligeeName || ch.address;
                                if (!hasDetails) return null;
                                return (
                                  <div className="mt-1.5 space-y-0.5">
                                    {(ch.firstName || ch.lastName || ch.companyName) && (
                                      <p className="text-xs text-blue-700">New Name: {[ch.firstName, ch.lastName].filter(Boolean).join(' ')}{ch.companyName ? ` (${ch.companyName})` : ''}</p>
                                    )}
                                    {ch.bondAmount && (
                                      <p className="text-xs text-blue-700">New Bond Amount: {formatCurrency(ch.bondAmount as string)}</p>
                                    )}
                                    {ch.extensionMonths && (
                                      <p className="text-xs text-blue-700">Term Extension: {String(ch.extensionMonths)} months</p>
                                    )}
                                    {ch.obligeeName && (
                                      <p className="text-xs text-blue-700">New Obligee: {String(ch.obligeeName)}</p>
                                    )}
                                    {(ch.address || ch.city || ch.state || ch.zip) && (
                                      <p className="text-xs text-blue-700">New Address: {[ch.address, ch.city, ch.state, ch.zip].filter(Boolean).join(', ')}</p>
                                    )}
                                    {ch.premiumDelta && (
                                      <p className="text-xs text-blue-700">Premium Change: {Number(ch.premiumDelta) > 0 ? '+' : ''}{formatCurrency(ch.premiumDelta as string)}</p>
                                    )}
                                  </div>
                                );
                              })()}
                              <p className="text-xs text-muted-foreground mt-1">
                                Requested {e.requestedAt ? format(new Date(e.requestedAt), "MMM d, yyyy h:mm a") : "—"}
                                {e.processedAt && ` · Processed ${format(new Date(e.processedAt), "MMM d, yyyy")}`}
                              </p>
                              {e.notes && <p className="text-xs mt-1 text-muted-foreground italic">{e.notes}</p>}
                              {e.status === "pending_payment" && (e.changes as Record<string, unknown>)?.totalDue && (
                                <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                                  <span className="font-semibold">Additional premium due: ${Number((e.changes as Record<string, unknown>).totalDue).toLocaleString()}</span>
                                  <span className="ml-2" style={{ color: 'var(--s-amber)' }}>— Payment link sent to principal</span>
                                </div>
                              )}
                            </div>
                            {e.status === "pending" && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 shrink-0">
                                <Clock className="h-3.5 w-3.5" /> Pending UW Review
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground italic">No endorsements for this bond.</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lifecycle" className="mt-0">
                <Card className="shadow-sm border-muted">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" /> Bond Lifecycle Chain
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lifecycle ? (() => {
                      const lc = lifecycle as BondLifecycle;
                      return (
                      <div className="space-y-6">
                        <div className="relative pl-6 border-l-2 border-primary/30">
                          <div className="absolute left-[-9px] top-0 h-4 w-4 rounded-full bg-primary border-2 border-background" />
                          <div className="pb-6">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">Original Bond</span>
                              <StatusBadge status={lc.original?.status} />
                            </div>
                            <p className="text-sm font-mono text-muted-foreground">{lc.original?.bondNumber}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {lc.original?.effectiveDate && `Effective: ${format(new Date(lc.original.effectiveDate), "MMM d, yyyy")}`}
                              {lc.original?.expirationDate && ` — Expires: ${format(new Date(lc.original.expirationDate), "MMM d, yyyy")}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {lc.original?.obligeeName} · ${Number(lc.original?.bondAmount || 0).toLocaleString()}
                            </p>
                          </div>

                          {(lc.renewals || []).map((r: BondApplication, i: number) => (
                            <div key={r.id} className="pb-6 relative">
                              <div className="absolute left-[-29px] top-0 h-4 w-4 rounded-full border-2 border-background" style={{ background: 'var(--s-green)' }} />
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm">Renewal #{i + 1}</span>
                                <StatusBadge status={r.status} />
                              </div>
                              <p className="text-sm font-mono text-muted-foreground">{r.bondNumber}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {r.effectiveDate && `Effective: ${format(new Date(r.effectiveDate), "MMM d, yyyy")}`}
                                {r.expirationDate && ` — Expires: ${format(new Date(r.expirationDate), "MMM d, yyyy")}`}
                              </p>
                              <button
                                className="text-xs text-primary hover:underline mt-1"
                                onClick={() => setLocation(`/agent/bonds/${r.id}`)}
                              >
                                View Bond →
                              </button>
                            </div>
                          ))}
                        </div>

                        {(lc.endorsements || []).length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-3">Endorsement History</h4>
                            <div className="space-y-2">
                              {(lc.endorsements || []).map((e: Endorsement) => (
                                <div key={e.id} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
                                  <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="capitalize font-medium">{e.endorsementType?.replace(/_/g, " ")}</span>
                                  <Badge variant="secondary" className="text-xs">{e.status}</Badge>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {e.requestedAt && format(new Date(e.requestedAt), "MMM d, yyyy")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">
                            Current Status: <span className="font-semibold text-foreground capitalize">{lc.currentStatus?.replace(/_/g, " ")}</span>
                            {bond.cancellationProvision && (
                              <> · Cancellation Provision: <span className="font-semibold text-foreground capitalize">{bond.cancellationProvision?.replace(/_/g, " ")}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      );
                    })() : (
                      <div className="text-center py-8 text-muted-foreground italic">Loading lifecycle data...</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            {isMobile && (
              <button
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card)] text-sm font-semibold"
              >
                <span className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /> Principal & Timeline</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            <div className={isMobile && !sidebarExpanded ? 'hidden' : ''}>
            <Card className="shadow-sm border-muted overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-slate-200 to-slate-300"></div>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building className="h-5 w-5 text-muted-foreground" /> Principal Profile
                  </CardTitle>
                  {!editingPrincipal ? (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={startEditPrincipal}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingPrincipal(false)} disabled={savingPrincipal}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary" onClick={savePrincipal} disabled={savingPrincipal}>
                        {savingPrincipal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingPrincipal ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Company Name</Label>
                      <Input className="h-9" value={principalForm.companyName} onChange={(e) => setPrincipalForm(f => ({ ...f, companyName: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">First Name</Label>
                        <Input className="h-9" value={principalForm.firstName} onChange={(e) => setPrincipalForm(f => ({ ...f, firstName: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Last Name</Label>
                        <Input className="h-9" value={principalForm.lastName} onChange={(e) => setPrincipalForm(f => ({ ...f, lastName: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input className="h-9" type="email" value={principalForm.email} onChange={(e) => setPrincipalForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input className="h-9" type="tel" value={principalForm.phone} onChange={(e) => setPrincipalForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Address</Label>
                      <Input className="h-9" value={principalForm.address} onChange={(e) => setPrincipalForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">City</Label>
                        <Input className="h-9" value={principalForm.city} onChange={(e) => setPrincipalForm(f => ({ ...f, city: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">State</Label>
                        <Input className="h-9" value={principalForm.state} onChange={(e) => setPrincipalForm(f => ({ ...f, state: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Zip</Label>
                        <Input className="h-9" value={principalForm.zip} onChange={(e) => setPrincipalForm(f => ({ ...f, zip: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="text-lg font-bold text-foreground">{bond.principal?.companyName || 'Individual'}</p>
                      <p className="text-sm text-muted-foreground">{bond.principal?.firstName} {bond.principal?.lastName}</p>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-border/50">
                      <div className="flex items-center gap-3 text-sm min-h-[44px]">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`mailto:${bond.principal?.email}`} className="text-primary hover:underline truncate">{bond.principal?.email}</a>
                      </div>
                      {bond.principal?.phone && (
                        <div className="flex items-center gap-3 text-sm min-h-[44px]">
                          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{bond.principal.phone}</span>
                        </div>
                      )}
                      {(bond.principal?.address || bond.principal?.city) && (
                        <div className="flex items-start gap-3 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="leading-tight">
                            {bond.principal?.address && <>{bond.principal.address}<br/></>}
                            {[bond.principal?.city, bond.principal?.state].filter(Boolean).join(", ")} {bond.principal?.zip || ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-muted bg-slate-50">
              <CardContent className="p-4 sm:p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Application Timeline</h4>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1"></div>
                      <div className="w-px h-full bg-border mt-1"></div>
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-semibold">Created</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(bond.createdAt), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>
                  {bond.submittedAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1"></div>
                        <div className="w-px h-full bg-border mt-1"></div>
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-semibold">Submitted</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(bond.submittedAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    </div>
                  )}
                  {bond.approvedAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: 'var(--s-green)' }}></div>
                        <div className="w-px h-full bg-border mt-1"></div>
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-semibold">Approved</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(bond.approvedAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    </div>
                  )}
                  {bond.issuedAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: 'var(--s-green)' }}></div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Issued</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(bond.issuedAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    </div>
                  )}
                  {bond.declinedAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive mt-1"></div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-destructive">Declined</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(bond.declinedAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
          
        </div>

      <Dialog open={showEndorsementDialog} onOpenChange={(open) => { setShowEndorsementDialog(open); if (!open) resetEndorsementForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Endorsement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Endorsement Type</Label>
              <Select value={endorsementType} onValueChange={(v) => { setEndorsementType(v as CreateEndorsementRequestEndorsementType); resetEndorsementForm(); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_change">Name Change</SelectItem>
                  <SelectItem value="address_change">Address Change</SelectItem>
                  <SelectItem value="amount_increase">Bond Amount Increase</SelectItem>
                  <SelectItem value="amount_decrease">Bond Amount Decrease</SelectItem>
                  <SelectItem value="obligee_change">Obligee Change</SelectItem>
                  <SelectItem value="term_extension">Term Extension</SelectItem>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {endorsementType === "name_change" && (
              <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Principal Name Change</span>
                </div>
                <p className="text-xs text-muted-foreground">Current: {bond.principal?.companyName || `${bond.principal?.firstName} ${bond.principal?.lastName}`}</p>
                <div>
                  <Label className="text-xs mb-1 block">New Company Name</Label>
                  <Input value={nameCompany} onChange={(e) => setNameCompany(e.target.value)} placeholder={bond.principal?.companyName || "Company name"} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">New First Name</Label>
                    <Input value={nameFirst} onChange={(e) => setNameFirst(e.target.value)} placeholder={bond.principal?.firstName || "First name"} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">New Last Name</Label>
                    <Input value={nameLast} onChange={(e) => setNameLast(e.target.value)} placeholder={bond.principal?.lastName || "Last name"} />
                  </div>
                </div>
              </div>
            )}

            {endorsementType === "address_change" && (
              <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Address Change</span>
                </div>
                {bond.principal?.address && (
                  <p className="text-xs text-muted-foreground">Current: {bond.principal.address}{bond.principal.city ? `, ${bond.principal.city}` : ""}{bond.principal.state ? `, ${bond.principal.state}` : ""} {bond.principal.zip || ""}</p>
                )}
                <div>
                  <Label className="text-xs mb-1 block">New Street Address</Label>
                  <AddressAutocomplete
                    value={addrStreet}
                    onChange={setAddrStreet}
                    onSelect={(s) => { setAddrStreet(s.address); setAddrCity(s.city); setAddrState(s.state); setAddrZip(s.zip); }}
                    placeholder="Start typing new address..."
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">City</Label>
                    <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="City" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">State</Label>
                    <Input value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="State" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">ZIP</Label>
                    <Input value={addrZip} onChange={(e) => setAddrZip(e.target.value)} placeholder="ZIP" />
                  </div>
                </div>
              </div>
            )}

            {(endorsementType === "amount_increase" || endorsementType === "amount_decrease") && (
              <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Bond Amount</span>
                  <span className="text-xs text-muted-foreground">Current: ${bond.bondAmount ? Number(bond.bondAmount).toLocaleString() : "0"}</span>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">New Bond Amount ($)</Label>
                  <Input
                    type="number"
                    value={endorsementChangeValue}
                    onChange={(e) => { setEndorsementChangeValue(e.target.value); setEndorsementPremium(null); }}
                    placeholder={`Enter new amount (current: $${bond.bondAmount ? Number(bond.bondAmount).toLocaleString() : "0"})`}
                  />
                </div>
                {endorsementChangeValue && bond.bondAmount && (
                  <p className="text-xs font-medium" style={{ color: endorsementType === "amount_increase" ? 'var(--s-green)' : 'var(--s-amber)' }}>
                    {endorsementType === "amount_increase" ? "+" : ""}${(Number(endorsementChangeValue) - Number(bond.bondAmount)).toLocaleString()} change
                  </p>
                )}

                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCalcEndorsementPremium}
                    disabled={!endorsementChangeValue || isCalcEndorsementPremium || !!endorsementPremium}
                    className="gap-2 w-full"
                  >
                    {isCalcEndorsementPremium ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Calculator className="h-3.5 w-3.5" />
                    )}
                    {isCalcEndorsementPremium ? "Calculating..." : endorsementPremium ? "Premium Calculated" : "Calculate New Premium"}
                  </Button>
                </div>

                {endorsementPremium && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-100 border rounded-lg px-3 py-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Premium</div>
                        <div className="text-sm font-bold">${Number(bond.premium || 0).toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-100 border rounded-lg px-3 py-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">New Premium</div>
                        <div className="text-sm font-bold">${endorsementPremium.ratedPremium.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: endorsementPremium.delta > 0 ? 'var(--s-amber-bg)' : 'var(--s-green-bg)', border: `1px solid ${endorsementPremium.delta > 0 ? 'var(--s-amber)' : 'var(--s-green)'}` }}>
                      {endorsementPremium.delta > 0 ? <TrendingUp className="h-4 w-4" style={{ color: 'var(--s-amber)' }} /> : <TrendingDown className="h-4 w-4" style={{ color: 'var(--s-green)' }} />}
                      <span className="text-sm font-semibold" style={{ color: endorsementPremium.delta > 0 ? 'var(--s-amber)' : 'var(--s-green)' }}>
                        Premium {endorsementPremium.delta > 0 ? "Increase" : "Decrease"}: {endorsementPremium.delta > 0 ? "+" : ""}${endorsementPremium.delta.toLocaleString()}
                      </span>
                    </div>
                    {endorsementPremium.riskScore !== undefined && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-100 border rounded-lg px-3 py-2">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</div>
                          <div className="text-sm font-bold">{endorsementPremium.riskScore}/100</div>
                        </div>
                        <div className="bg-slate-100 border rounded-lg px-3 py-2">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Level</div>
                          <Badge variant={endorsementPremium.riskLevel === "low" ? "default" : endorsementPremium.riskLevel === "medium" ? "secondary" : "destructive"} className="mt-0.5">
                            {endorsementPremium.riskLevel}
                          </Badge>
                        </div>
                      </div>
                    )}
                    {endorsementPremium.riskFlags && endorsementPremium.riskFlags.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Flags</div>
                        {endorsementPremium.riskFlags.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--s-amber)' }}>
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <ShieldAlert className="h-4 w-4 text-blue-500 shrink-0" />
                      This endorsement will be referred to an underwriter for review before taking effect.
                    </div>
                  </div>
                )}
              </div>
            )}

            {endorsementType === "term_extension" && (
              <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Term Extension</span>
                  <span className="text-xs text-muted-foreground">
                    Expires: {bond.expirationDate ? format(new Date(bond.expirationDate), "MMM d, yyyy") : "N/A"}
                  </span>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Extension (months)</Label>
                  <Input
                    type="number"
                    value={endorsementChangeValue}
                    onChange={(e) => setEndorsementChangeValue(e.target.value)}
                    placeholder="e.g. 6"
                    min="1"
                    max="60"
                  />
                </div>
                {endorsementChangeValue && bond.expirationDate && (
                  <p className="text-xs text-muted-foreground">
                    New expiration: {format(new Date(new Date(bond.expirationDate).setMonth(new Date(bond.expirationDate).getMonth() + Number(endorsementChangeValue))), "MMM d, yyyy")}
                  </p>
                )}
              </div>
            )}

            {endorsementType === "obligee_change" && (
              <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <Building className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Obligee Change</span>
                </div>
                <p className="text-xs text-muted-foreground">Current: {bond.obligeeName || "None"}</p>
                <div>
                  <Label className="text-xs mb-1 block">New Obligee</Label>
                  <Popover open={obligeeOpen} onOpenChange={setObligeeOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={obligeeOpen}
                        className="w-full justify-between h-10 font-normal"
                      >
                        {endorsementChangeValue || "Search or select an obligee..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Type obligee name..."
                          value={obligeeQuery}
                          onValueChange={(val) => { setObligeeQuery(val); if (!obligeeOpen) setObligeeOpen(true); }}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {aiObligeeLoading ? (
                              <span className="flex items-center gap-2 text-muted-foreground"><Search className="h-3.5 w-3.5 animate-pulse" /> Searching...</span>
                            ) : obligeeQuery.length > 0 ? (
                              <span className="text-muted-foreground text-xs">No match found — type a custom name below</span>
                            ) : (
                              "Type to search obligees..."
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredObligees.map((ob: any) => (
                              <CommandItem
                                key={ob.id || ob.name}
                                value={ob.name}
                                onSelect={() => {
                                  setEndorsementChangeValue(ob.name);
                                  setObligeeOpen(false);
                                  setObligeeQuery("");
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${endorsementChangeValue === ob.name ? "opacity-100" : "opacity-0"}`} />
                                <div>
                                  <span className="text-sm font-medium">{ob.name}</span>
                                  {ob.state && <span className="text-xs text-muted-foreground ml-2">{ob.city ? `${ob.city}, ` : ""}{ob.state}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {!endorsementChangeValue && obligeeQuery.length > 0 && filteredObligees.length === 0 && (
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => {
                          setEndorsementChangeValue(obligeeQuery);
                          setObligeeOpen(false);
                        }}
                      >
                        Use "{obligeeQuery}" as custom obligee
                      </Button>
                    </div>
                  )}
                  {endorsementChangeValue && (
                    <p className="text-xs font-medium mt-1 flex items-center gap-1" style={{ color: 'var(--s-green)' }}>
                      <Check className="h-3 w-3" /> Selected: {endorsementChangeValue}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Description / Reason</Label>
              <Textarea
                value={endorsementDescription}
                onChange={(e) => setEndorsementDescription(e.target.value)}
                placeholder="Describe the changes needed and the reason..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndorsementDialog(false)}>Cancel</Button>
            <Button
              disabled={!endorsementDescription.trim() || createEndorsement.isPending
                || (endorsementType === "name_change" && !nameFirst && !nameLast && !nameCompany)
                || (endorsementType === "address_change" && !addrStreet)
                || ((endorsementType === "amount_increase" || endorsementType === "amount_decrease") && !endorsementChangeValue)
                || (endorsementType === "term_extension" && !endorsementChangeValue)
                || (endorsementType === "obligee_change" && !endorsementChangeValue)
              }
              onClick={async () => {
                try {
                  const changes: Record<string, unknown> = {};
                  if (endorsementType === "name_change") {
                    if (nameFirst) changes.firstName = nameFirst;
                    if (nameLast) changes.lastName = nameLast;
                    if (nameCompany) changes.companyName = nameCompany;
                  }
                  if (endorsementType === "address_change") {
                    if (addrStreet) changes.address = addrStreet;
                    if (addrCity) changes.city = addrCity;
                    if (addrState) changes.state = addrState;
                    if (addrZip) changes.zip = addrZip;
                  }
                  if ((endorsementType === "amount_increase" || endorsementType === "amount_decrease") && endorsementChangeValue) {
                    changes.bondAmount = Number(endorsementChangeValue);
                    if (endorsementPremium) {
                      changes.newPremium = endorsementPremium.ratedPremium;
                      changes.premiumDelta = endorsementPremium.delta;
                      changes.riskScore = endorsementPremium.riskScore;
                      changes.riskLevel = endorsementPremium.riskLevel;
                    }
                  }
                  if (endorsementType === "term_extension" && endorsementChangeValue) {
                    changes.extensionMonths = Number(endorsementChangeValue);
                  }
                  if (endorsementType === "obligee_change" && endorsementChangeValue) {
                    changes.obligeeName = endorsementChangeValue;
                  }
                  if (Object.keys(changes).length === 0 && ["name_change", "address_change", "amount_increase", "amount_decrease", "term_extension", "obligee_change"].includes(endorsementType)) {
                    toast({ title: "Missing Change Details", description: "Please fill in the new values for this endorsement type.", variant: "destructive" });
                    return;
                  }
                  await createEndorsement.mutateAsync({
                    id,
                    data: {
                      endorsementType,
                      description: endorsementDescription,
                      changes,
                    },
                  });
                  refetchBond();
                  const isPremiumAffecting = ["amount_increase", "amount_decrease", "term_extension"].includes(endorsementType);
                  toast({
                    title: isPremiumAffecting ? "Referred to Underwriter" : "Endorsement Requested",
                    description: isPremiumAffecting
                      ? "This endorsement has been referred for underwriter review. The bond status has been updated."
                      : "Your endorsement request has been submitted for review."
                  });
                  setShowEndorsementDialog(false);
                  resetEndorsementForm();
                  refetchEndorsements();
                } catch {
                  toast({ title: "Failed", variant: "destructive" });
                }
              }}
            >
              {createEndorsement.isPending ? "Submitting..." : ["amount_increase", "amount_decrease", "term_extension"].includes(endorsementType) ? "Refer to Underwriter" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Cancel Bond
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              This action will cancel bond <span className="font-semibold">{bond.bondNumber}</span>. This cannot be undone.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Cancellation Provision</label>
              <Select value={cancelProvision} onValueChange={(v) => setCancelProvision(v as CancelBondRequestCancellationProvision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat_cancellation">Flat Cancellation</SelectItem>
                  <SelectItem value="pro_rata">Pro Rata</SelectItem>
                  <SelectItem value="short_rate">Short Rate</SelectItem>
                  <SelectItem value="release_only">Release Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason for Cancellation</label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Provide a reason for cancellation..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Keep Bond</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelBondMutation.isPending}
              onClick={async () => {
                try {
                  await cancelBondMutation.mutateAsync({
                    id,
                    data: {
                      reason: cancelReason,
                      cancellationProvision: cancelProvision,
                    },
                  });
                  toast({ title: "Bond Cancelled", description: "The bond has been cancelled." });
                  setShowCancelDialog(false);
                  setCancelReason("");
                } catch {
                  toast({ title: "Cancellation Failed", variant: "destructive" });
                }
              }}
            >
              {cancelBondMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNonRenewDialog} onOpenChange={setShowNonRenewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--s-amber)' }}>
              <XCircle className="h-5 w-5" /> {(bond as any).nonRenew ? "Remove Non-Renew Flag" : "Mark Bond as Non-Renew"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(bond as any).nonRenew ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This bond is currently marked as <span className="font-semibold" style={{ color: 'var(--s-amber)' }}>non-renew</span>. 
                  It will not appear in the renewal queue when it approaches expiration.
                </p>
                {(bond as any).nonRenewReason && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--s-amber-bg)', border: '1px solid var(--s-amber)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--s-amber)' }}>Current Reason</p>
                    <p className="text-sm">{(bond as any).nonRenewReason}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Reason for Reversal</label>
                  <Textarea
                    value={nonRenewReason}
                    onChange={(e) => setNonRenewReason(e.target.value)}
                    placeholder="Why is this bond being restored for renewal?"
                    className="min-h-[80px]"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Marking bond <span className="font-semibold">{bond.bondNumber}</span> as non-renew will 
                  remove it from the renewal queue. The bond remains active until its expiration date.
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">Reason for Non-Renewal</label>
                  <Textarea
                    value={nonRenewReason}
                    onChange={(e) => setNonRenewReason(e.target.value)}
                    placeholder="Provide a reason for non-renewal..."
                    className="min-h-[80px]"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNonRenewDialog(false); setNonRenewReason(""); }}>
              Cancel
            </Button>
            <Button
              className="text-white"
              style={{ background: (bond as any)?.nonRenew ? 'var(--s-green)' : 'var(--s-amber)' }}
              disabled={!nonRenewReason.trim() || nonRenewPending}
              onClick={async () => {
                setNonRenewPending(true);
                try {
                  const res = await fetch(`/api/bonds/${id}/non-renew`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      nonRenew: !(bond as any).nonRenew,
                      reason: nonRenewReason,
                    }),
                  });
                  if (res.ok) {
                    toast({
                      title: (bond as any).nonRenew ? "Non-Renew Removed" : "Marked Non-Renew",
                      description: (bond as any).nonRenew
                        ? "This bond will appear in the renewal queue again."
                        : "This bond will not appear in the renewal queue.",
                    });
                    setShowNonRenewDialog(false);
                    setNonRenewReason("");
                    refetchBond();
                  } else {
                    const data = await res.json();
                    toast({ title: "Failed", description: data.message || "Could not update non-renew status", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Error", description: "Network error", variant: "destructive" });
                } finally {
                  setNonRenewPending(false);
                }
              }}
            >
              {nonRenewPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {(bond as any).nonRenew ? "Restore for Renewal" : "Confirm Non-Renew"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
