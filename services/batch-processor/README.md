# services/batch-processor — Batch renewal worker

Python + Celery + Redis worker that scales `runBatchRenewalJob` from
synchronous in-process TS (slices 1–4) to parallel out-of-process
execution. The TS orchestrator's per-item work (clone source deal,
apply adjustment effects, compute variance) is **delegated to a
private API callback** rather than re-implemented in Python — that
way the cloning logic, F0.5 pricing engine, F1.1 entity backfill,
and F1.2 assembly expansion all stay single-source-of-truth in TS.

## When to deploy this

The synchronous TS path in `server/services/BatchRenewalService.ts`
hits BACKLOG.md F1.3's done-when target locally:

> 100-deal batch completes in <10 minutes locally

For production-scale tax-season batches (1,000+ deals) you want
parallelism + retry. That's what this worker provides.

## Architecture

```
┌─ Pricing Ops UI ─┐    ┌─ Express API ────────────┐
│                  │───►│ POST /batch-renewals/    │
│ BatchRenewals.tsx │    │   :id/start              │
└──────────────────┘    └────────┬─────────────────┘
                                 │ enqueue (BATCH_WORKER_URL set)
                                 ▼
                          ┌─ Redis broker ──┐
                          │ batch.process_item │
                          └────────┬───────────┘
                                   │ pop
                                   ▼
                  ┌─ Celery worker (this service) ─┐
                  │ tasks.process_item(job, item)  │
                  │   → POST /batch-renewals/:id/  │
                  │     items/:itemId/process      │
                  └────────────────────────────────┘
                                   │
                                   ▼
                          back into the TS service
                          for the actual clone work
```

## Files

- `app.py` — Celery app singleton + Redis broker config
- `tasks.py` — `process_item` task that POSTs to the TS callback
- `requirements.txt` — celery + redis + httpx (sync HTTP client)
- `Dockerfile` — minimal python:3.12-slim image, runs `celery -A app worker`

## Local dev

```bash
# 1. Start Redis (if you don't already have one running)
docker run -d --name dealpad-redis -p 6379:6379 redis:7-alpine

# 2. Install deps + run the worker
cd services/batch-processor
pip install -r requirements.txt
export DEALPAD_API_URL=http://localhost:3001
export DEALPAD_API_TOKEN=<set this matching server's BATCH_WORKER_TOKEN>
export REDIS_URL=redis://localhost:6379/0
celery -A app worker --loglevel=info --concurrency=4
```

## Env vars

| Variable | Required | What |
|---|---|---|
| `REDIS_URL` | yes | Celery broker URL. Default: `redis://localhost:6379/0` |
| `DEALPAD_API_URL` | yes | TS API base. Default: `http://localhost:3001` |
| `DEALPAD_API_TOKEN` | yes | Shared secret matching server's `BATCH_WORKER_TOKEN`. Required to call the private item-process callback. |

## Integration with the TS orchestrator

The TS side checks `BATCH_WORKER_URL` and `BATCH_WORKER_TOKEN`. When
both are set:

1. `POST /api/batch-renewals/:id/start` enqueues one
   `batch.process_item` task per pending item (currently a TODO; the
   sync loop still runs by default).
2. The Express endpoint returns `202 Accepted` immediately with a
   `pollUrl` pointing at `/api/batch-renewals/:id/items`.
3. Each Celery worker task POSTs to a private callback that runs
   `processOneItem` and returns the result.
4. The job's running totals update as the worker reports back; the
   UI's existing polling on `useBatchRenewalItems` shows progress.

When the env vars are not set, the synchronous loop runs and this
worker is unused. That's the default for local dev.

## Status

**Phase 0 of the worker.** This directory ships the scaffolding —
the Celery app, the task definition, the Docker image — but the TS
orchestrator's enqueue path is intentionally not wired yet (it would
need a `BATCH_WORKER_URL` config + a private callback endpoint, both
of which want their own PR with auth + rate-limit considerations).
The next branch (`feat/F1.3-worker-enqueue`) wires it.

Until then, `runBatchRenewalJob` runs synchronously and this directory
is dormant. Pricing Ops can still use the UI normally; the worker is
purely an optional scale-out path.
