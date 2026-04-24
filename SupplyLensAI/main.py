import asyncio
import json
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import get_settings
from models.schemas import Alert, RiskLevel
from routers import alerts as alerts_router
from routers import analytics as analytics_router
from routers import auth as auth_router
from routers import chat as chat_router
from routers import ml as ml_router
from routers import routes as routes_router
from routers import shipments as shipments_router
from routers import weather as weather_router
from services import weather_service
from services.auth_service import get_demo_users, get_user_by_token, is_authorized
from services.data_generator import (
    DEFAULT_SHIPMENT_COUNT,
    generate_alerts,
    generate_kpis,
    generate_monthly_trends,
    generate_region_disruptions,
    generate_shipments,
)
from services.ml_service import enrich_shipment, enrich_shipments
from services.platform_store import (
    init_database,
    load_alerts,
    load_shipments,
    persist_shipments,
    seed_users,
)
from services.reliability import SlidingWindowRateLimiter
from services.shipment_metrics import build_shipment_alert, is_on_time_shipment, risk_to_level
from services.telemetry import LOGGER, log_request_response


init_database()
INITIAL_ENRICHMENT_BATCH = 180
settings = get_settings()


def _shipments_need_refresh(shipments):
    if not shipments:
        return True
    low_risk = sum(1 for shipment in shipments if float(shipment.risk_score or 0) < 0.25)
    on_time = sum(1 for shipment in shipments if is_on_time_shipment(shipment) is True)
    return (
        len(shipments) < int(DEFAULT_SHIPMENT_COUNT * 0.9)
        or low_risk / len(shipments) < 0.15
        or on_time / len(shipments) < 0.3
    )


def _bootstrap_shipments():
    try:
        stored_shipments = load_shipments()
    except Exception:
        stored_shipments = []
    if _shipments_need_refresh(stored_shipments):
        return generate_shipments(DEFAULT_SHIPMENT_COUNT)
    return stored_shipments


def _bootstrap_alerts(shipments):
    try:
        stored_alerts = load_alerts()
    except Exception:
        stored_alerts = []
    valid_ids = {shipment.id for shipment in shipments}
    if not stored_alerts or any(alert.shipment_id not in valid_ids for alert in stored_alerts):
        return generate_alerts(shipments)
    return stored_alerts


def _priority_shipments_for_enrichment(shipments):
    return sorted(
        shipments,
        key=lambda shipment: (
            shipment.status.value in {"Critical", "Delayed", "At Risk"},
            shipment.risk_score,
            shipment.delay_minutes,
        ),
        reverse=True,
    )[:INITIAL_ENRICHMENT_BATCH]


shipments_data = _bootstrap_shipments()
enrich_shipments(_priority_shipments_for_enrichment(shipments_data))
alerts_data = _bootstrap_alerts(shipments_data)
kpis_data = generate_kpis(shipments_data, alerts_data)
monthly_trends_data = generate_monthly_trends(shipments_data)
region_disruptions_data = generate_region_disruptions(alerts_data)


def _sync_router_state():
    global monthly_trends_data, region_disruptions_data
    monthly_trends_data = generate_monthly_trends(shipments_data)
    region_disruptions_data = generate_region_disruptions(alerts_data)
    analytics_router.set_data(
        generate_kpis(shipments_data, alerts_data),
        shipments_data,
        alerts_data,
        monthly_trends_data,
        region_disruptions_data,
    )
    shipments_router.set_data(shipments_data)
    alerts_router.set_data(alerts_data)
    chat_router.set_data(shipments_data)
    weather_router.set_data(shipments_data)


_sync_router_state()


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        message = json.dumps(data, default=str)
        for ws in self.active[:]:
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect(ws)


manager = ConnectionManager()
rate_limiter = SlidingWindowRateLimiter(
    limit=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)


def _extract_bearer_token(value: Optional[str]) -> str:
    if not value:
        return ""
    prefix = "Bearer "
    if value.startswith(prefix):
        return value[len(prefix):].strip()
    return value.strip()


def _build_runtime_alerts(updated_shipments):
    runtime_alerts = []
    for shipment in updated_shipments:
        prediction = shipment.ml_prediction
        if not prediction:
            continue
        if prediction.risk_score < 0.68 and not prediction.anomaly_detected:
            continue

        runtime_alerts.append(
            build_shipment_alert(
                shipment,
                reason=", ".join(prediction.top_factors[:2]) or shipment.disruption_reason or "ML risk escalation",
                affected_city=shipment.destination if shipment.progress_pct >= 60 else shipment.origin,
                recommended_action="Suggested reroute via Route C - Safest." if shipment.route_options else "Escalate to the carrier control tower.",
                alert_id=f"ml-{shipment.id}",
                timestamp=datetime.now(),
            )
        )
    return runtime_alerts


def _merge_generated_alerts(existing_alerts, generated_alerts):
    acknowledgements = {alert.id: alert.acknowledged for alert in existing_alerts}
    merged = []
    for alert in generated_alerts:
        alert.acknowledged = acknowledgements.get(alert.id, alert.acknowledged)
        merged.append(alert)
    return merged


async def _refresh_predictions():
    global alerts_data
    await weather_service.refresh_weather()
    enrich_shipments(_priority_shipments_for_enrichment(shipments_data))
    alerts_data = _merge_generated_alerts(alerts_data, generate_alerts(shipments_data))
    alerts_data.sort(key=lambda alert: alert.timestamp, reverse=True)
    persist_shipments(shipments_data)
    _sync_router_state()


async def live_update_task():
    global alerts_data
    while True:
        await asyncio.sleep(5)
        updated_shipments = []
        for shipment in random.sample(shipments_data, min(5, len(shipments_data))):
            shipment.current_coords.lat += random.uniform(-0.02, 0.02)
            shipment.current_coords.lng += random.uniform(-0.02, 0.02)
            shipment.progress_pct = min(shipment.progress_pct + random.uniform(0.5, 3.0), 99.9)
            enrich_shipment(shipment)
            updated_shipments.append(shipment)

        alerts_data = _merge_generated_alerts(alerts_data, generate_alerts(shipments_data))
        runtime_alerts = _build_runtime_alerts(updated_shipments)
        if runtime_alerts:
            by_id = {alert.id: alert for alert in alerts_data}
            for alert in runtime_alerts:
                by_id[alert.id] = alert
            alerts_data = list(by_id.values())
        alerts_data.sort(key=lambda alert: alert.timestamp, reverse=True)

        persist_shipments(shipments_data)
        _sync_router_state()

        if not manager.active:
            continue

        await manager.broadcast(
            {
                "type": "position_update",
                "data": [
                    {
                        "id": shipment.id,
                        "lat": shipment.current_coords.lat,
                        "lng": shipment.current_coords.lng,
                        "risk_score": shipment.risk_score,
                        "risk_level": shipment.risk_level.value,
                        "status": shipment.status.value,
                        "progress_pct": shipment.progress_pct,
                        "ml_prediction": shipment.ml_prediction.model_dump(mode="json") if shipment.ml_prediction else None,
                    }
                    for shipment in updated_shipments
                ],
            }
        )
        if runtime_alerts:
            await manager.broadcast(
                {
                    "type": "alert_update",
                    "data": [alert.model_dump(mode="json") for alert in runtime_alerts],
                }
            )
        await manager.broadcast(
            {
                "type": "dashboard_update",
                "data": analytics_router.get_current_kpis_data(),
            }
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    seed_users(get_demo_users())
    await _refresh_predictions()

    async def weather_refresh_loop():
        while True:
            await asyncio.sleep(600)
            await _refresh_predictions()

    task_ws = asyncio.create_task(live_update_task())
    task_weather = asyncio.create_task(weather_refresh_loop())
    yield
    task_ws.cancel()
    task_weather.cancel()
    await asyncio.gather(task_ws, task_weather, return_exceptions=True)


app = FastAPI(
    title="Smart Supply Chain — Resilient Logistics System",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or ["*"],
    allow_credentials=bool(settings.allowed_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(shipments_router.router)
app.include_router(alerts_router.router)
app.include_router(analytics_router.router)
app.include_router(routes_router.router)
app.include_router(chat_router.router)
app.include_router(weather_router.router)
app.include_router(auth_router.router)
app.include_router(ml_router.router)

app.mount("/static", StaticFiles(directory="static"), name="static")


def _frontend_index_path() -> str:
    built_index = os.path.join("static", "app", "index.html")
    if os.path.exists(built_index):
        return built_index
    return os.path.join("static", "index.html")


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    return await log_request_response(request, call_next)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/static") or path.startswith("/docs") or path.startswith("/openapi"):
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.allow(f"{client_ip}:{path}"):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    return await call_next(request)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if (
        path == "/"
        or path.startswith("/docs")
        or path.startswith("/openapi.json")
        or path.startswith("/redoc")
        or path.startswith("/static")
        or path.startswith("/favicon.ico")
        or path.startswith("/api/auth")
    ):
        return await call_next(request)

    if not (path.startswith("/api") or path.startswith("/ml")):
        return await call_next(request)

    token = _extract_bearer_token(request.headers.get("Authorization"))
    user = get_user_by_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"detail": "Authentication required"})

    if not is_authorized(path, request.method, user["role"]):
        return JSONResponse(status_code=403, content={"detail": "Insufficient access level"})

    request.state.user = user
    return await call_next(request)


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    user = get_user_by_token(token)
    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as error:  # pragma: no cover - network cleanup
        LOGGER.warning("websocket_error error=%s", error)
        manager.disconnect(websocket)


@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(_frontend_index_path())


@app.get("/{path:path}", include_in_schema=False)
async def serve_spa(path: str):
    if path.startswith("api/") or path.startswith("ml/") or path.startswith("ws/"):
        return JSONResponse(status_code=404, content={"detail": f"Route /{path} not found"})
    return FileResponse(_frontend_index_path())
