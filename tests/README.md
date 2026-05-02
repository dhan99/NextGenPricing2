# Tests

Vitest is the canonical test runner for NextGenPricing2. This directory was added in Phase 0 (F0.5) along with the calc-parity golden-snapshot scaffold.

## Quick start

```bash
# Run everything once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Coverage report (writes to ./coverage)
npm run test:coverage
```

## Layout

```
tests/
├── calc-parity/           # Golden-snapshot tests for the pricing engine.
│                          # Phase 0 baseline; protect this in every PR.
├── domain/                # Pure unit tests for domain models.
│                          # Populated starting in Phase 1.4 (DDD refactor).
├── integration/           # supertest integration tests; boots the Express app.
├── assembly/              # Assembly expansion engine (Phase 1.2).
├── batch/                 # Batch renewal worker (Phase 1.3).
└── README.md              # This file.
```

## Conventions

- **One file, one concern.** `submit-deal.test.ts`, not `deals.test.ts`.
- **Test names describe behavior, not implementation.** `"rejects submit when margin is below the resolved target"`, not `"calls assertSubmissionAllowed"`.
- **Golden snapshots are committed.** Regenerating a golden is a deliberate act; the PR description must explain the diff.
- **Integration tests use supertest against a real Express app.** Never mock the DB at integration level; use a dedicated test database via `DATABASE_URL_TEST`.
- **Domain tests mock nothing.** If a domain object needs a collaborator, that's a sign the design needs a port + adapter, not a mock.

## Calc-parity golden test

The most important test in this directory. It pins down `recalcPricingFromScope` and `persistDealTotals` against a fixed input set so the refactor can't silently drift the pricing math.

If this test fails on a PR:

1. **First reaction**: assume the PR broke something. Read the diff, look at what changed in `server/services/pricing.ts` (or wherever pricing lives at the time).
2. **Second reaction**: if the pricing change is intentional, regenerate the golden via `npm run test:golden:write`, review the diff against the previous golden, and explain it in the PR description.
3. **Never**: just commit the new golden without reading the diff. That's how regressions ship.

## Adding tests

When you ship a new feature, add at least one test:

| Feature kind        | Minimum test                                           |
|---------------------|--------------------------------------------------------|
| New domain rule     | Unit test for the rule + an integration test that triggers it through the API |
| New API endpoint    | supertest integration test for happy path + auth failure |
| New pricing path    | Extend the calc-parity golden                          |
| New UI component    | (deferred; client-side testing comes in a later phase) |
| New external adapter| Contract test against a recorded fixture               |

Phase 0 is permissive — we have very little coverage today and adding 100% coverage is not the goal. The goal is **don't regress**. Cover the surface area you touch.
