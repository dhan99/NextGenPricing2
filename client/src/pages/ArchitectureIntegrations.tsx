import { useState } from "react";
import {
  Building2, Briefcase, KeyRound, ArrowLeftRight, Code2, Map as MapIcon,
  Download, FileText, ExternalLink, Workflow, ShieldCheck,
} from "lucide-react";

type ProviderId = "dynamics" | "workday";
type SectionId = "overview" | "auth" | "endpoints" | "mapping" | "samples";

interface Endpoint { method: string; path: string; purpose: string; }
interface MapRow { internal: string; production: string; }
interface FieldRow { dealpad: string; system: string; notes: string; }
interface Sample { method: string; path: string; purpose: string; request: string; response: string; }

const D365_READ: Endpoint[] = [
  { method: "GET", path: "/api/dynamics/accounts", purpose: "List all client accounts" },
  { method: "GET", path: "/api/dynamics/accounts/:id", purpose: "Single account detail" },
  { method: "GET", path: "/api/dynamics/opportunities", purpose: "List opportunities" },
  { method: "GET", path: "/api/dynamics/opportunities/eligible", purpose: "Develop/Propose opps not yet linked" },
  { method: "GET", path: "/api/dynamics/scope-templates", purpose: "Service-line scope templates" },
  { method: "GET", path: "/api/dynamics/pipeline", purpose: "Pipeline rollup (stage / owner / forecast)" },
  { method: "GET", path: "/api/dynamics/sync-log", purpose: "Last 100 sync events" },
  { method: "GET", path: "/api/dynamics/settings", purpose: "Sync toggles" },
  { method: "GET", path: "/api/dynamics/owners", purpose: "Sales owners + quotas" },
];

const D365_WRITE: Endpoint[] = [
  { method: "POST",  path: "/api/dynamics/opportunities", purpose: "Create new opportunity" },
  { method: "PATCH", path: "/api/dynamics/opportunities/:id", purpose: "Edit stage / value / owner" },
  { method: "POST",  path: "/api/dynamics/opportunities/:id/import", purpose: "Pull opp into DealPad as draft deal" },
  { method: "POST",  path: "/api/dynamics/opportunities/:id/unlink", purpose: "Unlink opp from DealPad deal" },
  { method: "POST",  path: "/api/dynamics/deals/:id/push", purpose: "Manual push: deal → D365" },
  { method: "POST",  path: "/api/dynamics/sync", purpose: "Bulk on-demand pull / push" },
  { method: "POST",  path: "/api/dynamics/nightly-batch", purpose: "Scheduled full sync" },
  { method: "PATCH", path: "/api/dynamics/settings", purpose: "Update sync toggles" },
  { method: "PATCH", path: "/api/dynamics/accounts/:id", purpose: "Edit account record" },
];

const D365_MAP: MapRow[] = [
  { internal: "GET /api/dynamics/accounts", production: "GET /accounts?$select=name,industrycode,revenue,numberofemployees" },
  { internal: "GET /api/dynamics/accounts/:id", production: "GET /accounts({accountid})" },
  { internal: "GET /api/dynamics/opportunities", production: "GET /opportunities?$expand=parentaccountid($select=name)" },
  { internal: "GET /api/dynamics/opportunities/eligible", production: "GET /opportunities?$filter=statecode eq 0 and stepname in ('Develop','Propose')" },
  { internal: "GET /api/dynamics/pipeline", production: "GET /opportunities?$select=estimatedvalue,closeprobability,stepname" },
  { internal: "GET /api/dynamics/owners", production: "GET /systemusers?$filter=isdisabled eq false" },
  { internal: "POST /api/dynamics/opportunities", production: "POST /opportunities" },
  { internal: "PATCH /api/dynamics/opportunities/:id", production: "PATCH /opportunities({opportunityid})" },
  { internal: "POST /api/dynamics/opportunities/:id/import", production: "GET /opportunities({opportunityid}) + DealPad insert" },
  { internal: "POST /api/dynamics/deals/:id/push", production: "PATCH /opportunities({opportunityid})" },
  { internal: "POST /api/dynamics/sync", production: "Multiple GET / PATCH on /accounts and /opportunities" },
  { internal: "POST /api/dynamics/nightly-batch", production: "Multiple GET / PATCH (use $batch)" },
  { internal: "PATCH /api/dynamics/accounts/:id", production: "PATCH /accounts({accountid})" },
];

const D365_FIELDS: FieldRow[] = [
  { dealpad: "deals.title", system: "name", notes: "1:1" },
  { dealpad: "deals.totalFee", system: "estimatedvalue / actualvalue", notes: "Won → also actualclosedate" },
  { dealpad: "deals.endDate", system: "estimatedclosedate", notes: "" },
  { dealpad: "derived stage", system: "stepname", notes: "won/lost/approved/submitted/in_review → Won/Lost/Close/Propose" },
  { dealpad: "derived probability", system: "closeprobability", notes: "Qualify 20 / Develop 40 / Propose 65 / Close 85 / Won 100 / Lost 0" },
  { dealpad: "derived forecastCategory", system: "forecastcategory", notes: "Won/Lost→Closed, ≥80→Commit, ≥50→Best Case, else Pipeline" },
  { dealpad: "deals.pdlName", system: "ownerid (systemusers)", notes: "Resolved via dynamics_owners" },
  { dealpad: "clients.name", system: "parentaccountid (accounts)", notes: "" },
];

const D365_SAMPLES: Sample[] = [
  {
    method: "POST", path: "/api/dynamics/opportunities", purpose: "Create new opportunity",
    request: `POST /api/dynamics/opportunities
Content-Type: application/json

{
  "accountId": 42,
  "name": "Crestwood - Annual Audit",
  "estimatedValue": 412000,
  "stage": "Qualify",
  "estimatedCloseDate": "2026-11-01",
  "ownerName": "Priya Anand"
}`,
    response: `201 Created
{
  "id": 137,
  "opportunityNumber": "OPP-100204",
  "name": "Crestwood - Annual Audit",
  "estimatedValue": 412000,
  "stage": "Qualify",
  "probability": 20,
  "forecastCategory": "Pipeline",
  "syncStatus": "queued"
}`,
  },
  {
    method: "PATCH", path: "/api/dynamics/opportunities/:id", purpose: "Edit stage / value / owner",
    request: `PATCH /api/dynamics/opportunities/15
{ "stage": "Propose", "estimatedValue": 560000 }`,
    response: `{
  "id": 15,
  "stage": "Propose",
  "probability": 65,
  "forecastCategory": "Best Case",
  "estimatedValue": 560000
}`,
  },
  {
    method: "POST", path: "/api/dynamics/deals/:id/push", purpose: "Manual push: deal → D365 (Dataverse)",
    request: `POST /api/dynamics/deals/204/push
{ "userName": "Marcus Chen" }

# Dataverse equivalent (Web API v9.2):
PATCH /api/data/v9.2/opportunities(1c92...)
{
  "estimatedvalue": 560000,
  "closeprobability": 65,
  "forecastcategory": 2
}`,
    response: `{ "ok": true, "opportunityId": 15 }
# Dataverse: 204 No Content`,
  },
  {
    method: "POST", path: "/api/dynamics/sync", purpose: "Bulk on-demand pull / push",
    request: `POST /api/dynamics/sync
{ "entity": "All", "direction": "bidirectional" }`,
    response: `{
  "success": true,
  "entity": "All",
  "pulled": 2,
  "pushed": 3,
  "durationMs": 1840,
  "timestamp": "2026-04-17T14:05:11Z"
}`,
  },
];

const WD_READ: Endpoint[] = [
  { method: "GET", path: "/api/workday/settings", purpose: "Mode, tenant, tolerances" },
  { method: "GET", path: "/api/workday/cost-centers", purpose: "Budgets + headroom" },
  { method: "GET", path: "/api/workday/workers", purpose: "Worker pool + availability" },
  { method: "GET", path: "/api/workday/rate-card", purpose: "Standard cost rates by role" },
  { method: "GET", path: "/api/workday/validations", purpose: "Recent validation runs" },
  { method: "GET", path: "/api/workday/validations/:id", purpose: "Validation detail + findings" },
  { method: "GET", path: "/api/workday/deals/:dealId/latest", purpose: "Latest validation for a deal" },
  { method: "GET", path: "/api/workday/events", purpose: "Last 150 audit events" },
  { method: "GET", path: "/api/workday/dashboard", purpose: "Cross-deal validation rollup" },
];

const WD_WRITE: Endpoint[] = [
  { method: "PATCH",  path: "/api/workday/settings", purpose: "Update mode / tolerances / credentials" },
  { method: "POST",   path: "/api/workday/cost-centers", purpose: "Create cost center" },
  { method: "PATCH",  path: "/api/workday/cost-centers/:id", purpose: "Edit cost center" },
  { method: "DELETE", path: "/api/workday/cost-centers/:id", purpose: "Delete cost center" },
  { method: "POST",   path: "/api/workday/workers", purpose: "Create worker" },
  { method: "PATCH",  path: "/api/workday/workers/:id", purpose: "Edit worker" },
  { method: "DELETE", path: "/api/workday/workers/:id", purpose: "Remove worker" },
  { method: "PATCH",  path: "/api/workday/rate-card/:id", purpose: "Update standard cost rate" },
  { method: "POST",   path: "/api/workday/deals/:dealId/validate", purpose: "Run validation for a deal" },
  { method: "POST",   path: "/api/workday/deals/:dealId/link", purpose: "Link / unlink deal ↔ cost center" },
  { method: "POST",   path: "/api/workday/validations/:id/override", purpose: "Override blocking validation" },
];

const WD_MAP: MapRow[] = [
  { internal: "GET /api/workday/cost-centers", production: "GET /financialManagement/v1/{tenant}/costCenters" },
  { internal: "GET /api/workday/workers", production: "GET /staffing/v6/{tenant}/workers" },
  { internal: "GET /api/workday/rate-card", production: "GET /compensation/v1/{tenant}/compensationPlans (or RaaS report)" },
  { internal: "POST /api/workday/cost-centers", production: "POST /financialManagement/v1/{tenant}/costCenters" },
  { internal: "PATCH /api/workday/cost-centers/:id", production: "PATCH /financialManagement/v1/{tenant}/costCenters/{id}" },
  { internal: "DELETE /api/workday/cost-centers/:id", production: "DELETE /financialManagement/v1/{tenant}/costCenters/{id}" },
  { internal: "POST /api/workday/workers", production: "SOAP Hire_Employee (Staffing v40+)" },
  { internal: "PATCH /api/workday/workers/:id", production: "SOAP Edit_Position / Change_Job" },
  { internal: "DELETE /api/workday/workers/:id", production: "SOAP Terminate_Employee" },
  { internal: "PATCH /api/workday/rate-card/:id", production: "SOAP Put_Compensation_Plan" },
  { internal: "POST /api/workday/deals/:dealId/validate", production: "Composite: GET costCenters + GET workers + DealPad rules engine" },
  { internal: "POST /api/workday/deals/:dealId/link", production: "DealPad-internal mapping" },
  { internal: "POST /api/workday/validations/:id/override", production: "DealPad-internal audit (override fields)" },
];

const WD_FIELDS: FieldRow[] = [
  { dealpad: "pricing_lines.roleId → roles.name", system: "compensationPlans.role", notes: "Drives rate-card lookup" },
  { dealpad: "pricing_lines.costRate", system: "compensationPlans.standardHourlyCostRate", notes: "Variance > tolerance → rate_variance" },
  { dealpad: "Σ pricing_lines.hours by role", system: "Σ workers.availableHours by role", notes: "Required vs available → staffing_shortfall" },
  { dealpad: "deals.totalCost", system: "costCenters.committed (delta)", notes: "Pre-commit headroom → over_budget" },
  { dealpad: "deals.workdayCostCenterId", system: "costCenters.id", notes: "One cost center per deal" },
  { dealpad: "deals.businessUnit", system: "costCenters.businessUnit", notes: "Default mapping when no explicit link" },
];

const WD_SAMPLES: Sample[] = [
  {
    method: "POST", path: "/api/workday/deals/:dealId/validate", purpose: "Run validation for a deal (composite read)",
    request: `POST /api/workday/deals/87/validate
{ "userName": "Sarah Chen" }

# Production composite (read-only):
#   GET /financialManagement/v1/{tenant}/costCenters/{id}
#   GET /staffing/v6/{tenant}/workers?role=...
#   GET /compensation/v1/{tenant}/compensationPlans`,
    response: `{
  "ok": false,
  "status": "staffing_shortfall",
  "validationId": 412,
  "summary": "Staffing shortfall: 240h across roles.",
  "findings": [
    { "findingType": "budget", "severity": "info" },
    { "findingType": "staffing", "severity": "blocker",
      "roleName": "Senior Consultant",
      "requiredHours": 640, "availableHours": 400, "shortfallHours": 240 }
  ]
}`,
  },
  {
    method: "GET", path: "/api/workday/cost-centers", purpose: "List cost centers + headroom",
    request: `GET /api/workday/cost-centers

# Production equivalent:
GET /ccx/api/financialManagement/v1/armanino/costCenters
Authorization: Bearer eyJraWQiOi...`,
    response: `[
  {
    "id": 3, "code": "CC-CONS-300",
    "name": "Technology Consulting",
    "fiscalYear": "FY2026",
    "totalBudget": "6200000",
    "committed": "5950000",
    "source": "simulated"
  }
]`,
  },
  {
    method: "PATCH", path: "/api/workday/rate-card/:id", purpose: "Update standard cost rate (SOAP-backed)",
    request: `PATCH /api/workday/rate-card/3
{ "standardCostRate": 210 }

# Production: SOAP Put_Compensation_Plan
<wd:Plan_Reference Descriptor="Senior Manager"/>
<wd:Plan_Data>
  <wd:Standard_Hourly_Cost_Rate>210</wd:...>
  <wd:Effective_Date>2026-04-17</wd:...>
</wd:Plan_Data>`,
    response: `{
  "id": 3,
  "roleName": "Senior Manager",
  "standardCostRate": "210",
  "effectiveDate": "2025-07-01"
}`,
  },
  {
    method: "POST", path: "/api/workday/validations/:id/override", purpose: "Override a blocking validation",
    request: `POST /api/workday/validations/412/override
{
  "justification": "Senior Cons backfill via partner firm",
  "userName": "Lisa Park",
  "role": "fin"
}`,
    response: `{
  "id": 412,
  "status": "staffing_shortfall",
  "overriddenBy": "Lisa Park",
  "overrideJustification": "Senior Cons backfill via partner firm",
  "overriddenAt": "2026-04-17T14:18Z"
}`,
  },
];

const PROVIDERS = {
  dynamics: {
    label: "Microsoft Dynamics 365",
    short: "Dynamics 365",
    role: "CRM · System of record for accounts and opportunity pipeline",
    icon: Building2,
    accent: "from-blue-50 to-indigo-50",
    accentText: "text-indigo-700",
    accentBorder: "border-indigo-200",
    overview: {
      direction: "Bi-directional",
      api: "Dataverse Web API v9.2",
      auth: "OAuth 2.0 client credentials (Azure AD)",
      gates: "Outbound auto-push on stage / fee / probability / forecast change.",
      audit: "dynamics_sync_log (every call · direction · entity · trigger · actor · status)",
      triggers: [
        "Outbound auto-push when deal status, stage, fee, hours, cost, or margin changes (per-trigger toggles in dynamics_settings).",
        "Inbound nightly batch (POST /api/dynamics/nightly-batch) and on-demand pull (POST /api/dynamics/sync).",
        "Manual push: POST /api/dynamics/deals/:id/push.",
      ],
    },
    auth: {
      tokenEndpoint: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scope: "https://{org}.api.crm.dynamics.com/.default",
      header: "Authorization: Bearer <token>",
      secrets: ["D365_TENANT_ID", "D365_CLIENT_ID", "D365_CLIENT_SECRET", "D365_ORG_URL"],
      tokenSample: `POST /{tenantId}/oauth2/v2.0/token  HTTP/1.1
Host: login.microsoftonline.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=$D365_CLIENT_ID
&client_secret=$D365_CLIENT_SECRET
&scope=https://armanino.api.crm.dynamics.com/.default`,
    },
    read: D365_READ,
    write: D365_WRITE,
    map: D365_MAP,
    fields: D365_FIELDS,
    samples: D365_SAMPLES,
  },
  workday: {
    label: "Workday",
    short: "Workday",
    role: "HCM · Source of truth for budgets, worker availability, and standard cost rates",
    icon: Briefcase,
    accent: "from-amber-50 to-orange-50",
    accentText: "text-amber-700",
    accentBorder: "border-amber-200",
    overview: {
      direction: "Validation gate (read live, write only on rate-card / cost-center / worker edits)",
      api: "REST (Financial Management v1, Staffing v6, Compensation v1) + SOAP (legacy)",
      auth: "OAuth 2.0 (REST) or ISU + Basic auth (SOAP)",
      gates: "Submission gate — over_budget or staffing_shortfall blocks submit unless overridden.",
      audit: "workday_events + workday_validations + workday_validation_findings",
      triggers: [
        "Auto-validate on deal save (workday_settings.autoValidateOnSave).",
        "Submission gate: PATCH /api/deals/:id with status=submitted runs validation; blockers require override.",
        "Override: POST /api/workday/validations/:id/override — Finance / Service Line Lead only, justification required.",
      ],
    },
    auth: {
      tokenEndpoint: "https://{host}.workday.com/ccx/oauth2/{tenant}/token",
      scope: "staffing financialManagement compensation",
      header: "Authorization: Bearer <token>  (REST)  ·  Basic base64(ISU@tenant:password)  (SOAP)",
      secrets: ["workday_settings.tenantUrl", "workday_settings.isuUsername", "workday_settings.apiClientId", "workday_settings.apiClientSecret"],
      tokenSample: `POST /ccx/oauth2/armanino/token  HTTP/1.1
Host: wd5.workday.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=client_credentials
&scope=staffing financialManagement compensation`,
    },
    read: WD_READ,
    write: WD_WRITE,
    map: WD_MAP,
    fields: WD_FIELDS,
    samples: WD_SAMPLES,
  },
} as const;

const SECTIONS: { id: SectionId; label: string; icon: typeof Workflow }[] = [
  { id: "overview",  label: "Overview",       icon: Workflow },
  { id: "auth",      label: "Auth & Security", icon: KeyRound },
  { id: "endpoints", label: "Endpoints",      icon: ArrowLeftRight },
  { id: "mapping",   label: "Field Mapping",  icon: MapIcon },
  { id: "samples",   label: "Sample Payloads", icon: Code2 },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-50 text-emerald-700 border-emerald-200",
    POST: "bg-blue-50 text-blue-700 border-blue-200",
    PATCH: "bg-amber-50 text-amber-700 border-amber-200",
    DELETE: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center justify-center min-w-[58px] px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border ${colors[method] || "bg-stone-50 text-stone-700 border-stone-200"}`}>
      {method}
    </span>
  );
}

function EndpointTable({ rows }: { rows: Endpoint[] }) {
  return (
    <div className="overflow-hidden border border-stone-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5 w-[80px]">Method</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Path</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-stone-50/40" : ""}>
              <td className="px-4 py-2.5 align-top"><MethodBadge method={r.method} /></td>
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-foreground align-top">{r.path}</td>
              <td className="px-4 py-2.5 text-muted-foreground align-top">{r.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MappingTable({ rows }: { rows: MapRow[] }) {
  return (
    <div className="overflow-hidden border border-stone-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">DealPad endpoint</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Production call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-stone-50/40" : ""}>
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-foreground align-top">{r.internal}</td>
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-muted-foreground align-top">{r.production}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldTable({ rows, systemLabel }: { rows: FieldRow[]; systemLabel: string }) {
  return (
    <div className="overflow-hidden border border-stone-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">DealPad</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">{systemLabel}</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-stone-50/40" : ""}>
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-foreground align-top">{r.dealpad}</td>
              <td className="px-4 py-2.5 font-mono text-[12.5px] text-foreground align-top">{r.system}</td>
              <td className="px-4 py-2.5 text-muted-foreground align-top">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-stone-900 text-stone-100 text-[12px] leading-relaxed font-mono rounded-lg p-4 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function SampleCard({ sample }: { sample: Sample }) {
  return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 bg-stone-50">
        <MethodBadge method={sample.method} />
        <span className="font-mono text-sm text-foreground font-semibold">{sample.path}</span>
        <span className="text-xs text-muted-foreground ml-auto">{sample.purpose}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-stone-200">
        <div className="p-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Request</div>
          <CodeBlock>{sample.request}</CodeBlock>
        </div>
        <div className="p-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Response</div>
          <CodeBlock>{sample.response}</CodeBlock>
        </div>
      </div>
    </div>
  );
}

function ProviderOverview({ p }: { p: typeof PROVIDERS[ProviderId] }) {
  const Icon = p.icon;
  return (
    <div className="space-y-6">
      <div className={`bg-gradient-to-br ${p.accent} border ${p.accentBorder} rounded-2xl p-6`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <Icon className={`w-6 h-6 ${p.accentText}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground">{p.label}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{p.role}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {[
            ["Direction", p.overview.direction],
            ["Production API", p.overview.api],
            ["Authentication", p.overview.auth],
            ["Submission gate", p.overview.gates],
          ].map(([k, v]) => (
            <div key={k} className="bg-white/70 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{k}</div>
              <div className="text-sm text-foreground">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-foreground">Trigger points</h4>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {p.overview.triggers.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary flex-shrink-0" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-foreground">Audit trail</h4>
        </div>
        <p className="text-sm text-muted-foreground font-mono">{p.overview.audit}</p>
      </div>
    </div>
  );
}

function ProviderAuth({ p }: { p: typeof PROVIDERS[ProviderId] }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        {[
          ["Token endpoint", p.auth.tokenEndpoint],
          ["Scope", p.auth.scope],
          ["Auth header", p.auth.header],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{k}</div>
            <div className="text-sm text-foreground font-mono break-all">{v}</div>
          </div>
        ))}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Secrets</div>
          <div className="flex flex-wrap gap-2">
            {p.auth.secrets.map(s => (
              <span key={s} className="text-xs px-2.5 py-1 bg-stone-100 rounded-md font-mono text-foreground">{s}</span>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Token request</div>
        <CodeBlock>{p.auth.tokenSample}</CodeBlock>
      </div>
    </div>
  );
}

function ProviderEndpoints({ p }: { p: typeof PROVIDERS[ProviderId] }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Read endpoints ({p.read.length})</h4>
        <EndpointTable rows={p.read} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Write endpoints ({p.write.length})</h4>
        <EndpointTable rows={p.write} />
      </div>
    </div>
  );
}

function ProviderMapping({ p }: { p: typeof PROVIDERS[ProviderId] }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Internal route → production call</h4>
        <MappingTable rows={p.map} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">DealPad ↔ {p.short} field mapping</h4>
        <FieldTable rows={p.fields} systemLabel={p.short} />
      </div>
    </div>
  );
}

function ProviderSamples({ p }: { p: typeof PROVIDERS[ProviderId] }) {
  return (
    <div className="space-y-4">
      {p.samples.map((s, i) => <SampleCard key={i} sample={s} />)}
      <p className="text-xs text-muted-foreground">
        Showing {p.samples.length} representative pairs. Full per-endpoint samples for all {p.read.length + p.write.length} routes are in the deck appendix and the markdown source.
      </p>
    </div>
  );
}

export function ArchitectureIntegrations() {
  const [provider, setProvider] = useState<ProviderId>("dynamics");
  const [section, setSection] = useState<SectionId>("overview");
  const p = PROVIDERS[provider];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">External Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Microsoft Dynamics 365 (CRM) and Workday (HCM / Financial Management) — endpoints, auth, mapping, and sample payloads.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/integrations-doc/download-pptx"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
            data-testid="link-download-integrations-pptx"
          >
            <Download className="w-4 h-4" />
            Download Deck (.pptx)
          </a>
          <a
            href="/integrations-doc/download-md"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-foreground text-sm font-medium hover:bg-stone-50 transition-all"
            data-testid="link-download-integrations-md"
          >
            <FileText className="w-4 h-4" />
            Markdown Source
          </a>
          <a
            href="https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-foreground text-sm font-medium hover:bg-stone-50 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Dataverse API
          </a>
        </div>
      </div>

      {/* Provider switch */}
      <div className="inline-flex bg-stone-100 rounded-xl p-1">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
          const Icon = PROVIDERS[id].icon;
          const active = provider === id;
          return (
            <button
              key={id}
              onClick={() => setProvider(id)}
              data-testid={`tab-provider-${id}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {PROVIDERS[id].label}
            </button>
          );
        })}
      </div>

      {/* Section pills */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-0">
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              data-testid={`tab-section-${s.id}`}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 transition-all -mb-px ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-stone-300"
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div>
        {section === "overview"  && <ProviderOverview  p={p} />}
        {section === "auth"      && <ProviderAuth      p={p} />}
        {section === "endpoints" && <ProviderEndpoints p={p} />}
        {section === "mapping"   && <ProviderMapping   p={p} />}
        {section === "samples"   && <ProviderSamples   p={p} />}
      </div>
    </div>
  );
}
