import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, FileText, Check, X, Clock, TrendingUp, TrendingDown, Minus, GitBranch, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { fetchApi } from "@/hooks/use-api";

interface ChangeOrder {
  id: number;
  dealId: number;
  version: number;
  changeType: string;
  title: string;
  description: string | null;
  status: string;
  originalFee: string;
  originalCost: string;
  originalHours: string;
  newFee: string;
  newCost: string;
  newHours: string;
  deltaFee: string;
  deltaCost: string;
  deltaHours: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

const CHANGE_TYPES = [
  { value: "scope_change", label: "Scope Change" },
  { value: "rate_adjustment", label: "Rate Adjustment" },
  { value: "timeline_extension", label: "Timeline Extension" },
  { value: "resource_change", label: "Resource Change" },
  { value: "other", label: "Other" },
];

function DeltaIndicator({ value, prefix = "$", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  if (value === 0) return <span className="text-stone-400 flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  const isPositive = value > 0;
  return (
    <span className={`flex items-center gap-1 font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}>
      {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {isPositive ? "+" : ""}{prefix}{Math.abs(value).toLocaleString()}{suffix}
    </span>
  );
}

export function ChangeOrders() {
  const params = useParams<{ id: string }>();
  const dealId = parseInt(params.id || "0");
  const qc = useQueryClient();
  const { persona } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: "", description: "", changeType: "scope_change", newFee: "", newCost: "", newHours: "" });

  const { data: deal } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => fetchApi(`/api/deals/${dealId}`),
    enabled: !!dealId,
  });

  const { data: ordersRaw, isLoading } = useQuery({
    queryKey: ["change-orders", dealId],
    queryFn: () => fetchApi(`/api/deals/${dealId}/change-orders`),
    enabled: !!dealId,
  });
  // Defensive: fetchApi throws on non-2xx, but if upstream ever returns a
  // wrapped object instead of an array, fall back to [] so .map() never blows
  // up the page (the symptom that caused the blank white screen).
  const orders: ChangeOrder[] = Array.isArray(ordersRaw) ? ordersRaw : [];

  const [error, setError] = useState<string | null>(null);

  const createOrder = useMutation({
    mutationFn: (data: any) =>
      fetchApi(`/api/deals/${dealId}/change-orders`, {
        method: "POST",
        body: JSON.stringify({ ...data, createdBy: persona?.name || "System" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-orders", dealId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      setShowForm(false);
      setFormData({ title: "", description: "", changeType: "scope_change", newFee: "", newCost: "", newHours: "" });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateOrder = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetchApi(`/api/change-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, approvedBy: persona?.name || "System" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-orders", dealId] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrder.mutate(formData);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved": return <Check className="w-4 h-4 text-green-600" />;
      case "rejected": return <X className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-amber-600" />;
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-stone-100 text-stone-700",
      submitted: "bg-amber-100 text-amber-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
    };
    return `px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.draft}`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link href={deal ? `/deals/${dealId}` : "/deals"}>
          <button className="p-2 rounded-lg hover:bg-stone-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Change Orders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {deal?.title || "Loading..."} - {deal?.dealNumber || ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Change Order
        </button>
      </div>

      {deal && (
        <div className="grid grid-cols-4 gap-4 mt-6 mb-6">
          {[
            { label: "Current Fee", value: formatCurrency(parseFloat(deal.totalFee || "0")) },
            { label: "Current Cost", value: formatCurrency(parseFloat(deal.totalCost || "0")) },
            { label: "Current Hours", value: `${parseFloat(deal.totalHours || "0").toFixed(0)} hrs` },
            { label: "Change Orders", value: String(orders.length) },
          ].map((item) => (
            <div key={item.label} className="card p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">{item.label}</p>
              <p className="text-lg font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showForm && (
        <div className="card p-6 mb-6 border-l-4 border-l-primary">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Create Change Order
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                  placeholder="e.g., Additional compliance module"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Change Type</label>
                <select
                  value={formData.changeType}
                  onChange={(e) => setFormData(p => ({ ...p, changeType: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                >
                  {CHANGE_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                rows={3}
                placeholder="Describe what changed and why..."
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">New Total Fee ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.newFee}
                  onChange={(e) => setFormData(p => ({ ...p, newFee: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                  placeholder={deal?.totalFee || "0"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">New Total Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.newCost}
                  onChange={(e) => setFormData(p => ({ ...p, newCost: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                  placeholder={deal?.totalCost || "0"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">New Total Hours</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.newHours}
                  onChange={(e) => setFormData(p => ({ ...p, newHours: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
                  placeholder={deal?.totalHours || "0"}
                />
              </div>
            </div>
            {deal && (formData.newFee || formData.newCost || formData.newHours) && (
              <div className="bg-stone-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Impact Preview</p>
                <div className="grid grid-cols-3 gap-4">
                  {formData.newFee && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Fee Delta</p>
                      <DeltaIndicator value={parseFloat(formData.newFee) - parseFloat(deal.totalFee || "0")} />
                    </div>
                  )}
                  {formData.newCost && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Cost Delta</p>
                      <DeltaIndicator value={parseFloat(formData.newCost) - parseFloat(deal.totalCost || "0")} />
                    </div>
                  )}
                  {formData.newHours && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Hours Delta</p>
                      <DeltaIndicator value={parseFloat(formData.newHours) - parseFloat(deal.totalHours || "0")} prefix="" suffix=" hrs" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createOrder.isPending} className="btn-primary">
                {createOrder.isPending ? "Creating..." : "Create Change Order"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-stone-100 rounded-xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-stone-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Change Orders</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            This deal has no change orders yet. Create one to track scope or pricing amendments post-approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(orders as ChangeOrder[]).map((co) => (
            <div key={co.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  {statusIcon(co.status)}
                  <span className="font-semibold text-foreground">v{co.version}</span>
                </div>
                <h4 className="font-medium text-foreground flex-1">{co.title}</h4>
                <span className={statusBadge(co.status)}>{co.status}</span>
                <span className="text-xs text-muted-foreground">{new Date(co.createdAt).toLocaleDateString()}</span>
              </div>

              {co.description && (
                <div className="px-6 py-3 bg-stone-50 text-sm text-muted-foreground border-b border-border">
                  {co.description}
                </div>
              )}

              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Fee</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-stone-400 line-through">{formatCurrency(parseFloat(co.originalFee || "0"))}</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(parseFloat(co.newFee || "0"))}</span>
                    </div>
                    <div className="mt-1">
                      <DeltaIndicator value={parseFloat(co.deltaFee || "0")} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Cost</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-stone-400 line-through">{formatCurrency(parseFloat(co.originalCost || "0"))}</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(parseFloat(co.newCost || "0"))}</span>
                    </div>
                    <div className="mt-1">
                      <DeltaIndicator value={parseFloat(co.deltaCost || "0")} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Hours</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-stone-400 line-through">{parseFloat(co.originalHours || "0").toFixed(0)} hrs</span>
                      <span className="text-sm font-semibold text-foreground">{parseFloat(co.newHours || "0").toFixed(0)} hrs</span>
                    </div>
                    <div className="mt-1">
                      <DeltaIndicator value={parseFloat(co.deltaHours || "0")} prefix="" suffix=" hrs" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Type: {CHANGE_TYPES.find(t => t.value === co.changeType)?.label || co.changeType}</span>
                    {co.createdBy && <span>By: {co.createdBy}</span>}
                    {co.approvedBy && <span>Approved by: {co.approvedBy}</span>}
                  </div>
                  {co.status === "draft" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateOrder.mutate({ id: co.id, status: "approved" })}
                        className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => updateOrder.mutate({ id: co.id, status: "rejected" })}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6 card p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            Cumulative Impact
          </h3>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Fee Delta</p>
              <DeltaIndicator value={(orders as ChangeOrder[]).filter(o => o.status === "approved").reduce((s, o) => s + parseFloat(o.deltaFee || "0"), 0)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Cost Delta</p>
              <DeltaIndicator value={(orders as ChangeOrder[]).filter(o => o.status === "approved").reduce((s, o) => s + parseFloat(o.deltaCost || "0"), 0)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Hours Delta</p>
              <DeltaIndicator value={(orders as ChangeOrder[]).filter(o => o.status === "approved").reduce((s, o) => s + parseFloat(o.deltaHours || "0"), 0)} prefix="" suffix=" hrs" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
