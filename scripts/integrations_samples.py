"""Per-endpoint sample request/response payloads for the integrations deck
and markdown. Kept compact (≤ ~10 lines per side) so they render legibly on
appendix slides and stay easy to skim in the markdown.

Each entry: (METHOD, INTERNAL_PATH, PURPOSE, REQUEST_TEXT, RESPONSE_TEXT)

REQUEST_TEXT and RESPONSE_TEXT are plain text blocks (HTTP-style); for
production samples they correspond to the Dataverse Web API call (D365) or
the Workday REST/SOAP call documented in api-overview.md.
"""

D365_SAMPLES = [
    # ---- READ ----
    ("GET", "/api/dynamics/accounts",
     "List all client accounts",
     "GET /api/dynamics/accounts",
     "[ { \"id\":42, \"accountNumber\":\"ACC-000042\", \"name\":\"Helios Energy Inc\",\n"
     "    \"industry\":\"Energy\", \"annualRevenue\":540000000,\n"
     "    \"ownerName\":\"Marcus Chen\", \"syncStatus\":\"synced\" }, ... ]"),
    ("GET", "/api/dynamics/accounts/:id",
     "Single account detail",
     "GET /api/dynamics/accounts/42",
     "{ \"id\":42, \"name\":\"Helios Energy Inc\", \"industryCode\":\"211000\",\n"
     "  \"primaryContact\":{\"name\":\"R. Park\",\"email\":\"rpark@helios.com\"},\n"
     "  \"billingAddress\":{\"city\":\"Houston\",\"state\":\"TX\"} }"),
    ("GET", "/api/dynamics/opportunities",
     "List opportunities",
     "GET /api/dynamics/opportunities",
     "[ { \"id\":12, \"opportunityNumber\":\"OPP-100012\", \"name\":\"Crestwood Audit\",\n"
     "    \"accountName\":\"Crestwood Holdings\", \"stage\":\"Develop\",\n"
     "    \"estimatedValue\":412000, \"probability\":40 }, ... ]"),
    ("GET", "/api/dynamics/opportunities/eligible",
     "Develop/Propose opps not yet linked",
     "GET /api/dynamics/opportunities/eligible?clientId=8",
     "[ { \"id\":15, \"name\":\"Helios SOX Readiness\", \"stage\":\"Develop\",\n"
     "    \"estimatedValue\":540000, \"scopeTemplate\":{\"key\":\"SOX Readiness\"} } ]"),
    ("GET", "/api/dynamics/scope-templates",
     "Service-line scope templates",
     "GET /api/dynamics/scope-templates",
     "[ { \"key\":\"Annual Audit\", \"businessUnit\":\"Audit & Assurance\",\n"
     "    \"serviceLine\":\"Financial Audit\", \"complexity\":\"medium\" }, ... ]"),
    ("GET", "/api/dynamics/pipeline",
     "Pipeline rollup",
     "GET /api/dynamics/pipeline",
     "{ \"totalPipelineValue\":4820000, \"weightedPipelineValue\":2110000,\n"
     "  \"openOpportunities\":17, \"winRate\":62.5,\n"
     "  \"byStage\":[{\"stage\":\"Qualify\",\"count\":6,\"value\":1240000}],\n"
     "  \"forecast\":{\"commit\":880000,\"bestCase\":1230000} }"),
    ("GET", "/api/dynamics/sync-log",
     "Last 100 sync events",
     "GET /api/dynamics/sync-log",
     "[ { \"id\":712, \"direction\":\"outbound\", \"entity\":\"Opportunity\",\n"
     "    \"action\":\"Auto-pushed deal updates to D365\", \"status\":\"success\",\n"
     "    \"actorName\":\"Marcus Chen\", \"timestamp\":\"2026-04-17T14:02Z\" } ]"),
    ("GET", "/api/dynamics/settings",
     "Sync toggles",
     "GET /api/dynamics/settings",
     "{ \"autoPushEnabled\":true, \"autoPushOnStageChange\":true,\n"
     "  \"autoPushOnFeeChange\":true, \"nightlyBatchEnabled\":true }"),
    ("GET", "/api/dynamics/owners",
     "Sales owners + quotas",
     "GET /api/dynamics/owners",
     "[ { \"id\":1, \"name\":\"Jennifer Walsh\", \"email\":\"jwalsh@armanino.com\",\n"
     "    \"quota\":\"2500000\" }, ... ]"),
    # ---- WRITE ----
    ("POST", "/api/dynamics/opportunities",
     "Create new opportunity",
     "POST /api/dynamics/opportunities\n"
     "{ \"accountId\":42, \"name\":\"Crestwood Audit\",\n"
     "  \"estimatedValue\":412000, \"stage\":\"Qualify\",\n"
     "  \"estimatedCloseDate\":\"2026-11-01\" }",
     "201 { \"id\":137, \"opportunityNumber\":\"OPP-100204\",\n"
     "      \"stage\":\"Qualify\", \"probability\":20,\n"
     "      \"forecastCategory\":\"Pipeline\", \"syncStatus\":\"queued\" }"),
    ("PATCH", "/api/dynamics/opportunities/:id",
     "Edit stage / value / owner",
     "PATCH /api/dynamics/opportunities/15\n"
     "{ \"stage\":\"Propose\", \"estimatedValue\":560000 }",
     "{ \"id\":15, \"stage\":\"Propose\", \"probability\":65,\n"
     "  \"forecastCategory\":\"Best Case\", \"estimatedValue\":560000 }"),
    ("POST", "/api/dynamics/opportunities/:id/import",
     "Pull opp into DealPad as draft deal",
     "POST /api/dynamics/opportunities/15/import\n"
     "{ \"userName\":\"Priya Anand\" }",
     "{ \"success\":true, \"dealId\":204, \"dealNumber\":\"D-7714203\" }"),
    ("POST", "/api/dynamics/opportunities/:id/unlink",
     "Unlink opp from DealPad deal",
     "POST /api/dynamics/opportunities/15/unlink\n"
     "{ \"userName\":\"Priya Anand\" }",
     "{ \"ok\":true, \"previousDealId\":204 }"),
    ("POST", "/api/dynamics/deals/:id/push",
     "Manual push: deal → D365",
     "POST /api/dynamics/deals/204/push\n"
     "{ \"userName\":\"Marcus Chen\" }",
     "{ \"ok\":true, \"opportunityId\":15 }"),
    ("POST", "/api/dynamics/sync",
     "Bulk on-demand pull / push",
     "POST /api/dynamics/sync\n"
     "{ \"entity\":\"All\", \"direction\":\"bidirectional\" }",
     "{ \"success\":true, \"entity\":\"All\", \"pulled\":2, \"pushed\":3,\n"
     "  \"durationMs\":1840, \"timestamp\":\"2026-04-17T14:05:11Z\" }"),
    ("POST", "/api/dynamics/nightly-batch",
     "Scheduled full sync",
     "POST /api/dynamics/nightly-batch\n"
     "{ \"userName\":\"system\" }",
     "{ \"success\":true, \"pulled\":58, \"pushed\":17, \"failed\":0 }"),
    ("PATCH", "/api/dynamics/settings",
     "Update sync toggles",
     "PATCH /api/dynamics/settings\n"
     "{ \"autoPushOnFeeChange\":false }",
     "{ \"autoPushEnabled\":true, \"autoPushOnStageChange\":true,\n"
     "  \"autoPushOnFeeChange\":false, \"nightlyBatchEnabled\":true }"),
    ("PATCH", "/api/dynamics/accounts/:id",
     "Edit account record",
     "PATCH /api/dynamics/accounts/42\n"
     "{ \"annualRevenue\":620000000, \"ownerName\":\"Lisa Hartmann\" }",
     "{ \"id\":42, \"name\":\"Helios Energy Inc\", \"annualRevenue\":620000000,\n"
     "  \"ownerName\":\"Lisa Hartmann\", \"lastSyncedAt\":\"2026-04-17T14:08Z\" }"),
]

# Production-side equivalents (Dataverse Web API v9.2)
D365_PROD_SAMPLES = [
    ("GET /api/dynamics/accounts",
     "GET /accounts?$select=name,industrycode,revenue",
     "{ \"value\":[ { \"accountid\":\"8b3a-...\", \"name\":\"Helios Energy Inc\",\n"
     "  \"revenue\":540000000, \"industrycode\":54 } ] }"),
    ("POST /api/dynamics/opportunities",
     "POST /opportunities  (OData-Version: 4.0)\n"
     "{ \"name\":\"Crestwood Audit\", \"estimatedvalue\":412000,\n"
     "  \"estimatedclosedate\":\"2026-11-01\", \"stepname\":\"Qualify\",\n"
     "  \"parentaccountid@odata.bind\":\"/accounts(8b3a)\" }",
     "204 No Content  (OData-EntityId: /opportunities(1c92...))"),
    ("PATCH /api/dynamics/opportunities/:id",
     "PATCH /opportunities(1c92-...)\n"
     "{ \"stepname\":\"Propose\", \"estimatedvalue\":560000,\n"
     "  \"closeprobability\":65 }",
     "204 No Content"),
    ("POST /api/dynamics/deals/:id/push",
     "PATCH /opportunities(1c92-...)\n"
     "{ \"estimatedvalue\":560000, \"actualvalue\":null,\n"
     "  \"closeprobability\":65, \"forecastcategory\":2 }",
     "204 No Content"),
]

WD_SAMPLES = [
    # ---- READ ----
    ("GET", "/api/workday/settings",
     "Mode, tenant, tolerances",
     "GET /api/workday/settings",
     "{ \"id\":1, \"mode\":\"simulated\", \"autoValidateOnSave\":true,\n"
     "  \"autoCheckOnSubmit\":true, \"rateVarianceTolerancePct\":\"10.00\" }"),
    ("GET", "/api/workday/cost-centers",
     "Budgets + headroom",
     "GET /api/workday/cost-centers",
     "[ { \"id\":3, \"code\":\"CC-CONS-300\", \"name\":\"Technology Consulting\",\n"
     "    \"fiscalYear\":\"FY2026\", \"totalBudget\":\"6200000\",\n"
     "    \"committed\":\"5950000\", \"source\":\"simulated\" }, ... ]"),
    ("GET", "/api/workday/workers",
     "Worker pool + availability",
     "GET /api/workday/workers",
     "[ { \"id\":11, \"employeeNumber\":\"EMP-010011\", \"name\":\"Erin Walsh\",\n"
     "    \"roleName\":\"Senior Consultant\", \"region\":\"West\",\n"
     "    \"weeklyCapacityHours\":\"40\", \"availableHours\":\"220\" }, ... ]"),
    ("GET", "/api/workday/rate-card",
     "Standard cost rates by role",
     "GET /api/workday/rate-card",
     "[ { \"id\":3, \"roleName\":\"Senior Manager\", \"standardCostRate\":\"200\",\n"
     "    \"effectiveDate\":\"2025-07-01\", \"source\":\"simulated\" }, ... ]"),
    ("GET", "/api/workday/validations",
     "Recent validation runs",
     "GET /api/workday/validations?dealId=87",
     "[ { \"id\":412, \"dealId\":87, \"status\":\"staffing_shortfall\",\n"
     "    \"summary\":\"Staffing shortfall: 240h across roles.\",\n"
     "    \"requestedAt\":\"2026-04-17T13:50Z\", \"dealTitle\":\"Helios SOX\" } ]"),
    ("GET", "/api/workday/validations/:id",
     "Validation detail + findings",
     "GET /api/workday/validations/412",
     "{ \"id\":412, \"status\":\"staffing_shortfall\", \"budgetUsedPct\":\"68.78\",\n"
     "  \"findings\":[ { \"findingType\":\"staffing\", \"severity\":\"blocker\",\n"
     "    \"roleName\":\"Senior Consultant\", \"shortfallHours\":\"240\" } ] }"),
    ("GET", "/api/workday/deals/:dealId/latest",
     "Latest validation for a deal",
     "GET /api/workday/deals/87/latest",
     "{ \"id\":412, \"status\":\"staffing_shortfall\", \"summary\":\"...\",\n"
     "  \"findings\":[...], \"costCenter\":{\"code\":\"CC-ADV-400\"} }"),
    ("GET", "/api/workday/events",
     "Last 150 audit events",
     "GET /api/workday/events",
     "[ { \"id\":904, \"eventType\":\"validate\", \"entity\":\"Validation\",\n"
     "    \"dealId\":87, \"status\":\"failure\", \"actorName\":\"Sarah Chen\",\n"
     "    \"message\":\"Workday validation #412 → STAFFING_SHORTFALL\" } ]"),
    ("GET", "/api/workday/dashboard",
     "Cross-deal validation rollup",
     "GET /api/workday/dashboard",
     "{ \"counts\":{\"clean\":12,\"over_budget\":1,\"staffing_shortfall\":2,\n"
     "  \"rate_variance\":3,\"unvalidated\":4},\n"
     "  \"attention\":[ { \"dealId\":87, \"status\":\"staffing_shortfall\" } ] }"),
    # ---- WRITE ----
    ("PATCH", "/api/workday/settings",
     "Update mode / tolerances",
     "PATCH /api/workday/settings\n"
     "{ \"rateVarianceTolerancePct\":12.5, \"mode\":\"simulated\" }",
     "{ \"id\":1, \"mode\":\"simulated\", \"rateVarianceTolerancePct\":\"12.50\" }"),
    ("POST", "/api/workday/cost-centers",
     "Create cost center",
     "POST /api/workday/cost-centers\n"
     "{ \"code\":\"CC-AUDIT-110\", \"name\":\"Audit West\",\n"
     "  \"totalBudget\":2200000, \"businessUnit\":\"Audit & Assurance\" }",
     "201 { \"id\":9, \"code\":\"CC-AUDIT-110\", \"totalBudget\":\"2200000\",\n"
     "      \"committed\":\"0\", \"source\":\"simulated\" }"),
    ("PATCH", "/api/workday/cost-centers/:id",
     "Edit cost center",
     "PATCH /api/workday/cost-centers/9\n"
     "{ \"committed\":480000 }",
     "{ \"id\":9, \"code\":\"CC-AUDIT-110\", \"committed\":\"480000\",\n"
     "  \"lastSyncedAt\":\"2026-04-17T14:11Z\" }"),
    ("DELETE", "/api/workday/cost-centers/:id",
     "Delete cost center",
     "DELETE /api/workday/cost-centers/9",
     "{ \"ok\":true }"),
    ("POST", "/api/workday/workers",
     "Create worker",
     "POST /api/workday/workers\n"
     "{ \"name\":\"Maya Ito\", \"roleName\":\"Senior Consultant\",\n"
     "  \"region\":\"West\", \"weeklyCapacityHours\":40, \"availableHours\":160 }",
     "201 { \"id\":31, \"employeeNumber\":\"EMP-010031\", \"name\":\"Maya Ito\",\n"
     "      \"roleName\":\"Senior Consultant\", \"availableHours\":\"160\" }"),
    ("PATCH", "/api/workday/workers/:id",
     "Edit worker",
     "PATCH /api/workday/workers/31\n"
     "{ \"availableHours\":120 }",
     "{ \"id\":31, \"availableHours\":\"120\",\n"
     "  \"lastSyncedAt\":\"2026-04-17T14:13Z\" }"),
    ("DELETE", "/api/workday/workers/:id",
     "Remove worker",
     "DELETE /api/workday/workers/31",
     "{ \"ok\":true }"),
    ("PATCH", "/api/workday/rate-card/:id",
     "Update standard cost rate",
     "PATCH /api/workday/rate-card/3\n"
     "{ \"standardCostRate\":210 }",
     "{ \"id\":3, \"roleName\":\"Senior Manager\",\n"
     "  \"standardCostRate\":\"210\", \"effectiveDate\":\"2025-07-01\" }"),
    ("POST", "/api/workday/deals/:dealId/validate",
     "Run validation for a deal",
     "POST /api/workday/deals/87/validate\n"
     "{ \"userName\":\"Sarah Chen\" }",
     "{ \"ok\":false, \"status\":\"staffing_shortfall\",\n"
     "  \"validationId\":412, \"summary\":\"Staffing shortfall: 240h\",\n"
     "  \"findings\":[ {\"findingType\":\"staffing\",\"severity\":\"blocker\"} ] }"),
    ("POST", "/api/workday/deals/:dealId/link",
     "Link / unlink deal ↔ cost center",
     "POST /api/workday/deals/87/link\n"
     "{ \"costCenterId\":4, \"userName\":\"Sarah Chen\" }",
     "{ \"ok\":true,\n"
     "  \"costCenter\":{ \"id\":4, \"code\":\"CC-ADV-400\",\n"
     "                  \"name\":\"Advisory Services\" } }"),
    ("POST", "/api/workday/validations/:id/override",
     "Override blocking validation",
     "POST /api/workday/validations/412/override\n"
     "{ \"justification\":\"Senior Cons backfill via partner firm\",\n"
     "  \"userName\":\"Lisa Park\", \"role\":\"fin\" }",
     "{ \"id\":412, \"status\":\"staffing_shortfall\",\n"
     "  \"overriddenBy\":\"Lisa Park\",\n"
     "  \"overrideJustification\":\"Senior Cons backfill via partner firm\",\n"
     "  \"overriddenAt\":\"2026-04-17T14:18Z\" }"),
]

# Production-side equivalents (Workday REST + SOAP)
WD_PROD_SAMPLES = [
    ("GET /api/workday/cost-centers",
     "GET /ccx/api/financialManagement/v1/{tenant}/costCenters\n"
     "Authorization: Bearer eyJraWQ...",
     "{ \"data\":[ { \"id\":\"8e1b\", \"code\":\"CC-CONS-300\",\n"
     "  \"name\":\"Technology Consulting\", \"totalBudget\":6200000,\n"
     "  \"committed\":5950000 } ] }"),
    ("GET /api/workday/workers",
     "GET /ccx/api/staffing/v6/{tenant}/workers?limit=100\n"
     "Authorization: Bearer eyJraWQ...",
     "{ \"data\":[ { \"id\":\"abc\", \"workerId\":\"EMP-010011\",\n"
     "  \"primaryWorkEmail\":\"erin.walsh@armanino.com\",\n"
     "  \"position\":{\"jobProfile\":\"Senior Consultant\"} } ] }"),
    ("PATCH /api/workday/rate-card/:id",
     "SOAP Put_Compensation_Plan_Request\n"
     "<wd:Plan_Reference Descriptor=\"Senior Manager\"/>\n"
     "<wd:Plan_Data>\n"
     "  <wd:Standard_Hourly_Cost_Rate>210</wd:...>\n"
     "  <wd:Effective_Date>2026-04-17</wd:...>\n"
     "</wd:Plan_Data>",
     "<wd:Put_Compensation_Plan_Response>\n"
     "  <wd:Compensation_Plan_Reference WID=\"3f...\"/>\n"
     "</wd:Put_Compensation_Plan_Response>"),
    ("POST /api/workday/workers",
     "SOAP Hire_Employee_Request  (Staffing v40+)\n"
     "<wd:Personal_Data><wd:Name_Data>Maya Ito</wd:...></...>\n"
     "<wd:Position_Reference Descriptor=\"P-00531\"/>",
     "<wd:Hire_Employee_Response>\n"
     "  <wd:Employee_Reference WID=\"7c2...\"/>\n"
     "</wd:Hire_Employee_Response>"),
    ("POST /api/workday/deals/:dealId/validate",
     "Composite (read-only):\n"
     "  GET /financialManagement/v1/{tenant}/costCenters/{id}\n"
     "  GET /staffing/v6/{tenant}/workers?role=...\n"
     "  GET /compensation/v1/{tenant}/compensationPlans",
     "DealPad rules engine returns:\n"
     "{ \"ok\":false, \"status\":\"staffing_shortfall\",\n"
     "  \"findings\":[...] }"),
]
