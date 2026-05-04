# Deployment — always-on shared demo

This is the recipe for getting DealPad onto a public URL that your
team can hit from any browser, with no localhost dependency and
no cold-start lag. Total time: **~15 minutes** of clicks (the
parts I can't automate are OAuth and account creation).

## Stack

- **App**: Render web service, Starter plan (~$7/mo, always-warm).
- **DB**: Neon Postgres, Launch plan (~$19/mo) with pgvector.
- **DNS**: optional — Render gives you a free `*.onrender.com` URL.
  Add a custom domain anytime later.

Total monthly: ~$26/mo for production-grade always-on. Free tiers work but introduce cold starts (Render free) and DB compute auto-suspend (Neon free). For "no perf hit" stick with paid.

---

## Step 1 — Provision the database (3 min)

1. Sign up / sign in at <https://neon.tech>.
2. Create a project: name = `dealpad`, region close to your users.
3. Open the **SQL Editor** and run once:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   pgvector is on every Neon project; this enables it for the database.
4. Copy the **connection string** from the Neon dashboard. It looks like:
   ```
   postgres://USER:PASS@ep-xxxxx.us-east-1.aws.neon.tech/dealpad?sslmode=require
   ```
   Save it; you'll paste it into Render in step 2.

> **Why Neon over RDS / Render Postgres**: pgvector is bundled, the free tier is generous, and the connection string works out of the box with the existing `pg` driver in `server/db.ts`.

---

## Step 2 — Deploy the app to Render (8 min)

### Option A — Blueprint (recommended)

1. Sign in at <https://render.com> with GitHub OAuth.
2. Click **New** → **Blueprint** → connect this repo (`dhan99/NextGenPricing2`). Branch: `main`.
3. Render reads `render.yaml` at the repo root and creates the web service.
4. On the service's **Environment** tab, paste the Neon connection string into `DATABASE_URL`.
5. Click **Manual Deploy** → **Deploy latest commit**. First boot takes ~3 min.
6. Once green, hit the public URL printed at the top of the service page.

The Blueprint covers:
- Build command: `npm ci && npm run build`
- Start command: `npx tsx server/index.ts`
- Health check: `/api/dashboard/summary`
- Auto-deploy on every push to `main`
- Production env vars (`NODE_ENV`, `LLM_PROVIDER=simulated`, etc.)

### Option B — Docker (if you want to control the runtime)

The repo ships a `Dockerfile`. On Render → New → Web Service → connect repo → choose `env: docker` instead of `env: node`. Render builds and runs the container.

---

## Step 3 — Verify (2 min)

1. Open the Render URL.
2. Login screen → pick **PDL**.
3. Hit any deal → confirm AI Insights load (proves pgvector is wired).
4. Optional smoke from the cmd line:
   ```bash
   curl -H "x-user-role: pdl" -H "x-user-name: smoke" \
        https://YOUR-APP.onrender.com/api/dashboard/summary
   ```

If the dashboard returns a JSON KPI summary you're done.

---

## Step 4 — Share

The Render URL (`https://YOUR-APP.onrender.com`) is public; anyone with the link can hit it. Render's TLS cert is auto-provisioned. To restrict access to specific people, add an auth proxy (Cloudflare Access, Render's built-in basic auth, or build out the persona system into real OAuth later).

For the test plan doc:
- Make the GitHub repo public (after a secrets sweep), **or**
- Add reviewers as repo collaborators (GitHub → Settings → Collaborators), **or**
- Run `pandoc docs/test-plan.md -o test-plan.pdf` and host the PDF anywhere shareable.

---

## Operational notes

### `pushSchema()` + `seedAll()` run on every boot

This is documented in `docs/audit/REPLIT_COUPLINGS.md` as **Risky** for horizontally-scaled production. The Render Starter plan runs a single instance, so it's safe today. If you ever scale up, gate seeds behind `NODE_ENV !== "production"` (the F0 audit recommends this) and move schema migrations to a one-shot CI step.

### LLM live-mode wiring

Every AI route runs in simulated mode by default. To go live, set the matching env var on the Render service:

| Var | Effect |
|---|---|
| `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | risk-summary, margin-advisor use Claude. The provider SDK is not yet imported — see F4.4.1 follow-up. |
| `INTELLIGENCE_MODE=openai` + `OPENAI_API_KEY` | embeddings via OpenAI. |
| `VOICE_MODE=azure` + Azure Cognitive Services keys | real STT for voice-to-scope. |

Until those flips happen, simulated mode is functional and deterministic — the demo works without keys.

### Rolling back

- App: Render's **Deploys** tab → pick a previous green build → **Rollback to this deploy**.
- DB: Neon's **Branches** → restore from a point-in-time. Neon retains 7 days on Launch.
- Backups: `bash scripts/audit/backup_db.sh <label>` writes a `pg_dump` to `backups/`. Run before any destructive operation.

### Costs at glance

| Service | Tier | Cost | Notes |
|---|---|---|---|
| Render web | Starter | $7/mo | Always-warm, 0.5 CPU, 512MB RAM |
| Render web | Standard | $25/mo | If perf needs more headroom |
| Neon | Free | $0 | Auto-suspend after 5 min idle (cold start ~1s) |
| Neon | Launch | $19/mo | Always-on compute, 10GB storage |
| Render Postgres | Standard | $20/mo | Alternative to Neon; pgvector requires Pro plan |

Recommended for production-grade demo: **Render Starter + Neon Launch = $26/mo**.
