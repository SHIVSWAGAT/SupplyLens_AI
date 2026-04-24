import random
from typing import List

from models.schemas import DisruptionAnalysis, RouteOption, RouteOptimizeRequest, Shipment
from services.data_generator import CITIES, generate_route_options
from services.ml_service import shipment_analysis
from services.weather_service import get_city_weather
from ml.predict import predict_risk


def compute_risk_score(
    delay_minutes: float,
    weather_severity: float,
    congestion_index: float,
    equipment_health: float,
    route_deviation: float,
) -> float:
    payload = {
        "delay_minutes": delay_minutes,
        "weather_risk": weather_severity,
        "congestion_index": congestion_index,
        "route_distance": max(150.0, 2000.0 * max(route_deviation, 0.1)),
        "cargo_type": "General",
        "transport_mode": "Road",
        "carrier_performance": max(0.3, min(1.0, equipment_health)),
        "weight_kg": 1000.0,
        "scheduled_eta_hours": 14.0,
    }
    return round(predict_risk(payload)["risk_score"], 4)


def analyze_disruption(shipment: Shipment) -> DisruptionAnalysis:
    analysis = shipment_analysis(shipment)
    return DisruptionAnalysis.model_validate(analysis)


def optimize_route(req: RouteOptimizeRequest) -> List[RouteOption]:
    origin = next((c for c in CITIES if c["name"].lower() == req.origin.lower()), None)
    destination = next((c for c in CITIES if c["name"].lower() == req.destination.lower()), None)

    if not origin:
        origin = {"name": req.origin, "lat": random.uniform(-40, 60), "lng": random.uniform(-120, 140)}
    if not destination:
        destination = {"name": req.destination, "lat": random.uniform(-40, 60), "lng": random.uniform(-120, 140)}

    options = generate_route_options(origin, destination)
    weather_risk = max(
        float((get_city_weather(req.origin) or {}).get("risk_score", 0)) / 100,
        float((get_city_weather(req.destination) or {}).get("risk_score", 0)) / 100,
    )

    for route in options:
        risk_prediction = predict_risk(
            {
                "delay_minutes": route.estimated_hours * 2.2,
                "weather_risk": weather_risk,
                "congestion_index": min(1.0, route.risk_score + 0.18),
                "route_distance": route.distance_km,
                "cargo_type": req.cargo_type,
                "transport_mode": "Sea" if "Multi-Modal" in route.tags else "Road",
                "carrier_performance": max(0.45, 1 - route.risk_score),
                "weight_kg": req.weight_kg,
                "scheduled_eta_hours": route.estimated_hours,
            }
        )
        route.risk_score = round(risk_prediction["risk_score"], 2)
        route.confidence = round(risk_prediction["confidence"], 2)

    priority_order = {
        "fastest": lambda option: (option.estimated_hours, option.risk_score, option.cost_usd),
        "cheapest": lambda option: (option.cost_usd, option.risk_score, option.estimated_hours),
        "lowest_cost": lambda option: (option.cost_usd, option.risk_score, option.estimated_hours),
        "safest": lambda option: (option.risk_score, option.estimated_hours, option.cost_usd),
        "balanced": lambda option: (
            option.risk_score * 0.45 + option.cost_usd / 20000 + option.estimated_hours / 200,
        ),
    }
    sorter = priority_order.get(req.priority.lower(), priority_order["balanced"])
    return sorted(options, key=sorter)
