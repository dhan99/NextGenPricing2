# Replit-Specific Couplings

The audit identified that NextGenPricing2 was built on Replit. Every Replit-specific behavior we don't catalog now will surface as a surprise during the AWS deployment workstream. This document is that catalog.

The categorization is:

- **Cosmetic** — drop or rename when convenient; no behavior impact.
- **Coupled** — has runtime impact; requires a deliberate decision when we move off Replit.
- **Risky** — would silently break in a different environment if not addressed.

---

## 1. `.replit` (Coupled)

Defines workflows that boot the backend and frontend in parallel:

```toml
[deployment]
run = ["npx", "tsx", "server/index.ts"]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
```

**Decision when we move to AWS**: replace with a `Dockerfile` + ECS task definition (or Lambda + API Gateway, depending on workload shape). The `npx tsx` direct execution is fine for Replit's autoscale but is **not** how we'd run TypeScript in production — we'd compile to JS at build time and run `node dist/server/index.js`.

---

## 2. `server/index.ts` boots `pushSchema()` + `seedAll()` on every start (Risky)

```js
// server/index.ts start():
//   await pushSchema();
//   await seedAll();
//   app.listen(...);
```

This is documented in `replit.md` and is fine for Replit autoscale because the same instance handles all traffic. **In a horizontally-scaled production environment, every container boot would re-push schema and re-seed**, which is at best wasteful and at worst destructive.

**Decision when we move to AWS**:

- Schema push moves to a one-shot CI/CD step (e.g., a CodeBuild job or a GitHub Action) that runs migrations against the target environment before deploying the new containers.
- `seedAll()` runs only in dev/staging, never in production. Gate it behind `NODE_ENV !== "production"` or remove from the boot path.

The audit's `BACKLOG.md` captures this in the "Out-of-band tasks" section. We should not change this in Phase 0 — touching the boot sequence without a CI/CD replacement is how we break demos.

---

## 3. `vite.config.js` proxy (Coupled)

```js
server: {
  host: '0.0.0.0',
  port: 5000,
  allowedHosts: true,
  proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
}
```

Backend on 3001, frontend on 5000, with Vite proxying `/api`. This is a Replit-friendly setup (Replit exposes both ports and the proxy keeps the SPA dev experience clean).

**Decision when we move to AWS**:

- Production: SPA is served from S3/CloudFront, API is served from API Gateway / ALB. No Vite proxy at runtime.
- Dev: keep this config. Maybe add a `.env`-driven `VITE_API_URL` for cases where the backend runs on a different host.

---

## 4. `@neondatabase/serverless` driver (Coupled)

`package.json` lists both `@neondatabase/serverless` and `pg` (node-postgres). Replit deployments commonly use Neon (a serverless Postgres) which has a different driver shape (HTTP fetch + WebSocket instead of TCP + pg-wire).

**Decision when we move to AWS**:

- AWS RDS (or Aurora) speaks pg-wire. We use `pg`, not `@neondatabase/serverless`.
- Need to confirm `server/db.ts` defaults to `pg`. If it conditionally uses Neon when `DATABASE_URL` looks like a Neon URL, document and make this explicit (env flag rather than URL pattern matching).

---

## 5. `scripts/post-merge.sh` (Cosmetic)

Referenced in `.replit` as a `[postMerge]` hook. Likely runs after a Replit merge to refresh state.

**Decision when we move to AWS**: delete. CI/CD takes its place. Do this when we add `.github/workflows/ci.yml`.

---

## 6. `.agents/agent_assets_metadata.toml` (Cosmetic)

Replit Agent metadata pointing to generated decks/PDFs. Not loaded at runtime.

**Decision**: leave it in the repo as a record of what the Replit Agent generated. Move out of git only when we move the generated artifacts (`exports/*.pptx`, `DealPad_Demo_Driver.pdf`) to a release artifact store.

---

## 7. Replit-style port config (Coupled)

`.replit` declares external ports:

```toml
[[ports]]
localPort = 3001
externalPort = 80
[[ports]]
localPort = 5000
externalPort = 80
```

Both internal ports map to external 80 — Replit handles the routing. No application code depends on this; the implication is just that the Replit URL routes everything correctly through Replit's edge.

**Decision when we move to AWS**: irrelevant — we use ALB / API Gateway. Delete `.replit` at that point.

---

## 8. The `@neondatabase/serverless` driver bundles WebSocket / fetch shims (Cosmetic — DOWNGRADED)

**F0.7 validation finding (2026-05-02):** the original audit flagged this as **Risky** on the assumption that `server/db.ts` might switch drivers based on URL shape. **It does not.** The current 10-line file uses only `pg.Pool` + `drizzle-orm/node-postgres`:

```ts
// server/db.ts (verbatim)
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export { pool };
```

A repo-wide grep for `@neondatabase` returned **no source-code matches** outside `node_modules`. The package is in `package.json` as unused dependency baggage from the Replit template, not a runtime dependency.

**Updated decision when we move to AWS**: drop `@neondatabase/serverless` from `package.json` (`npm uninstall @neondatabase/serverless`). No code changes required because no code imports it. Severity drops from **Risky** to **Cosmetic** in the summary table below.

The audit's original concern about WebSocket / fetch shim runtime requirements does not apply — those shims are only loaded if you `import` the package, and nothing does.

---

## 9. Tailwind v4 (`@tailwindcss/vite`) (Coupled)

Tailwind v4 is the latest, uses a different config approach (`vite` plugin + CSS-first config) compared to v3. This is fine and modern, but:

- Any new UI library we add must be compatible with v4.
- The Tailwind v4 plugin runs at Vite build time. CI must have all peer deps installed (this is automatic via `npm install`, just calling it out).

**Decision**: keep. v4 is the right choice. Note in onboarding docs that v3 muscle memory does not apply here.

---

## 10. React 19 (Coupled)

The repo runs React 19 (released late 2024 / early 2025). Some libraries (especially older Radix versions, or third-party libraries that haven't shipped React 19 support) may print warnings or break.

**Decision**: keep. This is forward-looking, not a problem. Phase 0 should run the smoke test (which boots the frontend) and confirm no console errors. If any library complains, file a ticket but don't downgrade React.

---

## 11. `concurrently` for `npm run dev` (Cosmetic)

```json
"dev": "concurrently \"tsx server/index.ts\" \"vite\""
```

Runs backend and frontend in one terminal. Fine for local dev. Replace with `docker-compose up` or a process manager when we move to AWS-style local-dev (LocalStack + Postgres in containers).

**Decision**: keep until we have a Docker-based dev setup.

---

## Summary table

| # | Coupling                                     | Severity   | Phase to address                   |
|---|----------------------------------------------|------------|------------------------------------|
| 1 | `.replit`                                    | Coupled    | When moving to AWS (post-Phase 1)  |
| 2 | `pushSchema()` + `seedAll()` on every boot   | **Risky**  | Out-of-band, before first prod env |
| 3 | `vite.config.js` proxy                       | Coupled    | Dev keeps; prod replaced           |
| 4 | `@neondatabase/serverless` driver            | Coupled    | When moving to AWS RDS             |
| 5 | `scripts/post-merge.sh`                      | Cosmetic   | When `.github/workflows/ci.yml` lands |
| 6 | `.agents/agent_assets_metadata.toml`         | Cosmetic   | When migrating generated artifacts |
| 7 | Replit external port mapping                 | Coupled    | When moving to AWS                 |
| 8 | Unused `@neondatabase/serverless` dep        | Cosmetic   | Drop in any cleanup PR (was flagged Risky pre-validation; confirmed unused in F0.7) |
| 9 | Tailwind v4 plugin                           | Coupled    | Permanent — keep                   |
| 10| React 19                                     | Coupled    | Permanent — keep                   |
| 11| `concurrently` dev script                    | Cosmetic   | When Docker-based dev lands        |

---

## What this document is not

This is a **catalog**, not an action plan. Item #2 is flagged as risky and **must not be changed in Phase 0** — touching the boot sequence without a tested replacement is exactly the kind of "fix" that breaks demos two days before a stakeholder presentation. (Item #8 was originally flagged risky but F0.7 validation confirmed it's a no-op — see above.)

The action plan lives in `BACKLOG.md`. Couplings are referenced by number from there.
