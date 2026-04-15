import { useState } from "react";
import { useLocation } from "wouter";
import { useClients, useCreateDeal } from "@/hooks/use-api";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Link } from "wouter";

export function NewDeal() {
  const { data: clients } = useClients();
  const createDeal = useCreateDeal();
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
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createDeal.mutateAsync({
      ...form,
      clientId: parseInt(form.clientId),
    });
    setLocation(`/deals/${result.id}`);
  };

  const businessUnits = ["Technology Consulting", "Audit & Assurance", "Tax Services", "Advisory Services", "Risk & Compliance"];
  const serviceLines = ["Digital Transformation", "Cloud Services", "Financial Audit", "Tax Planning", "Cybersecurity", "Data Analytics", "ERP Implementation"];
  const regions = ["West", "Central", "East", "National"];

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
            <div className="col-span-2">
              <label className="label">Deal Title</label>
              <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field mt-1" placeholder="e.g., ERP Modernization - Phase 1" />
            </div>
            <div>
              <label className="label">Client</label>
              <select required value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})} className="input-field mt-1">
                <option value="">Select client...</option>
                {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Deal Type</label>
              <select value={form.dealType} onChange={e => setForm({...form, dealType: e.target.value})} className="input-field mt-1">
                <option value="new">New Engagement</option>
                <option value="renewal">Renewal</option>
              </select>
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
              <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="input-field mt-1" />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="input-field mt-1" />
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
          <button type="submit" disabled={createDeal.isPending} className="btn-primary">
            {createDeal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {createDeal.isPending ? "Creating..." : "Create Deal"}
          </button>
        </div>
      </form>
    </div>
  );
}
