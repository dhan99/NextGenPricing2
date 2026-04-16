import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useClients, useCreateDeal, useDeals, useCloneDeal } from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, FileText, Loader2, Sparkles, Repeat } from "lucide-react";
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
    dealType: "new",
    businessUnit: "",
    serviceLine: "",
    region: "",
    complexity: "medium",
    startDate: "",
    endDate: "",
    pdlName: "",
    pdlEmail: "",
    notes: "",
    sourceDealId: "",
  });

  const isRenewal = form.dealType === "renewal";

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
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/deals"><span className="text-muted-foreground hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></span></Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create New Deal</h1>
          <p className="text-muted-foreground text-sm mt-1">Set up a new pricing engagement</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Deal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client</label>
              <select required value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value, sourceDealId: ""})} className="input-field mt-1">
                <option value="">Select client...</option>
                {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Deal Type</label>
              <select value={form.dealType} onChange={e => setForm({...form, dealType: e.target.value, sourceDealId: ""})} className="input-field mt-1">
                <option value="new">New Engagement</option>
                <option value="renewal">Renewal</option>
              </select>
            </div>
          </div>

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
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
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

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <label className="label">Deal Title</label>
              <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field mt-1" placeholder="e.g., ERP Modernization - Phase 1" />
            </div>
            <div>
              <label className="label">Business Unit</label>
              <select value={form.businessUnit} onChange={e => setForm({...form, businessUnit: e.target.value})} className="input-field mt-1">
                <option value="">Select...</option>
                {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
              </select>
            </div>
            <div>
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
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">PDL Assignment</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">PDL Name</label>
              <input type="text" value={form.pdlName} onChange={e => setForm({...form, pdlName: e.target.value})} className="input-field mt-1" placeholder="Full name" />
            </div>
            <div>
              <label className="label">PDL Email</label>
              <input type="email" value={form.pdlEmail} onChange={e => setForm({...form, pdlEmail: e.target.value})} className="input-field mt-1" placeholder="email@armanino.com" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Additional Notes</h2>
          <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field mt-1 min-h-[100px] resize-y" placeholder="Any additional context about this engagement..." />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/deals"><button type="button" className="btn-ghost">Cancel</button></Link>
          <button type="submit" disabled={submitting || (isRenewal && !form.sourceDealId)} className="btn-primary">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isRenewal ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />)}
            {submitting
              ? (isRenewal ? "Building Leadsheet..." : "Creating...")
              : (isRenewal ? "Open Renewal Leadsheet" : "Create Deal")}
          </button>
        </div>
      </form>
    </div>
  );
}
