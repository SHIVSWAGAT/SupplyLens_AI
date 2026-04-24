from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import List

from models.schemas import (
    Alert,
    Coordinates,
    KPIMetrics,
    MonthlyTrend,
    RegionDisruption,
    CarrierPerformance,
    RiskLevel,
    RouteOption,
    Shipment,
    ShipmentStatus,
    TransportMode,
    Waypoint,
)
from services.shipment_metrics import (
    build_shipment_alert,
    compute_carrier_performance,
    compute_kpis,
    compute_monthly_trends,
    derive_shipment_status,
    format_platform_datetime,
    risk_to_level,
)

random.seed(42)
DEFAULT_SHIPMENT_COUNT = 1000
HISTORICAL_TREND_MONTHS = 6

CARRIERS = [
    "FedEx", "DHL", "Maersk", "UPS", "COSCO", "MSC",
    "DB Schenker", "Kuehne+Nagel",
]

CARGO_TYPES = [
    "Electronics", "Pharmaceuticals", "Automotive Parts", "Textiles",
    "Food & Beverage", "Chemicals", "Machinery", "Consumer Goods",
]

CUSTOMERS = [
    "Apple Inc.", "Samsung", "Tesla", "Pfizer", "Toyota",
    "Walmart", "Amazon", "IKEA", "Nike", "Bosch",
]

CITIES = [
    {"name": "Shanghai", "lat": 31.2304, "lng": 121.4737, "region": "Asia Pacific"},
    {"name": "Singapore", "lat": 1.3521, "lng": 103.8198, "region": "Asia Pacific"},
    {"name": "Rotterdam", "lat": 51.9225, "lng": 4.4792, "region": "Europe"},
    {"name": "Los Angeles", "lat": 34.0522, "lng": -118.2437, "region": "North America"},
    {"name": "Dubai", "lat": 25.2048, "lng": 55.2708, "region": "Middle East"},
    {"name": "Hamburg", "lat": 53.5753, "lng": 10.0153, "region": "Europe"},
    {"name": "New York", "lat": 40.7128, "lng": -74.0060, "region": "North America"},
    {"name": "Tokyo", "lat": 35.6762, "lng": 139.6503, "region": "Asia Pacific"},
    {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777, "region": "South Asia"},
    {"name": "Sydney", "lat": -33.8688, "lng": 151.2093, "region": "Oceania"},
    {"name": "São Paulo", "lat": -23.5505, "lng": -46.6333, "region": "Latin America"},
    {"name": "London", "lat": 51.5074, "lng": -0.1278, "region": "Europe"},
    {"name": "Chicago", "lat": 41.8781, "lng": -87.6298, "region": "North America"},
    {"name": "Hong Kong", "lat": 22.3193, "lng": 114.1694, "region": "Asia Pacific"},
    {"name": "Frankfurt", "lat": 50.1109, "lng": 8.6821, "region": "Europe"},
    {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946, "region": "South Asia"},
    {"name": "Toronto", "lat": 43.6532, "lng": -79.3832, "region": "North America"},
    {"name": "Cape Town", "lat": -33.9249, "lng": 18.4241, "region": "Africa"},
]

STATUS_PROFILES = {
    ShipmentStatus.ON_TIME: {
        "share": 0.56,
        "risk_range": (0.05, 0.42),
        "delay_range": (0, 25),
        "delivery_slip_range": (-90, 20),
        "progress_range": (0.12, 0.98),
        "actual_arrival_share": 0.34,
        "reasons": [
            "Routine customs review at origin",
            "Minor weather pocket near destination",
            "Standard traffic variance near destination",
        ],
    },
    ShipmentStatus.AT_RISK: {
        "share": 0.18,
        "risk_range": (0.45, 0.64),
        "delay_range": (8, 28),
        "delivery_slip_range": (10, 40),
        "progress_range": (0.14, 0.95),
        "actual_arrival_share": 0.12,
        "reasons": [
            "Destination hub congestion",
            "Moderate rain slowing linehaul operations",
            "Customs review running above target dwell time",
        ],
    },
    ShipmentStatus.DELAYED: {
        "share": 0.17,
        "risk_range": (0.52, 0.78),
        "delay_range": (35, 150),
        "delivery_slip_range": (35, 180),
        "progress_range": (0.10, 0.92),
        "actual_arrival_share": 0.22,
        "reasons": [
            "Port congestion at destination terminal",
            "Heavy rain along transit corridor",
            "Carrier equipment availability issue",
        ],
    },
    ShipmentStatus.CRITICAL: {
        "share": 0.09,
        "risk_range": (0.78, 0.97),
        "delay_range": (180, 480),
        "delivery_slip_range": (180, 600),
        "progress_range": (0.06, 0.88),
        "actual_arrival_share": 0.1,
        "reasons": [
            "Storm disruption in transit corridor",
            "Flooding near destination hub",
            "Labor strike at critical port facility",
        ],
    },
}


def _risk_to_level(score: float) -> RiskLevel:
    return risk_to_level(score)


def _build_status_buckets(n: int, rng: random.Random) -> list[ShipmentStatus]:
    counts = {}
    remaining = n
    ordered = list(STATUS_PROFILES.items())
    for index, (status, profile) in enumerate(ordered):
        if index == len(ordered) - 1:
            counts[status] = remaining
        else:
            counts[status] = int(round(n * profile["share"]))
            remaining -= counts[status]
    buckets: list[ShipmentStatus] = []
    for status, count in counts.items():
        buckets.extend([status] * count)
    rng.shuffle(buckets)
    return buckets[:n]


def generate_route_options(origin: dict, destination: dict, base_risk: float | None = None) -> List[RouteOption]:
    base_dist = abs(origin["lat"] - destination["lat"]) * 111 + abs(origin["lng"] - destination["lng"]) * 85
    base_dist = max(base_dist, 500)
    mid_lat = (origin["lat"] + destination["lat"]) / 2
    mid_lng = (origin["lng"] + destination["lng"]) / 2
    risk_anchor = base_risk if base_risk is not None else random.uniform(0.15, 0.55)

    options = [
        RouteOption(
            id=f"route_a_{uuid.uuid4().hex[:12]}",
            label="Route A - Fastest",
            description="Direct high-speed corridor via major transit hubs",
            distance_km=round(base_dist * 1.05, 1),
            estimated_hours=round(base_dist / 800 * random.uniform(1.1, 1.4), 1),
            cost_usd=round(base_dist * random.uniform(2.8, 3.5), 2),
            risk_score=round(min(0.98, max(0.05, risk_anchor + random.uniform(-0.05, 0.12))), 2),
            confidence=round(random.uniform(0.82, 0.95), 2),
            tags=["Express", "Fast Lane"],
            waypoints=[
                Waypoint(name=origin["name"], lat=origin["lat"], lng=origin["lng"], status="completed"),
                Waypoint(name="Transit Hub 1", lat=mid_lat + 2, lng=mid_lng - 3, status="in_transit"),
                Waypoint(name=destination["name"], lat=destination["lat"], lng=destination["lng"], status="pending"),
            ],
        ),
        RouteOption(
            id=f"route_b_{uuid.uuid4().hex[:12]}",
            label="Route B - Lowest Cost",
            description="Economy routing via multi-modal shared lanes",
            distance_km=round(base_dist * 1.2, 1),
            estimated_hours=round(base_dist / 600 * random.uniform(1.3, 1.7), 1),
            cost_usd=round(base_dist * random.uniform(1.8, 2.3), 2),
            risk_score=round(min(0.98, max(0.08, risk_anchor + random.uniform(0.02, 0.18))), 2),
            confidence=round(random.uniform(0.72, 0.85), 2),
            tags=["Economy", "Multi-Modal"],
            waypoints=[
                Waypoint(name=origin["name"], lat=origin["lat"], lng=origin["lng"], status="completed"),
                Waypoint(name="Safe Corridor 1", lat=mid_lat + 4, lng=mid_lng - 5, status="pending"),
                Waypoint(name=destination["name"], lat=destination["lat"], lng=destination["lng"], status="pending"),
            ],
        ),
        RouteOption(
            id=f"route_c_{uuid.uuid4().hex[:12]}",
            label="Route C - Safest",
            description="Weather-aware corridor prioritising lower disruption exposure",
            distance_km=round(base_dist * 1.32, 1),
            estimated_hours=round(base_dist / 540 * random.uniform(1.45, 1.8), 1),
            cost_usd=round(base_dist * random.uniform(2.4, 2.9), 2),
            risk_score=round(min(0.7, max(0.03, risk_anchor * random.uniform(0.45, 0.75))), 2),
            confidence=round(random.uniform(0.84, 0.96), 2),
            tags=["Safest", "Weather Aware"],
            waypoints=[
                Waypoint(name=origin["name"], lat=origin["lat"], lng=origin["lng"], status="completed"),
                Waypoint(name="Resilient Hub", lat=mid_lat - 3, lng=mid_lng + 4, status="pending"),
                Waypoint(name="Inspection Checkpoint", lat=mid_lat + 1.5, lng=mid_lng + 6, status="pending"),
                Waypoint(name=destination["name"], lat=destination["lat"], lng=destination["lng"], status="pending"),
            ],
        ),
    ]
    return options


def _random_historical_delivery_date(rng: random.Random, now: datetime) -> datetime:
    # Pick a random month slot (0 = current month, 5 = 5 months ago) then a random
    # day within that month so the distribution is flat across all 6 buckets.
    month_slot = rng.randint(0, HISTORICAL_TREND_MONTHS - 1)
    days_back_base = month_slot * 30 + rng.randint(0, 27)
    days_back = min(days_back_base, HISTORICAL_TREND_MONTHS * 30 - 1)
    hours_back = rng.randint(0, 23)
    minutes_back = rng.randint(0, 59)
    return now - timedelta(days=days_back, hours=hours_back, minutes=minutes_back)


def generate_shipments(n: int = DEFAULT_SHIPMENT_COUNT) -> List[Shipment]:
    shipments: List[Shipment] = []
    rng = random.Random(99)
    status_buckets = _build_status_buckets(n, rng)
    now = datetime.now()

    for target_status in status_buckets:
        profile = STATUS_PROFILES[target_status]
        origin = rng.choice(CITIES)
        destination = rng.choice([city for city in CITIES if city["name"] != origin["name"]])
        base_risk = round(rng.uniform(*profile["risk_range"]), 2)
        mode = rng.choice([TransportMode.SEA, TransportMode.AIR, TransportMode.ROAD, TransportMode.RAIL])
        carrier = rng.choice(CARRIERS)

        speed = {
            TransportMode.AIR: 720,
            TransportMode.SEA: 32,
            TransportMode.ROAD: 58,
            TransportMode.RAIL: 82,
        }[mode]
        distance = max(
            abs(origin["lat"] - destination["lat"]) * 111 + abs(origin["lng"] - destination["lng"]) * 85,
            350,
        )
        planned_hours = max(distance / speed * rng.uniform(1.05, 1.45), 6)
        has_actual_arrival = rng.random() < profile["actual_arrival_share"]
        raw_delay = rng.randint(*profile["delay_range"])
        if has_actual_arrival:
            actual_arrival_dt = _random_historical_delivery_date(rng, now)
            estimated_arrival_dt = actual_arrival_dt - timedelta(minutes=rng.randint(*profile["delivery_slip_range"]))
            departure = estimated_arrival_dt - timedelta(hours=planned_hours)
            progress_pct = 100.0
            current_coords = Coordinates(lat=destination["lat"], lng=destination["lng"])
        else:
            actual_arrival_dt = None
            progress_pct = round(rng.uniform(*profile["progress_range"]) * 100, 1)
            # Spread in-transit shipment departures across the past 6 months so they
            # land in different monthly buckets rather than all falling in the current month.
            spread_days = rng.randint(0, HISTORICAL_TREND_MONTHS * 30 - 1)
            anchor = now - timedelta(days=spread_days)
            departure = anchor - timedelta(hours=planned_hours * (progress_pct / 100))
            estimated_arrival_dt = departure + timedelta(hours=planned_hours)
            progress_ratio = progress_pct / 100
            cur_lat = origin["lat"] + (destination["lat"] - origin["lat"]) * progress_ratio + rng.uniform(-0.35, 0.35)
            cur_lng = origin["lng"] + (destination["lng"] - origin["lng"]) * progress_ratio + rng.uniform(-0.35, 0.35)
            current_coords = Coordinates(lat=round(cur_lat, 4), lng=round(cur_lng, 4))

        shipment = Shipment(
            id=str(uuid.UUID(int=rng.getrandbits(128))),
            tracking_number=f"SC{rng.randint(1000000, 9999999)}",
            origin=origin["name"],
            destination=destination["name"],
            origin_coords=Coordinates(lat=origin["lat"], lng=origin["lng"]),
            destination_coords=Coordinates(lat=destination["lat"], lng=destination["lng"]),
            current_coords=current_coords,
            carrier=carrier,
            mode=mode,
            status=target_status,
            risk_level=_risk_to_level(base_risk),
            risk_score=base_risk,
            baseline_risk_score=base_risk,
            departure_time=format_platform_datetime(departure) or "",
            estimated_arrival=format_platform_datetime(estimated_arrival_dt) or "",
            actual_arrival=format_platform_datetime(actual_arrival_dt),
            delay_minutes=max(0, raw_delay),
            cargo_type=rng.choice(CARGO_TYPES),
            weight_kg=round(rng.uniform(100, 50000), 1),
            customer=rng.choice(CUSTOMERS),
            disruption_reason=rng.choice(profile["reasons"]),
            route_options=generate_route_options(origin, destination, base_risk=base_risk),
            progress_pct=progress_pct,
        )
        shipment.status = derive_shipment_status(shipment, shipment.risk_score, now=now)
        shipments.append(shipment)
    return shipments


def generate_alerts(shipments: List[Shipment]) -> List[Alert]:
    alerts: List[Alert] = []

    for shipment in shipments:
        should_alert = shipment.status in {ShipmentStatus.AT_RISK, ShipmentStatus.DELAYED, ShipmentStatus.CRITICAL}
        if not should_alert:
            continue

        affected_city = shipment.destination if shipment.progress_pct >= 70 else shipment.origin
        timestamp = datetime.now() - timedelta(minutes=int((shipment.risk_score * 180) + max(shipment.delay_minutes, 5)))
        action = "Suggested reroute via Route C - Safest." if shipment.route_options else "Investigate carrier and lane conditions."
        alert = build_shipment_alert(
            shipment,
            reason=shipment.disruption_reason,
            affected_city=affected_city,
            recommended_action=action,
            alert_id=f"base-{shipment.id}",
            timestamp=timestamp,
        )
        alert.acknowledged = False
        alerts.append(alert)

    alerts.sort(key=lambda item: item.timestamp, reverse=True)
    return alerts


def generate_kpis(shipments: List[Shipment], alerts: List[Alert]) -> KPIMetrics:
    rng = random.Random(42)
    return compute_kpis(
        shipments,
        alerts,
        previous=KPIMetrics(
            total_shipments=len(shipments),
            on_time_pct=0,
            delayed_shipments=0,
            critical_shipments=0,
            avg_delay_minutes=0,
            cost_savings_usd=round(rng.uniform(120000, 380000), 0),
            eta_accuracy_pct=round(rng.uniform(87, 96), 1),
            disruptions_prevented=rng.randint(12, 45),
            active_alerts=0,
        ),
    )


def generate_carrier_performance(shipments: List[Shipment]) -> List[CarrierPerformance]:
    return [
        CarrierPerformance(**item)
        for item in compute_carrier_performance(shipments)
    ]


def generate_monthly_trends(shipments: List[Shipment] | None = None) -> List[MonthlyTrend]:
    if shipments is None:
        shipments = generate_shipments(DEFAULT_SHIPMENT_COUNT)
    return compute_monthly_trends(shipments)


def generate_region_disruptions(alerts: List[Alert]) -> List[RegionDisruption]:
    counts: dict = {}
    for alert in alerts:
        if alert.region not in counts:
            counts[alert.region] = {"count": 0, "critical": 0}
        counts[alert.region]["count"] += 1
        if alert.risk_level == RiskLevel.CRITICAL:
            counts[alert.region]["critical"] += 1

    result = []
    for region, data in counts.items():
        severity = "Critical" if data["critical"] > 2 else ("Warning" if data["count"] > 3 else "Info")
        result.append(RegionDisruption(region=region, count=data["count"], severity=severity))
    result.sort(key=lambda item: item.count, reverse=True)
    return result
