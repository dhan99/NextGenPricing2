"""F1.3 — Celery app singleton.

Celery picks up tasks declared in tasks.py via the `include` list.
Broker + backend are both Redis; for production-scale you'd switch
the result backend to RDS-backed Postgres so the TS side can read
worker outcomes via a shared store, but Redis-only is fine for the
sub-1000-deal target.

Run with:
    celery -A app worker --loglevel=info --concurrency=4
"""

import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "dealpad_batch_processor",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"],
)

# Conservative defaults for sub-1000-deal batches. Tune when production
# scale is exercised.
app.conf.update(
    task_acks_late=True,           # don't ack until task succeeds — retry on worker crash
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # one task per worker at a time, fairer dispatch
    task_default_retry_delay=15,   # exponential backoff base
    task_max_retries=3,
    timezone="UTC",
    enable_utc=True,
)
