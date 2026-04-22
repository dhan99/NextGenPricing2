import { useState } from "react";
import { Link } from "wouter";
import {
  Shield, AlertTriangle, CheckCircle2, Loader2, Activity, Settings as SettingsIcon,
  PlayCircle, History, ShieldAlert, Search, ChevronRight, Lock, Globe, Cog,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  useIntappSettings, useUpdateIntappSettings, useIntappScreenings,
  useRunIntappScreening, useIntappEvents, useIntappDashboard, useDeals,
} from "@/hooks/use-api";

const TABS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "screenings", label: "Screenings", icon: Search },
  { key: "events", label: "Audit log", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = typeof TABS[number]["key"];

export function Intapp() {
  const [tab, setTab] = useState<TabKey>("overview");
  const { data: settings } = useIntappSettings();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Intapp Risk &amp; Compliance</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Conflicts, sanctions, PEP and independence screening — running in{" "}
              <span className="font-semibold text-foreground">{settings?.mode === "live" ? "LIVE" : "SIMULATION"}</span> mode for the 4-week pilot.
            </p>
          </div>
        </div>
        {settings && (
          <div className="text-left sm:text-right text-xs flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-0 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-foreground font-medium">
              {settings.mode === "live" ? <Globe className="w-3.5 h-3.5" /> : <Cog className="w-3.5 h-3.5" />}
              {settings.mode === "live" ? "Live API" : "Simulated"}
            </div>
            <div className="text-muted-foreground sm:mt-1">Policy {settings.policyVersion}</div>
            {settings.pilotEndsOn && <div className="text-muted-foreground">Pilot ends {settings.pilotEndsOn}</div>}
          </div>
        )}
      </div>

      <div className="border-b border-stone-200 mb-5 sm:mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "screenings" && <ScreeningsTab />}
      {tab === "events" && <EventsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function OverviewTab() {
  const { data: dash, isLoading } = useIntappDashboard();
  if (isLoading || !dash) return <div className="text-sm text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/60 border-amber-200">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-700 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">QRM cockpit · {dash.mode === "live" ? "Live" : "Simulated"} mode</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Every Draft → Submitted transition triggers an Intapp screening. Conflicts block submission until QRM mitigation or override.
              Switching to the live Intapp API after the {dash.pilotEndsOn ? `pilot (ends ${dash.pilotEndsOn})` : "pilot"} is a single configuration change.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Total screenings" value={dash.total} sub="Lifetime" />
        <Kpi label="Cleared" value={dash.byResult.clear} sub="No issues" tone="emerald" />
        <Kpi label="Review" value={dash.byResult.review} sub="Mitigations needed" tone="amber" />
        <Kpi label="Conflicts" value={dash.byResult.conflict} sub="Blocked" tone="red" />
        <Kpi label="QRM overrides" value={dash.byResult.override} sub="Audit-logged" tone="violet" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TierCard tier="low" label="Low risk" count={dash.byTier.low} />
        <TierCard tier="medium" label="Medium risk" count={dash.byTier.medium} />
        <TierCard tier="high" label="High risk" count={dash.byTier.high} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Open conflicts requiring QRM action</h3>
          <span className="text-[11px] text-muted-foreground">{dash.openConflicts.length} open</span>
        </div>
        {dash.openConflicts.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
            No open conflicts. All screened deals are clear or mitigated.
          </div>
        ) : (
          <div className="space-y-2">
            {dash.openConflicts.map((c: any) => (
              <Link key={c.id} href={`/deals/${c.dealId}`}>
                <div className="flex items-start gap-3 p-3 rounded-md border border-red-200 bg-red-50/40 hover:bg-red-50 cursor-pointer transition-colors">
                  <AlertTriangle className="w-4.5 h-4.5 text-red-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{c.clientName || "—"}</span>
                      <span className="text-[11px] text-muted-foreground">{c.dealNumber} · {c.dealTitle}</span>
                      <RiskBadge tier={c.riskTier} />
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                        {c.hitCount} hit{c.hitCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.narrative}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent activity</h3>
        <div className="space-y-1.5">
          {dash.recentEvents.map((e: any) => <EventRow key={e.id} e={e} />)}
        </div>
      </div>
    </div>
  );
}

function ScreeningsTab() {
  const { data: screenings = [] } = useIntappScreenings();
  const { data: deals = [] } = useDeals();
  const { persona } = useAuth();
  const run = useRunIntappScreening();
  const [pickDeal, setPickDeal] = useState<string>("");

  const dealsById: Record<number, any> = Object.fromEntries((deals || []).map((d: any) => [d.id, d]));

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Run a new screening</label>
          <select value={pickDeal} onChange={(e) => setPickDeal(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary">
            <option value="">Select a deal to screen...</option>
            {(deals || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.dealNumber} — {d.title} ({d.client?.name})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => pickDeal && run.mutate({ dealId: parseInt(pickDeal), userName: persona?.name })}
          disabled={!pickDeal || run.isPending}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 w-full sm:w-auto flex-shrink-0">
          {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Run screening
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Requested</th>
              <th className="text-left px-4 py-2.5">Deal</th>
              <th className="text-left px-4 py-2.5">Source</th>
              <th className="text-left px-4 py-2.5">Result</th>
              <th className="text-left px-4 py-2.5">Tier</th>
              <th className="text-right px-4 py-2.5">Hits</th>
              <th className="text-left px-4 py-2.5">Ext. ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {screenings.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No screenings yet</td></tr>
            )}
            {screenings.map((s: any) => {
              const d = dealsById[s.dealId];
              return (
                <tr key={s.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.requestedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {d ? (
                      <Link href={`/deals/${d.id}`}>
                        <span className="text-primary hover:underline cursor-pointer text-sm font-medium">
                          {d.dealNumber} — {d.client?.name}
                        </span>
                      </Link>
                    ) : <span className="text-xs text-muted-foreground">deal #{s.dealId}</span>}
                  </td>
                  <td className="px-4 py-2.5"><SourceBadge source={s.source} /></td>
                  <td className="px-4 py-2.5"><ResultBadge result={s.result} /></td>
                  <td className="px-4 py-2.5"><RiskBadge tier={s.riskTier} /></td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">{s.hitCount}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.externalRef || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsTab() {
  const { data: events = [] } = useIntappEvents();
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Persistent audit trail</h3>
      <div className="space-y-1.5 max-h-[600px] overflow-auto">
        {events.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No events yet</div>}
        {events.map((e: any) => <EventRow key={e.id} e={e} />)}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { data: settings, isLoading } = useIntappSettings();
  const update = useUpdateIntappSettings();
  const { persona } = useAuth();
  if (isLoading || !settings) return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  const set = (k: string, v: any) => update.mutate({ [k]: v, userName: persona?.name });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Provider mode</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Simulated mode runs deterministic local logic. Live mode requires <code className="px-1 bg-stone-100 rounded">INTAPP_API_TOKEN</code> + a base URL.
            </p>
          </div>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold ${
            settings.mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>{settings.mode}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => set("mode", "simulated")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium border ${
              settings.mode === "simulated" ? "bg-primary text-white border-primary" : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
            }`}>Simulated (pilot)</button>
          <button onClick={() => set("mode", "live")} disabled={!settings.hasApiToken}
            title={!settings.hasApiToken ? "Set INTAPP_API_TOKEN secret first" : ""}
            className={`px-3 py-1.5 text-xs rounded-md font-medium border disabled:opacity-50 ${
              settings.mode === "live" ? "bg-primary text-white border-primary" : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
            }`}>Live API</button>
          {!settings.hasApiToken && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 basis-full sm:basis-auto">
              <Lock className="w-3 h-3 flex-shrink-0" /> Add INTAPP_API_TOKEN to enable live mode
            </span>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Workflow gating</h3>
        <ToggleRow label="Auto-screen on Draft → Submitted"
          desc="Trigger an Intapp screening every time a deal is submitted for approval."
          checked={!!settings.autoScreenOnSubmit} onChange={(v) => set("autoScreenOnSubmit", v)} />
        <ToggleRow label="Block submission on conflict"
          desc="Hard-stop approval when a high-severity (conflict) hit is detected."
          checked={!!settings.blockSubmitOnConflict} onChange={(v) => set("blockSubmitOnConflict", v)} />
        <ToggleRow label="Allow QRM override"
          desc="QRM persona may unblock a conflict-result deal after providing written justification."
          checked={!!settings.allowQrmOverride} onChange={(v) => set("allowQrmOverride", v)} />
        <ToggleRow label="Re-screen on client change"
          desc="When a client's industry, region, or relationship attributes change, re-screen all open deals attached to that client."
          checked={!!settings.autoScreenOnClientChange} onChange={(v) => set("autoScreenOnClientChange", v)} />
        <ToggleRow label="Nightly batch re-screen"
          desc="Run a nightly background re-screen of every open deal so policy changes propagate without manual action."
          checked={!!settings.nightlyRescreen} onChange={(v) => set("nightlyRescreen", v)} />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Live API configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tenant URL</label>
            <input type="text" defaultValue={settings.liveTenantUrl || settings.apiBaseUrl || ""}
              onBlur={(e) => set("liveTenantUrl", e.target.value)}
              placeholder="https://your-tenant.intapp.com/risk/v2"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Client ID</label>
            <input type="text" defaultValue={settings.liveClientId || ""}
              onBlur={(e) => set("liveClientId", e.target.value)}
              placeholder="armanino-prod"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">API key (write-only)</label>
            <input type="password" defaultValue=""
              onBlur={(e) => { if (e.target.value) set("liveApiKeySecret", e.target.value); }}
              placeholder={settings.liveApiKeyMasked ? "•••• stored ••••" : "Paste to set; never echoed back"}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Policy version</label>
            <input type="text" defaultValue={settings.policyVersion || ""}
              onBlur={(e) => set("policyVersion", e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Pilot end date</label>
            <input type="date" defaultValue={settings.pilotEndsOn || ""}
              onBlur={(e) => set("pilotEndsOn", e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">API token</label>
            <div className="mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm bg-stone-50 text-muted-foreground inline-flex items-center gap-2">
              {settings.hasApiToken ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Stored as secret</>
                : <><Lock className="w-3.5 h-3.5" /> Not configured</>}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">QRM conflict notifications</h3>
          <p className="text-xs text-muted-foreground mt-1">
            When a screening returns <span className="font-semibold text-red-700">CONFLICT</span>, push the deal link, hits and recommended actions to QRM so reviewers don't have to poll the cockpit.
          </p>
        </div>
        <ToggleRow label="Notify QRM on conflict"
          desc="Master switch. When off, no email or Teams message is sent — only the in-app cockpit and audit log are updated."
          checked={!!settings.qrmNotifyOnConflict} onChange={(v) => set("qrmNotifyOnConflict", v)} />
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Channel</label>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {["email", "teams", "both", "none"].map((c) => (
              <button key={c} onClick={() => set("qrmNotifyChannel", c)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium border capitalize ${
                  (settings.qrmNotifyChannel || "email") === c
                    ? "bg-primary text-white border-primary"
                    : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
                }`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Recipients (comma-separated emails)</label>
            <input type="text" defaultValue={settings.qrmNotifyRecipients || ""}
              onBlur={(e) => set("qrmNotifyRecipients", e.target.value)}
              placeholder="qrm-leads@armanino.com, partner-on-call@armanino.com"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            <div className="text-[11px] text-muted-foreground mt-1">
              Pilot mode: emails are simulated-send (recorded in the audit log; no SMTP wired). Live cutover swaps in your firm's mail relay.
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Microsoft Teams incoming-webhook URL {settings.qrmTeamsWebhookMasked && <span className="text-emerald-700 normal-case">· stored ({settings.qrmTeamsWebhookUrl})</span>}
            </label>
            <input type="password" defaultValue=""
              onBlur={(e) => { const v = e.target.value.trim(); if (v) set("qrmTeamsWebhookUrl", v); }}
              placeholder={settings.qrmTeamsWebhookMasked ? "•••• stored ••••  (paste a new URL to replace)" : "https://<tenant>.webhook.office.com/webhookb2/…"}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary font-mono" />
            <div className="text-[11px] text-muted-foreground mt-1">
              Stored as a secret (host + last 6 chars echoed back, never the full URL). Only Microsoft webhook hosts (<code>*.webhook.office.com</code>, <code>outlook.office.com</code>, <code>*.logic.azure.com</code>) are accepted; anything else is rejected to prevent SSRF.
            </div>
            <button
              onClick={() => { if (confirm("Clear the stored Teams webhook URL?")) set("qrmTeamsWebhookUrl", ""); }}
              className="mt-1 text-[11px] text-red-700 hover:underline">
              Clear stored webhook
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">App base URL (used in deal links)</label>
            <input type="text" defaultValue={settings.appBaseUrl || ""}
              onBlur={(e) => set("appBaseUrl", e.target.value)}
              placeholder="https://dealpad.armanino.com"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>
      </div>

      <div className="card p-5 bg-stone-50">
        <h3 className="text-sm font-semibold text-foreground mb-2">Cutover plan: simulated → live</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>Provision Intapp Risk REST credentials and store as <code className="px-1 bg-white rounded border border-stone-200">INTAPP_API_TOKEN</code>.</li>
          <li>Set the Base URL above to the tenant endpoint.</li>
          <li>Replace the <code className="px-1 bg-white rounded border border-stone-200">LiveIntappProvider.screen()</code> body with an HTTP POST to <code className="px-1 bg-white rounded border border-stone-200">/risk/screen</code>; map the response 1:1 to the existing <code className="px-1 bg-white rounded border border-stone-200">IntappScreeningResponse</code> shape.</li>
          <li>Flip mode to <strong>Live API</strong> here. Existing screenings, hits, mitigations, events and routes work unchanged — the <code className="px-1 bg-white rounded border border-stone-200">source</code> column on each new record will read <code className="px-1 bg-white rounded border border-stone-200">live</code> for cutover identification.</li>
        </ol>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between">
      <div className="pr-6">
        <div className="text-sm text-foreground font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-primary" : "bg-stone-300"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone?: "emerald" | "amber" | "red" | "violet" }) {
  const toneClass = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "violet" ? "text-violet-700" : "text-foreground";
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function TierCard({ tier, label, count }: { tier: "low" | "medium" | "high"; label: string; count: number }) {
  const colors = {
    low: "bg-emerald-50 border-emerald-200 text-emerald-800",
    medium: "bg-amber-50 border-amber-200 text-amber-800",
    high: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`p-4 rounded-lg border ${colors[tier]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-1 tabular-nums">{count}</div>
    </div>
  );
}

export function RiskBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-red-100 text-red-700",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${colors[tier] || "bg-stone-100"}`}>{tier}</span>;
}

export function ResultBadge({ result }: { result: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    clear: { label: "Cleared", cls: "bg-emerald-100 text-emerald-700" },
    review: { label: "Review", cls: "bg-amber-100 text-amber-700" },
    conflict: { label: "Conflict", cls: "bg-red-100 text-red-700" },
    mitigated: { label: "Mitigated", cls: "bg-sky-100 text-sky-700" },
    override_approved: { label: "Override", cls: "bg-violet-100 text-violet-700" },
    pending: { label: "Pending", cls: "bg-stone-100 text-stone-700" },
  };
  const c = cfg[result] || cfg.pending;
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${c.cls}`}>{c.label}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
      source === "live" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-700"
    }`}>
      {source === "live" ? <Globe className="w-2.5 h-2.5" /> : <Cog className="w-2.5 h-2.5" />}
      {source}
    </span>
  );
}

function EventRow({ e }: { e: any }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md bg-stone-50 text-xs">
      <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{e.eventType.replace(/_/g, " ")}</span>
          <SourceBadge source={e.source || "simulated"} />
          {e.actorName && <span className="text-[10px] text-muted-foreground">by {e.actorName}</span>}
        </div>
        <div className="text-muted-foreground mt-0.5">{e.message}</div>
      </div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</div>
    </div>
  );
}
