# Autonomous Agent — Sequence Diagram

End-to-end execution of the one-click "Autonomous Agent" flow that drafts a complete DealPad deal from a Dynamics 365 opportunity.

```mermaid
sequenceDiagram
    autonumber
    actor Reviewer as Reviewer (PDL)
    participant UI as DynamicsCRM Page
    participant API as DealPad API
    participant DB as PostgreSQL
    participant D365 as Dynamics 365
    participant Catalog as Scope Catalog<br/>+ Templates
    participant Prompts as Prompt Engine
    participant Pricing as Pricing Engine
    participant AI as Risk Narrative<br/>(UC-5)
    participant Intapp as Intapp Risk
    participant Workday as Workday

    Reviewer->>UI: Click "Autonomous Agent" on opportunity row
    UI->>API: POST /api/dynamics/opportunities/:id/agent-draft
    API->>DB: SELECT opportunity (validate stage = Develop/Propose, not linked)
    API->>DB: Resolve client (account → client, or auto-create stub)

    Note over API,Catalog: 1. Setup
    API->>Catalog: pickTemplateForName(opp.name)
    Catalog-->>API: businessUnit, serviceLine, complexity
    API->>DB: INSERT deal (status=pendingReviewAgent, currentStep=7)
    API->>DB: log activity: agent_setup
    API->>D365: linkDealToOpportunity (write back dealpadDealId)

    Note over API,Prompts: 2. Prompts (context-aware)
    API->>DB: createDefaultPrompts(dealId)
    API->>DB: load promptSetItems / STANDARD_PROMPTS options
    API->>Prompts: pickContextualAnswer(prompt, opp + client context)
    Prompts-->>API: answer, multiplier, confidence, needsReview, rationale
    API->>DB: UPDATE prompt_responses (per prompt)
    API->>DB: log activity: agent_prompts (per-prompt detail)

    Note over API,Catalog: 3. Scope items
    API->>Catalog: select template + service-line + BU keyword matches
    Catalog-->>API: 4–8 catalog items
    API->>DB: INSERT deal_scope_items
    API->>DB: log activity: agent_scope

    Note over API,Pricing: 4. Pricing
    API->>Pricing: seed pricing lines for active rate card
    API->>Pricing: recalc totals (fee, cost, hours, margin)
    Pricing-->>API: totals
    API->>DB: UPDATE deal totals + INSERT pricing_lines
    API->>DB: log activity: agent_pricing

    Note over API,Pricing: 5. Scenarios
    API->>Pricing: build 3 scenarios (conservative, standard, aggressive)
    API->>DB: INSERT scenarios + select recommended
    API->>DB: log activity: agent_scenarios

    Note over API,AI: 6. Risk narrative
    API->>AI: synthesize risk summary (margin + complexity + screening hints)
    AI-->>API: narrative + risk score + approval likelihood
    API->>DB: log activity: agent_risk

    Note over API,Workday: 7. Review checklist (gates preview)
    API->>Intapp: dry-run screening
    Intapp-->>API: hits, mitigations
    API->>Workday: dry-run validation
    Workday-->>API: findings, headroom
    API->>DB: log activity: agent_review (intapp + workday + margin)

    API-->>UI: 201 Created { dealId, dealNumber, agentRun: [...steps] }
    UI->>UI: window.location.href = /deals/:dealId

    Note over Reviewer,UI: Reviewer lands on Summary
    Reviewer->>UI: One of three actions
    alt Approve & Submit
        UI->>API: POST /api/deals/:id/agent-approve
        API->>Intapp: assertSubmissionAllowed (real screening gate)
        API->>Workday: validate (real validation gate)
        API->>DB: INSERT approval, UPDATE status=submitted
    else Open in Wizard
        UI->>API: POST /api/deals/:id/agent-open-wizard
        API->>DB: snapshot original draft to activity_log
        API->>DB: UPDATE currentStep=1
        Note over Reviewer: Reviewer edits, then clicks Resubmit
        UI->>API: POST /api/deals/:id/agent-resubmit
        API->>Pricing: recompute totals
        API->>AI: refresh risk narrative
        API->>DB: UPDATE currentStep=7, log agent_resubmit
    else Discard Draft
        UI->>API: POST /api/deals/:id/agent-discard
        API->>D365: unlinkOpportunity (free it for re-scoping)
        API->>DB: UPDATE deal archived=true
    end
```

## Notes

- **Pipeline is sequential and synchronous** — the user sees a progress modal, then is redirected. No background jobs.
- **Each step writes one `activity_log` row** with `metadata.agentRun = { step, label, summary, output, confidence, needsReview, ts }` — that's what powers the "Agent Run Details" panel on the deal page.
- **Failure isolation**: a failure in any step rolls the deal back to discardable state. The reviewer can always discard or open in wizard.
- **Same approval gates as the wizard**: Intapp and Workday gates are enforced at agent-approve, never bypassed.

---

# Manual Wizard Flow — Sequence Diagram

For comparison: same opportunity, walked through DealPad by hand. Same bounded contexts, same approval gates, but the reviewer is the orchestrator instead of the agent.

```mermaid
sequenceDiagram
    autonumber
    actor Reviewer as Reviewer (PDL)
    participant UI as DealPad Wizard
    participant API as DealPad API
    participant DB as PostgreSQL
    participant Engines as Catalog · Pricing · AI
    participant Ext as D365 · Intapp · Workday

    Reviewer->>UI: Click "Import to DealPad" on opportunity
    UI->>API: POST /api/dynamics/opportunities/:id/import
    API->>DB: Resolve client (or auto-create)
    API->>DB: INSERT deal (status=draft, currentStep=1)
    API->>Ext: linkDealToOpportunity → write back dealpadDealId
    API-->>UI: 201 Created { dealId }
    UI->>Reviewer: Redirect to /deals/:dealId (Wizard step 1)

    Note over Reviewer,DB: Step 1 — Setup
    Reviewer->>UI: Pick BU · service line · complexity · dates · PDL
    UI->>API: PATCH /api/deals/:id (header)
    API->>DB: UPDATE deal · log activity
    Reviewer->>UI: Next → Scope

    Note over Reviewer,DB: Step 2 — Scope
    UI->>API: GET /api/scope-catalog · /api/scope-templates
    API->>DB: SELECT catalog rows
    Reviewer->>UI: Browse · add items · apply template
    UI->>API: POST /api/deals/:id/scope-items
    API->>DB: INSERT deal_scope_items · log activity

    Note over Reviewer,DB: Step 3 — Prompts
    UI->>API: GET /api/deals/:id/prompts
    Reviewer->>UI: Answer each contextual prompt
    UI->>API: PATCH /api/deals/:id/prompts/:id (per answer)
    API->>DB: UPDATE prompt_responses · log activity

    Note over Reviewer,DB: Step 4 — Pricing
    UI->>API: GET /api/rate-cards · /api/deals/:id/pricing
    Reviewer->>UI: Add / edit pricing lines
    UI->>API: POST or PATCH /api/deals/:id/pricing
    API->>Engines: recalc fee · cost · hours · margin
    Engines-->>API: totals
    API->>DB: UPDATE deal totals + pricing_lines

    Note over Reviewer,Engines: Step 5 — Scenarios (assisted UC-4)
    Reviewer->>UI: Click "Generate Scenarios"
    UI->>API: POST /api/ai/scenario-recommendation
    API->>Engines: build 3 scenarios
    Engines-->>API: scenarios
    Reviewer->>UI: Pick recommended
    UI->>API: POST /api/deals/:id/scenarios/:id/select
    API->>DB: INSERT scenarios · UPDATE selected

    Note over Reviewer,Engines: Step 6 — Risk review (assisted UC-5)
    Reviewer->>UI: Open Risk panel · "Generate Summary"
    UI->>API: POST /api/ai/risk-summary
    API->>Engines: synthesize narrative + risk score
    Engines-->>API: narrative · approval likelihood
    API->>DB: log activity

    Note over Reviewer,Ext: Step 7 — Summary & Submit
    Reviewer->>UI: Review totals · click "Submit for Approval"
    UI->>API: PATCH /api/deals/:id (status=submitted)
    API->>Ext: Intapp gate: assertSubmissionAllowed
    Ext-->>API: screening result
    API->>Ext: Workday gate: validate cost-center + headroom
    Ext-->>API: validation findings
    API->>DB: INSERT approval (pending)
    API-->>UI: 200 OK · status=submitted
    UI->>Reviewer: "Submitted for approval" banner
```

## Comparison

| Dimension | Autonomous Agent | Manual Wizard |
|---|---|---|
| Reviewer touches | 1 click + final approve | ~30+ clicks across 7 wizard steps |
| Time to Summary | ~3–8 seconds (synchronous) | ~15–25 minutes |
| Where decisions are made | Engine + per-prompt context inference | Reviewer types every answer |
| Confidence signals | Per-step + per-prompt confidence + needsReview flags | None — reviewer is the only signal |
| Approval gates | Same Intapp + Workday gates (at agent-approve) | Same Intapp + Workday gates (at submit) |
| Audit trail | Per-step activity_log with structured agentRun metadata | Per-action activity_log entries |
| Reviewer override | Approve · Open in Wizard · Discard | Edit any step before submit |
