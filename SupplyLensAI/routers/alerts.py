from typing import List, Optional

from fastapi import APIRouter, HTTPException

from models.schemas import Alert
from services.platform_store import persist_alerts

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

_alerts: List[Alert] = []


def set_data(alerts: List[Alert]):
    global _alerts
    _alerts = alerts
    persist_alerts(_alerts)


def get_current_alerts() -> List[Alert]:
    return _alerts


def upsert_alerts(alerts: List[Alert]) -> None:
    index = {alert.id: idx for idx, alert in enumerate(_alerts)}
    for alert in alerts:
        if alert.id in index:
            _alerts[index[alert.id]] = alert
        else:
            _alerts.insert(0, alert)
    persist_alerts(_alerts)


def remove_alerts_for_shipment(shipment_id: str, tracking_number: Optional[str] = None) -> int:
    before = len(_alerts)
    _alerts[:] = [
        alert for alert in _alerts
        if alert.shipment_id != shipment_id and (not tracking_number or alert.tracking_number != tracking_number)
    ]
    persist_alerts(_alerts)
    return before - len(_alerts)


@router.get("", response_model=List[Alert])
def get_alerts(
    severity: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: Optional[int] = None,
):
    result = _alerts[:]

    if severity:
        result = [alert for alert in result if alert.severity.value == severity]

    if acknowledged is not None:
        result = [alert for alert in result if alert.acknowledged == acknowledged]

    if limit is None:
        return result

    return result[:limit]


@router.get("/summary")
def get_summary():
    total = len(_alerts)
    by_severity = {}
    unacked = 0

    for alert in _alerts:
        by_severity[alert.severity.value] = by_severity.get(alert.severity.value, 0) + 1
        if not alert.acknowledged:
            unacked += 1

    return {
        "total": total,
        "by_severity": by_severity,
        "unacknowledged": unacked,
    }


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    for alert in _alerts:
        if alert.id == alert_id:
            alert.acknowledged = True
            persist_alerts(_alerts)
            return {"status": "acknowledged", "id": alert_id}

    raise HTTPException(status_code=404, detail="Alert not found")


@router.post("/acknowledge-all")
def acknowledge_all():
    count = 0
    for alert in _alerts:
        if not alert.acknowledged:
            alert.acknowledged = True
            count += 1
    persist_alerts(_alerts)
    return {"acknowledged": count}
