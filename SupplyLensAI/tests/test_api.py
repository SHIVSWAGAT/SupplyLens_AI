from datetime import datetime

from fastapi.testclient import TestClient

from main import app
from services.data_generator import generate_shipments
from services.shipment_metrics import build_recent_month_keys, compute_monthly_trends, format_platform_datetime


client = TestClient(app)


def login_token():
    response = client.post(
        "/api/auth/login",
        json={"user_id": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    return response.json()["token"]


def auth_headers():
    return {"Authorization": f"Bearer {login_token()}"}


def test_shipments_return_ml_predictions():
    response = client.get("/api/shipments", headers=auth_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload
    assert len(payload) >= 900
    assert any("ml_prediction" in shipment and shipment["ml_prediction"] for shipment in payload)
    low_risk = [shipment for shipment in payload if float(shipment["risk_score"]) < 0.25]
    assert len(low_risk) >= max(1, int(len(payload) * 0.15))


def test_ml_predict_risk_and_eta_endpoints():
    body = {
        "delay_minutes": 42,
        "weather_risk": 0.65,
        "congestion_index": 0.55,
        "route_distance": 1800,
        "cargo_type": "Pharmaceuticals",
        "transport_mode": "Air",
        "carrier_performance": 0.84,
        "weight_kg": 820,
        "scheduled_eta_hours": 9,
        "departure_time": "2026-04-08 10:00",
    }

    risk_response = client.post("/ml/predict-risk", json=body, headers=auth_headers())
    eta_response = client.post("/ml/predict-eta", json=body, headers=auth_headers())

    assert risk_response.status_code == 200
    assert eta_response.status_code == 200
    assert 0 <= risk_response.json()["risk_score"] <= 1
    assert eta_response.json()["predicted_eta_hours"] > 0


def test_chat_endpoint_returns_grounded_response():
    response = client.post(
        "/api/chat",
        json={"message": "Show shipments at high risk right now", "history": []},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    assert response.json()["reply"]
    assert any(item["tool"] == "get_shipments" for item in response.json()["tool_trace"])


def test_chat_endpoint_can_call_alert_tool():
    response = client.post(
        "/api/chat",
        json={"message": "Show active alerts and summarize them", "history": []},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    assert response.json()["reply"]
    assert any(item["tool"] == "get_alerts" for item in response.json()["tool_trace"])


def test_shipment_analysis_endpoint_returns_valid_json():
    shipments_response = client.get("/api/shipments", headers=auth_headers())
    assert shipments_response.status_code == 200
    shipment_id = shipments_response.json()[0]["id"]

    analysis_response = client.get(f"/api/shipments/{shipment_id}/analysis", headers=auth_headers())
    assert analysis_response.status_code == 200
    payload = analysis_response.json()
    assert payload["shipment_id"] == shipment_id
    assert isinstance(payload["factors"], list)
    assert payload["factors"]


def test_kpis_and_carrier_performance_are_non_zero_and_realistic():
    shipments_response = client.get("/api/shipments", headers=auth_headers())
    kpi_response = client.get("/api/analytics/kpis", headers=auth_headers())
    carrier_response = client.get("/api/analytics/carrier-performance", headers=auth_headers())
    alerts_response = client.get("/api/alerts", headers=auth_headers())

    assert shipments_response.status_code == 200
    assert kpi_response.status_code == 200
    assert carrier_response.status_code == 200
    assert alerts_response.status_code == 200

    shipments = shipments_response.json()
    kpis = kpi_response.json()
    carriers = carrier_response.json()
    alerts = alerts_response.json()

    assert kpis["total_shipments"] == len(shipments)
    assert 30 <= kpis["on_time_pct"] <= 65
    assert any(float(carrier["on_time_pct"]) > 0 for carrier in carriers)
    assert alerts
    assert all(alert["tracking_number"] for alert in alerts)
    assert any(alert["route"] for alert in alerts)
    assert any(alert["reason"] in {"Weather", "Delay", "Congestion", "Disruption"} for alert in alerts)


def test_monthly_trends_api_always_returns_last_six_months():
    response = client.get("/api/analytics/monthly-trends", headers=auth_headers())

    assert response.status_code == 200
    trends = response.json()
    assert len(trends) == 6

    expected_months = [
        datetime.strptime(key, "%Y-%m").strftime("%b")
        for key in build_recent_month_keys()
    ]
    assert [entry["month"] for entry in trends] == expected_months
    assert all("on_time" in entry and "delayed" in entry and "critical" in entry for entry in trends)


def test_monthly_trends_fill_missing_months_with_zero_values():
    shipment = generate_shipments(1)[0]
    now = datetime.now()
    shipment.departure_time = format_platform_datetime(now)
    shipment.estimated_arrival = format_platform_datetime(now)
    shipment.actual_arrival = None

    trends = compute_monthly_trends([shipment])

    assert len(trends) == 6
    assert sum(1 for entry in trends if entry.on_time == 0 and entry.delayed == 0 and entry.critical == 0) == 5
    assert trends[-1].on_time + trends[-1].delayed + trends[-1].critical == 1
