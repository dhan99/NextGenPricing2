# Intapp Intake — Workflow & Integration Intersection Points for DealPad

> Source: [intapp.com/intake](https://www.intapp.com/intake/), Intapp Open / Connect public
> capability descriptions, and DealPad's existing `server/intapp.ts` (Risk & Compliance)
> implementation. No proprietary or non-public material referenced.

## 1. What Intapp Intake actually is (and is not)

Intapp Intake is the **AI-driven new-business intake / client-and-matter onboarding**
product on the Intapp platform. It is the orchestration layer that sits *upstream*
of legal/professional-services delivery and decides:

- whether the firm should accept a prospective client + engagement at all,
- what data must be collected before work starts,
- which approvals (partners, GC, AML, conflicts, independence, pricing) must run, and
- how the resulting decision propagates into downstream systems (matter creation,
  billing, time, document mgmt, walls).

It is distinct from DealPad's existing `server/intapp.ts` integration, which targets
**Intapp Risk & Compliance / Conflicts** — the screening engine. Intapp Intake is the
*workflow shell* around that screening engine. Practically:

| Intapp surface | What it owns | DealPad relationship today |
| --- | --- | --- |
| **Intake** | NBI request lifecycle, form/policy engine, role-based approvals, risk routing | **No direct integration yet** — closest analogue is DealPad's wizard + approval state machine |
| **Conflicts / Risk** | Hit detection, mitigations, walls handoff | **Already integrated** (`intappScreenings`, `intappHits`, `intappMitigations`) |
| **Walls** | Need-to-know / ethical wall enforcement | Out of scope for DealPad pilot |
| **Open / Connect** | Outbound API + webhooks + connector framework | The wire we use to talk to all of the above |

The strategic implication for DealPad: **Intake and DealPad both run a workflow over a
prospective engagement**. They must not duplicate each other; they must hand off cleanly
at well-defined boundaries.

## 2. Intake's canonical workflow stages

Per the public Intake materials, an intake request flows through a stage model that
firms configure but consistently looks like:

1. **Request capture** — partner or BD raises an intake request. Intake's "AI-driven
   intake requests" feature pre-populates fields from email, NDAs, term sheets, RFP
   documents, etc.
2. **Validation & enrichment** — AI surfaces missing/inconsistent data; firmographic
   enrichment (D&B / Pitchbook style) fires.
3. **Risk screening** — conflicts, AML/KYC, sanctions, independence, jurisdictional
   risk all run; Intake routes hits to the right reviewer (GC, ethics, AML officer).
4. **Policy-driven approvals** — dynamic workflow chosen by service line, jurisdiction,
   client risk tier, fee size, special-matter type. Approvers see role-based AI
   summaries (different framing for partner vs. AML vs. pricing committee).
5. **Acceptance & matter opening** — on approval, Intake provisions the matter in the
   firm's system of record (PMS / ERP), creates billing accounts, opens DMS workspaces,
   sets walls, notifies time/billing, and dispatches the engagement letter task.
6. **Continuous monitoring** — post-acceptance, Intake watches for triggering events
   (new conflicts, ownership changes, sanctions list updates) and reopens an
   exception workflow.

DealPad's wizard has six numbered steps culminating in approvals; Intake's workflow
runs in parallel and culminates in matter opening + billing setup. **Acceptance is the
single most important boundary** — it is the moment Intake says "this engagement may
proceed" and downstream systems light up.

## 3. Where DealPad ↔ Intake intersect

The intersection points are deterministic and small in number. Each one is a
two-direction boundary, so I list both directions explicitly.

### 3.1  Pre-wizard: opportunity → intake request

- **Trigger:** PDL clicks "Start scoping" on a Dynamics opportunity that DealPad
  imports.
- **DealPad → Intake:** open or attach to an existing Intake request keyed on the
  Dynamics opportunity ID. Payload: client name, contact, opportunity #, requested
  service line, BU, anticipated start date, PDL.
- **Intake → DealPad:** Intake returns the **Intake Request ID** + current stage
  + risk tier (preliminary). DealPad stores both on the deal so every subsequent
  call is correlated.
- **Why:** prevents a deal from being scoped, priced, and approved in DealPad while
  Intake independently rejects the engagement on conflicts grounds. DealPad can
  visibly mark deals "Intake pending" and disable submission until Intake reaches a
  state that allows scoping (typically post-conflict-clear).

### 3.2  During scoping: AI-extracted scope hints

- **DealPad → Intake (read):** when Intake's AI has already extracted structured fields
  from RFP/NDA/email, DealPad pulls them via a `GET /intake/requests/{id}/extractions`
  call to seed wizard step 2 (engagement details) and step 3 (assumptions). Avoids the
  PDL re-typing data the firm already captured upstream.
- **Intake → DealPad (push):** when Intake updates the request (new contact, revised
  scope statement, jurisdiction change), Intake fires a webhook
  (`request.updated`); DealPad re-pulls and surfaces a "scope drift detected" banner
  on the wizard.

### 3.3  Submission: pricing + scope back to Intake

- **Trigger:** PDL submits the deal for approval inside DealPad.
- **DealPad → Intake:** posts the structured scope + total fee + margin + assumptions
  into the Intake request as a **Pricing & Scope packet**. This is what feeds the
  pricing-committee approver in Intake's workflow.
- **Intake → DealPad:** Intake responds with the calculated approval matrix (which
  Intake-side approvers must clear given the new fee/risk combination). DealPad
  shows that matrix alongside its own SLL/PO/FIN/QRM queue so reviewers see one
  unified picture rather than two parallel approval lists.

### 3.4  Conflicts / risk screening (already partially built)

- **Today:** DealPad calls our local `server/intapp.ts` Risk simulator on Draft →
  Submitted. In a live Intake deployment, Intake **owns the screening trigger** —
  it fires conflicts as part of its own stage model.
- **Live mode change:** DealPad's `autoScreenOnSubmit` setting flips from "fire local
  screening" to "subscribe to Intake's `screening.completed` webhook for this request".
  The DealPad data model (`intappScreenings`, `intappHits`, `intappMitigations`) is
  already shaped to receive Intake's payloads — what changes is the *source of truth*,
  not the schema.

### 3.5  Approval: dual-write the verdict

- **DealPad → Intake:** when DealPad's internal approvers (SLL/PO/FIN/QRM) approve, we
  post the verdict + AI-narrative + signature metadata back to Intake as evidence on
  the corresponding Intake approval task.
- **Intake → DealPad:** when Intake's approvers (GC, AML, ethics) approve, Intake fires
  `approval.completed`; DealPad marks its mirrored task done and unblocks the next
  state transition.
- **Net effect:** neither system "owns" the approval — they federate. DealPad owns
  scope/fee/margin approvals; Intake owns ethics/risk/policy approvals. A deal cannot
  reach "approved" in DealPad until Intake's approvals are also green.

### 3.6  Acceptance → matter opening → engagement letter

- **Trigger:** all DealPad approvals + all Intake approvals are green.
- **Intake → downstream (out of DealPad's hands):** Intake opens the matter in the
  PMS/ERP, sets walls, provisions the billing account.
- **Intake → DealPad:** Intake fires `request.accepted` with the new **Matter ID**.
  DealPad stores it on the deal; this is the canonical ID that:
    - the Conga engagement letter renders into the doc-ref block,
    - the Workday `pushProject()` call uses as `external_matter_id`,
    - downstream change orders quote when re-screening for material scope drift.
- **DealPad → Conga:** the engagement-letter generation flow already exists; Intake's
  acceptance is the gate that unblocks the "Generate Letter" CTA. Conga signs and
  delivers; Conga's `delivered` webhook pushes back into Intake to close the
  "engagement letter" task on the intake request.

### 3.7  Post-acceptance: change orders & continuous monitoring

- **DealPad → Intake:** when a change order materially changes scope, jurisdiction,
  fee tier, or service line, DealPad posts a **scope-change event** to the open
  Intake request. Intake decides whether re-screening / re-approval is required and
  responds with either "no action" or "reopen approval — these reviewers required".
- **Intake → DealPad:** Intake's continuous monitoring (sanctions delta, conflicts
  delta, beneficial-ownership change) fires a webhook against the matter; DealPad
  raises an alert on the deal and optionally locks change orders until cleared.

## 4. The wire: how the integration actually moves

Intapp's public posture is that all of the above runs over **Intapp Open** (the API
surface) and **Intapp Connect** (the connector framework / webhooks / enterprise
event bus). The shape we need to support is:

- **REST + JSON, OAuth2 client-credentials.** A secret per environment (dev /
  pilot / prod), already a pattern we use for Dynamics/Conga.
- **Webhooks for state transitions.** Subscribe at integration-startup; verify
  signatures; queue handlers (we already have an `activity_log`-backed event audit
  pattern that fits).
- **Idempotency keys.** Intake operations are gated by request ID; we should pass
  our own deal ID as the idempotency key so retries don't double-create requests.
- **Pagination + delta sync.** For backfill of pre-existing intake requests when
  DealPad turns on, support `?updatedSince=` cursor.
- **Schema parity, not schema replacement.** DealPad keeps its own deal/scope
  model; Intake's IDs and stage strings are stored as foreign correlation keys on
  the deal record (`intakeRequestId`, `intakeStage`, `intakeMatterId`). We do not
  replicate Intake's full data model.

In line with our existing simulated → live pattern (`server/intapp.ts`,
`server/conga.ts`), the right move is a `server/intappIntake.ts` provider with two
implementations behind one interface:

```ts
interface IntakeProvider {
  mode: "simulated" | "live";
  openRequest(d: Deal): Promise<{ requestId: string; stage: string; riskTier: string }>;
  getRequest(id: string): Promise<IntakeRequestSnapshot>;
  postPricingPacket(id: string, packet: PricingPacket): Promise<ApprovalMatrix>;
  postScopeChange(id: string, change: ScopeChange): Promise<{ requiresReapproval: boolean }>;
  postApprovalEvidence(id: string, evidence: ApprovalEvidence): Promise<void>;
  // webhooks land at /api/integrations/intake/webhook and dispatch to handlers.
}
```

The simulated implementation is what the pilot ships with and what `seedAll()` keeps
deterministic; the live implementation is one secret + one config flag away.

## 5. Quick map: DealPad lifecycle stage → Intake interaction

| DealPad stage | DealPad → Intake | Intake → DealPad |
| --- | --- | --- |
| Opportunity imported | open/attach request | requestId + preliminary risk tier |
| Wizard step 1–3 | (read) pull AI extractions | webhook `request.updated` on drift |
| Wizard step 4–6 | post pricing/scope packet on submit | approval matrix |
| Submitted → in-review | post evidence as DealPad approvers act | webhook `approval.completed` for Intake-side approvers |
| Approved | mark deal ready for matter open | webhook `request.accepted` w/ matterId |
| Letter generated | (no Intake call — Conga handles) | Conga delivery webhook closes Intake task |
| Change order saved | post scope-change event | requiresReapproval verdict |
| Live engagement | (none) | continuous-monitoring webhook on conflict/sanctions delta |

## 6. Net assessment for the pilot

- **Intake is genuinely a workflow peer**, not a data source. Treating it as a
  passive "system we POST to on approval" misses the point — it has its own
  approvers, policies, and lifecycle. The right model is federated approvals with
  explicit handshake events.
- **The Intapp-side integration we already have (Risk/Conflicts) is a subset.**
  Once Intake is in front, the screening trigger moves into Intake; our local
  schema becomes a mirror, not a source.
- **Two correlation IDs do all the work:** `intakeRequestId` (created at scoping
  start) and `intakeMatterId` (assigned at acceptance). Keep both on the deal
  record and every downstream system can be wired to either, without DealPad
  needing to know how Intake routed the workflow internally.
- **Provider pattern stays.** `server/intappIntake.ts` (simulated → live) lets the
  pilot run end-to-end before any live Intapp tenant is available, and the cutover
  to live is a config + secret change rather than a refactor — the same playbook
  we use for Dynamics, Workday, Intapp Risk, and Conga.
