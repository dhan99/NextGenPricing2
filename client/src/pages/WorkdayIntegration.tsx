import { useState } from "react";
import {
  Briefcase, Building2, Users, DollarSign, ShieldCheck, Settings, Activity,
  RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle, Save, Pencil, Plus,
  Database, Sparkles,
} from "lucide-react";
import {
  useWorkdaySettings, useUpdateWorkdaySettings,
  useWorkdayCostCenters, useUpdateWorkdayCostCenter, useCreateWorkdayCostCenter,
  useWorkdayWorkers, useCreateWorkdayWorker,
  useWorkdayRateCard, useUpdateWorkdayRateCard,
  useWorkdayValidations, useWorkdayValidation, useOverrideWorkdayValidation,
  useWorkdayEvents, useRunWorkdayValidation,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type Tab = "cost-centers" | "workers" | "rate-card" | "validations" | "settings";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtMoneyFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtTime = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const WD_STATUS = {
  clean:               { label: "Clean",          icon: CheckCircle2, color: "emerald" },
  over_budget:         { label: "Over Budget",    icon: XCircle,      color: "red" },
  staffing_shortfall:  { label: "Staffing Short", icon: AlertTriangle, color: "red" },
  rate_variance:       { label: "Rate Variance",  icon: AlertTriangle, color: "amber" },
  pending:             { label: "Pending",        icon: Loader2,       color: "stone" },
  failed:              { label: "Failed",         icon: XCircle,       color: "stone" },
} as const;

export function StatusBadge({ status, overridden }: { status: string; overridden?: boolean }) {
  const s = (WD_STATUS as any)[status] || WD_STATUS.pending;
  const Icon = s.icon;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    stone: "bg-stone-100 border-stone-200 text-stone-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium ${colorMap[s.color]}`}>
      <Icon className="w-3 h-3" />
      {s.label}
      {overridden && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 text-[10px] uppercase">Override</span>}
    </span>
  );
}

export function WorkdayIntegration() {
  const [tab, setTab] = useState<Tab>("cost-centers");
  const { data: settings } = useWorkdaySettings();
  const mode = settings?.mode || "simulated";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Integration · 4-week Pilot</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Workday — Source of Truth</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Budgets, resource availability, staffing capacity, and standard cost rates. Persistent simulation; flip to live by config when ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
            mode === "live" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${mode === "live" ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className={`text-xs font-medium ${mode === "live" ? "text-emerald-700" : "text-amber-700"}`}>
              Mode: {mode === "live" ? "Live" : "Simulation"}
            </span>
          </div>
        </div>
      </div>

      <div className="border-b border-stone-200 mb-6">
        <div className="flex gap-1">
          {[
            { id: "cost-centers" as const, label: "Cost Centers",  icon: Building2,   sub: "Budgets & headroom" },
            { id: "workers" as const,      label: "Workers",       icon: Users,       sub: "Roles & availability" },
            { id: "rate-card" as const,    label: "Rate Card",     icon: DollarSign,  sub: "Standard cost rates" },
            { id: "validations" as const,  label: "Validations",   icon: ShieldCheck, sub: "Approval gating" },
            { id: "settings" as const,     label: "Settings",      icon: Settings,    sub: "Mode & tolerances" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <div className="flex items-center gap-2">
                <t.icon className="w-4 h-4" />
                <div className="text-left">
                  <div>{t.label}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{t.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {tab === "cost-centers" && <CostCentersTab />}
      {tab === "workers" && <WorkersTab />}
      {tab === "rate-card" && <RateCardTab />}
      {tab === "validations" && <ValidationsTab />}
      {tab === "settings" && <SettingsTab />}

      {tab !== "settings" && <EventLogPanel />}
    </div>
  );
}

// ============ COST CENTERS ============
function CostCentersTab() {
  const { data: rows = [], isLoading } = useWorkdayCostCenters();
  const update = useUpdateWorkdayCostCenter();
  const create = useCreateWorkdayCostCenter();
  const { persona } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState<any>({ code: "", name: "", totalBudget: 0, committed: 0, businessUnit: "" });

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} cost centers · committed amounts roll up monthly from Workday journals.</p>
        <button onClick={() => setShowNew(!showNew)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-stone-300 text-sm font-medium hover:bg-stone-50">
          <Plus className="w-4 h-4" /> Add Cost Center
        </button>
      </div>

      {showNew && (
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end bg-amber-50/40 border-amber-200">
          <div className="col-span-1"><label className="label">Code</label><input className="input-field" value={newDraft.code} onChange={(e) => setNewDraft({ ...newDraft, code: e.target.value })} placeholder="CC-..." /></div>
          <div className="col-span-2"><label className="label">Name</label><input className="input-field" value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} /></div>
          <div className="col-span-1"><label className="label">Business Unit</label><input className="input-field" value={newDraft.businessUnit} onChange={(e) => setNewDraft({ ...newDraft, businessUnit: e.target.value })} /></div>
          <div className="col-span-1"><label className="label">Total Budget</label><input type="number" className="input-field" value={newDraft.totalBudget} onChange={(e) => setNewDraft({ ...newDraft, totalBudget: parseFloat(e.target.value) || 0 })} /></div>
          <div className="col-span-1 flex gap-2">
            <button className="btn-primary text-xs flex-1" disabled={!newDraft.code || !newDraft.name}
              onClick={() => create.mutate({ ...newDraft, userName: persona?.name }, { onSuccess: () => { setShowNew(false); setNewDraft({ code: "", name: "", totalBudget: 0, committed: 0, businessUnit: "" }); } })}>
              Save
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-semibold">Code</th>
              <th className="text-left px-4 py-2.5 font-semibold">Name</th>
              <th className="text-left px-4 py-2.5 font-semibold">Business Unit</th>
              <th className="text-right px-4 py-2.5 font-semibold">Budget</th>
              <th className="text-right px-4 py-2.5 font-semibold">Committed</th>
              <th className="text-right px-4 py-2.5 font-semibold">Headroom</th>
              <th className="text-left px-4 py-2.5 font-semibold">Utilization</th>
              <th className="text-left px-4 py-2.5 font-semibold">Source</th>
              <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const total = parseFloat(r.totalBudget);
              const committed = parseFloat(r.committed);
              const headroom = total - committed;
              const util = total > 0 ? (committed / total) * 100 : 0;
              const isEdit = editingId === r.id;
              return (
                <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-2.5">{isEdit ? <input className="input-field py-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : r.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.businessUnit || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {isEdit
                      ? <input type="number" className="input-field py-1 text-right" value={draft.totalBudget} onChange={(e) => setDraft({ ...draft, totalBudget: parseFloat(e.target.value) || 0 })} />
                      : fmtMoneyFull(total)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {isEdit
                      ? <input type="number" className="input-field py-1 text-right" value={draft.committed} onChange={(e) => setDraft({ ...draft, committed: parseFloat(e.target.value) || 0 })} />
                      : fmtMoneyFull(committed)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${headroom < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmtMoney(headroom)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                        <div className={`h-full ${util > 100 ? "bg-red-500" : util > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(util, 100)}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{util.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{r.source}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-1">
                        <button className="px-2 py-1 rounded text-xs bg-emerald-600 text-white" onClick={() => update.mutate({ id: r.id, ...draft, userName: persona?.name }, { onSuccess: () => setEditingId(null) })}><Save className="w-3 h-3" /></button>
                        <button className="px-2 py-1 rounded text-xs border" onClick={() => setEditingId(null)}>×</button>
                      </div>
                    ) : (
                      <button className="text-muted-foreground hover:text-primary" onClick={() => { setEditingId(r.id); setDraft({ name: r.name, totalBudget: total, committed }); }}><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ WORKERS ============
function WorkersTab() {
  const { data: rows = [], isLoading } = useWorkdayWorkers();
  const create = useCreateWorkdayWorker();
  const { persona } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<any>({ name: "", roleName: "Senior Consultant", region: "West", weeklyCapacityHours: 40, availableHours: 0, standardCostRate: 0 });

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  // Roll up by role for capacity overview
  const byRole = new Map<string, { total: number; available: number }>();
  for (const w of rows) {
    const cur = byRole.get(w.roleName) || { total: 0, available: 0 };
    cur.total += parseFloat(w.weeklyCapacityHours);
    cur.available += parseFloat(w.availableHours);
    byRole.set(w.roleName, cur);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {Array.from(byRole.entries()).map(([role, agg]) => (
          <div key={role} className="card p-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{role}</p>
            <p className="text-lg font-bold text-foreground mt-1">{agg.available.toFixed(0)}<span className="text-xs text-muted-foreground font-normal">h avail</span></p>
            <p className="text-xs text-muted-foreground">of {agg.total.toFixed(0)}h/wk capacity</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} workers · pulled from Workday HCM module.</p>
        <button onClick={() => setShowNew(!showNew)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-stone-300 text-sm font-medium hover:bg-stone-50">
          <Plus className="w-4 h-4" /> Add Worker
        </button>
      </div>

      {showNew && (
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end bg-amber-50/40 border-amber-200">
          <div><label className="label">Name</label><input className="input-field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div><label className="label">Role</label><input className="input-field" value={draft.roleName} onChange={(e) => setDraft({ ...draft, roleName: e.target.value })} /></div>
          <div><label className="label">Region</label><input className="input-field" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></div>
          <div><label className="label">Capacity (h/wk)</label><input type="number" className="input-field" value={draft.weeklyCapacityHours} onChange={(e) => setDraft({ ...draft, weeklyCapacityHours: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="label">Available (h)</label><input type="number" className="input-field" value={draft.availableHours} onChange={(e) => setDraft({ ...draft, availableHours: parseFloat(e.target.value) || 0 })} /></div>
          <div className="flex gap-2"><button className="btn-primary text-xs flex-1" disabled={!draft.name} onClick={() => create.mutate({ ...draft, userName: persona?.name }, { onSuccess: () => setShowNew(false) })}>Save</button></div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-semibold">Employee #</th>
              <th className="text-left px-4 py-2.5 font-semibold">Name</th>
              <th className="text-left px-4 py-2.5 font-semibold">Role</th>
              <th className="text-left px-4 py-2.5 font-semibold">Region</th>
              <th className="text-right px-4 py-2.5 font-semibold">Capacity (h/wk)</th>
              <th className="text-right px-4 py-2.5 font-semibold">Available (h)</th>
              <th className="text-right px-4 py-2.5 font-semibold">Std Cost Rate</th>
              <th className="text-left px-4 py-2.5 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w: any) => (
              <tr key={w.id} className="border-b border-stone-100 hover:bg-stone-50/50">
                <td className="px-4 py-2.5 font-mono text-xs">{w.employeeNumber}</td>
                <td className="px-4 py-2.5">{w.name}</td>
                <td className="px-4 py-2.5">{w.roleName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{w.region}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{parseFloat(w.weeklyCapacityHours).toFixed(0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{parseFloat(w.availableHours).toFixed(0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">${parseFloat(w.standardCostRate).toFixed(0)}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{w.source}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ RATE CARD ============
function RateCardTab() {
  const { data: rows = [], isLoading } = useWorkdayRateCard();
  const update = useUpdateWorkdayRateCard();
  const { persona } = useAuth();
  const [editId, setEditId] = useState<number | null>(null);
  const [val, setVal] = useState<string>("");

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-amber-50/40 border-amber-200">
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-700 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Workday is the source of truth for standard cost rates.</p>
            <p className="text-xs text-amber-800 mt-1">DealPad pricing lines that diverge by more than the configured tolerance are flagged on validation. Adjust tolerance under Settings.</p>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-semibold">Role</th>
              <th className="text-right px-4 py-2.5 font-semibold">Standard Cost Rate</th>
              <th className="text-left px-4 py-2.5 font-semibold">Effective</th>
              <th className="text-left px-4 py-2.5 font-semibold">Source</th>
              <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50/50">
                <td className="px-4 py-2.5 font-medium">{r.roleName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {editId === r.id
                    ? <input type="number" className="input-field py-1 text-right w-28 ml-auto" value={val} onChange={(e) => setVal(e.target.value)} />
                    : `$${parseFloat(r.standardCostRate).toFixed(2)}/hr`}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.effectiveDate}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{r.source}</span></td>
                <td className="px-4 py-2.5 text-right">
                  {editId === r.id ? (
                    <div className="flex justify-end gap-1">
                      <button className="px-2 py-1 rounded text-xs bg-emerald-600 text-white"
                        onClick={() => update.mutate({ id: r.id, standardCostRate: parseFloat(val), userName: persona?.name }, { onSuccess: () => setEditId(null) })}>
                        <Save className="w-3 h-3" />
                      </button>
                      <button className="px-2 py-1 rounded text-xs border" onClick={() => setEditId(null)}>×</button>
                    </div>
                  ) : (
                    <button className="text-muted-foreground hover:text-primary" onClick={() => { setEditId(r.id); setVal(r.standardCostRate); }}><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ VALIDATIONS ============
function ValidationsTab() {
  const { data: rows = [], isLoading } = useWorkdayValidations();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useWorkdayValidation(selectedId);
  const override = useOverrideWorkdayValidation();
  const { persona } = useAuth();
  const [justification, setJustification] = useState("");

  const canOverride = persona?.role === "fin" || persona?.role === "sll";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="col-span-2 card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Recent Validations</h3>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </div>
        {isLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> :
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2 font-semibold">Deal</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Trigger</th>
              <th className="text-right px-4 py-2 font-semibold">Headroom</th>
              <th className="text-right px-4 py-2 font-semibold">Shortfall</th>
              <th className="text-right px-4 py-2 font-semibold">Variance</th>
              <th className="text-left px-4 py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v: any) => (
              <tr key={v.id} onClick={() => setSelectedId(v.id)}
                className={`border-b border-stone-100 cursor-pointer hover:bg-stone-50/70 ${selectedId === v.id ? "bg-amber-50/40" : ""}`}>
                <td className="px-4 py-2"><div className="text-xs font-mono text-muted-foreground">{v.dealNumber}</div><div className="text-sm">{v.dealTitle}</div></td>
                <td className="px-4 py-2"><StatusBadge status={v.status} overridden={!!v.overriddenBy} /></td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{v.trigger}</td>
                <td className="px-4 py-2 text-right tabular-nums text-xs">{v.budgetHeadroom != null ? fmtMoney(parseFloat(v.budgetHeadroom)) : "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-xs">{parseFloat(v.staffingShortfallHours || "0").toFixed(0)}h</td>
                <td className="px-4 py-2 text-right tabular-nums text-xs">{parseFloat(v.rateVarianceMaxPct || "0").toFixed(1)}%</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtTime(v.requestedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Validation Detail</h3>
        {!detail ? (
          <p className="text-xs text-muted-foreground">Select a validation to inspect findings.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status={detail.status} overridden={!!detail.overriddenBy} />
              <span className="text-xs text-muted-foreground">#{detail.id}</span>
            </div>
            <p className="text-sm text-foreground">{detail.summary}</p>
            <div className="space-y-1.5">
              {detail.findings.map((f: any) => (
                <div key={f.id} className={`text-xs p-2 rounded border ${
                  f.severity === "blocker" ? "bg-red-50 border-red-200 text-red-800"
                  : f.severity === "warning" ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-stone-50 border-stone-200 text-stone-700"}`}>
                  <span className="font-semibold uppercase tracking-wider mr-2">{f.findingType}</span>{f.message}
                </div>
              ))}
            </div>
            {detail.overriddenBy && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                <p className="font-semibold text-amber-900">Overridden by {detail.overriddenBy}</p>
                <p className="text-amber-800 mt-1">"{detail.overrideJustification}"</p>
              </div>
            )}
            {!detail.overriddenBy && (detail.status === "over_budget" || detail.status === "staffing_shortfall") && (
              <div className="border-t border-stone-200 pt-3">
                <label className="label">Override Justification</label>
                <textarea className="input-field min-h-[60px]" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Required: rationale for waiving the block..." />
                {!canOverride && <p className="text-xs text-red-600 mt-1">Only Finance or Service Line Lead can override.</p>}
                <button disabled={!canOverride || justification.trim().length < 5 || override.isPending}
                  className="btn-primary mt-2 w-full text-xs disabled:opacity-50"
                  onClick={() => override.mutate({ id: detail.id, justification, userName: persona?.name, role: persona?.role }, { onSuccess: () => setJustification("") })}>
                  {override.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Apply Override"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SETTINGS ============
function SettingsTab() {
  const { data: settings } = useWorkdaySettings();
  const update = useUpdateWorkdaySettings();
  const { persona } = useAuth();
  const [draft, setDraft] = useState<any>(null);

  const cur = draft ?? settings ?? {};
  const set = (patch: any) => setDraft({ ...cur, ...patch });

  if (!settings) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> Connection Mode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {["simulated", "live"].map((m) => (
            <button key={m} onClick={() => set({ mode: m })}
              className={`p-3 rounded-md border text-sm font-medium ${cur.mode === m ? "border-primary bg-primary/5 text-primary" : "border-stone-200 hover:bg-stone-50"}`}>
              {m === "simulated" ? "Simulation (pilot)" : "Live (Workday API)"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <div><label className="label">Tenant URL</label><input className="input-field" value={cur.tenantUrl || ""} onChange={(e) => set({ tenantUrl: e.target.value })} placeholder="https://wd5.myworkday.com/tenant" /></div>
          <div><label className="label">ISU Username</label><input className="input-field" value={cur.isuUsername || ""} onChange={(e) => set({ isuUsername: e.target.value })} placeholder="dealpad_isu@tenant" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label className="label">API Client ID</label><input className="input-field" value={cur.apiClientId || ""} onChange={(e) => set({ apiClientId: e.target.value })} /></div>
            <div><label className="label">API Client Secret</label><input type="password" className="input-field" value={cur.apiClientSecret || ""} onChange={(e) => set({ apiClientSecret: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">In Live mode the same provider interface calls Workday's REST endpoints. Pilot data persists across the swap.</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Validation Behavior</h3>
        <label className="flex items-center justify-between text-sm py-1">
          <span>Auto-validate on deal save</span>
          <input type="checkbox" checked={!!cur.autoValidateOnSave} onChange={(e) => set({ autoValidateOnSave: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-sm py-1">
          <span>Block approval submission on failure</span>
          <input type="checkbox" checked={!!cur.autoCheckOnSubmit} onChange={(e) => set({ autoCheckOnSubmit: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-sm py-1">
          <span>Nightly Workday refresh</span>
          <input type="checkbox" checked={!!cur.nightlyRefreshEnabled} onChange={(e) => set({ nightlyRefreshEnabled: e.target.checked })} />
        </label>
        <div>
          <label className="label">Rate variance tolerance (%)</label>
          <input type="number" step="0.5" className="input-field" value={cur.rateVarianceTolerancePct || 0} onChange={(e) => set({ rateVarianceTolerancePct: parseFloat(e.target.value) || 0 })} />
          <p className="text-xs text-muted-foreground mt-1">Variances within this band surface as info-level only; outside this band are warnings (non-blocking).</p>
        </div>

        <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
          {draft && <button className="px-3 py-1.5 rounded-md border text-xs" onClick={() => setDraft(null)}>Discard</button>}
          <button disabled={!draft || update.isPending} className="btn-primary text-xs disabled:opacity-50"
            onClick={() => update.mutate({ ...draft, userName: persona?.name }, { onSuccess: () => setDraft(null) })}>
            {update.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ EVENT LOG ============
function EventLogPanel() {
  const { data: events = [] } = useWorkdayEvents();
  return (
    <div className="card mt-6 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Workday Event Log</h3>
        <span className="text-xs text-muted-foreground">{events.length} events · refreshes every 8s</span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-stone-50 border-b border-stone-200 sticky top-0">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2 font-semibold">When</th>
              <th className="text-left px-4 py-2 font-semibold">Event</th>
              <th className="text-left px-4 py-2 font-semibold">Entity</th>
              <th className="text-left px-4 py-2 font-semibold">Source</th>
              <th className="text-left px-4 py-2 font-semibold">Trigger</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Message</th>
              <th className="text-left px-4 py-2 font-semibold">Actor</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e: any) => (
              <tr key={e.id} className="border-b border-stone-100 hover:bg-stone-50/50">
                <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                <td className="px-4 py-1.5 font-medium">{e.eventType}</td>
                <td className="px-4 py-1.5">{e.entity}{e.entityName ? ` · ${e.entityName}` : ""}</td>
                <td className="px-4 py-1.5"><span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-stone-100">{e.source}</span></td>
                <td className="px-4 py-1.5 text-muted-foreground">{e.trigger}</td>
                <td className="px-4 py-1.5">
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    e.status === "success" ? "bg-emerald-100 text-emerald-700"
                    : e.status === "warning" ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-700"}`}>{e.status}</span>
                </td>
                <td className="px-4 py-1.5 text-muted-foreground max-w-md truncate">{e.message}</td>
                <td className="px-4 py-1.5 text-muted-foreground">{e.actorName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
