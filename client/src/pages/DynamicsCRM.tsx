import { useState, useEffect } from "react";
import {
  RefreshCw, ArrowDownToLine, ArrowUpFromLine, Building2, Briefcase,
  TrendingUp, CheckCircle2, AlertTriangle, Database, Loader2,
  Download, Upload, Settings, Pencil, Save, X, Moon, Zap, Plus, Sparkles, Unlink,
} from "lucide-react";
import {
  useDynamicsAccounts, useDynamicsOpportunities, useDynamicsPipeline,
  useDynamicsSyncLog, useDynamicsSync, useImportOpportunity,
  useDynamicsSettings, useUpdateDynamicsSettings,
  useUpdateDynamicsAccount, useUpdateDynamicsOpportunity,
  useNightlyBatch, usePushDealToDynamics, useUnlinkOpportunity,
  useScopeTemplates, useCreateOpportunity,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type Tab = "accounts" | "opportunities" | "pipeline" | "settings";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtMoneyFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDateTime = (s: string | null | undefined) => {
  if (!s || s === "—") return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function DynamicsCRM() {
  const [tab, setTab] = useState<Tab>("accounts");
  const { persona } = useAuth();
  const sync = useDynamicsSync();
  const { data: settings } = useDynamicsSettings();

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Integration · Pilot Simulation</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Microsoft Dynamics 365 CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Persistent simulation: leadership-editable records, bi-directional sync, and configurable auto-push
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">Connected</span>
          </div>
          {settings?.autoPushEnabled && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200">
              <Zap className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-xs font-medium text-amber-700">Auto-push ON</span>
            </div>
          )}
          <button
            onClick={() => sync.mutate({ entity: "All", direction: "bidirectional", userName: persona?.name })}
            disabled={sync.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync All
          </button>
        </div>
      </div>

      <div className="border-b border-stone-200 mb-6">
        <div className="flex gap-1">
          {[
            { id: "accounts" as const, label: "Client Accounts", icon: Building2, sub: "Master data sync" },
            { id: "opportunities" as const, label: "Opportunities", icon: Briefcase, sub: "Pipeline bi-directional" },
            { id: "pipeline" as const, label: "Pipeline Reporting", icon: TrendingUp, sub: "Forecast & quota" },
            { id: "settings" as const, label: "Sync Settings", icon: Settings, sub: "Auto-push & batches" },
          ].map((t) => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
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

      {tab === "accounts" && <AccountsTab />}
      {tab === "opportunities" && <OpportunitiesTab />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "settings" && <SettingsTab />}

      {tab !== "settings" && <SyncLogPanel />}
    </div>
  );
}

function AccountsTab() {
  const { data: accounts = [], isLoading } = useDynamicsAccounts();
  const sync = useDynamicsSync();
  const update = useUpdateDynamicsAccount();
  const { persona } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>({});

  const selected = accounts.find((a: any) => a.id === selectedId);
  useEffect(() => { if (selected) setDraft(selected); }, [selectedId, selected?.updatedAt]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading accounts...</div>;

  const startEdit = () => { setEditing(true); setDraft({ ...selected }); };
  const cancelEdit = () => { setEditing(false); setDraft(selected); };
  const saveEdit = async () => {
    const payload: any = { id: selected.id, userName: persona?.name };
    ["name", "industry", "industryCode", "segment", "annualRevenue", "numberOfEmployees",
     "ownerName", "ownerEmail", "relationshipType",
     "contactName", "contactTitle", "contactEmail", "contactPhone",
     "billingStreet", "billingCity", "billingState", "billingZip"].forEach((k) => {
      const cur = k.startsWith("contact") ? selected?.primaryContact?.[k.replace("contact", "").toLowerCase()] : selected?.[k];
      const next = k.startsWith("contact") ? draft?.primaryContact?.[k.replace("contact", "").toLowerCase()] : draft?.[k];
      if (next !== undefined && next !== cur) payload[k] = next;
    });
    await update.mutateAsync(payload);
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 1 · Client master data (system of record)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Account records persist in DealPad's Postgres simulating the D365 store. Leadership can edit revenue, owner,
              contact, and address inline — every change is logged as an inbound D365 sync event. When the real integration
              goes live, these tables map 1:1 to D365 entity records.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <span className="badge-soft">Inbound · Nightly batch (2:00 AM PT)</span>
              <span className="badge-soft">Editable by leadership</span>
              <span className="badge-soft">{accounts.length} accounts persisted</span>
            </div>
          </div>
          <button
            onClick={() => sync.mutate({ entity: "Account", direction: "inbound", userName: persona?.name })}
            disabled={sync.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Pull Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className={`card p-0 overflow-hidden ${selected ? "col-span-7" : "col-span-12"}`}>
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Account #</th>
                <th className="px-4 py-3 text-left font-semibold">Account Name</th>
                <th className="px-4 py-3 text-left font-semibold">Industry</th>
                <th className="px-4 py-3 text-right font-semibold">Annual Revenue</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
                <th className="px-4 py-3 text-left font-semibold">Sync</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a: any) => (
                <tr key={a.id} onClick={() => { setSelectedId(a.id); setEditing(false); }}
                  className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${selectedId === a.id ? "bg-amber-50/50" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.accountNumber}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{a.industry}</div>
                    <div className="text-[10px] font-mono">NAICS {a.industryCode}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(a.annualRevenue)}</td>
                  <td className="px-4 py-3 text-xs">{a.ownerName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[11px] text-muted-foreground">{fmtDateTime(a.lastSyncedAt)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="col-span-5 card p-5 sticky top-4 self-start">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">{selected.name}</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{selected.accountNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <button onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-stone-300 hover:bg-stone-50">
                    <Pencil className="w-3 h-3" /> Edit in D365
                  </button>
                ) : (
                  <>
                    <button onClick={saveEdit} disabled={update.isPending} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-stone-300 hover:bg-stone-50">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}
                <button onClick={() => { setSelectedId(null); setEditing(false); }} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
              </div>
            </div>

            <div className="space-y-4">
              <FieldGroup title="Account Profile">
                <EditableField label="Industry" value={editing ? draft.industry : selected.industry} editing={editing}
                  onChange={(v) => setDraft({ ...draft, industry: v })} />
                <EditableField label="Segment" value={editing ? draft.segment : selected.segment} editing={editing}
                  onChange={(v) => setDraft({ ...draft, segment: v })} />
                <EditableField label="Annual Revenue" value={editing ? String(draft.annualRevenue) : fmtMoneyFull(selected.annualRevenue)}
                  editing={editing} type="number" onChange={(v) => setDraft({ ...draft, annualRevenue: parseFloat(v || "0") })} />
                <EditableField label="Employees" value={editing ? String(draft.numberOfEmployees) : selected.numberOfEmployees.toLocaleString()}
                  editing={editing} type="number" onChange={(v) => setDraft({ ...draft, numberOfEmployees: parseInt(v || "0") })} />
                <ReadOnly label="Relationship" value={`${selected.relationshipType} since ${selected.customerSince}`} />
              </FieldGroup>

              <FieldGroup title="Ownership">
                <EditableField label="Owner" value={editing ? draft.ownerName : selected.ownerName} editing={editing}
                  onChange={(v) => setDraft({ ...draft, ownerName: v })} />
                <EditableField label="Owner Email" value={editing ? draft.ownerEmail : selected.ownerEmail} editing={editing}
                  onChange={(v) => setDraft({ ...draft, ownerEmail: v })} />
              </FieldGroup>

              <FieldGroup title="Primary Contact">
                <ReadOnly label="Name" value={selected.primaryContact.name} />
                <ReadOnly label="Title" value={selected.primaryContact.title} />
                <ReadOnly label="Email" value={selected.primaryContact.email} />
                <ReadOnly label="Phone" value={selected.primaryContact.phone} />
              </FieldGroup>

              <FieldGroup title="Billing Address">
                <ReadOnly label="Street" value={selected.billingAddress.street} />
                <ReadOnly label="City" value={`${selected.billingAddress.city}, ${selected.billingAddress.state} ${selected.billingAddress.zip}`} />
              </FieldGroup>

              <div className="pt-3 border-t border-stone-200">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Dynamics ID</span>
                  <span className="font-mono">{selected.dynamicsId?.slice(0, 18)}...</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Last synced</span>
                  <span>{fmtDateTime(selected.lastSyncedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground min-w-[100px]">
        <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
        <span>{label}</span>
      </div>
      <div className="text-foreground text-right break-all">{value}</div>
    </div>
  );
}

function EditableField({ label, value, editing, onChange, type = "text" }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground min-w-[100px]">
        <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
        <span>{label}</span>
      </div>
      {editing ? (
        <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-right text-xs px-2 py-1 border border-stone-300 rounded focus:outline-none focus:border-primary" />
      ) : (
        <div className="text-foreground text-right break-all">{value}</div>
      )}
    </div>
  );
}

function OpportunitiesTab() {
  const { data: opps = [], isLoading } = useDynamicsOpportunities();
  const sync = useDynamicsSync();
  const importOpp = useImportOpportunity();
  const update = useUpdateDynamicsOpportunity();
  const push = usePushDealToDynamics();
  const unlink = useUnlinkOpportunity();
  const { persona } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [showNew, setShowNew] = useState(false);

  const queued = opps.filter((o: any) => !o.dealpadDealId && o.syncStatus === "queued");
  const synced = opps.filter((o: any) => o.dealpadDealId);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading opportunities...</div>;

  const startEdit = (o: any) => { setEditingId(o.id); setDraft({ stage: o.stage, probability: o.probability, estimatedValue: o.estimatedValue, estimatedCloseDate: o.estimatedCloseDate, ownerName: o.ownerName }); };
  const saveEdit = async () => {
    if (editingId == null) return;
    await update.mutateAsync({ id: editingId, ...draft, userName: persona?.name });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <Briefcase className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 2 · Opportunity pipeline (bi-directional)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Importing creates a real DealPad draft deal linked to the D365 opportunity. Outbound: stage, fee, probability,
              and forecast category push back — manually with the per-row Push button, or automatically if auto-push is enabled
              in Settings. Edit any opportunity inline to simulate a sales-rep update in D365.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-soft">Inbound: New opps → DealPad drafts (real)</span>
              <span className="badge-soft">Outbound: Fee, stage, probability → D365 (real)</span>
              <span className="badge-soft">Editable inline</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> New Opportunity
            </button>
            <button onClick={() => sync.mutate({ entity: "Opportunity", direction: "inbound", userName: persona?.name })}
              disabled={sync.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Pull
            </button>
            <button onClick={() => sync.mutate({ entity: "Opportunity", direction: "outbound", userName: persona?.name })}
              disabled={sync.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" /> Push
            </button>
          </div>
        </div>
      </div>

      {showNew && <NewOpportunityModal onClose={() => setShowNew(false)} />}

      {queued.length > 0 && (
        <div className="card p-5 border-amber-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-foreground">Queued for import ({queued.length})</h3>
            </div>
            <span className="text-xs text-muted-foreground">New opportunities in Dynamics not yet imported</span>
          </div>
          <div className="space-y-2">
            {queued.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-md bg-amber-50/50 border border-amber-200">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{o.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.opportunityNumber} · {o.accountName} · {o.stage} · {fmtMoney(o.estimatedValue)} · Close {o.estimatedCloseDate}
                  </div>
                </div>
                <button onClick={() => importOpp.mutate({ id: o.id, userName: persona?.name })}
                  disabled={importOpp.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                  <ArrowDownToLine className="w-3.5 h-3.5" /> Import to DealPad
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Synced opportunities ({synced.length})</h3>
          <span className="text-xs text-muted-foreground">DealPad ⇄ Dynamics</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
              <th className="px-4 py-3 text-left font-semibold">Account</th>
              <th className="px-4 py-3 text-left font-semibold">Stage</th>
              <th className="px-4 py-3 text-right font-semibold">Est. Value</th>
              <th className="px-4 py-3 text-center font-semibold">Prob</th>
              <th className="px-4 py-3 text-left font-semibold">Owner</th>
              <th className="px-4 py-3 text-left font-semibold">Sync</th>
              <th className="px-4 py-3 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {synced.map((o: any) => {
              const isEditing = editingId === o.id;
              return (
                <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{o.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{o.opportunityNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{o.accountName}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                        className="text-xs px-2 py-1 border border-stone-300 rounded">
                        {["Qualify", "Develop", "Propose", "Close", "Won", "Lost"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <StageBadge stage={o.stage} />}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing ? (
                      <input type="number" value={draft.estimatedValue} onChange={(e) => setDraft({ ...draft, estimatedValue: parseFloat(e.target.value || "0") })}
                        className="w-24 text-right text-xs px-2 py-1 border border-stone-300 rounded" />
                    ) : fmtMoney(o.estimatedValue)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-medium">
                    {isEditing ? (
                      <input type="number" value={draft.probability} onChange={(e) => setDraft({ ...draft, probability: parseInt(e.target.value || "0") })}
                        className="w-14 text-center text-xs px-2 py-1 border border-stone-300 rounded" />
                    ) : `${o.probability}%`}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {isEditing ? (
                      <input value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })}
                        className="w-32 text-xs px-2 py-1 border border-stone-300 rounded" />
                    ) : o.ownerName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowDownToLine className="w-3 h-3 text-blue-600" />
                      <span>{fmtDateTime(o.lastPulledAt)}</span>
                      <span className="mx-1">·</span>
                      <ArrowUpFromLine className="w-3 h-3 text-emerald-600" />
                      <span>{fmtDateTime(o.lastPushedAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={saveEdit} disabled={update.isPending} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
                          <Save className="w-3 h-3" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(o)} title="Edit in D365" className="text-muted-foreground hover:text-primary p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {o.dealpadDealId && (
                          <button onClick={() => push.mutate({ dealId: o.dealpadDealId, userName: persona?.name })}
                            disabled={push.isPending} title="Push DealPad → D365"
                            className="text-muted-foreground hover:text-emerald-700 p-1 disabled:opacity-50">
                            <ArrowUpFromLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {o.dealpadDealId && (
                          <button
                            onClick={() => {
                              if (confirm(`Unlink ${o.opportunityNumber} from DealPad deal #${o.dealpadDealId}?\n\nThe deal stays intact, but the opportunity becomes available again in the New Deal flow.`)) {
                                unlink.mutate({ id: o.id, userName: persona?.name });
                              }
                            }}
                            disabled={unlink.isPending}
                            title={`Unlink from deal #${o.dealpadDealId}`}
                            className="text-muted-foreground hover:text-amber-700 p-1 disabled:opacity-50">
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    Qualify: "bg-stone-100 text-stone-700",
    Develop: "bg-blue-100 text-blue-700",
    Propose: "bg-amber-100 text-amber-700",
    Close: "bg-violet-100 text-violet-700",
    Won: "bg-emerald-100 text-emerald-700",
    Lost: "bg-red-100 text-red-700",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${colors[stage] || "bg-stone-100"}`}>{stage}</span>;
}

function PipelineTab() {
  const { data: p, isLoading } = useDynamicsPipeline();
  if (isLoading || !p) return <div className="text-sm text-muted-foreground">Loading pipeline...</div>;
  const quotaAttainment = p.quotaTotal > 0 ? (p.wonYTD.value / p.quotaTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 3 · Pipeline reporting (Dynamics is source of truth)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These rollups read from the persisted opportunity store, so every push (manual or auto) immediately moves
              forecast and quota numbers — exactly as the live D365 dashboard would behave.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Open Pipeline" value={fmtMoney(p.totalPipelineValue)} sub={`${p.openOpportunities} opps`} />
        <Kpi label="Weighted Pipeline" value={fmtMoney(p.weightedPipelineValue)} sub="Probability-adjusted" />
        <Kpi label="Win Rate (YTD)" value={`${p.winRate.toFixed(1)}%`} sub={`${p.wonYTD.count}W / ${p.lostYTD.count}L`} />
        <Kpi label="Quota Attainment" value={`${quotaAttainment.toFixed(1)}%`} sub={`${fmtMoney(p.wonYTD.value)} of ${fmtMoney(p.quotaTotal)}`} />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline by stage</h3>
        <div className="space-y-3">
          {p.byStage.map((s: any) => {
            const max = Math.max(...p.byStage.map((x: any) => x.value), 1);
            const pct = (s.value / max) * 100;
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <StageBadge stage={s.stage} />
                    <span className="text-muted-foreground">{s.count} opps</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-medium text-foreground">{fmtMoney(s.value)}</span>
                    <span className="text-muted-foreground ml-2">weighted {fmtMoney(s.weighted)}</span>
                  </div>
                </div>
                <div className="h-6 rounded-md bg-stone-100 overflow-hidden">
                  <div className="h-full bg-primary/80 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Forecast roll-up</h3>
          <div className="space-y-3">
            {[
              { label: "Closed (Won)", value: p.forecast.closed, color: "bg-emerald-500" },
              { label: "Commit", value: p.forecast.commit, color: "bg-blue-500" },
              { label: "Best Case", value: p.forecast.bestCase, color: "bg-amber-500" },
              { label: "Pipeline", value: p.forecast.pipeline, color: "bg-stone-400" },
            ].map((f) => {
              const total = p.forecast.closed + p.forecast.commit + p.forecast.bestCase + p.forecast.pipeline;
              const pct = total > 0 ? (f.value / total) * 100 : 0;
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium tabular-nums">{fmtMoney(f.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className={`h-full ${f.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total forecast (Closed + Commit)</span>
            <span className="font-semibold text-foreground tabular-nums">{fmtMoney(p.forecast.closed + p.forecast.commit)}</span>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Owner performance</h3>
          <div className="space-y-3">
            {p.byOwner.map((o: any) => {
              const attain = o.quota > 0 ? (o.value / o.quota) * 100 : 0;
              return (
                <div key={o.owner}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{o.owner}</span>
                    <span className="text-muted-foreground">
                      {o.count} opps · <span className="font-medium text-foreground">{fmtMoney(o.value)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className={`h-full ${attain >= 80 ? "bg-emerald-500" : attain >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${Math.min(attain, 100)}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{attain.toFixed(0)}% of {fmtMoney(o.quota)} quota</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function SettingsTab() {
  const { data: settings, isLoading } = useDynamicsSettings();
  const update = useUpdateDynamicsSettings();
  const batch = useNightlyBatch();
  const { persona } = useAuth();

  if (isLoading || !settings) return <div className="text-sm text-muted-foreground">Loading settings...</div>;

  const toggle = (key: string, val: boolean) => update.mutate({ [key]: val, userName: persona?.name });

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Outbound auto-push</h3>
            <p className="text-xs text-muted-foreground mt-1">When enabled, every deal change in DealPad immediately writes back to the linked D365 opportunity.</p>
          </div>
          <Toggle checked={!!settings.autoPushEnabled} onChange={(v) => toggle("autoPushEnabled", v)} />
        </div>

        <div className={`space-y-3 pl-4 border-l-2 ${settings.autoPushEnabled ? "border-amber-300" : "border-stone-200 opacity-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-foreground">Push on stage change</div>
              <div className="text-xs text-muted-foreground">Submit, approve, won/lost transitions</div>
            </div>
            <Toggle checked={!!settings.autoPushOnStageChange} disabled={!settings.autoPushEnabled}
              onChange={(v) => toggle("autoPushOnStageChange", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-foreground">Push on fee/margin change</div>
              <div className="text-xs text-muted-foreground">Pricing edits, rate adjustments, scope changes</div>
            </div>
            <Toggle checked={!!settings.autoPushOnFeeChange} disabled={!settings.autoPushEnabled}
              onChange={(v) => toggle("autoPushOnFeeChange", v)} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Inbound nightly batch</h3>
            <p className="text-xs text-muted-foreground mt-1">Refreshes all account and open opportunity records from D365 (simulated).</p>
          </div>
          <Toggle checked={!!settings.nightlyBatchEnabled} onChange={(v) => toggle("nightlyBatchEnabled", v)} />
        </div>
        <button onClick={() => batch.mutate({ userName: persona?.name })} disabled={batch.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-stone-100 hover:bg-stone-200 text-xs font-medium text-foreground disabled:opacity-50">
          <Moon className="w-3.5 h-3.5" /> Run batch now
        </button>
      </div>

      <div className="card p-5 bg-stone-50">
        <h3 className="text-sm font-semibold text-foreground mb-2">Pilot mode notes</h3>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>All data persists in PostgreSQL. Restarts and deploys preserve account, opportunity, and sync log state.</li>
          <li>Leadership edits to accounts and opportunities are logged as inbound D365 events.</li>
          <li>Imports create real DealPad draft deals with a back-link to the originating D365 opportunity.</li>
          <li>When the live D365 integration is wired, the same persistence schema maps 1:1 to D365 entities — only the read/write functions swap to REST calls.</li>
        </ul>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-stone-300"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function NewOpportunityModal({ onClose }: { onClose: () => void }) {
  const { data: accounts = [] } = useDynamicsAccounts();
  const { data: templates = [] } = useScopeTemplates();
  const create = useCreateOpportunity();
  const { persona } = useAuth();
  const [form, setForm] = useState({
    accountId: "", name: "", estimatedValue: "", stage: "Qualify",
    estimatedCloseDate: new Date(Date.now() + 90 * 86400 * 1000).toISOString().slice(0, 10),
    ownerName: "", scopeTemplateKey: "",
  });
  const seedScope = !!form.scopeTemplateKey;
  const tmpl = templates.find((t: any) => t.key === form.scopeTemplateKey);

  // Auto-fill name when template + account chosen
  useEffect(() => {
    if (form.scopeTemplateKey && form.accountId && !form.name) {
      const acct = accounts.find((a: any) => a.id === parseInt(form.accountId));
      if (acct) setForm((f) => ({ ...f, name: `${acct.name} - ${form.scopeTemplateKey}` }));
    }
  }, [form.scopeTemplateKey, form.accountId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.name) return;
    await create.mutateAsync({
      ...form,
      accountId: parseInt(form.accountId),
      estimatedValue: parseFloat(form.estimatedValue || "0"),
      userName: persona?.name,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">New Dynamics 365 Opportunity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Simulates a Sales rep creating an opportunity in D365</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</label>
              <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary">
                <option value="">Select account...</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} — {a.industry}</option>)}
              </select>
            </div>

            <div className="col-span-2 p-4 rounded-lg bg-amber-50/50 border border-amber-200">
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Pre-seed scope information</div>
                  <div className="text-xs text-muted-foreground">Picking a service template auto-fills scope hints, complexity, and bumps the opportunity to <span className="font-semibold">Develop</span> — making it eligible for DealPad scoping.</div>
                </div>
              </div>
              <select value={form.scopeTemplateKey} onChange={(e) => setForm({ ...form, scopeTemplateKey: e.target.value })}
                className="w-full mt-2 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary bg-white">
                <option value="">No template (start in Qualify)</option>
                {templates.map((t: any) => <option key={t.key} value={t.key}>{t.key} — {t.serviceLine} ({t.complexity} complexity)</option>)}
              </select>
              {tmpl && (
                <div className="mt-3 p-3 bg-white rounded border border-amber-200 text-xs space-y-1">
                  <div><span className="text-muted-foreground">Business Unit:</span> <span className="font-medium">{tmpl.businessUnit}</span></div>
                  <div><span className="text-muted-foreground">Service Line:</span> <span className="font-medium">{tmpl.serviceLine}</span></div>
                  <div><span className="text-muted-foreground">Scope:</span> {tmpl.scopeNotes}</div>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opportunity Name</label>
              <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Acme Corp - 2026 Annual Audit"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated Value</label>
              <input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
                placeholder="285000"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
                disabled={seedScope}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary disabled:bg-stone-100 disabled:text-muted-foreground">
                {["Qualify", "Develop", "Propose", "Close"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {seedScope && <p className="text-[10px] text-amber-700 mt-1">Auto-set to Develop because scope is pre-seeded</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Est. Close Date</label>
              <input type="date" value={form.estimatedCloseDate} onChange={(e) => setForm({ ...form, estimatedCloseDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner</label>
              <input type="text" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder="Jennifer Walsh"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-stone-100 rounded-md">Cancel</button>
            <button type="submit" disabled={create.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create in D365
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SyncLogPanel() {
  const { data: log = [] } = useDynamicsSyncLog();
  return (
    <div className="card p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sync activity log</h3>
          <p className="text-xs text-muted-foreground">Persistent log of every bi-directional event (DealPad ⇄ Dynamics 365)</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Auto-refreshes every 5s</span>
      </div>
      <div className="space-y-1.5 max-h-96 overflow-auto">
        {log.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">No sync events yet</div>}
        {log.slice(0, 30).map((e: any) => (
          <div key={e.id} className="flex items-start gap-3 px-3 py-2 rounded-md bg-stone-50 text-xs">
            <div className="mt-0.5">
              {e.direction === "inbound" ? <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" /> :
               e.direction === "outbound" ? <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600" /> :
               <RefreshCw className="w-3.5 h-3.5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{e.entityName}</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white border border-stone-200 text-muted-foreground">{e.entity}</span>
                {e.trigger === "auto" && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">auto</span>}
                {e.trigger === "batch" && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">batch</span>}
                {Array.isArray(e.fields) && e.fields.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{e.fields.slice(0, 3).join(", ")}{e.fields.length > 3 ? `, +${e.fields.length - 3}` : ""}</span>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5">{e.message}</div>
            </div>
            <div className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDateTime(e.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
