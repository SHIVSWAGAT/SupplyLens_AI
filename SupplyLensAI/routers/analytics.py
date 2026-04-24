from __future__ import annotations

import math
from typing import List, Optional

from fastapi import APIRouter

from models.schemas import CarrierPerformance, KPIMetrics, MonthlyTrend, RegionDisruption
from services.cache_service import get_cache
from services.data_generator import generate_region_disruptions
from services.shipment_metrics import compute_carrier_performance, compute_kpis, compute_monthly_trends

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _safe_float(value) -> float:
    """Convert value to JSON-safe float, handling NaN and Infinity."""
    if value is None:
        return 0.0
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except (TypeError, ValueError):
        return 0.0


def _safe_bool(value) -> bool:
    """Convert value to bool safely."""
    if value is None:
        return False
    return bool(value)


def _safe_str(value) -> str | None:
    """Convert value to string or None, handling datetime objects."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    # Handle datetime objects
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def _safe_list(value) -> list:
    """Convert value to list safely."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) if item is not None else "" for item in value]
    return []

_kpis_seed: Optional[KPIMetrics] = None
_shipments = []
_alerts = []
_monthly_trends: List[MonthlyTrend] = []
_region_disruptions: List[RegionDisruption] = []


def set_data(kpis, shipments, alerts, monthly_trends, region_disruptions):
    global _kpis_seed, _shipments, _alerts, _monthly_trends, _region_disruptions
    _kpis_seed = kpis
    _shipments = shipments
    _alerts = alerts
    _monthly_trends = compute_monthly_trends(shipments) if shipments else monthly_trends
    _region_disruptions = generate_region_disruptions(alerts)
    get_cache().delete("analytics:kpis")


def get_current_kpis_data() -> dict:
    return get_kpis().model_dump(mode="json")


@router.get("/kpis", response_model=KPIMetrics)
def get_kpis():
    cache_key = "analytics:kpis"
    cached = get_cache().get(cache_key)
    if cached:
        return KPIMetrics.model_validate(cached)
    kpis = compute_kpis(_shipments, _alerts, previous=_kpis_seed)
    get_cache().set(cache_key, kpis.model_dump(mode="json"), 15)
    return kpis


@router.get("/carrier-performance", response_model=List[CarrierPerformance])
def get_carrier_performance():
    return [CarrierPerformance(**item) for item in compute_carrier_performance(_shipments)]


@router.get("/monthly-trends", response_model=List[MonthlyTrend])
def get_monthly_trends():
    return compute_monthly_trends(_shipments) if _shipments else _monthly_trends


@router.get("/region-disruptions", response_model=List[RegionDisruption])
def get_region_disruptions():
    return generate_region_disruptions(_alerts)


@router.get("/ai-insights")
def get_ai_insights():
    try:
        # Defensive: return empty valid JSON if data not initialized yet (race condition on startup)
        if not _shipments:
            return {
                "top_risky_shipments": [],
                "predicted_disruptions": [],
                "cost_savings_suggestions": [],
            }

        risky_shipments = sorted(
            _shipments,
            key=lambda shipment: shipment.risk_score,
            reverse=True,
        )[:5]
        predicted_disruptions = [
            shipment for shipment in _shipments
            if shipment.ml_prediction and (shipment.ml_prediction.anomaly_detected or shipment.ml_prediction.risk_score >= 0.7)
        ][:6]
        cost_saving_candidates = []
        for shipment in risky_shipments:
            if not shipment.route_options:
                continue
            current_cost = shipment.route_options[0].cost_usd
            cheapest = min(route.cost_usd for route in shipment.route_options)
            cost_saving_candidates.append(
                {
                    "tracking_number": str(shipment.tracking_number),
                    "current_cost": _safe_float(current_cost),
                    "best_available_cost": _safe_float(cheapest),
                    "savings": _safe_float(round(max(current_cost - cheapest, 0), 2)),
                }
            )

        # Serialize with proper JSON handling for all Pydantic models using safe helpers
        return {
            "top_risky_shipments": [
                {
                    "tracking_number": str(shipment.tracking_number),
                    "risk_score": _safe_float(shipment.risk_score),
                    "predicted_eta": _safe_str(shipment.ml_prediction.predicted_eta) if shipment.ml_prediction else None,
                    "top_factors": _safe_list(shipment.ml_prediction.top_factors) if shipment.ml_prediction else [],
                }
                for shipment in risky_shipments
            ],
            "predicted_disruptions": [
                {
                    "tracking_number": str(shipment.tracking_number),
                    "anomaly_detected": _safe_bool(shipment.ml_prediction.anomaly_detected) if shipment.ml_prediction else False,
                    "risk_score": _safe_float(shipment.risk_score),
                }
                for shipment in predicted_disruptions
            ],
            "cost_savings_suggestions": cost_saving_candidates,
        }
    except Exception:
        # Ultimate fallback: always return valid JSON even on unexpected errors
        return {
            "top_risky_shipments": [],
            "predicted_disruptions": [],
            "cost_savings_suggestions": [],
        }
