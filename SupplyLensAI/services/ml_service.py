from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable

from models.schemas import MLPrediction, RiskLevel, Shipment, ShipmentStatus
from ml.predict import load_model_bundle, predict_eta, predict_risk
from services.shipment_metrics import (
    derive_shipment_status,
    format_platform_datetime,
    risk_to_level,
    shipment_delay_minutes,
)
from services.telemetry import log_prediction
from services.weather_service import get_city_weather


def route_distance_km(shipment: Shipment) -> float:
    lat_distance = abs(shipment.origin_coords.lat - shipment.destination_coords.lat) * 111
    lng_distance = abs(shipment.origin_coords.lng - shipment.destination_coords.lng) * 85
    return max(lat_distance + lng_distance, 120.0)


def carrier_performance_lookup(shipments: Iterable[Shipment]) -> dict[str, float]:
    totals: dict[str, dict] = {}
    for shipment in shipments:
        carrier = shipment.carrier
        current = totals.setdefault(carrier, {"count": 0, "on_time": 0})
        current["count"] += 1
        status = shipment.status.value if hasattr(shipment.status, "value") else str(shipment.status)
        if status in {"On Time", "Delivered"} and shipment.delay_minutes <= 30:
            current["on_time"] += 1
    return {
        carrier: round(max(0.45, min(0.98, values["on_time"] / values["count"] if values["count"] else 0.75)), 4)
        for carrier, values in totals.items()
    }


def build_prediction_payload(shipment: Shipment, carrier_performance: float | None = None) -> dict:
    distance = route_distance_km(shipment)
    origin_weather = get_city_weather(shipment.origin) or {}
    destination_weather = get_city_weather(shipment.destination) or {}
    baseline_risk = shipment.baseline_risk_score if shipment.baseline_risk_score is not None else shipment.risk_score
    weather_risk = max(
        float(origin_weather.get("risk_score", 0)) / 100,
        float(destination_weather.get("risk_score", 0)) / 100,
        min(1.0, float(baseline_risk)),
    )
    congestion_index = min(
        1.0,
        max(
            0.05,
            (shipment.delay_minutes / 180) * 0.45
            + (float(shipment.progress_pct) / 100) * 0.12
            + weather_risk * 0.26,
            + float(baseline_risk) * 0.22,
        ),
    )
    speed = {
        "Air": 750,
        "Sea": 32,
        "Road": 58,
        "Rail": 82,
    }.get(shipment.mode.value if hasattr(shipment.mode, "value") else str(shipment.mode), 55)
    scheduled_eta_hours = max(distance / speed, 4.0)
    return {
        "delay_minutes": shipment.delay_minutes,
        "weather_risk": weather_risk,
        "congestion_index": congestion_index,
        "route_distance": distance,
        "cargo_type": shipment.cargo_type,
        "transport_mode": shipment.mode.value if hasattr(shipment.mode, "value") else str(shipment.mode),
        "carrier_performance": carrier_performance if carrier_performance is not None else 0.78,
        "weight_kg": shipment.weight_kg,
        "scheduled_eta_hours": scheduled_eta_hours,
        "departure_time": shipment.departure_time,
    }


def _predicted_arrival_from_payload(payload: dict, predicted_eta_hours: float) -> str | None:
    departure_time = payload.get("departure_time")
    if not departure_time:
        return None
    try:
        departure = datetime.fromisoformat(str(departure_time).replace(" ", "T"))
    except ValueError:
        return None
    return format_platform_datetime(departure + timedelta(hours=float(predicted_eta_hours)))


def score_shipment(shipment: Shipment, carrier_performance: float | None = None) -> MLPrediction:
    payload = build_prediction_payload(shipment, carrier_performance)
    risk_prediction = predict_risk(payload)
    final_risk = round(min(0.98, max(0.01, float(risk_prediction["risk_score"]))), 4)
    prediction = MLPrediction(
        risk_score=final_risk,
        confidence=risk_prediction["confidence"],
        predicted_delay_minutes=int(risk_prediction["predicted_delay_minutes"]),
        predicted_eta=_predicted_arrival_from_payload(payload, risk_prediction["predicted_eta_hours"]),
        anomaly_score=risk_prediction["anomaly_score"],
        anomaly_detected=risk_prediction["anomaly_detected"],
        top_factors=risk_prediction["top_factors"],
        contribution_scores=risk_prediction["contribution_scores"],
        model_version=risk_prediction["model_version"],
    )
    if prediction.anomaly_detected or prediction.risk_score >= 0.75:
        log_prediction(
            "shipment_prediction",
            {
                "shipment_id": shipment.id,
                "tracking_number": shipment.tracking_number,
                "risk_score": prediction.risk_score,
                "predicted_eta": prediction.predicted_eta,
                "anomaly_detected": prediction.anomaly_detected,
            },
        )
    return prediction


def enrich_shipment(shipment: Shipment, carrier_performance: float | None = None) -> Shipment:
    if shipment.baseline_risk_score is None:
        shipment.baseline_risk_score = shipment.risk_score

    prediction = score_shipment(shipment, carrier_performance)
    shipment.ml_prediction = prediction
    shipment.risk_score = prediction.risk_score
    shipment.risk_level = risk_to_level(prediction.risk_score)
    if prediction.predicted_eta:
        shipment.estimated_arrival = shipment.estimated_arrival
    shipment.delay_minutes = shipment_delay_minutes(shipment)
    shipment.status = derive_shipment_status(shipment, shipment.risk_score)
    return shipment


def enrich_shipments(shipments: list[Shipment]) -> list[Shipment]:
    load_model_bundle()
    carrier_map = carrier_performance_lookup(shipments)
    return [enrich_shipment(shipment, carrier_map.get(shipment.carrier, 0.78)) for shipment in shipments]


def shipment_analysis(shipment: Shipment) -> dict:
    prediction = shipment.ml_prediction or score_shipment(shipment)
    recommendations = [
        "Escalate to the carrier control tower and monitor every 15 minutes." if prediction.risk_score >= 0.7 else "Monitor the shipment in the standard exception queue.",
        "Switch to the safest alternate route option if destination service-level penalties exceed tolerance." if prediction.risk_score >= 0.55 else "Current route remains acceptable under present conditions.",
        "Review the shipment for extreme-risk escalation before dispatching downstream labor." if prediction.anomaly_detected else "No extreme-risk escalation flag is active in the latest prediction.",
    ]
    return {
        "shipment_id": shipment.id,
        "risk_score": prediction.risk_score,
        "risk_level": risk_to_level(prediction.risk_score),
        "factors": [
            {
                "factor": item.factor,
                "value": item.contribution,
                "impact": "High" if index == 0 else "Medium" if index < 3 else "Low",
                "icon": "AI",
            }
            for index, item in enumerate(prediction.contribution_scores)
        ],
        "recommendations": recommendations,
        "confidence": prediction.confidence,
    }


def simulate_scenario(shipment: Shipment, scenario: dict) -> dict:
    payload = build_prediction_payload(shipment, None)
    payload["weather_risk"] = min(1.0, max(0.0, payload["weather_risk"] + float(scenario.get("weather_delta", 0))))
    payload["congestion_index"] = min(1.0, max(0.0, payload["congestion_index"] + float(scenario.get("congestion_delta", 0))))
    payload["delay_minutes"] = max(0.0, payload["delay_minutes"] + float(scenario.get("delay_delta_minutes", 0)))

    simulated_risk = predict_risk(payload)
    simulated_eta = predict_eta(payload)
    baseline = shipment.ml_prediction or score_shipment(shipment)
    return {
        "tracking_number": shipment.tracking_number,
        "baseline_risk": baseline.risk_score,
        "simulated_risk": simulated_risk["risk_score"],
        "risk_delta": round(simulated_risk["risk_score"] - baseline.risk_score, 4),
        "baseline_eta": baseline.predicted_eta,
        "simulated_eta": simulated_eta["predicted_arrival"],
        "top_factors": simulated_risk["top_factors"],
        "contribution_scores": simulated_risk["contribution_scores"],
    }
