# Replit Project Rigor Playbook

> A portable spec for getting senior-engineer-grade work out of any Replit project — new or existing.
> Paste this entire document into a fresh project (or hand it to the agent in an existing one) as the
> "house rules" the agent must follow. It encodes the documentation, architecture, RBAC, integration,
> seeding, UX, and review discipline that we apply on the DealPad project.

---

## 0. How to use this document

1. **Drop it into the project root** (filename suggestion: `RIGOR.md` or `PROJECT_RIGOR.md`).
2. **Tell the agent on the first message:** *"Treat `RIGOR.md` as binding house rules. Read it
   before any non-trivial change. If a section conflicts with my request, surface the conflict
   before acting."*
3. **Customize the placeholders** marked `<<...>>` in Sections 2 and 9 (project name, brand
   colors, personas, tech stack). Everything else is intended to be reused verbatim.
4. For an **existing project**, ask the agent to do a one-time backfill pass: produce
   `replit.md` and the architecture document per Sections 2 and 3, then audit the codebase
   against Sections 5–11 and file follow-up tasks for the gaps.

---

## 1. Operating principles (non-negotiable)

These are the principles every other section is built on. If the agent ever has to choose between
shipping fast and following these, it stops and asks.

1. **No silent fallbacks.** When something fails — a missing env var, a forbidden role, an upstream
   API error — the system fails loudly with a structured, machine-readable error code (e.g.
   `reviewer_role_forbidden`) and a human-readable hint. Never swallow errors into a default value.
2. **Real data over mocked data.** Seed realistic sample data (Section 7). Placeholder strings like
   `"foo"` or `Lorem ipsum` are forbidden in any flow the user can see.
3. **One source of truth per concept.** Permissions live in one map. Status labels live in one
   helper. Brand tokens live in one CSS file. Duplicating a concept in two places is a bug.
4. **Defense in depth.** Authorization, validation, and idempotency must each be enforced at more
   than one layer (route + handler + DB constraint where possible).
5. **Document the *why*, not the *what*.** Inline comments explain non-obvious decisions, trade-offs,
   and the alternative that was rejected. Code already shows the *what*.
6. **Keep `replit.md` current.** Any architectural change, new dependency, new route, new table, or
   new integration updates `replit.md` in the same change set. Stale docs are worse than no docs.
7. **Definition of done includes validation.** The agent restarts the workflow, exercises the path,
   and reads logs before claiming a task is complete. "It compiles" is not done.
8. **Persona-aware UX.** Every UI decision is considered against every persona that can reach the
   screen. Default sorts, visible columns, empty states, and error copy are tuned per role.
9. **Brand discipline.** No emojis in product UI. Colors, fonts, and component shapes come from the
   design tokens, never ad hoc.
10. **Smallest viable change.** Do what was asked; nothing more, nothing less. Refactors are
    proposed as separate tasks, not smuggled in.

---

## 2. `replit.md` — the project's living index

Every project has a `replit.md` at the root. It is the first file the agent reads on every session.
It is short, dense, and accurate. Use this skeleton verbatim and keep it under ~150 lines.

```markdown
# <<Project Name>> — <<one-line tagline>>

## Overview
<<2–4 sentences. What does this product do, for whom, and what does it replace or improve?>>

## Current State
- **Phase**: <<Discovery / PoC / Pilot / GA>>
- **Active Features**: <<comma-separated list of shipped features>>
- **In Progress**: <<what is actively being built right now>>
- **Auth**: <<auth model in one sentence>>

## Architecture
- **Frontend**: <<framework + version + key libs>> (`<<path>>`)
- **Backend**: <<framework + runtime>> (`<<path>>`)
- **Database**: <<engine + ORM>> (`<<schema path>>`)
- **Styling**: <<system + brand color hex>>

## Project Structure
```
<<tree of top 2–3 levels with one-line purpose per directory>>
```

## Key Routes
<<bulleted list of every user-facing URL with one-line purpose>>

## API Endpoints
<<bulleted list grouped by resource: METHOD /path — purpose>>

## Database Tables
<<comma-separated list of table names, in dependency order>>

## Integrations
<<one bullet per third-party system. For each: file path, inbound behavior, outbound
behavior, idempotency mechanism, and any auto-trigger conditions.>>

## Workflows
<<one bullet per long-running process: name, command, port, what it serves>>

## Design References
- UX inspiration: <<sites or systems being matched>>
- Brand: <<colors, fonts, voice rules>>
- <<any cross-cutting UI rules, e.g. "No emojis in UI">>

## Key Documents
<<paths to architecture doc, requirements PDFs, user stories, etc.>>

## Production Setup
<<deployment command, required env vars, seeding/migration order, admin endpoints>>
```

**Maintenance rule:** any PR/change that adds a route, table, integration, env var, or workflow
must update the corresponding section in the same change. The agent should refuse to mark a task
done if `replit.md` would be left stale.

---

## 3. The Architecture Document

`replit.md` is the index. The architecture document is the long-form companion. Create it at the
root as `<<ProjectName>>_Architecture_Document.md`. Target ~1,000–2,000 lines for any non-trivial
project. It is the artifact that an incoming engineer reads on day one.

**Required chapters (use these section numbers verbatim so projects feel familiar):**

```
1.  Executive Summary
2.  Project Vision & Problem Statement
3.  High-Level System Architecture        (with a Mermaid diagram)
4.  Domain-Driven Design / Bounded Contexts
5.  Data Architecture                     (ER diagram + table-by-table notes)
6.  Services Layer                        (AI services, business services, etc.)
7.  Authorization & Access Control
8.  Frontend Architecture                 (component tree, state, routing)
9.  Backend Architecture                  (request lifecycle, middleware order)
10. API Design                            (conventions, error shape, versioning)
11. Workflow / State Machines             (one diagram per non-trivial lifecycle)
12. Pricing / Calculation Engine          (or analogous core domain logic)
13. Target Cloud Architecture             (where this lives in production)
14. External Integrations                 (one subsection per integration)
15. Observability & Monitoring
16. Security Architecture
17. Deployment Architecture
18. Architectural Decision Records (ADRs) (see template below)
19. Future Roadmap
Appendix A: Technology Stack Summary
Appendix B: File Structure
```

**Diagrams:** use Mermaid fenced blocks. Aim for one diagram per chapter that has structure to
show. Render them locally with the Mermaid VS Code preview before committing.

**ADR template (use one block per decision):**

```markdown
### ADR-NNN: <<Decision title>>

**Status:** Accepted | Superseded by ADR-XXX | Deprecated
**Date:** YYYY-MM-DD
**Context:** What forced the decision? What constraints were in play?
**Decision:** What did we choose?
**Alternatives considered:** Bullet each rejected option with one-line rationale.
**Consequences:** Positive and negative. What does this make easier? What does it lock us into?
```

ADRs are append-only. When a decision is reversed, add a new ADR that supersedes the old one and
flip the old one's status — never edit history.

---

## 4. Authorization: defense in depth

Two enforcement layers, one source of truth.

### 4.1 The single source of truth

A single map (or table) describes who can do what. Example shape:

```ts
// server/rbac.ts
export const PERMISSIONS = {
  viewDeals:       ["pdl", "sll", "po", "fin", "qrm", "it"],
  editDeals:       ["pdl", "sll"],
  approveDeals:    ["fin", "qrm"],
  viewRiskSummary: ["sll", "fin", "qrm"],
  // ...
} as const;
```

Domain-specific role maps (e.g. "which reviewer roles can act on which approval type") live in
their own constants next to the handler that consumes them, with a comment pointing back to
`PERMISSIONS`.

### 4.2 Two enforcement layers

**Layer 1 — route guard:** broad, coarse permission. Rejects anyone who has no business hitting
the endpoint at all. Returns `401`/`403` with code `permission_denied`.

**Layer 2 — handler guard:** fine-grained role + resource check inside the handler. Knows about
the specific row being acted on and any contextual rules (ownership, status, federated reviewer
mapping). Returns `403` with a *specific* code (e.g. `reviewer_role_forbidden`) and a hint the
frontend can display.

```ts
app.post(
  "/api/approvals/:id/decide",
  requirePerm("viewRiskSummary"),                // layer 1: coarse
  async (req, res) => {
    const userId = requireRoles(req, res, ["qrm", "sll", "pdl", "fin"]);
    if (!userId) return;                         // requireRoles already responded
    const appr = await db.approvals.findById(req.params.id);
    const allowed = REVIEWER_ROLE_MAP[appr.reviewerRole] ?? ["qrm"];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        code: "reviewer_role_forbidden",
        hint: `This decision is restricted to: ${allowed.join(", ")}.`,
      });
    }
    // ... act
  },
);
```

**Why both layers?** Layer 1 stops scanning attacks and accidental exposure. Layer 2 enforces the
business rule that depends on the row. Removing either layer is a security regression and must be
called out in a PR description.

### 4.3 Frontend RBAC

The frontend asks `hasPermission("editDeals")` before rendering buttons, but this is *cosmetic
only* — the backend is the enforcement boundary. The frontend also surfaces backend error codes
verbatim with friendly copy (see Section 8.4).

---

## 5. Integration pattern (bi-directional, idempotent)

Every external system follows the same shape. This makes new integrations boring to add and audit.

**Required pieces per integration (one file, e.g. `server/<vendor>.ts`):**

1. **Inbound sync** — pull or webhook receiver; upserts external records into our DB.
2. **Outbound push** — a `pushXxx()` function that sends our state to the vendor.
3. **Auto-trigger** — an `autoPushXxx()` wrapper that fires on specific domain events
   (e.g. final approval transitions). Wired into the route handler that mutates state.
4. **Idempotency guard** — before pushing, check `activity_log` (or equivalent) for an event
   marker. If found, no-op. After successful push, write the marker. This prevents duplicate
   writes when handlers retry or are re-invoked.
5. **Manual override route** — `POST /api/<vendor>/<resource>/:id/push` for ops to re-push from
   the admin UI without rerunning the original action.
6. **Seed step** — registered in `seedAll()` (Section 7); failures are logged but non-fatal.

**Example skeleton:**

```ts
// server/workday.ts
export async function pushProject(deal: Deal) { /* call vendor API */ }

export async function autoPushWorkdayProject(dealId: number) {
  const marker = `workday.project.created:${dealId}`;
  if (await activityLog.has(marker)) return { skipped: "already_pushed" };
  const result = await pushProject(await db.deals.findById(dealId));
  await activityLog.write(marker, result);
  return result;
}

export function registerWorkdayRoutes(app: Express) {
  app.post(
    "/api/workday/deals/:id/push",
    requirePerm("approveDeals"),
    async (req, res) => res.json(await autoPushWorkdayProject(+req.params.id)),
  );
}
```

The auto-push call site in the domain handler:

```ts
if (newStatus === "approved" || newStatus === "rejected") {
  // Fire-and-record; failure should NOT roll back the user's approval.
  autoPushWorkdayProject(deal.id).catch(err =>
    log.warn({ err, dealId: deal.id }, "workday auto-push failed"));
}
```

**Document each integration in `replit.md` § Integrations** with: file path, inbound trigger,
outbound trigger, idempotency marker, manual override route.

---

## 6. Database & migrations

1. **One schema file** (e.g. `shared/schema.ts`) that owns table definitions and relations. No
   ad-hoc table creation in handlers.
2. **`npm run db:push --force`** is the only way schema reaches the database. Never hand-write
   `ALTER TABLE`. Never change a primary key column type — that's a data-destroying operation.
3. **ID types are immutable.** If a table started with `serial`, it stays `serial`. If it started
   with `varchar` UUID, it stays that.
4. **Soft delete by default** for any user-visible entity. Add `archivedAt timestamp` and filter
   it out everywhere by default; expose an "Archived" view rather than hard-deleting.
5. **Updated/created timestamps on every table** (`createdAt`, `updatedAt`). Default `now()`.
   Update `updatedAt` on any mutation. The frontend leans on these (Section 8.5).
6. **Foreign keys, not orphan ints.** Every cross-table reference declares its FK and `onDelete`
   policy explicitly.
7. **Indexes for any column used in a `WHERE` or `ORDER BY` of a list endpoint.** Add them at the
   same time as the query.

---

## 7. Production seeding & startup

Seeding is part of startup, not a separate ritual. The pattern:

```ts
// server/index.ts
async function start() {
  await pushSchema();          // step 1: schema is current
  await seedAll();             // step 2: data is seeded
  app.listen(PORT, () => log.info({ PORT }, "ready"));
}
```

`seedAll()` lives in `server/seed.ts` and orchestrates everything in dependency order:

```ts
export async function seedAll() {
  // Core seeds: failure aborts startup (process.exit(1))
  await seedDatabase();        // reference data, default rate cards, lookup tables
  await seedDefaultPromptSet();
  await loadSnapshots();

  // Integration seeds: failure is logged, non-fatal
  for (const [name, fn] of [
    ["dynamics", seedDynamics],
    ["intapp",   seedIntapp],
    ["workday",  seedWorkday],
  ] as const) {
    try { await fn(); }
    catch (err) { log.error({ err, name }, "integration seed failed"); }
  }
}
```

**Admin reseed endpoint** for ops to re-run seeding without a redeploy:

```ts
app.post("/api/admin/reseed", async (req, res) => {
  const token = process.env.ADMIN_RESEED_TOKEN;
  if (!token) return res.status(503).json({ code: "reseed_disabled" });
  const provided = req.headers["x-admin-token"] ?? req.body?.token;
  if (provided !== token) return res.status(401).json({ code: "bad_token" });
  const results = await runSeedsWithStatus();
  const allOk = results.every(r => r.ok);
  res.status(allOk ? 200 : 207).json({ results });
});
```

**Rules:** never call seed functions from `register*Routes()` (fire-and-forget seeds at request
time race with startup). All seeding flows through `seedAll`. Document the env var in `replit.md`.

---

## 8. UX rigor

### 8.1 Persona-aware defaults

For every list, every dashboard, every form, write down:

- Who reaches this screen? (list every persona)
- What does each persona want first? (the default sort / filter / collapsed-vs-expanded state)
- What does each persona never need to see? (hide it behind a toggle, don't dim it out)

Encode the answer in code with a comment that names the personas:

```ts
// Reviewers (sll/fin/qrm) want freshness; builders (pdl/po) want pipeline value.
const defaultSort = REVIEWER_ROLES.includes(persona.role)
  ? { key: "updatedAt", dir: "desc" }
  : { key: "totalFee", dir: "desc" };
```

### 8.2 Tables: shared sort & header components

Every sortable table uses one shared hook + one shared header component (e.g. `useTableSort` +
`SortableTH`). Numeric columns default to descending on first click; text columns to ascending.
Active sort is rendered with a filled chevron and an `aria-sort` attribute. Hover the header for a
tooltip describing what the sort key means if it's not obvious.

### 8.3 Mobile parity

Every desktop table has a card view for `< md` breakpoints. The card surfaces the same fields the
table prioritizes — including any new column added to the table. Adding a column to the table
without updating the card view is incomplete.

### 8.4 Errors are surfaced, not swallowed

API errors render as inline banners (or toast for transient ones) with:

- The human-readable hint from the backend (`error.hint`).
- A "Retry" affordance where the action is idempotent.
- Where relevant, an actionable suggestion (e.g. "Switch persona to QRM to take this action").

```tsx
{mutation.isError && (
  <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
    <p className="font-medium text-red-900">{mutation.error.hint ?? "Something went wrong."}</p>
    {mutation.error.code === "reviewer_role_forbidden" && (
      <p className="text-red-700 mt-1">Switch your persona to a permitted reviewer role.</p>
    )}
    <button onClick={() => mutation.reset()} className="mt-2 text-red-900 underline">
      Dismiss
    </button>
  </div>
)}
```

### 8.5 Freshness signals everywhere

Lists, dashboards, and detail pages show *when* data was last updated, not just *what* it is.
Use a relative-time helper (`formatRelativeTime(ts)`) and put the absolute timestamp in a
`title=` for hover. Default sort for any list a reviewer touches is `updatedAt desc`.

### 8.6 Non-blocking polling for background state

Status that can change underneath the user (background screening, pending sync) is shown with a
small pill that polls every 5–10 seconds. The pill never blocks the page; it links to the detail
view where the user can act. Polling stops when the tab is hidden.

### 8.7 Brand discipline

- **Colors and fonts come from design tokens** in one CSS file. Never hex-coded inline.
- **No emojis** in product UI. They are reserved for incidental developer-facing surfaces only.
- **Component shapes are specified down to the className.** When a "trust chip" or "status badge"
  is defined, lock its shape (rounding, padding, font size) in a documented utility class so every
  instance matches.
- **Voice:** plain, direct, professional. Match the tone of the inspiration sites listed in
  `replit.md` § Design References.

---

## 9. Code quality conventions

These keep the codebase legible after months of accretion.

1. **File size cap:** prefer < 400 lines per component file. Past that, factor children out.
2. **No prop drilling past 2 levels.** Lift to a context or a shared hook.
3. **Hooks own their data.** A list page asks `useDeals()` — it does not know which endpoint that
   hits or how the result is cached.
4. **Inline `// why` comments** on:
   - Any conditional whose branches aren't obviously different in purpose.
   - Any API choice that intentionally diverged from the obvious one.
   - Any RBAC layer (link to the central PERMISSIONS map by name).
   - Any auto-trigger in an integration handler (what event, why now, what idempotency marker).
5. **Imports are grouped:** stdlib / third-party / local, blank line between groups.
6. **Booleans are positive** (`isOpen`, not `isNotClosed`). Negations live at the call site.
7. **No `any` in new code** without a comment explaining why and a `// TODO: type this` follow-up.
8. **Errors carry codes**, not just messages. Frontend branches on `code`, displays `hint`.
9. **Commit messages describe the change in one line** + bullet list of *why*. Never just
   "update X". The commit log is part of the architecture document.

---

## 10. Workflow & environment hygiene

1. **Every long-running process is a workflow** with a stable name, command, and port. Documented
   in `replit.md` § Workflows.
2. **Restart the workflow after a code or package change.** "It compiles" is not "it runs."
3. **Environment variables and secrets are managed via the platform's secrets tool**, never
   committed to git, never logged. Document each one in `replit.md` § Production Setup with: name,
   purpose, required-vs-optional, default behavior if absent.
4. **Before asking the user for an API key, check whether the platform offers a managed
   integration for that service.** Use the integration if it exists.
5. **The dev preview URL is proxied** — the app must not assume `localhost`. Use relative URLs in
   client code; use the public dev domain in shell scripts.
6. **No hot-reload bypass tricks in production.** Cache-disable headers and host-allow-all rules
   are gated on `NODE_ENV !== "production"`.

---

## 11. Definition of Done (the agent runs this checklist)

A task is not complete until every box is true. The agent must self-check before declaring done.

- [ ] The change satisfies the literal user request — nothing more, nothing less.
- [ ] `replit.md` reflects any new route, table, env var, integration, or workflow.
- [ ] The architecture document has a new ADR if a non-trivial decision was made.
- [ ] Both RBAC layers updated together (Section 4) if permissions changed.
- [ ] If an integration was touched, idempotency marker and `seedAll` registration verified.
- [ ] Frontend table change → mobile card view updated to match.
- [ ] Error paths return structured `{code, hint}` and the UI surfaces them.
- [ ] No silent fallback, no mocked placeholder data, no console emoji, no inline hex colors.
- [ ] Workflows restarted; logs read for errors; one happy-path flow exercised end-to-end.
- [ ] Inline `// why` comments added at any non-obvious decision point.
- [ ] Commit message describes the change + the *why*.

---

## 12. Process for an existing project (one-time backfill)

When dropping this playbook into a project that already has code:

1. **Inventory pass.** Agent runs a read-only sweep and produces a draft `replit.md` from what
   exists today. No edits yet.
2. **Architecture doc pass.** Agent generates the architecture document skeleton (Section 3) and
   fills in chapters 1–10 from the codebase. Chapters 11–17 are filled as those areas are touched.
3. **Audit pass.** Agent compares the codebase against Sections 4–10 and files one follow-up task
   per gap (e.g. "Approval routes have route-level guard but no in-handler RBAC"). Tasks are
   surfaced to the user — not silently fixed.
4. **Adopt-on-touch rule.** From this point forward, any file the agent edits must also be brought
   into compliance with Sections 4–10 for the parts it touches. No big-bang rewrites.

---

## 13. What "good" looks like (concrete examples to imitate)

- A list page whose default sort is the column the dominant persona for that page actually cares
  about, with a comment naming the personas.
- An approval endpoint that returns `403 {code: "reviewer_role_forbidden", hint: "..."}` and a UI
  banner that suggests switching persona.
- An integration file with `pushX`, `autoPushX`, an idempotency check against `activity_log`, a
  manual `POST /api/<vendor>/.../push` route, and a registration in `seedAll`.
- A dashboard column showing `formatRelativeTime(updatedAt)` with the full timestamp on hover, and
  the table sorted by it for reviewer personas.
- A new architectural choice that lands as ADR-NNN with status, context, decision, alternatives,
  and consequences — visible in the architecture document at commit time.
- A `replit.md` that, read top to bottom in two minutes, gives a new engineer enough to navigate
  the project unaided.

---

*End of playbook. Treat it as the floor, not the ceiling.*
