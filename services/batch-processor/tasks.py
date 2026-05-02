"""F1.3 — Celery tasks for batch renewal processing.

The actual cloning / pricing-recompute work stays on the TS side
(canonical source of the F0.5 pricing engine, F1.1 entity backfill,
F1.2 assembly expansion). This worker is a thin "fan out + retry"
layer: pop a task, POST to the TS callback, surface the response on
the job. No business logic in Python.

Why not duplicate the cloning logic in Python?
- Calc parity (F0.5's pricing-golden test) lives in TS-land. A second
  implementation in Python doubles the surface for drift bugs.
- The F1.2 sandbox is a math.js-based AST validator; reimplementing
  it in a different expression-eval library is a fresh attack
  surface for free.
- The TS callback runs inside the same Express process that already
  has DB transactions + activity_log + auto-push triggers wired up.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from celery import shared_task
from celery.exceptions import Retry

DEALPAD_API_URL = os.environ.get("DEALPAD_API_URL", "http://localhost:3001")
DEALPAD_API_TOKEN = os.environ.get("DEALPAD_API_TOKEN")
HTTP_TIMEOUT = float(os.environ.get("DEALPAD_HTTP_TIMEOUT", "60"))


@shared_task(
    name="batch.process_item",
    bind=True,
    autoretry_for=(httpx.HTTPError,),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def process_item(self, job_id: int, item_id: int) -> dict[str, Any]:
    """Delegate one batch_renewal_items row to the TS callback.

    The callback is a private endpoint protected by a shared
    BATCH_WORKER_TOKEN. It runs `processOneItem` from the TS
    BatchRenewalService and returns the variance result.

    On HTTPError the @shared_task autoretry kicks in. On 4xx (e.g.
    item already processed, item not found) we don't retry — the
    task succeeds with the surfaced status so the operator sees it
    in the UI.
    """
    if not DEALPAD_API_TOKEN:
        raise Retry(
            exc=RuntimeError("DEALPAD_API_TOKEN not set; aborting worker"),
        )

    url = f"{DEALPAD_API_URL}/api/batch-renewals/{job_id}/items/{item_id}/process"
    headers = {
        "Authorization": f"Bearer {DEALPAD_API_TOKEN}",
        "x-user-role": "po",
        "x-user-name": f"batch-worker:{self.request.hostname}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(url, headers=headers, json={})

    # Don't retry user errors — the operator sees them in the items table.
    if 400 <= resp.status_code < 500:
        return {
            "status": "user_error",
            "http_status": resp.status_code,
            "body": _safe_json(resp),
        }

    resp.raise_for_status()  # 5xx → autoretry kicks in

    return {
        "status": "ok",
        "http_status": resp.status_code,
        "body": _safe_json(resp),
    }


def _safe_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text[:500]}
