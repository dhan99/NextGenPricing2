# DealPad Integrations — API Overview

**Audience:** stakeholders, partners, integration architects
**Scope:** Microsoft Dynamics 365 (CRM) and Workday (HCM / Financial Management)
**Mode today:** persistent simulation (provider-pattern). Cutover to live by configuration.

---

## 1. Executive summary

DealPad is the deal lifecycle platform for Armanino's NextGen sales motion. Two upstream
systems own the data DealPad depends on:

- **Microsoft Dynamics 365** — system of record for client accounts and the opportunity pipeline.
  DealPad pulls accounts/opportunities and pushes back fee, stage, probability, and forecast
  category whenever a deal moves.
- **Workday** — source of truth for cost-center budgets, worker availability, and standard
  cost rates. DealPad calls Workday on every save and gates submission on Workday's verdict.

Today both providers are implemented as **persistent simulations** in DealPad's own Postgres
so the product can be demoed end-to-end without sandbox tenants. The internal HTTP surface is
already production-shaped, so the cutover work is limited to swapping the provider implementation
behind each route — no client/server contract changes are required.

---

## 2. Architecture & data flow

```
┌────────────┐   pull (nightly + on-demand)    ┌──────────────────────┐
│            │ ◄──────────────────────────────│ Microsoft Dynamics 365│
│            │                                 │  (Dataverse Web API)  │
│            │   push on stage/fee change      │                       │
│  DealPad   │ ──────────────────────────────► │  - accounts           │
│  (Node +   │                                 │  - opportunities      │
│   Postgres)│                                 └──────────────────────┘
│            │
│            │   validate on save / submit     ┌──────────────────────┐
│            │ ──────────────────────────────► │ Workday               │
│            │                                 │  (REST + SOAP)        │
│            │ ◄──────────────────────────────│  - cost centers       │
│            │   findings + verdict            │  - workers            │
└────────────┘                                 │  - rate card          │
                                                └──────────────────────┘
```

**Trigger points**

- **Dynamics 365** — outbound auto-push when a deal's `status`, `stage`, `currentStep`,
  `totalFee`, `totalCost`, `totalHours`, or `marginPercent` changes (gated by per-trigger
  toggles in `dynamics_settings`). Inbound pull runs nightly and on demand.
- **Workday** — auto-validate on every deal save (`autoValidateOnSave`); auto-check at
  submission (`autoCheckOnSubmit`) which can **block** the submit unless Finance / Service
  Line Lead overrides with justification.

**Provider pattern**

Both integrations sit behind a `Provider` interface. The simulated provider reads/writes
DealPad's own tables (`dynamics_accounts`, `dynamics_opportunities`, `workday_cost_centers`,
`workday_workers`, `workday_rate_cards`, `workday_validations`, …). Switching `mode = "live"`
in `workday_settings` (or wiring the equivalent in Dynamics) routes the same internal route
handlers to a Live provider that calls the production endpoints below.

---

## 3. Authentication & security

### Dynamics 365

- **Protocol:** OAuth 2.0 client-credentials against Azure AD.
- **Token endpoint:** `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- **Scope:** `https://{org}.api.crm.dynamics.com/.default`
- **Header on every Web API call:** `Authorization: Bearer <token>`
- **Secrets** (stored as Replit secrets, never in code): `D365_TENANT_ID`,
  `D365_CLIENT_ID`, `D365_CLIENT_SECRET`, `D365_ORG_URL`.
- **Audit:** every inbound/outbound call is appended to `dynamics_sync_log` with
  direction, entity, fields touched, actor, trigger, and outcome.

### Workday

Two equivalent authentication options (Workday supports both):

- **OAuth 2.0** (preferred for REST): client-credentials with an integration system user (ISU).
  Token endpoint: `https://{host}.workday.com/ccx/oauth2/{tenant}/token`.
- **Basic auth + ISU** (required for legacy SOAP web services): `Authorization: Basic
  base64(ISU@tenant:password)`.
- **Secrets:** `WORKDAY_TENANT_URL`, `WORKDAY_ISU_USERNAME`, `WORKDAY_API_CLIENT_ID`,
  `WORKDAY_API_CLIENT_SECRET` (already modeled in `workday_settings`).
- **Audit:** every event lands in `workday_events`; every validation in
  `workday_validations` + `workday_validation_findings` with override metadata.

Transport security: TLS 1.2+ for all calls; Workday tenants enforce IP allow-listing
(must add the production egress IPs at cutover).

---

## 4. Dynamics 365 — endpoint inventory

Internal routes are defined in `server/dynamics.ts`. The "Production mapping" column is the
Dataverse Web API v9.2 call the live provider would make against
`https://{org}.api.crm.dynamics.com/api/data/v9.2/`.

### Read endpoints

| DealPad endpoint | Purpose | Production mapping |
|---|---|---|
| `GET /api/dynamics/accounts` | List all client accounts | `GET /accounts?$select=name,industrycode,revenue,numberofemployees,_ownerid_value` |
| `GET /api/dynamics/accounts/:id` | Single account detail | `GET /accounts({accountid})` |
| `GET /api/dynamics/opportunities` | List opportunities | `GET /opportunities?$expand=parentaccountid($select=name)` |
| `GET /api/dynamics/opportunities/eligible` | Develop/Propose opps not yet linked to a DealPad deal | `GET /opportunities?$filter=statecode eq 0 and (stepname eq 'Develop' or stepname eq 'Propose')` |
| `GET /api/dynamics/scope-templates` | Service-line scope templates used to seed deals | (DealPad-internal — no D365 equivalent) |
| `GET /api/dynamics/pipeline` | Pipeline rollup (by stage, by owner, forecast) | `GET /opportunities?$filter=statecode eq 0&$select=estimatedvalue,closeprobability,stepname,_ownerid_value` |
| `GET /api/dynamics/sync-log` | Last 100 sync events | (DealPad-internal audit) |
| `GET /api/dynamics/settings` | Sync toggles | (DealPad-internal config) |
| `GET /api/dynamics/owners` | Sales owners + quotas | `GET /systemusers?$filter=isdisabled eq false` |

### Write endpoints

| DealPad endpoint | Purpose | Production mapping |
|---|---|---|
| `POST /api/dynamics/opportunities` | Create new D365 opportunity | `POST /opportunities` |
| `PATCH /api/dynamics/opportunities/:id` | Edit stage / value / owner | `PATCH /opportunities({opportunityid})` |
| `POST /api/dynamics/opportunities/:id/import` | Pull opp into DealPad as draft deal | `GET /opportunities({opportunityid})` + DealPad-side insert |
| `POST /api/dynamics/opportunities/:id/unlink` | Unlink an opp from its DealPad deal | (DealPad-internal — clears local link) |
| `POST /api/dynamics/deals/:id/push` | Manual push: deal → D365 | `PATCH /opportunities({opportunityid})` |
| `POST /api/dynamics/sync` | Bulk on-demand pull/push | Multiple `GET`/`PATCH` on `/accounts` and `/opportunities` |
| `POST /api/dynamics/nightly-batch` | Scheduled full sync | Multiple `GET`/`PATCH` on `/accounts` and `/opportunities` |
| `PATCH /api/dynamics/settings` | Update sync toggles | (DealPad-internal config) |
| `PATCH /api/dynamics/accounts/:id` | Edit account record | `PATCH /accounts({accountid})` |

### Sample request / response (Dynamics 365)

**Create opportunity** — DealPad call

```http
POST /api/dynamics/opportunities
Content-Type: application/json

{
  "accountId": 42,
  "name": "Crestwood Holdings - 2026 Annual Audit",
  "estimatedValue": 412000,
  "stage": "Qualify",
  "estimatedCloseDate": "2026-11-01",
  "ownerName": "Priya Anand"
}
```

**Production equivalent — Dataverse Web API**

```http
POST https://armanino.api.crm.dynamics.com/api/data/v9.2/opportunities
Authorization: Bearer eyJ0eXAiOi...
OData-Version: 4.0
Content-Type: application/json

{
  "name": "Crestwood Holdings - 2026 Annual Audit",
  "estimatedvalue": 412000,
  "estimatedclosedate": "2026-11-01",
  "stepname": "Qualify",
  "parentaccountid@odata.bind": "/accounts(8b3a...e21)",
  "ownerid@odata.bind": "/systemusers(5d7c...90a)"
}
```

**Sample response**

```json
{
  "id": 137,
  "dynamicsId": "1c92...8a1",
  "opportunityNumber": "OPP-100204",
  "name": "Crestwood Holdings - 2026 Annual Audit",
  "estimatedValue": 412000,
  "stage": "Qualify",
  "probability": 20,
  "forecastCategory": "Pipeline",
  "syncStatus": "queued",
  "syncDirection": "inbound"
}
```

---

## 5. Workday — endpoint inventory

Internal routes are defined in `server/workday.ts`. Production REST base is
`https://{host}.workday.com/ccx/api/{service}/v{n}/{tenant}/...`; SOAP base is
`https://{host}.workday.com/ccx/service/{tenant}/{service}/v{n}`.

### Read endpoints

| DealPad endpoint | Purpose | Production mapping |
|---|---|---|
| `GET /api/workday/settings` | Mode, tenant, tolerances | (DealPad-internal config) |
| `GET /api/workday/cost-centers` | Budgets + headroom | `GET /financialManagement/v1/{tenant}/costCenters` |
| `GET /api/workday/workers` | Worker pool + availability | `GET /staffing/v6/{tenant}/workers` |
| `GET /api/workday/rate-card` | Standard cost rates by role | `GET /compensation/v1/{tenant}/compensationPlans` (or custom report-as-a-service for rate card) |
| `GET /api/workday/validations` | Recent validation runs | (DealPad-internal audit) |
| `GET /api/workday/validations/:id` | Validation detail + findings | (DealPad-internal audit) |
| `GET /api/workday/deals/:dealId/latest` | Most recent validation for a deal | (DealPad-internal audit) |
| `GET /api/workday/events` | Last 150 audit events | (DealPad-internal audit) |
| `GET /api/workday/dashboard` | Cross-deal validation rollup | (DealPad-internal audit) |

### Write endpoints

| DealPad endpoint | Purpose | Production mapping |
|---|---|---|
| `PATCH /api/workday/settings` | Update mode / tolerances / credentials | (DealPad-internal config) |
| `POST /api/workday/cost-centers` | Create cost center | `POST /financialManagement/v1/{tenant}/costCenters` |
| `PATCH /api/workday/cost-centers/:id` | Edit cost center | `PATCH /financialManagement/v1/{tenant}/costCenters/{id}` |
| `DELETE /api/workday/cost-centers/:id` | Delete cost center | `DELETE /financialManagement/v1/{tenant}/costCenters/{id}` |
| `POST /api/workday/workers` | Create worker | SOAP: `Hire_Employee` (Staffing v40+) |
| `PATCH /api/workday/workers/:id` | Edit worker | SOAP: `Edit_Position` / `Change_Job` |
| `DELETE /api/workday/workers/:id` | Remove worker (sim only) | SOAP: `Terminate_Employee` |
| `PATCH /api/workday/rate-card/:id` | Update standard cost rate | SOAP: `Put_Compensation_Plan` |
| `POST /api/workday/deals/:dealId/validate` | Run validation for a deal | Composite: `GET costCenters` + `GET workers` + DealPad rules |
| `POST /api/workday/deals/:dealId/link` | Link/unlink deal ↔ cost center | (DealPad-internal mapping) |
| `POST /api/workday/validations/:id/override` | Finance/SLL override of a blocking validation | (DealPad-internal audit) |

### Sample request / response (Workday)

**Validate deal** — DealPad call

```http
POST /api/workday/deals/87/validate
Content-Type: application/json

{ "userName": "Sarah Chen" }
```

**Production composite call — REST**

```http
GET https://wd5.workday.com/ccx/api/financialManagement/v1/armanino/costCenters/CC-CONS-300
Authorization: Bearer eyJraWQiOi...
Accept: application/json
```

```json
{
  "id": "8e1b...c2",
  "code": "CC-CONS-300",
  "name": "Technology Consulting",
  "fiscalYear": "FY2026",
  "totalBudget": 6200000,
  "committed": 5950000
}
```

**SOAP fallback (rate-card update via Compensation v40)**

```xml
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
  <env:Body>
    <wd:Put_Compensation_Plan_Request xmlns:wd="urn:com.workday/bsvc">
      <wd:Compensation_Plan_Reference wd:Descriptor="Senior Manager"/>
      <wd:Compensation_Plan_Data>
        <wd:Standard_Hourly_Cost_Rate>200.00</wd:Standard_Hourly_Cost_Rate>
        <wd:Effective_Date>2026-04-17</wd:Effective_Date>
      </wd:Compensation_Plan_Data>
    </wd:Put_Compensation_Plan_Request>
  </env:Body>
</env:Envelope>
```

**Sample response (validation)**

```json
{
  "ok": false,
  "status": "staffing_shortfall",
  "validationId": 412,
  "summary": "Staffing shortfall: 240h across roles.",
  "findings": [
    { "findingType": "budget", "severity": "info",
      "message": "CC-ADV-400 has $1,280,000 headroom (68.8% utilized)." },
    { "findingType": "staffing", "severity": "blocker",
      "roleName": "Senior Consultant", "requiredHours": 640,
      "availableHours": 400, "shortfallHours": 240,
      "message": "Senior Consultant: requires 640h, Workday shows 400h available — short 240h." }
  ]
}
```

---

## 6. Field mappings

### DealPad Deal ↔ D365 Opportunity

| DealPad field | D365 Opportunity field | Notes |
|---|---|---|
| `deals.title` | `name` | 1:1 |
| `deals.totalFee` | `estimatedvalue` (open) / `actualvalue` (won) | Won → also sets `actualclosedate` |
| `deals.endDate` | `estimatedclosedate` | |
| `deals.status` → derived `stage` | `stepname` | `won`→Won, `lost`→Lost, `approved`→Close, `submitted`/`in_review`→Propose, step≥3→Develop, else Qualify |
| derived `probability` | `closeprobability` | Qualify 20 / Develop 40 / Propose 65 / Close 85 / Won 100 / Lost 0 |
| derived `forecastCategory` | `forecastcategory` | Won/Lost→Closed, ≥80→Commit, ≥50→Best Case, else Pipeline |
| `deals.pdlName` | `ownerid` (lookup to `systemusers`) | Resolved via `dynamics_owners` |
| `clients.name` | `parentaccountid` (lookup to `accounts`) | |

### DealPad pricing line ↔ Workday

| DealPad field | Workday field | Notes |
|---|---|---|
| `pricing_lines.roleId` → `roles.name` | `compensationPlans.role` | Drives rate-card lookup |
| `pricing_lines.costRate` | `compensationPlans.standardHourlyCostRate` | Variance > tolerance flags `rate_variance` |
| `pricing_lines.hours` aggregated by role | `staffing/workers.availableHours` aggregated by role | Required vs available drives `staffing_shortfall` |
| `deals.totalCost` | `costCenters.committed` (delta) | Pre-commit headroom check drives `over_budget` |
| `deals.workdayCostCenterId` | `costCenters.id` | One cost center per deal |
| `deals.businessUnit` | `costCenters.businessUnit` | Default mapping when no explicit link |

---

## 7. Risks, rate limits, cutover checklist

### Risks & rate limits

- **Dynamics 365 Web API:** 6,000 requests / 5-minute sliding window per user.
  Use batch ($batch) endpoints for nightly job. Honor `Retry-After` header on 429s.
- **Workday REST:** soft cap ~1,500 req/min per tenant; SOAP services serialize per ISU.
  Concurrency must stay ≤ 8 to avoid throttling on `Get_Workers` reports.
- **Network:** Workday IP allow-list must include production egress; Dynamics requires
  Azure AD tenant trust to be granted by IT.
- **Data drift:** simulated tables must be flushed (or migrated) at cutover so we don't
  serve stale rows after switching mode → live.
- **Override audit:** Workday blocking validations can only be overridden by Finance /
  Service Line Lead persona, with required justification (≥ 5 chars), captured in
  `workday_validations.overrideJustification` + `overriddenBy`.

### Cutover checklist

1. Provision sandbox tenants — Dynamics 365 (Dataverse) + Workday Implementation tenant.
2. Create Azure AD app registration; grant Dataverse `user_impersonation` scope.
3. Create Workday ISU + integration system; grant Get/Put domain security on
   Staffing, Financial Management, Compensation.
4. Populate Replit Secrets: `D365_*` and `WORKDAY_*` keys.
5. Implement Live providers (`LiveDynamicsProvider`, `LiveWorkdayProvider`) behind
   the existing `Provider` interface. No route changes required.
6. Flip `dynamics_settings.mode` / `workday_settings.mode` to `live` per environment.
7. Run shadow-mode for 1 week (read live, write to sim) and reconcile via
   `dynamics_sync_log` + `workday_events`.
8. Cut over writes; archive simulated tables.

---

## Appendix · Per-endpoint sample request and response

This appendix lists, for every internal endpoint exposed in `server/dynamics.ts` and `server/workday.ts`, a representative request and response. Production-side request/response samples (Dataverse Web API v9.2 for Dynamics 365; Workday REST + SOAP for Workday) follow each block.

### Dynamics 365 — internal endpoints

#### `GET /api/dynamics/accounts`  —  List all client accounts

**Request**

```http
GET /api/dynamics/accounts
```

**Response**

```json
[ { "id":42, "accountNumber":"ACC-000042", "name":"Helios Energy Inc",
    "industry":"Energy", "annualRevenue":540000000,
    "ownerName":"Marcus Chen", "syncStatus":"synced" }, ... ]
```

#### `GET /api/dynamics/accounts/:id`  —  Single account detail

**Request**

```http
GET /api/dynamics/accounts/42
```

**Response**

```json
{ "id":42, "name":"Helios Energy Inc", "industryCode":"211000",
  "primaryContact":{"name":"R. Park","email":"rpark@helios.com"},
  "billingAddress":{"city":"Houston","state":"TX"} }
```

#### `GET /api/dynamics/opportunities`  —  List opportunities

**Request**

```http
GET /api/dynamics/opportunities
```

**Response**

```json
[ { "id":12, "opportunityNumber":"OPP-100012", "name":"Crestwood Audit",
    "accountName":"Crestwood Holdings", "stage":"Develop",
    "estimatedValue":412000, "probability":40 }, ... ]
```

#### `GET /api/dynamics/opportunities/eligible`  —  Develop/Propose opps not yet linked

**Request**

```http
GET /api/dynamics/opportunities/eligible?clientId=8
```

**Response**

```json
[ { "id":15, "name":"Helios SOX Readiness", "stage":"Develop",
    "estimatedValue":540000, "scopeTemplate":{"key":"SOX Readiness"} } ]
```

#### `GET /api/dynamics/scope-templates`  —  Service-line scope templates

**Request**

```http
GET /api/dynamics/scope-templates
```

**Response**

```json
[ { "key":"Annual Audit", "businessUnit":"Audit & Assurance",
    "serviceLine":"Financial Audit", "complexity":"medium" }, ... ]
```

#### `GET /api/dynamics/pipeline`  —  Pipeline rollup

**Request**

```http
GET /api/dynamics/pipeline
```

**Response**

```json
{ "totalPipelineValue":4820000, "weightedPipelineValue":2110000,
  "openOpportunities":17, "winRate":62.5,
  "byStage":[{"stage":"Qualify","count":6,"value":1240000}],
  "forecast":{"commit":880000,"bestCase":1230000} }
```

#### `GET /api/dynamics/sync-log`  —  Last 100 sync events

**Request**

```http
GET /api/dynamics/sync-log
```

**Response**

```json
[ { "id":712, "direction":"outbound", "entity":"Opportunity",
    "action":"Auto-pushed deal updates to D365", "status":"success",
    "actorName":"Marcus Chen", "timestamp":"2026-04-17T14:02Z" } ]
```

#### `GET /api/dynamics/settings`  —  Sync toggles

**Request**

```http
GET /api/dynamics/settings
```

**Response**

```json
{ "autoPushEnabled":true, "autoPushOnStageChange":true,
  "autoPushOnFeeChange":true, "nightlyBatchEnabled":true }
```

#### `GET /api/dynamics/owners`  —  Sales owners + quotas

**Request**

```http
GET /api/dynamics/owners
```

**Response**

```json
[ { "id":1, "name":"Jennifer Walsh", "email":"jwalsh@armanino.com",
    "quota":"2500000" }, ... ]
```

#### `POST /api/dynamics/opportunities`  —  Create new opportunity

**Request**

```http
POST /api/dynamics/opportunities
{ "accountId":42, "name":"Crestwood Audit",
  "estimatedValue":412000, "stage":"Qualify",
  "estimatedCloseDate":"2026-11-01" }
```

**Response**

```json
201 { "id":137, "opportunityNumber":"OPP-100204",
      "stage":"Qualify", "probability":20,
      "forecastCategory":"Pipeline", "syncStatus":"queued" }
```

#### `PATCH /api/dynamics/opportunities/:id`  —  Edit stage / value / owner

**Request**

```http
PATCH /api/dynamics/opportunities/15
{ "stage":"Propose", "estimatedValue":560000 }
```

**Response**

```json
{ "id":15, "stage":"Propose", "probability":65,
  "forecastCategory":"Best Case", "estimatedValue":560000 }
```

#### `POST /api/dynamics/opportunities/:id/import`  —  Pull opp into DealPad as draft deal

**Request**

```http
POST /api/dynamics/opportunities/15/import
{ "userName":"Priya Anand" }
```

**Response**

```json
{ "success":true, "dealId":204, "dealNumber":"D-7714203" }
```

#### `POST /api/dynamics/opportunities/:id/unlink`  —  Unlink opp from DealPad deal

**Request**

```http
POST /api/dynamics/opportunities/15/unlink
{ "userName":"Priya Anand" }
```

**Response**

```json
{ "ok":true, "previousDealId":204 }
```

#### `POST /api/dynamics/deals/:id/push`  —  Manual push: deal → D365

**Request**

```http
POST /api/dynamics/deals/204/push
{ "userName":"Marcus Chen" }
```

**Response**

```json
{ "ok":true, "opportunityId":15 }
```

#### `POST /api/dynamics/sync`  —  Bulk on-demand pull / push

**Request**

```http
POST /api/dynamics/sync
{ "entity":"All", "direction":"bidirectional" }
```

**Response**

```json
{ "success":true, "entity":"All", "pulled":2, "pushed":3,
  "durationMs":1840, "timestamp":"2026-04-17T14:05:11Z" }
```

#### `POST /api/dynamics/nightly-batch`  —  Scheduled full sync

**Request**

```http
POST /api/dynamics/nightly-batch
{ "userName":"system" }
```

**Response**

```json
{ "success":true, "pulled":58, "pushed":17, "failed":0 }
```

#### `PATCH /api/dynamics/settings`  —  Update sync toggles

**Request**

```http
PATCH /api/dynamics/settings
{ "autoPushOnFeeChange":false }
```

**Response**

```json
{ "autoPushEnabled":true, "autoPushOnStageChange":true,
  "autoPushOnFeeChange":false, "nightlyBatchEnabled":true }
```

#### `PATCH /api/dynamics/accounts/:id`  —  Edit account record

**Request**

```http
PATCH /api/dynamics/accounts/42
{ "annualRevenue":620000000, "ownerName":"Lisa Hartmann" }
```

**Response**

```json
{ "id":42, "name":"Helios Energy Inc", "annualRevenue":620000000,
  "ownerName":"Lisa Hartmann", "lastSyncedAt":"2026-04-17T14:08Z" }
```

### Dynamics 365 — production-side equivalents (Dataverse Web API v9.2)

#### GET /api/dynamics/accounts

**Production request**

```http
GET /accounts?$select=name,industrycode,revenue
```

**Production response**

```http
{ "value":[ { "accountid":"8b3a-...", "name":"Helios Energy Inc",
  "revenue":540000000, "industrycode":54 } ] }
```

#### POST /api/dynamics/opportunities

**Production request**

```http
POST /opportunities  (OData-Version: 4.0)
{ "name":"Crestwood Audit", "estimatedvalue":412000,
  "estimatedclosedate":"2026-11-01", "stepname":"Qualify",
  "parentaccountid@odata.bind":"/accounts(8b3a)" }
```

**Production response**

```http
204 No Content  (OData-EntityId: /opportunities(1c92...))
```

#### PATCH /api/dynamics/opportunities/:id

**Production request**

```http
PATCH /opportunities(1c92-...)
{ "stepname":"Propose", "estimatedvalue":560000,
  "closeprobability":65 }
```

**Production response**

```http
204 No Content
```

#### POST /api/dynamics/deals/:id/push

**Production request**

```http
PATCH /opportunities(1c92-...)
{ "estimatedvalue":560000, "actualvalue":null,
  "closeprobability":65, "forecastcategory":2 }
```

**Production response**

```http
204 No Content
```

### Workday — internal endpoints

#### `GET /api/workday/settings`  —  Mode, tenant, tolerances

**Request**

```http
GET /api/workday/settings
```

**Response**

```json
{ "id":1, "mode":"simulated", "autoValidateOnSave":true,
  "autoCheckOnSubmit":true, "rateVarianceTolerancePct":"10.00" }
```

#### `GET /api/workday/cost-centers`  —  Budgets + headroom

**Request**

```http
GET /api/workday/cost-centers
```

**Response**

```json
[ { "id":3, "code":"CC-CONS-300", "name":"Technology Consulting",
    "fiscalYear":"FY2026", "totalBudget":"6200000",
    "committed":"5950000", "source":"simulated" }, ... ]
```

#### `GET /api/workday/workers`  —  Worker pool + availability

**Request**

```http
GET /api/workday/workers
```

**Response**

```json
[ { "id":11, "employeeNumber":"EMP-010011", "name":"Erin Walsh",
    "roleName":"Senior Consultant", "region":"West",
    "weeklyCapacityHours":"40", "availableHours":"220" }, ... ]
```

#### `GET /api/workday/rate-card`  —  Standard cost rates by role

**Request**

```http
GET /api/workday/rate-card
```

**Response**

```json
[ { "id":3, "roleName":"Senior Manager", "standardCostRate":"200",
    "effectiveDate":"2025-07-01", "source":"simulated" }, ... ]
```

#### `GET /api/workday/validations`  —  Recent validation runs

**Request**

```http
GET /api/workday/validations?dealId=87
```

**Response**

```json
[ { "id":412, "dealId":87, "status":"staffing_shortfall",
    "summary":"Staffing shortfall: 240h across roles.",
    "requestedAt":"2026-04-17T13:50Z", "dealTitle":"Helios SOX" } ]
```

#### `GET /api/workday/validations/:id`  —  Validation detail + findings

**Request**

```http
GET /api/workday/validations/412
```

**Response**

```json
{ "id":412, "status":"staffing_shortfall", "budgetUsedPct":"68.78",
  "findings":[ { "findingType":"staffing", "severity":"blocker",
    "roleName":"Senior Consultant", "shortfallHours":"240" } ] }
```

#### `GET /api/workday/deals/:dealId/latest`  —  Latest validation for a deal

**Request**

```http
GET /api/workday/deals/87/latest
```

**Response**

```json
{ "id":412, "status":"staffing_shortfall", "summary":"...",
  "findings":[...], "costCenter":{"code":"CC-ADV-400"} }
```

#### `GET /api/workday/events`  —  Last 150 audit events

**Request**

```http
GET /api/workday/events
```

**Response**

```json
[ { "id":904, "eventType":"validate", "entity":"Validation",
    "dealId":87, "status":"failure", "actorName":"Sarah Chen",
    "message":"Workday validation #412 → STAFFING_SHORTFALL" } ]
```

#### `GET /api/workday/dashboard`  —  Cross-deal validation rollup

**Request**

```http
GET /api/workday/dashboard
```

**Response**

```json
{ "counts":{"clean":12,"over_budget":1,"staffing_shortfall":2,
  "rate_variance":3,"unvalidated":4},
  "attention":[ { "dealId":87, "status":"staffing_shortfall" } ] }
```

#### `PATCH /api/workday/settings`  —  Update mode / tolerances

**Request**

```http
PATCH /api/workday/settings
{ "rateVarianceTolerancePct":12.5, "mode":"simulated" }
```

**Response**

```json
{ "id":1, "mode":"simulated", "rateVarianceTolerancePct":"12.50" }
```

#### `POST /api/workday/cost-centers`  —  Create cost center

**Request**

```http
POST /api/workday/cost-centers
{ "code":"CC-AUDIT-110", "name":"Audit West",
  "totalBudget":2200000, "businessUnit":"Audit & Assurance" }
```

**Response**

```json
201 { "id":9, "code":"CC-AUDIT-110", "totalBudget":"2200000",
      "committed":"0", "source":"simulated" }
```

#### `PATCH /api/workday/cost-centers/:id`  —  Edit cost center

**Request**

```http
PATCH /api/workday/cost-centers/9
{ "committed":480000 }
```

**Response**

```json
{ "id":9, "code":"CC-AUDIT-110", "committed":"480000",
  "lastSyncedAt":"2026-04-17T14:11Z" }
```

#### `DELETE /api/workday/cost-centers/:id`  —  Delete cost center

**Request**

```http
DELETE /api/workday/cost-centers/9
```

**Response**

```json
{ "ok":true }
```

#### `POST /api/workday/workers`  —  Create worker

**Request**

```http
POST /api/workday/workers
{ "name":"Maya Ito", "roleName":"Senior Consultant",
  "region":"West", "weeklyCapacityHours":40, "availableHours":160 }
```

**Response**

```json
201 { "id":31, "employeeNumber":"EMP-010031", "name":"Maya Ito",
      "roleName":"Senior Consultant", "availableHours":"160" }
```

#### `PATCH /api/workday/workers/:id`  —  Edit worker

**Request**

```http
PATCH /api/workday/workers/31
{ "availableHours":120 }
```

**Response**

```json
{ "id":31, "availableHours":"120",
  "lastSyncedAt":"2026-04-17T14:13Z" }
```

#### `DELETE /api/workday/workers/:id`  —  Remove worker

**Request**

```http
DELETE /api/workday/workers/31
```

**Response**

```json
{ "ok":true }
```

#### `PATCH /api/workday/rate-card/:id`  —  Update standard cost rate

**Request**

```http
PATCH /api/workday/rate-card/3
{ "standardCostRate":210 }
```

**Response**

```json
{ "id":3, "roleName":"Senior Manager",
  "standardCostRate":"210", "effectiveDate":"2025-07-01" }
```

#### `POST /api/workday/deals/:dealId/validate`  —  Run validation for a deal

**Request**

```http
POST /api/workday/deals/87/validate
{ "userName":"Sarah Chen" }
```

**Response**

```json
{ "ok":false, "status":"staffing_shortfall",
  "validationId":412, "summary":"Staffing shortfall: 240h",
  "findings":[ {"findingType":"staffing","severity":"blocker"} ] }
```

#### `POST /api/workday/deals/:dealId/link`  —  Link / unlink deal ↔ cost center

**Request**

```http
POST /api/workday/deals/87/link
{ "costCenterId":4, "userName":"Sarah Chen" }
```

**Response**

```json
{ "ok":true,
  "costCenter":{ "id":4, "code":"CC-ADV-400",
                  "name":"Advisory Services" } }
```

#### `POST /api/workday/validations/:id/override`  —  Override blocking validation

**Request**

```http
POST /api/workday/validations/412/override
{ "justification":"Senior Cons backfill via partner firm",
  "userName":"Lisa Park", "role":"fin" }
```

**Response**

```json
{ "id":412, "status":"staffing_shortfall",
  "overriddenBy":"Lisa Park",
  "overrideJustification":"Senior Cons backfill via partner firm",
  "overriddenAt":"2026-04-17T14:18Z" }
```

### Workday — production-side equivalents (REST + SOAP)

#### GET /api/workday/cost-centers

**Production request**

```http
GET /ccx/api/financialManagement/v1/{tenant}/costCenters
Authorization: Bearer eyJraWQ...
```

**Production response**

```http
{ "data":[ { "id":"8e1b", "code":"CC-CONS-300",
  "name":"Technology Consulting", "totalBudget":6200000,
  "committed":5950000 } ] }
```

#### GET /api/workday/workers

**Production request**

```http
GET /ccx/api/staffing/v6/{tenant}/workers?limit=100
Authorization: Bearer eyJraWQ...
```

**Production response**

```http
{ "data":[ { "id":"abc", "workerId":"EMP-010011",
  "primaryWorkEmail":"erin.walsh@armanino.com",
  "position":{"jobProfile":"Senior Consultant"} } ] }
```

#### PATCH /api/workday/rate-card/:id

**Production request**

```http
SOAP Put_Compensation_Plan_Request
<wd:Plan_Reference Descriptor="Senior Manager"/>
<wd:Plan_Data>
  <wd:Standard_Hourly_Cost_Rate>210</wd:...>
  <wd:Effective_Date>2026-04-17</wd:...>
</wd:Plan_Data>
```

**Production response**

```http
<wd:Put_Compensation_Plan_Response>
  <wd:Compensation_Plan_Reference WID="3f..."/>
</wd:Put_Compensation_Plan_Response>
```

#### POST /api/workday/workers

**Production request**

```http
SOAP Hire_Employee_Request  (Staffing v40+)
<wd:Personal_Data><wd:Name_Data>Maya Ito</wd:...></...>
<wd:Position_Reference Descriptor="P-00531"/>
```

**Production response**

```http
<wd:Hire_Employee_Response>
  <wd:Employee_Reference WID="7c2..."/>
</wd:Hire_Employee_Response>
```

#### POST /api/workday/deals/:dealId/validate

**Production request**

```http
Composite (read-only):
  GET /financialManagement/v1/{tenant}/costCenters/{id}
  GET /staffing/v6/{tenant}/workers?role=...
  GET /compensation/v1/{tenant}/compensationPlans
```

**Production response**

```http
DealPad rules engine returns:
{ "ok":false, "status":"staffing_shortfall",
  "findings":[...] }
```
