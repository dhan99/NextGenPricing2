<!--
  Phase 0 PR template. Every PR opened against `develop` or `main` must
  fill this out. If a section doesn't apply, write "n/a" — don't delete it.
-->

## Backlog item

Closes #<issue-id>  <!-- e.g. Closes #F1.1 -->

## What this PR does

<!-- One paragraph. What changes for a user or operator? -->

## Why now

<!-- One sentence. Why is this the right next step? Reference the backlog. -->

## Approach

<!-- 3–5 bullets describing the approach. Mention any deviation from the backlog. -->

## Files touched

<!-- Group by package. Mark (NEW), (EXTEND), (REPLACE). Example:
shared/schema.ts (EXTEND) — add dealEntities table
server/routes.ts (EXTEND) — add /api/deals/:dealId/entities endpoints
client/src/components/entities/EntityTabs.tsx (NEW)
-->

## Backward compatibility

<!--
  REQUIRED. Answer all three:
    1. Does this break any existing API contract?
    2. Does this require a data migration? If yes, link the migration script
       and confirm it ran cleanly against a copy of the seed snapshot.
    3. Does this change the calc-parity invariant?
-->

## How I verified this

- [ ] `npm install` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` passes (including calc-parity golden, if pricing touched)
- [ ] `bash scripts/audit/smoke_test.sh` passes
- [ ] Manually walked the 8-step deal wizard end-to-end (Setup → Summary)
- [ ] If UI: tested in Chrome + Safari at 1280px and 375px
- [ ] If integration touched: confirmed the auto-push event still fires on approval

## Inventories regenerated (if applicable)

- [ ] `docs/audit/api_inventory.csv` regenerated and committed
- [ ] `docs/audit/schema_inventory.csv` regenerated and committed
- [ ] `replit.md` / `PROJECT.md` updated if table or page count changed

## Screenshots / output

<!-- If UI: before + after screenshots. If API: curl + response. -->

## Risks & rollback

<!-- One sentence each:
   - What's the worst-case failure mode if this ships broken?
   - How do I roll it back? (Just revert the merge commit? Or is there state to undo?)
-->

## Reviewer checklist

- [ ] Diff is <500 LOC across non-trivial files (or PR description explains why bigger)
- [ ] No mixing of schema changes with feature changes
- [ ] No mixing of refactor with new behavior
- [ ] CI is green
- [ ] At least one happy-path test added (or existing test extended)
- [ ] Demo-readiness criteria from `docs/refactoring/BRANCHING.md` still hold
