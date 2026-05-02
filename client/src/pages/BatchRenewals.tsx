// F1.3 — Batch renewal admin page.
//
// Lets Pricing Operations bulk-renew a year's worth of deals in one go.
// Today the worker is synchronous TS in the route layer; slice 5 swaps
// to a Python+Celery+Redis worker for parallel scale, but the page
// shape stays the same: list of jobs, drill-in to one job + its items.

import { useMemo, useState } from "react";
import {
  Loader2, Plus, AlertTriangle, Layers, RefreshCw, ChevronRight, X, CheckCircle, Flag, XCircle, Clock,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  useDeals,
  useBatchRenewals,
  useBatchRenewalItems,
  useCreateBatchRenewal,
  useStartBatchRenewal,
  useBatchAdjustmentRules,
  useCreateBatchAdjustmentRule,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type BatchJob = {
  id: number;
  name: string;
  status: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  flaggedItems: number;
  varianceThresholdPct: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

type BatchItem = {
  id: number;
  jobId: number;
  sourceDealId: number;
  newDealId: number | null;
  status: string;
  variancePct: string | null;
  varianceReason: string | null;
  error: string | null;
  processedAt: string | null;
};

export function BatchRenewals() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("editDeals");
  const { data: jobs, isLoading } = useBatchRenewals();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground inline-flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Batch Renewals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk-renew approved deals for a new fiscal year. Adjustment rules apply uniformly; high-variance items are flagged for individual review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => setShowRules(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:border-primary/50"
                data-testid="batch-rules-open"
              >
                <Layers className="w-3.5 h-3.5" /> Adjustment Rules
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="batch-create-open"
              >
                <Plus className="w-3.5 h-3.5" /> New batch
              </button>
            </>
          )}
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

      {jobs && jobs.length === 0 && (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          No batch renewal jobs yet. {canEdit ? "Click \"New batch\" to create one." : "Pricing Ops creates batches here."}
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Items</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Flagged</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Failed</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(jobs as BatchJob[]).map((j) => (
                <tr
                  key={j.id}
                  onClick={() => setSelectedJobId(j.id)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  data-testid={`batch-row-${j.id}`}
                >
                  <td className="px-4 py-2 font-medium text-foreground">{j.name}</td>
                  <td className="px-4 py-2"><StatusPill status={j.status} /></td>
                  <td className="px-4 py-2 text-right">{j.processedItems}/{j.totalItems}</td>
                  <td className={cn("px-4 py-2 text-right", j.flaggedItems > 0 && "text-amber-700 font-semibold")}>{j.flaggedItems}</td>
                  <td className={cn("px-4 py-2 text-right", j.failedItems > 0 && "text-red-700 font-semibold")}>{j.failedItems}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{formatRelativeTime(j.createdAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <ChevronRight className="w-4 h-4 inline text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedJobId !== null && (
        <BatchJobDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} canEdit={canEdit} />
      )}
      {showCreate && (
        <CreateBatchDrawer onClose={() => setShowCreate(false)} />
      )}
      {showRules && (
        <RulesDrawer onClose={() => setShowRules(false)} canEdit={canEdit && hasPermission("manageRateCards")} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: string; icon: any; label: string }> = {
    pending:   { tone: "bg-stone-100 text-stone-700",     icon: Clock,       label: "Pending" },
    running:   { tone: "bg-blue-100 text-blue-700",       icon: Loader2,     label: "Running" },
    completed: { tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle, label: "Completed" },
    flagged:   { tone: "bg-amber-100 text-amber-700",     icon: Flag,        label: "Flagged" },
    failed:    { tone: "bg-red-100 text-red-700",         icon: XCircle,     label: "Failed" },
    cancelled: { tone: "bg-stone-100 text-stone-700",     icon: XCircle,     label: "Cancelled" },
  };
  const m = map[status] ?? { tone: "bg-stone-100 text-stone-700", icon: Clock, label: status };
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded", m.tone)}>
      <Icon className={cn("w-3 h-3", status === "running" && "animate-spin")} /> {m.label}
    </span>
  );
}

function BatchJobDrawer({ jobId, onClose, canEdit }: { jobId: number; onClose: () => void; canEdit: boolean }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { data: items, isLoading } = useBatchRenewalItems(jobId, statusFilter);
  const { data: jobs } = useBatchRenewals();
  const job = (jobs as BatchJob[] | undefined)?.find((j) => j.id === jobId) ?? null;
  const start = useStartBatchRenewal();
  const [startError, setStartError] = useState<string | null>(null);

  const onStart = () => {
    setStartError(null);
    start.mutate({ id: jobId }, { onError: (e: any) => setStartError(e?.body?.error ?? e?.message ?? "Run failed") });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-3xl bg-card border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">{job?.name ?? `Job #${jobId}`}</h2>
            {job && <p className="text-xs text-muted-foreground mt-0.5">
              <StatusPill status={job.status} /> · {job.processedItems}/{job.totalItems} processed · {job.flaggedItems} flagged · threshold {parseFloat(job.varianceThresholdPct).toFixed(1)}%
            </p>}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && job && (job.status === "pending" || job.status === "failed") && (
              <button
                onClick={onStart}
                disabled={start.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                data-testid="batch-job-start"
              >
                {start.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><RefreshCw className="w-3.5 h-3.5" /> Start</>}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {startError && (
          <div className="m-5 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 inline-flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {startError}
          </div>
        )}

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Filter</span>
          {[null, "completed", "flagged", "failed", "pending"].map((s) => (
            <button
              key={s ?? "all"}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md border",
                statusFilter === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
              )}
            >
              {s ?? "All"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-5 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
          {items && (items as BatchItem[]).length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No items match this filter.</div>
          )}
          {items && (items as BatchItem[]).length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Source deal</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Variance %</th>
                  <th className="px-3 py-2 text-left font-semibold">Reason / error</th>
                  <th className="px-3 py-2 text-left font-semibold">New deal</th>
                </tr>
              </thead>
              <tbody>
                {(items as BatchItem[]).map((it) => (
                  <tr key={it.id} className="border-t border-border" data-testid={`batch-item-${it.id}`}>
                    <td className="px-3 py-2 font-medium">#{it.sourceDealId}</td>
                    <td className="px-3 py-2"><StatusPill status={it.status} /></td>
                    <td className={cn("px-3 py-2 text-right", it.variancePct && Math.abs(parseFloat(it.variancePct)) >= 10 && "text-amber-700 font-semibold")}>
                      {it.variancePct != null ? `${parseFloat(it.variancePct).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-md">{it.error || it.varianceReason || "—"}</td>
                    <td className="px-3 py-2">{it.newDealId != null ? `#${it.newDealId}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function CreateBatchDrawer({ onClose }: { onClose: () => void }) {
  const { data: dealsData } = useDeals();
  const { data: rulesData } = useBatchAdjustmentRules();
  const create = useCreateBatchRenewal();
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(10);
  const [selectedDeals, setSelectedDeals] = useState<number[]>([]);
  const [selectedRules, setSelectedRules] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eligibleDeals = useMemo(() => (dealsData || []).filter((d: any) => d.status === "approved" && parseFloat(d.totalFee || "0") > 0), [dealsData]);
  const rules = (rulesData || []) as Array<{ id: number; name: string; ruleType: string }>;

  const submit = () => {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    if (selectedDeals.length === 0) { setError("Pick at least one source deal."); return; }
    create.mutate({
      name: name.trim(),
      sourceDealIds: selectedDeals,
      varianceThresholdPct: threshold,
      adjustmentRuleIds: selectedRules,
    }, {
      onSuccess: onClose,
      onError: (e: any) => setError(e?.body?.error ?? e?.message ?? "Create failed"),
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">New batch renewal</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Tax Season 2027 — Renewals"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card"
              data-testid="batch-create-name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Variance threshold (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
              className="w-32 px-3 py-2 text-sm rounded-lg border border-border bg-card"
              data-testid="batch-create-threshold"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Items whose worst-axis variance ≥ threshold are flagged for review instead of auto-completed.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Adjustment rules ({selectedRules.length} selected)</label>
            {rules.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No rules registered. Create one in Adjustment Rules.</p>
            ) : (
              <div className="space-y-1">
                {rules.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedRules.includes(r.id)}
                      onChange={(e) => setSelectedRules(e.target.checked
                        ? [...selectedRules, r.id]
                        : selectedRules.filter((x) => x !== r.id))}
                      data-testid={`batch-rule-${r.id}`}
                    />
                    {r.name} <span className="text-[11px] text-muted-foreground">({r.ruleType})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Source deals ({selectedDeals.length} of {eligibleDeals.length} eligible — approved + total fee &gt; 0)
            </label>
            {eligibleDeals.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No eligible source deals. Approve at least one priced deal first.</p>
            ) : (
              <>
                <div className="flex gap-2 mb-1">
                  <button
                    onClick={() => setSelectedDeals(eligibleDeals.map((d: any) => d.id))}
                    className="text-[11px] text-primary hover:underline"
                  >Select all</button>
                  <button
                    onClick={() => setSelectedDeals([])}
                    className="text-[11px] text-muted-foreground hover:underline"
                  >Clear</button>
                </div>
                <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
                  {eligibleDeals.map((d: any) => (
                    <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={selectedDeals.includes(d.id)}
                        onChange={(e) => setSelectedDeals(e.target.checked
                          ? [...selectedDeals, d.id]
                          : selectedDeals.filter((x) => x !== d.id))}
                        data-testid={`batch-deal-${d.id}`}
                      />
                      <span className="flex-1 truncate">#{d.id} · {d.dealNumber} · {d.title}</span>
                      <span className="text-muted-foreground">{d.serviceLine ?? "—"}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 inline-flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted">Cancel</button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            data-testid="batch-create-submit"
          >
            {create.isPending ? "Creating…" : "Create batch"}
          </button>
        </footer>
      </div>
    </>
  );
}

function RulesDrawer({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const { data: rules, isLoading } = useBatchAdjustmentRules();
  const [showForm, setShowForm] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-xl bg-card border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Adjustment rules</h2>
          <div className="flex items-center gap-2">
            {canEdit && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="batch-rules-new"
              >
                <Plus className="w-3.5 h-3.5" /> New rule
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
          {rules && (rules as any[]).length === 0 && !showForm && (
            <p className="text-sm text-muted-foreground">No rules yet.</p>
          )}
          {rules && (rules as any[]).map((r) => (
            <div key={r.id} className="card p-3">
              <p className="text-sm font-medium text-foreground">{r.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {r.ruleType} · params: <code className="font-mono">{JSON.stringify(r.parameters)}</code>
                {r.isActive === false && " · inactive"}
              </p>
            </div>
          ))}
          {showForm && <CreateRuleForm onClose={() => setShowForm(false)} />}
        </div>
      </div>
    </>
  );
}

function CreateRuleForm({ onClose }: { onClose: () => void }) {
  const create = useCreateBatchAdjustmentRule();
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<"rate_uplift" | "hour_adjustment" | "margin_target_override" | "tech_admin_fee_override">("rate_uplift");
  const [factor, setFactor] = useState("1.05");
  const [percent, setPercent] = useState("38");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    const parameters: Record<string, any> = ruleType === "rate_uplift" || ruleType === "hour_adjustment"
      ? { factor: parseFloat(factor) }
      : { percent: parseFloat(percent) };
    create.mutate(
      { name: name.trim(), ruleType, parameters },
      { onSuccess: onClose, onError: (e: any) => setError(e?.body?.error ?? e?.message ?? "Create failed") },
    );
  };
  return (
    <div className="card p-4 border-primary/40 bg-primary/5">
      <p className="text-xs font-semibold text-foreground mb-3">New rule</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rule name"
        className="w-full mb-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card"
        data-testid="batch-rule-name"
      />
      <select
        value={ruleType}
        onChange={(e) => setRuleType(e.target.value as any)}
        className="w-full mb-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card"
        data-testid="batch-rule-type"
      >
        <option value="rate_uplift">Rate uplift (× factor)</option>
        <option value="hour_adjustment">Hour adjustment (× factor)</option>
        <option value="margin_target_override">Margin target override (%)</option>
        <option value="tech_admin_fee_override">Tech & admin fee (%)</option>
      </select>
      {(ruleType === "rate_uplift" || ruleType === "hour_adjustment") ? (
        <input
          type="number" step="0.01"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          placeholder="factor (e.g. 1.05 = +5%)"
          className="w-full mb-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card"
        />
      ) : (
        <input
          type="number" step="0.01" min="0" max="100"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder="percent"
          className="w-full mb-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card"
        />
      )}
      {error && <p className="text-[11px] text-red-700 mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1 text-xs rounded-md border border-border">Cancel</button>
        <button
          onClick={submit}
          disabled={create.isPending}
          className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground"
          data-testid="batch-rule-save"
        >
          {create.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
