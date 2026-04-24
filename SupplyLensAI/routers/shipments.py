from datetime import datetime, timedelta
import random
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from models.schemas import Coordinates, RiskLevel, Shipment, ShipmentStatus, TransportMode
from routers.alerts import remove_alerts_for_shipment
from services.data_generator import CITIES, generate_route_options
from services.ml_service import enrich_shipment, shipment_analysis
from services.platform_store import persist_shipments

router = APIRouter(prefix="/api/shipments", tags=["shipments"])

_shipments: List[Shipment] = []


def set_data(shipments: List[Shipment]):
    global _shipments
    _shipments = shipments
    persist_shipments(_shipments)


def get_current_shipments() -> List[Shipment]:
    return _shipments


@router.get("", response_model=List[Shipment])
def get_shipments(
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    mode: Optional[str] = None,
    carrier: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    offset: int = 0,
):
    result = _shipments[:]

    if status:
        result = [shipment for shipment in result if shipment.status.value == status]
    if risk_level:
        result = [shipment for shipment in result if shipment.risk_level.value == risk_level]
    if mode:
        result = [shipment for shipment in result if shipment.mode.value == mode]
    if carrier:
        result = [shipment for shipment in result if carrier.lower() in shipment.carrier.lower()]
    if search:
        query = search.lower()
        result = [
            shipment for shipment in result
            if query in shipment.tracking_number.lower()
            or query in shipment.origin.lower()
            or query in shipment.destination.lower()
            or query in shipment.customer.lower()
        ]

    if limit is None:
        return result[offset:]

    return result[offset: offset + limit]


@router.get("/stats")
def get_stats():
    total = len(_shipments)
    by_status = {}
    by_risk = {}
    by_mode = {}

    for shipment in _shipments:
        by_status[shipment.status.value] = by_status.get(shipment.status.value, 0) + 1
        by_risk[shipment.risk_level.value] = by_risk.get(shipment.risk_level.value, 0) + 1
        by_mode[shipment.mode.value] = by_mode.get(shipment.mode.value, 0) + 1

    return {
        "total": total,
        "by_status": by_status,
        "by_risk": by_risk,
        "by_mode": by_mode,
    }


@router.get("/{shipment_id}", response_model=Shipment)
def get_shipment(shipment_id: str):
    for shipment in _shipments:
        if shipment.id == shipment_id or shipment.tracking_number == shipment_id:
            return shipment
    raise HTTPException(status_code=404, detail="Shipment not found")


@router.get("/{shipment_id}/analysis")
def get_analysis(shipment_id: str):
    shipment = next(
        (
            item for item in _shipments
            if item.id == shipment_id or item.tracking_number == shipment_id
        ),
        None,
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment_analysis(shipment)


@router.delete("/{shipment_id}")
def delete_shipment(shipment_id: str):
    for index, shipment in enumerate(_shipments):
        if shipment.id != shipment_id and shipment.tracking_number != shipment_id:
            continue

        deleted = _shipments.pop(index)
        removed_alerts = remove_alerts_for_shipment(deleted.id, deleted.tracking_number)
        persist_shipments(_shipments)
        return {
            "status": "deleted",
            "id": deleted.id,
            "tracking_number": deleted.tracking_number,
            "removed_alerts": removed_alerts,
        }

    raise HTTPException(status_code=404, detail="Shipment not found")


@router.post("/create", response_model=Shipment)
def create_shipment(data: dict = Body(...)):
    origin_name = data.get("origin", "")
    destination_name = data.get("destination", "")
    origin = next((city for city in CITIES if city["name"] == origin_name), None)
    destination = next((city for city in CITIES if city["name"] == destination_name), None)

    if not origin:
        origin = {
            "name": origin_name,
            "lat": random.uniform(-40, 55),
            "lng": random.uniform(-100, 140),
            "region": "Global",
        }

    if not destination:
        destination = {
            "name": destination_name,
            "lat": random.uniform(-40, 55),
            "lng": random.uniform(-100, 140),
            "region": "Global",
        }

    try:
        mode = TransportMode(data.get("mode", "Sea"))
    except ValueError:
        mode = TransportMode.SEA

    departure = data.get("departure_time", datetime.utcnow().strftime("%Y-%m-%d %H:%M")).replace("T", " ")
    eta = data.get("estimated_arrival")
    if eta:
        eta = eta.replace("T", " ")
    else:
        eta = (datetime.utcnow() + timedelta(hours=random.randint(24, 96))).strftime("%Y-%m-%d %H:%M")

    shipment = Shipment(
        id=str(uuid.uuid4()),
        tracking_number=f"SC{random.randint(1000000, 9999999)}",
        origin=origin_name,
        destination=destination_name,
        origin_coords=Coordinates(lat=origin["lat"], lng=origin["lng"]),
        destination_coords=Coordinates(lat=destination["lat"], lng=destination["lng"]),
        current_coords=Coordinates(
            lat=origin["lat"] + random.uniform(-0.35, 0.35),
            lng=origin["lng"] + random.uniform(-0.35, 0.35),
        ),
        carrier=data.get("carrier", "Unknown"),
        mode=mode,
        status=ShipmentStatus.AT_RISK,
        risk_level=RiskLevel.MODERATE,
        risk_score=0.4,
        baseline_risk_score=0.4,
        departure_time=departure,
        estimated_arrival=eta,
        delay_minutes=0,
        cargo_type=data.get("cargo_type", "General"),
        weight_kg=float(data.get("weight_kg", 1000)),
        customer=data.get("customer", "Unknown"),
        disruption_reason=None,
        route_options=generate_route_options(origin, destination),
        progress_pct=0.0,
    )

    enrich_shipment(shipment)
    _shipments.insert(0, shipment)
    persist_shipments(_shipments)
    return shipment
