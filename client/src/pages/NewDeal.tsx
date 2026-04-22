import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useClients, useCreateDeal, useDeals, useCloneDeal, useEligibleOpportunities } from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, FileText, Loader2, Sparkles, Repeat, Briefcase, Database } from "lucide-react";
import { Link } from "wouter";

export function NewDeal() {
  const { data: clients } = useClients();
  const { data: allDeals } = useDeals();
  const createDeal = useCreateDeal();
  const cloneDeal = useCloneDeal();
  const { persona } = useAuth();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    title: "",
    clientId: "",
    dealType: "",
    businessUnit: "",
    serviceLine: "",
    region: "",
    complexity: "",
    startDate: "",
    endDate: "",
    pdlName: "",
    pdlEmail: "",
    notes: "",
    sourceDealId: "",
    dynamicsOpportunityId: "",
  });

  const isRenewal = form.dealType === "renewal";
  const isNewEngagement = form.dealType === "new";
  // Lower fields stay locked until the user has chosen Deal Type AND, for
  // renewals, a prior deal to clone from. This prevents stub deals with no
  // source from being created.
  const fieldsLocked = !form.dealType || (isRenewal && !form.sourceDealId);
  const { data: eligibleOpps = [] } = useEligibleOpportunities(isNewEngagement ? form.clientId || null : undefined);

  const selectedOpp = useMemo(() => {
    if (!form.dynamicsOpportunityId) return null;
    return (eligibleOpps as any[]).find((o) => o.id === parseInt(form.dynamicsOpportunityId)) || null;
  }, [eligibleOpps, form.dynamicsOpportunityId]);

  const renewalCandidates = useMemo(() => {
    if (!form.clientId || !allDeals) return [];
    return (allDeals as any[]).filter(
      (d) => d.clientId === parseInt(form.clientId) && d.status !== "draft"
    );
  }, [allDeals, form.clientId]);

  const selectedSource = useMemo(() => {
    if (!form.sourceDealId || !allDeals) return null;
    return (allDeals as any[]).find((d) => d.id === parseInt(form.sourceDealId)) || null;
  }, [allDeals, form.sourceDealId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRenewal && form.sourceDealId) {
      // Fast-track renewal: clone the source deal and route to leadsheet
      const result: any = await cloneDeal.mutateAsync({
        dealId: parseInt(form.sourceDealId),
        mode: "renewal",
        pdlName: form.pdlName || persona?.name,
      });
      setLocation(`/deals/${result.id}/renewal-leadsheet`);
      return;
    }

    const result = await createDeal.mutateAsync({
      ...form,
      clientId: parseInt(form.clientId),
    });
    setLocation(`/deals/${result.id}`);
  };

  const businessUnits = ["Technology Consulting", "Audit & Assurance", "Tax Services", "Advisory Services", "Risk & Compliance"];
  const serviceLines = ["Digital Transformation", "Cloud Services", "Financial Audit", "Tax Planning", "Cybersecurity", "Data Analytics", "ERP Implementation"];
  const regions = ["West", "Central", "East", "National"];

  const submitting = createDeal.isPending || cloneDeal.isPending;

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="sticky top-0 z-20 bg-background -mx-3 sm:mx-0 px-3 sm:px-0 -mt-3 sm:mt-0 pt-3 sm:pt-0 pb-3 sm:pb-0 mb-4 sm:mb-8 border-b border-border sm:border-0 flex items-center gap-3">
        <Link href="/deals"><span className="text-muted-foreground hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></span></Link>
        <div className="min-w-0">
          <h1 className="text-base sm:text-2xl font-bold text-foreground tracking-tight leading-tight truncate">Scope an Engagement</h1>
          <p className="hidden sm:block text-muted-foreground text-xs sm:text-sm">Set up a new pricing engagement</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
        <div className="card p-3 sm:p-6">
          <h2 className="text-sm sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Deal Information</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Client</label>
              <select required value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value, sourceDealId: ""})} className="input-field mt-1">
                <option value="">Select client...</option>
                {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Deal Type</label>
              <select required value={form.dealType} onChange={e => setForm({...form, dealType: e.target.value, sourceDealId: ""})} className="input-field mt-1">
                <option value="">Select...</option>
                <option value="new">New Engagement</option>
                <option value="renewal">Renewal</option>
              </select>
            </div>
          </div>

          {isNewEngagement && form.clientId && eligibleOpps.length > 0 && (
            <div className="mt-5 p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-start gap-2 mb-3">
                <Database className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Linked Dynamics 365 Opportunity (recommended)</p>
                  <p className="text-xs text-muted-foreground">
                    {eligibleOpps.length} scope-ready {eligibleOpps.length === 1 ? "opportunity" : "opportunities"} in
                    Develop/Propose for this client. Linking auto-fills the form and keeps the deal bi-directionally synced.
                  </p>
                </div>
              </div>
              <select
                value={form.dynamicsOpportunityId}
                onChange={(e) => {
                  const opp = (eligibleOpps as any[]).find((o) => o.id === parseInt(e.target.value));
                  if (!opp) {
                    setForm({ ...form, dynamicsOpportunityId: "" });
                    return;
                  }
                  const t = opp.scopeTemplate;
                  setForm({
                    ...form,
                    dynamicsOpportunityId: e.target.value,
                    title: opp.name,
                    endDate: opp.estimatedCloseDate || form.endDate,
                    pdlName: opp.ownerName || form.pdlName,
                    businessUnit: t?.businessUnit || form.businessUnit,
                    serviceLine: t?.serviceLine || form.serviceLine,
                    complexity: t?.complexity || form.complexity,
                    notes: t?.scopeNotes ? `${t.scopeNotes}${form.notes ? "\n\n" + form.notes : ""}` : form.notes,
                  });
                }}
                className="input-field mt-1"
              >
                <option value="">Don't link (start fresh)</option>
                {(eligibleOpps as any[]).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.opportunityNumber} — {o.name} · {o.stage} · ${(o.estimatedValue / 1000).toFixed(0)}K
                    {o.syncStatus === "queued" ? " · not yet imported" : ""}
                  </option>
                ))}
              </select>
              {selectedOpp && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">D365 Stage</div>
                    <div className="font-semibold text-foreground">{selectedOpp.stage} ({selectedOpp.probability}%)</div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">Est. Value</div>
                    <div className="font-semibold text-foreground">${selectedOpp.estimatedValue.toLocaleString()}</div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">Owner</div>
                    <div className="font-semibold text-foreground">{selectedOpp.ownerName}</div>
                  </div>
                  {selectedOpp.scopeTemplate && (
                    <div className="col-span-3 bg-white border border-stone-200 rounded-md p-2">
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-primary" /> Scope template applied
                      </div>
                      <div className="text-foreground mt-0.5">{selectedOpp.scopeTemplate.scopeNotes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isNewEngagement && form.clientId && eligibleOpps.length === 0 && (
            <div className="mt-5 p-3 rounded-lg border border-stone-200 bg-stone-50 text-xs text-muted-foreground flex items-start gap-2">
              <Briefcase className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>No Develop/Propose-stage Dynamics opportunities for this client. Create one in the CRM tab to link, or proceed without linking.</span>
            </div>
          )}

          {isRenewal && (
            <div className="mt-5 p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-start gap-2 mb-3">
                <Repeat className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Renewal Fast-Track</p>
                  <p className="text-xs text-muted-foreground">Select the prior-year deal to renew. We'll clone scope, pricing, and assumptions, then jump straight to the Renewal Leadsheet.</p>
                </div>
              </div>
              <label className="label">Prior Deal to Renew</label>
              <select
                required={isRenewal}
                value={form.sourceDealId}
                onChange={e => {
                  const src = (allDeals as any[] | undefined)?.find((d) => d.id === parseInt(e.target.value));
                  setForm({
                    ...form,
                    sourceDealId: e.target.value,
                    title: src ? `${src.title} (Renewal FY2026)` : form.title,
                    businessUnit: src?.businessUnit || form.businessUnit,
                    serviceLine: src?.serviceLine || form.serviceLine,
                    region: src?.region || form.region,
                    complexity: src?.complexity || form.complexity,
                  });
                }}
                className="input-field mt-1"
                disabled={!form.clientId}
              >
                <option value="">{form.clientId ? "Select prior deal..." : "Select a client first"}</option>
                {renewalCandidates.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.dealNumber} — {d.title} ({d.status})</option>
                ))}
              </select>
              {form.clientId && renewalCandidates.length === 0 && (
                <p className="text-xs text-amber-700 mt-2">No prior submitted/approved deals found for this client. Create as a new engagement instead.</p>
              )}
              {selectedSource && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">Prior Fee</div>
                    <div className="font-semibold text-foreground">${parseFloat(selectedSource.totalFee || "0").toLocaleString()}</div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">Prior Hours</div>
                    <div className="font-semibold text-foreground">{parseFloat(selectedSource.totalHours || "0").toLocaleString()}</div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-md p-2">
                    <div className="text-muted-foreground">Prior Margin</div>
                    <div className="font-semibold text-foreground">{parseFloat(selectedSource.marginPercent || "0").toFixed(1)}%</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <fieldset disabled={fieldsLocked} className={fieldsLocked ? "opacity-50 pointer-events-none select-none" : ""}>
            {fieldsLocked && (
              <p className="text-xs text-muted-foreground mt-4 mb-2 italic">
                {!form.dealType
                  ? "Select a Deal Type to enable the remaining fields."
                  : "Select a Prior Deal to Renew above to enable the remaining fields."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="col-span-2">
                <label className="label">Deal Title</label>
                <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field mt-1" placeholder="e.g., ERP Modernization - Phase 1" />
              </div>
              <div className="col-span-2">
                <label className="label">Business Unit</label>
                <select value={form.businessUnit} onChange={e => setForm({...form, businessUnit: e.target.value})} className="input-field mt-1">
                  <option value="">Select...</option>
                  {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Service Line</label>
                <select value={form.serviceLine} onChange={e => setForm({...form, serviceLine: e.target.value})} className="input-field mt-1">
                  <option value="">Select...</option>
                  {serviceLines.map(sl => <option key={sl} value={sl}>{sl}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Region</label>
                <select value={form.region} onChange={e => setForm({...form, region: e.target.value})} className="input-field mt-1">
                  <option value="">Select...</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Complexity</label>
                <select value={form.complexity} onChange={e => setForm({...form, complexity: e.target.value})} className="input-field mt-1">
                  <option value="">Select...</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="very_high">Very High</option>
                </select>
              </div>
              <div>
                <label className="label">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => { setForm({...form, startDate: e.target.value}); e.target.blur(); }} className="input-field mt-1" />
              </div>
              <div>
                <label className="label">End Date</label>
                <input type="date" value={form.endDate} onChange={e => { setForm({...form, endDate: e.target.value}); e.target.blur(); }} className="input-field mt-1" />
              </div>
            </div>
          </fieldset>
        </div>

        <fieldset disabled={!form.dealType} className={!form.dealType ? "opacity-50 pointer-events-none select-none" : ""}>
          <div className="card p-3 sm:p-6">
            <h2 className="text-sm sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">PDL Assignment</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">PDL Name</label>
                <input type="text" value={form.pdlName} onChange={e => setForm({...form, pdlName: e.target.value})} className="input-field mt-1" placeholder="Full name" />
              </div>
              <div className="col-span-2">
                <label className="label">PDL Email</label>
                <input type="email" value={form.pdlEmail} onChange={e => setForm({...form, pdlEmail: e.target.value})} className="input-field mt-1" placeholder="email@armanino.com" />
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={!form.dealType} className={!form.dealType ? "opacity-50 pointer-events-none select-none" : ""}>
          <div className="card p-3 sm:p-6">
            <h2 className="text-sm sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Additional Notes</h2>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field mt-1 min-h-[72px] sm:min-h-[100px] resize-y" placeholder="Any additional context about this engagement..." />
          </div>
        </fieldset>

        {/* Ask AI is only available for roles with runAI permission */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Link href="/deals" className="w-full sm:w-auto"><button type="button" className="btn-ghost w-full sm:w-auto justify-center">Cancel</button></Link>
          <button type="submit" disabled={submitting || !form.dealType || (isRenewal && !form.sourceDealId)} className="btn-primary w-full sm:w-auto justify-center">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isRenewal ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />)}
            {submitting
              ? (isRenewal ? "Building Leadsheet..." : "Creating...")
              : (isRenewal ? "Open Renewal Leadsheet" : "Start Scoping")}
          </button>
        </div>
      </form>
    </div>
  );
}
