"""F4.2.1 — DealPad ml-service.

FastAPI service hosting future ML-trained endpoints:
  - effort_estimator (F4.2)  — predict hours from scope features
  - margin_optimizer (F4.3)  — LP solver for role-mix optimization

Today every endpoint runs in heuristic mode (`MODE=heuristic`),
returning deterministic outputs the Node side already understands.
This lets us deploy the service alongside the Node app and start
collecting telemetry before any model is trained.

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000

Modes (env var `ML_MODE`):
    heuristic  default; pure-Python rules
    sklearn    requires `model.joblib` mounted at MODEL_PATH
    azureml    requires AZUREML_ENDPOINT + AZUREML_API_KEY

Production note:
    The Node `IntelligenceEngine` and `RateOptimizerService`
    currently embed their own heuristics and don't call this
    service. The HTTP contract here is the seam they'll switch to
    once the trained models exist; until then this service is
    callable directly via curl/httpie for ad-hoc testing.
"""
from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODE = os.environ.get("ML_MODE", "heuristic")

app = FastAPI(
    title="DealPad ml-service",
    version="0.1.0",
    description="Heuristic-mode ML endpoints for DealPad. Trained models plug in via MODE=sklearn|azureml.",
)


# ---------- Health ----------

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "mode": MODE, "version": "0.1.0"}


# ---------- F4.2 — Effort estimator ----------

class EffortEstimatorRequest(BaseModel):
    """Inputs the trained model will eventually consume."""

    scope_item_count: int = Field(ge=0, description="Number of scope items selected on the deal.")
    business_unit: str | None = None
    service_line: str | None = None
    complexity: Literal["low", "medium", "high", "very_high"] | None = "medium"
    # Optional feature richness — when set, the heuristic uses these
    # to refine the projection. The trained model will use them
    # directly as features.
    avg_default_hours: float | None = Field(default=None, ge=0)
    has_data_migration: bool = False
    integration_count: int = Field(default=0, ge=0)


class EffortEstimatorResponse(BaseModel):
    estimated_hours: float
    confidence: float = Field(ge=0, le=1)
    drivers: list[str]
    mode: str


COMPLEXITY_MULT = {"low": 0.85, "medium": 1.0, "high": 1.25, "very_high": 1.6}


@app.post("/effort-estimator", response_model=EffortEstimatorResponse)
def estimate_effort(req: EffortEstimatorRequest) -> EffortEstimatorResponse:
    if MODE != "heuristic":
        raise HTTPException(
            status_code=503,
            detail=f"ML_MODE={MODE} is not yet wired in this service. Use heuristic until the model is trained.",
        )
    # Heuristic baseline: count × default hours × complexity × signal multipliers
    base_hours_per_item = req.avg_default_hours or 8.0
    raw = req.scope_item_count * base_hours_per_item * COMPLEXITY_MULT.get(req.complexity or "medium", 1.0)
    drivers: list[str] = [
        f"{req.scope_item_count} scope item(s) × ~{base_hours_per_item:.1f}h base",
        f"complexity={req.complexity or 'medium'}",
    ]
    if req.has_data_migration:
        raw *= 1.2
        drivers.append("data migration uplift +20%")
    if req.integration_count > 0:
        # 8h per integration, plateauing at 5
        raw += min(req.integration_count, 5) * 8
        drivers.append(f"integrations × 8h capped at 5 (count={req.integration_count})")
    estimated = round(raw, 1)
    # Confidence proxy: more known signals = higher
    sig_count = sum(
        [
            req.scope_item_count > 0,
            req.business_unit is not None,
            req.service_line is not None,
            req.complexity is not None,
            req.avg_default_hours is not None,
        ]
    )
    confidence = min(0.85, 0.4 + 0.1 * sig_count)
    return EffortEstimatorResponse(
        estimated_hours=estimated,
        confidence=round(confidence, 3),
        drivers=drivers,
        mode=MODE,
    )


# ---------- F4.3 — Margin optimizer ----------

class RoleMix(BaseModel):
    role: str
    rate: float = Field(gt=0)
    cost_rate: float = Field(ge=0)
    hours: float = Field(ge=0)


class MarginOptimizerRequest(BaseModel):
    target_margin: float = Field(gt=0, le=100, description="Target margin %, 0..100")
    roles: list[RoleMix] = Field(min_length=1)
    # Bounds on shifting hours between roles. The LP solver will
    # respect these once it lands.
    max_shift_hours_per_role: float = Field(default=80, ge=0)


class MarginOptimizerSuggestion(BaseModel):
    description: str
    margin_after: float
    hours_shifted: float


class MarginOptimizerResponse(BaseModel):
    current_margin: float
    target_margin: float
    is_on_target: bool
    suggestions: list[MarginOptimizerSuggestion]
    mode: str


@app.post("/margin-optimizer", response_model=MarginOptimizerResponse)
def optimize_margin(req: MarginOptimizerRequest) -> MarginOptimizerResponse:
    if MODE != "heuristic":
        raise HTTPException(
            status_code=503,
            detail=f"ML_MODE={MODE} is not yet wired in this service.",
        )
    fee = sum(r.rate * r.hours for r in req.roles)
    cost = sum(r.cost_rate * r.hours for r in req.roles)
    current = ((fee - cost) / fee * 100) if fee > 0 else 0.0
    is_on_target = current >= req.target_margin

    suggestions: list[MarginOptimizerSuggestion] = []
    if not is_on_target and len(req.roles) >= 2:
        # Pick the most expensive role (highest cost_rate) and shift
        # `max_shift_hours_per_role` to the cheapest non-zero role.
        sorted_by_cost = sorted(req.roles, key=lambda r: r.cost_rate)
        cheapest = sorted_by_cost[0]
        most_expensive = sorted_by_cost[-1]
        if cheapest.role != most_expensive.role and cheapest.cost_rate < most_expensive.cost_rate:
            shift = min(req.max_shift_hours_per_role, most_expensive.hours)
            new_cost = cost - shift * most_expensive.cost_rate + shift * cheapest.cost_rate
            new_fee = fee - shift * most_expensive.rate + shift * cheapest.rate
            new_margin = ((new_fee - new_cost) / new_fee * 100) if new_fee > 0 else 0.0
            suggestions.append(
                MarginOptimizerSuggestion(
                    description=(
                        f"Shift {shift:.1f}h from {most_expensive.role} to {cheapest.role}: "
                        f"margin {current:.1f}% → {new_margin:.1f}%"
                    ),
                    margin_after=round(new_margin, 2),
                    hours_shifted=round(shift, 1),
                )
            )
    return MarginOptimizerResponse(
        current_margin=round(current, 2),
        target_margin=req.target_margin,
        is_on_target=is_on_target,
        suggestions=suggestions,
        mode=MODE,
    )
