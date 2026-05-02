# DealPad ml-service (F4.2 + F4.3)

FastAPI host for ML-backed endpoints. Today every endpoint runs in
**heuristic mode** so the service can deploy and start collecting
telemetry before any model is trained.

## Run locally

```bash
cd services/ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health` — `{ status, mode, version }`
- `POST /effort-estimator` — predict hours from scope features
- `POST /margin-optimizer` — heuristic role-mix swap (LP solver in F4.3)

## Modes

| `ML_MODE` | Status | Notes |
|---|---|---|
| `heuristic` | ✅ default | pure-Python rules, deterministic |
| `sklearn` | 🚧 stub | requires `model.joblib` mounted at `MODEL_PATH` |
| `azureml` | 🚧 stub | requires `AZUREML_ENDPOINT` + `AZUREML_API_KEY` |

## Wiring from Node

The Node `IntelligenceEngine` and `RateOptimizerService` currently
embed their own heuristics. The HTTP contract here is the seam they
will switch to once trained models exist:

```ts
const r = await fetch(`${process.env.ML_SERVICE_URL}/effort-estimator`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scopeItemCount: 12, complexity: "high" }),
});
```

`ML_SERVICE_URL` defaults to `http://localhost:8000` when running
locally; Compose / k8s deployments wire it through service DNS.

## Docker

```bash
docker build -t dealpad-ml-service .
docker run -p 8000:8000 -e ML_MODE=heuristic dealpad-ml-service
```
