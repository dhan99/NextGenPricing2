# COTS vs Build — One-Pager

**Audience:** Armanino executive sponsors  ·  **Date:** April 20, 2026  ·  **Source:** DealPad architecture, integration docs, vendor public capability descriptions

**The question this one-pager answers:** *Why are we building DealPad to solve the **scoping & pricing** step of the deal lifecycle instead of buying an off-the-shelf product to do it?*

> **Scope of comparison:** Per stakeholder direction, the comparison set is *true replacement alternatives* for DealPad's scope-to-fee engine — i.e., COTS products that could plausibly replace DealPad — not the surrounding integrated systems (Dynamics 365, Workday, Intapp, Conga, Power BI), which are already-decided **Buy + Integrate** components.

The supporting systems around scoping & pricing are not in dispute — Microsoft Dynamics 365 (CRM), Workday (HCM/financials), Intapp (risk & compliance), Conga (engagement-letter assembly), and Power BI (analytics) are already in the firm's stack and DealPad consumes them as **Buy + Integrate**. This page focuses on the one capability where the build/buy choice is open: the interactive **scope-to-fee engine** that turns an opportunity into a priced, role-loaded, scenario-comparable, approval-ready proposal.

**Three-pillar framework**

1. **Buy to accelerate** — adopt COTS where the market has already solved a generic problem (CRM, HCM, contract assembly, financials, BI). All five are already integrated.
2. **Build to differentiate** — own the *scoping & pricing engine* and intelligence layer that codifies Armanino's IP (role hierarchy, complexity multipliers, scope catalog, scenario generation, AI calibration).
3. **ISO 42001 as a moat** — an owned AI Management System (AIMS) embedded in the build is materially harder for any horizontal SaaS vendor to replicate per tenant.

---

## COTS alternatives that could replace DealPad's scoping & pricing function

| # | Product | What it offers for scope & pricing | Why it does not replace DealPad for Armanino |
|---|---|---|---|
| 1 | **Salesforce Revenue Cloud (CPQ + CLM)** | Configure-Price-Quote rules engine, approval workflows, quote document generation, contract lifecycle; Einstein for forecasting and next-best-action. | CPQ is built around products and SKUs, not a 7-tier role hierarchy with complexity multipliers; service-hour assemblies and scenario generation must be hand-built in CPQ rules / Apex; Einstein is generic forecasting, not Armanino effort/margin learning; introduces a second CRM stack alongside Dynamics; per-user licensing scales with every contributor. |
| 2 | **Conga CPQ** (separate from Composer doc engine already integrated) | Standalone CPQ with quote configuration, pricing rules, approval routing; pairs with Conga CLM. | Same product/SKU model bias as Salesforce CPQ; cannot natively express role-loaded service-hour pricing or auto-generated Standard/Premium/Value scenarios; vendor AI surface is generic; would still need DealPad-style logic on top. |
| 3 | **Deltek Vantagepoint / Maconomy** | ERP + PSA built for project-based professional-services firms: opportunity, project setup, role-based pricing, resourcing, billing, revenue recognition. | Closest single-vendor alternative for accounting-firm scope-to-fee, but the opportunity/scoping module is template-based, not a calibrated AI scoping engine; ERP-class implementation; firm-specific scope catalog and complexity multipliers still require heavy customisation; no ISO 42001-aligned per-tenant AIMS evidence; high lock-in. |
| 4 | **Kantata (formerly Kimble + Mavenlink)** | PSA for services firms covering deal/opportunity, resource planning, project margin forecasting, time/expense, billing. | Opportunity & margin module covers part of DealPad's scenario surface but is generic across services verticals; no firm-specific role hierarchy or complexity multiplier IP; AI features are vendor-owned and shared across tenants; would still need a custom adaptation layer for Armanino's pricing patterns; overlaps significantly with Workday Financials, creating a second source of truth. |
| 5 | **Certinia PSA (formerly FinancialForce)** | Salesforce-native PSA: services CRM, project pricing, resource management, project accounting; tight Salesforce integration. | Inherits Salesforce CPQ's product-centric pricing model; firm-specific role-loaded pricing must be built on top; AI is Einstein/Salesforce-owned; assumes Salesforce as the CRM (Armanino's CRM is Dynamics); platform lock-in to Salesforce ecosystem. |
| 6 | **PROS Smart CPQ** | AI-driven pricing optimisation, dynamic discounting, win-probability modelling on top of CPQ. | Pricing optimisation is calibrated for high-volume, transactional B2B (manufacturing, distribution, travel), not low-volume professional-services engagements; opaque vendor AI; no native scenario/RBAC/approval workflow for service-hour scoping; would have to be wrapped in another product to be useful for Armanino. |

### Dimensions matrix — same options, consistent rubric

| Option | Capability fit (scope & pricing) | Time-to-value | Customization cost | Data residency / governance | AI transparency | Lock-in risk |
|---|---|---|---|---|---|---|
| Salesforce Revenue Cloud | Medium — product-centric CPQ | Medium | High (CPQ rules + Apex) | Vendor cloud | Vendor-owned (Einstein) | High |
| Conga CPQ | Medium — product-centric CPQ | Medium | High | Vendor cloud | Vendor-owned | Medium |
| Deltek Vantagepoint | Medium — PSA + ERP, template-based scoping | Slow (ERP rollout) | High | Vendor cloud / on-prem | Vendor-owned | High |
| Kantata | Medium — generic PSA | Medium | Medium | Vendor cloud | Vendor-owned | Medium |
| Certinia PSA | Medium — Salesforce-native PSA | Medium | High (Salesforce platform) | Vendor cloud | Vendor-owned (Einstein) | High |
| PROS Smart CPQ | Low — wrong workload (transactional B2B) | Slow | High | Vendor cloud | Vendor-owned (opaque) | High |
| **DealPad build** | **Full — owns scoping & pricing + AI** | Slower (build cycle) | **Owned (low marginal)** | **Owned (firm tenant + audit)** | **Owned + ISO 42001-auditable** | **Low** |

---

## Why DealPad build wins for the scoping & pricing problem

| Capability area | What the build adds (existing or planned) |
|---|---|
| **Scoped pricing assemblies** | 7-tier role hierarchy, complexity multipliers (0.8×–1.5×), scope catalog, automatic margin/fee/cost recalculation when scope changes — not modelled by any product/SKU CPQ. |
| **AI intelligence layer** | Five calibrated use cases — deal similarity, effort estimation, margin advisor, scenario recommendation, risk summary — grounded in DealPad's own historical Armanino data, not a generic vendor model. |
| **Scenario engine** | Auto-generated Standard / Premium / Value scenarios with AI reasoning attached, side-by-side comparable; absent from the COTS set for service-hour pricing. |
| **Multi-persona RBAC + approval workflow** | Six personas (PDL, SLL, PO, FIN, QRM, IT) with per-feature permissions, status state-machine, AI-narrative-attached approvals, per-deal audit trail. |
| **Integration backbone** | Provider-pattern abstraction (simulated → live by configuration) for Dynamics, Workday, Intapp, Conga, Power BI; auto-push on approval transitions; per-integration audit log. |

## ISO 42001 as a genuine moat

A build-owned **AI Management System (AIMS)** under ISO/IEC 42001 — covering AI risk register, model lifecycle, human-in-the-loop controls, dataset and prompt governance, and an auditable trail of every AI-assisted decision — becomes durable differentiation because:

- DealPad's AI use cases sit inside Armanino's tenant, on Armanino's data, with Armanino's controls. The COTS alternatives above each ship AI features, but each one's AIMS is the **vendor's**, scoped to the vendor's product line and shared across all tenants.
- ISO/IEC 42001 conformance requires per-tenant evidence: model purpose, dataset lineage, monitoring, override capture, and continuous-improvement loops tied to the firm's risk appetite — evidence a horizontal SaaS vendor is not structured to carry for a single firm's pricing/scoping workflow.
- DealPad already implements the structural primitives 42001 expects: persona-based RBAC, override-with-justification (Workday/Intapp), AI-narrative attachment to approvals, activity log, source-tagged ("simulated" vs "live") audit history. Formalising these into the AIMS turns existing engineering into a defensible governance asset.
- Assessment: for regulated client work (Audit, Risk & Compliance, Banking, Healthcare), an externally-auditable AIMS — *owned, not borrowed* — is a differentiator the surveyed COTS vendors do not currently provide for this workflow.

---

## Recommendation — Buy / Build / Integrate

| Capability area | Decision | One-line rationale |
|---|---|---|
| Account & opportunity CRM | **Buy + Integrate** (Dynamics 365) | Already firm-standard; DealPad consumes accounts/opps and pushes stage/fee back. |
| Cost centers, workers, standard cost rates | **Buy + Integrate** (Workday) | Authoritative source of truth; DealPad validates, never replicates. |
| Conflicts, independence, engagement acceptance | **Buy + Integrate** (Intapp Risk) | Industry-standard; DealPad submits payloads and consumes verdicts. |
| Engagement-letter document assembly & delivery | **Buy + Integrate** (Conga Composer / CLM) | Templating & e-sign is solved; DealPad owns the field map and delivery state. |
| Pipeline & forecast analytics | **Buy + Integrate** (Dynamics + Power BI) | Re-use existing analytics estate; DealPad feeds it via outbound sync. |
| **Scope-to-fee engine, role pricing, complexity multipliers** | **Build (DealPad)** | Encodes Armanino IP; no COTS in the surveyed set models service-hour assemblies this way. |
| **Scenario generation & comparison (Standard / Premium / Value)** | **Build (DealPad)** | Differentiating UX and reasoning surface; absent from the COTS set. |
| **AI use cases (similarity, effort, margin, scenario, risk)** | **Build (DealPad)** | Trained on Armanino's own deal corpus; vendor AI cannot substitute. |
| **Multi-persona RBAC & approval workflow** | **Build (DealPad)** | Firm-specific governance and audit shape; not a generic CRM workflow. |
| **AI Management System (ISO/IEC 42001)** | **Build (DealPad)** | Owned AIMS is the durable moat; tenant-specific evidence is not provided by horizontal COTS vendors. |
| End-to-end CPQ replacement (Salesforce / Conga CPQ) | **Reject** | Product-centric pricing model; service-hour assemblies still custom; introduces a second CRM stack; vendor-owned AI not effort/margin-tuned. |
| Single-vendor PSA replacement (Deltek / Kantata / Certinia) | **Reject** | Template-based scoping, not a calibrated AI engine; firm-specific catalog & multipliers still custom; no per-tenant ISO 42001 AIMS evidence; high lock-in. |
| AI pricing optimisation suite (PROS) | **Reject** | Calibrated for transactional B2B, not low-volume professional services; no scoping/approval workflow. |

*All claims reference vendor public capability descriptions and DealPad's existing integration docs (`docs/integrations/api-overview.md`, `server/{dynamics,workday,intapp,conga}.ts`). No pricing or proprietary statistics included.*
