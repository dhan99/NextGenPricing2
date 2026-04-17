# Integrations API Overview — Slide Outline

Each `##` heading below is one slide in `exports/Integrations-API-Overview.pptx`.
The script `scripts/build_integrations_deck.py` reads the same content model and produces
the deck.

---

## Slide 1 — Title
**DealPad Integrations API Overview**
Microsoft Dynamics 365 (CRM) · Workday (HCM / Financials)
Stakeholder briefing · April 2026

## Slide 2 — Executive summary
- Dynamics 365 — system of record for accounts and the opportunity pipeline
- Workday — source of truth for budgets, worker availability, and standard cost rates
- Today: persistent simulation behind a provider pattern
- Cutover: swap provider behind same routes — no contract changes

## Slide 3 — Section divider
**Microsoft Dynamics 365**

## Slide 4 — D365 architecture & data flow
- DealPad ⇄ Dataverse Web API v9.2
- Inbound: nightly batch + on-demand pull (accounts, opportunities)
- Outbound auto-push when deal stage / fee / margin changes
- Per-trigger toggles in `dynamics_settings`

## Slide 5 — D365 authentication & security
- OAuth 2.0 client-credentials via Azure AD
- Token: `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Scope: `https://{org}.api.crm.dynamics.com/.default`
- Audit trail: every call → `dynamics_sync_log`

## Slide 6 — D365 internal endpoints (read)
Table: method · path · purpose

## Slide 7 — D365 internal endpoints (write)
Table: method · path · purpose

## Slide 8 — D365 internal → production mapping
Table: DealPad route → Dataverse Web API call

## Slide 9 — D365 sample request / response
Create opportunity (DealPad → Dataverse) with response payload

## Slide 10 — Section divider
**Workday**

## Slide 11 — Workday architecture & data flow
- DealPad ⇄ Workday REST + SOAP
- Auto-validate on save; auto-check on submit (blocks if `over_budget` or `staffing_shortfall`)
- Override path: Finance / Service Line Lead with justification

## Slide 12 — Workday authentication & security
- OAuth 2.0 (REST) or ISU + Basic auth (SOAP)
- Token: `{host}.workday.com/ccx/oauth2/{tenant}/token`
- Audit: `workday_events`, `workday_validations`, `workday_validation_findings`

## Slide 13 — Workday internal endpoints (read)
Table

## Slide 14 — Workday internal endpoints (write)
Table

## Slide 15 — Workday internal → production mapping
Table: DealPad route → Workday REST or SOAP

## Slide 16 — Workday sample request / response
Validate deal (DealPad) → composite Workday calls + JSON response, plus SOAP fallback example

## Slide 17 — Field mapping appendix (D365)
DealPad Deal ↔ D365 Opportunity — stage, fee, probability, owner, account

## Slide 18 — Field mapping appendix (Workday)
DealPad pricing line ↔ Workday worker availability + cost center

## Slide 19 — Risks & rate limits
- D365: 6,000 req / 5 min (use $batch + Retry-After)
- Workday REST: ~1,500 req/min; SOAP serialized per ISU (≤ 8 concurrent)
- IP allow-list, secrets in Replit Secrets, no shared accounts

## Slide 20 — Cutover checklist
1. Provision sandbox tenants
2. Azure AD app + Workday ISU
3. Populate secrets
4. Implement Live providers behind existing `Provider` interface
5. Flip `mode` per environment
6. 1-week shadow mode + reconcile
7. Archive simulated tables

---

## Appendix · Per-Endpoint Samples (slides 21–34)

- **Slide 21 — Section divider:** "Appendix · Per-Endpoint Samples".
- **Slides 22–26 — Dynamics 365 internal samples:** 4 endpoint cards per slide (method badge, path, purpose, request, response) covering all 18 routes in `server/dynamics.ts`.
- **Slide 27 — Dynamics 365 production samples:** representative Dataverse Web API v9.2 request/response cards (token-bearing GET /accounts, POST /opportunities, PATCH /opportunities, PATCH /opportunities for deal push).
- **Slides 28–32 — Workday internal samples:** 4 endpoint cards per slide covering all 20 routes in `server/workday.ts`.
- **Slides 33–34 — Workday production samples:** REST cost-center pull, REST workers list, SOAP `Put_Compensation_Plan`, SOAP `Hire_Employee`, composite validation request.
