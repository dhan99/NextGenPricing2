import { useState, useMemo } from "react";
import {
  RefreshCw, ArrowDownToLine, ArrowUpFromLine, Building2, Briefcase,
  TrendingUp, CheckCircle2, AlertTriangle, Clock, Users, Target,
  ArrowRight, Database, Loader2, Download, Upload, ExternalLink,
} from "lucide-react";
import {
  useDynamicsAccounts, useDynamicsOpportunities, useDynamicsPipeline,
  useDynamicsSyncLog, useDynamicsSync, useImportOpportunity,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type Tab = "accounts" | "opportunities" | "pipeline";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toFixed(0)}`;

const fmtMoneyFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDateTime = (s: string) => {
  if (!s || s === "—") return "—";
  const d = new Date(s);
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

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Integration · Simulated</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Microsoft Dynamics 365 CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bi-directional integration: client master data, opportunity pipeline, and sales reporting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">Connected</span>
          </div>
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

      {/* Tabs */}
      <div className="border-b border-stone-200 mb-6">
        <div className="flex gap-1">
          {[
            { id: "accounts" as const, label: "Client Accounts", icon: Building2, sub: "Master data sync" },
            { id: "opportunities" as const, label: "Opportunities", icon: Briefcase, sub: "Pipeline bi-directional" },
            { id: "pipeline" as const, label: "Pipeline Reporting", icon: TrendingUp, sub: "Forecast & quota" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
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

      <SyncLogPanel />
    </div>
  );
}

function AccountsTab() {
  const { data: accounts = [], isLoading } = useDynamicsAccounts();
  const sync = useDynamicsSync();
  const { persona } = useAuth();
  const [selected, setSelected] = useState<any>(null);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading accounts...</div>;

  return (
    <div className="space-y-6">
      {/* Role explainer */}
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 1 · Client master data (system of record)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every client record originates in Dynamics 365. Account name, industry code (NAICS), revenue, employee count,
              ownership, primary contact, and billing address sync inbound nightly. DealPad reads this data when a Pursuit Lead
              starts a new deal so no one re-keys customer info.
            </p>
            <div className="flex gap-2 mt-3">
              <span className="badge-soft">Inbound · Nightly batch (2:00 AM PT)</span>
              <span className="badge-soft">Source of truth: Dynamics</span>
              <span className="badge-soft">{accounts.length} accounts synced</span>
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
                <tr
                  key={a.dynamicsId}
                  onClick={() => setSelected(a)}
                  className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${selected?.dynamicsId === a.dynamicsId ? "bg-amber-50/50" : ""}`}
                >
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
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">×</button>
            </div>

            <div className="space-y-4">
              <FieldGroup title="Account Profile">
                <Field label="Industry" value={`${selected.industry} (NAICS ${selected.industryCode})`} synced />
                <Field label="Segment" value={selected.segment} synced />
                <Field label="Annual Revenue" value={fmtMoneyFull(selected.annualRevenue)} synced />
                <Field label="Employees" value={selected.numberOfEmployees.toLocaleString()} synced />
                <Field label="Relationship" value={`${selected.relationshipType} since ${selected.customerSince}`} synced />
              </FieldGroup>

              <FieldGroup title="Ownership">
                <Field label="Owner" value={selected.ownerName} synced />
                <Field label="Owner Email" value={selected.ownerEmail} synced />
              </FieldGroup>

              <FieldGroup title="Primary Contact">
                <Field label="Name" value={selected.primaryContact.name} synced />
                <Field label="Title" value={selected.primaryContact.title} synced />
                <Field label="Email" value={selected.primaryContact.email} synced />
                <Field label="Phone" value={selected.primaryContact.phone} synced />
              </FieldGroup>

              <FieldGroup title="Billing Address">
                <Field label="Street" value={selected.billingAddress.street} synced />
                <Field label="City" value={`${selected.billingAddress.city}, ${selected.billingAddress.state} ${selected.billingAddress.zip}`} synced />
              </FieldGroup>

              <div className="pt-3 border-t border-stone-200">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Dynamics ID</span>
                  <span className="font-mono">{selected.dynamicsId.slice(0, 18)}...</span>
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

function Field({ label, value, synced }: { label: string; value: string; synced?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground min-w-[100px]">
        {synced && <ArrowDownToLine className="w-3 h-3 text-emerald-600" />}
        <span>{label}</span>
      </div>
      <div className="text-foreground text-right break-all">{value}</div>
    </div>
  );
}

function OpportunitiesTab() {
  const { data: opps = [], isLoading } = useDynamicsOpportunities();
  const sync = useDynamicsSync();
  const importOpp = useImportOpportunity();
  const { persona } = useAuth();

  const queued = opps.filter((o: any) => o.syncStatus === "queued");
  const synced = opps.filter((o: any) => o.syncStatus === "synced");

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading opportunities...</div>;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <Briefcase className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 2 · Opportunity pipeline (bi-directional)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sales reps create opportunities in Dynamics → DealPad pulls them as draft deals. As Pursuit Leads scope and price
              in DealPad, fee, stage, probability, close date, and forecast category are pushed back to Dynamics so leadership's
              pipeline stays accurate without double-entry.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-soft">Inbound: New opportunities → DealPad drafts</span>
              <span className="badge-soft">Outbound: Fee, stage, probability → D365</span>
              <span className="badge-soft">Real-time on save</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => sync.mutate({ entity: "Opportunity", direction: "inbound", userName: persona?.name })}
              disabled={sync.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Pull
            </button>
            <button
              onClick={() => sync.mutate({ entity: "Opportunity", direction: "outbound", userName: persona?.name })}
              disabled={sync.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> Push
            </button>
          </div>
        </div>
      </div>

      {queued.length > 0 && (
        <div className="card p-5 border-amber-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-foreground">Queued for import ({queued.length})</h3>
            </div>
            <span className="text-xs text-muted-foreground">New opportunities in Dynamics not yet in DealPad</span>
          </div>
          <div className="space-y-2">
            {queued.map((o: any) => (
              <div key={o.dynamicsId} className="flex items-center justify-between p-3 rounded-md bg-amber-50/50 border border-amber-200">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{o.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.opportunityNumber} · {o.accountName} · {o.stage} · {fmtMoney(o.estimatedValue)} · Close {o.estimatedCloseDate}
                  </div>
                </div>
                <button
                  onClick={() => importOpp.mutate({ dynamicsId: o.dynamicsId })}
                  disabled={importOpp.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
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
              <th className="px-4 py-3 text-left font-semibold">Forecast</th>
              <th className="px-4 py-3 text-left font-semibold">Sync</th>
            </tr>
          </thead>
          <tbody>
            {synced.map((o: any) => (
              <tr key={o.dynamicsId} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{o.name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{o.opportunityNumber}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{o.accountName}</td>
                <td className="px-4 py-3">
                  <StageBadge stage={o.stage} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.estimatedValue)}</td>
                <td className="px-4 py-3 text-center text-xs font-medium">{o.probability}%</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{o.forecastCategory}</span>
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
              </tr>
            ))}
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

  const quotaAttainment = (p.wonYTD.value / p.quotaTotal) * 100;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">Role 3 · Pipeline reporting (Dynamics is source of truth)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Forecasting, win-rate, and quota attainment dashboards continue to live in Dynamics. DealPad pushes financial
              outcomes (fee, margin, won/lost) so these reports stay in sync. The view below mirrors the live D365 dashboard
              that leadership uses for weekly forecast calls.
            </p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Open Pipeline" value={fmtMoney(p.totalPipelineValue)} sub={`${p.openOpportunities} opps`} />
        <Kpi label="Weighted Pipeline" value={fmtMoney(p.weightedPipelineValue)} sub="Probability-adjusted" />
        <Kpi label="Win Rate (YTD)" value={`${p.winRate.toFixed(1)}%`} sub={`${p.wonYTD.count}W / ${p.lostYTD.count}L`} />
        <Kpi label="Quota Attainment" value={`${quotaAttainment.toFixed(1)}%`} sub={`${fmtMoney(p.wonYTD.value)} of ${fmtMoney(p.quotaTotal)}`} />
      </div>

      {/* By Stage funnel */}
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

      {/* Forecast categories */}
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
              const attain = (o.value / o.quota) * 100;
              return (
                <div key={o.owner}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{o.owner}</span>
                    <span className="text-muted-foreground">
                      {o.count} opps · <span className="font-medium text-foreground">{fmtMoney(o.value)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className={`h-full ${attain >= 80 ? "bg-emerald-500" : attain >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${Math.min(attain, 100)}%` }}
                    />
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

function SyncLogPanel() {
  const { data: log = [] } = useDynamicsSyncLog();

  return (
    <div className="card p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sync activity log</h3>
          <p className="text-xs text-muted-foreground">Live bi-directional events between DealPad and Dynamics 365</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Auto-refreshes every 5s</span>
      </div>
      <div className="space-y-1.5 max-h-96 overflow-auto">
        {log.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">No sync events yet</div>}
        {log.slice(0, 30).map((e: any) => (
          <div key={e.id} className="flex items-start gap-3 px-3 py-2 rounded-md bg-stone-50 text-xs">
            <div className="mt-0.5">
              {e.direction === "inbound" ? (
                <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" />
              ) : e.direction === "outbound" ? (
                <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{e.entityName}</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white border border-stone-200 text-muted-foreground">
                  {e.entity}
                </span>
                {e.fields && (
                  <span className="text-[10px] text-muted-foreground">
                    {e.fields.slice(0, 3).join(", ")}{e.fields.length > 3 ? `, +${e.fields.length - 3}` : ""}
                  </span>
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
